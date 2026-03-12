#!/bin/bash
# Setup Anthropic API Key for Backup AI Assistant

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║       WhatsApp Backup AI Assistant - Setup                   ║"
echo "║              Configuration Guide                             ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

if grep -q "your-anthropic-api-key-here" /home/katyayani/Desktop/whatsapp_backup/whatsapp-backup-monitor/.env; then
    echo "⚠️  ANTHROPIC_API_KEY is not configured!"
    echo ""
    echo "To get your API key:"
    echo "  1. Go to: https://console.anthropic.com"
    echo "  2. Sign in to your account"
    echo "  3. Click 'API Keys' in the left sidebar"
    echo "  4. Click 'Create Key'"
    echo "  5. Copy the key"
    echo ""
    echo "To add the key:"
    echo "  1. Open: .env file"
    echo "  2. Find: ANTHROPIC_API_KEY=..."
    echo "  3. Replace with: ANTHROPIC_API_KEY=sk-ant-xxxxx..."
    echo "  4. Save and close"
    echo ""
    echo "Then run: node backup-ai-assistant.js"
else
    echo "✓ ANTHROPIC_API_KEY is configured!"
    echo ""
    echo "Starting WhatsApp Backup AI Assistant..."
    echo ""
    node /home/katyayani/Desktop/whatsapp_backup/whatsapp-backup-monitor/backup-ai-assistant.js
fi
