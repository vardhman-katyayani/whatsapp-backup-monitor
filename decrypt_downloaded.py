#!/usr/bin/env python3
"""
Decrypt the crypt15 files downloaded from Google Drive using wa-crypt-tools.
Works around the self.iv bug in wa-crypt-tools Database15.
"""

import io
import zlib
import sqlite3
from pathlib import Path

from wa_crypt_tools.lib.key.key15 import Key15
from wa_crypt_tools.lib.db.db15 import Database15
from Cryptodome.Cipher import AES

DOWNLOAD_DIR = Path(__file__).parent / "decrypted_backups"
OUTPUT_DIR = Path(__file__).parent / "decrypted_dbs"

KEYS = [
    ("Priya (test-decrypt-priya)", "aca75852758afeaad9c5b1ed81b889daf16b77600c028e33aebb153214ce839a"),
    ("key.txt", "706ded8a9699c258dd3d441dacf1e98c4ca86358d5f3f21a8b766ec0bbbe6385"),
]


def decrypt_file(file_path: Path, key_hex: str) -> bytes:
    """Decrypt crypt15 using wa-crypt-tools with self.iv bug workaround."""
    key_bytes = bytes.fromhex(key_hex)
    key15 = Key15(keyarray=key_bytes)

    data = file_path.read_bytes()
    stream = io.BufferedReader(io.BytesIO(data))

    # Database15.__init__ reads the header and advances stream position
    db = Database15(key=key15, encrypted=stream)

    # BUG WORKAROUND: wa-crypt-tools doesn't set self.iv when parsing from stream
    iv = db.header.c15_iv.IV
    db.iv = iv  # Patch it in

    print(f"      IV: {iv.hex()}")
    print(f"      AES key: {key15.get().hex()[:32]}...")

    # Read remaining bytes (stream is past header now)
    remaining = stream.read()
    print(f"      Encrypted payload: {len(remaining):,} bytes")

    # Use the library's decrypt method (handles auth tag, checksum, multifile)
    decrypted = db.decrypt(key15, remaining)

    # Decompress
    try:
        decrypted = zlib.decompress(decrypted)
        print(f"      Decompressed: {len(decrypted):,} bytes")
    except zlib.error:
        pass  # Not zlib compressed

    return bytes(decrypted)


def analyze_db(db_path: Path):
    """Quick analysis of a decrypted SQLite database."""
    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()

        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = [row[0] for row in cursor.fetchall()]
        print(f"      Tables ({len(tables)}): {', '.join(tables[:15])}")

        for table in ["messages", "message", "chat_list", "wa_contacts",
                       "wa_group_admin_settings", "jid", "chat"]:
            if table in tables:
                cursor.execute(f"SELECT COUNT(*) FROM [{table}]")
                count = cursor.fetchone()[0]
                print(f"      {table}: {count:,} rows")

        if "wa_contacts" in tables:
            cursor.execute("""
                SELECT jid, display_name, number
                FROM wa_contacts
                WHERE display_name IS NOT NULL AND display_name != ''
                LIMIT 10
            """)
            for jid, name, number in cursor.fetchall():
                print(f"        Contact: {name} ({number or jid})")

        if "messages" in tables:
            cursor.execute("""
                SELECT key_remote_jid, data, timestamp
                FROM messages
                WHERE data IS NOT NULL AND data != ''
                ORDER BY timestamp DESC
                LIMIT 5
            """)
            for jid, text, ts in cursor.fetchall():
                preview = (text[:80] + "...") if text and len(text) > 80 else text
                print(f"        Msg [{jid}]: {preview}")

        conn.close()
    except Exception as e:
        print(f"      DB error: {e}")


def main():
    print("=" * 70)
    print("  Crypt15 Decryption (wa-crypt-tools + iv fix)")
    print("=" * 70)

    crypt_files = sorted(DOWNLOAD_DIR.glob("*.crypt15"))
    if not crypt_files:
        print(f"\nNo .crypt15 files in {DOWNLOAD_DIR}")
        return

    OUTPUT_DIR.mkdir(exist_ok=True)
    print(f"\nFound {len(crypt_files)} encrypted files\n")

    success = 0
    for fpath in crypt_files:
        print(f"{'─' * 60}")
        print(f"  {fpath.name} ({fpath.stat().st_size:,} bytes)")

        for label, key_hex in KEYS:
            print(f"   Key: {label}")
            try:
                decrypted = decrypt_file(fpath, key_hex)
                stem = fpath.stem.replace(".crypt15", "").replace(".db", "")
                out_path = OUTPUT_DIR / f"{stem}.db"
                out_path.write_bytes(decrypted)
                print(f"      Saved: {out_path.name} ({len(decrypted):,} bytes)")

                if decrypted[:15] == b"SQLite format 3":
                    print(f"      Valid SQLite!")
                    analyze_db(out_path)
                elif decrypted[:1] == b'{':
                    print(f"      JSON: {decrypted[:200].decode('utf-8', errors='replace')}")
                else:
                    print(f"      First bytes: {decrypted[:20].hex()}")

                success += 1
                break
            except Exception as e:
                print(f"      FAILED: {e}")

    print(f"\n{'=' * 70}")
    print(f"  {success}/{len(crypt_files)} files decrypted successfully")
    print(f"  Output: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
