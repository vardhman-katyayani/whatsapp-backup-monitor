# How to Get WhatsApp Backup from Your Phone

## Method 1: Using File Manager (Android)

1. **Enable "Show hidden files"** in your file manager settings

2. **Navigate to WhatsApp folder:**
   ```
   /sdcard/WhatsApp/Databases/
   ```
   OR
   ```
   /storage/emulated/0/WhatsApp/Databases/
   ```

3. **Look for files named:**
   - `msgstore.db.crypt14` (newer format)
   - `msgstore.db.crypt15` (newest format)
   - `msgstore.db.crypt12` (older format)

4. **Copy the file** to your computer (via USB, email, or cloud storage)

5. **Place it in the project folder:**
   ```
   C:\Users\Vardhman\.cursor\whatsapp_project\
   ```

## Method 2: Using ADB (Advanced)

If you have USB debugging enabled:

```bash
adb pull /sdcard/WhatsApp/Databases/msgstore.db.crypt14 .
```

## Method 3: From Google Drive (if accessible)

1. Go to https://drive.google.com
2. Look in the "App Data" section (may not be visible in web interface)
3. Or use Google Takeout (though WhatsApp may not appear there)

## What File to Look For

- **Filename pattern:** `msgstore.db.crypt14` or `msgstore.db.crypt15`
- **Location on phone:** `/sdcard/WhatsApp/Databases/`
- **Size:** Usually 1-50 MB depending on your messages

## After Getting the File

Once you have the backup file in the project folder, run:

```bash
node test-decrypt.js msgstore.db.crypt14
```

Or if it's in a different location:

```bash
node test-decrypt.js "C:\path\to\msgstore.db.crypt14"
```

The script will:
1. Skip Google Drive download
2. Use your local file
3. Decrypt it with your password
4. Show your messages
