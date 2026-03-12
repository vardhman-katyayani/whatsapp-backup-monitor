#!/usr/bin/env python3
"""
Test the key from key.txt file
"""

import os
import binascii
from pathlib import Path
from Cryptodome.Cipher import AES

BACKUP_DIR = "/home/katyayani/Downloads/AndroidData-20260310T103958Z-3-001/AndroidData"

# Key from key.txt
ENCRYPTION_KEY = bytes.fromhex("706ded8a9699c258dd3d441dacf1e98c4ca86358d5f3f21a8b766ec0bbbe6385")

def decrypt_file(filepath, key):
    """Decrypt file"""
    with open(filepath, 'rb') as f:
        data = f.read()
    
    header = data[:99]
    encrypted = data[99:-32]
    auth_tag = data[-16:]
    
    # Extract IV
    iv = header[19:35] if len(header) >= 35 else header[-16:]
    
    print(f"\n  IV: {binascii.hexlify(iv).decode()}")
    print(f"  Auth Tag: {binascii.hexlify(auth_tag).decode()}")
    
    # Try with strict authentication
    try:
        cipher = AES.new(key, AES.MODE_GCM, nonce=iv)
        decrypted = cipher.decrypt_and_verify(encrypted, auth_tag)
        return decrypted, "✓ VERIFIED"
    except Exception as e:
        if "MAC" in str(e):
            # Try without auth
            try:
                cipher = AES.new(key, AES.MODE_GCM, nonce=iv)
                decrypted = cipher.decrypt(encrypted)
                return decrypted, f"⚠ Decrypted (no auth): {str(e)}"
            except:
                return None, f"❌ FAILED: {str(e)}"
        return None, f"❌ FAILED: {str(e)}"

print("""
╔═══════════════════════════════════════════════════════════════╗
║          Testing Key from key.txt                             ║
╚═══════════════════════════════════════════════════════════════╝
""")

print(f"Key: 706ded8a9699c258dd3d441dacf1e98c4ca86358d5f3f21a8b766ec0bbbe6385")
print(f"Backup: {BACKUP_DIR}\n")

backup_files = sorted(Path(BACKUP_DIR).glob("*.crypt15"))

success_count = 0
for filepath in backup_files:
    fname = filepath.name
    print(f"Testing: {fname}")
    
    decrypted, status = decrypt_file(str(filepath), ENCRYPTION_KEY)
    print(f"  {status}")
    
    if decrypted:
        print(f"  Size: {len(decrypted)} bytes")
        
        # Check for SQLite
        if decrypted.startswith(b'SQLite'):
            print(f"  ✓✓✓ SQLite FOUND! ✓✓✓")
            success_count += 1
        else:
            print(f"  First bytes: {decrypted[:8].hex()}")
    
print(f"\n{'='*70}")
print(f"Results: {success_count}/{len(backup_files)} files with valid signatures")
print(f"{'='*70}")

if success_count > 0:
    print("✓✓✓ THIS IS THE CORRECT KEY! ✓✓✓")
else:
    print("❌ This key also doesn't work")
