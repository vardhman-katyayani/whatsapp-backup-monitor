#!/usr/bin/env python3
"""
Comprehensive Message & Chat Extractor
========================================
Search all decrypted databases for message and chat content
"""

import sqlite3
import json
from pathlib import Path
from datetime import datetime

DB_DIR = "/home/katyayani/Downloads/AndroidData-20260310T103958Z-3-001"

def search_all_databases():
    """Search all decrypted databases for data"""
    
    print("""
    ╔═══════════════════════════════════════════════════════════════╗
    ║     Searching All Decrypted Databases for Messages & Chats    ║
    ╚═══════════════════════════════════════════════════════════════╝
    """)
    
    db_files = [
        "wa.db.db",
        "chatsettingsbackup.db.db",
        "commerce_backup.db.db",
        "smb_backup.db.db",
        "status_backup.db.db",
        "stickers_db.bak.db"
    ]
    
    results = {}
    
    for db_file in db_files:
        db_path = f"{DB_DIR}/{db_file}"
        
        if not Path(db_path).exists():
            continue
        
        print(f"\n{'='*70}")
        print(f"Scanning: {db_file}")
        print(f"{'='*70}\n")
        
        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            
            # Get all tables
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [t[0] for t in cursor.fetchall()]
            
            file_data = {
                'tables': {},
                'has_messages': False,
                'has_chats': False,
                'has_contacts': False
            }
            
            for table in tables:
                try:
                    cursor.execute(f"SELECT COUNT(*) FROM {table}")
                    count = cursor.fetchone()[0]
                    
                    if count > 0:
                        # Get columns
                        cursor.execute(f"PRAGMA table_info({table})")
                        columns = [col[1] for col in cursor.fetchall()]
                        
                        print(f"✓ {table}: {count} rows")
                        print(f"  Columns: {', '.join(columns[:6])}{'...' if len(columns) > 6 else ''}")
                        
                        file_data['tables'][table] = {
                            'rows': count,
                            'columns': columns
                        }
                        
                        # Check if this looks like message/chat/contact data
                        lower_cols = ' '.join(columns).lower()
                        if any(kw in lower_cols for kw in ['message', 'text', 'body', 'content']):
                            file_data['has_messages'] = True
                            print(f"  → This appears to contain MESSAGES")
                        
                        if any(kw in lower_cols for kw in ['chat', 'conversation', 'from', 'to']):
                            file_data['has_chats'] = True
                            print(f"  → This appears to contain CHAT data")
                        
                        if any(kw in lower_cols for kw in ['contact', 'jid', 'phone', 'number']):
                            file_data['has_contacts'] = True
                            print(f"  → This appears to contain CONTACTS")
                        
                        # Show sample data
                        try:
                            cursor.execute(f"SELECT * FROM {table} LIMIT 1")
                            row = cursor.fetchone()
                            if row:
                                print(f"  Sample: {str(row)[:100]}...\n")
                        except:
                            pass
                except Exception as e:
                    pass
            
            if file_data['tables']:
                results[db_file] = file_data
            else:
                print("(No tables with data)")
            
            conn.close()
            
        except Exception as e:
            print(f"❌ Error: {e}")
    
    # Summary
    print(f"\n{'='*70}")
    print(f"SUMMARY")
    print(f"{'='*70}\n")
    
    has_any_messages = False
    has_any_chats = False
    has_any_contacts = False
    
    for db_file, data in results.items():
        print(f"📊 {db_file}")
        print(f"   Tables with data: {len(data['tables'])}")
        
        if data['has_messages']:
            print(f"   ✓ Contains MESSAGE data")
            has_any_messages = True
        
        if data['has_chats']:
            print(f"   ✓ Contains CHAT data")
            has_any_chats = True
        
        if data['has_contacts']:
            print(f"   ✓ Contains CONTACT data")
            has_any_contacts = True
        
        print()
    
    # Export data
    if has_any_messages or has_any_chats or has_any_contacts:
        print(f"\n{'='*70}")
        print(f"DATA FOUND - NEXT STEPS")
        print(f"{'='*70}\n")
        
        if has_any_messages:
            print("✓ Messages found! Use: python extract-and-export.py")
        
        if has_any_chats:
            print("✓ Chats found! Use: python extract-and-export.py")
        
        if has_any_contacts:
            print("✓ Contacts found! Use: python extract-and-export.py")
    else:
        print(f"\n{'='*70}")
        print(f"⚠️  STATUS: Limited Data in Backup")
        print(f"{'='*70}\n")
        
        print("""
This WhatsApp backup appears to have minimal or no active messages/chats.
This can happen if:
1. The backup was created from a cleaned/fresh WhatsApp installation
2. Messages were deleted before backup
3. This is from a test or burner account
4. The backup timestamp is old

Data that IS available:
• Account settings and configurations
• Sticker packs and stickers
• Business/commerce data
• Contact information (if stored)

To extract what IS available, run: python extract-and-export.py
""")

if __name__ == "__main__":
    search_all_databases()
