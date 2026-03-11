# 🚀 Complete Setup & Run Guide

## Project Overview

Your WhatsApp backup monitor has:
- **Backend:** Node.js/Express (port 3000)
- **Frontend:** Static admin dashboard (served by backend from `/admin`)
- **Database:** Supabase (PostgreSQL)
- **AI:** Anthropic Claude integration (ready)

**Architecture:** Single backend server that serves both API and frontend UI.

---

## ⚡ Quick Start (1 Command)

### Everything at Once
```bash
cd /home/katyayani/Desktop/whatsapp_backup/whatsapp-backup-monitor/server
npm install && npm start
```

Then open: **http://localhost:3000/admin**

---

## 🔧 Step-by-Step Setup

### Step 1: Install Dependencies
```bash
cd /home/katyayani/Desktop/whatsapp_backup/whatsapp-backup-monitor/server
npm install
```

Expected output:
```
added X packages in Y seconds
```

### Step 2: Verify .env Configuration
```bash
# From server directory
cat ../.env | grep -E "SUPABASE|ANTHROPIC"
```

Should show:
```
SUPABASE_URL=https://qxsauwrxaamcerrvznhp.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-...
WHATSAPP_HEX_KEY=706d...
```

### Step 3: Start the Server

**Development Mode (with auto-reload):**
```bash
cd /home/katyayani/Desktop/whatsapp_backup/whatsapp-backup-monitor/server
npm run dev
```

**Production Mode (standard):**
```bash
cd /home/katyayani/Desktop/whatsapp_backup/whatsapp-backup-monitor/server
npm start
```

### Step 4: Access the Application
- **Admin Dashboard:** http://localhost:3000/admin
- **API Health Check:** http://localhost:3000/api/health
- **List Phones:** http://localhost:3000/api/phones

---

## 📁 Project Structure & What Runs Where

```
whatsapp-backup-monitor/
│
├── server/                          # Backend (Express.js)
│   ├── index.js                     # Main entry point
│   ├── package.json                 # Backend dependencies
│   ├── admin/                       # Frontend (static files)
│   │   ├── index.html               # Main UI page
│   │   ├── js/app.js                # Frontend JavaScript
│   │   └── css/admin.css            # Frontend styles
│   ├── routes/
│   │   ├── api.js                   # API endpoints (/api/*)
│   │   ├── admin.js                 # Admin routes
│   │   ├── messages.js              # Message routes
│   │   ├── chat.js                  # Chat routes
│   │   └── agent.js                 # Agent routes
│   ├── services/
│   │   ├── supabase.js              # Database operations
│   │   ├── decryptor.js             # Backup decryption
│   │   ├── parser.js                # Message parsing
│   │   └── anthropic.js             # Claude AI
│   ├── cron/                        # Scheduled tasks
│   ├── test-*.js                    # Test files
│   └── scripts/                     # Utility scripts
│
├── .env                             # Configuration file
├── package.json                     # Root package (for Vercel)
└── [Other utility files]            # Old test scripts
```

---

## 🎯 What Each Component Does

