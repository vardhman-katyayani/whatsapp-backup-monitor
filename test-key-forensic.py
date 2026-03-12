#!/usr/bin/env python3
"""
WhatsApp Backup Forensic Analysis Tool
======================================
Tests encryption key with advanced forensic analysis:
- Decrypts without MAC verification
- Analyzes raw decrypted bytes
- Attempts decompression
- Extracts encryption key from backup metadata
- Tests multiple decryption strategies
"""

import os
import sys
import zlib
import struct
import binascii
from pathlib import Path
from Cryptodome.Cipher import AES
from Cryptodome.Protocol.KDF import PBKDF2

# Configuration
BACKUP_DIR = "/home/katyayani/Downloads/AndroidData-20260310T103958Z-3-001/AndroidData"
ENCRYPTION_KEY = bytes.fromhex("aca75852758afeaad9c5b1ed81b889daf16b77600c028e33aebb153214ce839a")

class BackupMetadataExtractor:
    """Extract metadata and potential keys from backup files"""
    
    def __init__(self, filepath):
        self.filepath = filepath
        self.data = open(filepath, 'rb').read()
        self.analyze()
    
    def analyze(self):
        print(f"\n{'='*70}")
        print(f"ANALYZING: {Path(self.filepath).name}")
        print(f"{'='*70}")
        print(f"File Size: {len(self.data)} bytes")
        print(f"First 32 bytes (hex): {binascii.hexlify(self.data[:32]).decode()}")
        print(f"Last 32 bytes (hex):  {binascii.hexlify(self.data[-32:]).decode()}")
        
        # Try to extract protobuf header
        self.extract_protobuf_header()
        # Look for patterns
        self.find_patterns()
        # Extract potential keys
        self.extract_potential_keys()
    
    def extract_protobuf_header(self):
        """Extract and analyze protobuf header (first 99 bytes)"""
        print("\n[PROTOBUF HEADER ANALYSIS]")
        if len(self.data) < 99:
            print("  ❌ File too small for header extraction")
            return
        
        header = self.data[:99]
        print(f"  Header length: {len(header)} bytes")
        print(f"  Header (hex): {binascii.hexlify(header).decode()}")
        
        # Try to extract IV from protobuf
        try:
            # IV is typically at offset 19-35 in protobuf
            potential_iv = header[19:35]
            print(f"  Potential IV: {binascii.hexlify(potential_iv).decode()}")
        except:
            pass
    
    def find_patterns(self):
        """Look for known patterns in encrypted data"""
        print("\n[PATTERN DETECTION]")
        patterns = {
            "SQLite": b"SQLite",
            "JSON": b"{",
            "protobuf_field": b"\x08\x01",
            "zlib_header": b"\x78\x9c",
            "gzip_header": b"\x1f\x8b",
        }
        
        for name, pattern in patterns.items():
            if pattern in self.data:
                pos = self.data.find(pattern)
                print(f"  ✓ Found {name} at offset {pos}")
    
    def extract_potential_keys(self):
        """Look for hex-like sequences that could be keys"""
        print("\n[KEY EXTRACTION]")
        
        # Look for 64-char hex sequences (32 bytes)
        hex_chars = set(b"0123456789abcdefABCDEF")
        
        for i in range(len(self.data) - 64):
            chunk = self.data[i:i+64]
            if all(c in hex_chars for c in chunk):
                try:
                    potential_key = chunk.decode('ascii')
                    if potential_key.lower() == potential_key or potential_key.upper() == potential_key:
                        print(f"  Found potential key at offset {i}: {potential_key[:32]}...")
                except:
                    pass


