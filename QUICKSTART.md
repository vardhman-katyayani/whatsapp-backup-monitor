# Quick Start Guide

## Fast Setup (5 minutes)

### Step 1: Install Node.js
If you don't have Node.js:
- Download from: https://nodejs.org/ (version 18 or higher)
- Install and restart terminal

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Get Google OAuth Credentials

2. Click "Create Credentials" →
1. Visit: https://console.cloud.google.com/apis/credentials "OAuth client ID"
3. Choose "Desktop app"
4. Copy **Client ID** and **Client Secret**

### Step 4: Create .env File

Create a file named `.env` in this folder with:

```env
GOOGLE_CLIENT_ID=paste-your-client-id-here
GOOGLE_CLIENT_SECRET=paste-your-client-secret-here
WA_BACKUP_PASSWORD=the-password-you-set-in-whatsapp
```

**Where to find your WhatsApp backup password:**
- Open WhatsApp on your phone
- Settings → Chats → Chat backup
- If you see "End-to-end encrypted backup" is ON, that's the password you entered
- If it's OFF, you need to enable it first and set a password

### Step 5: Run the Test

```bash
npm test
```

### Step 6: Authorize (First Time Only)

1. Script will show a URL - open it in browser
2. Sign in with the Google account that has your WhatsApp backup
3. Click "Allow" to grant Drive access
4. Copy the code from the browser
5. Paste it in the terminal
6. Done! Your messages will be displayed

## What You'll See

The script will:
- ✅ Connect to Google Drive
- ✅ Find your WhatsApp backup
- ✅ Download it
- ✅ Decrypt with your password
- ✅ Show your recent messages

## Troubleshooting

**"No backup found"**
→ Make sure backup is enabled in WhatsApp and wait a few minutes after backup completes

**"Decryption failed"**
→ Check your password - it's case-sensitive and must match exactly what you set in WhatsApp

**"Module not found"**
→ Run `npm install` again

## Next Steps

Once this works, you'll have proven the approach works! Then we can:
1. Build the full system for 160 accounts
2. Set up automated daily syncs
3. Create the dashboard
