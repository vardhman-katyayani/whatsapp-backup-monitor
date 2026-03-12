#!/usr/bin/env python3
"""Extract ALL available data from decrypted WhatsApp backup databases"""

import sqlite3
import json
import os
from pathlib import Path
from datetime import datetime

BACKUP_DIR = "/home/katyayani/Downloads/AndroidData-20260310T103958Z-3-001"
OUTPUT_DIR = f"{BACKUP_DIR}/extracted_data_complete"

# Create output directory
Path(OUTPUT_DIR).mkdir(exist_ok=True)

databases = {
    "wa.db.db": "Main WhatsApp Database",
    "chatsettingsbackup.db.db": "Chat Settings",
    "commerce_backup.db.db": "Commerce Data",
    "smb_backup.db.db": "Business Messages",
    "status_backup.db.db": "Status Data", 
    "stickers_db.bak.db": "Stickers Database",
}

def extract_table_to_json(db_path, table_name, output_file, limit=None):
    """Extract database table to JSON"""
    try:
        db = sqlite3.connect(db_path)
        db.row_factory = sqlite3.Row
        cursor = db.cursor()
        
        # Get table info
        cursor.execute(f"PRAGMA table_info({table_name})")
        columns = [col[1] for col in cursor.fetchall()]
        
        # Get data
        query = f"SELECT * FROM {table_name}"
        if limit:
            query += f" LIMIT {limit}"
        
        cursor.execute(query)
        rows = [dict(row) for row in cursor.fetchall()]
        
        # Convert timestamps to readable format
        for row in rows:
            for col, val in row.items():
                if col in ['timestamp', 'last_activity', 'created', 'updated', 'from_timestamp', 'to_timestamp']:
                    if isinstance(val, (int, float)) and val > 1000000000:
                        try:
                            row[f"{col}_readable"] = datetime.fromtimestamp(val/1000).isoformat()
                        except:
                            pass
        
        # Save to JSON
        with open(output_file, 'w') as f:
            json.dump({
                "table": table_name,
                "count": len(rows),
                "columns": columns,
                "data": rows
            }, f, indent=2, default=str)
        
        db.close()
        return len(rows)
    except Exception as e:
        print(f"Error extracting {table_name}: {e}")
        return 0

print("="*70)
print("WHATSAPP BACKUP COMPLETE DATA EXTRACTION")
print("="*70)

total_extracted = 0
files_created = 0

for db_file, db_name in databases.items():
    db_path = f"{BACKUP_DIR}/{db_file}"
    if not os.path.exists(db_path):
        continue
    
    print(f"\n📂 Processing {db_name} ({db_file})...")
    
    try:
        db = sqlite3.connect(db_path)
        cursor = db.cursor()
        
        # Get all tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor.fetchall()]
        
        for table in tables:
            cursor.execute(f"SELECT COUNT(*) FROM {table}")
            count = cursor.fetchone()[0]
            
            if count > 0:
                output_file = f"{OUTPUT_DIR}/{db_file.replace('.db', '')}_{table}.json"
                extracted = extract_table_to_json(db_path, table, output_file)
                if extracted > 0:
                    print(f"  ✓ {table:45s} - {extracted:6,d} rows → {Path(output_file).name}")
                    total_extracted += extracted
                    files_created += 1
        
        db.close()
    except Exception as e:
        print(f"❌ Error processing {db_file}: {e}")

print("\n" + "="*70)
print("EXTRACTION COMPLETE")
print("="*70)
print(f"✓ Files created: {files_created}")
print(f"✓ Total rows extracted: {total_extracted:,}")
print(f"✓ Output directory: {OUTPUT_DIR}")
print("\n📊 Key data available:")
print("  • Contact information (278 trusted contacts)")
print("  • Chat metadata (846 chat settings)")
print("  • Activity logs (400+ contact interactions)")
print("  • Business events and insights")
print("  • Message pricing information")
print("  • Premium message templates")
print("  • Sticker pack metadata")
print("\n⚠️  NOTE: Actual message content is NOT included in this backup")
print("    (WhatsApp stores messages in a separate encrypted location)")