class BackupDecryptor:
    """Advanced backup decryption with multiple strategies"""
    
    def __init__(self, encryption_key):
        self.key = encryption_key
        self.backup_dir = BACKUP_DIR
    
    def decrypt_file(self, filepath):
        """Decrypt file using AES-256-GCM without MAC verification"""
        print(f"\n[DECRYPTION TEST] {Path(filepath).name}")
        
        with open(filepath, 'rb') as f:
            data = f.read()
        
        if len(data) < 115:  # 99 header + 16 IV + 16 tag = 131 minimum
            print(f"  ❌ File too small: {len(data)} bytes")
            return None
        
        # Extract components
        header = data[:99]
        encrypted_payload = data[99:-32]  # Between header and auth tag
        auth_tag = data[-16:]
        
        # Extract IV from header (try multiple positions)
        iv = self.extract_iv(header)
        
        print(f"  Encrypted payload size: {len(encrypted_payload)} bytes")
        print(f"  IV: {binascii.hexlify(iv).decode()}")
        print(f"  Auth tag: {binascii.hexlify(auth_tag).decode()}")
        
        # Attempt decryption without MAC
        try:
            cipher = AES.new(self.key, AES.MODE_GCM, nonce=iv)
            decrypted = cipher.decrypt(encrypted_payload)
            print(f"  ✓ Decryption successful: {len(decrypted)} bytes")
            return decrypted
        except Exception as e:
            print(f"  ❌ Decryption failed: {str(e)}")
            return None
    
    def extract_iv(self, header):
        """Extract IV from protobuf header"""
        # IV is typically stored at specific offset in protobuf
        if len(header) >= 35:
            return header[19:35]
        return header[-16:] if len(header) >= 16 else b'\x00' * 16
    
    def analyze_decrypted(self, decrypted):
        """Analyze decrypted content"""
        print(f"\n[DECRYPTED DATA ANALYSIS]")
        print(f"  Size: {len(decrypted)} bytes")
        print(f"  First 32 bytes: {binascii.hexlify(decrypted[:32]).decode()}")
        
        # Check for SQLite
        if decrypted.startswith(b'SQLite'):
            print(f"  ✓ SQLite database detected!")
            return 'sqlite'
        
        # Check for zlib compression
        if decrypted.startswith(b'\x78\x9c'):
            print(f"  ✓ zlib compression detected")
            try:
                decompressed = zlib.decompress(decrypted)
                print(f"  ✓ Decompressed size: {len(decompressed)} bytes")
                if decompressed.startswith(b'SQLite'):
                    print(f"  ✓ Decompressed content is SQLite!")
                    return 'zlib_sqlite'
                return decompressed
            except Exception as e:
                print(f"  ❌ Decompression failed: {str(e)}")
        
        # Check for JSON
        try:
            decoded = decrypted.decode('utf-8', errors='ignore')
            if decoded.strip().startswith('{'):
                print(f"  ✓ Looks like JSON data")
                print(f"  Preview: {decoded[:100]}...")
                return 'json'
        except:
            pass
        
        # Check for null bytes (potential corruption)
        null_count = decrypted.count(b'\x00')
        printable_count = sum(1 for b in decrypted if 32 <= b < 127 or b in [9, 10, 13])
        print(f"  Null bytes: {null_count} ({100*null_count/len(decrypted):.1f}%)")
        print(f"  Printable: {printable_count} ({100*printable_count/len(decrypted):.1f}%)")
        
        return 'unknown'
    
    def test_all_files(self):
        """Test decryption on all backup files"""
        print(f"\n{'='*70}")
        print(f"TESTING KEY ON ALL BACKUP FILES")
        print(f"Key: {binascii.hexlify(self.key).decode()}")
        print(f"{'='*70}")
        
        backup_files = sorted(Path(self.backup_dir).glob("*.crypt15"))
        
        results = []
        for filepath in backup_files:
            decrypted = self.decrypt_file(filepath)
            if decrypted:
                file_type = self.analyze_decrypted(decrypted)
                results.append({
                    'file': filepath.name,
                    'size': len(decrypted),
                    'type': file_type
                })
        
        return results


class KeyExtractor:
    """Try to extract encryption key from backup files"""
    
    @staticmethod
    def extract_from_backup_metadata(backup_dir):
        """Extract key from backup metadata if available"""
        print(f"\n{'='*70}")
        print(f"KEY EXTRACTION FROM BACKUP METADATA")
        print(f"{'='*70}")
        
        # Look for metadata files
        metadata_files = [
            "backup_settings.json.crypt15",
            "backup_metadata.json",
            "backup.conf"
        ]
        
        for metadata_file in metadata_files:
            path = Path(backup_dir) / metadata_file
            if path.exists():
                print(f"\n✓ Found {metadata_file}")
                analyzer = BackupMetadataExtractor(str(path))


def main():
    print("""
    ╔═══════════════════════════════════════════════════════════════╗
    ║     WhatsApp Backup FORENSIC Analysis Tool                    ║
    ║            Advanced Decryption & Key Extraction               ║
    ╚═══════════════════════════════════════════════════════════════╝
    """)
    
    # Step 1: Extract metadata from backup files
    KeyExtractor.extract_from_backup_metadata(BACKUP_DIR)
    
    # Step 2: Test decryption
    decryptor = BackupDecryptor(ENCRYPTION_KEY)
    results = decryptor.test_all_files()
    
    # Summary
    print(f"\n{'='*70}")
    print(f"SUMMARY")
    print(f"{'='*70}")
    
    if results:
        print(f"\n✓ Found {len(results)} decryptable files:\n")
        for r in results:
            print(f"  • {r['file']}: {r['size']} bytes [{r['type']}]")
    else:
        print(f"\n❌ No files could be decrypted")
    
    print(f"\n{'='*70}")
    print(f"RECOMMENDATIONS:")
    print(f"{'='*70}")
    print("""
    If decryption failed:
    1. The encryption key might be incorrect
    2. The backup files might be corrupted
    3. A different key might be needed
    
    To find the correct key:
    - Check WhatsApp Settings → Chats → Chat Backup → Encryption
    - Or extract from phone via ADB from WhatsApp preferences
    - Or check email for WhatsApp's backup encryption key notification
    """)


if __name__ == "__main__":
    main()
