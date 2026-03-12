/**
 * SSO Auth Routes — proxy to sso.ko-tech.in
 *
 * POST /api/auth/login          → SSO /login
 * POST /api/auth/verify-otp     → SSO /verify-otp → SSO /generate-tokens → set cookies
 * POST /api/auth/refresh        → SSO /refresh-token → set cookies
 * POST /api/auth/logout         → clear cookies
 * GET  /api/auth/me             → return current user from cookie
 */

import { Router } from 'express';
import dotenv from 'dotenv';

dotenv.config();

const router = Router();

const SSO_BASE = process.env.SSO_BASE_URL || 'https://sso.ko-tech.in';
const SSO_PLATFORM = process.env.SSO_PLATFORM || 'wa-monitor';
const ALLOWED_ROLES = ['superuser', 'sales_admin'];

// ── Helper: call SSO API ──────────────────────────────────────────────────────
async function ssoCall(path, body) {
  const res = await fetch(`${SSO_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.detail || data.message || data.error || `SSO error ${res.status}`;
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    err.status = res.status;
    throw err;
  }
  return data;
}

// ── Set auth cookies (httpOnly, secure in prod) ───────────────────────────────
function setTokenCookies(res, access_token, refresh_token) {
  const isProd = process.env.NODE_ENV === 'production';
  const opts = { httpOnly: true, sameSite: 'lax', secure: isProd };

  res.cookie('access_token', access_token, {
    ...opts,
    maxAge: 15 * 60 * 1000 // 15 min
  });
  if (refresh_token) {
    res.cookie('refresh_token', refresh_token, {
      ...opts,
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
  }
}

function clearAuthCookies(res) {
  res.clearCookie('access_token');
  res.clearCookie('refresh_token');
}

// ── Step 1: Login ──────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const data = await ssoCall('/login', { email, password });

    if (!data.require_mfa) {
      // No MFA — immediately generate tokens
      const tokens = await ssoCall('/generate-tokens', {
        code: data.code,
        platform: SSO_PLATFORM,
        access_payload: {},
        refresh_payload: {}
      });

      // Decode and check roles before setting cookies
      const roleCheck = checkRolesFromToken(tokens.access_token);
      if (!roleCheck.allowed) {
        return res.status(403).json({
          error: 'Access denied. Required role: superuser or sales_admin',
          code: 'FORBIDDEN'
        });
      }

      setTokenCookies(res, tokens.access_token, tokens.refresh_token);
      return res.json({
        success: true,
        mfa_required: false,
        user: roleCheck.payload
      });
    }

    // MFA required — return temp_code and mfa_type to client
    return res.json({
      success: true,
      mfa_required: true,
      temp_code: data.temp_code,
      mfa_type: data.mfa_type // "email" or "totp"
    });

  } catch (err) {
    console.error('[Auth] Login error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── Step 2: Verify OTP (MFA path) ─────────────────────────────────────────────
router.post('/verify-otp', async (req, res) => {
  const { temp_code, otp } = req.body;
  if (!temp_code || !otp) {
    return res.status(400).json({ error: 'temp_code and otp are required' });
  }

  try {
    // Verify OTP → get code
    const verified = await ssoCall('/verify-otp', { temp_code, otp });

    // Generate tokens with the code
    const tokens = await ssoCall('/generate-tokens', {
      code: verified.code,
      platform: SSO_PLATFORM,
      access_payload: {},
      refresh_payload: {}
    });

    // Check roles
    const roleCheck = checkRolesFromToken(tokens.access_token);
    if (!roleCheck.allowed) {
      return res.status(403).json({
        error: 'Access denied. Required role: superuser or sales_admin',
        code: 'FORBIDDEN'
      });
    }

    setTokenCookies(res, tokens.access_token, tokens.refresh_token);
    return res.json({
      success: true,
      user: roleCheck.payload
    });

  } catch (err) {
    console.error('[Auth] Verify-OTP error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── Refresh token ──────────────────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const refresh_token = req.cookies?.refresh_token || req.body?.refresh_token;
  if (!refresh_token) {
    return res.status(401).json({ error: 'No refresh token', code: 'NO_REFRESH_TOKEN' });
  }

  try {
    const data = await ssoCall('/refresh-token', { refresh_token, payload: {} });
    setTokenCookies(res, data.access_token, data.refresh_token);
    res.json({ success: true });
  } catch (err) {
    clearAuthCookies(res);
    res.status(err.status || 401).json({ error: err.message });
  }
});

// ── Logout ────────────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  clearAuthCookies(res);
  res.json({ success: true });
});

// ── Current user (from cookie) ─────────────────────────────────────────────────
router.get('/me', (req, res) => {
  const token = req.cookies?.access_token;
  if (!token) return res.status(401).json({ error: 'Not authenticated', code: 'NO_TOKEN' });

  const roleCheck = checkRolesFromToken(token);
  if (!roleCheck.payload) return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });

  res.json({ user: roleCheck.payload, roles: roleCheck.roles });
});

// ── Helper: decode JWT (no verify — just parse for role check) ────────────────
// Full verification is done by the auth middleware using JWKS
function checkRolesFromToken(token) {
  try {
    const [, payloadB64] = token.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    const roles = payload.roles || (payload.role ? [payload.role] : []);
    const allowed = roles.some(r => ALLOWED_ROLES.includes(r));
    return { allowed, payload, roles };
  } catch {
    return { allowed: false, payload: null, roles: [] };
  }
}

export default router;
