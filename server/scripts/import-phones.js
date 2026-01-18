import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import XLSX from 'xlsx';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
 * Read Excel file and convert to JSON
 */
function readExcelFile(filePath) {
  console.log(`📂 Reading Excel file: ${filePath}`);
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0]; // Get first sheet
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet);
  return data;
}

/**
 * Read CSV file and convert to JSON
 */
function readCSVFile(filePath) {
  console.log(`📂 Reading CSV file: ${filePath}`);
  const fileContent = readFileSync(filePath, 'utf-8');
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });
  return records;
}

/**
 * Normalize column names (handle various formats)
 */
function normalizeColumnName(name) {
  if (!name) return null;
  const normalized = name.toLowerCase().trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  
  // Map common variations
  const mappings = {
    'phone_number': 'phone_number',
    'phonenumber': 'phone_number',
    'phone': 'phone_number',
    'mobile': 'phone_number',
    'mobile_number': 'phone_number',
    'mobilenumber': 'phone_number',
    'whatsapp_number': 'phone_number',
    'whatsappnumber': 'phone_number',
    'whatsaap_number': 'phone_number',
    'whatsaapnumber': 'phone_number',
    'number': 'phone_number',
    'employee_name': 'employee_name',
    'employeename': 'employee_name',
    'name': 'employee_name',
    'agent_name': 'employee_name',
    'agentname': 'employee_name',
    'employee_id': 'employee_id',
    'employeeid': 'employee_id',
    'id': 'employee_id',
    'emp_id': 'employee_id',
    'encryption_key': 'encryption_key',
    'encryptionkey': 'encryption_key',
    'key': 'encryption_key',
    'backup_key': 'encryption_key',
    'whatsaap_key': 'encryption_key',
    'whatsaapkey': 'encryption_key',
    'whatsapp_key': 'encryption_key',
    'whatsappkey': 'encryption_key',
    '64_digit_key': 'encryption_key',
    'department': 'department',
    'dept': 'department',
    'is_active': 'is_active',
    'isactive': 'is_active',
    'active': 'is_active',
    'google_account': 'google_account',
    'googleaccount': 'google_account',
    'gmail': 'google_account',
    'notes': 'notes',
    'note': 'notes',
    'remarks': 'notes',
    'timestamp': 'timestamp'
  };
  
  return mappings[normalized] || normalized;
}

/**
 * Normalize phone number
 */
function normalizePhoneNumber(phone) {
  if (!phone) return null;
  // Remove all non-digit characters except +
  let normalized = phone.toString().replace(/[^\d+]/g, '');
  // If doesn't start with +, assume it's missing country code
  if (!normalized.startsWith('+')) {
    // If starts with 0, remove it
    if (normalized.startsWith('0')) {
      normalized = normalized.substring(1);
    }
    // Add +91 for India (you can adjust this)
    if (normalized.length === 10) {
      normalized = '+91' + normalized;
    }
  }
  return normalized;
}

/**
 * Import phones from Excel/CSV file
 */
