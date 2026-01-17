#!/usr/bin/env python3
"""
WhatsApp Backup Decryption using wa-crypt-tools
Run this after installing: pip install wa-crypt-tools
"""

import sys
import subprocess
import os

def main():
    backup_file = "msgstore.db.crypt15"
    password = "test@123"
    output_file = "msgstore.db"
    
    if not os.path.exists(backup_file):
        print(f"Error: {backup_file} not found!")
        print("Make sure the backup file is in the current directory.")
        return 1
    
    print(f"Decrypting {backup_file} with password...")
    print(f"Output will be saved to: {output_file}\n")
    
    try:
        # Try using wadecrypt command
        result = subprocess.run(
            ["wadecrypt", "--password", password, backup_file, output_file],
            capture_output=True,
            text=True
        )
        
        if result.returncode == 0:
            print("✅ SUCCESS! Backup decrypted!")
            print(f"✅ Decrypted database saved to: {output_file}")
            return 0
        else:
            print("Error:", result.stderr)
            print("\nTrying alternative method...")
            
            # Alternative: use Python API directly
            try:
                from wa_crypt_tools import decrypt
                decrypt(backup_file, output_file, password=password)
                print("✅ SUCCESS! Backup decrypted using Python API!")
                return 0
            except ImportError:
                print("Error: wa-crypt-tools not installed.")
                print("Install it with: pip install wa-crypt-tools")
                return 1
            except Exception as e:
                print(f"Error: {e}")
                return 1
                
    except FileNotFoundError:
        print("Error: wadecrypt command not found!")
        print("Install wa-crypt-tools with: pip install wa-crypt-tools")
        return 1

if __name__ == "__main__":
    sys.exit(main())
