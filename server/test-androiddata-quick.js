#!/usr/bin/env node

/**
 * Quick Decrypt Test — AndroidData-20260310T103958Z-3-001
 * Uses hardcoded key directly (no Supabase / .env needed)
 *
 * Tries multiple decryption strategies to find what works.
 *
 * Usage: node test-androiddata-quick.js
 */

import fs from 'fs';
import path from 'path';
import { createDecipheriv, createHmac } from 'crypto';
import { inflateSync } from 'zlib';

const BACKUP_DIR = '/home/katyayani/Downloads/AndroidData-20260310T103958Z-3-001/AndroidData';
const KEY_HEX   = 'aca75852758afeaad9c5b1ed81b889daf16b77600c028e33aebb153214ce839a';
const OUTPUT_DIR = path.join(process.cwd(), 'decrypted_output');

// ─── Key derivation (wa-crypt-tools encryptionloop) ──────────────────────────
function encryptionloop(firstIterationData, message, outputBytes) {
  const seed = Buffer.alloc(32, 0);
  const privateKey = createHmac('sha256', seed).update(firstIterationData).digest();
  let dataBlock = Buffer.alloc(0);
  let output    = Buffer.alloc(0);
  const rounds  = Math.ceil(outputBytes / 32);
  for (let i = 1; i <= rounds; i++) {
    const h = createHmac('sha256', privateKey);
    h.update(dataBlock);
    if (message) h.update(message);
    h.update(Buffer.from([i]));
    dataBlock = h.digest();
    output = Buffer.concat([output, dataBlock.slice(0, Math.min(outputBytes - output.length, 32))]);
  }
  return output;
}

// ─── Header parser ────────────────────────────────────────────────────────────
function parseHeader(data) {
  const protobufSize = data[0];
  let offset = 1;
  if (data[offset] === 0x01) offset++;
  const protobufData = data.slice(offset, offset + protobufSize);
  offset += protobufSize;

  let iv = null;
  for (let i = 0; i < protobufData.length - 17; i++) {
    if (protobufData[i] === 0x0a && protobufData[i + 1] === 0x10) {
      iv = protobufData.slice(i + 2, i + 18);
      break;
    }
  }
  return { headerSize: offset, iv };
}

// ─── Single attempt helper ────────────────────────────────────────────────────
function tryDecrypt(encKey, iv, ciphertext, authTag) {
  try {
    const d = createDecipheriv('aes-256-gcm', encKey, iv);
    d.setAuthTag(authTag);
    let out = Buffer.concat([d.update(ciphertext), d.final()]);
    if (out[0] === 0x78) {
      try { out = inflateSync(out); } catch (_) {}
    }
    return out;
  } catch (_) {
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n========================================');
  console.log('  WhatsApp Crypt15 Decryption Test');
  console.log('========================================\n');
  console.log(`🔑 Key (64 chars): ${KEY_HEX.slice(0,8)}...${KEY_HEX.slice(-8)}`);
  console.log(`📁 Dir: ${BACKUP_DIR}\n`);

  if (!fs.existsSync(BACKUP_DIR)) {
    console.error(`❌ Directory not found: ${BACKUP_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.crypt15')).sort();
  if (!files.length) { console.error('❌ No .crypt15 files found'); process.exit(1); }

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Pre-derive both key variants
  const rootKey    = Buffer.from(KEY_HEX, 'hex');
  const derivedKey = encryptionloop(rootKey, Buffer.from('backup encryption'), 32);

  console.log(`🔐 Root key    : ${rootKey.toString('hex')}`);
  console.log(`🔐 Derived key : ${derivedKey.toString('hex')}\n`);

  let passed = 0, failed = 0;

  for (const filename of files) {
    const filePath = path.join(BACKUP_DIR, filename);
    const baseName = filename.replace('.crypt15', '');
    const outPath  = path.join(OUTPUT_DIR, baseName);
    const data     = fs.readFileSync(filePath);

    process.stdout.write(`   ${filename.padEnd(42)}`);

    const { headerSize, iv } = parseHeader(data);
    if (!iv) { console.log('❌ Could not find IV in header'); failed++; continue; }

    let success = false;

    // Try all combinations: {rootKey, derivedKey} × {IV 12-byte, 16-byte} × {trailer 16, 32 bytes}
    outer:
    for (const encKey of [derivedKey, rootKey]) {
      for (const ivLen of [12, 16]) {
        const testIV = iv.slice(0, ivLen);
        for (const trailerLen of [16, 32]) {
          for (const tagOffset of trailerLen === 32 ? [0, 16] : [0]) {
            const ciphertext = data.slice(headerSize, data.length - trailerLen);
            const authTag    = data.slice(
              data.length - trailerLen + tagOffset,
              data.length - trailerLen + tagOffset + 16
            );

            const t0  = Date.now();
            const out = tryDecrypt(encKey, testIV, ciphertext, authTag);

            if (out && out.slice(0, 15).toString('ascii') === 'SQLite format 3') {
              const ms  = Date.now() - t0;
              const kLabel = encKey === derivedKey ? 'derived' : 'raw';
              fs.writeFileSync(outPath, out);
              console.log(`✅ OK  ${(out.length/1024).toFixed(0)} KB, ${ms}ms  [key=${kLabel} iv=${ivLen}B trailer=${trailerLen}B tag@${tagOffset}]`);
              passed++;
              success = true;
              break outer;
            }
          }
        }
      }
    }

    if (!success) {
      console.log(`❌ FAIL  — GCM auth tag never matched (key may be wrong)`);
      failed++;
    }
  }

  console.log('\n========================================');
  console.log(`  Results : ${passed} passed / ${failed} failed`);
  if (passed > 0) console.log(`  Output  : ${OUTPUT_DIR}`);
  console.log('========================================\n');

  if (failed === 0) {
    console.log('✅ DECRYPTION WORKING — Key is correct!\n');
  } else if (passed === 0) {
    console.log('❌ DECRYPTION FAILED — Key is wrong or files are corrupted.\n');
    console.log('   Verify the 64-hex key matches the phone that created this backup.\n');
  } else {
    console.log(`⚠️  PARTIAL SUCCESS — ${passed}/${files.length} files decrypted.\n`);
  }

  process.exit(failed === files.length ? 1 : 0);
}

main().catch(err => { console.error('\n❌ Fatal:', err.message); process.exit(1); });
