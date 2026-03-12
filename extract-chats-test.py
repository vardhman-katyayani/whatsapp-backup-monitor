#!/usr/bin/env python3
"""
Extract Chats from Already Decrypted WhatsApp Backups
Exports all chat data to a comprehensive test file
"""

import sqlite3
import json
import os
from pathlib import Path
from datetime import datetime

# Path to already decrypted databases
DECRYPTED_DIR = "/home/katyayani/Downloads/AndroidData-20260310T103958Z-3-001"
OUTPUT_DIR = "/home/katyayani/Desktop/whatsapp_backup/chat_extraction"

Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)

def extract_from_database(db_file, db_name):
    """Extract all available data from a database"""
    print(f"\n📊 Processing: {db_name}")
    
    all_data = {
        'database': db_name,
        'file': db_file,
        'tables': {}
    }
    
    try:
        conn = sqlite3.connect(db_file)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Get all tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor.fetchall()]
        print(f"  Found {len(tables)} tables")
        
        # Extract data from each table
        for table in tables:
            try:
                cursor.execute(f"SELECT COUNT(*) FROM {table}")
                count = cursor.fetchone()[0]
                
                if count > 0:
                    cursor.execute(f"PRAGMA table_info({table})")
                    columns = [col[1] for col in cursor.fetchall()]
                    
                    cursor.execute(f"SELECT * FROM {table}")
                    rows = cursor.fetchall()
                    
                    all_data['tables'][table] = {
                        'row_count': count,
                        'columns': columns,
                        'data': [dict(row) for row in rows]
                    }
                    
                    print(f"    ✓ {table:45s} - {count:6,d} rows")
            except Exception as e:
                print(f"    ✗ {table:45s} - Error: {e}")
        
        conn.close()
        return all_data
    except Exception as e:
        print(f"  ✗ Error reading database: {e}")
        return None

def main():
    print("="*70)
    print("WhatsApp Chat Data Extraction from Decrypted Backups")
    print("="*70)
    
    # Database files to process
    databases = [
        ("wa.db.db", "Main WhatsApp Database"),
        ("chatsettingsbackup.db.db", "Chat Settings"),
        ("smb_backup.db.db", "Business Messages"),
        ("status_backup.db.db", "Status Data"),
    ]
    
    all_chats = {}
    total_rows = 0
    
    for db_file, db_name in databases:
        full_path = f"{DECRYPTED_DIR}/{db_file}"
        
        if os.path.exists(full_path):
            data = extract_from_database(full_path, db_name)
            if data:
                all_chats[db_name] = data
                for table_data in data['tables'].values():
                    total_rows += table_data['row_count']
        else:
            print(f"  ⚠ File not found: {full_path}")
    
    # Create comprehensive output file
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    output_file = f"{OUTPUT_DIR}/WHATSAPP_CHATS_EXPORT_{timestamp}.json"
    
    output = {
        'extraction_timestamp': datetime.now().isoformat(),
        'source_directory': DECRYPTED_DIR,
        'total_databases': len(all_chats),
        'total_tables': sum(len(db['tables']) for db in all_chats.values()),
        'total_rows': total_rows,
        'databases': all_chats
    }
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, default=str, ensure_ascii=False)
    
    print("\n" + "="*70)
    print("✅ EXTRACTION COMPLETE")
    print("="*70)
    print(f"\n📄 Output file created:")
    print(f"   {output_file}")
    print(f"\n📊 Summary:")
    print(f"   • Databases processed: {len(all_chats)}")
    print(f"   • Total tables: {sum(len(db['tables']) for db in all_chats.values())}")
    print(f"   • Total rows exported: {total_rows:,}")
    print(f"\n💾 File size: {os.path.getsize(output_file) / (1024*1024):.2f} MB")

if __name__ == "__main__":
    main()
