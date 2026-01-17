import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createDecipheriv, createHmac, createHash } from 'crypto';
import { inflateSync } from 'zlib';

console.log('🔑 WhatsApp Crypt15 Decryptor (Key File Method)\n');

const backupPath = 'msgstore.db.crypt15';
const keyPath = 'encrypted_backup.key';

if (!existsSync(keyPath)) {
  console.log(`❌ Key file not found: ${keyPath}`);
  console.log('\nTo get the key file:');
  console.log('1. Connect your phone via USB with USB debugging enabled');
  console.log('2. Run: adb backup -f whatsapp.ab -noapk com.whatsapp');
  console.log('3. Extract the backup and find: apps/com.whatsapp/f/encrypted_backup.key');
  console.log('4. Copy it to this folder');
  process.exit(1);
}

// ============================================
// Port of wa-crypt-tools encryptionloop
// ============================================
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

// ============================================
// Parse the key file (Java serialized object)
// ============================================
function parseKeyFile(keyData) {
  // The key file is a serialized Java byte array
  // Format: Java serialization header + byte array
  // We need to find the 32-byte key inside
  
  console.log(`Key file size: ${keyData.length} bytes`);
  console.log(`Key file hex: ${keyData.toString('hex').substring(0, 100)}...`);
  
  // Look for the 32-byte key (usually near the end)
  // Java serialization: 0xaced (magic) 0x0005 (version)
  if (keyData[0] === 0xac && keyData[1] === 0xed) {
    console.log('Detected Java serialized format');
    
    // Find byte array marker and extract 32 bytes
    for (let i = 0; i < keyData.length - 32; i++) {
      // Look for array length indicator
      if (keyData[i] === 0x00 && keyData[i + 1] === 0x00 && 
          keyData[i + 2] === 0x00 && keyData[i + 3] === 0x20) { // 0x20 = 32
        const rootKey = keyData.slice(i + 4, i + 4 + 32);
        console.log(`Found 32-byte key at offset ${i + 4}: ${rootKey.toString('hex')}`);
        return rootKey;
      }
    }
    
    // Alternative: just take last 32 bytes
    const rootKey = keyData.slice(-32);
    console.log(`Using last 32 bytes as key: ${rootKey.toString('hex')}`);
    return rootKey;
  }
  
  // If it's a raw 32-byte key
  if (keyData.length === 32) {
    console.log('Detected raw 32-byte key');
    return keyData;
  }
  
  // If it's a 64-character hex string
  if (keyData.length === 64 || keyData.length === 65) {
    const hexStr = keyData.toString('ascii').trim();
    if (/^[0-9a-fA-F]{64}$/.test(hexStr)) {
      console.log('Detected 64-character hex key');
      return Buffer.from(hexStr, 'hex');
    }
  }
  
  throw new Error('Could not parse key file');
}

// ============================================
// Parse backup header
// ============================================
function parseHeader(data) {
  let offset = 0;
  const protobufSize = data[0];
  offset = 1;
  
  if (data[offset] === 0x01) {
    offset++;
  }
  
  const protobufData = data.slice(offset, offset + protobufSize);
  offset += protobufSize;
  
  // Find IV in protobuf (look for 16-byte field)
  let iv = null;
  for (let i = 0; i < protobufData.length - 17; i++) {
    if (protobufData[i] === 0x0a && protobufData[i + 1] === 0x10) {
      iv = protobufData.slice(i + 2, i + 18);
      break;
    }
  }
  
  return { headerSize: offset, iv };
}

// ============================================
// Main
// ============================================
const backupData = readFileSync(backupPath);
const keyData = readFileSync(keyPath);

console.log(`Backup file: ${backupPath} (${(backupData.length / 1024 / 1024).toFixed(2)} MB)`);

// Parse key
const rootKey = parseKeyFile(keyData);

// Derive encryption key using wa-crypt-tools method
const encryptionKey = encryptionloop(rootKey, Buffer.from('backup encryption'), 32);
console.log(`Derived encryption key: ${encryptionKey.toString('hex')}`);

// Parse header
const header = parseHeader(backupData);
console.log(`Header size: ${header.headerSize} bytes`);
console.log(`IV: ${header.iv ? header.iv.toString('hex') : 'not found'}`);

if (!header.iv) {
  console.log('❌ Could not find IV in backup header');
  process.exit(1);
}

// Get encrypted data
const encryptedData = backupData.slice(header.headerSize, backupData.length - 32);
const authTag = backupData.slice(backupData.length - 32, backupData.length - 16);

console.log(`\nEncrypted data: ${encryptedData.length} bytes`);
console.log(`Auth tag: ${authTag.toString('hex')}`);

// Decrypt
console.log('\n🔓 Decrypting...');

try {
  const iv12 = header.iv.slice(0, 12);
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, iv12);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedData);
  let final = decipher.final();
  let result = Buffer.concat([decrypted, final]);
  
  // Decompress if needed
  if (result[0] === 0x78) {
    console.log('Decompressing zlib data...');
    result = inflateSync(result);
  }
  
  // Verify SQLite header
  if (result.slice(0, 15).toString('ascii') === 'SQLite format 3') {
    writeFileSync('msgstore.db', result);
    console.log('\n✅ SUCCESS! Decrypted database saved to: msgstore.db');
    console.log(`Database size: ${(result.length / 1024 / 1024).toFixed(2)} MB`);
  } else {
    console.log('❌ Decrypted data is not a valid SQLite database');
    console.log(`First 16 bytes: ${result.slice(0, 16).toString('hex')}`);
  }
} catch (e) {
  console.log(`❌ Decryption failed: ${e.message}`);
}
