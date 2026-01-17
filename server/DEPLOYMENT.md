# WhatsApp Monitor - Deployment Guide

## 🚀 Deployment Options

### Option 1: Vercel (Recommended for Quick Start)

#### Prerequisites
1. Vercel account (sign up at https://vercel.com)
2. Vercel CLI installed: `npm i -g vercel`
3. Supabase project URL and Service Key

#### Steps

1. **Login to Vercel**
   ```bash
   cd server
   vercel login
   ```

2. **Set Environment Variables**
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add these variables:
     - `SUPABASE_URL` - Your Supabase project URL
     - `SUPABASE_SERVICE_KEY` - Your Supabase service_role key
     - `ENCRYPTION_KEY` - Your WhatsApp backup encryption key (64-digit hex)

3. **Deploy**
   ```bash
   vercel --prod
   ```

4. **Your deployment URL will be shown after deployment completes**

---

### Option 2: Render (As Originally Planned)

#### Prerequisites
1. Render account (sign up at https://render.com)
2. Supabase project URL and Service Key

#### Steps

1. **Connect Repository**
   - Push your code to GitHub/GitLab
   - Go to Render Dashboard → New → Web Service
   - Connect your repository

2. **Configure Service**
   - **Name**: `whatsapp-monitor`
   - **Environment**: `Node`
   - **Build Command**: `cd server && npm install`
   - **Start Command**: `cd server && npm start`
   - **Root Directory**: `server`

3. **Set Environment Variables**
   - `NODE_ENV` = `production`
   - `PORT` = `10000` (Render default)
   - `SUPABASE_URL` = Your Supabase URL
   - `SUPABASE_SERVICE_KEY` = Your Supabase service key
   - `ENCRYPTION_KEY` = Your encryption key

4. **Deploy**
   - Click "Create Web Service"
   - Render will automatically deploy

---

### Option 3: AWS (Future Migration)

For AWS deployment, you can use:
- **AWS Elastic Beanstalk** (Easiest)
- **AWS EC2** (More control)
- **AWS Lambda + API Gateway** (Serverless)

Contact for AWS setup instructions when ready.

---

## 📋 Environment Variables

Required environment variables:

```bash
# Server
PORT=3000
NODE_ENV=production

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key_here

# WhatsApp Backup Encryption
ENCRYPTION_KEY=your_64_digit_hex_key_here
```

---

## 🔧 Local Development

1. **Install Dependencies**
   ```bash
   cd server
   npm install
   ```

2. **Create `.env` file**
   ```bash
   PORT=3000
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_KEY=your_service_role_key
   ENCRYPTION_KEY=your_64_digit_hex_key
   ```

3. **Start Server**
   ```bash
   npm start
   # or for development with auto-reload
   npm run dev
   ```

4. **Access Admin Dashboard**
   - Open: http://localhost:3000/admin

---

## 📊 Admin Dashboard Features

Once deployed, access your admin dashboard at:
- **Vercel**: `https://your-project.vercel.app/admin`
- **Render**: `https://your-service.onrender.com/admin`

### Features:
- 📊 Dashboard with statistics
- 📞 Phone management
- 📋 Sync logs monitoring
- ⬆️ Manual backup upload
- 🔔 Alerts and notifications

---

## 🔌 API Endpoints

### Upload Backup
```bash
POST /api/upload-backup
Content-Type: multipart/form-data

Body:
- file: (backup file .crypt15)
- phone_id: (optional, UUID)
- phone_number: (optional, string)
```

### Health Check
```bash
GET /health
```

### Admin API
```bash
GET /admin/stats
GET /admin/phones
GET /admin/logs
```

---

## 🐛 Troubleshooting

### Issue: "Supabase credentials not configured"
**Solution**: Make sure environment variables are set correctly in your deployment platform.

### Issue: "File upload fails"
**Solution**: Check file size limits (max 500MB) and ensure multer is configured correctly.

### Issue: "Decryption fails"
**Solution**: Verify your encryption key is correct (64-digit hex string).

### Issue: "Database connection errors"
**Solution**: Check Supabase URL and service key. Ensure your Supabase project is active.

---

## 📝 Next Steps

1. ✅ Deploy backend server
2. ✅ Configure Supabase environment variables
3. ⏳ Import phone list (160 phones) via Excel
4. ⏳ Set up automated backup collection (Flutter app - Phase 2)
5. ⏳ Configure webhooks for mobile app uploads

---

## 🔐 Security Notes

- **Never commit** `.env` files or encryption keys to git
- Use environment variables for all sensitive data
- Keep your Supabase service key secure
- Rotate encryption keys periodically
- Use HTTPS for all deployments

---

## 📞 Support

For issues or questions:
1. Check logs in your deployment platform
2. Review Supabase logs
3. Check admin dashboard for error messages
