#!/usr/bin/env python3

"""
Test decryption with provided encryption key for Priya Mishra's backup
Python version using wa-crypt-tools for comparison
"""

import os
import sys
import io
import zlib
from pathlib import Path
from dotenv import load_dotenv

# Load environment
load_dotenv()

# Import wa-crypt-tools
try:
    from wa_crypt_tools.lib.key.key15 import Key15
    from wa_crypt_tools.lib.db.db15 import Database15
    from Cryptodome.Cipher import AES
except ImportError:
    print("❌ wa-crypt-tools not installed!")
    sys.exit(1)


class DecryptionTesterPython:
    """Test decryption with provided encryption key"""
    
    def __init__(self, encryption_key_hex, phone_name):
        self.encryption_key_hex = encryption_key_hex
        self.phone_name = phone_name
        self.backup_dir = Path("/home/katyayani/Downloads/AndroidData-20260310T103958Z-3-001/AndroidData")
    
    def test_file(self, file_path):
        """Test decryption of a single file"""
        
        print(f"\n🔓 Testing: {file_path.name}")
        
        try:
            # Read encrypted file
            with open(file_path, 'rb') as f:
                encrypted_data = f.read()
            
            print(f"   File size: {len(encrypted_data) / 1024:.2f} KB")
            
            # Initialize key
            key_bytes = bytes.fromhex(self.encryption_key_hex)
            key15 = Key15(keyarray=key_bytes)
            
            # Parse header
            encrypted_stream = io.BufferedReader(io.BytesIO(encrypted_data))
            db = Database15(key=key15, encrypted=encrypted_stream)
            
            # Get IV
            iv = db.header.c15_iv.IV
            print(f"   IV: {iv.hex()}")
            
            # Extract components
            checksum = encrypted_data[-16:]
            auth_tag = encrypted_data[-32:-16]
            encrypted_payload = encrypted_data[:-32]
            
            # Try decryption
            encryption_key = key15.get()
            cipher = AES.new(encryption_key, AES.MODE_GCM, iv[:12])
            
            decrypted = cipher.decrypt(encrypted_payload)
            
            try:
                cipher.verify(auth_tag)
                
                # Check for zlib
                if decrypted[0:1] == b'\x78':
                    decrypted = zlib.decompress(decrypted)
                    print(f"   ✓ Decompressed to {len(decrypted) / 1024:.2f} KB")
                
                # Check if SQLite
                if decrypted[:13] == b'SQLite format':
                    print(f"   ✅ DECRYPTION SUCCESS - Valid SQLite!")
                    return True
                else:
                    print(f"   ✅ DECRYPTION SUCCESS - {len(decrypted)} bytes")
                    print(f"   First bytes: {decrypted[:16].hex()}")
                    return True
                    
            except ValueError as e:
                print(f"   ❌ Auth tag failed: {e}")
                return False
                
        except Exception as e:
            print(f"   ❌ Error: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def run(self):
        """Main execution"""
        
        print(f"""
╔═══════════════════════════════════════════════════════════════╗
║     Encryption Key Decryption Tester (Python + wa-crypt-tools) ║
║           Testing provided encryption key                      ║
╚═══════════════════════════════════════════════════════════════╝""")
        
        print(f"\n👤 Name: {self.phone_name}")
        print(f"🔑 Key: {self.encryption_key_hex[:32]}...{self.encryption_key_hex[-8:]}")
        
        # Check backup dir
        if not self.backup_dir.exists():
            print(f"❌ Backup directory not found: {self.backup_dir}")
            return
        
        # Find files
        backup_files = sorted(self.backup_dir.glob("*.crypt15"))
        
        if not backup_files:
            print(f"❌ No .crypt15 files found")
            return
        
        print(f"\n📁 Found {len(backup_files)} backup files:")
        for i, f in enumerate(backup_files, 1):
            size = f.stat().st_size / 1024
            print(f"   {i}. {f.name} - {size:.2f} KB")
        
        # Test decryption
        print(f"\n{'='*70}")
        print(f"🔑 Testing Encryption Key with wa-crypt-tools")
        print('='*70)
        
        results = []
        for file_path in backup_files:
            success = self.test_file(file_path)
            if success:
                results.append(file_path.name)
        
        # Summary
        print(f"\n\n╔═══════════════════════════════════════════════════════════════╗")
        print(f"║                    TEST SUMMARY                               ║")
        print(f"╠═══════════════════════════════════════════════════════════════╣")
        
        if results:
            print(f"║  ✅ Successfully decrypted {len(results)} file(s)!                    ║")
            print(f"║                                                               ║")
            for fname in results:
                print(f"║     ✓ {fname.ljust(58)} ║")
            print(f"║                                                               ║")
            print(f"║  🎉 KEY IS VALID!                                             ║")
        else:
            print(f"║  ❌ All decryption attempts FAILED                            ║")
            print(f"║                                                               ║")
            print(f"║  The provided key does NOT match this backup                 ║")
            print(f"║                                                               ║")
            print(f"║  Possible causes:                                             ║")
            print(f"║  1. Key is incorrect or outdated                             ║")
            print(f"║  2. Key was changed after backup creation                    ║")
            print(f"║  3. Backup is from a different encryption root key           ║")
            print(f"║                                                               ║")
            print(f"║  To get the correct key:                                     ║")
            print(f"║  1. On the phone: Settings → Chats → Chat backup             ║")
            print(f"║  2. Look for 'Encryption' section - 64 hex character key      ║")
            print(f"║  3. Or extract via ADB from WhatsApp database files          ║")
        
        print(f"╚═══════════════════════════════════════════════════════════════╝")


def main():
    encryption_key = "aca75852758afeaad9c5b1ed81b889daf16b77600c028e33aebb153214ce839a"
    phone_name = "Priya Mishra"
    
    try:
        tester = DecryptionTesterPython(encryption_key, phone_name)
        tester.run()
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
