#!/usr/bin/env python3
"""
Enhanced WhatsApp Chat Extractor
Extracts detailed chat information and provides a searchable interface
"""

import json
import glob
from pathlib import Path
from datetime import datetime

# Load the exported chat data
export_files = sorted(glob.glob(
    "/home/katyayani/Desktop/whatsapp_backup/chat_extraction/WHATSAPP_CHATS_EXPORT_*.json"
))

if not export_files:
    print("❌ No chat export file found!")
    exit(1)

with open(export_files[-1], 'r', encoding='utf-8') as f:
    chat_data = json.load(f)

def search_chat_by_jid(jid):
    """Search for a specific chat by JID"""
    chats = chat_data['databases'].get('Chat Settings', {}).get('tables', {}).get('settings', {}).get('data', [])
    
    for chat in chats:
        if chat.get('jid') == jid or jid.lower() in str(chat.get('jid', '')).lower():
            return chat
    return None

def search_contact_by_jid(jid):
    """Search for a contact by JID"""
    contacts = chat_data['databases'].get('Main WhatsApp Database', {}).get('tables', {}).get('wa_trusted_contacts', {}).get('data', [])
    
    for contact in contacts:
        if contact.get('jid') == jid:
            return contact
    return None

def list_all_chats():
    """List all chats with detailed information"""
    chats = chat_data['databases'].get('Chat Settings', {}).get('tables', {}).get('settings', {}).get('data', [])
    
    print(f"\n{'='*80}")
    print(f"ALL CHATS ({len(chats)} total)")
    print(f"{'='*80}\n")
    
    for i, chat in enumerate(chats, 1):
        jid = chat.get('jid', 'Unknown')
        timestamp = chat.get('timestamp', 'N/A')
        muted = chat.get('mute_end_time', 0) > 0
        pinned = chat.get('compact_pinned_messages_setting', 0)
        
        print(f"{i:3d}. {jid:45s} | Last: {timestamp:15s} | Muted: {str(muted):5s} | Pinned: {pinned}")
    
    return chats

def list_all_contacts():
    """List all trusted contacts"""
    contacts = chat_data['databases'].get('Main WhatsApp Database', {}).get('tables', {}).get('wa_trusted_contacts', {}).get('data', [])
    
    print(f"\n{'='*80}")
    print(f"ALL TRUSTED CONTACTS ({len(contacts)} total)")
    print(f"{'='*80}\n")
    
    for i, contact in enumerate(contacts[:50], 1):  # Show first 50
        jid = contact.get('jid', 'Unknown')
        timestamp = contact.get('incoming_tc_token_timestamp', 'N/A')
        
        print(f"{i:3d}. {jid:40s} | Added: {timestamp}")
    
    if len(contacts) > 50:
        print(f"\n... and {len(contacts) - 50} more contacts")
    
    return contacts

def show_chat_details(jid):
    """Show detailed information for a specific chat"""
    chat = search_chat_by_jid(jid)
    
    if not chat:
        print(f"\n❌ Chat not found for: {jid}")
        return
    
    print(f"\n{'='*80}")
    print(f"CHAT DETAILS: {jid}")
    print(f"{'='*80}\n")
    
    for key, value in chat.items():
        if key not in ['jid']:
            print(f"  {key:40s}: {value}")

def show_contact_details(jid):
    """Show detailed information for a specific contact"""
    contact = search_contact_by_jid(jid)
    
    if not contact:
        print(f"\n❌ Contact not found for: {jid}")
        return
    
    print(f"\n{'='*80}")
    print(f"CONTACT DETAILS: {jid}")
    print(f"{'='*80}\n")
    
    for key, value in contact.items():
        print(f"  {key:40s}: {value}")

def main():
    print("\n" + "="*80)
    print("WHATSAPP CHAT EXTRACTOR - Enhanced View")
    print("="*80 + "\n")
    
    while True:
        print("\nOptions:")
        print("  1. List all chats (846 total)")
        print("  2. List all contacts (278 total)")
        print("  3. Search chat by JID (e.g., 917281813981@s.whatsapp.net)")
        print("  4. Show chat details")
        print("  5. Show contact details")
        print("  6. Export all data to CSV")
        print("  7. Exit")
        
        choice = input("\nChoose option (1-7): ").strip()
        
        if choice == "1":
            list_all_chats()
        elif choice == "2":
            list_all_contacts()
        elif choice == "3":
            jid = input("Enter JID to search: ").strip()
            chat = search_chat_by_jid(jid)
            if chat:
                print(f"\n✓ Found chat: {chat.get('jid')}")
                show_details = input("Show full details? (y/n): ").strip().lower()
                if show_details == 'y':
                    show_chat_details(chat.get('jid'))
            else:
                print(f"❌ Chat not found for: {jid}")
        elif choice == "4":
            jid = input("Enter full JID: ").strip()
            show_chat_details(jid)
        elif choice == "5":
            jid = input("Enter full JID: ").strip()
            show_contact_details(jid)
        elif choice == "6":
            export_to_csv()
        elif choice == "7":
            print("\n👋 Goodbye!")
            break
        else:
            print("❌ Invalid option")

def export_to_csv():
    """Export all chats to CSV format"""
    import csv
    
    chats = chat_data['databases'].get('Chat Settings', {}).get('tables', {}).get('settings', {}).get('data', [])
    
    output_file = "/home/katyayani/Desktop/whatsapp_backup/chat_extraction/all_chats.csv"
    
    if not chats:
        print("❌ No chats to export")
        return
    
    try:
        with open(output_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=chats[0].keys())
            writer.writeheader()
            writer.writerows(chats)
        
        print(f"✓ Exported {len(chats)} chats to: {output_file}")
    except Exception as e:
        print(f"❌ Export failed: {e}")

if __name__ == "__main__":
    main()
