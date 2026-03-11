#!/usr/bin/env node

/**
 * Encryption Key Test & Decryption
 * Tests the provided encryption key for Priya Mishra's backup
 * Node.js version
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

class DecryptionTester {
  constructor(encryptionKey, phoneNumber, name) {
    this.encryptionKey = encryptionKey;
    this.phoneNumber = phoneNumber;
    this.name = name;
    
    // Backup directory
    this.backupDir = '/home/katyayani/Downloads/AndroidData-20260310T103958Z-3-001/AndroidData';
    
    // Initialize Supabase for updating if key works
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY || 
                       process.env.SUPABASE_SERVICE_KEY || 
                       process.env.SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      this.supabase = createClient(supabaseUrl, supabaseKey);
      console.log(`✅ Supabase connected\n`);
    }
  }

  /**
   * Extract IV from Crypt15 backup protobuf header
   */
  extractIVFromProtobuf(encryptedData) {
    try {
      const protobufSize = encryptedData[0];
      let offset = 1;

      // Check for feature flag (0x01)
      if (encryptedData[offset] === 0x01) {
        offset += 1;
      }

      // Extract protobuf data
      const protobufData = encryptedData.slice(offset, offset + protobufSize);

      // Look for the IV in the protobuf (field with 0x0a prefix and 16-byte length)
      for (let i = 0; i < protobufData.length - 17; i++) {
        if (protobufData[i] === 0x0a && protobufData[i + 1] === 16) {
          const candidate = protobufData.slice(i + 2, i + 18);
          if (candidate.length === 16) {
            return candidate;
          }
        }
      }

      // Fallback: find any 16-byte sequence with good entropy
      for (let i = 0; i < protobufData.length - 15; i++) {
        const candidate = protobufData.slice(i, i + 16);
        const isZero = candidate.every(b => b === 0);
        const allSame = candidate.slice(1).every(b => b === candidate[0]);
        
        if (!isZero && !allSame && candidate.length === 16) {
          return candidate;
        }
      }

      return null;
    } catch (e) {
      console.log(`Warning: IV extraction error: ${e.message}`);
      return null;
    }
  }

  /**
   * Test decryption with the provided key
   */
  async testDecryption(filePath) {
    const fileName = path.basename(filePath);
    console.log(`\n🔓 Testing decryption of: ${fileName}`);

    try {
      // Read encrypted file
      const encryptedData = fs.readFileSync(filePath);
      const fileSize = encryptedData.length;
      console.log(`   File size: ${(fileSize / 1024).toFixed(2)} KB`);

      // Validate key format
      let keyBytes;
      try {
        keyBytes = Buffer.from(this.encryptionKey, 'hex');
        if (keyBytes.length !== 32) {
          console.log(`❌ Invalid key length: ${keyBytes.length} bytes (expected 32)`);
          return false;
        }
      } catch (e) {
        console.log(`❌ Invalid key format: ${e.message}`);
        return false;
      }

      // Extract IV from backup
      const iv = this.extractIVFromProtobuf(encryptedData);
      if (!iv || iv.length !== 16) {
        console.log(`❌ Could not extract IV from backup header`);
        return false;
      }

      console.log(`   IV: ${iv.toString('hex')}`);

      // Extract encryption components
      const checksum = encryptedData.slice(-16);
      const authTag = encryptedData.slice(-32, -16);
      const encryptedPayload = encryptedData.slice(0, -32);

      console.log(`   Payload size: ${(encryptedPayload.length / 1024).toFixed(2)} KB`);

      // Attempt AES-GCM decryption
      const decipher = crypto.createDecipheriv('aes-256-gcm', keyBytes, iv.slice(0, 12));
      
      // Set auth tag BEFORE calling final()
      decipher.setAuthTag(authTag);
      
      let decrypted;
      try {
        decrypted = Buffer.concat([
          decipher.update(encryptedPayload),
          decipher.final()
        ]);
        
        console.log(`\n✅ DECRYPTION SUCCESSFUL!`);
        console.log(`   ✓ Authentication tag verified`);
        console.log(`   ✓ Decrypted size: ${(decrypted.length / 1024).toFixed(2)} KB`);
        
        // Check for zlib compression
        if (decrypted[0] === 0x78) {
          const zlib = await import('zlib');
          try {
            decrypted = zlib.inflateSync(decrypted);
            console.log(`   ✓ Decompressed: ${(decrypted.length / 1024).toFixed(2)} KB`);
          } catch (e) {
            console.log(`   ⚠️  Decompression failed: ${e.message}`);
          }
        }

        // Check if SQLite
        if (decrypted.length > 16 && decrypted.slice(0, 13).toString() === 'SQLite format') {
          console.log(`   ✅ Valid SQLite database file!`);
        } else {
          console.log(`   ⚠️  First 16 bytes: ${decrypted.slice(0, 16).toString('hex')}`);
        }

        // Save decrypted file
        const outputFileName = `decrypted_${path.basename(filePath, '.crypt15')}.db`;
        const outputPath = path.join(process.cwd(), outputFileName);
        fs.writeFileSync(outputPath, decrypted);
        console.log(`   💾 Saved: ${outputFileName}`);

        return {
          success: true,
          fileName: fileName,
          decryptedSize: decrypted.length,
          outputPath: outputPath
        };
        
      } catch (e) {
        console.log(`\n❌ DECRYPTION FAILED!`);
        console.log(`   ✗ Authentication tag mismatch: ${e.message}`);
        console.log(`\n   This key does NOT match the encryption used for this backup.`);
        return false;
      }

    } catch (e) {
      console.log(`❌ Error: ${e.message}`);
      return false;
    }
  }

  /**
   * Main test execution
   */
  async run() {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║              Encryption Key Decryption Tester v1.0             ║
║         Testing provided encryption key for backup files       ║
╚═══════════════════════════════════════════════════════════════╝`);

    console.log(`\n📱 Phone: ${this.phoneNumber}`);
    console.log(`👤 Name: ${this.name}`);
    console.log(`🔑 Key: ${this.encryptionKey.substring(0, 32)}...${this.encryptionKey.substring(-8)}`);

    // Check backup directory
    if (!fs.existsSync(this.backupDir)) {
      console.log(`\n❌ Backup directory not found: ${this.backupDir}`);
      return;
    }

    // Find backup files
    const backupFiles = fs.readdirSync(this.backupDir)
      .filter(f => f.endsWith('.crypt15'))
      .map(f => path.join(this.backupDir, f));

    if (backupFiles.length === 0) {
      console.log(`\n❌ No .crypt15 backup files found`);
      return;
    }

    console.log(`\n📁 Found ${backupFiles.length} backup files:`);
    backupFiles.forEach((f, i) => {
      const stats = fs.statSync(f);
      console.log(`   ${i + 1}. ${path.basename(f)} - ${(stats.size / 1024).toFixed(2)} KB`);
    });

    // Test decryption of all files
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🔑 Testing Encryption Key`);
    console.log('='.repeat(70));

    const results = [];
    for (const file of backupFiles) {
      const result = await this.testDecryption(file);
      if (result && result.success) {
        results.push(result);
      }
    }

    // Print summary
    this.printSummary(results);
  }

  /**
   * Print summary of decryption results
   */
  printSummary(results) {
    console.log(`\n\n╔═══════════════════════════════════════════════════════════════╗`);
    console.log(`║                    DECRYPTION SUMMARY                         ║`);
    console.log(`╠═══════════════════════════════════════════════════════════════╣`);

    if (results.length === 0) {
      console.log(`║  ❌ All decryption attempts FAILED                            ║`);
      console.log(`║     The provided key does NOT match this backup               ║`);
      console.log(`║                                                               ║`);
      console.log(`║  Next steps:                                                  ║`);
      console.log(`║  1. Double-check the encryption key is correct                ║`);
      console.log(`║  2. Extract key from WhatsApp Settings → Chats → Backup       ║`);
      console.log(`║  3. Or extract from phone via ADB from WhatsApp database      ║`);
    } else {
      console.log(`║  ✅ Successfully decrypted ${results.length} file(s)!                    ║`);
      console.log(`╠═══════════════════════════════════════════════════════════════╣`);
      
      for (const result of results) {
        console.log(`║                                                               ║`);
        console.log(`║  File: ${result.fileName.padEnd(55)} ║`);
        console.log(`║  Size: ${(result.decryptedSize / 1024).toFixed(2)} KB${' '.repeat(58 - 10)} ║`);
        console.log(`║  Location: ${result.outputPath.padEnd(50)} ║`);
      }

      console.log(`║                                                               ║`);
      console.log(`║  ✅ KEY IS VALID!                                             ║`);
      console.log(`║                                                               ║`);
      console.log(`║  You can now:                                                 ║`);
      console.log(`║  1. Use the decrypted database files for analysis             ║`);
      console.log(`║  2. Update Supabase with this confirmed key:                  ║`);
      console.log(`║     UPDATE phones SET encryption_key = '${this.encryptionKey}' ║`);
      console.log(`║     WHERE phone_number = '${this.phoneNumber}';                ║`);
      console.log(`║  3. Parse the SQLite databases for messages/chats             ║`);
    }

    console.log(`╚═══════════════════════════════════════════════════════════════╝`);
  }
}

// Main execution
async function main() {
  // Encryption key provided by user
  const encryptionKey = 'aca75852758afeaad9c5b1ed81b889daf16b77600c028e33aebb153214ce839a';
  const phoneNumber = 'Priya Mishra';
  const name = 'Priya Mishra';

  try {
    const tester = new DecryptionTester(encryptionKey, phoneNumber, name);
    await tester.run();
  } catch (e) {
    console.log(`\n❌ Fatal error: ${e.message}`);
    console.error(e);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
  });
}

export default DecryptionTester;
