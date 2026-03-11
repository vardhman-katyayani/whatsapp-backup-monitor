/**
 * Process WhatsApp backups directly from Supabase Storage
 * Downloads latest backup per agent email → decrypts → inserts into DB
 *
 * Run: node scripts/process-from-storage.js
 */

import { createClient } from '@supabase/supabase-js';
import { decryptBackup } from '../services/decryptor.js';
import { parseWhatsAppDatabase } from '../services/parser.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ── Manual email→phone mapping (fill in if agent_email not in phones table)
// Format: 'email': 'phone_number'
const EMAIL_TO_PHONE = {
  'shivam@gmail.com':           '',   // e.g. '+919238107200'
  'katyayanisales54@gmail.com': '',
  'katyayanisales99@gmail.com': ''
};

async function main() {
  console.log('\n Processing WhatsApp Backups from Supabase Storage\n');

  // Load all phones with encryption keys
  const { data: phones } = await sb.from('phones').select('id,phone_number,employee_name,encryption_key,agent_email');
  const phoneByEmail = {};
  const phoneByNumber = {};
  phones.forEach(p => {
    if (p.agent_email) phoneByEmail[p.agent_email.toLowerCase()] = p;
    phoneByNumber[p.phone_number.replace(/\D/g,'').slice(-10)] = p;
  });

  // List storage folders (one per agent email)
  const { data: folders } = await sb.storage.from('whatsapp-backups').list('');
  const agentFolders = (folders || []).filter(f => f.name.includes('@') || f.name.includes('-'));

  console.log(`Found ${agentFolders.length} agent folder(s) in storage\n`);

  let totalSuccess = 0, totalFailed = 0;

  for (const folder of agentFolders) {
    const email = folder.name.toLowerCase();
    console.log(`\n${'─'.repeat(50)}`);
    console.log(` Processing: ${email}`);

    // Find phone record
    let phone = phoneByEmail[email];

    // Check manual mapping
    if (!phone && EMAIL_TO_PHONE[email]) {
      const norm = EMAIL_TO_PHONE[email].replace(/\D/g,'').slice(-10);
      phone = phoneByNumber[norm];
    }

    if (!phone) {
      console.log(` No phone matched for ${email}`);
      console.log(`   → Add to EMAIL_TO_PHONE in this script:`);
      console.log(`   '${email}': '+91XXXXXXXXXX'`);
      console.log(`\n   Available phones:`);
      phones.slice(0,8).forEach(p => console.log(`     ${p.phone_number} — ${p.employee_name}`));
      totalFailed++;
      continue;
    }

    console.log(` Matched: ${phone.employee_name} (${phone.phone_number})`);

    if (!phone.encryption_key) {
      console.log(` No encryption key for ${phone.phone_number}`);
      totalFailed++;
      continue;
    }

    // List files in this folder
    const { data: files } = await sb.storage.from('whatsapp-backups').list(folder.name);
    if (!files?.length) { console.log('No files found'); totalFailed++; continue; }

    // Pick the latest main msgstore (not increment), prefer .db over .crypt14
    const mainFiles = files
      .filter(f => f.name.includes('msgstore') && !f.name.includes('increment'))
      .sort((a, b) => (b.updated_at||'').localeCompare(a.updated_at||''));

    // Also check plain .db (already decrypted)
    const dbFile = mainFiles.find(f => f.name.endsWith('.db'));
    const cryptFile = mainFiles.find(f => /\.crypt1[45]$/.test(f.name));

    const targetFile = dbFile || cryptFile;
    if (!targetFile) { console.log('No msgstore file found'); totalFailed++; continue; }

    const filePath = `${folder.name}/${targetFile.name}`;
    console.log(` Using: ${targetFile.name} (${((targetFile.metadata?.size||0)/1024/1024).toFixed(1)} MB)`);

    try {
      // Download from Supabase Storage
      process.stdout.write('  Downloading... ');
      const { data: fileData, error: dlErr } = await sb.storage.from('whatsapp-backups').download(filePath);
      if (dlErr) throw new Error('Download failed: ' + dlErr.message);
      const buffer = Buffer.from(await fileData.arrayBuffer());
      console.log(`${(buffer.length/1024/1024).toFixed(1)} MB`);

      let dbBuffer;

      if (targetFile.name.endsWith('.db')) {
        // Already decrypted SQLite
        dbBuffer = buffer;
        console.log('    Already decrypted SQLite');
      } else {
        // Decrypt .crypt14/.crypt15
        process.stdout.write('    Decrypting... ');
        try {
          const result = await decryptBackup(buffer, phone.encryption_key);
          dbBuffer = result.database;
          console.log(`done (${(dbBuffer.length/1024/1024).toFixed(1)} MB)`);
        } catch (e) {
          console.log(`FAILED: ${e.message}`);
          console.log('     Wrong encryption key? Check the key for this phone in Supabase.');
          totalFailed++;
          continue;
        }
      }

      // Parse
      process.stdout.write('   Parsing... ');
      const parsed = await parseWhatsAppDatabase(dbBuffer, phone.id);
      console.log(`${parsed.stats.messageCount} messages, ${parsed.stats.chatCount} chats`);

      // Create log
      const { data: log } = await sb.from('pipeline_logs').insert({
        phone_id: phone.id, backup_filename: targetFile.name,
        file_size_bytes: buffer.length, status: 'inserting',
        started_at: new Date().toISOString()
      }).select().single();

      // Upsert chats
      process.stdout.write('   💾 Saving chats... ');
      const chatIdMap = {};
      for (const chat of parsed.chats) {
        const { data: saved } = await sb.from('chats').upsert({
          phone_id: phone.id, jid: chat.jid,
          contact_name: chat.contact_name, contact_number: chat.contact_number,
          is_group: chat.is_group || false, group_name: chat.group_name,
          last_message_at: chat.last_message_at, last_message_preview: chat.last_message_preview,
          total_messages: chat.total_messages || 0, updated_at: new Date().toISOString()
        }, { onConflict: 'phone_id,jid' }).select().single();
        if (saved) chatIdMap[chat.jid] = saved.id;
      }
      console.log(`${parsed.chats.length} chats`);

      // Insert messages (deduplicate)
      process.stdout.write('   💬 Inserting messages... ');
      const { data: existing } = await sb.from('messages').select('wa_message_id').eq('phone_id', phone.id);
      const existingIds = new Set((existing||[]).map(m => m.wa_message_id));
      const newMsgs = parsed.messages
        .filter(m => !existingIds.has(m.wa_message_id))
        .map(m => ({ ...m, chat_id: chatIdMap[m.chat_jid] || null }));

      let inserted = 0;
      for (let i = 0; i < newMsgs.length; i += 500) {
        const { error: insErr } = await sb.from('messages').insert(newMsgs.slice(i, i+500));
        if (insErr) { console.log(`\n   ❌ ${insErr.message}`); break; }
        inserted += Math.min(500, newMsgs.length - i);
      }
      console.log(`${inserted} new (${existingIds.size} already existed)`);

      // Update phone stats
      await sb.from('phones').update({
        last_sync_at: new Date().toISOString(),
        total_messages: existingIds.size + inserted
      }).eq('id', phone.id);

      // Complete log
      if (log?.id) {
        await sb.from('pipeline_logs').update({
          status: 'success', messages_added: inserted,
          chats_added: parsed.chats.length,
          duration_ms: Date.now() - new Date(log.started_at).getTime(),
          completed_at: new Date().toISOString()
        }).eq('id', log.id);
      }

      console.log(`    Done — ${phone.employee_name}`);
      totalSuccess++;

    } catch (e) {
      console.log(`    Error: ${e.message}`);
      totalFailed++;
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(` Success: ${totalSuccess}    Failed/Skipped: ${totalFailed}`);
  console.log('\n Open dashboard: http://localhost:3000/admin\n');
}

main().catch(console.error);
