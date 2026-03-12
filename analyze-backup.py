#!/usr/bin/env python3
"""
WhatsApp Backup Analysis Tool
=============================
Extract messages, contacts, and statistics from decrypted backup
"""

import sqlite3
import json
from pathlib import Path
from datetime import datetime
from collections import defaultdict

BACKUP_DIR = "/home/katyayani/Downloads/AndroidData-20260310T103958Z-3-001"
DB_FILE = f"{BACKUP_DIR}/wa.db.db"

class BackupAnalyzer:
    def __init__(self, db_path):
        self.db_path = db_path
        self.conn = None
        self.cursor = None
        self.connect()
    
    def connect(self):
        """Connect to SQLite database"""
        try:
            self.conn = sqlite3.connect(self.db_path)
            self.cursor = self.conn.cursor()
            print(f"✓ Connected to: {Path(self.db_path).name}")
        except Exception as e:
            print(f"❌ Connection failed: {e}")
            return False
        return True
    
    def get_tables(self):
        """List all tables in database"""
        self.cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        return [row[0] for row in self.cursor.fetchall()]
    
    def get_table_info(self, table):
        """Get columns info for a table"""
        self.cursor.execute(f"PRAGMA table_info({table});")
        return self.cursor.fetchall()
    
    def analyze_tables(self):
        """Analyze database structure"""
        print(f"\n{'='*70}")
        print("DATABASE STRUCTURE")
        print(f"{'='*70}\n")
        
        tables = self.get_tables()
        print(f"Found {len(tables)} tables:\n")
        
        for table in tables:
            info = self.get_table_info(table)
            columns = [col[1] for col in info]
            
            # Get row count
            self.cursor.execute(f"SELECT COUNT(*) FROM {table}")
            count = self.cursor.fetchone()[0]
            
            print(f"📊 {table} ({count} rows)")
            print(f"   Columns: {', '.join(columns)}")
            print()
    
    def extract_messages(self):
        """Extract messages from wa_contacts table or messages table"""
        print(f"\n{'='*70}")
        print("MESSAGE ANALYSIS")
        print(f"{'='*70}\n")
        
        # Try different message table names
        message_tables = ['messages', 'message', 'wa_messages', 'chats']
        message_table = None
        
        tables = self.get_tables()
        for table in message_tables:
            if table in tables:
                message_table = table
                break
        
        if not message_table:
            print("❌ No message table found")
            return
        
        try:
            self.cursor.execute(f"SELECT COUNT(*) FROM {message_table}")
            msg_count = self.cursor.fetchone()[0]
            print(f"Found {msg_count} messages in '{message_table}' table\n")
            
            # Get sample messages
            info = self.get_table_info(message_table)
            columns = [col[1] for col in info]
            print(f"Columns: {', '.join(columns[:5])}...\n")
            
            # Extract stats
            if 'timestamp' in columns or 'jid' in columns:
                self.cursor.execute(f"SELECT * FROM {message_table} LIMIT 5")
                samples = self.cursor.fetchall()
                print("Sample messages:")
                for i, msg in enumerate(samples[:3], 1):
                    print(f"  {i}. {str(msg)[:100]}...")
        except Exception as e:
            print(f"❌ Error reading messages: {e}")
    
    def extract_contacts(self):
        """Extract contacts"""
        print(f"\n{'='*70}")
        print("CONTACTS")
        print(f"{'='*70}\n")
        
        contact_tables = ['wa_contacts', 'contacts', 'contact', 'jid']
        contact_table = None
        
        tables = self.get_tables()
        for table in contact_tables:
            if table in tables:
                contact_table = table
                break
        
        if not contact_table:
            print("❌ No contact table found")
            return
        
        try:
            self.cursor.execute(f"SELECT COUNT(*) FROM {contact_table}")
            contact_count = self.cursor.fetchone()[0]
            print(f"Found {contact_count} contacts\n")
            
            # Get columns
            info = self.get_table_info(contact_table)
            columns = [col[1] for col in info]
            print(f"Columns: {', '.join(columns[:5])}...\n")
            
            # Sample contacts
            self.cursor.execute(f"SELECT * FROM {contact_table} LIMIT 5")
            samples = self.cursor.fetchall()
            print("Sample contacts:")
            for i, contact in enumerate(samples[:3], 1):
                print(f"  {i}. {str(contact)[:100]}...")
        except Exception as e:
            print(f"❌ Error reading contacts: {e}")
    
    def get_statistics(self):
        """Get backup statistics"""
        print(f"\n{'='*70}")
        print("BACKUP STATISTICS")
        print(f"{'='*70}\n")
        
        tables = self.get_tables()
        total_rows = 0
        
        for table in tables:
            try:
                self.cursor.execute(f"SELECT COUNT(*) FROM {table}")
                count = self.cursor.fetchone()[0]
                total_rows += count
            except:
                pass
        
        print(f"Total tables: {len(tables)}")
        print(f"Total rows: {total_rows}")
        
        # File size
        db_size = Path(self.db_path).stat().st_size / (1024*1024)
        print(f"Database size: {db_size:.2f} MB")
        
        print(f"\nTables summary:")
        for table in tables[:10]:
            try:
                self.cursor.execute(f"SELECT COUNT(*) FROM {table}")
                count = self.cursor.fetchone()[0]
                print(f"  • {table}: {count} rows")
            except:
                pass
    
    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()

# Main
print("""
╔═══════════════════════════════════════════════════════════════╗
║        WhatsApp Backup Analysis & Data Extraction             ║
║          Analyzing decrypted databases                        ║
╚═══════════════════════════════════════════════════════════════╝
""")

if not Path(DB_FILE).exists():
    print(f"❌ Database not found: {DB_FILE}")
    print(f"   Make sure test-with-key-derivation.py ran successfully")
    exit(1)

analyzer = BackupAnalyzer(DB_FILE)

# Run analysis
analyzer.analyze_tables()
analyzer.get_statistics()
analyzer.extract_contacts()
analyzer.extract_messages()

analyzer.close()

print(f"\n{'='*70}")
print("Analysis complete!")
print(f"{'='*70}")
