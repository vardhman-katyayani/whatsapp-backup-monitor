# 🔑 How to Get Your WhatsApp Encryption Key

## The Problem
For password-based E2E encrypted backups, the actual encryption key is stored on WhatsApp's servers (HSM).
Your password RETRIEVES the key from servers - it doesn't derive the key locally.

However, WhatsApp ALSO stores a copy of this key on your device at:
`/data/data/com.whatsapp/files/encrypted_backup.key`

## Solution Options

### Option 1: Use WhatsApp Key/DB Extractor (Easiest - No Root)

This tool uses an old WhatsApp APK that allows ADB backup to extract the key.

1. Download from: https://github.com/YuvrajRaghuvanshiS/WhatsApp-Key-Database-Extractor
2. Run: `python3 wa_kdbe.py`
3. Follow the prompts
4. The key will be extracted to `extracted/encrypted_backup.key`
5. Copy it here

### Option 2: Direct ADB Backup (If WhatsApp allows)

1. Enable USB Debugging on your phone:
   - Settings → About Phone → Tap "Build Number" 7 times
   - Settings → Developer Options → USB Debugging → ON

2. Install ADB:
   - Download: https://developer.android.com/studio/releases/platform-tools
   - Extract to C:\platform-tools

3. Connect phone and run:
   ```powershell
   cd C:\platform-tools
   .\adb devices
   .\adb backup -f whatsapp.ab -noapk com.whatsapp
   ```
   
4. On your phone, tap "Back up my data" (leave password EMPTY)

5. Extract the backup:
   ```powershell
   # Use Android Backup Extractor
   java -jar abe.jar unpack whatsapp.ab whatsapp.tar
   tar -xf whatsapp.tar
   ```

6. Find the key at: `apps/com.whatsapp/f/encrypted_backup.key`

### Option 3: Root Access (Most Direct)

If your phone is rooted:
```bash
adb shell su -c "cat /data/data/com.whatsapp/files/encrypted_backup.key" > encrypted_backup.key
```

### Option 4: Use the 64-Digit Key

If you chose "Use 64-digit key" when enabling E2E backup:
1. Open WhatsApp → Settings → Chats → Chat backup
2. Tap "End-to-end encrypted backup"
3. View your 64-digit key
4. Create a file called `key.txt` with just the 64 characters
5. Run: `node decrypt-with-key.js`

## After Getting the Key

Once you have `encrypted_backup.key` in this folder, run:
```powershell
node decrypt-with-key.js
```

This will decrypt your backup and save it as `msgstore.db`!
