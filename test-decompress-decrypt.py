#!/usr/bin/env python3
"""
Advanced Decryption with Decompression Analysis
===============================================
Tests if decryption + decompression produces valid SQLite
"""

import os
import zlib
import struct
import binascii
from pathlib import Path
from Cryptodome.Cipher import AES

BACKUP_DIR = "/home/katyayani/Downloads/AndroidData-20260310T103958Z-3-001/AndroidData"
ENCRYPTION_KEY = bytes.fromhex("aca75852758afeaad9c5b1ed81b889daf16b77600c028e33aebb153214ce839a")

def decrypt_file(filepath, key):
    """Decrypt file without MAC verification"""
    with open(filepath, 'rb') as f:
        data = f.read()
    
    header = data[:99]
    encrypted = data[99:-32]
    
    # Extract IV from header
    iv = header[19:35] if len(header) >= 35 else header[-16:]
    
    try:
        cipher = AES.new(key, AES.MODE_GCM, nonce=iv)
        decrypted = cipher.decrypt(encrypted)
        return decrypted
    except:
        return None

def try_decompress(data):
    """Try multiple decompression methods"""
    results = []
    
    # Try zlib (standard)
    try:
        decompressed = zlib.decompress(data)
        results.append(("zlib", decompressed))
    except:
        pass
    
    # Try raw deflate (no header)
    try:
        decompressed = zlib.decompress(data, -zlib.MAX_WBITS)
        results.append(("raw_deflate", decompressed))
    except:
        pass
    
    # Try different window sizes
    for wbits in [15, 16, 32]:
        try:
            decompressor = zlib.decompressobj(wbits)
            decompressed = decompressor.decompress(data)
            results.append((f"wbits_{wbits}", decompressed))
        except:
            pass
    
    return results

def analyze_data(data, name=""):
    """Analyze decrypted/decompressed data"""
    if not data or len(data) == 0:
        return None
    
    # Check if it's SQLite
    if data.startswith(b'SQLite format'):
        return f"✓ VALID SQLite (0x{data[:4].hex()})"
    
    if data[:4] == b'SQLi':
        return f"✓ SQLite header found (magic: {data[:4].hex()})"
    
    # Check magic bytes
    magic = data[:4]
    if magic[0:1] in [b'\x53', b'\x50', b'\x89']:  # S, P, PNG marker
        return f"? Known format (magic: {magic.hex()})"
    
    # Check entropy
    byte_freqs = {}
    for b in data[:1000]:
        byte_freqs[b] = byte_freqs.get(b, 0) + 1
    entropy = len(byte_freqs) / 256
    
    return f"Unknown (entropy: {entropy:.2f}, size: {len(data)})"

print("""
╔═══════════════════════════════════════════════════════════════╗
║         Decryption + Decompression Test                      ║
║        Testing all backup files for compression               ║
╚═══════════════════════════════════════════════════════════════╝
""")

backup_files = sorted(Path(BACKUP_DIR).glob("*.crypt15"))

for filepath in backup_files:
    fname = filepath.name
    print(f"\n{'='*70}")
    print(f"FILE: {fname}")
    print(f"{'='*70}")
    
    # Decrypt
    decrypted = decrypt_file(str(filepath), ENCRYPTION_KEY)
    if not decrypted:
        print("❌ Decryption failed")
        continue
    
    print(f"✓ Decrypted: {len(decrypted)} bytes")
    print(f"  First bytes: {decrypted[:16].hex()}")
    print(f"  Analysis: {analyze_data(decrypted)}")
    
    # Try decompression
    decompressed_variants = try_decompress(decrypted)
    
    if decompressed_variants:
        print(f"\n📦 Decompression successful! ({len(decompressed_variants)} variants)")
        for i, (method, decompressed) in enumerate(decompressed_variants, 1):
            print(f"\n  Method {i}: {method}")
            print(f"    Size: {len(decompressed)} bytes")
            result = analyze_data(decompressed)
            print(f"    {result}")
            
            # If SQLite found, save it
            if "SQLite" in str(result) or "SQLi" in str(result):
                outfile = f"/home/katyayani/Desktop/whatsapp_backup/whatsapp-backup-monitor/decrypted_{fname.replace('.crypt15', '')}_{method}.db"
                with open(outfile, 'wb') as f:
                    f.write(decompressed)
                print(f"    ✓ Saved to: {Path(outfile).name}")
    else:
        print(f"❌ No decompression method worked")
    
    # Also try analyzing raw decrypted
    if decrypted.startswith(b'SQLite'):
        outfile = f"/home/katyayani/Desktop/whatsapp_backup/whatsapp-backup-monitor/decrypted_{fname.replace('.crypt15', '')}_raw.db"
        with open(outfile, 'wb') as f:
            f.write(decrypted)
        print(f"✓ RAW SQLite saved to: {Path(outfile).name}")

print(f"\n{'='*70}")
print("Done! Check for any .db files generated.")
print(f"{'='*70}")
