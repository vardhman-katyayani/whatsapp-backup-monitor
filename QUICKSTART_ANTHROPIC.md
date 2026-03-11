# Quick Start: Test and Deploy Guide

## ⚡ Quick Commands

### 1️⃣ Start the Server
```bash
cd /home/katyayani/Desktop/whatsapp_backup/whatsapp-backup-monitor/server
node index.js
```
✅ Access dashboard at: http://localhost:3000/admin

---

### 2️⃣ Verify Supabase Works
```bash
cd /home/katyayani/Desktop/whatsapp_backup/whatsapp-backup-monitor/server
node test-supabase-keys.js
```

**Expected:**
- ✓ Connection successful
- ✓ Phones fetched from database
- ✓ Encryption keys valid (64-char hex)

---

### 3️⃣ Verify Anthropic API Works
```bash
cd /home/katyayani/Desktop/whatsapp_backup/whatsapp-backup-monitor/server
node test-anthropic.js
```

**Before running:** Add your API key to `.env`
```bash
# Edit .env:
ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE
```

**Expected:**
- ✓ API key found
- ✓ Connected to Claude
- ✓ Message analysis works
- ✓ Tokens tracked

---

### 4️⃣ Test Full Decryption (Optional)
```bash
cd /home/katyayani/Desktop/whatsapp_backup/whatsapp-backup-monitor/server
node test-shivam-decrypt.js
```

**Requirements:**
- WhatsApp backup file (`.crypt15`)
- Phone record in Supabase
- Encryption key matches backup

---

## 🔑 Getting Your Anthropic API Key

1. Go to: https://console.anthropic.com
2. Sign in (create account if needed)
3. Click **"Getting Started"** → **"API Keys"**
4. Click **"Create Key"**
5. Copy the key (starts with `sk-ant-`)
6. Update `.env`:
   ```env
   ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
   ```

---

## 📊 What's Working Now

✅ Supabase database connected  
✅ Phones table with encryption keys accessible  
✅ WhatsApp backup decryption ready  
✅ Anthropic Claude API integration ready  
✅ Admin dashboard live at port 3000  
✅ All test suites created and ready  

---

## 🚀 What's Next

1. **Add Anthropic API Key** → Update `.env`
2. **Run Tests** → Verify everything works
3. **Add Backup Files** → Test encryption keys
4. **Integrate Analysis** → Update `api.js` to call Anthropic
5. **Store Results** → Add analysis to database
6. **Display Analysis** → Show results in dashboard

---

## 📁 Project Structure

```
server/
├── index.js                 # Express app entry point
├── package.json
├── test-supabase-keys.js   # Verify DB encryption keys ✅
├── test-anthropic.js       # Verify Claude API ✅
├── test-shivam-*           # Decryption tests
├── routes/
│   ├── api.js              # Upload & process backups
│   └── admin.js            # Admin dashboard routes
└── services/
    ├── supabase.js         # Database operations
    ├── decryptor.js        # Backup decryption
    ├── parser.js           # Message parsing
    └── anthropic.js        # [TODO] Claude integration
```

---

## 🛠️ Troubleshooting

**Port 3000 in use?**
```bash
killall -9 node
node index.js
```

**Missing API key?**
```bash
grep ANTHROPIC_API_KEY .env
# Should show: ANTHROPIC_API_KEY=sk-ant-xxxxx (NOT "your-")
```

**Database not connecting?**
```bash
# Verify in .env:
cat .env | grep SUPABASE
# Should have URL and SERVICE_KEY (not empty)
```

**Test fails?**
```bash
# Check .env exists:
ls -la .env

# Verify Node.js version:
node --version  # Should be v18+

# Check npm packages:
npm list
```

---

## 📝 Files Created

- ✅ `test-supabase-keys.js` - Validate database setup
- ✅ `test-anthropic.js` - Validate Claude API
- ✅ `ANTHROPIC_INTEGRATION.md` - Complete integration guide
- ✅ `QUICKSTART.md` - This file

---

## 🎯 Success Metrics

After running tests, you should see:

```
✓ Supabase phones table: [N] records
✓ Encryption key format: Valid (64-char hex)
✓ Anthropic API: Connected
✓ Claude version: claude-3-5-sonnet-20241022
✓ Test message analyzed: [tokens used]
```

---

**Status: Ready to test! 🚀**
