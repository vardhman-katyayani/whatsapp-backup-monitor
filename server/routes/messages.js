import { Router } from 'express';
import {
  getChatsForPhonePaged,
  getMessagesForChatPaged,
  getAIInsights,
  getFlaggedInsights,
  updatePhoneTokens,
  clearPhoneTokens,
  getPhoneById
} from '../services/supabase.js';
import { getAuthUrl, exchangeCodeForTokens } from '../services/drive.js';
import { analyzePhoneChats } from '../services/ai.js';
import { syncDriveBackups } from '../cron/drive-sync.js';
import { supabase } from '../services/supabase.js';

const router = Router();

// ============================================
// GET /api/chats?phone_id=UUID&limit=50&offset=0
// ============================================
router.get('/chats', async (req, res) => {
  try {
    const { phone_id, limit = 100, offset = 0 } = req.query;

    if (!phone_id) return res.status(400).json({ error: 'phone_id is required' });

    const { data, error } = await getChatsForPhonePaged(phone_id, Math.min(parseInt(limit), 1000), parseInt(offset));

    if (error) return res.status(500).json({ error });

    res.json({ chats: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// GET /api/messages?chat_id=UUID&limit=50&offset=0
// ============================================
router.get('/messages', async (req, res) => {
  try {
    const { chat_id, limit = 50, offset = 0 } = req.query;

    if (!chat_id) return res.status(400).json({ error: 'chat_id is required' });

    const { data, error } = await getMessagesForChatPaged(chat_id, parseInt(limit), parseInt(offset));

    if (error) return res.status(500).json({ error });

    res.json({ messages: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// GET /api/ai-insights?phone_id=UUID&chat_id=UUID
// ============================================
router.get('/ai-insights', async (req, res) => {
  try {
    const { phone_id, chat_id } = req.query;

    if (!phone_id) return res.status(400).json({ error: 'phone_id is required' });

    const { data, error } = await getAIInsights(phone_id, chat_id || null);

    if (error) return res.status(500).json({ error });

    res.json({ insights: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// GET /api/ai-insights/flagged
// ============================================
router.get('/ai-insights/flagged', async (req, res) => {
  try {
    const { data, error } = await getFlaggedInsights(100);

    if (error) return res.status(500).json({ error });

    res.json({ flagged: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// POST /api/analyze/:phone_id — trigger AI analysis
// ============================================
router.post('/analyze/:phone_id', async (req, res) => {
  try {
    const { phone_id } = req.params;

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(400).json({ error: 'ANTHROPIC_API_KEY not set. Add it to server/.env' });
    }

    // Run in background
    res.json({ message: 'AI analysis started', phone_id });

    analyzePhoneChats(phone_id, supabase)
      .then(result => console.log(`[AI] Analysis complete for ${phone_id}:`, result))
      .catch(e => console.error(`[AI] Analysis failed for ${phone_id}:`, e.message));

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// POST /api/sync/:phone_id — manually trigger Drive sync
// ============================================
router.post('/sync/:phone_id', async (req, res) => {
  try {
    const { phone_id } = req.params;

    const { data: phone, error } = await getPhoneById(phone_id);

    if (error || !phone) return res.status(404).json({ error: 'Phone not found' });

    if (!phone.google_refresh_token) {
      return res.status(400).json({
        error: 'Phone has no Google Drive credentials. Connect Drive first.',
        auth_url: `/api/oauth/auth-url/${phone_id}`
      });
    }

    if (!phone.encryption_key) {
      return res.status(400).json({ error: 'Phone has no encryption key configured' });
    }

    res.json({ message: 'Sync started', phone_id });

    // Run full Drive sync (skips already-processed files automatically)
    syncDriveBackups()
      .then(stats => console.log(`[Manual Sync] ${phone.phone_number}: ✅${stats.success} ❌${stats.failed} ⏭${stats.skipped}`))
      .catch(e => console.error(`[Manual Sync] Error:`, e.message));

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// GET /api/oauth/auth-url/:phone_id
// Generate Google OAuth URL for an agent
// ============================================
router.get('/oauth/auth-url/:phone_id', async (req, res) => {
  try {
    const { phone_id } = req.params;

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(400).json({
        error: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in server/.env'
      });
    }

    const authUrl = getAuthUrl(phone_id);
    res.json({ auth_url: authUrl, phone_id });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// GET /api/oauth/callback?code=...&state=phone_id
// Exchange OAuth code for tokens and save
// ============================================
router.get('/oauth/callback', async (req, res) => {
  try {
    const { code, state: phone_id, error: oauthError } = req.query;

    if (oauthError) {
      return res.send(`<h2>Authorization denied: ${oauthError}</h2><p><a href="/admin">Back to Dashboard</a></p>`);
    }

    if (!code || !phone_id) {
      return res.status(400).send('<h2>Missing code or phone_id</h2>');
    }

    const tokens = await exchangeCodeForTokens(code);

    if (!tokens.refresh_token) {
      return res.send(`
        <h2>Error: No refresh token received</h2>
        <p>Please revoke app access in your Google account and try again.</p>
        <p><a href="/admin">Back to Dashboard</a></p>
      `);
    }

    const { error } = await updatePhoneTokens(phone_id, tokens);

    if (error) {
      return res.status(500).send(`<h2>Database error: ${error}</h2>`);
    }

    res.send(`
      <html>
        <body style="font-family:sans-serif;text-align:center;padding:60px;background:#0a0a0f;color:#e4e4e7">
          <h2 style="color:#22c55e">✅ Google Drive Connected!</h2>
          <p>WhatsApp backups will now sync automatically every night at 3 AM.</p>
          <a href="/admin" style="color:#22c55e">← Back to Dashboard</a>
        </body>
      </html>
    `);

  } catch (e) {
    res.status(500).send(`<h2>Error: ${e.message}</h2><a href="/admin">Back to Dashboard</a>`);
  }
});

// ============================================
// DELETE /api/oauth/:phone_id — disconnect Drive
// ============================================
router.delete('/oauth/:phone_id', async (req, res) => {
  try {
    const { error } = await clearPhoneTokens(req.params.phone_id);

    if (error) return res.status(500).json({ error });

    res.json({ message: 'Google Drive disconnected' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
