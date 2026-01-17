# Fix OAuth "Access Blocked" Error

## Quick Fix: Add Yourself as Test User

Your OAuth app needs to be in "Testing" mode with your account added. Here's how:

### Step 1: Go to OAuth Consent Screen

1. Visit: https://console.cloud.google.com/apis/credentials/consent
2. Select your project: **high-electron-481914-j8**

### Step 2: Configure OAuth Consent Screen

1. If not already set up:
   - User Type: **External** (or Internal if you have Workspace)
   - App name: "WhatsApp Backup Test" (or any name)
   - User support email: Your email
   - Developer contact: Your email
   - Click "Save and Continue"

2. **Scopes**:
   - Click "Add or Remove Scopes"
   - Search for: `https://www.googleapis.com/auth/drive.readonly`
   - Check it and click "Update"
   - Click "Save and Continue"

3. **Test users** (IMPORTANT):
   - Click "Add Users"
   - Add your Google account email (the one with WhatsApp backup)
   - Click "Add"
   - Click "Save and Continue"

4. **Summary**:
   - Review and click "Back to Dashboard"

### Step 3: Update OAuth Client (if needed)

1. Go to: https://console.cloud.google.com/apis/credentials
2. Click on your OAuth 2.0 Client ID
3. Under "Authorized redirect URIs", add:
   - `urn:ietf:wg:oauth:2.0:oob` (for manual code entry)
   - OR `http://localhost:3000/oauth2callback` (if you want automatic)
4. Click "Save"

### Step 4: Try Again

Run the script again:
```bash
node test-decrypt.js
```

Now when you authorize, it should work because:
- Your app is in Testing mode
- Your account is added as a test user
- The redirect URI is configured

## Alternative: Use Service Account (Advanced)

If you want to avoid OAuth entirely, you can use a Service Account, but that requires sharing a folder in Drive with the service account email. The OAuth method above is simpler for personal use.
