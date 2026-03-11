#!/usr/bin/env node

/**
 * Test Decryption Script for shivam@gmail.com
 * 
 * Usage:
 *   node test-shivam-decrypt.js <backup-file-path>
 * 
 * Example:
 *   node test-shivam-decrypt.js /path/to/msgstore.db.crypt15
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import dotenv from 'dotenv';
import { decryptBackup } from './services/decryptor.js';
import { parseWhatsAppDatabase } from './services/parser.js';

// Load environment variables
dotenv.config();

const EMAIL = 'shivam@gmail.com';
const ENCRYPTION_KEY = process.env.WHATSAPP_HEX_KEY;

if (!ENCRYPTION_KEY) {
  console.error('❌ Error: WHATSAPP_HEX_KEY not set in .env');
  process.exit(1);
}

// ============================================
// Main Test Function
// ============================================

async function testDecrypt() {
  const backupPath = process.argv[2];

  if (!backupPath) {
    console.error(`
❌ Error: No backup file provided

Usage:
  node test-shivam-decrypt.js <backup-file-path>

Examples:
  node test-shivam-decrypt.js /path/to/msgstore.db.crypt15
  node test-shivam-decrypt.js ./msgstore.db.crypt15
    `);
    process.exit(1);
  }

  const fullPath = resolve(backupPath);

  console.log(`
╔════════════════════════════════════════════════════════════╗
║          WhatsApp Backup Decryption Test                   ║
╠════════════════════════════════════════════════════════════╣
║  Email: ${EMAIL}
║  Backup File: ${fullPath}
║  Encryption Key: ${ENCRYPTION_KEY.substring(0, 16)}...
╚════════════════════════════════════════════════════════════╝
  `);

  try {
    // Step 1: Read backup file
    console.log('📂 Reading backup file...');
    const backupBuffer = readFileSync(fullPath);
    console.log(`✅ File size: ${(backupBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    // Step 2: Decrypt
    console.log('\n🔓 Decrypting backup...');
    const decryptResult = await decryptBackup(backupBuffer, ENCRYPTION_KEY);
    console.log('✅ Successfully decrypted');

    // Step 3: Parse database
    console.log('\n📊 Parsing WhatsApp database...');
    const parseResult = await parseWhatsAppDatabase(decryptResult.database, 'shivam@gmail.com');
    
    // Step 4: Display results
    console.log(`
╔════════════════════════════════════════════════════════════╗
║                    RESULTS                                 ║
╚════════════════════════════════════════════════════════════╝
`);

    console.log(`Total Chats: ${parseResult.chats.length}`);
    console.log(`Total Messages: ${parseResult.messages.length}\n`);

    // Show chat summary
    if (parseResult.chats.length > 0) {
      console.log('📞 Chat History:');
      console.log('─'.repeat(60));
      parseResult.chats.slice(0, 10).forEach((chat, idx) => {
        const type = chat.is_group ? '👥 Group' : '👤 Individual';
        console.log(`${idx + 1}. ${type}: ${chat.contact_name || chat.jid}`);
        console.log(`   Messages: ${chat.total_messages || 0}`);
        if (chat.last_message_preview) {
          console.log(`   Last: "${chat.last_message_preview.substring(0, 50)}..."`);
        }
      });
      if (parseResult.chats.length > 10) {
        console.log(`\n... and ${parseResult.chats.length - 10} more chats`);
      }
    }

    // Show message sample
    if (parseResult.messages.length > 0) {
      console.log('\n\n💬 Sample Messages (Last 5):');
      console.log('─'.repeat(60));
      parseResult.messages.slice(-5).forEach((msg, idx) => {
        const timestamp = new Date(msg.timestamp).toLocaleString();
        const sender = msg.from_me ? '📤 You' : '📥 Them';
        const preview = msg.data ? msg.data.substring(0, 40) : '[Media/Empty]';
        console.log(`${idx + 1}. ${sender} - ${timestamp}`);
        console.log(`   "${preview}..."\n`);
      });
    }

    // Save results to file
    const outputFile = `shivam-decrypt-result-${Date.now()}.json`;
    writeFileSync(outputFile, JSON.stringify(parseResult, null, 2));
    console.log(`\n✅ Results saved to: ${outputFile}`);

    console.log(`
╔════════════════════════════════════════════════════════════╗
║              ✅ DECRYPTION SUCCESSFUL                      ║
╚════════════════════════════════════════════════════════════╝
    `);

  } catch (error) {
    console.error(`
❌ DECRYPTION FAILED

Error: ${error.message}

Troubleshooting:
  1. Check if file path is correct
  2. Verify file is a valid WhatsApp backup (.crypt15)
  3. Verify WHATSAPP_HEX_KEY is correct in .env
  4. Try with a different backup file

Debug Info:
${error.stack}
    `);
    process.exit(1);
  }
}

// Run test
testDecrypt();