| Component | Purpose | Runs On |
|-----------|---------|---------|
| **server/index.js** | Express server | Port 3000 |
| **server/admin/** | Dashboard UI | http://localhost:3000/admin |
| **server/routes/api.js** | Upload, decrypt, process backups | /api/* endpoints |
| **Supabase** | Data storage (phones, messages) | Cloud |
| **Anthropic Claude** | Message analysis | Cloud |

---

## 🗺️ Development Workflow

### 1. Make Backend Changes
**Edit:** `server/routes/api.js` or `server/services/`

When using `npm run dev`:
- Server auto-reloads on changes ✅
- No need to restart browser ✅

### 2. Make Frontend Changes
**Edit:** `server/admin/index.html` or `server/admin/js/app.js`

Steps:
- Edit the file
- Press F5 in browser to refresh
- Changes appear immediately ✅

### 3. Test API Endpoints
```bash
# While server is running:

# Get all phones
curl http://localhost:3000/api/phones

# Get server stats
curl http://localhost:3000/api/stats

# Check health
curl http://localhost:3000/api/health
```

---

## 📊 Full Running Instructions

### Running in Development
```bash
# Terminal 1: Start backend with auto-reload
cd /home/katyayani/Desktop/whatsapp_backup/whatsapp-backup-monitor/server
npm run dev

# Terminal 2 (Optional): Watch logs
tail -f server.log
```

Then open browser:
```
http://localhost:3000/admin
```

### Running in Production
```bash
# Start the server
cd /home/katyayani/Desktop/whatsapp_backup/whatsapp-backup-monitor/server
npm start
```

Access at:
```
http://localhost:3000/admin
```

---

## 🧪 Test Everything Works

### Test 1: Backend Health (from any terminal)
```bash
curl http://localhost:3000/api/health
```

Expected response:
```json
{"status":"ok","timestamp":"2026-03-09T..."}
```

### Test 2: Supabase Integration
```bash
cd /home/katyayani/Desktop/whatsapp_backup/whatsapp-backup-monitor/server
node test-supabase-keys.js
```

Expected:
```
✅ Supabase connection successful
✅ Found 10 phones
✅ All encryption keys valid
```

### Test 3: Anthropic API
```bash
cd /home/katyayani/Desktop/whatsapp_backup/whatsapp-backup-monitor/server
node test-anthropic.js
```

Expected:
```
✅ API Key configured
✅ API Connection Successful
✅ Message Analysis Successful
✅ Token Tracking Works
```

### Test 4: Frontend Loads
Open in browser:
```
http://localhost:3000/admin
```

You should see the admin dashboard with menu for:
- Upload Backup
- Phones
- Messages
- Settings

---

## 🛑 Stopping the Server

### Stop Development Server
Press **Ctrl+C** in the terminal where it's running

### Stop Running Processes (if stuck)
```bash
# Kill all Node processes
killall node

# Or kill specific port
lsof -i :3000          # Find process
kill -9 <PID>          # Kill it
```

---

## ⚙️ Environment Variables (.env)

The system needs these in `.env` (already configured):

```env
# Server
PORT=3000
NODE_ENV=development

# Database
SUPABASE_URL=https://qxsauwrxaamcerrvznhp.supabase.co
SUPABASE_SERVICE_KEY=eyJ...

# AI
ANTHROPIC_API_KEY=sk-ant-...

# Encryption
WHATSAPP_HEX_KEY=706d...
WHATSAPP_BACKUP_PASSWORD=test@123

# Optional: Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

---

## 🔍 Common Issues & Solutions

### Issue: Port 3000 Already in Use
**Error:** `EADDRINUSE: address already in use :::3000`

**Solution:**
```bash
# Kill existing process
killall -9 node

# Or use different port
PORT=3001 npm start
```

### Issue: Can't Access http://localhost:3000/admin
**Solution:**
1. Check if server is running: `curl http://localhost:3000/api/health`
2. If not running, start with: `npm start`
3. Clear browser cache: Ctrl+Shift+Delete
4. Try incognito: Ctrl+Shift+N

### Issue: Supabase Connection Error
**Solution:**
```bash
# Verify .env has correct credentials
cat ../.env | grep SUPABASE_URL

# Test connection
node test-supabase-keys.js
```

### Issue: Anthropic API 404 Error
**Solution:**
```bash
# Verify API key exists
grep ANTHROPIC_API_KEY ../.env

# Check it's not "your-anthropic-api-key-here"
grep "your-" ../.env

# Test API
node test-anthropic.js
```

### Issue: npm install fails
**Solution:**
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules
rm -rf node_modules package-lock.json

# Reinstall
npm install
```

---

## 📱 Using the Admin Dashboard

Once running at http://localhost:3000/admin:

### Upload a Backup
1. Click **"Upload Backup"** button
2. Select a `.crypt15` WhatsApp backup file
3. Assign it to a phone (the system will use that phone's encryption_key from Supabase)
4. System automatically decrypts and processes

### View Messages
1. Click **"Messages"** tab
2. See all decrypted messages from backups
3. View timestamps, senders, content

### View Phones
1. Click **"Phones"** tab
2. See all phones with their encryption keys
3. Check which phones have backups

### Analyze Messages
1. View a message
2. Click **"Analyze with AI"** (when integrated)
3. See Claude's analysis (sentiment, topics, etc.)

---

## 🔐 Security Notes

1. **Never commit .env to git** - It's in .gitignore ✅
2. **API keys are secrets** - Keep them private ✅
3. **Encryption keys from Supabase** - Not hardcoded ✅
4. **SSL in production** - Use HTTPS with reverse proxy

---

## 📊 Architecture Flow

```
┌─────────────────────────────────────────┐
│   Admin Dashboard                       │
│   (http://localhost:3000/admin)         │
│   ├─ Upload backup file                │
│   ├─ View messages                     │
│   └─ Manage phones                     │
└────────────┬────────────────────────────┘
             │ HTTP Requests
             ▼
┌─────────────────────────────────────────┐
│   Express Backend (Port 3000)            │
│   ├─ /api/upload (decrypt backups)      │
│   ├─ /api/messages (fetch messages)     │
│   ├─ /api/phones (manage phones)        │
│   └─ /api/analyze (Claude AI)           │
└────┬───────────────────────────┬────────┘
     │                           │
     ▼                           ▼
┌──────────────────┐  ┌──────────────────┐
│ Supabase         │  │ Anthropic Claude │
│ (Database)       │  │ (AI Analysis)    │
│ ├─ phones table  │  │                  │
│ ├─ messages      │  │ Message analysis │
│ └─ analysis      │  │ Sentiment, topics│
└──────────────────┘  └──────────────────┘
```

---

## 🚀 Next Steps After Running

1. **Upload a backup** via admin dashboard
2. **View decrypted messages**
3. **Analyze with Claude** (Anthropic integration)
4. **Monitor in dashboard**
5. **Export/Archive results**

---

## 📞 Quick Reference Commands

```bash
# Navigate to project
cd /home/katyayani/Desktop/whatsapp_backup/whatsapp-backup-monitor/server

# Install dependencies
npm install

# Start development (with auto-reload)
npm run dev

# Start production
npm start

# Kill running server
Ctrl+C  (in terminal) or killall node

# Test Supabase
node test-supabase-keys.js

# Test Anthropic
node test-anthropic.js

# Check API health
curl http://localhost:3000/api/health

# View logs
tail -f server.log

# Change port
PORT=3001 npm start
```

---

## ✅ Verification Checklist

After running, verify:

- [ ] Server starts: `npm start` shows "Server running on port 3000"
- [ ] Admin loads: http://localhost:3000/admin displays dashboard
- [ ] API works: http://localhost:3000/api/health returns 200 OK
- [ ] Database: `node test-supabase-keys.js` shows 10 phones
- [ ] AI ready: `node test-anthropic.js` shows successful connection
- [ ] .env configured: All SUPABASE_* and ANTHROPIC_API_KEY present

---

**Status: Ready to Run!** 🎉

Start with:
```bash
cd /home/katyayani/Desktop/whatsapp_backup/whatsapp-backup-monitor/server
npm install && npm start
```

Then visit: http://localhost:3000/admin
