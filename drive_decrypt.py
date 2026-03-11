#!/usr/bin/env python3
"""
Download WhatsApp backup from Priya Mishra's Google Drive (via service account)
and decrypt the crypt15 files.
"""

import json
import os
import hmac
import hashlib
import struct
import zlib
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# pip: google-auth google-auth-httplib2 google-api-python-client cryptography
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
import io

# ── Config ──────────────────────────────────────────────────────────────
SERVICE_ACCOUNT_PATH = Path(__file__).parent / "server" / "service_account.json"
IMPERSONATE_EMAIL = "priyamishra@katyayaniorganics.com"
ENCRYPTION_KEY_HEX = "aca75852758afeaad9c5b1ed81b889daf16b77600c028e33aebb153214ce839a"
OUTPUT_DIR = Path(__file__).parent / "decrypted_backups"

# Also try the key from key.txt
FALLBACK_KEY_HEX = "706ded8a9699c258dd3d441dacf1e98c4ca86358d5f3f21a8b766ec0bbbe6385"


def get_drive_service(impersonate=False):
    """Authenticate with service account. Try impersonation first, fallback to direct."""
    scopes = [
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/drive",
    ]
    kwargs = {"scopes": scopes}
    if impersonate:
        kwargs["subject"] = IMPERSONATE_EMAIL

    creds = service_account.Credentials.from_service_account_file(
        str(SERVICE_ACCOUNT_PATH), **kwargs
    )
    return build("drive", "v3", credentials=creds)


def list_all_drive_files(service, page_size=100):
    """List ALL files visible to the impersonated user."""
    print(f"\n📂 Listing all Drive files for {IMPERSONATE_EMAIL}...")
    all_files = []
    page_token = None

    while True:
        resp = service.files().list(
            pageSize=page_size,
            fields="nextPageToken, files(id, name, size, mimeType, modifiedTime, parents)",
            orderBy="modifiedTime desc",
            pageToken=page_token,
        ).execute()

        files = resp.get("files", [])
        all_files.extend(files)
        print(f"   Fetched {len(files)} files (total: {len(all_files)})")

        page_token = resp.get("nextPageToken")
        if not page_token:
            break

    return all_files


def list_appdata_files(service):
    """List files in appDataFolder (where WhatsApp stores backups)."""
    print(f"\n📦 Listing appDataFolder files...")
    try:
        resp = service.files().list(
            spaces="appDataFolder",
            pageSize=200,
            fields="files(id, name, size, mimeType, modifiedTime)",
            orderBy="modifiedTime desc",
        ).execute()
        files = resp.get("files", [])
        print(f"   Found {len(files)} files in appDataFolder")
        return files
    except Exception as e:
        print(f"   ⚠️  appDataFolder access failed: {e}")
        return []


def search_whatsapp_backups(service):
    """Search specifically for WhatsApp backup files."""
    print(f"\n🔍 Searching for WhatsApp backup files...")
    queries = [
        "name contains 'msgstore' and (name contains '.crypt14' or name contains '.crypt15')",
        "name contains 'wa.db'",
        "name contains 'whatsapp'",
        "name contains 'msgstore'",
    ]

    found = {}
    for q in queries:
        try:
            resp = service.files().list(
                q=q,
                fields="files(id, name, size, mimeType, modifiedTime, parents)",
                orderBy="modifiedTime desc",
                pageSize=50,
            ).execute()
            for f in resp.get("files", []):
                found[f["id"]] = f
        except Exception as e:
            print(f"   Query '{q[:40]}...' failed: {e}")

    return list(found.values())


def download_file(service, file_id, file_name):
    """Download a file from Drive."""
    OUTPUT_DIR.mkdir(exist_ok=True)
    out_path = OUTPUT_DIR / file_name

    request = service.files().get_media(fileId=file_id)
    fh = io.BytesIO()
    downloader = MediaIoBaseDownload(fh, request)

    done = False
    while not done:
        status, done = downloader.next_chunk()
        if status:
            print(f"   ↓ {int(status.progress() * 100)}%")

    data = fh.getvalue()
    out_path.write_bytes(data)
    print(f"   💾 Saved: {out_path} ({len(data):,} bytes)")
    return data, out_path


# ── Crypt15 Decryption ─────────────────────────────────────────────────

