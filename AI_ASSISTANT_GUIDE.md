# WhatsApp Backup AI Assistant - Setup Guide

## Overview

The **WhatsApp Backup AI Assistant** is an interactive terminal tool that lets you ask questions about your WhatsApp backup data. It uses Claude AI (Anthropic) to provide intelligent analysis and insights.

## Prerequisites

- ✓ WhatsApp backup decrypted
- ✓ Data extracted to JSON files
- ✓ Python 3.x or Node.js installed
- ✓ Anthropic API key

## Step 1: Get Your API Key

1. Go to: **https://console.anthropic.com**
2. Sign in with your account (create one if needed)
3. Click **"API Keys"** in the left sidebar
4. Click **"Create Key"**
5. Copy the key (starts with `sk-ant-`)

## Step 2: Add API Key to .env

Edit `.env` file in this directory:

```bash
# Find this line:
ANTHROPIC_API_KEY=your-anthropic-api-key-here

# Replace with your actual key:
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxx
```

## Step 3: Run the Assistant

### Option A: Python Version (Recommended)
```bash
python backup-ai-assistant.py
```

### Option B: Node.js Version
```bash
node backup-ai-assistant.js
```

### Option C: Using Bash Script
```bash
bash run-backup-ai.sh
```

## How to Use

Once the assistant starts, you'll see:
```
======================================================================
WhatsApp Backup AI Assistant
Ask questions about your backup data in natural language
======================================================================

WhatsApp Backup Summary:
- Chats/Settings: 846 entries
- Contacts (Incoming): 278
- Contact Activity: 400 logs
...

Commands:
  • Type your question
  • Type 'stats' for statistics
  • Type 'help' for example questions
  • Type 'exit' to quit

You: 
```

## Example Questions

### About Statistics
```
You: How many chats do I have?
Claude: Based on your backup data, you have 846 chat entries...

You: What's my contact count?
Claude: You have 278 incoming trusted contacts...
```

### About Analysis
```
You: Which countries have the highest message costs?
Claude: Looking at your message pricing data, the most expensive countries are...

You: Analyze my business activity
Claude: Your business activity shows 169 events across...
```

### About Insights
```
You: What can you tell me about my WhatsApp usage?
Claude: Your backup reveals several patterns...

You: Summarize my sticker usage
Claude: You have 121 sticker packs with 88 individual stickers...
```

## Available Data

The AI has access to:
- **chat_settings.json** - 846 chat configurations
- **trusted_contacts.json** - 278 contacts
- **sent_contact_tokens.json** - 400 activity logs
- **business_activity.json** - 169 business events
- **sticker_packs.json** - 121 sticker packs
- **premium_messages.json** - Message templates
- **message_pricing.json** - Country pricing data

## Commands

| Command | What it does |
|---------|--------------|
| Type any question | Ask Claude about your backup data |
| `stats` | Show detailed statistics |
| `help` | Show example questions |
| `exit` | Quit the assistant |

## Example Conversations

### Conversation 1: Understanding Your Contacts
```
You: Tell me about my trusted contacts
Claude: You have 278 incoming trusted contacts. Each contact has:
- JID identifier
- Incoming token for verification
- Timestamp of when the token was received

These represent contacts you've communicated with...

You: Can you list some contact JIDs?
Claude: Looking at your trusted contacts data, here are some example JIDs:
- 121564771160231@lid
- 267598071619715@lid
- 227397177737375@lid

The @lid suffix indicates these are likely WhatsApp ID numbers...
```

### Conversation 2: Business Activity Analysis
```
You: What business features am I using?
Claude: Your backup shows 169 business-related events across...

You: What dates are these events from?
Claude: The events span from late 2024 through early 2025...
```

## Troubleshooting

### "ANTHROPIC_API_KEY not configured properly"
**Solution**: Make sure your API key is correctly added to `.env`
```bash
# Check if key is set
grep ANTHROPIC_API_KEY .env

# Should show: ANTHROPIC_API_KEY=sk-ant-xxxxx
```

### "anthropic package not installed"
**Solution**: Install the package
```bash
pip install anthropic
```

### "No data loaded"
**Solution**: Make sure extracted data is in the correct location
```bash
ls /home/katyayani/Downloads/AndroidData-20260310T103958Z-3-001/extracted_data/
```

### "API Error"
**Solution**: Check your API key is valid and has available quota
- Visit https://console.anthropic.com
- Check "Usage" section
- Verify API key hasn't been revoked

## Features

✅ **Real-time Q&A** - Ask questions in natural language
✅ **Context-aware** - Claude knows all your backup data
✅ **Conversation history** - Maintains context across questions
✅ **Statistics** - Quick access to backup stats
✅ **Help examples** - Built-in guidance
✅ **Data insights** - Intelligent analysis of patterns

## Privacy & Security

- ✅ Data stays on your computer
- ✅ Only questions + backup summaries sent to API
- ✅ Anthropic Claude processes requests
- ✅ No data stored permanently on API servers
- ✅ Your encryption key is never sent

## What You Can Do

📊 **Analyze** your WhatsApp usage patterns
🔍 **Search** for specific information
📈 **Track** business activity
👥 **Understand** your contacts
💬 **Ask** any natural language question
🎨 **Explore** sticker usage

## Example Use Cases

1. **Before upgrading your phone**: Get a summary of all your WhatsApp data
2. **Backup analysis**: Understand what you're backing up
3. **Data migration**: Know what data needs to be transferred
4. **Forensic analysis**: Analyze communication patterns
5. **Statistics**: Generate reports about your usage

## Tips & Tricks

- Ask follow-up questions - Claude remembers context
- Be specific - More details = better answers
- Use natural language - Talk like you normally would
- Ask for formats - "Show as a list", "Give statistics", etc.
- Clarify if needed - "What do you mean by..." works

## Advanced Usage

### Batch Processing
Ask multiple questions in sequence:
```
You: How many chats?
You: Which are muted?
You: Show me statistics?
You: Analyze activity
```

### Detailed Analysis
```
You: Can you provide a comprehensive analysis of my WhatsApp usage including
     chat distribution, contact information, business activity, and sticker usage?

Claude: [Provides detailed multi-section analysis]
```

## Support

For issues:
1. Check troubleshooting section above
2. Verify API key is valid
3. Ensure backup data is properly extracted
4. Check Anthropic API status: https://status.anthropic.com

## Next Steps

1. ✅ Get your API key
2. ✅ Add to `.env`
3. ✅ Run the assistant
4. ✅ Start asking questions!

---

**Enjoy exploring your WhatsApp backup data!** 🚀
