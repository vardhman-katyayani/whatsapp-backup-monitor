import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { requireAuth, linkAgentEmail } from '../services/auth.js';
import { getAuthUrl } from '../services/drive.js';

const router = Router();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// =============================================
// GET /api/agent/me — agent's own dashboard data
// =============================================
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { data: phone, error } = await supabaseAdmin
      .from('phones')
      .select(`
        id, phone_number, employee_name, department,
        last_sync_at, total_messages, is_active,
        google_refresh_token
      `)
      .eq('id', req.agent.id)
      .single();

    if (error || !phone) return res.status(404).json({ error: 'Not found' });

    const { data: logs } = await supabaseAdmin
      .from('pipeline_logs')
      .select('status, started_at, completed_at, messages_added, error_message')
      .eq('phone_id', req.agent.id)
      .order('started_at', { ascending: false })
      .limit(5);

    res.json({
      phone: {
        ...phone,
        drive_connected: !!phone.google_refresh_token
      },
      recent_syncs: logs || []
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================
// GET /api/agent/drive-connect — get Google OAuth URL
// =============================================
router.get('/drive-connect', requireAuth, async (req, res) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(400).json({ error: 'Google OAuth not configured on server' });
    }
    const authUrl = getAuthUrl(req.agent.id);
    res.json({ auth_url: authUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================
// DELETE /api/agent/drive-disconnect
// =============================================
router.delete('/drive-disconnect', requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('phones')
      .update({
        google_refresh_token: null,
        google_access_token: null,
        google_token_expiry: null
      })
      .eq('id', req.agent.id);

    if (error) return res.status(500).json({ error });
    res.json({ message: 'Google Drive disconnected' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================
// POST /api/agent/link — agent links their Google account to phone number (first login)
// Body: { phone_number }  — Bearer token required (Supabase SSO)
// =============================================
router.post('/link', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
    const { data: { user }, error: authErr } = await sb.auth.getUser(auth.slice(7));
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    const { phone_number } = req.body;
    if (!phone_number) return res.status(400).json({ error: 'phone_number required' });

    const { data: phone, error: phoneErr } = await supabaseAdmin
      .from('phones')
      .select('id, phone_number, employee_name, department')
      .eq('phone_number', phone_number.trim())
      .single();

    if (phoneErr || !phone) return res.status(404).json({ error: 'Phone number not found. Contact your admin.' });

    await linkAgentEmail(user.email, phone.id);
    res.json({ message: 'Account linked successfully', phone });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================
// ADMIN: POST /api/agent/register
// Link a Google email to a phone record
// Body: { phone_id, email }
// =============================================
router.post('/register', async (req, res) => {
  try {
    const { phone_id, email } = req.body;

    if (!phone_id || !email) {
      return res.status(400).json({ error: 'phone_id and email required' });
    }

    const { error } = await supabaseAdmin
      .from('phones')
      .update({ agent_email: email.toLowerCase().trim() })
      .eq('id', phone_id);

    if (error) return res.status(500).json({ error });
    res.json({ message: 'Agent email registered', phone_id, email });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================
// ADMIN: GET /api/agent/list — list all agents with email status
// =============================================
router.get('/list', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('phones')
      .select('id, phone_number, employee_name, department, agent_email, last_sync_at, google_refresh_token, is_active')
      .order('employee_name');

    if (error) return res.status(500).json({ error });
    res.json({ agents: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
