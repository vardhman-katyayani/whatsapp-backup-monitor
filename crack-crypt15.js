import { readFileSync, writeFileSync } from 'fs';
import { pbkdf2Sync, createDecipheriv, createHash, hkdfSync } from 'crypto';
import { inflateSync, gunzipSync } from 'zlib';

const filePath = 'msgstore.db.crypt15';
const password = 'test@123';

console.log('🔥 WhatsApp Crypt15 Password Cracker\n');

const data = readFileSync(filePath);
console.log(`File: ${filePath}`);
console.log(`Size: ${(data.length / 1024 / 1024).toFixed(2)} MB`);
console.log(`Password: ${password}\n`);

// Parse the protobuf header properly
// The header contains:
// - Version info
// - Server salt (16 bytes)
// - Other metadata

// Find the 16-byte server salt embedded in the header
// It's usually in a nested field after 0a 10 (field 1, length 16)

function findSalts(buf) {
  const salts = [];
  for (let i = 0; i < Math.min(buf.length, 200); i++) {
    // Look for pattern: 0a 10 (field 1, 16 bytes) followed by 16 bytes
    if (buf[i] === 0x0a && buf[i + 1] === 0x10 && i + 18 <= buf.length) {
      salts.push({
        offset: i + 2,
        salt: buf.slice(i + 2, i + 18)
      });
    }
    // Also look for 12 10 (field 2, 16 bytes)
    if (buf[i] === 0x12 && buf[i + 1] === 0x10 && i + 18 <= buf.length) {
      salts.push({
        offset: i + 2,
        salt: buf.slice(i + 2, i + 18)
      });
    }
  }
  return salts;
}

const salts = findSalts(data);
console.log(`Found ${salts.length} potential salt(s) in header:`);
salts.forEach((s, i) => {
  console.log(`  ${i + 1}. Offset ${s.offset}: ${s.salt.toString('hex')}`);
});

// Find where the encrypted data starts
// Look for the end of protobuf fields (typically after version string and metadata)
function findEncryptedDataStart(buf) {
  // WhatsApp version is like "2.25.37.76" - find it
  const str = buf.slice(0, 200).toString('ascii');
  const versionMatch = str.match(/2\.\d+\.\d+\.\d+/);
  if (versionMatch) {
    console.log(`\nWhatsApp version: ${versionMatch[0]}`);
  }
  
  // The encrypted data typically starts after all the 0x01 padding bytes
  // Look for the pattern where protobuf fields end
  for (let i = 50; i < 200; i++) {
    // Check if we're past the protobuf header by looking for non-protobuf data
    // The encrypted data doesn't follow protobuf patterns
    const byte = buf[i];
    const nextByte = buf[i + 1];
    
    // If we see a sequence that doesn't look like protobuf, this might be the start
    // Typically after all the "x8 01 01" style fields end
  }
  
  // Common header sizes for crypt15: 67, 73, 79, 85, 99, 111, 115, 131
  return [67, 73, 79, 85, 99, 111, 115, 131, 135, 141, 151];
}

const headerSizes = findEncryptedDataStart(data);
console.log(`\nTrying header sizes: ${headerSizes.join(', ')}`);

// Try decryption with different combinations
function tryDecrypt(key, iv, encData, label) {
  try {
    // GCM mode (standard for crypt15)
    if (encData.length < 16) return null;
    
    const authTag = encData.slice(encData.length - 16);
    const ciphertext = encData.slice(0, encData.length - 16);
    
    // Try 12-byte IV (standard GCM)
    const iv12 = iv.slice(0, 12);
    
    const decipher = createDecipheriv('aes-256-gcm', key, iv12);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertext);
    let final = decipher.final();
    let result = Buffer.concat([decrypted, final]);
    
    // Check for SQLite header
    if (result.slice(0, 15).toString('ascii') === 'SQLite format 3') {
      console.log(`\n✅ SUCCESS with ${label}!`);
      return result;
    }
    
    // Check for zlib/gzip compressed data
    if (result[0] === 0x78 || (result[0] === 0x1f && result[1] === 0x8b)) {
      try {
        const decompressed = result[0] === 0x78 ? inflateSync(result) : gunzipSync(result);
        if (decompressed.slice(0, 15).toString('ascii') === 'SQLite format 3') {
          console.log(`\n✅ SUCCESS with ${label} (compressed)!`);
          return decompressed;
        }
      } catch (e) {
        // Not compressed or wrong format
      }
    }
  } catch (e) {
    // Decryption failed
  }
  return null;
}

