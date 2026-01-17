# Extract WhatsApp Encryption Key via ADB

## The Real Solution

For password-based E2E encrypted backups, WhatsApp stores the encryption key on their HSM servers.
The password protects that key on the server - it's NOT used to derive the key locally.

However, WhatsApp also stores a copy of the key in the app's data folder on your device!

## Method: Extract Key via ADB Backup

### Step 1: Enable USB Debugging
1. On your phone, go to Settings → About Phone
2. Tap "Build Number" 7 times to enable Developer Options
3. Go to Settings → Developer Options → Enable "USB Debugging"

### Step 2: Connect Phone and Run ADB
Connect your phone via USB, then run these commands:

```bash
# Check device is connected
adb devices

# Create a backup of WhatsApp (will prompt on phone - DO NOT set a password)
adb backup -f whatsapp_backup.ab -noapk com.whatsapp

# Convert the backup to tar
dd if=whatsapp_backup.ab bs=24 skip=1 | python -c "import zlib,sys;sys.stdout.buffer.write(zlib.decompress(sys.stdin.buffer.read()))" > whatsapp_backup.tar

# Or use Android Backup Extractor (abe.jar)
java -jar abe.jar unpack whatsapp_backup.ab whatsapp_backup.tar

# Extract the tar
tar -xf whatsapp_backup.tar

# The key file should be at:
# apps/com.whatsapp/f/encrypted_backup.key
```

### Step 3: Use the Key
Once you have `encrypted_backup.key`, copy it here and run:

```bash
node decrypt-with-key.js
```

## Important Notes
- This method works because WhatsApp allows ADB backup (it's not disabled)
- The key file is about 158 bytes (serialized Java object)
- If the phone prompts for backup password, leave it EMPTY
