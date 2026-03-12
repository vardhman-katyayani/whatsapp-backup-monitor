/**
 * Google Drive Backup Sync Cron
 *
 * Scans the shared "wa-engine-files" Drive folder using the service account.
 * Folder structure expected:
 *   wa-engine-files/
 *     +919XXXXXXXXXX/          ← phone number folder
 *       msgstore-*.crypt15     ← backup files
 *       AndroidData/
 *         wa.db.crypt15
 *         ...
 *
 * For each new (unprocessed) file:
 *   1. Looks up the phone's encryption key from Supabase by phone number
 *   2. Downloads the file from Drive
 *   3. Decrypts it
 *   4. Parses messages & chats
 *   5. Upserts into Supabase
 *   6. Updates pipeline_logs + phones table
 */

import { google } from 'googleapis';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { supabase } from '../services/supabase.js';
import { decryptBackup } from '../services/decryptor.js';
import { parseWhatsAppDatabase } from '../services/parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SA_KEY_PATH = join(__dirname, '..', 'service_account.json');

const DRIVE_FOLDER_NAME = 'wa-engine-files';

// ─── Service account Drive client (no impersonation) ─────────────────────────
function getDriveClient() {
  if (!existsSync(SA_KEY_PATH)) {
    throw new Error(`service_account.json not found at ${SA_KEY_PATH}`);
  }
  const key = JSON.parse(readFileSync(SA_KEY_PATH, 'utf8'));
  const auth = new google.auth.JWT({
    email: key.client_email,
    key:   key.private_key,
    scopes: ['https://www.googleapis.com/auth/drive.readonly']
  });
  return google.drive({ version: 'v3', auth });
}

