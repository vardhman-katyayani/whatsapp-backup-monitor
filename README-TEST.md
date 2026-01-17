# WhatsApp Backup Decryption Test

This script tests the complete flow of downloading and decrypting WhatsApp backups from Google Drive.

## Prerequisites

1. **Node.js 18+** installed
2. **Google OAuth Credentials** (see setup below)
3. **WhatsApp backup password** that you set when enabling E2E encrypted backup

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Get Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable **Google Drive API**:
   - Go to "APIs & Services" → "Library"
   - Search for "Google Drive API"
   - Click "Enable"
4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Application type: **Desktop app**
   - Name: "WhatsApp Backup Test"
   - Click "Create"
   - Copy the **Client ID** and **Client Secret**

### 3. Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
WA_BACKUP_PASSWORD=the-password-you-set-in-whatsapp
```

**Important:** The `WA_BACKUP_PASSWORD` is the password you entered when you enabled "End-to-end encrypted backup" in WhatsApp settings.

### 4. Configure OAuth Redirect URI

In Google Cloud Console → Credentials → Your OAuth client:
- For **Desktop app** type, you can use: `http://localhost:3000/oauth2callback`
- Or use the default: `urn:ietf:wg:oauth:2.0:oob` (for manual code entry)
- The script will work with either - it will prompt you to paste the code manually

## Usage

Run the test script:

```bash
npm test
```

Or directly:

```bash
node test-decrypt.js
```

### First Run (OAuth Authorization)

1. The script will open a URL in your browser
2. Sign in with the Google account that has the WhatsApp backup
3. Grant permission to access Google Drive
4. Copy the authorization code from the browser
5. Paste it into the terminal when prompted
6. The token will be saved to `token.json` for future runs

### What It Does

1. ✅ Authenticates with Google Drive API
2. ✅ Searches for WhatsApp backup in Drive App Data folder
3. ✅ Downloads the `msgstore.db.crypt14` or `.crypt15` file
4. ✅ Decrypts using your password
5. ✅ Parses the SQLite database
6. ✅ Displays recent messages and chat summary

## Output

The script will show:

- Total number of chats found
- Recent messages (last 50) with:
  - Direction (incoming/outgoing)
  - Chat name
  - Timestamp
  - Message text or media indicator
  - Media file names (if any)

Example output:

```
================================================================================
WHATSAPP BACKUP DECRYPTION SUCCESSFUL!
================================================================================

📊 Summary:
   Total chats found: 15
   Recent messages shown: 50

💬 Recent Messages:

1. 📥 INCOMING - John Doe
   2024-01-15 10:30:25
   Hey, are we still meeting tomorrow?
   
2. 📤 OUTGOING - Jane Smith
   2024-01-15 09:15:10
   Yes, confirmed for 2 PM
   
...
```

## Troubleshooting

### "No WhatsApp backup found"

- Make sure you've enabled backup in WhatsApp:
  - Settings → Chats → Chat backup
  - Enable "Back up to Google Drive"
  - Set it to "Daily" or run a manual backup
- Wait a few minutes after backup completes
- Make sure you're using the correct Google account

### "Decryption failed: Result is not a valid SQLite database"

- **Wrong password**: Double-check the password you set in WhatsApp
- The password is case-sensitive
- Make sure there are no extra spaces

### "Token expired" or OAuth errors

- Delete `token.json` and run again to re-authenticate
- Make sure redirect URI is configured correctly in Google Console

### "Module not found" errors

- Run `npm install` to install dependencies
- Make sure you're using Node.js 18 or higher

## Files Created

- `token.json` - OAuth token (auto-created, keep secure)
- `msgstore.db.crypt14` or `.crypt15` - Downloaded backup (encrypted)
- `msgstore.db` - Decrypted SQLite database

**Note:** These files contain sensitive data. Keep them secure and don't commit to git.

## Next Steps

Once this test works, you can:
1. Build the full sync system for 160 accounts
2. Set up automated daily syncs
3. Create the dashboard for viewing all conversations
4. Integrate with your MCP server

## Security Notes

- The `.env` file contains sensitive credentials - never commit it
- The `token.json` file contains OAuth tokens - keep it secure
- Decrypted database contains all your messages - handle with care
- All files are in `.gitignore` for safety
