import cron from 'node-cron';
import { supabase } from '../services/supabase.js';
import { syncDriveBackups } from './drive-sync.js';
import { analyzePhoneChats } from '../services/ai.js';

// ============================================
// Start all cron jobs
// ============================================
export function startCronJobs() {
  // Daily Google Drive backup sync at 4:00 AM IST
  // Fetches all new backup files from Drive, decrypts, and upserts to Supabase
  // Already-processed files are automatically skipped
  cron.schedule('0 4 * * *', async () => {
    console.log('\n[Cron] ========= Daily Drive Backup Sync Started =========');
    const stats = await syncDriveBackups();
    console.log(`[Cron] ========= Drive Sync Complete — ✅ ${stats.success} | ❌ ${stats.failed} | ⏭ ${stats.skipped} =========\n`);
  }, { timezone: 'Asia/Kolkata' });

  // AI analysis at 5:30 AM (after backup sync finishes)
  cron.schedule('30 5 * * *', async () => {
    console.log('\n[Cron] ========= Daily AI Analysis Started =========');
    await analyzeAllPhones();
    console.log('[Cron] ========= Daily AI Analysis Complete =========\n');
  }, { timezone: 'Asia/Kolkata' });

  console.log('[Cron] Scheduled: Drive sync @ 4 AM IST, AI analysis @ 5:30 AM IST');
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
