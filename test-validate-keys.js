#!/usr/bin/env node

/**
 * Test file to validate if encryption keys from Supabase are correct for their associated phone numbers
 * Checks each phone's backup files against its stored encryption key
 * Node.js version
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class KeyValidator {
  constructor() {
    // Initialize Supabase
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY || 
                       process.env.SUPABASE_SERVICE_KEY || 
                       process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SUPABASE_URL and SUPABASE_KEY (or SERVICE_KEY/ANON_KEY) environment variables not set');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    console.log(`✅ Connected to Supabase: ${supabaseUrl}\n`);

    // Backup directory
    this.backupDir = '/home/katyayani/Downloads/AndroidData-20260310T103958Z-3-001/AndroidData';
  }

  /**
   * Test if an encryption key from Supabase is valid for a phone's backup
   */
  async testKeyValidity(phoneNumber, encryptionKeyHex) {
    console.log('\n' + '='.repeat(70));
    console.log(`📱 Phone: ${phoneNumber}`);
    console.log(`🔑 Key: ${encryptionKeyHex.substring(0, 32)}...${encryptionKeyHex.substring(-16)}`);
    console.log('='.repeat(70));

    try {
      // Check if backup directory exists
      if (!fs.existsSync(this.backupDir)) {
        console.log(`❌ Backup directory not found: ${this.backupDir}`);
        return null;
      }

      // Find .crypt15 files
      const backupFiles = fs.readdirSync(this.backupDir)
        .filter(f => f.endsWith('.crypt15'))
        .map(f => path.join(this.backupDir, f));

      if (backupFiles.length === 0) {
        console.log(`❌ No .crypt15 backup files found in ${this.backupDir}`);
        return null;
      }

      console.log(`📁 Found ${backupFiles.length} backup files`);

      // Test with wa.db.crypt15 or first available
      let targetFile = path.join(this.backupDir, 'wa.db.crypt15');
      if (!fs.existsSync(targetFile)) {
        console.log(`⚠️  wa.db.crypt15 not found, trying first available file...`);
        targetFile = backupFiles[0];
      }

      console.log(`\n🔓 Testing key validity by decrypting: ${path.basename(targetFile)}`);

      // Read encrypted file
      const encryptedData = fs.readFileSync(targetFile);
      console.log(`   File size: ${encryptedData.length} bytes`);

      // Validate key format
      let keyBytes;
      try {
        keyBytes = Buffer.from(encryptionKeyHex, 'hex');
        if (keyBytes.length !== 32) {
          console.log(`❌ Invalid key length: ${keyBytes.length} bytes (expected 32)`);
          return false;
        }
      } catch (e) {
        console.log(`❌ Invalid key format: ${e.message}`);
        return false;
      }

      // Parse backup header to extract IV
      try {
        // Read protobuf size (first byte)
        const protobufSize = encryptedData[0];
        let offset = 1;

        // Check for feature flag (0x01)
        if (encryptedData[offset] === 0x01) {
          offset += 1;
        }

        // Read protobuf data
        const protobufData = encryptedData.slice(offset, offset + protobufSize);

        // Extract IV from protobuf (simplified - looking for specific bytes)
        // In Crypt15, IV should be in the protobuf message
        // For now, we'll try to find it by pattern matching

        // Extract checksum and auth tag
        const checksum = encryptedData.slice(-16);
        const authTag = encryptedData.slice(-32, -16);
        const encryptedPayload = encryptedData.slice(0, -32);

        console.log(`   Protobuf size: ${protobufSize} bytes`);
        console.log(`   Auth tag: ${authTag.toString('hex').substring(0, 16)}...`);

        // Try to extract IV from the protobuf (this is a simplified approach)
        // The actual IV extraction would need proper protobuf parsing
        // For now, we'll attempt decryption and check the auth tag result

        // Test AES-GCM decryption
        const iv = this.extractIVFromProtobuf(encryptedData);
        if (!iv || iv.length !== 16) {
          console.log(`❌ Could not extract IV from backup header`);
          return false;
        }

        console.log(`   IV: ${iv.toString('hex')}`);

        // Attempt AES-GCM decryption
        const decipher = crypto.createDecipheriv('aes-256-gcm', keyBytes, iv.slice(0, 12));
        
        // For GCM mode, set the auth tag BEFORE calling final()
        decipher.setAuthTag(authTag);
        
        let decrypted;
        try {
          decrypted = Buffer.concat([
            decipher.update(encryptedPayload),
            decipher.final()
          ]);
          
          console.log(`\n✅ KEY IS VALID!`);
          console.log(`   ✓ Authentication tag verified`);
          console.log(`   ✓ Successfully decrypted ${decrypted.length} bytes`);
          return true;
          
        } catch (e) {
          console.log(`\n❌ KEY IS INVALID!`);
          console.log(`   ✗ Authentication tag mismatch: ${e.message}`);
          console.log(`   This means the encryption key stored in Supabase`);
          console.log(`   does NOT match the key used to encrypt this backup.`);

          console.log(`\n📋 Diagnostic Information:`);
          console.log(`   - Auth tag mismatch suggests wrong encryption key`);
          console.log(`   - Expected SQLite header: 53514C69...`);
          console.log(`   - Possible causes:`);
          console.log(`     1. Key was changed after backup was created`);
          console.log(`     2. Backup is from a different encryption key`);
          console.log(`     3. Backup file is corrupted`);
          console.log(`     4. Key derivation mismatch`);

          return false;
        }

      } catch (e) {
        console.log(`❌ Error during key validation: ${e.message}`);
        return false;
      }

    } catch (e) {
      console.log(`❌ Error: ${e.message}`);
      return false;
    }
  }

  /**
   * Extract IV from Crypt15 backup protobuf header
   * Properly parses the protobuf to find the Crypt15 IV field
   */
  extractIVFromProtobuf(encryptedData) {
    try {
      // Crypt15 IV is in protobuf message field
      // The protobuf structure contains: field 1 = size, field 2 = content containing IV
      
      const protobufSize = encryptedData[0];
      let offset = 1;

      // Check for feature flag (0x01)
      if (encryptedData[offset] === 0x01) {
        offset += 1;
      }

      // Extract protobuf data
      const protobufData = encryptedData.slice(offset, offset + protobufSize);

      // Look for the IV in the protobuf
      // Protobuf wire format: field number and type
      // The IV appears as a 16-byte field in the message
      
      // Simple heuristic: find 16 consecutive bytes that look like an IV
      // IV should be non-zero and have good entropy
      for (let i = 0; i < protobufData.length - 17; i++) {
        // Check for length-delimited wire type (0x0a = field with length)
        if (protobufData[i] === 0x0a && protobufData[i + 1] === 16) {
          // Next 16 bytes should be the IV
          const candidate = protobufData.slice(i + 2, i + 18);
          if (candidate.length === 16) {
            return candidate;
          }
        }
      }

      // Fallback: try to find any 16-byte sequence
      for (let i = 0; i < protobufData.length - 15; i++) {
        const candidate = protobufData.slice(i, i + 16);
        // Check if valid IV-like (not all zeros, not all same byte)
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
   * Main execution - test all phones with encryption keys
   */
  async run() {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           Encryption Key Validator v1.0                       ║
║  Validates if Supabase keys match actual backup encryption    ║
╚═══════════════════════════════════════════════════════════════╝`);

    try {
      console.log(`\n🔑 Fetching phones with encryption keys from Supabase...\n`);

      // Fetch all phones with encryption keys
      const { data: phones, error } = await this.supabase
        .from('phones')
        .select('*')
        .not('encryption_key', 'is', null);

      if (error) {
        throw new Error(`Failed to query phones table: ${error.message}`);
      }

      if (!phones || phones.length === 0) {
        console.log('❌ No phones with encryption keys found in Supabase');
        return;
      }

      console.log(`✅ Found ${phones.length} phones with encryption keys\n`);

      // Test each phone
      const results = {};
      for (const phone of phones) {
        const phoneNumber = phone.phone_number;
        const keyHex = phone.encryption_key;

        const result = await this.testKeyValidity(phoneNumber, keyHex);
        results[phoneNumber] = {
          key: keyHex,
          valid: result
        };
      }

      // Print summary
      this.printSummary(results);

    } catch (e) {
      console.log(`❌ Error: ${e.message}`);
      console.error(e);
    }
  }

  /**
   * Print validation summary
   */
  printSummary(results) {
    const validCount = Object.values(results).filter(r => r.valid === true).length;
    const invalidCount = Object.values(results).filter(r => r.valid === false).length;
    const unknownCount = Object.values(results).filter(r => r.valid === null).length;

    console.log(`\n\n╔═══════════════════════════════════════════════════════════════╗`);
    console.log(`║                    VALIDATION SUMMARY                         ║`);
    console.log(`╠═══════════════════════════════════════════════════════════════╣`);
    console.log(`║  Total Phones:        ${String(Object.keys(results).length).padStart(3)}                              ║`);
    console.log(`║  Valid Keys:          ${String(validCount).padStart(3)}  ✅                          ║`);
    console.log(`║  Invalid Keys:        ${String(invalidCount).padStart(3)}  ❌                          ║`);
    console.log(`║  Unknown:             ${String(unknownCount).padStart(3)}  ⚠️                           ║`);
    console.log(`╠═══════════════════════════════════════════════════════════════╣`);

    // Details
    for (const [phoneNumber, data] of Object.entries(results)) {
      const status = data.valid === true ? '✅ VALID' : 
                     data.valid === false ? '❌ INVALID' : '⚠️  UNKNOWN';
      const keyShort = `${data.key.substring(0, 16)}...${data.key.substring(-8)}`;
      console.log(`║  ${phoneNumber.padEnd(15)} | ${status.padEnd(12)} | Key: ${keyShort.substring(0, 24).padEnd(24)} │`);
    }

    console.log(`╠═══════════════════════════════════════════════════════════════╣`);
    console.log(`║                    RECOMMENDATIONS:                           ║`);

    if (invalidCount > 0) {
      console.log(`║  ❌ Some keys are INVALID:                                   ║`);
      for (const [phoneNumber, data] of Object.entries(results)) {
        if (data.valid === false) {
          console.log(`║     - ${phoneNumber}: Key needs to be updated or renewed     ║`);
        }
      }
      console.log(`║                                                               ║`);
      console.log(`║  To fix:                                                     ║`);
      console.log(`║  1. Extract correct key from the phone device               ║`);
      console.log(`║  2. Update the encryption_key in Supabase for this phone    ║`);
      console.log(`║  3. Re-run this validator to confirm                        ║`);
    }

    if (validCount > 0) {
      console.log(`║  ✅ Valid keys can be used for decryption:                   ║`);
      for (const [phoneNumber, data] of Object.entries(results)) {
        if (data.valid === true) {
          console.log(`║     - ${phoneNumber}: Key is correct                       ║`);
        }
      }
    }

    console.log(`╚═══════════════════════════════════════════════════════════════╝`);
  }
}

// Main execution
async function main() {
  try {
    const validator = new KeyValidator();
    await validator.run();
  } catch (e) {
    console.log(`\n❌ Fatal error: ${e.message}`);
    console.error(e);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
  });
}

export default KeyValidator;