def encryption_loop(first_iter_data: bytes, message: bytes, output_bytes: int,
                    private_seed: bytes = b'\x00' * 32) -> bytes:
    """HKDF-like key derivation used by WhatsApp."""
    private_key = hmac.new(private_seed, first_iter_data, hashlib.sha256).digest()

    data_block = b""
    output = b""
    permutations = (output_bytes + 31) // 32

    for i in range(1, permutations + 1):
        h = hmac.new(private_key, digestmod=hashlib.sha256)
        h.update(data_block)
        if message:
            h.update(message)
        h.update(bytes([i]))
        data_block = h.digest()
        bytes_to_write = min(output_bytes - len(output), len(data_block))
        output += data_block[:bytes_to_write]

    return output


def parse_crypt15_header(data: bytes):
    """Parse the protobuf header of a crypt15 backup file."""
    protobuf_size = data[0]
    offset = 1

    # Check for feature flag
    if data[offset] == 0x01:
        offset += 1

    protobuf_data = data[offset:offset + protobuf_size]
    offset += protobuf_size

    # Find IV in protobuf (0x0a = field tag, 0x10 = length 16)
    iv = None
    for i in range(len(protobuf_data) - 17):
        if protobuf_data[i] == 0x0a and protobuf_data[i + 1] == 0x10:
            iv = protobuf_data[i + 2:i + 18]
            break

    # Fallback: look for any high-entropy 16-byte sequence
    if iv is None:
        for i in range(len(protobuf_data) - 15):
            candidate = protobuf_data[i:i + 16]
            if not all(b == 0 for b in candidate) and len(set(candidate)) > 4:
                iv = candidate
                break

    return {
        "header_size": offset,
        "iv": iv,
        "protobuf_data": protobuf_data,
    }


def decrypt_crypt15(encrypted_data: bytes, key_hex: str) -> bytes:
    """Decrypt a crypt15 WhatsApp backup."""
    root_key = bytes.fromhex(key_hex)

    # Derive encryption key
    enc_key = encryption_loop(root_key, b"backup encryption", 32)

    # Parse header
    header = parse_crypt15_header(encrypted_data)
    if header["iv"] is None:
        raise ValueError("Could not find IV in backup header")

    iv = header["iv"]
    header_size = header["header_size"]

    # The last 32 bytes: 16-byte auth tag + 16-byte checksum
    encrypted_payload = encrypted_data[header_size:-32]
    auth_tag = encrypted_data[-32:-16]

    # AES-256-GCM with 12-byte IV
    iv12 = iv[:12]
    aesgcm = AESGCM(enc_key)

    # GCM: ciphertext + tag concatenated
    ciphertext_with_tag = encrypted_payload + auth_tag

    try:
        decrypted = aesgcm.decrypt(iv12, ciphertext_with_tag, None)
    except Exception as e:
        raise ValueError(f"AES-GCM decryption failed: {e}")

    # Decompress if zlib
    if decrypted[:1] == b'\x78':
        try:
            decrypted = zlib.decompress(decrypted)
        except zlib.error:
            pass  # Not actually zlib

    # Verify SQLite
    if decrypted[:15] == b"SQLite format 3":
        print("   ✅ Valid SQLite database!")
    else:
        print(f"   ⚠️  First 16 bytes: {decrypted[:16].hex()}")

    return decrypted


