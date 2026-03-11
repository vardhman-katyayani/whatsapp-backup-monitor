/**
 * Bulk create Supabase Auth accounts for all agents in phones table
 * Run: node scripts/create-agent-accounts.js
 *
 * For each phone that has an agent_email set, creates a Supabase auth user.
 * If agent_email column doesn't exist, reads from a local agents.json file.
 *
 * Usage:
 *   1. Make sure server/.env is configured
 *   2. Run: node scripts/create-agent-accounts.js
 *   3. Share each agent their email + temporary password
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Default temporary password — agents must change on first login
const TEMP_PASSWORD = process.env.AGENT_TEMP_PASSWORD || 'WaBackup@2024';

async function main() {
  console.log('\n📋 Fetching agents from phones table...\n');

  const { data: phones, error } = await sb
    .from('phones')
    .select('id, phone_number, employee_name, department, agent_email')
    .eq('is_active', true)
    .order('employee_name');

  if (error) {
    console.error('❌ Failed to fetch phones:', error.message);
    process.exit(1);
  }

  // Filter phones that have an agent_email set
  const agentsWithEmail = phones.filter(p => p.agent_email);

  if (agentsWithEmail.length === 0) {
    console.log('⚠️  No agents have agent_email set in the phones table.');
    console.log('\nYou have two options:');
    console.log('  Option A: Set agent_email in the phones table for each agent in Supabase');
    console.log('  Option B: Create a file server/scripts/agents.json with agent emails\n');
    console.log('agents.json format:');
    console.log(JSON.stringify([
      { "phone_number": "+919876543210", "email": "agent1@company.com", "name": "Agent Name" },
      { "phone_number": "+919876543211", "email": "agent2@company.com", "name": "Agent Name 2" }
    ], null, 2));

    // Check for local agents.json fallback
    const agentsFile = join(__dirname, 'agents.json');
    if (!existsSync(agentsFile)) {
      console.log('\nCreate agents.json and re-run this script.');
      process.exit(0);
    }

    const agentsList = JSON.parse(readFileSync(agentsFile, 'utf8'));
    console.log(`\n📄 Found agents.json with ${agentsList.length} agents\n`);
    await createAccounts(agentsList.map(a => ({
      employee_name: a.name,
      agent_email: a.email,
      phone_number: a.phone_number
    })));
  } else {
    console.log(`Found ${agentsWithEmail.length} agents with emails\n`);
    await createAccounts(agentsWithEmail);
  }
}

async function createAccounts(agents) {
  let created = 0, skipped = 0, failed = 0;

  for (const agent of agents) {
    const email = agent.agent_email.toLowerCase().trim();
    const name = agent.employee_name || email;

    try {
      // Check if user already exists
      const { data: existing } = await sb.auth.admin.listUsers();
      const alreadyExists = existing?.users?.some(u => u.email === email);

      if (alreadyExists) {
        console.log(`  ⏭️  ${name} (${email}) — already exists`);
        skipped++;
        continue;
      }

      // Create user
      const { data, error } = await sb.auth.admin.createUser({
        email,
        password: TEMP_PASSWORD,
        email_confirm: true,  // skip email confirmation
        user_metadata: { name, phone_number: agent.phone_number }
      });

      if (error) {
        console.log(`  ❌ ${name} (${email}) — ${error.message}`);
        failed++;
      } else {
        console.log(`  ✅ ${name} (${email}) — created`);
        created++;
      }
    } catch (e) {
      console.log(`  ❌ ${name} (${email}) — ${e.message}`);
      failed++;
    }
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`✅ Created: ${created}  ⏭️  Skipped: ${skipped}  ❌ Failed: ${failed}`);
  console.log(`\n📌 Temporary password for all new accounts: ${TEMP_PASSWORD}`);
  console.log('   Share this with each agent. They can change it from the portal.\n');
}

main().catch(console.error);
