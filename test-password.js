import { readFileSync } from 'fs';
import { pbkdf2Sync, createDecipheriv } from 'crypto';

const filePath = 'msgstore-2026-01-16.1.db.crypt15';
const encryptedData = readFileSync(filePath);

const salt = encryptedData.slice(0, 16);
const iv = encryptedData.slice(16, 32);
const keyMaterial = encryptedData.slice(32, 64);
const encryptedContent = encryptedData.slice(73);

// Test different password variations
const passwords = [
  'Vardhman@121',
  'vardhman@121',
  'Vardhman@121 ',
  ' Vardhman@121',
  'Vardhman@121\n',
];

console.log('Testing password variations...\n');

for (const password of passwords) {
  try {
    const derivedKey = pbkdf2Sync(password, salt, 16384, 32, 'sha256');
    
    // Try GCM
    try {
      const authTag = encryptedContent.slice(encryptedContent.length - 16);
      const ciphertext = encryptedContent.slice(0, encryptedContent.length - 16);
      const decipher = createDecipheriv('aes-256-gcm', derivedKey, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(ciphertext);
      let final = decipher.final();
      const result = Buffer.concat([decrypted, final]);
      
      if (result.slice(0, 16).toString('ascii') === 'SQLite format 3') {
        console.log(`✅ SUCCESS with password: "${password}"`);
        process.exit(0);
      }
    } catch (e) {
      // Try next
    }
  } catch (e) {
    // Continue
  }
}

console.log('❌ None of the password variations worked.');
console.log('\nPlease verify:');
console.log('1. The exact password you set in WhatsApp');
console.log('2. Whether you used "Create password" or "64-digit key"');
