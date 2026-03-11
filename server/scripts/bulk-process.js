/**
 * Bulk Process WhatsApp Backups
 * ─────────────────────────────
 * Reads all .crypt15 / .crypt14 files from a folder and processes them.
 *
 * Two naming conventions supported:
 *   1. <phone_number>.crypt15        e.g.  919876543210.crypt15
 *   2. msgstore.db.crypt15           (you'll be asked which phone)
 *
 * Usage:
 *   node scripts/bulk-process.js /path/to/backup/folder
 *   node scripts/bulk-process.js /path/to/single/file.crypt15 +919876543210
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { decryptBackup } from '../services/decryptor.js';
import { parseWhatsAppDatabase } from '../services/parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ── CLI args
const inputPath = process.argv[2];
const phoneArg  = process.argv[3]; // optional phone number override

if (!inputPath) {
  console.log(`
Usage:
  Process entire folder:
    node scripts/bulk-process.js /path/to/folder

  Process single file:
    node scripts/bulk-process.js /path/to/file.crypt15 +919876543210

Folder naming:
  Name each backup file as the phone number:
    919876543210.crypt15   or   +919876543210.crypt15
  OR any name — you'll be prompted to pick the phone.
`);
  process.exit(0);
}

// ── Collect files to process
let filesToProcess = [];

try {
  const stat = statSync(inputPath);
  if (stat.isDirectory()) {
    const all = readdirSync(inputPath);
    filesToProcess = all
      .filter(f => /\.crypt1[45]$/i.test(f))
      .map(f => join(inputPath, f));
    console.log(`\n📁 Found ${filesToProcess.length} backup file(s) in ${inputPath}\n`);
  } else {
    filesToProcess = [inputPath];
  }
} catch (e) {
  console.error('❌ Cannot read path:', e.message);
  process.exit(1);
}

if (filesToProcess.length === 0) {
  console.log('❌ No .crypt15 or .crypt14 files found.');
  process.exit(0);
}

// ── Load all phones with encryption keys
const { data: allPhones, error: phonesErr } = await sb
  .from('phones')
  .select('id, phone_number, employee_name, encryption_key')
  .not('encryption_key', 'is', null);

if (phonesErr) {
  console.error('❌ Cannot load phones:', phonesErr.message);
  process.exit(1);
}

console.log(`📋 Loaded ${allPhones.length} phones with encryption keys\n`);

// ── Process each file
let totalSuccess = 0, totalFailed = 0;

for (const filePath of filesToProcess) {
  const fileName = basename(filePath);
  console.log(`\n──────────────────────────────────────`);
  console.log(`📄 Processing: ${fileName}`);

  // Try to match phone by filename (strip extension, normalize number)
  let phone = null;

  if (phoneArg) {
    const norm = phoneArg.replace(/\D/g, '');
    phone = allPhones.find(p => p.phone_number.replace(/\D/g, '') === norm);
  } else {
    const numFromFile = fileName.replace(/\.crypt1[45]$/i, '').replace(/\D/g, '');
    if (numFromFile.length >= 10) {
      phone = allPhones.find(p => p.phone_number.replace(/\D/g, '').endsWith(numFromFile)
                                || numFromFile.endsWith(p.phone_number.replace(/\D/g, '')));
    }
  }

  if (!phone) {
    console.log(`⚠️  Could not match phone for "${fileName}"`);
    console.log(`   Rename file to phone number (e.g. 919876543210.crypt15) to auto-match.`);
    console.log(`   Available phones:`);
    allPhones.slice(0, 10).forEach(p => console.log(`     ${p.phone_number} — ${p.employee_name}`));
    totalFailed++;
    continue;
  }

  console.log(`✅ Matched: ${phone.employee_name} (${phone.phone_number})`);

  try {
    const buffer = readFileSync(filePath);

    // 1. Decrypt
    process.stdout.write('   🔓 Decrypting... ');
    const decryptResult = await decryptBackup(buffer, phone.encryption_key);
    console.log(`done (${(decryptResult.stats.decryptedSize / 1024 / 1024).toFixed(1)} MB)`);

    // 2. Parse
    process.stdout.write('   📊 Parsing messages... ');
    const parseResult = await parseWhatsAppDatabase(decryptResult.database, phone.id);
    console.log(`${parseResult.stats.messageCount} messages, ${parseResult.stats.chatCount} chats`);

    // 3. Create pipeline log
    const { data: log } = await sb.from('pipeline_logs').insert({
      phone_id: phone.id,
      backup_filename: fileName,
      file_size_bytes: buffer.length,
      status: 'inserting',
      started_at: new Date().toISOString()
    }).select().single();
    const logId = log?.id;

    // 4. Upsert chats
    process.stdout.write('   💾 Saving chats... ');
    const chatIdMap = {};
    for (const chat of parseResult.chats) {
      const { data: saved } = await sb.from('chats').upsert({
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
    console.log(`${parseResult.chats.length} chats`);

    // 5. Insert messages (deduplicate in JS)
    process.stdout.write('   💬 Inserting messages... ');
    const { data: existing } = await sb.from('messages').select('wa_message_id').eq('phone_id', phone.id);
    const existingIds = new Set((existing || []).map(m => m.wa_message_id));

    const newMessages = parseResult.messages
      .filter(m => !existingIds.has(m.wa_message_id))
      .map(m => ({ ...m, chat_id: chatIdMap[m.chat_jid] || null }));

    let inserted = 0;
    for (let i = 0; i < newMessages.length; i += 500) {
      const batch = newMessages.slice(i, i + 500);
      const { error: insErr } = await sb.from('messages').insert(batch);
      if (insErr) { console.log(`\n   ❌ Insert error: ${insErr.message}`); break; }
      inserted += batch.length;
    }
    console.log(`${inserted} new (${existingIds.size} already existed)`);

    // 6. Update phone last_sync_at
    await sb.from('phones').update({
      last_sync_at: new Date().toISOString(),
      total_messages: (existingIds.size + inserted)
    }).eq('id', phone.id);

    // 7. Update log
    if (logId) {
      await sb.from('pipeline_logs').update({
        status: 'success',
        messages_added: inserted,
        chats_added: parseResult.chats.length,
        duration_ms: Date.now() - new Date(log.started_at).getTime(),
        completed_at: new Date().toISOString()
      }).eq('id', logId);
    }

    console.log(`   ✅ Done — ${phone.employee_name}`);
    totalSuccess++;

  } catch (e) {
    console.log(`   ❌ Failed: ${e.message}`);
    totalFailed++;
  }
}

console.log(`\n${'═'.repeat(40)}`);
console.log(`✅ Success: ${totalSuccess}   ❌ Failed: ${totalFailed}`);
console.log(`\nOpen dashboard: http://localhost:3000/admin\n`);
