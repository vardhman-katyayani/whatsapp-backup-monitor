import { readFileSync, writeFileSync } from 'fs';
import { createDecipheriv, createHmac, createHash } from 'crypto';
import { inflateSync } from 'zlib';

const filePath = 'msgstore.db.crypt15';
const password = 'test@123';

console.log('🔥 WhatsApp Crypt15 Decryptor (wa-crypt-tools algorithm)\n');

const data = readFileSync(filePath);
console.log(`File: ${filePath}`);
console.log(`Size: ${(data.length / 1024 / 1024).toFixed(2)} MB`);
console.log(`Password: ${password}\n`);

// ============================================
// Port of wa-crypt-tools encryptionloop
// ============================================
function encryptionloop(firstIterationData, message, outputBytes, privateSeed = Buffer.alloc(32, 0)) {
  // The private key and the seed are used to create the HMAC key
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
// Parse the protobuf header
// ============================================
function parseHeader(data) {
  let offset = 0;
  
  // First byte is protobuf size
  const protobufSize = data[0];
  offset = 1;
  
  console.log(`Protobuf size: ${protobufSize} bytes`);
  
  // Check for feature flag (0x01)
  let hasFeatureFlag = false;
  if (data[offset] === 0x01) {
    hasFeatureFlag = true;
    offset++;
  }
  console.log(`Has feature flag: ${hasFeatureFlag}`);
  
  // Read the protobuf message
  const protobufData = data.slice(offset, offset + protobufSize);
  offset += protobufSize;
  
  // Parse protobuf to find IV (field 3 in BackupPrefix, which contains C15_IV)
  // The IV is 16 bytes, typically at field 3 -> subfield 1
  let iv = null;
  let serverSalt = null;
  
  // Simple protobuf parser for our needs
  let pos = 0;
  while (pos < protobufData.length) {
    const tag = protobufData[pos];
    const fieldNum = tag >> 3;
    const wireType = tag & 0x7;
    pos++;
    
    if (wireType === 0) { // Varint
      while (pos < protobufData.length && (protobufData[pos] & 0x80)) pos++;
      pos++;
    } else if (wireType === 2) { // Length-delimited
      let len = 0;
      let shift = 0;
      while (pos < protobufData.length) {
        const byte = protobufData[pos];
        len |= (byte & 0x7f) << shift;
        pos++;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      
      const content = protobufData.slice(pos, pos + len);
      
      // Field 3 is c15_iv which contains the IV
      if (fieldNum === 3 && len > 0) {
        // Parse nested message to find IV (subfield 1)
        let subPos = 0;
        while (subPos < content.length) {
          const subTag = content[subPos];
          const subFieldNum = subTag >> 3;
          const subWireType = subTag & 0x7;
          subPos++;
          
          if (subWireType === 2) {
            let subLen = content[subPos];
            subPos++;
            if (subFieldNum === 1 && subLen === 16) {
              iv = content.slice(subPos, subPos + subLen);
              console.log(`Found IV: ${iv.toString('hex')}`);
            }
            subPos += subLen;
          } else if (subWireType === 0) {
            while (subPos < content.length && (content[subPos] & 0x80)) subPos++;
            subPos++;
          } else {
            break;
          }
        }
      }
      
      // Field 2 contains server salt in some versions
      if (fieldNum === 2 && len > 0) {
        let subPos = 0;
        while (subPos < content.length) {
          const subTag = content[subPos];
          const subFieldNum = subTag >> 3;
          const subWireType = subTag & 0x7;
          subPos++;
          
          if (subWireType === 2) {
            let subLen = content[subPos];
            subPos++;
            if (subLen === 16) {
              serverSalt = content.slice(subPos, subPos + subLen);
              console.log(`Found server salt: ${serverSalt.toString('hex')}`);
            }
            subPos += subLen;
          } else if (subWireType === 0) {
            while (subPos < content.length && (content[subPos] & 0x80)) subPos++;
            subPos++;
          } else {
            break;
          }
        }
      }
      
      pos += len;
    } else {
      break;
    }
  }
  
  // Look for 16-byte sequences if we didn't find IV in protobuf
  if (!iv) {
    // Search for 0a 10 pattern (field 1, 16 bytes) followed by 16 bytes
    for (let i = 0; i < protobufData.length - 17; i++) {
      if (protobufData[i] === 0x0a && protobufData[i + 1] === 0x10) {
        iv = protobufData.slice(i + 2, i + 18);
        console.log(`Found IV (pattern search): ${iv.toString('hex')}`);
        break;
      }
    }
  }
  
  return {
    headerSize: offset,
    iv,
    serverSalt,
    protobufSize,
    hasFeatureFlag
  };
}

// ============================================
// Main decryption logic
// ============================================
console.log('📋 Parsing header...\n');

const header = parseHeader(data);
console.log(`\nHeader size: ${header.headerSize} bytes`);

if (!header.iv) {
  console.log('❌ Could not find IV in header!');
  process.exit(1);
}

// Get encrypted data (everything after header, minus checksum and auth tag)
const encryptedData = data.slice(header.headerSize, data.length - 32);
const authTag = data.slice(data.length - 32, data.length - 16);
const checksum = data.slice(data.length - 16);

console.log(`\nEncrypted data: ${encryptedData.length} bytes`);
console.log(`Auth tag: ${authTag.toString('hex')}`);
console.log(`Checksum: ${checksum.toString('hex')}`);

// ============================================
// The key problem: password-based decryption
// 
// For password-based E2E backups, the password is used to decrypt
// a key stored on WhatsApp's HSM servers, NOT directly on the backup.
// 
// Without the encrypted_backup.key file, we cannot decrypt.
// 
// BUT - let's try if the backup might be using local key derivation
// ============================================

console.log('\n🔓 Attempting decryption...\n');

// If we have server salt, try to derive key from password
const saltsToTry = [];
if (header.serverSalt) {
  saltsToTry.push(header.serverSalt);
}

// Also look for any 16-byte sequences in the first 200 bytes
for (let i = 0; i < Math.min(data.length - 17, 200); i++) {
  if (data[i] === 0x0a && data[i + 1] === 0x10) {
    saltsToTry.push(data.slice(i + 2, i + 18));
  }
}

// Try different key derivation methods
function tryDecryptWithKey(key, iv, encData, authTagBytes, label) {
  try {
    const iv12 = iv.slice(0, 12);
    const decipher = createDecipheriv('aes-256-gcm', key, iv12);
    decipher.setAuthTag(authTagBytes);
    
    let decrypted = decipher.update(encData);
    let final = decipher.final();
    let result = Buffer.concat([decrypted, final]);
    
    // Check for zlib compressed data
    if (result[0] === 0x78) {
      try {
        const decompressed = inflateSync(result);
        if (decompressed.slice(0, 15).toString('ascii') === 'SQLite format 3') {
          console.log(`✅ SUCCESS with ${label} (zlib compressed)!`);
          return decompressed;
        }
      } catch (e) {
        // Not zlib
      }
    }
    
    // Check for raw SQLite
    if (result.slice(0, 15).toString('ascii') === 'SQLite format 3') {
      console.log(`✅ SUCCESS with ${label}!`);
      return result;
    }
  } catch (e) {
    // Decryption failed
  }
  return null;
}

// Method 1: Try with password-derived key using encryptionloop (like wa-crypt-tools)
console.log('Testing wa-crypt-tools key derivation method...');

for (const salt of saltsToTry) {
  // Derive root key from password using PBKDF2-like method
  // WhatsApp might use the salt differently
  
  // Try direct password hash + encryptionloop
  const passwordBytes = Buffer.from(password, 'utf8');
  
  // Method A: SHA256(password) as root key
  const sha256Pass = createHash('sha256').update(passwordBytes).digest();
  const keyA = encryptionloop(sha256Pass, Buffer.from('backup encryption'), 32);
  
  let result = tryDecryptWithKey(keyA, header.iv, encryptedData, authTag, 'SHA256(password) + encryptionloop');
  if (result) {
    writeFileSync('msgstore.db', result);
    console.log('Saved to: msgstore.db');
    process.exit(0);
  }
  
  // Method B: Use salt in HMAC with password
  const hmacKey = createHmac('sha256', salt).update(passwordBytes).digest();
  const keyB = encryptionloop(hmacKey, Buffer.from('backup encryption'), 32);
  
  result = tryDecryptWithKey(keyB, header.iv, encryptedData, authTag, 'HMAC(salt, password) + encryptionloop');
  if (result) {
    writeFileSync('msgstore.db', result);
    console.log('Saved to: msgstore.db');
    process.exit(0);
  }
  
  // Method C: Concatenate password and salt
  const combined = Buffer.concat([passwordBytes, salt]);
  const combinedHash = createHash('sha256').update(combined).digest();
  const keyC = encryptionloop(combinedHash, Buffer.from('backup encryption'), 32);
  
  result = tryDecryptWithKey(keyC, header.iv, encryptedData, authTag, 'SHA256(password+salt) + encryptionloop');
  if (result) {
    writeFileSync('msgstore.db', result);
    console.log('Saved to: msgstore.db');
    process.exit(0);
  }
  
  // Method D: Try salt as the root key directly (if it's the encrypted key)
  const keyD = encryptionloop(salt, Buffer.from('backup encryption'), 32);
  
  result = tryDecryptWithKey(keyD, header.iv, encryptedData, authTag, 'salt as root key');
  if (result) {
    writeFileSync('msgstore.db', result);
    console.log('Saved to: msgstore.db');
    process.exit(0);
  }
}

// Method 2: Try different header interpretations
console.log('\nTrying different header sizes...');

for (let headerOffset = 60; headerOffset <= 200; headerOffset++) {
  const testEncData = data.slice(headerOffset, data.length - 32);
  const testAuthTag = data.slice(data.length - 32, data.length - 16);
  
  for (const salt of saltsToTry) {
    const passwordBytes = Buffer.from(password, 'utf8');
    const sha256Pass = createHash('sha256').update(passwordBytes).digest();
    const key = encryptionloop(sha256Pass, Buffer.from('backup encryption'), 32);
    
    // Try with IV at different positions
    for (let ivOffset = 0; ivOffset < headerOffset - 16; ivOffset++) {
      const testIV = data.slice(ivOffset, ivOffset + 16);
      
      const result = tryDecryptWithKey(key, testIV, testEncData, testAuthTag, `header=${headerOffset}, IV@${ivOffset}`);
      if (result) {
        writeFileSync('msgstore.db', result);
        console.log('Saved to: msgstore.db');
        process.exit(0);
      }
    }
  }
}

console.log('\n❌ All decryption attempts failed.');
console.log('\n📋 Analysis:');
console.log('For password-based E2E encrypted backups, WhatsApp stores the actual');
console.log('encryption key on their HSM servers, protected by your password.');
console.log('The password is used to RETRIEVE the key from servers, not to derive it locally.');
console.log('\nThis means we need either:');
console.log('1. The encrypted_backup.key file from your device');
console.log('2. The 64-digit hex key (if you saved it)');
console.log('3. Access to WhatsApp\'s servers (which requires the app)');
