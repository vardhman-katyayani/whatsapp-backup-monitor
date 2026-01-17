import { readFileSync, writeFileSync } from 'fs';
import { createDecipheriv, createHmac } from 'crypto';
import { inflateSync } from 'zlib';

console.log('🔓 WhatsApp Crypt15 Decryptor - Using 64-digit Key\n');

// The 64-digit hex key from your screenshot
const hexKey = '706ded8a9699c258dd3d441dacf1e98c4ca86358d5f3f21a8b766ec0bbbe6385';
const rootKey = Buffer.from(hexKey, 'hex');

console.log(`Root key (hex): ${rootKey.toString('hex')}`);
console.log(`Root key length: ${rootKey.length} bytes\n`);

// Port of wa-crypt-tools encryptionloop
function encryptionloop(firstIterationData, message, outputBytes, privateSeed = Buffer.alloc(32, 0)) {
  const privateKey = createHmac('sha256', privateSeed).update(firstIterationData).digest();
  
  let dataBlock = Buffer.alloc(0);
  let output = Buffer.alloc(0);
  const permutations = Math.ceil(outputBytes / 32);
  
  for (let i = 1; i <= permutations; i++) {
    const hasher = createHmac('sha256', privateKey);
    hasher.update(dataBlock);
    if (message) {
      hasher.update(message);
    }
    hasher.update(Buffer.from([i]));
    dataBlock = hasher.digest();
    const bytesToWrite = Math.min(outputBytes - output.length, dataBlock.length);
    output = Buffer.concat([output, dataBlock.slice(0, bytesToWrite)]);
  }
  
  return output;
}

// Derive the actual encryption key using wa-crypt-tools method
const encryptionKey = encryptionloop(rootKey, Buffer.from('backup encryption'), 32);
console.log(`Derived encryption key: ${encryptionKey.toString('hex')}\n`);

// Read the backup file
const backupPath = 'msgstore.db.crypt15';
const data = readFileSync(backupPath);
console.log(`Backup file: ${backupPath}`);
console.log(`Backup size: ${(data.length / 1024 / 1024).toFixed(2)} MB\n`);

// Parse header
let offset = 0;
const protobufSize = data[0];
offset = 1;

// Check for feature flag
if (data[offset] === 0x01) {
  offset++;
}

// Skip protobuf
offset += protobufSize;

console.log(`Header size: ${offset} bytes`);

// Find IV in the protobuf header (look for 0x0a 0x10 pattern followed by 16 bytes)
let iv = null;
for (let i = 0; i < offset; i++) {
  if (data[i] === 0x0a && data[i + 1] === 0x10) {
    iv = data.slice(i + 2, i + 18);
    break;
  }
}

if (!iv) {
  console.log('❌ Could not find IV in header!');
  process.exit(1);
}

console.log(`IV: ${iv.toString('hex')}`);

// Get encrypted data and auth tag
const encryptedData = data.slice(offset, data.length - 32);
const authTag = data.slice(data.length - 32, data.length - 16);
const checksum = data.slice(data.length - 16);

console.log(`Encrypted data: ${encryptedData.length} bytes`);
console.log(`Auth tag: ${authTag.toString('hex')}`);
console.log(`Checksum: ${checksum.toString('hex')}\n`);

// Decrypt using AES-256-GCM
console.log('🔐 Decrypting...\n');

try {
  // Use 12-byte IV for GCM (standard)
  const iv12 = iv.slice(0, 12);
  
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, iv12);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedData);
  let final = decipher.final();
  let result = Buffer.concat([decrypted, final]);
  
  console.log(`Decrypted size: ${result.length} bytes`);
  console.log(`First 16 bytes: ${result.slice(0, 16).toString('hex')}`);
  
  // Check if compressed (zlib)
  if (result[0] === 0x78) {
    console.log('Decompressing zlib data...');
    result = inflateSync(result);
    console.log(`Decompressed size: ${result.length} bytes`);
  }
  
  // Verify SQLite header
  const sqliteHeader = result.slice(0, 16).toString('ascii');
  console.log(`SQLite check: "${sqliteHeader.substring(0, 15)}"`);
  
  if (sqliteHeader.startsWith('SQLite format 3')) {
    writeFileSync('msgstore.db', result);
    console.log('\n🎉🎉🎉 SUCCESS! 🎉🎉🎉');
    console.log(`✅ Decrypted database saved to: msgstore.db`);
    console.log(`✅ Database size: ${(result.length / 1024 / 1024).toFixed(2)} MB`);
  } else {
    console.log('\n❌ Decrypted data is not a valid SQLite database');
    writeFileSync('decrypted_raw.bin', result);
    console.log('Saved raw decrypted data to: decrypted_raw.bin');
  }
} catch (e) {
  console.log(`\n❌ Decryption failed: ${e.message}`);
  
  // Try alternative: maybe it's a multifile backup format
  console.log('\nTrying alternative format (multifile backup)...');
  
  try {
    const encryptedDataAlt = data.slice(offset, data.length - 16);
    const authTagAlt = data.slice(data.length - 16);
    
    const iv12 = iv.slice(0, 12);
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey, iv12);
    decipher.setAuthTag(authTagAlt);
    
    let decrypted = decipher.update(encryptedDataAlt);
    let final = decipher.final();
    let result = Buffer.concat([decrypted, final]);
    
    if (result[0] === 0x78) {
      result = inflateSync(result);
    }
    
    if (result.slice(0, 15).toString('ascii') === 'SQLite format 3') {
      writeFileSync('msgstore.db', result);
      console.log('\n🎉🎉🎉 SUCCESS (multifile format)! 🎉🎉🎉');
      console.log(`✅ Decrypted database saved to: msgstore.db`);
    }
  } catch (e2) {
    console.log(`Alternative also failed: ${e2.message}`);
  }
}
