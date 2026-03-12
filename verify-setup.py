#!/usr/bin/env python3
"""
Verification Script for WhatsApp Backup AI Assistant
=====================================================
Check if everything is set up correctly
"""

import os
import sys
import json
from pathlib import Path
from dotenv import load_dotenv

# Load env
load_dotenv()
load_dotenv("/home/katyayani/Desktop/whatsapp_backup/whatsapp-backup-monitor/.env")

print("""
╔═══════════════════════════════════════════════════════════════╗
║     WhatsApp Backup AI Assistant - Setup Verification        ║
╚═══════════════════════════════════════════════════════════════╝
""")

# Check 1: API Key
print("1️⃣  Checking ANTHROPIC_API_KEY...")
api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()

if not api_key:
    print("   ❌ Not set in .env")
elif "your-anthropic" in api_key.lower():
    print("   ❌ Placeholder key detected")
    print("   → You need to add your real API key")
elif api_key.startswith("sk-ant-"):
    print("   ✓ Valid API key format detected")
else:
    print(f"   ⚠️  Unexpected key format: {api_key[:20]}...")

# Check 2: Python packages
print("\n2️⃣  Checking Python packages...")

try:
    import anthropic
    print("   ✓ anthropic package installed")
except ImportError:
    print("   ❌ anthropic not installed")
    print("   → Run: pip install anthropic")

try:
    from dotenv import load_dotenv
    print("   ✓ python-dotenv installed")
except ImportError:
    print("   ❌ python-dotenv not installed")
    print("   → Run: pip install python-dotenv")

# Check 3: Extracted data files
print("\n3️⃣  Checking extracted backup data...")

data_dir = Path("/home/katyayani/Downloads/AndroidData-20260310T103958Z-3-001/extracted_data")

if not data_dir.exists():
    print(f"   ❌ Data directory not found: {data_dir}")
    print("   → Run extract-and-export.py first")
else:
    print(f"   ✓ Data directory found")
    
    required_files = [
        "chat_settings.json",
        "trusted_contacts.json",
        "sent_contact_tokens.json",
        "business_activity.json",
    ]
    
    missing = []
    for file in required_files:
        file_path = data_dir / file
        if file_path.exists():
            size = file_path.stat().st_size / 1024
            print(f"   ✓ {file} ({size:.1f} KB)")
        else:
            print(f"   ❌ {file} missing")
            missing.append(file)
    
    if missing:
        print(f"   → Run extract-and-export.py to generate missing files")

# Check 4: Scripts
print("\n4️⃣  Checking assistant scripts...")

scripts = [
    ("backup-ai-assistant.py", "Python version"),
    ("backup-ai-assistant.js", "Node.js version"),
    ("run-backup-ai.sh", "Bash launcher"),
]

script_dir = Path("/home/katyayani/Desktop/whatsapp_backup/whatsapp-backup-monitor")

for script, desc in scripts:
    script_path = script_dir / script
    if script_path.exists():
        print(f"   ✓ {script} ({desc})")
    else:
        print(f"   ❌ {script} missing")

# Summary
print("\n" + "="*70)
print("SETUP CHECKLIST")
print("="*70 + "\n")

setup_status = []

# Check API key
if api_key and api_key.startswith("sk-ant-"):
    setup_status.append(("ANTHROPIC_API_KEY", "✓ Ready"))
else:
    setup_status.append(("ANTHROPIC_API_KEY", "❌ Not configured"))

# Check packages
try:
    import anthropic, dotenv
    setup_status.append(("Python Packages", "✓ Ready"))
except:
    setup_status.append(("Python Packages", "❌ Missing"))

# Check data
if data_dir.exists():
    files = list(data_dir.glob("*.json"))
    setup_status.append(("Extracted Data", f"✓ Ready ({len(files)} files)"))
else:
    setup_status.append(("Extracted Data", "❌ Missing"))

# Check scripts
if (script_dir / "backup-ai-assistant.py").exists():
    setup_status.append(("Assistant Scripts", "✓ Ready"))
else:
    setup_status.append(("Assistant Scripts", "❌ Missing"))

for item, status in setup_status:
    print(f"{item:25} {status}")

# Final instructions
print("\n" + "="*70)
print("NEXT STEPS")
print("="*70 + "\n")

if api_key and api_key.startswith("sk-ant-"):
    print("✅ Everything is set up! Run:")
    print("   python backup-ai-assistant.py")
else:
    print("1️⃣  Get API key from: https://console.anthropic.com")
    print("\n2️⃣  Add to .env:")
    print("   ANTHROPIC_API_KEY=sk-ant-xxxxx...")
    print("\n3️⃣  Run:")
    print("   python backup-ai-assistant.py")

print("\n" + "="*70)
