#!/usr/bin/env python3
"""
WhatsApp Backup Detailed Analysis
==================================
Extract actual messages, chats, and contacts
"""

import sqlite3
import json
from pathlib import Path
from datetime import datetime

DB_FILE = "/home/katyayani/Downloads/AndroidData-20260310T103958Z-3-001/wa.db.db"

def analyze_backup():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    print("""
    ╔═══════════════════════════════════════════════════════════════╗
    ║           WhatsApp Backup Detailed Analysis                   ║
    ║         (Extracting messages, chats, and contacts)            ║
    ╚═══════════════════════════════════════════════════════════════╝
    """)
    
    # Get all tables with row counts
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    all_tables = cursor.fetchall()
    
    print(f"{'='*70}")
    print(f"KEY TABLES WITH DATA")
    print(f"{'='*70}\n")
    
    # Check key tables
    key_tables = {
        'chat_list': 'Chats/Conversations',
        'messages': 'Messages',
        'message': 'Messages (alt)',
        'wa_message': 'WhatsApp Messages',
        'jid': 'JID (contacts)',
        'wa_jid': 'WhatsApp JID',
        'wa_contacts': 'Contacts',
        'chat': 'Chat (alt)',
        'groups': 'Groups',
        'wa_group_add_allow_list': 'Group info'
    }
    
    tables_with_data = {}
    
    for table_name in [t[0] for t in all_tables]:
        try:
            cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
            count = cursor.fetchone()[0]
            if count > 0:
                tables_with_data[table_name] = count
        except:
            pass
    
    if tables_with_data:
        print(f"Found {len(tables_with_data)} tables with data:\n")
        for table, count in sorted(tables_with_data.items(), key=lambda x: x[1], reverse=True):
            label = key_tables.get(table, table)
            print(f"  📊 {table:30} | {count:6} rows | {label}")
    else:
        print("No tables with data found in main database")
    
    # Try to find and analyze chat_list
    if 'chat_list' in tables_with_data:
        print(f"\n{'='*70}")
        print(f"CHATS ANALYSIS")
        print(f"{'='*70}\n")
        
        try:
            cursor.execute("PRAGMA table_info(chat_list)")
            columns = [col[1] for col in cursor.fetchall()]
            print(f"Columns: {', '.join(columns[:8])}...\n")
            
            cursor.execute("SELECT COUNT(*) FROM chat_list")
            chat_count = cursor.fetchone()[0]
            print(f"Total chats: {chat_count}\n")
            
            # Get sample chats
            cursor.execute("SELECT * FROM chat_list LIMIT 10")
            chats = cursor.fetchall()
            
            print("Sample chats:")
            for i, chat in enumerate(chats[:5], 1):
                print(f"  {i}. JID: {chat[0] if len(chat) > 0 else 'N/A'}")
                
        except Exception as e:
            print(f"Error analyzing chat_list: {e}")
    
    # Try to find messages
    msg_tables = ['messages', 'message', 'wa_message', 'chat_messages']
    msg_table = None
    
    for table in msg_tables:
        if table in tables_with_data:
            msg_table = table
            break
    
    if msg_table:
        print(f"\n{'='*70}")
        print(f"MESSAGES ANALYSIS")
        print(f"{'='*70}\n")
        
        try:
            cursor.execute(f"PRAGMA table_info({msg_table})")
            columns = [col[1] for col in cursor.fetchall()]
            print(f"Table: {msg_table}")
            print(f"Columns: {', '.join(columns[:5])}...\n")
            
            cursor.execute(f"SELECT COUNT(*) FROM {msg_table}")
            msg_count = cursor.fetchone()[0]
            print(f"Total messages: {msg_count}\n")
            
            # Get sample messages
            cursor.execute(f"SELECT * FROM {msg_table} LIMIT 5")
            messages = cursor.fetchall()
            
            if messages:
                print("Sample messages (first 80 chars):")
                for i, msg in enumerate(messages[:3], 1):
                    msg_str = str(msg)[:80]
                    print(f"  {i}. {msg_str}...")
        except Exception as e:
            print(f"Error analyzing messages: {e}")
    
    # Check contacts
    contact_tables = ['wa_contacts', 'contacts', 'jid', 'wa_jid']
    contact_table = None
    
    for table in contact_tables:
        if table in tables_with_data:
            contact_table = table
            break
    
    if contact_table:
        print(f"\n{'='*70}")
        print(f"CONTACTS ANALYSIS")
        print(f"{'='*70}\n")
        
        try:
            cursor.execute(f"SELECT COUNT(*) FROM {contact_table}")
            contact_count = cursor.fetchone()[0]
            print(f"Total contacts: {contact_count}\n")
            
            # Sample contacts
            cursor.execute(f"SELECT * FROM {contact_table} LIMIT 5")
            contacts = cursor.fetchall()
            
            if contacts:
                print("Sample contacts (first 100 chars):")
                for i, contact in enumerate(contacts[:3], 1):
                    contact_str = str(contact)[:100]
                    print(f"  {i}. {contact_str}...")
        except Exception as e:
            print(f"Error analyzing contacts: {e}")
    
    # Summary statistics
    print(f"\n{'='*70}")
    print(f"BACKUP SUMMARY")
    print(f"{'='*70}\n")
    
    total_rows = sum(tables_with_data.values())
    db_size = Path(DB_FILE).stat().st_size / (1024*1024)
    
    print(f"Database file: wa.db.db ({db_size:.2f} MB)")
    print(f"Total tables with data: {len(tables_with_data)}")
    print(f"Total rows across all tables: {total_rows}")
    
    if msg_table:
        cursor.execute(f"SELECT COUNT(*) FROM {msg_table}")
        msgs = cursor.fetchone()[0]
        print(f"\n📨 Messages: {msgs}")
    
    if contact_table:
        cursor.execute(f"SELECT COUNT(*) FROM {contact_table}")
        contacts = cursor.fetchone()[0]
        print(f"👥 Contacts: {contacts}")
    
    if 'chat_list' in tables_with_data:
        print(f"💬 Chats: {tables_with_data['chat_list']}")
    
    print(f"\n{'='*70}")
    print(f"✓ Backup successfully decrypted and analyzed!")
    print(f"{'='*70}")
    
    conn.close()

if __name__ == "__main__":
    if not Path(DB_FILE).exists():
        print(f"❌ Database not found: {DB_FILE}")
        exit(1)
    
    analyze_backup()
