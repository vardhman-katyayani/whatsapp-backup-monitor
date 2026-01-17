import { readFileSync, writeFileSync } from 'fs';
import { createDecipheriv, createHmac } from 'crypto';
import { inflateSync } from 'zlib';

console.log('🔓 WhatsApp Crypt15 Decryptor - Final Attempt\n');

// The 64-digit hex key from screenshot
const hexKey = '706ded8a9699c258dd3d441dacf1e98c4ca86358d5f3f21a8b766ec0bbbe6385';
const rootKey = Buffer.from(hexKey, 'hex');

console.log(`Root key: ${rootKey.toString('hex')}`);

// wa-crypt-tools encryptionloop
function encryptionloop(firstIterationData, message, outputBytes, privateSeed = Buffer.alloc(32, 0)) {
  const privateKey = createHmac('sha256', privateSeed).update(firstIterationData).digest();
  
  let dataBlock = Buffer.alloc(0);
  let output = Buffer.alloc(0);
  const permutations = Math.ceil(outputBytes / 32);
  
  for (let i = 1; i <= permutations; i++) {
    const hasher = createHmac('sha256', privateKey);
    hasher.update(dataBlock);
    if (message) hasher.update(message);
    hasher.update(Buffer.from([i]));
    dataBlock = hasher.digest();
    output = Buffer.concat([output, dataBlock.slice(0, Math.min(outputBytes - output.length, dataBlock.length))]);
  }
  return output;
}

// Derive encryption key
const encryptionKey = encryptionloop(rootKey, Buffer.from('backup encryption'), 32);
console.log(`Encryption key: ${encryptionKey.toString('hex')}\n`);

// Read backup
const data = readFileSync('msgstore.db.crypt15');
console.log(`File size: ${data.length} bytes\n`);

// Parse header
let headerEnd = 0;
const protobufSize = data[0];
headerEnd = 1;
if (data[headerEnd] === 0x01) headerEnd++;
headerEnd += protobufSize;

// Find IV
let iv = null;
for (let i = 0; i < headerEnd; i++) {
  if (data[i] === 0x0a && data[i + 1] === 0x10) {
    iv = data.slice(i + 2, i + 18);
    break;
  }
}

console.log(`Header ends at: ${headerEnd}`);
console.log(`IV: ${iv.toString('hex')}\n`);

// Try multiple decryption approaches
const attempts = [
  // Standard format: encrypted | authTag(16) | checksum(16)
  { name: 'Standard (16+16 trailer)', encEnd: -32, tagStart: -32, tagEnd: -16 },
  // Multifile format: encrypted | authTag(16)
  { name: 'Multifile (16 trailer)', encEnd: -16, tagStart: -16, tagEnd: undefined },
  // Alternative: encrypted+authTag together, checksum only
  { name: 'Embedded auth tag', encEnd: -16, tagStart: -32, tagEnd: -16 },
];

for (const attempt of attempts) {
  console.log(`Trying: ${attempt.name}`);
  
  const encryptedData = data.slice(headerEnd, attempt.encEnd);
  const authTag = attempt.tagEnd ? data.slice(attempt.tagStart, attempt.tagEnd) : data.slice(attempt.tagStart);
  
  console.log(`  Encrypted: ${encryptedData.length} bytes, AuthTag: ${authTag.length} bytes`);
  
  // Try both 12-byte and 16-byte IV
  for (const ivLen of [12, 16]) {
    const testIV = iv.slice(0, ivLen);
    
    try {
      const decipher = createDecipheriv('aes-256-gcm', encryptionKey, testIV);
      decipher.setAuthTag(authTag);
      
      let decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
      
      // Try decompression
      if (decrypted[0] === 0x78 || decrypted[0] === 0x1f) {
        try {
          decrypted = inflateSync(decrypted);
        } catch (e) {}
      }
      
      if (decrypted.slice(0, 15).toString('ascii') === 'SQLite format 3') {
        writeFileSync('msgstore.db', decrypted);
        console.log(`\n🎉🎉🎉 SUCCESS with ${attempt.name}, IV=${ivLen} bytes! 🎉🎉🎉`);
        console.log(`✅ Saved to: msgstore.db (${(decrypted.length/1024/1024).toFixed(2)} MB)`);
        process.exit(0);
      }
    } catch (e) {
      // Continue trying
    }
  }
}

// Brute force header/trailer positions
console.log('\nBrute forcing header and trailer positions...');

for (let hOffset = headerEnd - 5; hOffset <= headerEnd + 5; hOffset++) {
  for (let trailer = 16; trailer <= 48; trailer += 16) {
    const encData = data.slice(hOffset, data.length - trailer);
    
    // Try auth tag at different positions in trailer
    for (let tagOffset = 0; tagOffset <= trailer - 16; tagOffset += 16) {
      const authTag = data.slice(data.length - trailer + tagOffset, data.length - trailer + tagOffset + 16);
      
      for (const ivLen of [12, 16]) {
        const testIV = iv.slice(0, ivLen);
        
        try {
          const decipher = createDecipheriv('aes-256-gcm', encryptionKey, testIV);
          decipher.setAuthTag(authTag);
          
          let decrypted = Buffer.concat([decipher.update(encData), decipher.final()]);
          
          if (decrypted[0] === 0x78) {
            try { decrypted = inflateSync(decrypted); } catch (e) {}
          }
          
          if (decrypted.slice(0, 15).toString('ascii') === 'SQLite format 3') {
            writeFileSync('msgstore.db', decrypted);
            console.log(`\n🎉 SUCCESS! Header=${hOffset}, Trailer=${trailer}, TagOffset=${tagOffset}, IV=${ivLen}`);
            console.log(`✅ Saved to: msgstore.db`);
            process.exit(0);
          }
        } catch (e) {}
      }
    }
  }
}

console.log('\n❌ All attempts failed. The key might be for a different backup file.');
console.log('Make sure you are using a backup created AFTER setting this 64-digit key.');