async function importPhones(filePath) {
  console.log('📱 WhatsApp Phone Import Script\n');
  console.log('═'.repeat(60));
  
  try {
    // Determine file type and read
    let records;
    if (filePath.endsWith('.xlsx') || filePath.endsWith('.xls')) {
      records = readExcelFile(filePath);
    } else {
      records = readCSVFile(filePath);
    }
    
    console.log(`✅ Found ${records.length} records\n`);
    
    if (records.length === 0) {
      console.log('❌ No records found in file');
      return;
    }
    
    // Show first record to help debug
    console.log('📋 Sample record (first row):');
    console.log(JSON.stringify(records[0], null, 2));
    console.log('');
    
    // Validate and prepare data
    const phones = [];
    const errors = [];
    
    records.forEach((row, index) => {
      // Normalize column names
      const normalizedRow = {};
      Object.keys(row).forEach(key => {
        const normalizedKey = normalizeColumnName(key);
        if (normalizedKey) {
          normalizedRow[normalizedKey] = row[key];
        }
      });
      
      const phoneNumber = normalizedRow.phone_number;
      const employeeName = normalizedRow.employee_name;
      const employeeId = normalizedRow.employee_id;
      const department = normalizedRow.department || 'Sales';
      const encryptionKey = normalizedRow.encryption_key;
      const googleAccount = normalizedRow.google_account;
      const notes = normalizedRow.notes;
      const isActive = normalizedRow.is_active !== false && normalizedRow.is_active !== 'false' && normalizedRow.is_active !== 'FALSE';
      
      if (!phoneNumber) {
        errors.push(`Row ${index + 2}: Missing phone_number`);
        return;
      }
      
      if (!employeeName) {
        errors.push(`Row ${index + 2}: Missing employee_name`);
        return;
      }
      
      // Normalize phone number
      const normalizedPhone = normalizePhoneNumber(phoneNumber);
      
      if (!normalizedPhone) {
        errors.push(`Row ${index + 2}: Invalid phone_number: ${phoneNumber}`);
        return;
      }
      
      phones.push({
        phone_number: normalizedPhone,
        employee_name: employeeName.toString().trim(),
        department: department.toString().trim(),
        is_active: isActive,
        encryption_key: encryptionKey ? encryptionKey.toString().trim() : null
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
    console.log('📋 Sample phone record:');
    console.log(JSON.stringify(phones[0], null, 2));
    console.log('');
    
    // Insert into Supabase
    const batchSize = 50;
    let imported = 0;
    let failed = 0;
    const failedRecords = [];
    
    for (let i = 0; i < phones.length; i += batchSize) {
      const batch = phones.slice(i, i + batchSize);
      
      console.log(`📦 Inserting batch ${Math.floor(i / batchSize) + 1} (${batch.length} phones)...`);
      
      const { data, error } = await supabase
        .from('phones')
        .upsert(batch, {
          onConflict: 'phone_number',
          ignoreDuplicates: false
        })
        .select();
      
      if (error) {
        console.error(`   ❌ Error: ${error.message}`);
        console.error(`   Details: ${JSON.stringify(error, null, 2)}`);
        failed += batch.length;
        failedRecords.push(...batch.map(p => p.phone_number));
      } else {
        imported += data ? data.length : 0;
        console.log(`   ✅ Imported ${data ? data.length : 0} phones`);
        if (data && data.length > 0) {
          console.log(`   Sample: ${data[0].phone_number} - ${data[0].employee_name}`);
        }
      }
    }
    
    console.log('\n' + '═'.repeat(60));
    console.log('📊 Import Summary:');
    console.log(`   ✅ Successfully imported: ${imported}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📱 Total processed: ${phones.length}`);
    if (failedRecords.length > 0) {
      console.log(`   📋 Failed phone numbers: ${failedRecords.join(', ')}`);
    }
    console.log('═'.repeat(60));
    
    // Show imported phones
    if (imported > 0) {
      console.log('\n📱 Imported Phones:');
      const { data: importedPhones } = await supabase
        .from('phones')
        .select('phone_number, employee_name, employee_id, encryption_key')
        .order('created_at', { ascending: false })
        .limit(imported);
      
      if (importedPhones) {
        importedPhones.forEach((phone, idx) => {
          console.log(`   ${idx + 1}. ${phone.employee_name} (${phone.phone_number}) - Key: ${phone.encryption_key ? '✅' : '❌'}`);
        });
      }
    }
    
  } catch (error) {
    console.error('\n❌ Import failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run import
const filePath = process.argv[2];

if (!filePath) {
  console.log('📱 WhatsApp Phone Import Script\n');
  console.log('Usage: node scripts/import-phones.js <excel-or-csv-file-path>\n');
  console.log('Supported formats: .xlsx, .xls, .csv\n');
  console.log('Expected columns (case-insensitive):');
  console.log('  - phone_number / phone / mobile (required)');
  console.log('  - employee_name / name / agent_name (required)');
  console.log('  - employee_id / id / emp_id (optional)');
  console.log('  - encryption_key / key / backup_key (optional)');
  console.log('  - department / dept (optional, default: Sales)');
  console.log('  - is_active / active (optional, default: true)');
  console.log('  - google_account / gmail (optional)');
  console.log('  - notes / remarks (optional)\n');
  process.exit(1);
}

// Resolve file path (can be relative or absolute)
const resolvedPath = filePath.startsWith('/') || filePath.match(/^[A-Z]:/) 
  ? filePath 
  : join(process.cwd(), '..', filePath);

importPhones(resolvedPath).catch(console.error);
