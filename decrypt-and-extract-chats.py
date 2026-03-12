#!/usr/bin/env python3
"""
WhatsApp Backup Decryption and Chat Extraction
Searches for .crypt15 files, decrypts them, and exports all chats
"""

import os
import sqlite3
import json
import glob
from pathlib import Path
from datetime import datetime
from Cryptodome.Cipher import AES
from Cryptodome.Protocol.KDF import PBKDF2
from Cryptodome.Hash import SHA256
import zlib

# Encryption key from your setup
ROOT_KEY = bytes.fromhex("aca75852758afeaad9c5b1ed81b889daf16b77600c028e33aebb153214ce839a")

def encryptionloop(key, message, output_bytes, private_seed=b""):
    """Derive encryption key using HMAC-SHA256 (encryptionloop)"""
    from Cryptodome.Hash import HMAC
    
    h = HMAC.new(key, digestmod=SHA256)
    h.update(message + private_seed)
    derivation = h.digest()
    
    if output_bytes <= 32:
        return derivation[:output_bytes]
    else:
        output = b''
        while len(output) < output_bytes:
            h = HMAC.new(key, digestmod=SHA256)
            h.update(derivation + message + private_seed)
            derivation = h.digest()
            output += derivation
        return output[:output_bytes]

def decrypt_backup_file(crypt_file, output_file):
    """Decrypt a .crypt15 file"""
    print(f"\n🔓 Decrypting: {crypt_file}")
    
    try:
        with open(crypt_file, 'rb') as f:
            # Read encrypted data
            encrypted_data = f.read()
        
        # Derive encryption key
        derived_key = encryptionloop(ROOT_KEY, b"backup encryption", 32)
        
        # Extract IV (first 16 bytes) and encrypted data
        iv = encrypted_data[:16]
        ciphertext = encrypted_data[16:-16]  # Remove IV and MAC tag
        mac_tag = encrypted_data[-16:]  # Last 16 bytes are MAC tag
        
        # Decrypt using AES-256-GCM
        cipher = AES.new(derived_key, AES.MODE_GCM, nonce=iv)
        plaintext = cipher.decrypt_and_verify(ciphertext, mac_tag)
        
        # Decompress
        decompressed = zlib.decompress(plaintext)
        
        # Write decrypted file
        with open(output_file, 'wb') as f:
            f.write(decompressed)
        
        print(f"✓ Decrypted successfully: {output_file}")
        return True
    except Exception as e:
        print(f"✗ Decryption failed: {e}")
        return False

def extract_chats_from_db(db_file):
    """Extract all chat data from decrypted SQLite database"""
    chats = []
    
    try:
        conn = sqlite3.connect(db_file)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Get all tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor.fetchall()]
        
        # Try to extract from chat-related tables
        for table in tables:
            if any(x in table.lower() for x in ['chat', 'message', 'conversation']):
                try:
                    cursor.execute(f"SELECT * FROM {table} LIMIT 100")
                    columns = [description[0] for description in cursor.description]
                    rows = cursor.fetchall()
                    
                    if rows:
                        table_data = {
                            'table': table,
                            'columns': columns,
                            'row_count': len(rows),
                            'data': [dict(row) for row in rows[:20]]  # First 20 rows
                        }
                        chats.append(table_data)
                except:
                    pass
        
        conn.close()
        return chats
    except Exception as e:
        print(f"Error extracting from {db_file}: {e}")
        return []

def main():
    print("="*70)
    print("WhatsApp Backup Decryption & Chat Extraction")
    print("="*70)
    
    # Search for .crypt15 files
    search_paths = [
        "/home/katyayani/Desktop/whatsapp_backup/**/*.crypt15",
        "/home/katyayani/Downloads/**/*.crypt15",
        "/home/katyayani/**/*.crypt15",
    ]
    
    crypt_files = []
    for pattern in search_paths:
        crypt_files.extend(glob.glob(pattern, recursive=True))
    
    crypt_files = list(set(crypt_files))  # Remove duplicates
    
    if not crypt_files:
        print("❌ No .crypt15 files found!")
        print(f"Searched in:")
        for pattern in search_paths:
            print(f"  - {pattern}")
        return
    
    print(f"\n✓ Found {len(crypt_files)} encrypted backup files:")
    for f in crypt_files:
        print(f"  • {f}")
    
    # Create output directory
    output_dir = "/home/katyayani/Desktop/whatsapp_backup/decrypted_chats"
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    
    all_chats = {}
    
    # Decrypt each file and extract chats
    for crypt_file in crypt_files:
        file_basename = Path(crypt_file).stem
        output_db = f"{output_dir}/{file_basename}.db"
        
        # Decrypt
        if decrypt_backup_file(crypt_file, output_db):
            # Extract chats
            print(f"📊 Extracting chat data from {file_basename}...")
            chats = extract_chats_from_db(output_db)
            if chats:
                all_chats[file_basename] = chats
                print(f"  ✓ Found {len(chats)} chat tables")
    
    # Create comprehensive output file
    test_output_file = f"{output_dir}/CHATS_EXTRACTION_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    
    output_data = {
        'timestamp': datetime.now().isoformat(),
        'total_files_decrypted': len([c for c in crypt_files]),
        'backup_sources': crypt_files,
        'chats_extracted': all_chats,
        'summary': {
            'total_databases': len(all_chats),
            'total_tables': sum(len(tables) for tables in all_chats.values())
        }
    }
    
    with open(test_output_file, 'w') as f:
        json.dump(output_data, f, indent=2, default=str)
    
    print("\n" + "="*70)
    print("✅ EXTRACTION COMPLETE")
    print("="*70)
    print(f"Decrypted files: {output_dir}/")
    print(f"\n📄 Chat data exported to:")
    print(f"   {test_output_file}")
    print(f"\n📊 Summary:")
    print(f"   • Databases processed: {len(all_chats)}")
    print(f"   • Chat tables found: {sum(len(tables) for tables in all_chats.values())}")
    print(f"   • Total rows extracted: {sum(sum(len(t.get('data', [])) for t in tables) for tables in all_chats.values())}")

if __name__ == "__main__":
    main()
