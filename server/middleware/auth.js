/**
 * SSO Authentication Middleware
 * Verifies JWT from https://sso.ko-tech.in
 * Only allows roles: superuser, sales_admin
 */

import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';

const SSO_BASE_URL = process.env.SSO_BASE_URL || 'https://sso.ko-tech.in';
const ALLOWED_ROLES = ['superuser', 'sales_admin'];

// JWKS client — caches keys, auto-rotates
const jwksClient = jwksRsa({
  jwksUri: `${SSO_BASE_URL}/.well-known/jwks.json`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 10 * 60 * 1000 // 10 minutes
});

function getKey(header, callback) {
  jwksClient.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

// Verify token and check role
export function requireAuth(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ error: 'Authentication required', code: 'NO_TOKEN' });
  }

  jwt.verify(token, getKey, { algorithms: ['RS256'] }, (err, decoded) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
      }
      return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
    }

    // Check roles
    const userRoles = decoded.roles || decoded.role
      ? (Array.isArray(decoded.roles) ? decoded.roles : [decoded.roles || decoded.role])
      : [];

    const hasAccess = userRoles.some(r => ALLOWED_ROLES.includes(r));

    if (!hasAccess) {
      return res.status(403).json({
        error: 'Access denied. Required role: superuser or sales_admin',
        code: 'FORBIDDEN',
        your_roles: userRoles
      });
    }

    req.user = decoded;
    req.userRoles = userRoles;
    next();
  });
}

function extractToken(req) {
  // 1. Authorization header
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);

  // 2. Cookie
  if (req.cookies?.access_token) return req.cookies.access_token;

  return null;
}
