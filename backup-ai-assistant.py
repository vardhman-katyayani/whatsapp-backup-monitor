#!/usr/bin/env python3
"""
WhatsApp Backup AI Assistant
=============================
Interactive CLI to ask questions about WhatsApp backup data
Powered by Anthropic Claude AI
"""

import os
import json
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
load_dotenv("/home/katyayani/Desktop/whatsapp_backup/whatsapp-backup-monitor/.env")

try:
    import anthropic
except ImportError:
    print("❌ anthropic package not installed")
    print("Install with: pip install anthropic")
    sys.exit(1)

ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY")
BACKUP_DATA_DIR = "/home/katyayani/Downloads/AndroidData-20260310T103958Z-3-001/extracted_data_complete"

class BackupAIAssistant:
    def __init__(self):
        if not ANTHROPIC_KEY or "your-anthropic" in ANTHROPIC_KEY.lower():
            print("❌ Error: ANTHROPIC_API_KEY not configured properly")
            print("\nTo use this tool:")
            print("  1. Get your API key from: https://console.anthropic.com")
            print("  2. Open .env file in this directory")
            print("  3. Set: ANTHROPIC_API_KEY=sk-ant-xxxxx...")
            print("  4. Save and run again")
            sys.exit(1)
        
        self.client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
        self.backup_data = {}
        self.conversation_history = []
        self.load_backup_data()
    
    def load_backup_data(self):
        """Load extracted backup data from JSON files"""
        print("📂 Loading backup data...")
        
        # New comprehensive data files
        data_files = [
            "wa_wa_trusted_contacts.json",
            "wa_wa_trusted_contacts_send.json",
            "chatsettingsbackup_settings.json",
            "smb_backup_biz_app_insights_events.json",
            "smb_backup_premium_message.json",
            "smb_backup_premium_message_draft_contact_selections.json",
            "smb_backup_marketing_message_pricing_map_table.json",
            "stickers_db.bak_downloadable_sticker_packs.json",
            "stickers_db.bak_stickers.json",
            "wa_wa_props.json",
        ]
        
        for file in data_files:
            file_path = Path(BACKUP_DATA_DIR) / file
            if file_path.exists():
                try:
                    with open(file_path) as f:
                        data = json.load(f)
                        # Store both the raw data and metadata
                        key = file.replace(".json", "").replace("_", " ").title()
                        if "data" in data:
                            self.backup_data[key] = data["data"]
                        else:
                            self.backup_data[key] = data
                    print(f"   ✓ Loaded {file}")
                except Exception as e:
                    print(f"   ⚠ Error loading {file}: {e}")
        
        print("\n✓ Backup data loaded successfully!\n")
    
    def get_backup_summary(self):
        """Get a summary of backup statistics"""
        return f"""
WhatsApp Backup Summary:
- Chats/Settings: {len(self.backup_data.get('chat_settings', []))} entries
- Contacts (Incoming): {len(self.backup_data.get('trusted_contacts', []))}
- Contact Activity: {len(self.backup_data.get('sent_contact_tokens', []))} logs
- Business Activity: {len(self.backup_data.get('business_activity', []))} events
- Sticker Packs: {len(self.backup_data.get('sticker_packs', []))}
- Premium Messages: {len(self.backup_data.get('premium_messages', []))}
"""
    
    def ask(self, user_question):
        """Send question to Claude and get response"""
        # Add user message to history
        self.conversation_history.append({
            "role": "user",
            "content": user_question,
        })
        
        # Create system prompt with actual backup data
        import json
        
        # Build complete data context with actual data
        data_context = f"""You are analyzing a complete WhatsApp backup with the following ACTUAL data available:

BACKUP CONTENTS:

1. TRUSTED CONTACTS ({len(self.backup_data.get('Wa Wa Trusted Contacts', []))} contacts):
{json.dumps(self.backup_data.get('Wa Wa Trusted Contacts', [])[:10], indent=2)}

2. CONTACT ACTIVITY LOG ({len(self.backup_data.get('Wa Wa Trusted Contacts Send', []))} records):
{json.dumps(self.backup_data.get('Wa Wa Trusted Contacts Send', [])[:5], indent=2)}

3. CHAT SETTINGS & METADATA ({len(self.backup_data.get('Chatsettingsbackup Settings', []))} chats):
{json.dumps(self.backup_data.get('Chatsettingsbackup Settings', [])[:5], indent=2)}

4. BUSINESS INSIGHTS & EVENTS ({len(self.backup_data.get('Smb Backup Biz App Insights Events', []))} events):
{json.dumps(self.backup_data.get('Smb Backup Biz App Insights Events', [])[:5], indent=2)}

5. MESSAGE PRICING ({len(self.backup_data.get('Smb Backup Marketing Message Pricing Map Table', []))} countries):
{json.dumps(self.backup_data.get('Smb Backup Marketing Message Pricing Map Table', [])[:5], indent=2)}

6. PREMIUM MESSAGE TEMPLATES:
{json.dumps(self.backup_data.get('Smb Backup Premium Message', []), indent=2)}

7. STICKER PACKS ({len(self.backup_data.get('Stickers Db.bak Downloadable Sticker Packs', []))} packs):
{json.dumps(self.backup_data.get('Stickers Db.bak Downloadable Sticker Packs', [])[:3], indent=2)}

DATA AVAILABILITY NOTICE:
✓ Contact information and metadata
✓ Chat settings and notification preferences  
✓ Activity logs and timestamps
✓ Business events and insights
✓ Message pricing by country
✓ Premium message templates
✓ Sticker information
✗ Actual message content (text/media) - stored separately in encrypted location
✗ Call logs - not included in backup

INSTRUCTIONS:
1. Use the ACTUAL DATA above when answering questions
2. Provide specific details from the data
3. Analyze patterns and trends from available data
4. Be transparent about limitations (no message content)
5. Offer insights about contacts, settings, and activity"""
        
        system_prompt = f"""You are a WhatsApp backup analysis assistant. {data_context}"""
        
        try:
            response = self.client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=1024,
                system=system_prompt,
                messages=self.conversation_history,
            )
            
            assistant_message = response.content[0].text
            
            # Add to history
            self.conversation_history.append({
                "role": "assistant",
                "content": assistant_message,
            })
            
            return assistant_message
        except Exception as e:
            return f"Sorry, I encountered an error: {str(e)}"
    
    def print_welcome(self):
        """Print welcome screen"""
        print("\n" + "="*70)
        print("╔" + "="*68 + "╗")
        print("║  WhatsApp Backup AI Assistant                                    ║")
        print("║  Ask questions about your backup data in natural language        ║")
        print("╚" + "="*68 + "╝")
        print("="*70 + "\n")
        
        print(self.get_backup_summary())
        
        print("Commands:")
        print("  • Type your question")
        print("  • Type 'stats' for statistics")
        print("  • Type 'help' for example questions")
        print("  • Type 'exit' to quit\n")
        
        print("Example Questions:")
        print("  ❓ How many chats do I have?")
        print("  ❓ What's my contact count?")
        print("  ❓ Summarize my business activity")
        print("  ❓ Which countries have highest message costs?\n")
    
    def print_help(self):
        """Print help with example questions"""
        print("""
Example Questions You Can Ask:

📊 Statistics & Summaries:
  • How many chats do I have?
  • What's my total contact count?
  • Show me a summary of business activity
  • What sticker packs am I using?
  • List my chat settings

📈 Analysis:
  • Which countries have the highest message costs?
  • Analyze my contact activity patterns
  • What were my most active dates?
  • Summary of business events

💬 Specific Queries:
  • Tell me about my trusted contacts
  • What premium messages do I have?
  • List all sticker pack names
  • Show me chat notification settings

🔍 Insights:
  • What can you tell me about my WhatsApp usage?
  • Analyze my backup structure
  • What business features am I using?
  • Suggest patterns in my activity

Just ask any natural language question!
""")
    
    def print_stats(self):
        """Print detailed statistics"""
        print("\n📊 Detailed Statistics:\n")
        
        if self.backup_data.get('chat_settings'):
            length = len(self.backup_data['chat_settings'])
            muted = sum(1 for c in self.backup_data['chat_settings'] if c.get('muted_notifications'))
            print(f"💬 Chats: {length}")
            print(f"   - Muted: {muted}\n")
        
        if self.backup_data.get('trusted_contacts'):
            print(f"👥 Incoming Contacts: {len(self.backup_data['trusted_contacts'])}\n")
        
        if self.backup_data.get('sent_contact_tokens'):
            print(f"📤 Contact Activity: {len(self.backup_data['sent_contact_tokens'])}\n")
        
        if self.backup_data.get('business_activity'):
            length = len(self.backup_data['business_activity'])
            unique = len(set(e['chat_jid'] for e in self.backup_data['business_activity']))
            print(f"📈 Business Events: {length}")
            print(f"   - Unique Chats: {unique}\n")
        
        if self.backup_data.get('sticker_packs'):
            print(f"🎨 Sticker Packs: {len(self.backup_data['sticker_packs'])}\n")
        
        if self.backup_data.get('message_pricing'):
            length = len(self.backup_data['message_pricing'])
            avg = sum(p['message_cost'] for p in self.backup_data['message_pricing']) / length
            print(f"💰 Countries with Pricing: {length}")
            print(f"   - Average Cost: ${avg:.4f}\n")
    
    def run(self):
        """Run the interactive assistant"""
        self.print_welcome()
        
        while True:
            try:
                user_input = input("You: ").strip()
                
                if not user_input:
                    continue
                
                if user_input.lower() == "exit":
                    print("\n👋 Goodbye!")
                    break
                elif user_input.lower() == "help":
                    self.print_help()
                elif user_input.lower() == "stats":
                    self.print_stats()
                else:
                    print("\n🤔 Claude is thinking...\n")
                    response = self.ask(user_input)
                    print(f"Claude: {response}\n")
            
            except KeyboardInterrupt:
                print("\n\n👋 Goodbye!")
                break
            except Exception as e:
                print(f"\n❌ Error: {e}\n")

def main():
    """Main entry point"""
    assistant = BackupAIAssistant()
    assistant.run()

if __name__ == "__main__":
    main()