console.log('\n🔓 Attempting decryption...\n');

let attempts = 0;
const maxAttempts = 50000;

// WhatsApp crypt15 password-based key derivation:
// According to research, they use:
// 1. HKDF to derive a key from password
// 2. Server salt from header
// 3. The key then decrypts the actual encryption key stored server-side
// But for offline backups, the password directly derives the key

for (const saltInfo of salts) {
  const salt = saltInfo.salt;
  
  // Try different key derivation methods
  const keyMethods = [
    // PBKDF2 with different parameters
    { name: 'PBKDF2-SHA256-16384', fn: () => pbkdf2Sync(password, salt, 16384, 32, 'sha256') },
    { name: 'PBKDF2-SHA256-100000', fn: () => pbkdf2Sync(password, salt, 100000, 32, 'sha256') },
    { name: 'PBKDF2-SHA512-16384', fn: () => pbkdf2Sync(password, salt, 16384, 32, 'sha512') },
    { name: 'PBKDF2-SHA1-16384', fn: () => pbkdf2Sync(password, salt, 16384, 32, 'sha1') },
    
    // HKDF variants
    { name: 'HKDF-SHA256', fn: () => {
      const ikm = Buffer.from(password, 'utf8');
      return hkdfSync('sha256', ikm, salt, Buffer.from('backup encryption', 'utf8'), 32);
    }},
    
    // Combined PBKDF2 + HKDF
    { name: 'PBKDF2+HKDF', fn: () => {
      const intermediate = pbkdf2Sync(password, salt, 16384, 32, 'sha256');
      return hkdfSync('sha256', intermediate, salt, Buffer.from('backup encryption\x01', 'utf8'), 32);
    }},
    
    // Simple hash
    { name: 'SHA256-direct', fn: () => createHash('sha256').update(Buffer.from(password + salt.toString('hex'), 'utf8')).digest() },
  ];
  
  for (const keyMethod of keyMethods) {
    let key;
    try {
      key = keyMethod.fn();
    } catch (e) {
      continue;
    }
    
    for (const headerSize of headerSizes) {
      // Try different IV positions
      for (let ivOffset = 0; ivOffset < headerSize; ivOffset++) {
        attempts++;
        if (attempts > maxAttempts) {
          console.log(`Reached ${maxAttempts} attempts, stopping...`);
          process.exit(1);
        }
        
        const iv = data.slice(ivOffset, ivOffset + 16);
        const encData = data.slice(headerSize);
        
        const result = tryDecrypt(key, iv, encData, `${keyMethod.name}, salt@${saltInfo.offset}, header=${headerSize}, IV@${ivOffset}`);
        if (result) {
          writeFileSync('msgstore.db', result);
          console.log(`Saved to: msgstore.db`);
          console.log(`Total attempts: ${attempts}`);
          process.exit(0);
        }
      }
    }
  }
  
  // Also try IV as all zeros (some implementations use this)
  for (const keyMethod of keyMethods) {
    let key;
    try {
      key = keyMethod.fn();
    } catch (e) {
      continue;
    }
    
    const zeroIV = Buffer.alloc(16, 0);
    for (const headerSize of headerSizes) {
      attempts++;
      const encData = data.slice(headerSize);
      const result = tryDecrypt(key, zeroIV, encData, `${keyMethod.name}, zero IV, header=${headerSize}`);
      if (result) {
        writeFileSync('msgstore.db', result);
        console.log(`Saved to: msgstore.db`);
        console.log(`Total attempts: ${attempts}`);
        process.exit(0);
      }
    }
  }
}

console.log(`\n❌ Failed after ${attempts} attempts.`);
console.log('\nThe encryption key is likely server-derived, not directly from password.');
console.log('Need the encrypted_backup.key file from the device or the 64-digit key.');
