#!/usr/bin/env python3
"""Quick test of the AI assistant to verify it works"""

import os
import json
from pathlib import Path
from dotenv import load_dotenv

load_dotenv("/home/katyayani/Desktop/whatsapp_backup/whatsapp-backup-monitor/.env")

try:
    import anthropic
except ImportError:
    print("❌ anthropic package not installed")
    exit(1)

ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY")
BACKUP_DATA_DIR = "/home/katyayani/Downloads/AndroidData-20260310T103958Z-3-001/extracted_data"

if not ANTHROPIC_KEY or "your-anthropic" in ANTHROPIC_KEY.lower():
    print("❌ Error: ANTHROPIC_API_KEY not configured in .env")
    print("Visit: https://console.anthropic.com to get your key")
    exit(1)

# Load backup data
print("📂 Loading backup data...")
backup_data = {}
data_files = [
    "chat_settings.json",
    "trusted_contacts.json",
    "sent_contact_tokens.json",
    "business_activity.json",
]

for file in data_files:
    file_path = Path(BACKUP_DATA_DIR) / file
    if file_path.exists():
        with open(file_path) as f:
            backup_data[file.replace(".json", "")] = json.load(f)
            print(f"   ✓ {file}")

print("\n✓ Data loaded!\n")

# Test Claude response
print("=" * 70)
print("Testing Claude API with a simple question...")
print("=" * 70 + "\n")

client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)

summary = f"""
Backup Summary:
- Chats: {len(backup_data.get('chat_settings', []))} 
- Contacts: {len(backup_data.get('trusted_contacts', []))}
- Activity Logs: {len(backup_data.get('sent_contact_tokens', []))}
- Business Events: {len(backup_data.get('business_activity', []))}
"""

system_prompt = f"""You are a WhatsApp backup analysis assistant. {summary}

Answer the user's question about their backup data concisely."""

message = client.messages.create(
    model="claude-haiku-4-5-20251001",
    max_tokens=256,
    system=system_prompt,
    messages=[
        {"role": "user", "content": "How many chats do I have?"}
    ],
)

print("Question: How many chats do I have?\n")
print(f"Claude: {message.content[0].text}\n")

print("=" * 70)
print("✅ API is working! You can now run:")
print("   python backup-ai-assistant.py")
print("=" * 70)
