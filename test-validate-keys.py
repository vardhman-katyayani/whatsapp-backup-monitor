#!/usr/bin/env python3

"""
Test file to validate if encryption keys from Supabase are correct for their associated phone numbers
Checks each phone's backup files against its stored encryption key
"""

import os
import sys
import io
from pathlib import Path
from dotenv import load_dotenv
from hashlib import md5

# Load environment variables
load_dotenv()

# Import wa-crypt-tools
try:
    from wa_crypt_tools.lib.key.key15 import Key15
    from wa_crypt_tools.lib.db.db15 import Database15
    from Cryptodome.Cipher import AES
except ImportError:
    print("❌ wa-crypt-tools not installed!")
    print("To install use: pip install wa-crypt-tools pycryptodomex")
    sys.exit(1)

# Import Supabase
try:
    from supabase import create_client, Client
except ImportError:
    print("❌ supabase not installed!")
    print("To install use: pip install supabase")
    sys.exit(1)


class KeyValidator:
    """Validates encryption keys from Supabase against actual backup files"""
    
    def __init__(self):
        # Initialize Supabase
        supabase_url = os.getenv('SUPABASE_URL')
        # Try different possible key variable names
        supabase_key = os.getenv('SUPABASE_KEY') or os.getenv('SUPABASE_SERVICE_KEY') or os.getenv('SUPABASE_ANON_KEY')
        
        if not supabase_url or not supabase_key:
            raise ValueError("SUPABASE_URL and SUPABASE_KEY (or SERVICE_KEY/ANON_KEY) environment variables not set")
        
        self.supabase: Client = create_client(supabase_url, supabase_key)
        print(f"✅ Connected to Supabase: {supabase_url}")
        
        # Backup directory
        self.backup_dir = Path("/home/katyayani/Downloads/AndroidData-20260310T103958Z-3-001/AndroidData")
    
    def test_key_validity(self, phone_number, encryption_key_hex):
        """Test if an encryption key from Supabase is valid for a phone's backup"""
        
        print(f"\n{'='*70}")
        print(f"📱 Phone: {phone_number}")
        print(f"🔑 Key: {encryption_key_hex[:32]}...{encryption_key_hex[-16:]}")
        print('='*70)
        
        # First, check if backup files exist
        if not self.backup_dir.exists():
            print(f"❌ Backup directory not found: {self.backup_dir}")
            return None
        
        # Find .crypt15 files
        backup_files = list(self.backup_dir.glob("*.crypt15"))
        if not backup_files:
            print(f"❌ No .crypt15 backup files found in {self.backup_dir}")
            return None
        
        print(f"📁 Found {len(backup_files)} backup files")
        
        # Test decryption with the first database file (wa.db.crypt15)
        wa_db = self.backup_dir / "wa.db.crypt15"
        if not wa_db.exists():
            print(f"⚠️  wa.db.crypt15 not found, trying first available file...")
            target_file = backup_files[0]
        else:
            target_file = wa_db
        
        print(f"\n🔓 Testing key validity by decrypting: {target_file.name}")
        
        try:
            # Read encrypted file
            with open(target_file, 'rb') as f:
                encrypted_data = f.read()
            
            print(f"   File size: {len(encrypted_data)} bytes")
            
            # Initialize key
            try:
                key_bytes = bytes.fromhex(encryption_key_hex)
                key15 = Key15(keyarray=key_bytes)
            except Exception as e:
                print(f"❌ Invalid key format: {e}")
                return False
            
            # Parse header to extract IV and verify it's Crypt15
            encrypted_stream = io.BufferedReader(io.BytesIO(encrypted_data))
            try:
                db = Database15(key=key15, encrypted=encrypted_stream)
            except Exception as e:
                print(f"❌ Failed to parse backup header: {e}")
                return False
            
            # Extract IV
            iv = db.header.c15_iv.IV
            if not iv or len(iv) != 16:
                print(f"❌ Invalid or missing IV in backup header")
                return False
            
            print(f"   IV: {iv.hex()}")
            print(f"   WhatsApp version: {db.header.info.app_version}")
            print(f"   Country code: {db.header.info.jidSuffix}")
            
            # Extract encryption components
            checksum = encrypted_data[-16:]
            auth_tag = encrypted_data[-32:-16]
            encrypted_payload = encrypted_data[:-32]
            
            # Attempt decryption
            encryption_key = key15.get()
            cipher = AES.new(encryption_key, AES.MODE_GCM, iv[:12])
            
            decrypted = cipher.decrypt(encrypted_payload)
            
            # Verify authentication tag
            try:
                cipher.verify(auth_tag)
                print(f"\n✅ KEY IS VALID!")
                print(f"   ✓ Authentication tag verified")
                print(f"   ✓ Successfully decrypted {len(decrypted)} bytes")
                return True
                
            except ValueError as e:
                print(f"\n❌ KEY IS INVALID!")
                print(f"   ✗ Authentication tag mismatch: {e}")
                print(f"   This means the encryption key stored in Supabase")
                print(f"   does NOT match the key used to encrypt this backup.")
                
                # Provide diagnostic info
                print(f"\n📋 Diagnostic Information:")
                print(f"   - Decryption produced {len(decrypted)} bytes")
                print(f"   - First 16 bytes: {decrypted[:16].hex()}")
                print(f"   - Expected SQLite header: 53514C69...")
                print(f"   - Possible causes:")
                print(f"     1. Key was changed after backup was created")
                print(f"     2. Backup is from a different encryption key")
                print(f"     3. Backup file is corrupted")
                print(f"     4. Key derivation mismatch")
                
                return False
                
        except Exception as e:
            print(f"❌ Error during key validation: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def run(self):
        """Main execution - test all phones with encryption keys"""
        
        print(f"""
╔═══════════════════════════════════════════════════════════════╗
║           Encryption Key Validator v1.0                       ║
║  Validates if Supabase keys match actual backup encryption    ║
╚═══════════════════════════════════════════════════════════════╝""")
        
        # Fetch all phones with encryption keys
        print(f"\n🔑 Fetching phones with encryption keys from Supabase...\n")
        
        try:
            response = self.supabase.table('phones').select(
                'phone_number, name, encryption_key'
            ).neq('encryption_key', None).execute()
            
            phones = response.data
            
            if not phones:
                print("❌ No phones with encryption keys found in Supabase")
                return
            
            print(f"✅ Found {len(phones)} phones with encryption keys\n")
            
            # Test each phone
            results = {}
            for phone in phones:
                phone_number = phone['phone_number']
                name = phone['name']
                key_hex = phone['encryption_key']
                
                result = self.test_key_validity(phone_number, key_hex)
                results[phone_number] = {
                    'name': name,
                    'key': key_hex,
                    'valid': result
                }
            
            # Print summary
            self.print_summary(results)
            
        except Exception as e:
            print(f"❌ Error fetching phones from Supabase: {e}")
            import traceback
            traceback.print_exc()
    
    def print_summary(self, results):
        """Print validation summary"""
        
        print(f"\n\n╔═══════════════════════════════════════════════════════════════╗")
        print(f"║                    VALIDATION SUMMARY                         ║")
        print(f"╠═══════════════════════════════════════════════════════════════╣")
        
        valid_count = sum(1 for r in results.values() if r['valid'] is True)
        invalid_count = sum(1 for r in results.values() if r['valid'] is False)
        unknown_count = sum(1 for r in results.values() if r['valid'] is None)
        
        print(f"║  Total Phones:        {len(results):3d}                              ║")
        print(f"║  Valid Keys:          {valid_count:3d}  ✅                          ║")
        print(f"║  Invalid Keys:        {invalid_count:3d}  ❌                          ║")
        print(f"║  Unknown:             {unknown_count:3d}  ⚠️                           ║")
        print(f"╠═══════════════════════════════════════════════════════════════╣")
        
        # Details
        for phone_number, data in results.items():
            status = "✅ VALID" if data['valid'] is True else "❌ INVALID" if data['valid'] is False else "⚠️  UNKNOWN"
            key_short = f"{data['key'][:16]}...{data['key'][-8:]}"
            print(f"║  {phone_number:15s} | {data['name']:20s} | {status:12s} │")
        
        print(f"╠═══════════════════════════════════════════════════════════════╣")
        
        # Recommendations
        print(f"║                    RECOMMENDATIONS:                           ║")
        
        if invalid_count > 0:
            print(f"║  ❌ Some keys are INVALID:                                   ║")
            for phone_number, data in results.items():
                if data['valid'] is False:
                    print(f"║     - {phone_number}: Key needs to be updated or renewed     ║")
            print(f"║                                                               ║")
            print(f"║  To fix:                                                     ║")
            print(f"║  1. Extract correct key from the phone device               ║")
            print(f"║  2. Update the encryption_key in Supabase for this phone    ║")
            print(f"║  3. Re-run this validator to confirm                        ║")
        
        if valid_count > 0:
            print(f"║  ✅ Valid keys can be used for decryption:                   ║")
            for phone_number, data in results.items():
                if data['valid'] is True:
                    print(f"║     - {phone_number}: Key is correct                       ║")
        
        print(f"╚═══════════════════════════════════════════════════════════════╝")


def main():
    try:
        validator = KeyValidator()
        validator.run()
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
