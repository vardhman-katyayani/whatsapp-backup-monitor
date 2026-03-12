#!/bin/bash
# Quick launcher for WhatsApp Chat Insights Test Tool
# Sets up environment and runs the interactive AI analyzer

echo "🚀 Starting WhatsApp Chat Insights..."
echo "   (Loading Claude with your decrypted backup data)"
echo ""

# Create venv if it doesn't exist
if [ ! -d "/tmp/chat_insights_env" ]; then
    echo "⏳ Setting up environment (first time only)..."
    python3 -m venv /tmp/chat_insights_env
    source /tmp/chat_insights_env/bin/activate
    pip install anthropic -q
else
    source /tmp/chat_insights_env/bin/activate
fi

# Run the insights tool
python /home/katyayani/Desktop/whatsapp_backup/whatsapp-backup-monitor/chat-insights-test.py

# Deactivate venv
deactivate
