import cron from 'node-cron';
import { supabase } from '../services/supabase.js';
import { downloadLatestBackup } from '../services/drive.js';
import { decryptBackup } from '../services/decryptor.js';
import { parseWhatsAppDatabase } from '../services/parser.js';
import {
  upsertChat,
  insertMessages,
  createPipelineLog,
  updatePipelineLog
} from '../services/supabase.js';
import { analyzePhoneChats } from '../services/ai.js';

// ============================================
// Start all cron jobs
// ============================================
export function startCronJobs() {
  // Daily backup sync at 3:00 AM
  cron.schedule('0 3 * * *', async () => {
    console.log('\n[Cron] ========= Daily Backup Sync Started =========');
    await syncAllPhones();
    console.log('[Cron] ========= Daily Backup Sync Complete =========\n');
  }, { timezone: 'Asia/Kolkata' });

  // AI analysis at 4:00 AM (after backup sync finishes)
  cron.schedule('0 4 * * *', async () => {
    console.log('\n[Cron] ========= Daily AI Analysis Started =========');
    await analyzeAllPhones();
    console.log('[Cron] ========= Daily AI Analysis Complete =========\n');
  }, { timezone: 'Asia/Kolkata' });

  console.log('[Cron] Scheduled: Backup sync @ 3 AM IST, AI analysis @ 4 AM IST');
}

// ============================================
// Sync all phones that have Google Drive tokens
// ============================================
export async function syncAllPhones() {
  if (!supabase) {
    console.error('[Cron] Supabase not configured');
    return;
  }

  const { data: phones, error } = await supabase
    .from('phones')
    .select('*')
    .eq('is_active', true)
    .not('google_refresh_token', 'is', null)
    .not('encryption_key', 'is', null);

  if (error) {
    console.error('[Cron] Error fetching phones:', error.message);
    return;
  }

  if (!phones?.length) {
    console.log('[Cron] No phones with Google Drive credentials. Add via admin → Phones → Connect Drive');
    return;
  }

  console.log(`[Cron] Found ${phones.length} phones to sync`);

  const results = { success: 0, failed: 0 };

  for (const phone of phones) {
    const ok = await syncPhone(phone);
    if (ok) results.success++;
    else results.failed++;
  }

  console.log(`[Cron] Sync complete: ${results.success} success, ${results.failed} failed`);
  return results;
}

// ============================================
// Sync a single phone
// ============================================
export async function syncPhone(phone) {
  const startTime = Date.now();
  let logId = null;

  try {
    console.log(`[Cron] → Syncing ${phone.phone_number} (${phone.employee_name || 'Unknown'})`);

    // Download from Google Drive
    const backup = await downloadLatestBackup(phone.google_refresh_token);

    // Create pipeline log
    const logResult = await createPipelineLog(phone.id, backup.filename, backup.size);
    logId = logResult.data?.id;

    // Decrypt
    await updatePipelineLog(logId, { status: 'decrypting' });
    const decryptResult = await decryptBackup(backup.buffer, phone.encryption_key);

    // Parse
    await updatePipelineLog(logId, { status: 'parsing' });
    const parseResult = await parseWhatsAppDatabase(decryptResult.database, phone.id);

    // Save to Supabase
    await updatePipelineLog(logId, { status: 'inserting' });

    const chatIdMap = {};
    for (const chat of parseResult.chats) {
      const result = await upsertChat(phone.id, chat);
      if (result.data) chatIdMap[chat.jid] = result.data.id;
    }

    const messagesWithChatId = parseResult.messages.map(msg => ({
      ...msg,
      chat_id: chatIdMap[msg.chat_jid] || null
    }));

    await insertMessages(messagesWithChatId);

    const duration = Date.now() - startTime;
    await updatePipelineLog(logId, {
      status: 'success',
      duration_ms: duration,
      messages_added: parseResult.messages.length,
      chats_added: parseResult.chats.length
    });

    console.log(`[Cron]   ✓ ${phone.phone_number}: ${parseResult.messages.length} msgs, ${parseResult.chats.length} chats (${(duration / 1000).toFixed(1)}s)`);
    return true;

  } catch (error) {
    console.error(`[Cron]   ✗ ${phone.phone_number}: ${error.message}`);
    if (logId) {
      await updatePipelineLog(logId, {
        status: 'failed',
        error_message: error.message,
        error_stack: error.stack?.slice(0, 500)
      });
    }
    return false;
  }
}

// ============================================
// Run AI analysis for all phones
// ============================================
export async function analyzeAllPhones() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[Cron] ANTHROPIC_API_KEY not set — skipping AI analysis');
    return;
  }

  if (!supabase) return;

  const { data: phones } = await supabase
    .from('phones')
    .select('id, phone_number, employee_name')
    .eq('is_active', true);

  if (!phones?.length) return;

  console.log(`[Cron] Running AI analysis for ${phones.length} phones`);

  for (const phone of phones) {
    try {
      console.log(`[Cron] → AI: ${phone.phone_number}`);
      const result = await analyzePhoneChats(phone.id, supabase);
      console.log(`[Cron]   ✓ Analyzed: ${result.analyzed}, Skipped: ${result.skipped}`);
    } catch (e) {
      console.error(`[Cron]   ✗ AI error for ${phone.phone_number}: ${e.message}`);
    }
  }
}
