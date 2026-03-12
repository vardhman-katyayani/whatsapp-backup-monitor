#!/usr/bin/env python3
"""
Test with wa-crypt-tools library (official WhatsApp backup tool)
This uses the correct implementation from wa-crypt-tools
"""

import sys
from pathlib import Path

try:
    from wa_crypt_tools.crypt_tools import CryptTools
    from wa_crypt_tools.crypto import AESCipher
except ImportError:
    print("❌ wa-crypt-tools not installed")
    print("Install with: pip install wa-crypt-tools")
    sys.exit(1)

BACKUP_DIR = "/home/katyayani/Downloads/AndroidData-20260310T103958Z-3-001/AndroidData"
ENCRYPTION_KEY = "aca75852758afeaad9c5b1ed81b889daf16b77600c028e33aebb153214ce839a"

print("""
╔═══════════════════════════════════════════════════════════════╗
║     Testing with Official wa-crypt-tools Library              ║
║    (Correct WhatsApp Backup Decryption Implementation)        ║
╚═══════════════════════════════════════════════════════════════╝
""")

print(f"Key: {ENCRYPTION_KEY}")
print(f"Backup Directory: {BACKUP_DIR}\n")

backup_files = sorted(Path(BACKUP_DIR).glob("*.crypt15"))

print(f"Found {len(backup_files)} backup files:\n")

success_count = 0

for filepath in backup_files:
    fname = filepath.name
    print(f"{'='*70}")
    print(f"Testing: {fname}")
    print(f"{'='*70}")
    
    try:
        # Use CryptTools directly
        ct = CryptTools()
        
        # Read the backup file
        with open(str(filepath), 'rb') as f:
            backup_data = f.read()
        
        print(f"File size: {len(backup_data)} bytes")
        
        # Try to decrypt using the key
        # wa-crypt-tools expects the key as hex string
        try:
            decrypted = ct.decrypt(backup_data, ENCRYPTION_KEY.encode(), backup_data[:99])
            
            print(f"✓ Decryption successful: {len(decrypted)} bytes")
            
            # Check if it's SQLite
            if decrypted.startswith(b'SQLite format 3'):
                print(f"✓✓✓ VALID SQLite DATABASE! ✓✓✓")
                success_count += 1
                
                # Save it
                outfile = fname.replace('.crypt15', '.db')
                outpath = filepath.parent / outfile
                with open(outpath, 'wb') as f:
                    f.write(decrypted)
                print(f"✓ Saved to: {outfile}")
            elif decrypted.startswith(b'SQLite'):
                print(f"✓ SQLite database found (different header)")
                success_count += 1
            else:
                print(f"? Decrypted but not SQLite")
                print(f"  First bytes: {decrypted[:20].hex()}")
                
        except Exception as e:
            print(f"❌ Decryption error: {str(e)}")
            
    except Exception as e:
        print(f"❌ Failed: {str(e)}")
    
    print()

print(f"\n{'='*70}")
print(f"SUMMARY: {success_count}/{len(backup_files)} files with valid SQLite")
print(f"{'='*70}")

if success_count > 0:
    print("✓✓✓ KEY IS VALID! Files decrypted successfully! ✓✓✓")
else:
    print("If still failing, the issue might be:")
    print("1. Key format (needs to be hex string, not bytes)")
    print("2. Key derivation (might need PBKDF2)")
    print("3. Different backup format than expected")
