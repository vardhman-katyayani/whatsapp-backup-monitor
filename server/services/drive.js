import { google } from 'googleapis';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================
// Detect which auth mode to use:
//   SERVICE_ACCOUNT = service-account.json exists (Workspace orgs)
//   OAUTH2          = GOOGLE_CLIENT_ID set (personal Gmail)
// ============================================
function getServiceAccountAuth(impersonateEmail) {
  const keyPath = join(__dirname, '..', 'service_account.json');
  if (!existsSync(keyPath)) return null;

  const key = JSON.parse(readFileSync(keyPath, 'utf8'));
  return new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: [
      'https://www.googleapis.com/auth/drive.appdata',
      'https://www.googleapis.com/auth/drive.readonly'
    ],
    subject: impersonateEmail  // impersonate the agent's Workspace account
  });
}

// ============================================
// OAuth2 Client (personal Gmail fallback)
// ============================================
export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/oauth/callback'
  );
}

// ============================================
// Generate auth URL for an agent to authorize (OAuth2 mode)
// ============================================
export function getAuthUrl(phoneId) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env');
  }

  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/drive.appdata',
      'https://www.googleapis.com/auth/drive.readonly'
    ],
    state: phoneId,
    prompt: 'consent'
  });
}

// ============================================
// Exchange auth code for tokens (OAuth2 mode)
// ============================================
export async function exchangeCodeForTokens(code) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

// ============================================
// Download latest WhatsApp backup from Drive
// Supports both service account (Workspace) and OAuth2 (personal Gmail)
// ============================================
export async function downloadLatestBackup(refreshTokenOrEmail) {
  // Try service account first (Workspace)
  const saAuth = getServiceAccountAuth(refreshTokenOrEmail);
  let auth;

  if (saAuth) {
    // Service account mode — refreshTokenOrEmail is the agent's email
    saAuth.authorize();
    auth = saAuth;
    console.log(`[Drive] Using service account for ${refreshTokenOrEmail}`);
  } else {
    // OAuth2 mode — refreshTokenOrEmail is the refresh token
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: refreshTokenOrEmail });
    auth = oauth2Client;
  }

  const drive = google.drive({ version: 'v3', auth });

  let backupFile = null;

  // Try appDataFolder first (where WhatsApp stores its backups)
  try {
    const appDataRes = await drive.files.list({
      spaces: 'appDataFolder',
      fields: 'files(id, name, size, modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: 100
    });

    const appFiles = appDataRes.data.files || [];
    backupFile = appFiles.find(f => /msgstore.*\.crypt\d+/i.test(f.name));
  } catch (e) {
    console.warn('[Drive] appDataFolder search failed, trying regular Drive...');
  }

  // Fallback: search in regular Drive folders
  if (!backupFile) {
    const driveRes = await drive.files.list({
      q: "name contains 'msgstore' and (name contains '.crypt14' or name contains '.crypt15')",
      fields: 'files(id, name, size, modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: 10
    });

    const driveFiles = driveRes.data.files || [];
    backupFile = driveFiles[0] || null;
  }

  if (!backupFile) {
    throw new Error('No WhatsApp backup found in Google Drive. Make sure Google Drive backup is enabled in WhatsApp Settings > Chats > Chat Backup.');
  }

  console.log(`[Drive] Found backup: ${backupFile.name} (${(parseInt(backupFile.size || 0) / 1024 / 1024).toFixed(2)} MB)`);

  // Download the file
  const fileRes = await drive.files.get(
    { fileId: backupFile.id, alt: 'media' },
    { responseType: 'arraybuffer' }
  );

  return {
    buffer: Buffer.from(fileRes.data),
    filename: backupFile.name,
    size: parseInt(backupFile.size || 0),
    modifiedTime: backupFile.modifiedTime
  };
}

// ============================================
// Refresh an expired access token
// ============================================
export async function refreshAccessToken(refreshToken) {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const { credentials } = await oauth2Client.refreshAccessToken();
  return credentials;
}
