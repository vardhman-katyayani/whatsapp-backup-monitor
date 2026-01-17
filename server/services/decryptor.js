import { createDecipheriv, createHmac } from 'crypto';
import { inflateSync } from 'zlib';

/**
 * WhatsApp Crypt15 Decryptor
 * Decrypts WhatsApp backup files using the 64-digit hex key
 */

// ============================================
// Key Derivation (wa-crypt-tools encryptionloop)
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
// Parse Backup Header
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
  
  return { headerSize: offset, iv, protobufData };
}

// ============================================
// Main Decryption Function
// ============================================
export async function decryptBackup(encryptedBuffer, keyHex) {
  const startTime = Date.now();
  
  // Validate inputs
  if (!encryptedBuffer || encryptedBuffer.length < 100) {
    throw new Error('Invalid backup file: too small');
  }
  
  if (!keyHex || keyHex.length !== 64) {
    throw new Error('Invalid key: must be 64-character hex string');
  }
  
  // Convert key from hex
  const rootKey = Buffer.from(keyHex, 'hex');
  
  // Derive encryption key
  const encryptionKey = encryptionloop(rootKey, Buffer.from('backup encryption'), 32);
  
  // Parse header
  const header = parseHeader(encryptedBuffer);
  
  if (!header.iv) {
    throw new Error('Could not find IV in backup header');
  }
  
  // Extract encrypted data and auth tag
  const encryptedData = encryptedBuffer.slice(header.headerSize, encryptedBuffer.length - 32);
  const authTag = encryptedBuffer.slice(encryptedBuffer.length - 32, encryptedBuffer.length - 16);
  
  // Decrypt using AES-256-GCM
  const iv12 = header.iv.slice(0, 12);
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, iv12);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedData);
  let final = decipher.final();
  let result = Buffer.concat([decrypted, final]);
  
  // Decompress if zlib compressed
  if (result[0] === 0x78) {
    result = inflateSync(result);
  }
  
  // Verify SQLite header
  const sqliteHeader = result.slice(0, 15).toString('ascii');
  if (sqliteHeader !== 'SQLite format 3') {
    throw new Error('Decryption failed: result is not a valid SQLite database');
  }
  
  const duration = Date.now() - startTime;
  
  return {
    database: result,
    stats: {
      originalSize: encryptedBuffer.length,
      decryptedSize: result.length,
      durationMs: duration
    }
  };
}

export default { decryptBackup };
