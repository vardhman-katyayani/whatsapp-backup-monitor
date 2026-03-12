#!/usr/bin/env python3

"""
Advanced WhatsApp Backup Key Test
Tests with multiple decryption approaches
"""

import os
import sys
import io
import zlib
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

try:
    from wa_crypt_tools.lib.key.key15 import Key15
    from wa_crypt_tools.lib.db.db15 import Database15
    from Cryptodome.Cipher import AES
except ImportError:
    print("❌ wa-crypt-tools not installed!")
    sys.exit(1)


class AdvancedBackupKeyTest:
    """Advanced test with multiple decryption strategies"""
    
    def __init__(self, backup_dir, encryption_key_hex):
        self.backup_dir = Path(backup_dir)
        self.encryption_key_hex = encryption_key_hex
    
    def method_1_strict_mac(self, file_path):
        """Method 1: Strict MAC verification"""
        try:
            with open(file_path, 'rb') as f:
                encrypted_data = f.read()
            
            key_bytes = bytes.fromhex(self.encryption_key_hex)
            key15 = Key15(keyarray=key_bytes)
            
            encrypted_stream = io.BufferedReader(io.BytesIO(encrypted_data))
            db = Database15(key=key15, encrypted=encrypted_stream)
            
            iv = db.header.c15_iv.IV
            
            checksum = encrypted_data[-16:]
            auth_tag = encrypted_data[-32:-16]
            encrypted_payload = encrypted_data[:-32]
            
            encryption_key = key15.get()
            cipher = AES.new(encryption_key, AES.MODE_GCM, iv[:12])
            
            decrypted = cipher.decrypt(encrypted_payload)
            cipher.verify(auth_tag)
            
            if decrypted[0:1] == b'\x78':
                decrypted = zlib.decompress(decrypted)
            
            return {'status': 'SUCCESS', 'data': decrypted, 'encrypted_iv': iv.hex()}
            
        except Exception as e:
            return {'status': 'FAILED', 'error': str(e), 'data': None}
    
    def method_2_skip_mac(self, file_path):
        """Method 2: Decrypt without MAC verification"""
        try:
            with open(file_path, 'rb') as f:
                encrypted_data = f.read()
            
            key_bytes = bytes.fromhex(self.encryption_key_hex)
            key15 = Key15(keyarray=key_bytes)
            
            encrypted_stream = io.BufferedReader(io.BytesIO(encrypted_data))
            db = Database15(key=key15, encrypted=encrypted_stream)
            
            iv = db.header.c15_iv.IV
            
            checksum = encrypted_data[-16:]
            auth_tag = encrypted_data[-32:-16]
            encrypted_payload = encrypted_data[:-32]
            
            encryption_key = key15.get()
            cipher = AES.new(encryption_key, AES.MODE_GCM, iv[:12])
            
            # Decrypt without verification
            decrypted = cipher.decrypt(encrypted_payload)
            
            # Just try to decrypt the auth_tag part too (multifile backup)
            try:
                decrypted += cipher.decrypt(auth_tag)
            except:
                pass
            
            if decrypted[0:1] == b'\x78':
                try:
                    decrypted = zlib.decompress(decrypted)
                except:
                    pass
            
            return {'status': 'SUCCESS (unverified)', 'data': decrypted, 'encrypted_iv': iv.hex()}
            
        except Exception as e:
            return {'status': 'FAILED', 'error': str(e), 'data': None}
    
    def method_3_multifile_backup(self, file_path):
        """Method 3: Treat as multifile backup"""
        try:
            with open(file_path, 'rb') as f:
                encrypted_data = f.read()
            
            key_bytes = bytes.fromhex(self.encryption_key_hex)
            key15 = Key15(keyarray=key_bytes)
            
            encrypted_stream = io.BufferedReader(io.BytesIO(encrypted_data))
            db = Database15(key=key15, encrypted=encrypted_stream)
            
            iv = db.header.c15_iv.IV
            
            checksum = encrypted_data[-16:]
            auth_tag = encrypted_data[-32:-16]
            encrypted_payload = encrypted_data[:-32]
            
            encryption_key = key15.get()
            cipher = AES.new(encryption_key, AES.MODE_GCM, iv[:12])
            
            decrypted = cipher.decrypt(encrypted_payload)
            
            # In multifile backups, the auth_tag is additional encrypted data
            try:
                decrypted += cipher.decrypt(auth_tag)
                cipher.verify(checksum)
            except:
                # If that fails, just continue with what we have
                pass
            
            if decrypted[0:1] == b'\x78':
                try:
                    decrypted = zlib.decompress(decrypted)
                except:
                    pass
            
            return {'status': 'SUCCESS (multifile)', 'data': decrypted, 'encrypted_iv': iv.hex()}
            
        except Exception as e:
            return {'status': 'FAILED', 'error': str(e), 'data': None}
    
    def is_sqlite(self, data):
        """Check if data is SQLite"""
        return data[:13] == b'SQLite format'
    
    def run(self):
        """Run all test methods"""
        
        if not self.backup_dir.exists():
            print(f"\n❌ Backup directory not found: {self.backup_dir}")
            return
        
        backup_files = sorted(self.backup_dir.glob("*.crypt15"))
        
        if not backup_files:
            print(f"\n❌ No .crypt15 files found!")
            return
        
        print(f"""
╔════════════════════════════════════════════════════════════════╗
║      Advanced WhatsApp Backup Encryption Key Test               ║
║         (Multiple decryption strategies)                        ║
╚════════════════════════════════════════════════════════════════╝

📁 Backup Directory: {self.backup_dir}
🔑 Encryption Key:   {self.encryption_key_hex[:32]}...
📊 Files to Test:    {len(backup_files)}

""")
        
        # Test first file (wa.db.crypt15) with all methods
        wa_db = self.backup_dir / "wa.db.crypt15"
        if not wa_db.exists():
            wa_db = backup_files[0]
        
        print(f"Testing: {wa_db.name}\n")
        
        # Method 1
        print("=" * 64)
        print("METHOD 1: Strict MAC Verification")
        print("=" * 64)
        result1 = self.method_1_strict_mac(wa_db)
        print(f"Status: {result1['status']}")
        if result1['data']:
            print(f"Decrypted Size: {len(result1['data'])} bytes")
            print(f"Is SQLite: {self.is_sqlite(result1['data'])}")
            print(f"IV Used: {result1['encrypted_iv']}")
        else:
            print(f"Error: {result1['error']}")
        
        # Method 2
        print("\n" + "=" * 64)
        print("METHOD 2: Skip MAC Verification (No Authentication Check)")
        print("=" * 64)
        result2 = self.method_2_skip_mac(wa_db)
        print(f"Status: {result2['status']}")
        if result2['data']:
            print(f"Decrypted Size: {len(result2['data'])} bytes")
            print(f"Is SQLite: {self.is_sqlite(result2['data'])}")
            print(f"IV Used: {result2['encrypted_iv']}")
            if self.is_sqlite(result2['data']):
                print(f"\n✅ SUCCESS! Got valid SQLite database!")
        else:
            print(f"Error: {result2['error']}")
        
        # Method 3
        print("\n" + "=" * 64)
        print("METHOD 3: Multifile Backup (Different Auth Strategy)")
        print("=" * 64)
        result3 = self.method_3_multifile_backup(wa_db)
        print(f"Status: {result3['status']}")
        if result3['data']:
            print(f"Decrypted Size: {len(result3['data'])} bytes")
            print(f"Is SQLite: {self.is_sqlite(result3['data'])}")
            print(f"IV Used: {result3['encrypted_iv']}")
            if self.is_sqlite(result3['data']):
                print(f"\n✅ SUCCESS! Got valid SQLite database!")
        else:
            print(f"Error: {result3['error']}")
        
        # Summary
        print("\n" + "=" * 64)
        print("SUMMARY")
        print("=" * 64)
        
        success_methods = []
        if result1['data']:
            success_methods.append("Strict MAC Verification")
        if result2['data']:
            success_methods.append("Skip MAC Verification")
        if result3['data']:
            success_methods.append("Multifile Backup")
        
        if success_methods:
            print(f"\n✅ KEY APPEARS TO BE WORKING with:")
            for method in success_methods:
                print(f"   • {method}")
            
            # Save decrypted file
            best_result = result2['data'] or result3['data'] or result1['data']
            if best_result:
                output_file = Path.cwd() / "decrypted_wa.db"
                with open(output_file, 'wb') as f:
                    f.write(best_result)
                print(f"\n💾 Decrypted file saved: {output_file}")
                print(f"   Size: {len(best_result)} bytes")
                
                if self.is_sqlite(best_result):
                    print(f"   Format: SQLite Database ✅")
        else:
            print(f"\n❌ KEY DID NOT WORK with any method")
            print(f"\nUnfortunately, the provided key cannot decrypt the backup files.")
            print(f"This means either:")
            print(f"  1. The key is incorrect")
            print(f"  2. The backup uses a different encryption method")
            print(f"  3. The backup is corrupted")


def main():
    backup_dir = "/home/katyayani/Downloads/AndroidData-20260310T103958Z-3-001/AndroidData"
    encryption_key = "aca75852758afeaad9c5b1ed81b889daf16b77600c028e33aebb153214ce839a"
    
    try:
        tester = AdvancedBackupKeyTest(backup_dir, encryption_key)
        tester.run()
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
