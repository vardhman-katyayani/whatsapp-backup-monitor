#!/usr/bin/env python3
"""
Decrypt WhatsApp Backup Using Correct Key Derivation
======================================================
The key provided is the ROOT KEY that must be derived using encryptionloop
"""

import hmac
import hashlib
import struct
import binascii
from pathlib import Path
from Cryptodome.Cipher import AES
import zlib

BACKUP_DIR = "/home/katyayani/Downloads/AndroidData-20260310T103958Z-3-001/AndroidData"
ROOT_KEY = bytes.fromhex("aca75852758afeaad9c5b1ed81b889daf16b77600c028e33aebb153214ce839a")

def encryptionloop(first_iteration_data, message, output_bytes, private_seed=None):
    """
    wa-crypt-tools encryptionloop function
    Derives encryption key from root key using HMAC-SHA256
    """
    if private_seed is None:
        private_seed = b'\x00' * 32
    
    # Generate private key
    private_key = hmac.new(private_seed, first_iteration_data, hashlib.sha256).digest()
    
    # Generate output bytes
    data_block = b''
    output = b''
    permutations = (output_bytes + 31) // 32  # Ceiling division
    
    for i in range(1, permutations + 1):
        hasher = hmac.new(private_key, data_block, hashlib.sha256)
        if message:
            hasher.update(message)
        hasher.update(bytes([i]))
        data_block = hasher.digest()
        
        chunk_size = min(output_bytes - len(output), len(data_block))
        output += data_block[:chunk_size]
    
    return output[:output_bytes]

def extract_iv_from_header(header):
    """Extract IV from protobuf header"""
    # IV is stored in protobuf format: 0x0a 0x10 followed by 16 bytes
    for i in range(len(header) - 16):
        if header[i:i+2] == b'\x0a\x10':
            return header[i+2:i+18]
    return None

def decrypt_backup(filepath, encryption_key):
    """Decrypt a backup file"""
    with open(filepath, 'rb') as f:
        data = f.read()
    
    fname = Path(filepath).name
    print(f"\n{'='*70}")
    print(f"File: {fname}")
    print(f"{'='*70}")
    print(f"Size: {len(data)} bytes")
    
    # Parse header
    header_start = 1  # Skip first size byte
    if data[header_start] == 0x01:
        header_start += 1
    
    protobuf_size = data[0]
    header_end = header_start + protobuf_size
    header = data[:header_end]
    
    # Extract IV
    iv = extract_iv_from_header(header)
    if not iv or len(iv) == 0:
        print(f"❌ Could not extract IV from header")
        return None
    
    print(f"IV: {binascii.hexlify(iv).decode()}")
    
    # Standard format: header | encrypted | authTag(16) | checksum(16)
    encrypted_payload = data[header_end:-32]
    auth_tag = data[-32:-16]
    
    print(f"Encrypted payload: {len(encrypted_payload)} bytes")
    print(f"Auth tag: {binascii.hexlify(auth_tag).decode()}")
    
    # Try decryption with strict authentication
    try:
        cipher = AES.new(encryption_key, AES.MODE_GCM, nonce=iv)
        decrypted = cipher.decrypt_and_verify(encrypted_payload, auth_tag)
        print(f"✓ Authentication PASSED!")
        print(f"✓ Decrypted: {len(decrypted)} bytes")
        
        # Try decompression
        if decrypted[0:2] in [b'\x78\x9c', b'\x78\xda', b'\x78\x01']:
            try:
                decompressed = zlib.decompress(decrypted)
                print(f"✓ Decompressed: {len(decompressed)} bytes")
                decrypted = decompressed
            except:
                pass
        
        # Check if SQLite
        if decrypted.startswith(b'SQLite format 3'):
            print(f"✓✓✓ VALID SQLite DATABASE! ✓✓✓")
            return decrypted
        else:
            print(f"? First bytes: {decrypted[:20].hex()}")
            return decrypted
            
    except ValueError as e:
        if "MAC" in str(e):
            print(f"❌ Authentication FAILED: {str(e)}")
            print(f"   (Key might be incorrect)")
            return None
        raise

def main():
    print("""
    ╔═══════════════════════════════════════════════════════════════╗
    ║      WhatsApp Backup Decryption with Key Derivation           ║
    ║         (Using encryptionloop to derive encryption key)       ║
    ╚═══════════════════════════════════════════════════════════════╝
    """)
    
    print(f"Root Key: {binascii.hexlify(ROOT_KEY).decode()}")
    print(f"Backup Dir: {BACKUP_DIR}\n")
    
    # Derive encryption key using encryptionloop
    print("Deriving encryption key from root key...")
    encryption_key = encryptionloop(ROOT_KEY, b'backup encryption', 32)
    print(f"Encryption Key: {binascii.hexlify(encryption_key).decode()}\n")
    
    # Test on all backup files
    backup_files = sorted(Path(BACKUP_DIR).glob("*.crypt15"))
    
    success_count = 0
    decrypted_files = []
    
    for filepath in backup_files:
        result = decrypt_backup(str(filepath), encryption_key)
        if result:
            success_count += 1
            
            # Save decrypted file
            fname = Path(filepath).name.replace('.crypt15', '.db')
            outpath = Path(BACKUP_DIR).parent / fname
            with open(outpath, 'wb') as f:
                f.write(result)
            print(f"✓ Saved to: {outpath}")
            decrypted_files.append(str(outpath))
    
    # Summary
    print(f"\n{'='*70}")
    print(f"SUMMARY")
    print(f"{'='*70}")
    print(f"Successfully decrypted: {success_count}/{len(backup_files)} files\n")
    
    if decrypted_files:
        print("Decrypted files:")
        for f in decrypted_files:
            print(f"  • {Path(f).name}")
    
    if success_count == len(backup_files):
        print("\n✓✓✓ ALL FILES DECRYPTED SUCCESSFULLY! ✓✓✓")
        print("✓✓✓ KEY IS VALID AND CORRECT! ✓✓✓")
    elif success_count > 0:
        print(f"\n✓ {success_count} files decrypted - KEY IS VALID!")
    else:
        print("\n❌ Decryption failed on all files")

if __name__ == "__main__":
    main()
