# WhatsApp Chat Insights - Interactive AI Analysis Tool

## 🎯 Overview

The **Chat Insights Test Tool** allows you to:
- Load your **decrypted WhatsApp backup data** (1,859 rows from 4 databases)
- Ask **Claude AI** questions about your chats, contacts, and activity
- Get **real-time insights** using your Anthropic API key
- Have an **interactive conversation** in the terminal

## 📊 What Data Is Available

Your decrypted backup contains:

| Category | Count | Details |
|----------|-------|---------|
| **Chats** | 846 | All chat settings, notifications, wallpapers |
| **Contacts** | 278 | Trusted contacts with verification tokens |
| **Activity Logs** | 400 | Contact activity and interaction records |
| **Business Events** | 169 | Business conversation insights |
| **Countries (Pricing)** | 143 | Message costs by country |
| **Premium Templates** | 1+ | Business message templates |

## 🚀 Quick Start

### Option 1: Use the Launcher Script (Easiest)
```bash
bash /home/katyayani/Desktop/whatsapp_backup/whatsapp-backup-monitor/run-chat-insights.sh
```

### Option 2: Run Directly with Python
```bash
# Create venv (first time only)
python3 -m venv /tmp/chat_insights_env
source /tmp/chat_insights_env/bin/activate
pip install anthropic

# Run the tool
cd /home/katyayani/Desktop/whatsapp_backup/whatsapp-backup-monitor
python3 chat-insights-test.py
```

## 💬 Using the Interactive Tool

Once running, you'll see a prompt `You: `. Type your questions:

### Example Questions

**📊 Statistics & Overview:**
```
> How many chats do I have?
> What's my total contact count?
> Summarize my WhatsApp usage
> stats  (shows quick statistics)
```

**🔍 Chat Analysis:**
```
> Which chats are most active?
> List all my chat JIDs
> Show my notification settings
> What conversations are muted?
```

**👥 Contact Insights:**
```
> Show me my trusted contacts
> Which contacts are most recent?
> Analyze my contact patterns
> List all contact IDs
```

**💼 Business Analysis:**
```
> What business events do I have?
> Which countries have highest costs?
> Show my premium message templates
> Summarize my business activity
```

**🎯 Specific Data:**
```
> How many chats have custom notifications?
> What's in my conversation history?
> Analyze my activity patterns
> Show my backup metadata
```

### Available Commands

| Command | Action |
|---------|--------|
| Type any question | Get AI analysis |
| `stats` | Show quick statistics |
| `help` | Show example questions |
| `exit` | Quit the tool |

## 🔧 Technical Details

### Files Created

1. **chat-insights-test.py** - Main interactive tool
   - Loads decrypted chat export JSON
   - Uses Claude API via Anthropic SDK
   - Maintains conversation history
   - Provides real-time analysis

2. **run-chat-insights.sh** - Launcher script
   - Sets up Python virtual environment
   - Installs dependencies automatically
   - Runs the tool with proper configuration

3. **WHATSAPP_CHATS_EXPORT_*.json** - Data file
   - Complete backup data export
   - 1,859 rows from 4 databases
   - Ready for analysis

### How It Works

```
┌─────────────────────────────────────┐
│   Interactive Terminal               │
│   (Your Questions)                   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   chat-insights-test.py             │
│   - Takes your question              │
│   - Loads chat data context          │
│   - Sends to Claude API              │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   Anthropic Claude API              │
│   (claude-haiku-4-5-20251001)       │
│   - Analyzes with backup context    │
│   - Returns insights                 │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   Display Results                   │
│   (Claude's Analysis)                │
└─────────────────────────────────────┘
```

## 📋 Backup Data Structure

The tool has access to:

### From Main WhatsApp Database
- `wa_trusted_contacts` - 278 contacts with JIDs
- `wa_trusted_contacts_send` - 400 activity logs with timestamps
- `wa_props` - WhatsApp configuration properties

### From Chat Settings
- `settings` - 846 chats with complete metadata
  - JID (phone number or ID)
  - Last activity timestamp
  - Notification settings (sound, vibration, popups)
  - Mute status and duration
  - Pinned status
  - Wallpaper preferences (light/dark)
  - Message translation settings

### From Business Messages
- `biz_app_insights_events` - 169 business events
- `premium_message` - message templates
- `marketing_message_pricing_map_table` - pricing by country
- Interactive buttons and draft selections

### From Status Data
- Metadata and key-value store

## 🔐 Security Notes

- **Decrypted data** stays on your local machine
- **API key** is read from your `.env` file
- **No data** is stored on Anthropic servers beyond the current conversation
- All communication is **encrypted via HTTPS**
- Conversation history is **cleared** when you exit

## 🐛 Troubleshooting

### "No chat export file found"
```bash
# Run the extraction script first
python3 /home/katyayani/Desktop/whatsapp_backup/whatsapp-backup-monitor/extract-chats-test.py
```

### "ANTHROPIC_API_KEY not configured"
Check your `.env` file has:
```
ANTHROPIC_API_KEY=sk-ant-xxxxx...
```

### "anthropic package not installed"
The launcher script installs it automatically, but if running manually:
```bash
pip install anthropic
```

### Slow responses
Claude is analyzing your full backup data. First response might take 2-3 seconds.

## 📈 Sample Output

```
You: how many chats do i have

🤔 Claude is analyzing your data...

Claude: Based on your WhatsApp backup data, you have **846 total chats**.

This includes both individual chats and group conversations. From the sample 
data visible, some of your chats include contacts with numbers like:
- 917281813981@s.whatsapp.net
- 919201972060@s.whatsapp.net
- 919201952691@s.whatsapp.net

Would you like me to provide more detailed insights about your chats?

You: stats

📊 WhatsApp Backup Statistics:

💬 Chats: 846
   └─ Muted: 0

👥 Trusted Contacts: 278
📤 Contact Activity Logs: 400
📈 Business Events: 169
💰 Countries with Pricing: 143

You: exit

👋 Goodbye!
```

## 📚 Related Files

- `extract-chats-test.py` - Decryption and extraction tool
- `backup-ai-assistant.py` - Alternative AI analysis tool
- `WHATSAPP_CHATS_EXPORT_*.json` - Raw data export
- `.env` - Configuration (API keys)

## ✨ Summary

This test tool gives you a **complete interactive AI analysis** of your WhatsApp backup right from the terminal. Ask anything about your chats, contacts, or activity, and Claude provides instant insights!

---

**Start now:**
```bash
bash /home/katyayani/Desktop/whatsapp_backup/whatsapp-backup-monitor/run-chat-insights.sh
```
