import { readFileSync } from 'fs';
import { pbkdf2Sync, createDecipheriv, createHash, hkdfSync } from 'crypto';

const filePath = 'msgstore.db.crypt15';
const password = 'test@123';

console.log('🔍 Deep Analysis of WhatsApp Crypt15 Backup\n');

const data = readFileSync(filePath);
console.log(`File size: ${(data.length / 1024 / 1024).toFixed(2)} MB`);

// Print first 128 bytes in hex
console.log('\nFirst 128 bytes (hex):');
for (let i = 0; i < 128; i += 16) {
  const hex = data.slice(i, i + 16).toString('hex').match(/.{2}/g).join(' ');
  const ascii = data.slice(i, i + 16).toString('ascii').replace(/[^\x20-\x7E]/g, '.');
  console.log(`${i.toString(16).padStart(4, '0')}: ${hex}  ${ascii}`);
}

// Analyze as protobuf-like structure
console.log('\n📋 Parsing header as protobuf:');

let offset = 0;
const parseVarint = (buf, start) => {
  let result = 0;
  let shift = 0;
  let pos = start;
  while (pos < buf.length) {
    const byte = buf[pos];
    result |= (byte & 0x7f) << shift;
    pos++;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  return { value: result, nextPos: pos };
};

// Parse protobuf fields
const parseProto = (buf, maxLen = 100) => {
  let pos = 0;
  const fields = [];
  while (pos < Math.min(buf.length, maxLen)) {
    const tag = buf[pos];
    const fieldNum = tag >> 3;
    const wireType = tag & 0x7;
    pos++;
    
    if (wireType === 0) { // Varint
      const { value, nextPos } = parseVarint(buf, pos);
      fields.push({ field: fieldNum, type: 'varint', value, pos: pos - 1 });
      pos = nextPos;
    } else if (wireType === 2) { // Length-delimited
      const { value: len, nextPos } = parseVarint(buf, pos);
      const content = buf.slice(nextPos, nextPos + len);
      fields.push({ field: fieldNum, type: 'bytes', length: len, hex: content.toString('hex'), pos: pos - 1 });
      pos = nextPos + len;
    } else {
      break; // Unknown wire type
    }
  }
  return { fields, endPos: pos };
};

const { fields, endPos } = parseProto(data);
console.log('Parsed fields:');
fields.forEach(f => {
  if (f.type === 'varint') {
    console.log(`  Field ${f.field}: ${f.value} (varint)`);
  } else {
    console.log(`  Field ${f.field}: ${f.length} bytes - ${f.hex.substring(0, 64)}${f.hex.length > 64 ? '...' : ''}`);
  }
});
console.log(`Header ends at byte: ${endPos}`);

// Extract potential crypto parameters from parsed fields
console.log('\n🔑 Extracting crypto parameters:');

// Look for 16-byte fields (likely IV or salt)
const byteFields = fields.filter(f => f.type === 'bytes');
const potential16ByteFields = byteFields.filter(f => f.length === 16);
const potential32ByteFields = byteFields.filter(f => f.length === 32);

console.log(`Found ${potential16ByteFields.length} 16-byte fields (potential IV/salt)`);
console.log(`Found ${potential32ByteFields.length} 32-byte fields (potential key)`);

// Find the encrypted data start
let encryptedStart = endPos;
// WhatsApp typically has a header structure, let's find where encrypted data begins
// Look for a large blob after the header

console.log(`\nEncrypted data starts at byte: ${encryptedStart}`);
console.log(`Encrypted data size: ${data.length - encryptedStart} bytes`);

// Try to find the server salt (usually first 16-byte field in nested structure)
let serverSalt = null;
let iv = null;

for (const field of byteFields) {
  if (field.length >= 16) {
    const nested = parseProto(Buffer.from(field.hex, 'hex'));
    if (nested.fields.length > 0) {
      for (const nf of nested.fields) {
        if (nf.type === 'bytes' && nf.length === 16 && !serverSalt) {
          serverSalt = Buffer.from(nf.hex, 'hex');
          console.log(`\nFound nested 16-byte field (potential server salt): ${nf.hex}`);
        }
      }
    }
  }
}

// The structure seems to be:
// - Protobuf header with version info
// - Server salt embedded
// - IV at some offset
// - Then encrypted data

// Try to extract IV (usually after server salt in header)
// Looking at common crypt15 structure: the IV is often at a fixed offset

// Let's try different header interpretations
console.log('\n🔓 Attempting decryption with different header interpretations:\n');

const tryDecrypt = (key, ivBytes, encData, label) => {
  try {
    // Try GCM
    const authTag = encData.slice(encData.length - 16);
    const ciphertext = encData.slice(0, encData.length - 16);
    
    const decipher = createDecipheriv('aes-256-gcm', key, ivBytes);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertext);
    let final = decipher.final();
    const result = Buffer.concat([decrypted, final]);
    
    if (result.slice(0, 15).toString('ascii') === 'SQLite format 3') {
      console.log(`✅ SUCCESS with ${label}!`);
      return result;
    }
  } catch (e) {
    // Ignore
  }
  return null;
};

