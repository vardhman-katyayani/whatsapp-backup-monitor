# How to Find encrypted_backup.key File

## On Your Android Phone

### Method 1: Using File Manager (No Root)
1. Open a file manager app (Files, ES File Explorer, etc.)
2. Enable "Show hidden files" 
3. Navigate to: `/sdcard/WhatsApp/Databases/`
4. Look for: `encrypted_backup.key`
5. If found, copy it to your computer

### Method 2: Using ADB (If USB Debugging Enabled)
```bash
adb pull /sdcard/WhatsApp/Databases/encrypted_backup.key .
```

### Method 3: Check Internal Storage
Sometimes the key is in:
- `/data/data/com.whatsapp/files/encrypted_backup.key` (requires root)
- `/sdcard/Android/data/com.whatsapp/files/`

## If You Find the Key File

Once you have `encrypted_backup.key`, place it in the project folder and I can update the script to use it directly - this will be much more reliable than password-based decryption.

## Quick Python Install (Alternative)

If you want to use wa-crypt-tools:
1. Download Python from: https://www.python.org/downloads/
2. During install, check "Add Python to PATH"
3. Then run:
   ```bash
   pip install wa-crypt-tools
   wadecrypt --password "test@123" msgstore.db.crypt15 msgstore.db
   ```