def main():
    print("=" * 70)
    print("  WhatsApp Backup Downloader & Decryptor")
    print(f"  Target: {IMPERSONATE_EMAIL}")
    print("=" * 70)

    # 1. Connect to Drive (try impersonation first, fallback to direct)
    try:
        service = get_drive_service(impersonate=True)
        # Test the connection
        service.files().list(pageSize=1, fields="files(id)").execute()
        print("✅ Connected via domain-wide delegation (impersonating user)")
    except Exception as e:
        print(f"⚠️  Impersonation failed: {e}")
        print("   Trying direct service account access...")
        service = get_drive_service(impersonate=False)

    # 2. Search for backups in multiple locations
    appdata_files = list_appdata_files(service)
    wa_files = search_whatsapp_backups(service)
    all_files = list_all_drive_files(service)

    # Print all files found
    print(f"\n{'─' * 70}")
    print(f"📋 ALL FILES ({len(all_files)}):")
    for f in all_files[:50]:
        size = int(f.get("size", 0))
        print(f"   {f['name']:50s}  {size:>12,} bytes  {f.get('modifiedTime', 'N/A')}")
    if len(all_files) > 50:
        print(f"   ... and {len(all_files) - 50} more files")

    # Print appdata files
    if appdata_files:
        print(f"\n📦 APP DATA FILES ({len(appdata_files)}):")
        for f in appdata_files:
            size = int(f.get("size", 0))
            print(f"   {f['name']:50s}  {size:>12,} bytes  {f.get('modifiedTime', 'N/A')}")

    # Print WhatsApp-specific files
    if wa_files:
        print(f"\n📱 WHATSAPP BACKUP FILES ({len(wa_files)}):")
        for f in wa_files:
            size = int(f.get("size", 0))
            print(f"   {f['name']:50s}  {size:>12,} bytes  {f.get('modifiedTime', 'N/A')}")

    # 3. Download and decrypt crypt15 files
    crypt_files = [
        f for f in (appdata_files + wa_files + all_files)
        if "crypt" in f.get("name", "").lower()
    ]

    # Deduplicate by ID
    seen_ids = set()
    unique_crypt = []
    for f in crypt_files:
        if f["id"] not in seen_ids:
            seen_ids.add(f["id"])
            unique_crypt.append(f)

    if not unique_crypt:
        print("\n❌ No .crypt backup files found in Drive.")
        print("   WhatsApp may store backups in appDataFolder which requires")
        print("   the WhatsApp app's own API access, not just Drive access.")
        return

    print(f"\n🔓 Attempting to decrypt {len(unique_crypt)} file(s)...")
    OUTPUT_DIR.mkdir(exist_ok=True)

    for f in unique_crypt:
        print(f"\n{'─' * 70}")
        print(f"📥 Downloading: {f['name']}")
        data, path = download_file(service, f["id"], f["name"])

        for label, key in [("Primary", ENCRYPTION_KEY_HEX), ("Fallback", FALLBACK_KEY_HEX)]:
            print(f"\n   🔑 Trying {label} key: {key[:16]}...")
            try:
                decrypted = decrypt_crypt15(data, key)
                out_db = OUTPUT_DIR / f"decrypted_{Path(f['name']).stem}.db"
                out_db.write_bytes(decrypted)
                print(f"   ✅ SUCCESS with {label} key!")
                print(f"   💾 Saved: {out_db} ({len(decrypted):,} bytes)")
                break
            except Exception as e:
                print(f"   ❌ {label} key failed: {e}")

    # 4. Check AndroidData folder for more files
    android_folders = [f for f in all_files if f["name"] == "AndroidData" and f.get("mimeType") == "application/vnd.google-apps.folder"]
    if android_folders:
        print(f"\n📂 Exploring AndroidData folder(s)...")
        for folder in android_folders:
            try:
                resp = service.files().list(
                    q=f"'{folder['id']}' in parents",
                    fields="files(id, name, size, mimeType, modifiedTime)",
                    pageSize=200,
                ).execute()
                sub_files = resp.get("files", [])
                print(f"   AndroidData ({folder['id']}) contains {len(sub_files)} items:")
                for sf in sub_files:
                    size = int(sf.get("size", 0))
                    print(f"      {sf['name']:50s}  {size:>12,} bytes  {sf.get('mimeType', '')}")

                    # Recurse into subfolders
                    if sf.get("mimeType") == "application/vnd.google-apps.folder":
                        resp2 = service.files().list(
                            q=f"'{sf['id']}' in parents",
                            fields="files(id, name, size, mimeType, modifiedTime)",
                            pageSize=200,
                        ).execute()
                        for sf2 in resp2.get("files", []):
                            size2 = int(sf2.get("size", 0))
                            print(f"         {sf2['name']:47s}  {size2:>12,} bytes  {sf2.get('mimeType', '')}")
            except Exception as e:
                print(f"   Error listing folder: {e}")

    # 5. Analyze headers of downloaded files
    print(f"\n🔍 Analyzing file headers...")
    for fname in sorted(OUTPUT_DIR.iterdir()):
        if fname.suffix == ".crypt15":
            data = fname.read_bytes()
            print(f"\n   {fname.name} ({len(data):,} bytes)")
            print(f"   First 64 bytes (hex): {data[:64].hex()}")
            print(f"   Byte[0] (protobuf size): {data[0]}")
            print(f"   Byte[1]: 0x{data[1]:02x}")

            # Try to parse header
            try:
                hdr = parse_crypt15_header(data)
                print(f"   Header size: {hdr['header_size']}")
                if hdr['iv']:
                    print(f"   IV: {hdr['iv'].hex()}")
                else:
                    print(f"   IV: NOT FOUND")
                print(f"   Protobuf ({len(hdr['protobuf_data'])} bytes): {hdr['protobuf_data'].hex()}")
            except Exception as e:
                print(f"   Header parse error: {e}")

    print(f"\n{'=' * 70}")
    print("Done. Check ./decrypted_backups/ for output files.")


if __name__ == "__main__":
    main()