// Method 1: WhatsApp uses HKDF to derive the final key
// Password -> PBKDF2 -> intermediate key -> HKDF -> final key
console.log('Testing HKDF-based key derivation...');

for (const saltField of byteFields) {
  if (saltField.length !== 16) continue;
  
  const salt = Buffer.from(saltField.hex, 'hex');
  
  // Try PBKDF2 + HKDF
  const iterations = [16384, 10000, 100000];
  const hashes = ['sha256', 'sha512'];
  
  for (const iter of iterations) {
    for (const hash of hashes) {
      try {
        // Step 1: PBKDF2
        const intermediate = pbkdf2Sync(password, salt, iter, 32, hash);
        
        // Step 2: HKDF expand
        const info = Buffer.from('backup encryption\x01', 'utf8');
        const hkdfKey = hkdfSync('sha256', intermediate, salt, info, 32);
        
        // Try with different IVs from the header
        for (let ivOffset = 0; ivOffset < 80; ivOffset++) {
          const testIV = data.slice(ivOffset, ivOffset + 12); // GCM uses 12-byte IV
          const encData = data.slice(endPos);
          
          const result = tryDecrypt(hkdfKey, testIV, encData, `HKDF(PBKDF2-${hash}-${iter}) IV@${ivOffset}`);
          if (result) {
            require('fs').writeFileSync('msgstore.db', result);
            process.exit(0);
          }
        }
        
        // Also try 16-byte IV
        for (let ivOffset = 0; ivOffset < 80; ivOffset++) {
          const testIV = data.slice(ivOffset, ivOffset + 16);
          const encData = data.slice(endPos);
          
          const result = tryDecrypt(intermediate, testIV, encData, `PBKDF2-${hash}-${iter} IV@${ivOffset}`);
          if (result) {
            require('fs').writeFileSync('msgstore.db', result);
            process.exit(0);
          }
        }
      } catch (e) {
        // Continue
      }
    }
  }
}

// Method 2: Direct password hash methods
console.log('Testing direct hash methods...');

const passwordBytes = Buffer.from(password, 'utf8');
const sha256Pass = createHash('sha256').update(passwordBytes).digest();
const sha512Pass = createHash('sha512').update(passwordBytes).digest().slice(0, 32);

for (let ivOffset = 0; ivOffset < 80; ivOffset++) {
  const testIV = data.slice(ivOffset, ivOffset + 12);
  const encData = data.slice(endPos);
  
  let result = tryDecrypt(sha256Pass, testIV, encData, `SHA256(password) IV@${ivOffset}`);
  if (result) {
    require('fs').writeFileSync('msgstore.db', result);
    process.exit(0);
  }
  
  result = tryDecrypt(sha512Pass, testIV, encData, `SHA512(password) IV@${ivOffset}`);
  if (result) {
    require('fs').writeFileSync('msgstore.db', result);
    process.exit(0);
  }
}

// Method 3: Try all possible header offsets
console.log('Brute-forcing header offsets...');

for (let headerSize = 50; headerSize < 200; headerSize++) {
  for (const saltField of byteFields) {
    if (saltField.length !== 16) continue;
    const salt = Buffer.from(saltField.hex, 'hex');
    const key = pbkdf2Sync(password, salt, 16384, 32, 'sha256');
    
    for (let ivOffset = 0; ivOffset < headerSize; ivOffset++) {
      const testIV = data.slice(ivOffset, ivOffset + 12);
      const encData = data.slice(headerSize);
      
      const result = tryDecrypt(key, testIV, encData, `HeaderSize=${headerSize} IV@${ivOffset}`);
      if (result) {
        require('fs').writeFileSync('msgstore.db', result);
        console.log(`\n🎉 CRACKED! Header size: ${headerSize}, IV offset: ${ivOffset}`);
        process.exit(0);
      }
    }
  }
}

console.log('\n❌ Standard methods failed. Trying wa-crypt-tools algorithm...');
