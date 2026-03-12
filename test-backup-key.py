#!/usr/bin/env python3

"""
WhatsApp Backup Encryption Key Test
Tests if the provided encryption key works for the backup directory
"""

import os
import sys
import io
import zlib
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Import wa-crypt-tools
try:
    from wa_crypt_tools.lib.key.key15 import Key15
    from wa_crypt_tools.lib.db.db15 import Database15
    from Cryptodome.Cipher import AES
except ImportError:
    print("❌ wa-crypt-tools not installed!")
    print("Install with: pip install wa-crypt-tools pycryptodomex")
    sys.exit(1)


class BackupKeyTest:
    """Test if encryption key works for backup"""
    
    def __init__(self, backup_dir, encryption_key_hex):
        self.backup_dir = Path(backup_dir)
        self.encryption_key_hex = encryption_key_hex
        self.success_count = 0
        self.fail_count = 0
        self.results = []
    
    def test_file(self, file_path):
        """Test decryption of a single file"""
        
        try:
            # Read encrypted file
            with open(file_path, 'rb') as f:
                encrypted_data = f.read()
            
            # Initialize key
            key_bytes = bytes.fromhex(self.encryption_key_hex)
            key15 = Key15(keyarray=key_bytes)
            
            # Parse header
            encrypted_stream = io.BufferedReader(io.BytesIO(encrypted_data))
            db = Database15(key=key15, encrypted=encrypted_stream)
            
            # Get IV
            iv = db.header.c15_iv.IV
            
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
                
                # Check for zlib compression
                if decrypted[0:1] == b'\x78':
                    decrypted = zlib.decompress(decrypted)
                
                # Check if SQLite
                is_sqlite = decrypted[:13] == b'SQLite format'
                
                self.success_count += 1
                self.results.append({
                    'file': file_path.name,
                    'size': len(decrypted),
                    'status': 'SUCCESS ✅',
                    'is_sqlite': is_sqlite
                })
                return True
                
            except ValueError as e:
                self.fail_count += 1
                self.results.append({
                    'file': file_path.name,
                    'size': len(encrypted_data),
                    'status': f'FAILED ❌ - {str(e)}',
                    'is_sqlite': False
                })
                return False
                
        except Exception as e:
            self.fail_count += 1
            self.results.append({
                'file': file_path.name,
                'size': 0,
                'status': f'ERROR ❌ - {str(e)}',
                'is_sqlite': False
            })
            return False
    
    def run(self):
        """Main test execution"""
        
        # Check backup directory
        if not self.backup_dir.exists():
            print(f"\n❌ ERROR: Backup directory not found!")
            print(f"   Path: {self.backup_dir}")
            return False
        
        # Find backup files
        backup_files = sorted(self.backup_dir.glob("*.crypt15"))
        
        if not backup_files:
            print(f"\n❌ ERROR: No .crypt15 files found!")
            print(f"   Directory: {self.backup_dir}")
            return False
        
        # Print header
        print(f"""
╔════════════════════════════════════════════════════════════════╗
║         WhatsApp Backup Encryption Key Test                     ║
╚════════════════════════════════════════════════════════════════╝

📁 Backup Directory: {self.backup_dir}
🔑 Encryption Key:   {self.encryption_key_hex[:32]}...{self.encryption_key_hex[-8:]}

📊 Found {len(backup_files)} backup files:
""")
        
        for i, f in enumerate(backup_files, 1):
            size_kb = f.stat().st_size / 1024
            print(f"   {i}. {f.name} ({size_kb:.2f} KB)")
        
        # Test each file
        print(f"\n{'='*64}")
        print(f"🔐 Testing Decryption with Provided Key")
        print('='*64 + '\n')
        
        for file_path in backup_files:
            print(f"Testing: {file_path.name}...", end=" ")
            success = self.test_file(file_path)
            status = "✅ OK" if success else "❌ FAIL"
            print(status)
        
        # Print results
        self.print_summary()
        
        return self.success_count > 0
    
    def print_summary(self):
        """Print test summary"""
        
        print(f"\n{'='*64}")
        print(f"📋 TEST RESULTS")
        print('='*64 + '\n')
        
        for result in self.results:
            status_msg = result['status']
            file_name = result['file']
            size = result['size']
            
            if result['is_sqlite']:
                status_msg += " [SQLite]"
            
            print(f"{file_name:40} {status_msg} ({size} bytes)")
        
        print(f"\n{'='*64}")
        print(f"📊 SUMMARY")
        print('='*64)
        print(f"Total Files:      {self.success_count + self.fail_count}")
        print(f"Successful:       {self.success_count} ✅")
        print(f"Failed:           {self.fail_count} ❌")
        
        print(f"\n{'='*64}")
        
        if self.success_count > 0:
            print(f"✅ KEY IS WORKING! ({self.success_count}/{self.success_count + self.fail_count} files decrypted)")
            print(f"   You can use this key to decrypt your backups")
        else:
            print(f"❌ KEY IS NOT WORKING! (0/{self.fail_count} files decrypted)")
            print(f"   The provided encryption key does NOT match this backup")
            print(f"\n   Possible causes:")
            print(f"   1. Key is incorrect or from a different phone")
            print(f"   2. Key was changed after the backup was created")
            print(f"   3. Backup is from a different encryption root key")
        
        print(f"{'='*64}\n")


def main():
    # Configuration
    backup_dir = "/home/katyayani/Downloads/AndroidData-20260310T103958Z-3-001/AndroidData"
    encryption_key = "aca75852758afeaad9c5b1ed81b889daf16b77600c028e33aebb153214ce839a"
    
    try:
        tester = BackupKeyTest(backup_dir, encryption_key)
        success = tester.run()
        
        # Exit with appropriate code
        sys.exit(0 if success else 1)
        
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
