#!/usr/bin/env python3
"""
Detailed Chat Data Viewer
Shows exactly what information is available for each chat
"""

import json
import glob

# Load the exported chat data
export_files = sorted(glob.glob(
    "/home/katyayani/Desktop/whatsapp_backup/chat_extraction/WHATSAPP_CHATS_EXPORT_*.json"
))

if not export_files:
    print("❌ No chat export file found!")
    exit(1)

with open(export_files[-1], 'r', encoding='utf-8') as f:
    chat_data = json.load(f)

def show_chat_Details(jid):
    """Show all available details for a specific chat"""
    chats = chat_data['databases'].get('Chat Settings', {}).get('tables', {}).get('settings', {}).get('data', [])
    
    # Find matching chat
    matching_chat = None
    for chat in chats:
        if chat.get('jid') == jid:
            matching_chat = chat
            break
    
    if not matching_chat:
        print(f"\n❌ Chat not found: {jid}")
        return
    
    print("\n" + "="*80)
    print(f"DETAILED VIEW: {jid}")
    print("="*80)
    
    print("\n✅ AVAILABLE DATA FOR THIS CHAT:\n")
    
    # Organize data by category
    categories = {
        "Contact Information": ["jid"],
        "Activity": ["timestamp"],
        "Notification Settings": [
            "notification_tone",
            "notification_light",
            "notification_vibration",
            "call_notification_tone",
            "custom_notification_sound",
            "pop_up_notification_setting",
            "mute_end_time"
        ],
        "Display Settings": [
            "wallpaper_light",
            "wallpaper_dark",
            "background_color_light",
            "background_color_dark"
        ],
        "Features": [
            "message_translation_enabled",
            "ephemeral_expiration",
            "security_notification_enabled"
        ],
        "Chat Status": [
            "compact_pinned_messages_setting",
            "group_setting_type"
        ]
    }
    
    for category, fields in categories.items():
        print(f"\n📌 {category}:")
        for field in fields:
            if field in matching_chat:
                value = matching_chat[field]
                print(f"   {field:40s}: {value}")
    
    print("\n" + "="*80)
    print("❌ NOT AVAILABLE (Message Content):")
    print("="*80)
    print("""
   - Message text content
   - Message sender/receiver
   - Message timestamps
   - Message attachments
   - Conversation history
   - Media files
   - Call logs
   - Voice messages
   
   ⚠️  This is a security feature. Messages are stored separately
       and heavily encrypted on your device.
""")

def main():
    # Show summary
    chats = chat_data['databases'].get('Chat Settings', {}).get('tables', {}).get('settings', {}).get('data', [])
    
    print("\n" + "="*80)
    print("WHATSAPP CHAT DATA - WHAT'S AVAILABLE")
    print("="*80)
    
    print(f"\nTotal chats in backup: {len(chats)}\n")
    
    # Show first few chats
    print("Sample chats available:\n")
    for i, chat in enumerate(chats[1:11], 1):  # Skip first (default settings), show next 10
        jid = chat.get('jid', 'Unknown')
        print(f"{i:2d}. {jid}")
    
    print(f"\n... and {len(chats) - 11} more chats\n")
    
    while True:
        print("\nOptions:")
        print("  1. View details for a specific chat")
        print("  2. Show example data structure")
        print("  3. List all chats")
        print("  4. Read the full limitation report")
        print("  5. Exit")
        
        choice = input("\nChoose (1-5): ").strip()
        
        if choice == "1":
            jid = input("Enter chat JID (e.g., 917281813981@s.whatsapp.net): ").strip()
            if jid:
                show_chat_Details(jid)
        
        elif choice == "2":
            print("\n" + "="*80)
            print("EXAMPLE CHAT DATA STRUCTURE")
            print("="*80)
            
            if chats:
                example = chats[1]  # Get second chat (skip defaults)
                print("\n```json")
                print(json.dumps(example, indent=2)[:1000])  # First 1000 chars
                print("...more data...")
                print("```")
        
        elif choice == "3":
            print("\n" + "="*80)
            print(f"ALL CHATS ({len(chats)})")
            print("="*80 + "\n")
            for i, chat in enumerate(chats, 1):
                print(f"{i:3d}. {chat.get('jid', 'Unknown')}")
        
        elif choice == "4":
            try:
                with open("/home/katyayani/Desktop/whatsapp_backup/whatsapp-backup-monitor/DATA_LIMITATION_REPORT.md", 'r') as f:
                    print("\n" + f.read())
            except:
                print("❌ Report file not found")
        
        elif choice == "5":
            print("\n👋 Goodbye!")
            break
        
        else:
            print("❌ Invalid option")

if __name__ == "__main__":
    main()
