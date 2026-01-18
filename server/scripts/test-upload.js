import { createClient } from '@supabase/supabase-js';
import { readFileSync, createReadStream } from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

// Get API URL (local or Vercel)
const API_URL = process.env.API_URL || 'https://whatsapp-backup-monitor.vercel.app';

async function testUpload() {
  console.log('📤 Testing Backup Upload\n');
  console.log('═'.repeat(60));
  
  try {
    // Get first phone with encryption key
    console.log('\n📱 Finding phone with encryption key...');
    const { data: phones, error: phoneError } = await supabase
      .from('phones')
      .select('id, phone_number, employee_name, encryption_key')
      .not('encryption_key', 'is', null)
      .limit(1);
    
    if (phoneError || !phones || phones.length === 0) {
      console.error('❌ No phones with encryption keys found');
      process.exit(1);
    }
    
    const phone = phones[0];
    console.log(`✅ Found: ${phone.employee_name} (${phone.phone_number})`);
    
    // Find backup file
    const backupPath = join(__dirname, '..', '..', 'msgstore.db.crypt15');
    console.log(`\n📂 Looking for backup file: ${backupPath}`);
    
    try {
      const stats = readFileSync(backupPath);
      console.log(`✅ Found backup file (${(stats.length / 1024).toFixed(2)} KB)`);
    } catch (err) {
      console.error(`❌ Backup file not found: ${backupPath}`);
      process.exit(1);
    }
    
    // Upload to API
    console.log(`\n📤 Uploading to: ${API_URL}/api/upload-backup`);
    
    const formData = new FormData();
    formData.append('file', createReadStream(backupPath), {
      filename: 'msgstore.db.crypt15',
      contentType: 'application/octet-stream'
    });
    // Use phone_number instead of phone_id for lookup
    formData.append('phone_number', phone.phone_number);
    
    const response = await fetch(`${API_URL}/api/upload-backup`, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders()
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      console.error(`❌ Upload failed: ${result.error || response.statusText}`);
      console.error(JSON.stringify(result, null, 2));
      process.exit(1);
    }
    
    console.log('\n✅ Upload successful!');
    console.log(JSON.stringify(result, null, 2));
    
    // Wait a bit and check pipeline logs
    console.log('\n⏳ Waiting 5 seconds for processing...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const { data: logs } = await supabase
      .from('pipeline_logs')
      .select('*')
      .eq('phone_id', phone.id)
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (logs && logs.length > 0) {
      console.log('\n📊 Latest Pipeline Log:');
      console.log(JSON.stringify(logs[0], null, 2));
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testUpload().catch(console.error);
