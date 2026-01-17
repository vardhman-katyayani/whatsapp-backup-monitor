# Quick Python Setup for WhatsApp Decryption

## Step 1: Install Python

1. Download Python from: https://www.python.org/downloads/
2. **IMPORTANT**: During installation, check ✅ "Add Python to PATH"
3. Click "Install Now"
4. Wait for installation to complete

## Step 2: Install wa-crypt-tools

Open PowerShell or Command Prompt in this folder and run:

```bash
pip install wa-crypt-tools
```

## Step 3: Decrypt Your Backup

Run this command:

```bash
wadecrypt --password "test@123" msgstore.db.crypt15 msgstore.db
```

Or use the Python script:

```bash
python decrypt-with-python.py
```

## That's It!

The decrypted database will be saved as `msgstore.db` which you can then parse to see your messages.

## Troubleshooting

If `pip` is not recognized:
- Make sure you checked "Add Python to PATH" during installation
- Restart your terminal/PowerShell
- Try: `python -m pip install wa-crypt-tools`

If `wadecrypt` is not recognized:
- Try: `python -m wa_crypt_tools decrypt --password "test@123" msgstore.db.crypt15 msgstore.db`
