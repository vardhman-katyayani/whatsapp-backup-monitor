# 🚀 Deployment Checklist

## Pre-Deployment

- [ ] **Supabase Project Setup**
  - [ ] Create Supabase project (or use existing: `qxsauwrxaamcerrvznhp`)
  - [ ] Get Service Role Key from Supabase Dashboard
  - [ ] Verify database schema is created (frontend team should handle this)

- [ ] **Environment Variables Ready**
  - [ ] `SUPABASE_URL` = `https://qxsauwrxaamcerrvznhp.supabase.co`
  - [ ] `SUPABASE_SERVICE_KEY` = (Get from Supabase Dashboard)
  - [ ] `ENCRYPTION_KEY` = (Your 64-digit hex key)

- [ ] **Code Ready**
  - [ ] All dependencies installed (`npm install`)
  - [ ] Server runs locally (`npm start`)
  - [ ] Admin dashboard accessible at `http://localhost:3000/admin`

## Deployment Steps

### Option A: Vercel Deployment

- [ ] Install Vercel CLI: `npm i -g vercel`
- [ ] Login to Vercel: `cd server && vercel login`
- [ ] Set environment variables in Vercel Dashboard:
  - [ ] Go to Project Settings → Environment Variables
  - [ ] Add `SUPABASE_URL`
  - [ ] Add `SUPABASE_SERVICE_KEY`
  - [ ] Add `ENCRYPTION_KEY`
- [ ] Deploy: `vercel --prod`
- [ ] Copy deployment URL
- [ ] Test admin dashboard: `https://your-project.vercel.app/admin`
- [ ] Test health endpoint: `https://your-project.vercel.app/health`

### Option B: Render Deployment

- [ ] Push code to GitHub/GitLab
- [ ] Create new Web Service on Render
- [ ] Connect repository
- [ ] Configure:
  - [ ] Name: `whatsapp-monitor`
  - [ ] Environment: `Node`
  - [ ] Build Command: `cd server && npm install`
  - [ ] Start Command: `cd server && npm start`
  - [ ] Root Directory: `server`
- [ ] Set environment variables:
  - [ ] `NODE_ENV` = `production`
  - [ ] `PORT` = `10000`
  - [ ] `SUPABASE_URL`
  - [ ] `SUPABASE_SERVICE_KEY`
  - [ ] `ENCRYPTION_KEY`
- [ ] Deploy
- [ ] Test admin dashboard
- [ ] Test health endpoint

## Post-Deployment

- [ ] **Verify Deployment**
  - [ ] Admin dashboard loads correctly
  - [ ] Health check returns `200 OK`
  - [ ] No console errors in browser

- [ ] **Test Backup Upload**
  - [ ] Upload a test backup file via admin dashboard
  - [ ] Verify decryption works
  - [ ] Check Supabase for inserted data
  - [ ] Verify pipeline logs appear

- [ ] **Import Phones**
  - [ ] Prepare CSV file with phone list (160 phones)
  - [ ] Run: `node scripts/import-phones.js phones.csv`
  - [ ] Verify phones appear in admin dashboard

- [ ] **Documentation**
  - [ ] Save deployment URL
  - [ ] Share admin dashboard link with team
  - [ ] Document any custom configurations

## Next Phase (Future)

- [ ] **Flutter Mobile App** (Phase 2)
  - [ ] Develop app for automated backup collection
  - [ ] Configure webhook endpoint
  - [ ] Test backup upload from mobile app

- [ ] **Monitoring & Alerts**
  - [ ] Set up error monitoring (Sentry, etc.)
  - [ ] Configure email alerts for failed backups
  - [ ] Set up uptime monitoring

- [ ] **Scaling**
  - [ ] Test with multiple concurrent uploads
  - [ ] Optimize database queries
  - [ ] Plan for 160 phones daily backups

---

## Quick Commands

```bash
# Local Development
cd server
npm install
npm start

# Import Phones
node scripts/import-phones.js phones.csv

# Vercel Deployment
vercel login
vercel --prod

# Check Logs (Vercel)
vercel logs

# Check Logs (Render)
# Use Render Dashboard → Logs
```

---

## Support Contacts

- **Supabase Issues**: Check Supabase Dashboard → Logs
- **Deployment Issues**: Check platform logs (Vercel/Render)
- **Code Issues**: Check server logs in admin dashboard
