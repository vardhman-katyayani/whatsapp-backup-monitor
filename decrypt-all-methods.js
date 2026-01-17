import { readFileSync, writeFileSync } from 'fs';
import { createDecipheriv, createHmac } from 'crypto';
import { inflateSync } from 'zlib';

console.log('🔓 Trying ALL decryption methods\n');

// The 64-digit hex key
const hexKey = '706ded8a9699c258dd3d441dacf1e98c4ca86358d5f3f21a8b766ec0bbbe6385';
const rootKey = Buffer.from(hexKey, 'hex');

// encryptionloop from wa-crypt-tools
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

// Keys to try
const keysToTry = [
  { name: 'rootKey direct', key: rootKey },
  { name: 'encryptionloop(backup encryption)', key: encryptionloop(rootKey, Buffer.from('backup encryption'), 32) },
  { name: 'encryptionloop(null)', key: encryptionloop(rootKey, null, 32) },
  { name: 'encryptionloop(empty)', key: encryptionloop(rootKey, Buffer.alloc(0), 32) },
];

// Files to try
const files = ['msgstore.db.crypt15'];

for (const file of files) {
  console.log(`\n📁 Processing: ${file}`);
  
  const data = readFileSync(file);
  
  // Parse header
  let headerEnd = data[0] + 1;
  if (data[1] === 0x01) headerEnd++;
  headerEnd += data[0] - (data[1] === 0x01 ? 0 : 1);
  
  // Recalculate header properly
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
  
  console.log(`  Header: ${headerEnd} bytes, IV: ${iv.toString('hex')}`);
  
  // Trailer configurations
  const trailers = [
    { name: '32-byte (tag+checksum)', size: 32, tagOffset: 0 },
    { name: '16-byte (tag only)', size: 16, tagOffset: 0 },
  ];
  
  for (const keyInfo of keysToTry) {
    for (const trailer of trailers) {
      const encData = data.slice(headerEnd, data.length - trailer.size);
      const authTag = data.slice(data.length - trailer.size + trailer.tagOffset, data.length - trailer.size + trailer.tagOffset + 16);
      
      for (const ivLen of [12, 16]) {
        const testIV = iv.slice(0, ivLen);
        
        try {
          const decipher = createDecipheriv('aes-256-gcm', keyInfo.key, testIV);
          decipher.setAuthTag(authTag);
          let dec = Buffer.concat([decipher.update(encData), decipher.final()]);
          
          // Decompress if needed
          if (dec[0] === 0x78) {
            try { dec = inflateSync(dec); } catch (e) {}
          }
          
          if (dec.slice(0, 15).toString('ascii') === 'SQLite format 3') {
            console.log(`\n🎉 SUCCESS!`);
            console.log(`  Key: ${keyInfo.name}`);
            console.log(`  Trailer: ${trailer.name}`);
            console.log(`  IV length: ${ivLen}`);
            writeFileSync('msgstore.db', dec);
            console.log(`  Saved: msgstore.db (${(dec.length/1024/1024).toFixed(2)} MB)`);
            process.exit(0);
          }
        } catch (e) {
          // Continue
        }
      }
    }
  }
}

console.log('\n❌ No method worked.');
console.log('\nThis backup was likely created BEFORE you switched to the 64-digit key.');
console.log('Please create a NEW backup in WhatsApp right now, then copy it here.');
