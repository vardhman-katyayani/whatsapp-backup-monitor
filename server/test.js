/**
 * Quick test script — checks all components are working
 * Run: node test.js
 */

import dotenv from 'dotenv';
dotenv.config();

const BASE = `http://localhost:3000`;
let passed = 0;
let failed = 0;

function ok(label) { console.log(`  ✅ ${label}`); passed++; }
function fail(label, reason) { console.log(`  ❌ ${label}: ${reason}`); failed++; }

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  const data = await res.json();
  return { status: res.status, data };
}

console.log('\n🧪 WhatsApp Monitor — System Test\n');

// ── 1. ENV vars
console.log('1. Environment Variables');
process.env.SUPABASE_URL       ? ok('SUPABASE_URL')        : fail('SUPABASE_URL', 'not set');
process.env.SUPABASE_SERVICE_KEY ? ok('SUPABASE_SERVICE_KEY') : fail('SUPABASE_SERVICE_KEY', 'not set');
process.env.ANTHROPIC_API_KEY  ? ok('ANTHROPIC_API_KEY')   : fail('ANTHROPIC_API_KEY', 'not set');
process.env.GOOGLE_CLIENT_ID   ? ok('GOOGLE_CLIENT_ID')    : fail('GOOGLE_CLIENT_ID', 'not set — needed for OAuth');
process.env.JWT_SECRET         ? ok('JWT_SECRET')          : fail('JWT_SECRET', 'not set');

// ── 2. Service account file
console.log('\n2. Service Account');
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const saPath = join(__dirname, 'service_account.json');
if (existsSync(saPath)) {
  try {
    const sa = JSON.parse(readFileSync(saPath, 'utf8'));
    if (sa.private_key?.includes('your-private-key')) {
      fail('service-account.json', 'still has placeholder values — fill in real keys');
    } else if (sa.type === 'service_account' && sa.client_email) {
      ok(`service-account.json (${sa.client_email})`);
    } else {
      fail('service-account.json', 'invalid format');
    }
  } catch {
    fail('service-account.json', 'invalid JSON');
  }
} else {
  fail('service-account.json', 'file not found');
}

// ── 3. Server endpoints
console.log('\n3. Server Endpoints (make sure server is running on port 3000)');
try {
  const health = await get('/health');
  if (health.status === 200) {
    ok(`/health — uptime: ${Math.round(health.data.uptime)}s`);
    ok(`AI: ${health.data.ai}`);
    ok(`Drive: ${health.data.drive}`);
  } else {
    fail('/health', `status ${health.status}`);
  }

  const phones = await get('/api/phones');
  if (phones.status === 200) {
    ok(`/api/phones — ${phones.data.phones?.length || 0} phones found`);
  } else {
    fail('/api/phones', phones.data.error || `status ${phones.status}`);
  }

  const stats = await get('/api/stats');
  if (stats.status === 200) {
    ok(`/api/stats — ${stats.data.totalMessages || 0} messages, ${stats.data.totalPhones || 0} phones`);
  } else {
    fail('/api/stats', stats.data.error || `status ${stats.status}`);
  }

  const logs = await get('/api/logs');
  logs.status === 200 ? ok('/api/logs') : fail('/api/logs', logs.data.error || `status ${logs.status} — run SQL in Supabase`);

  const flagged = await get('/api/ai-insights/flagged');
  flagged.status === 200 ? ok('/api/ai-insights/flagged') : fail('/api/ai-insights/flagged', 'run SQL in Supabase to create ai_insights table');

  const agentAuth = await get('/api/agent/me');
  agentAuth.status === 401 ? ok('/api/agent/me (returns 401 without token — correct)') : fail('/api/agent/me', 'unexpected response');

} catch (e) {
  fail('Server connection', `Cannot connect — is server running? Run: node index.js\n  Error: ${e.message}`);
}

// ── 4. Supabase direct check
console.log('\n4. Supabase Connection');
try {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { data, error } = await sb.from('phones').select('count').limit(1);
  error ? fail('Supabase phones table', error.message) : ok('Supabase connected');

  const { error: e2 } = await sb.from('pipeline_logs').select('count').limit(1);
  e2 ? fail('pipeline_logs table', 'table missing — run SQL in Supabase') : ok('pipeline_logs table exists');

  const { error: e3 } = await sb.from('ai_insights').select('count').limit(1);
  e3 ? fail('ai_insights table', 'table missing — run SQL in Supabase') : ok('ai_insights table exists');

} catch (e) {
  fail('Supabase', e.message);
}

// ── Summary
console.log(`\n${'─'.repeat(50)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('🎉 Everything is working!\n');
} else {
  console.log('⚠️  Fix the failed items above, then re-run: node test.js\n');
}
