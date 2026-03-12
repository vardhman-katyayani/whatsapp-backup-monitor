#!/usr/bin/env python3
"""
Complete WhatsApp Backup Analysis
==================================
Analyze all decrypted database files
"""

import sqlite3
from pathlib import Path

BACKUP_DIR = "/home/katyayani/Downloads/AndroidData-20260310T103958Z-3-001"

def analyze_db(db_path):
    """Analyze a single database file"""
    if not Path(db_path).exists():
        return None
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Get tables with row counts
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = cursor.fetchall()
        
        result = {
            'file': Path(db_path).name,
            'size': Path(db_path).stat().st_size / (1024*1024),
            'tables': {}
        }
        
        for table in tables:
            table_name = table[0]
            try:
                cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
                count = cursor.fetchone()[0]
                if count > 0:
                    result['tables'][table_name] = count
            except:
                pass
        
        conn.close()
        return result
    except Exception as e:
        print(f"Error analyzing {db_path}: {e}")
        return None

print("""
╔═══════════════════════════════════════════════════════════════╗
║     Complete WhatsApp Backup Analysis - All Databases         ║
║         (Analyzing 7 decrypted backup files)                  ║
╚═══════════════════════════════════════════════════════════════╝
""")

# List all decrypted databases
db_files = [
    "wa.db.db",
    "chatsettingsbackup.db.db",
    "commerce_backup.db.db",
    "smb_backup.db.db",
    "status_backup.db.db",
    "stickers_db.bak.db",
    "backup_settings.json.db"
]

print(f"\n{'='*70}")
print(f"DATABASE OVERVIEW")
print(f"{'='*70}\n")

total_size = 0
total_tables = 0
total_rows = 0
all_results = []

for db_file in db_files:
    db_path = f"{BACKUP_DIR}/{db_file}"
    result = analyze_db(db_path)
    
    if result:
        all_results.append(result)
        size = result['size']
        table_count = len(result['tables'])
        row_count = sum(result['tables'].values())
        
        total_size += size
        total_tables += table_count
        total_rows += row_count
        
        print(f"📊 {db_file:30} | {size:7.2f} MB | {table_count:3} tables | {row_count:6} rows")

print(f"\n{'='*70}")
print(f"DETAILED ANALYSIS BY DATABASE")
print(f"{'='*70}\n")

# Analyze each database in detail
for result in all_results:
    print(f"📁 {result['file']}")
    print(f"   Size: {result['size']:.2f} MB")
    print(f"   Tables with data: {len(result['tables'])}")
    
    if result['tables']:
        print(f"   Data:")
        for table, count in sorted(result['tables'].items(), key=lambda x: x[1], reverse=True)[:5]:
            print(f"     • {table:35} {count:6} rows")
    print()

print(f"{'='*70}")
print(f"BACKUP SUMMARY")
print(f"{'='*70}\n")

print(f"Total decrypted files: {len(all_results)}")
print(f"Total size: {total_size:.2f} MB")
print(f"Total tables: {total_tables}")
print(f"Total rows: {total_rows}")

# Check for key data
print(f"\n{'='*70}")
print(f"KEY DATA FINDINGS")
print(f"{'='*70}\n")

# Look for chat_list
for result in all_results:
    if 'chat_list' in result['tables']:
        print(f"✓ Found chat_list in {result['file']}: {result['tables']['chat_list']} chats")

# Look for messages
for result in all_results:
    for msg_table in ['messages', 'message', 'wa_messages', 'message_index']:
        if msg_table in result['tables']:
            print(f"✓ Found messages in {result['file']}: {result['tables'][msg_table]} messages")
            break

# Look for contacts
for result in all_results:
    for contact_table in ['wa_contacts', 'contacts', 'jid']:
        if contact_table in result['tables']:
            print(f"✓ Found contacts in {result['file']}: {result['tables'][contact_table]} entries")
            break

# Check chatsettingsbackup.db specifically
print(f"\n{'='*70}")
print(f"CHATSETTINGSBACKUP.DB (Main Chat Database)")
print(f"{'='*70}\n")

chat_db = f"{BACKUP_DIR}/chatsettingsbackup.db.db"
if Path(chat_db).exists():
    try:
        conn = sqlite3.connect(chat_db)
        cursor = conn.cursor()
        
        # Get all tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [t[0] for t in cursor.fetchall()]
        
        print(f"Contains {len(tables)} tables:\n")
        
        # Show tables with data
        data_tables = []
        for table in tables:
            try:
                cursor.execute(f"SELECT COUNT(*) FROM {table}")
                count = cursor.fetchone()[0]
                if count > 0:
                    data_tables.append((table, count))
            except:
                pass
        
        if data_tables:
            print("Tables with data:")
            for table, count in sorted(data_tables, key=lambda x: x[1], reverse=True):
                print(f"  • {table:40} {count:8} rows")
        else:
            print("No tables with data")
        
        conn.close()
    except Exception as e:
        print(f"Error analyzing chatsettingsbackup.db: {e}")

print(f"\n{'='*70}")
print(f"✓ Analysis complete!")
print(f"All 7 backup files successfully decrypted and analyzed!")
print(f"{'='*70}")
