import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  console.error('Required: SUPABASE_URL and SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

/**
 * Import phones from CSV/Excel file
 * 
 * Expected CSV format:
 * phone_number,employee_name,employee_id,department,is_active
 * +919876543210,John Doe,EMP001,Sales,true
 */
async function importPhones(csvFilePath) {
  console.log('📱 WhatsApp Phone Import Script\n');
  console.log('═'.repeat(60));
  
  try {
    // Read CSV file
    console.log(`\n📂 Reading file: ${csvFilePath}`);
    const fileContent = readFileSync(csvFilePath, 'utf-8');
    
    // Parse CSV
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });
    
    console.log(`✅ Found ${records.length} phone records\n`);
    
    // Validate and prepare data
    const phones = [];
    const errors = [];
    
    records.forEach((row, index) => {
      const phoneNumber = row.phone_number || row.phoneNumber || row.phone;
      const employeeName = row.employee_name || row.employeeName || row.name;
      const employeeId = row.employee_id || row.employeeId || row.id;
      const department = row.department || row.dept || 'Sales';
      const isActive = row.is_active === 'true' || row.isActive === 'true' || row.is_active === true;
      
      if (!phoneNumber) {
        errors.push(`Row ${index + 2}: Missing phone_number`);
        return;
      }
      
      if (!employeeName) {
        errors.push(`Row ${index + 2}: Missing employee_name`);
        return;
      }
      
      // Normalize phone number (remove spaces, dashes, etc.)
      const normalizedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
      
      phones.push({
        phone_number: normalizedPhone,
        employee_name: employeeName,
        employee_id: employeeId || `EMP${String(index + 1).padStart(3, '0')}`,
        department: department,
        is_active: isActive,
        google_account: row.google_account || row.googleAccount || null,
        encryption_key: row.encryption_key || row.encryptionKey || null,
        notes: row.notes || row.Notes || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    });
    
    if (errors.length > 0) {
      console.log('⚠️  Validation Errors:');
      errors.forEach(err => console.log(`   ${err}`));
      console.log('');
    }
    
    if (phones.length === 0) {
      console.log('❌ No valid phone records to import');
      return;
    }
    
    console.log(`📊 Preparing to import ${phones.length} phones...\n`);
    
    // Insert into Supabase
    const batchSize = 50;
    let imported = 0;
    let failed = 0;
    
    for (let i = 0; i < phones.length; i += batchSize) {
      const batch = phones.slice(i, i + batchSize);
      
      console.log(`📦 Inserting batch ${Math.floor(i / batchSize) + 1} (${batch.length} phones)...`);
      
      const { data, error } = await supabase
        .schema('whatsapp')
        .from('phones')
        .upsert(batch, {
          onConflict: 'phone_number',
          ignoreDuplicates: false
        })
        .select();
      
      if (error) {
        console.error(`   ❌ Error: ${error.message}`);
        failed += batch.length;
      } else {
        imported += data.length;
        console.log(`   ✅ Imported ${data.length} phones`);
      }
    }
    
    console.log('\n' + '═'.repeat(60));
    console.log('📊 Import Summary:');
    console.log(`   ✅ Successfully imported: ${imported}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📱 Total processed: ${phones.length}`);
    console.log('═'.repeat(60));
    
  } catch (error) {
    console.error('\n❌ Import failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run import
const csvFile = process.argv[2];

if (!csvFile) {
  console.log('📱 WhatsApp Phone Import Script\n');
  console.log('Usage: node scripts/import-phones.js <csv-file-path>\n');
  console.log('CSV Format:');
  console.log('  phone_number,employee_name,employee_id,department,is_active');
  console.log('  +919876543210,John Doe,EMP001,Sales,true\n');
  console.log('Required columns:');
  console.log('  - phone_number (required)');
  console.log('  - employee_name (required)');
  console.log('  - employee_id (optional)');
  console.log('  - department (optional, default: Sales)');
  console.log('  - is_active (optional, default: true)');
  console.log('  - google_account (optional)');
  console.log('  - encryption_key (optional)');
  console.log('  - notes (optional)\n');
  process.exit(1);
}

importPhones(csvFile).catch(console.error);