// ─── Find the root folder shared with service account ────────────────────────
async function getRootFolderId(drive) {
  const res = await drive.files.list({
    q: `mimeType = 'application/vnd.google-apps.folder' and name = '${DRIVE_FOLDER_NAME}' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 5
  });
  const folders = res.data.files || [];
  if (!folders.length) {
    throw new Error(`Folder "${DRIVE_FOLDER_NAME}" not found. Share it with the service account.`);
  }
  return folders[0].id;
}

// ─── List children of a folder ───────────────────────────────────────────────
async function listChildren(drive, folderId) {
  let items = [], pageToken = null;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, size, mimeType, modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: 100,
      pageToken: pageToken || undefined
    });
    items = items.concat(res.data.files || []);
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return items;
}

// ─── Download a Drive file into a Buffer ─────────────────────────────────────
async function downloadFile(drive, fileId) {
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(res.data);
}

// ─── Check if a file was already successfully processed ──────────────────────
async function alreadyProcessed(phoneId, filename) {
  if (!supabase) return false;
  const { data } = await supabase
    .from('pipeline_logs')
    .select('id')
    .eq('phone_id', phoneId)
    .eq('backup_filename', filename)
    .eq('status', 'success')
    .limit(1);
  return (data || []).length > 0;
}

// ─── Process one backup file for a phone ─────────────────────────────────────
async function processFile(drive, phone, file, folderPath) {
  const label = `[DriveSync] ${phone.phone_number} / ${file.name}`;
  const startedAt = new Date().toISOString();
  let logId = null;

  // Create pipeline log
  if (supabase) {
    const { data: log } = await supabase.from('pipeline_logs').insert({
      phone_id: phone.id,
      backup_filename: file.name,
      file_size_bytes: parseInt(file.size || 0),
      status: 'downloading',
      started_at: startedAt
    }).select().single();
    logId = log?.id;
  }

  const updateLog = async (updates) => {
    if (!supabase || !logId) return;
    await supabase.from('pipeline_logs').update({
      ...updates,
      completed_at: ['success', 'failed'].includes(updates.status)
        ? new Date().toISOString()
        : undefined
    }).eq('id', logId);
  };

  try {
    // 1. Download
    console.log(`${label} → downloading (${(parseInt(file.size||0)/1024/1024).toFixed(2)} MB)...`);
    const buffer = await downloadFile(drive, file.id);

    await updateLog({ status: 'decrypting' });

    // 2. Decrypt
    console.log(`${label} → decrypting...`);
    let dbBuffer;
    if (file.name.endsWith('.db')) {
      // Already a plain SQLite (no decryption needed)
      dbBuffer = buffer;
    } else {
      const result = await decryptBackup(buffer, phone.encryption_key);
      dbBuffer = result.database;
    }

    await updateLog({ status: 'parsing' });

    // 3. Parse
    console.log(`${label} → parsing...`);
    const parsed = await parseWhatsAppDatabase(dbBuffer, phone.id);

    await updateLog({ status: 'inserting' });

    // 4. Upsert chats
    const chatIdMap = {};
    if (supabase) {
      for (const chat of parsed.chats) {
        const { data: saved } = await supabase.from('chats').upsert({
          phone_id: phone.id,
          jid: chat.jid,
          contact_name: chat.contact_name,
          contact_number: chat.contact_number,
          is_group: chat.is_group || false,
          group_name: chat.group_name,
          last_message_at: chat.last_message_at,
          last_message_preview: chat.last_message_preview,
          total_messages: chat.total_messages || 0,
          updated_at: new Date().toISOString()
        }, { onConflict: 'phone_id,jid' }).select().single();
        if (saved) chatIdMap[chat.jid] = saved.id;
      }
    }

    // 5. Insert messages (deduplicate against existing)
    let inserted = 0;
    if (supabase && parsed.messages.length > 0) {
      const { data: existing } = await supabase
        .from('messages').select('wa_message_id').eq('phone_id', phone.id);
      const existingIds = new Set((existing || []).map(m => m.wa_message_id));

      const newMsgs = parsed.messages
        .filter(m => !existingIds.has(m.wa_message_id))
        .map(m => ({ ...m, chat_id: chatIdMap[m.chat_jid] || null }));

      for (let i = 0; i < newMsgs.length; i += 500) {
        const { error } = await supabase.from('messages').insert(newMsgs.slice(i, i + 500));
        if (error) throw new Error(`Message insert error: ${error.message}`);
        inserted += Math.min(500, newMsgs.length - i);
      }

      // Update phone stats
      await supabase.from('phones').update({
        last_sync_at: new Date().toISOString(),
        total_messages: (existing?.length || 0) + inserted
      }).eq('id', phone.id);
    }

    const durationMs = Date.now() - new Date(startedAt).getTime();
    await updateLog({
      status: 'success',
      messages_added: inserted,
      chats_added: parsed.chats.length,
      duration_ms: durationMs
    });

    console.log(`${label} ✅  ${inserted} new messages, ${parsed.chats.length} chats (${(durationMs/1000).toFixed(1)}s)`);
    return { success: true, inserted, chats: parsed.chats.length };

  } catch (err) {
    console.error(`${label} ❌  ${err.message}`);
    await updateLog({
      status: 'failed',
      error_message: err.message,
      error_stack: err.stack?.slice(0, 500)
    });
    return { success: false, error: err.message };
  }
}

// ─── Collect all backup files under a folder (recursive one level) ───────────
async function collectBackupFiles(drive, folderId, folderPath = '') {
  const items = await listChildren(drive, folderId);
  const files = [];

  for (const item of items) {
    if (item.mimeType === 'application/vnd.google-apps.folder') {
      // Go one level deeper (e.g. AndroidData/)
      const sub = await listChildren(drive, item.id);
      for (const sf of sub) {
        if (/\.(crypt14|crypt15|crypt12|db)$/i.test(sf.name)) {
          files.push({ ...sf, folderPath: `${folderPath}/${item.name}` });
        }
      }
    } else if (/\.(crypt14|crypt15|crypt12|db)$/i.test(item.name)) {
      files.push({ ...item, folderPath });
    }
  }

  return files;
}

// ─── Main sync function (called by cron scheduler) ───────────────────────────
export async function syncDriveBackups() {
  console.log('[DriveSync] ====== Starting Google Drive Backup Sync ======');

  if (!supabase) {
    console.error('[DriveSync] Supabase not configured — skipping');
    return { success: 0, failed: 0, skipped: 0 };
  }

  let drive;
  try {
    drive = getDriveClient();
  } catch (err) {
    console.error('[DriveSync] Drive client error:', err.message);
    return { success: 0, failed: 0, skipped: 0 };
  }

  // Find root folder
  let rootFolderId;
  try {
    rootFolderId = await getRootFolderId(drive);
    console.log(`[DriveSync] Root folder found: ${DRIVE_FOLDER_NAME} (${rootFolderId})`);
  } catch (err) {
    console.error('[DriveSync]', err.message);
    return { success: 0, failed: 0, skipped: 0 };
  }

  // List phone number subfolders
  const topLevel = await listChildren(drive, rootFolderId);
  const phoneFolders = topLevel.filter(f => f.mimeType === 'application/vnd.google-apps.folder');

  console.log(`[DriveSync] Found ${phoneFolders.length} phone folder(s)`);

  const stats = { success: 0, failed: 0, skipped: 0 };

  for (const folder of phoneFolders) {
    const phoneNumber = folder.name.trim(); // e.g. "+919201952691"
    console.log(`\n[DriveSync] → Phone folder: ${phoneNumber}`);

    // Look up phone in Supabase by phone_number
    const { data: phone, error: phoneErr } = await supabase
      .from('phones')
      .select('id, phone_number, employee_name, encryption_key, is_active')
      .eq('phone_number', phoneNumber)
      .single();

    if (phoneErr || !phone) {
      console.warn(`[DriveSync]   Phone ${phoneNumber} not found in Supabase — skipping`);
      console.warn(`[DriveSync]   Add it via the admin dashboard first.`);
      stats.skipped++;
      continue;
    }

    if (!phone.is_active) {
      console.log(`[DriveSync]   Phone ${phoneNumber} is inactive — skipping`);
      stats.skipped++;
      continue;
    }

    if (!phone.encryption_key) {
      console.warn(`[DriveSync]   No encryption key for ${phoneNumber} — skipping`);
      stats.skipped++;
      continue;
    }

    // Collect all backup files under this phone folder
    const files = await collectBackupFiles(drive, folder.id, phoneNumber);
    console.log(`[DriveSync]   ${files.length} backup file(s) found`);

    for (const file of files) {
      // Skip if already processed successfully
      if (await alreadyProcessed(phone.id, file.name)) {
        console.log(`[DriveSync]   ⏭  ${file.name} already processed — skipping`);
        stats.skipped++;
        continue;
      }

      const result = await processFile(drive, phone, file, file.folderPath);
      if (result.success) stats.success++;
      else stats.failed++;
    }
  }

  console.log(`\n[DriveSync] ====== Sync Complete — ✅ ${stats.success} | ❌ ${stats.failed} | ⏭ ${stats.skipped} ======\n`);
  return stats;
}
