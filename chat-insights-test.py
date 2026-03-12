#!/usr/bin/env python3
"""
WhatsApp Chat Insights - Interactive AI Analysis
Load decrypted chats and ask Claude for insights with Anthropic API
"""

import json
import os
import glob
import sys
from pathlib import Path

# Load .env file without dotenv module
def load_env_file():
    """Load .env file and set environment variables"""
    env_file = "/home/katyayani/Desktop/whatsapp_backup/whatsapp-backup-monitor/.env"
    if os.path.exists(env_file):
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key.strip()] = value.strip()

load_env_file()

try:
    import anthropic
except ImportError:
    print("❌ anthropic package not installed")
    sys.exit(1)

ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY")

class WhatsAppChatInsights:
    def __init__(self):
        """Initialize with decrypted chat data"""
        if not ANTHROPIC_KEY or "your-anthropic" in ANTHROPIC_KEY.lower():
            print("❌ Error: ANTHROPIC_API_KEY not configured")
            print("Add to .env: ANTHROPIC_API_KEY=sk-ant-xxxxx...")
            sys.exit(1)
        
        self.client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
        self.chat_data = {}
        self.conversation_history = []
        self.load_chat_data()
    
    def load_chat_data(self):
        """Load decrypted chat export JSON file"""
        print("📂 Loading decrypted chat data...")
        
        # Find the most recent export file
        export_files = glob.glob(
            "/home/katyayani/Desktop/whatsapp_backup/chat_extraction/WHATSAPP_CHATS_EXPORT_*.json"
        )
        
        if not export_files:
            print("❌ No chat export file found!")
            print("Run: python3 extract-chats-test.py first")
            sys.exit(1)
        
        # Load the most recent file
        latest_file = sorted(export_files)[-1]
        print(f"   Using: {Path(latest_file).name}")
        
        try:
            with open(latest_file, 'r', encoding='utf-8') as f:
                self.chat_data = json.load(f)
            print(f"✓ Loaded {self.chat_data['total_rows']:,} rows from {self.chat_data['total_databases']} databases\n")
        except Exception as e:
            print(f"❌ Error loading chat data: {e}")
            sys.exit(1)
    
    def get_chat_summary(self):
        """Get summary of chat data for context"""
        summary = f"""
WhatsApp Backup Analysis:
- Total Chats: {len(self.chat_data['databases'].get('Chat Settings', {}).get('tables', {}).get('settings', {}).get('data', []))}
- Trusted Contacts: {len(self.chat_data['databases'].get('Main WhatsApp Database', {}).get('tables', {}).get('wa_trusted_contacts', {}).get('data', []))}
- Contact Activity Logs: {len(self.chat_data['databases'].get('Main WhatsApp Database', {}).get('tables', {}).get('wa_trusted_contacts_send', {}).get('data', []))}
- Business Events: {len(self.chat_data['databases'].get('Business Messages', {}).get('tables', {}).get('biz_app_insights_events', {}).get('data', []))}
- Message Pricing Countries: {len(self.chat_data['databases'].get('Business Messages', {}).get('tables', {}).get('marketing_message_pricing_map_table', {}).get('data', []))}
"""
        return summary
    
    def format_chat_data_for_context(self):
        """Format chat data for Claude context"""
        summary = "# WhatsApp Backup Data Available:\n\n"
        
        # Add chat settings
        chats = self.chat_data['databases'].get('Chat Settings', {}).get('tables', {}).get('settings', {}).get('data', [])
        if chats:
            summary += f"## Chats ({len(chats)} total):\n"
            for chat in chats[:5]:  # First 5 chats
                summary += f"- {chat.get('jid', 'System')}: {chat.get('timestamp', 'N/A')}\n"
            summary += "\n"
        
        # Add contacts
        contacts = self.chat_data['databases'].get('Main WhatsApp Database', {}).get('tables', {}).get('wa_trusted_contacts', {}).get('data', [])
        if contacts:
            summary += f"## Trusted Contacts ({len(contacts)} total):\n"
            for contact in contacts[:5]:  # First 5 contacts
                summary += f"- {contact.get('jid', 'Unknown')}: Added {contact.get('incoming_tc_token_timestamp', 'Unknown')}\n"
            summary += "\n"
        
        # Add business events
        events = self.chat_data['databases'].get('Business Messages', {}).get('tables', {}).get('biz_app_insights_events', {}).get('data', [])
        if events:
            summary += f"## Business Events ({len(events)} total):\n"
            summary += f"Event types: {set(e.get('event_category', 'Unknown') for e in events[:10])}\n\n"
        
        return summary
    
    def ask_claude(self, user_question):
        """Send question to Claude with chat data context"""
        self.conversation_history.append({
            "role": "user",
            "content": user_question,
        })
        
        # Build system prompt with chat data
        system_prompt = f"""You are a WhatsApp backup data analyst. You have access to complete WhatsApp backup data from a decrypted database export.

{self.get_chat_summary()}

{self.format_chat_data_for_context()}

The user is asking questions about their WhatsApp backup data. You can:
1. Analyze chat patterns and trends
2. Provide insights about contacts and communication
3. Summarize business events and activity
4. Discuss notification settings and preferences
5. Analyze message pricing by country
6. Identify most active chats and contacts
7. Provide statistics and summaries

Be helpful, informative, and provide specific data-backed insights."""
        
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
            return f"Error communicating with Claude: {str(e)}"
    
    def print_welcome(self):
        """Print welcome screen"""
        print("\n" + "="*70)
        print("╔" + "="*68 + "╗")
        print("║  WhatsApp Chat Insights - AI Analysis                         ║")
        print("║  Powered by Anthropic Claude & Your Decrypted Backup Data     ║")
        print("╚" + "="*68 + "╝")
        print("="*70 + "\n")
        
        print(self.get_chat_summary())
        
        print("Commands:")
        print("  • Type any question about your chats")
        print("  • Type 'stats' to see current statistics")
        print("  • Type 'help' for example questions")
        print("  • Type 'exit' to quit\n")
    
    def print_help(self):
        """Print help with example questions"""
        print("""
💡 Example Questions You Can Ask:

📊 Statistics & Overview:
  • What's the total count of my chats?
  • How many contacts do I have?
  • Summarize my WhatsApp usage
  • What are my top statistics?

🔍 Chat Analysis:
  • Which chats are most active?
  • List all my chat JIDs (phone numbers)
  • Show me my chat notification settings
  • What are my muted conversations?

👥 Contact Insights:
  • Show me my trusted contacts
  • Which contacts are most recent?
  • Analyze my contact activity patterns
  • List all contact IDs

💼 Business Analysis:
  • What business events do I have?
  • Summarize my business activity
  • Which countries have the highest message costs?
  • Show me my premium message templates

🎯 Specific Data:
  • How many chats have custom notifications?
  • What's my conversation history?
  • Analyze my backup metadata
  • Show patterns in my activity

Just ask anything about your WhatsApp backup!
""")
    
    def print_stats(self):
        """Print detailed statistics"""
        print("\n📊 WhatsApp Backup Statistics:\n")
        
        # Chat stats
        chats = self.chat_data['databases'].get('Chat Settings', {}).get('tables', {}).get('settings', {}).get('data', [])
        if chats:
            muted = sum(1 for c in chats if c.get('mute_end_time', 0) > 0)
            print(f"💬 Chats: {len(chats)}")
            print(f"   └─ Muted: {muted}\n")
        
        # Contact stats
        contacts = self.chat_data['databases'].get('Main WhatsApp Database', {}).get('tables', {}).get('wa_trusted_contacts', {}).get('data', [])
        if contacts:
            print(f"👥 Trusted Contacts: {len(contacts)}\n")
        
        # Activity logs
        activity = self.chat_data['databases'].get('Main WhatsApp Database', {}).get('tables', {}).get('wa_trusted_contacts_send', {}).get('data', [])
        if activity:
            print(f"📤 Contact Activity Logs: {len(activity)}\n")
        
        # Business events
        events = self.chat_data['databases'].get('Business Messages', {}).get('tables', {}).get('biz_app_insights_events', {}).get('data', [])
        if events:
            print(f"📈 Business Events: {len(events)}\n")
        
        # Pricing
        pricing = self.chat_data['databases'].get('Business Messages', {}).get('tables', {}).get('marketing_message_pricing_map_table', {}).get('data', [])
        if pricing:
            print(f"💰 Countries with Pricing: {len(pricing)}\n")
    
    def run(self):
        """Run interactive chat"""
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
                    print("\n🤔 Claude is analyzing your data...\n")
                    response = self.ask_claude(user_input)
                    print(f"Claude: {response}\n")
            
            except KeyboardInterrupt:
                print("\n\n👋 Goodbye!")
                break
            except Exception as e:
                print(f"\n❌ Error: {e}\n")

def main():
    """Main entry point"""
    insights = WhatsAppChatInsights()
    insights.run()

if __name__ == "__main__":
    main()
