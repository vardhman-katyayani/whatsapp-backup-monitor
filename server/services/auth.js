import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

// In-memory map: google_email → phone_id (survives server restart via Supabase check)
// Agents link once by entering their phone number on first login
const emailToPhoneCache = new Map();

// ============================================
// Save agent link (email ↔ phone_id)
// Tries agent_email column; if missing, uses cache only
// ============================================
export async function linkAgentEmail(email, phoneId) {
  emailToPhoneCache.set(email.toLowerCase(), phoneId);

  // Try saving to Supabase if agent_email column exists
  try {
    await supabaseAdmin
      .from('phones')
      .update({ agent_email: email.toLowerCase() })
      .eq('id', phoneId);
  } catch (_) {
    // Column may not exist — cache only is fine
  }
}

// ============================================
// Look up phone record by Google email
// ============================================
async function getPhoneByEmail(email) {
  const lowerEmail = email.toLowerCase();

  // 1. Check in-memory cache first
  const cachedPhoneId = emailToPhoneCache.get(lowerEmail);
  if (cachedPhoneId) {
    const { data } = await supabaseAdmin
      .from('phones')
      .select('id, phone_number, employee_name, department, is_active')
      .eq('id', cachedPhoneId)
      .single();
    if (data) return data;
  }

  // 2. Try agent_email column (if it exists)
  try {
    const { data, error } = await supabaseAdmin
      .from('phones')
      .select('id, phone_number, employee_name, department, is_active')
      .eq('agent_email', lowerEmail)
      .single();
    if (!error && data) {
      emailToPhoneCache.set(lowerEmail, data.id);
      return data;
    }
  } catch (_) { /* column doesn't exist */ }

  return null;
}

// ============================================
// Express middleware — verifies Supabase SSO token
// ============================================
export async function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = auth.slice(7);

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid or expired token' });

    const phone = await getPhoneByEmail(user.email);
    if (!phone) {
      return res.status(403).json({
        error: 'Account not linked. Please link your phone number.',
        email: user.email,
        needs_linking: true
      });
    }

    req.agent = {
      id: phone.id,
      phone_number: phone.phone_number,
      employee_name: phone.employee_name,
      department: phone.department,
      email: user.email
    };
    next();
  } catch (e) {
    res.status(401).json({ error: e.message });
  }
}

export { supabaseAdmin };
