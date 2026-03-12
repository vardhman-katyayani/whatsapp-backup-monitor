#!/usr/bin/env python3
"""
WhatsApp Messages & Chats Extractor
====================================
Extract all messages, chats, and conversations from decrypted backup
"""

import sqlite3
import json
from pathlib import Path
from datetime import datetime
from collections import defaultdict

DB_DIR = "/home/katyayani/Downloads/AndroidData-20260310T103958Z-3-001"
MAIN_DB = f"{DB_DIR}/wa.db.db"
CHAT_DB = f"{DB_DIR}/chatsettingsbackup.db.db"

class MessagesExtractor:
    def __init__(self):
        self.messages = []
        self.chats = []
        self.contacts = []
    
    def explore_database_structure(self):
        """First, let's explore the actual database structure"""
        print("""
        ╔═══════════════════════════════════════════════════════════════╗
        ║         Exploring Database Structure for Messages             ║
        ║              (Finding where chat data is stored)              ║
        ╚═══════════════════════════════════════════════════════════════╝
        """)
        
        # Check MainDB
        if Path(MAIN_DB).exists():
            print(f"\n📁 Analyzing: wa.db.db")
            print(f"   {'='*60}")
            
            conn = sqlite3.connect(MAIN_DB)
            cursor = conn.cursor()
            
            # Get all tables
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = cursor.fetchall()
            
            print(f"\n   All tables in wa.db.db:")
            for table in tables:
                table_name = table[0]
                try:
                    cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
                    count = cursor.fetchone()[0]
                    
                    # Get column info
                    cursor.execute(f"PRAGMA table_info({table_name})")
                    columns = [col[1] for col in cursor.fetchall()]
                    
                    print(f"\n   📊 Table: {table_name}")
                    print(f"      Rows: {count}")
                    print(f"      Columns: {', '.join(columns[:5])}{'...' if len(columns) > 5 else ''}")
                    
                    # Show sample
                    if count > 0 and table_name not in ['android_metadata', 'sqlite_sequence']:
                        cursor.execute(f"SELECT * FROM {table_name} LIMIT 1")
                        row = cursor.fetchone()
                        if row:
                            print(f"      Sample: {str(row)[:80]}...")
                except Exception as e:
                    print(f"      ⚠ Error: {str(e)[:50]}")
            
            conn.close()
        
        # Check ChatDB
        if Path(CHAT_DB).exists():
            print(f"\n\n📁 Analyzing: chatsettingsbackup.db.db")
            print(f"   {'='*60}")
            
            conn = sqlite3.connect(CHAT_DB)
            cursor = conn.cursor()
            
            # Get all tables
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = cursor.fetchall()
            
            print(f"\n   All tables in chatsettingsbackup.db.db:")
            for table in tables:
                table_name = table[0]
                try:
                    cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
                    count = cursor.fetchone()[0]
                    
                    # Get column info
                    cursor.execute(f"PRAGMA table_info({table_name})")
                    columns = [col[1] for col in cursor.fetchall()]
                    
                    print(f"\n   📊 Table: {table_name}")
                    print(f"      Rows: {count}")
                    print(f"      Columns: {', '.join(columns[:5])}{'...' if len(columns) > 5 else ''}")
                    
                    # Show sample
                    if count > 0:
                        cursor.execute(f"SELECT * FROM {table_name} LIMIT 1")
                        row = cursor.fetchone()
                        if row:
                            print(f"      Sample: {str(row)[:80]}...")
                except Exception as e:
                    print(f"      ⚠ Error: {str(e)[:50]}")
            
            conn.close()
    
    def extract_messages_and_chats(self):
        """Extract actual messages and chat data"""
        print(f"\n\n{'='*70}")
        print(f"EXTRACTING MESSAGES AND CHATS")
        print(f"{'='*70}\n")
        
        # Try to find and extract from any message table
        if Path(MAIN_DB).exists():
            conn = sqlite3.connect(MAIN_DB)
            cursor = conn.cursor()
            
            # Look for message-related columns in any table
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [t[0] for t in cursor.fetchall()]
            
            found_messages = False
            
            for table in tables:
                try:
                    # Get columns
                    cursor.execute(f"PRAGMA table_info({table})")
                    columns = [col[1] for col in cursor.fetchall()]
                    
                    # Check if this looks like a message table
                    message_keywords = ['message', 'text', 'body', 'content', 'chat', 'jid', 'from', 'timestamp']
                    has_message_indicators = any(kw in ' '.join(columns).lower() for kw in message_keywords)
                    
                    if has_message_indicators:
                        cursor.execute(f"SELECT COUNT(*) FROM {table}")
                        count = cursor.fetchone()[0]
                        
                        if count > 0:
                            print(f"📤 Found potential message/chat table: {table}")
                            print(f"   Columns: {', '.join(columns)}")
                            print(f"   Rows: {count}\n")
                            
                            # Try to extract sample data
                            try:
                                cursor.execute(f"SELECT * FROM {table} LIMIT 3")
                                samples = cursor.fetchall()
                                for i, sample in enumerate(samples, 1):
                                    print(f"   Sample {i}: {sample}")
                            except:
                                pass
                            
                            found_messages = True
                except:
                    pass
            
            if not found_messages:
                print("⚠️  No message tables found in wa.db.db")
                print("   The backup might store messages in a different location")
            
            conn.close()

def main():
    extractor = MessagesExtractor()
    
    # First explore the structure
    extractor.explore_database_structure()
    
    # Try to extract
    extractor.extract_messages_and_chats()
    
    # Summary
    print(f"\n{'='*70}")
    print(f"NEXT STEPS")
    print(f"{'='*70}\n")
    
    print("""
Based on the database exploration above:

1. If messages table found:
   → All chat data is accessible and can be exported
   → Use extract-messages.py to export to JSON/CSV

2. If messages not in wa.db.db:
   → Check other backup databases:
     • chatsettingsbackup.db.db
     • smb_backup.db.db
     • stickers_db.bak.db

3. Common WhatsApp message table structures:
   → messages (main message table)
   → message_index
   → chat_list
   → group_jid_map
   → wa_jid (participant info)

4. To extract all data:
   → Use the export scripts provided
   → Filter by chat JID or timestamp
   → Export to JSON/CSV for analysis
""")

if __name__ == "__main__":
    main()
