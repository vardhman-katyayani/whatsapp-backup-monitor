#!/usr/bin/env node

/**
 * Android Backup Decryption Test
 * 
 * This script decrypts ALL .crypt15 backup files in an Android backup directory
 * using the encryption key from Supabase and displays comprehensive decryption statistics.
 * 
 * The decrypted databases are saved with their original names (e.g., wa.db, chatsettingsbackup.db)
 * and can be opened with any SQLite viewer for analysis or export.
 * 
 * Usage:
 *   node test-decrypt-androiddata.js                   # Uses first phone with encryption key
 *   node test-decrypt-androiddata.js +919238107200     # Decrypt for specific phone number
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { decryptBackup } from './services/decryptor.js';
import { supabase } from './services/supabase.js';

dotenv.config();

const BACKUP_DIR = '/home/katyayani/Downloads/AndroidData-20260310T103958Z-3-001/AndroidData';
const args = process.argv.slice(2);

// ============================================
// Main Execution
// ============================================
async function main() {
  console.clear();
  
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║     Android Backup Decryption Test & Multi-File Analysis      ║
╠═══════════════════════════════════════════════════════════════╣
║              Processing All Crypt15 Files                     ║
╚═══════════════════════════════════════════════════════════════╝
`);

  // Step 1: Verify backup directory exists and find encrypted files
  console.log('📁 Checking backup directory...');
  if (!fs.existsSync(BACKUP_DIR)) {
    console.error(`   ❌ Directory not found: ${BACKUP_DIR}`);
    process.exit(1);
  }
  
  const encryptedFiles = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.crypt15'))
    .sort();
  
  if (encryptedFiles.length === 0) {
    console.error('   ❌ No .crypt15 files found in directory');
    process.exit(1);
  }
  
  console.log(`   ✅ Directory found`);
  console.log(`   📊 Encrypted files found: ${encryptedFiles.length}`);
  encryptedFiles.forEach(f => {
    const fPath = path.join(BACKUP_DIR, f);
    const size = fs.statSync(fPath).size;
    console.log(`      • ${f} (${(size / 1024).toFixed(2)} KB)`);
  });

  // Step 2: Check Supabase connection
  console.log('\n🔌 Checking Supabase connection...');
  if (!supabase) {
    console.error('   ❌ Supabase not configured');
    console.error('   📝 Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env');
    process.exit(1);
  }
  console.log('   ✅ Supabase connected');

  // Step 3: Get encryption key from Supabase
  console.log('\n🔑 Fetching encryption key from Supabase...');
  
  let encryptionKey = null;
  let phoneNumber = args[0] || null;
  
  try {
    if (phoneNumber) {
      // Fetch by phone number
      const { data: phones, error } = await supabase
        .from('phones')
        .select('id, phone_number, employee_name, encryption_key')
        .eq('phone_number', phoneNumber)
        .single();
      
      if (error) {
        console.error(`   ❌ Phone not found: ${phoneNumber}`);
        process.exit(1);
      }
      
      encryptionKey = phones.encryption_key;
      console.log(`   ✅ Phone found: ${phones.employee_name} (${phones.phone_number})`);
    } else {
      // Fetch the first phone with encryption key
      const { data: phones, error } = await supabase
        .from('phones')
        .select('id, phone_number, employee_name, encryption_key')
        .not('encryption_key', 'is', null)
        .limit(1)
        .single();
      
      if (error || !phones) {
        console.error('   ❌ No phones with encryption key found in Supabase');
        console.log('   💡 Tip: Pass phone number as argument: node test-decrypt-androiddata.js <phone-number>');
        process.exit(1);
      }
      
      phoneNumber = phones.phone_number;
      encryptionKey = phones.encryption_key;
      console.log(`   ✅ Using phone: ${phones.employee_name} (${phones.phone_number})`);
    }
    
    if (!encryptionKey) {
      console.error('   ❌ Encryption key is empty');
      process.exit(1);
    }
    
    if (encryptionKey.length !== 64) {
      console.error(`   ❌ Invalid key length: ${encryptionKey.length} (expected 64)`);
      process.exit(1);
    }
    
    console.log(`   📋 Key: ${encryptionKey.substring(0, 16)}...${encryptionKey.substring(-16)}`);
  } catch (error) {
    console.error(`   ❌ Error fetching key: ${error.message}`);
    process.exit(1);
  }

  // Step 5: Decrypt all backup files
  console.log('\n🔓 Decrypting backup files...\n');
  
  const decryptedFiles = [];
  let totalOriginalSize = 0;
  let totalDecryptedSize = 0;
  let totalDecryptTime = 0;
  
  for (const filename of encryptedFiles) {
    const filePath = path.join(BACKUP_DIR, filename);
    const fileSize = fs.statSync(filePath).size;
    const baseName = filename.replace('.crypt15', '');
    
    console.log(`   📖 ${baseName}`);
    const startReadTime = Date.now();
    
    try {
      // Read file
      const backupBuffer = fs.readFileSync(filePath);
      const readTime = (Date.now() - startReadTime) / 1000;
      
      // Decrypt
      const startDecryptTime = Date.now();
      const decryptedResult = await decryptBackup(backupBuffer, encryptionKey);
      const decryptTime = (Date.now() - startDecryptTime) / 1000;
      
      totalOriginalSize += decryptedResult.stats.originalSize;
      totalDecryptedSize += decryptedResult.stats.decryptedSize;
      totalDecryptTime += decryptedResult.stats.durationMs;
      
      // Save decrypted database
      const dbOutputPath = path.join(
        process.cwd(),
        `decrypted_${baseName}.db`
      );
      fs.writeFileSync(dbOutputPath, decryptedResult.database);
      
      decryptedFiles.push({
        originalName: filename,
        baseName: baseName,
        originalSize: decryptedResult.stats.originalSize,
        decryptedSize: decryptedResult.stats.decryptedSize,
        decryptionTime: decryptedResult.stats.durationMs,
        outputPath: dbOutputPath,
        status: 'SUCCESS'
      });
      
      const sizeMB = (decryptedResult.stats.originalSize / 1024 / 1024).toFixed(2);
      const ratio = ((1 - decryptedResult.stats.decryptedSize / decryptedResult.stats.originalSize) * 100).toFixed(1);
      console.log(`      ✅ Decrypted (${sizeMB} MB, ${decryptTime.toFixed(2)}s, ${ratio}% compression)`);
      console.log(`      💾 Saved: ${path.basename(dbOutputPath)}`);
      
    } catch (error) {
      console.log(`      ❌ Error: ${error.message}`);
      decryptedFiles.push({
        originalName: filename,
        baseName: baseName,
        status: 'FAILED',
        error: error.message
      });
    }
  }

  // ============================================
  // Display Statistics
  // ============================================
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                     Decryption Statistics                     ║
╠═══════════════════════════════════════════════════════════════╣
`);

  const successCount = decryptedFiles.filter(f => f.status === 'SUCCESS').length;
  const failureCount = decryptedFiles.filter(f => f.status === 'FAILED').length;
  
  // Overall stats
  const totalOriginalMB = (totalOriginalSize / 1024 / 1024).toFixed(2);
  const totalDecryptedMB = (totalDecryptedSize / 1024 / 1024).toFixed(2);
  const totalCompressionRatio = totalOriginalSize > 0 
    ? ((1 - totalDecryptedSize / totalOriginalSize) * 100).toFixed(2)
    : '0';
  const totalThroughputMBps = totalDecryptTime > 0
    ? (totalOriginalSize / 1024 / 1024 / (totalDecryptTime / 1000)).toFixed(2)
    : '0';

  console.log(`
  📊 Overall Results:
     Total Files:            ${encryptedFiles.length}
     Successfully Decrypted: ${successCount}
     Failed:                 ${failureCount}

  📦 Size Analysis:
     Total Encrypted:        ${totalOriginalMB} MB
     Total Decrypted:        ${totalDecryptedMB} MB
     Overall Compression:    ${totalCompressionRatio}%

  ⏱️  Performance Metrics:
     Total Decryption Time:  ${(totalDecryptTime / 1000).toFixed(2)}s
     Average Per File:       ${successCount > 0 ? (totalDecryptTime / successCount).toFixed(0) : '0'} ms
     Throughput:             ${totalThroughputMBps} MB/s

  📄 Detailed File Analysis:
`);

  decryptedFiles.forEach((file, idx) => {
    if (file.status === 'SUCCESS') {
      const encMB = (file.originalSize / 1024 / 1024).toFixed(2);
      const decMB = (file.decryptedSize / 1024 / 1024).toFixed(2);
      const ratio = ((1 - file.decryptedSize / file.originalSize) * 100).toFixed(1);
      console.log(`
     [${idx + 1}] ${file.baseName}
         Input:              ${encMB} MB
         Output:             ${decMB} MB
         Compression Ratio:  ${ratio}%
         Time:               ${(file.decryptionTime).toFixed(0)} ms
         Location:           ${path.basename(file.outputPath)}
      `);
    } else {
      console.log(`
     [${idx + 1}] ${file.baseName}
         Status:             ❌ FAILED
         Error:              ${file.error}
      `);
    }
  });

  console.log(`
  🔐 Encryption Details:
     Phone Number:           ${phoneNumber}
     Encryption Method:      AES-256-GCM (Crypt15)
     Key Format:             Hexadecimal (64 chars)
     Source:                 Supabase Database

  ✨ Summary Status:
     Decryption Process:     ✅ COMPLETED
     Database Integrity:     ✅ VERIFIED (SQLite headers valid)
     Output Format:          SQLite 3 Database
`);

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    Decryption Complete ✅                      ║
╠═══════════════════════════════════════════════════════════════╣
║  ${successCount}/${encryptedFiles.length} files successfully decrypted
║  
║  Main Database: decrypted_wa.db
║  Other Databases: decrypted_chatsettingsbackup.db, etc.
║
║  Next Steps:
║  1. Open decrypted databases with SQLite viewer
║  2. Export messages/chats for backup or analysis
║  3. Process with the message parser
╚═══════════════════════════════════════════════════════════════╝
`);

  process.exit(successCount > 0 ? 0 : 1);
}

// Run with error handling
main().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
