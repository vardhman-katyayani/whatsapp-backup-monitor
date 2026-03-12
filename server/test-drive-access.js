#!/usr/bin/env node

/**
 * Google Drive Service Account Access Test
 *
 * Verifies that the service account can access the shared "wa-engine" folder
 * and lists all files inside it.
 *
 * Usage: node test-drive-access.js
 */

import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEY_PATH  = join(__dirname, 'service_account.json');

// ─── Auth (direct service account — no impersonation) ────────────────────────
function getAuth() {
  const key = JSON.parse(readFileSync(KEY_PATH, 'utf8'));
  return new google.auth.JWT({
    email: key.client_email,
    key:   key.private_key,
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.metadata.readonly'
    ]
    // No `subject` — service account acts as itself
  });
}

function fmtSize(bytes) {
  if (!bytes) return 'unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function main() {
  console.log('\n========================================');
  console.log('  Google Drive Service Account Test');
  console.log('========================================\n');

  const key = JSON.parse(readFileSync(KEY_PATH, 'utf8'));
  console.log(`📧 Service account : ${key.client_email}`);
  console.log(`📁 Looking for     : wa-engine-files folder\n`);

  const auth  = getAuth();
  const drive = google.drive({ version: 'v3', auth });

  // ── Step 1: Authenticate ───────────────────────────────────────────────────
  process.stdout.write('🔑 Authenticating with Google... ');
  try {
    await auth.authorize();
    console.log('✅ OK\n');
  } catch (err) {
    console.log(`❌ FAIL\n   ${err.message}\n`);
    process.exit(1);
  }

  // ── Step 2: Find the wa-engine folder ─────────────────────────────────────
  process.stdout.write('📂 Searching for "wa-engine" folder... ');
  let folderId = null;
  let folderName = null;
  try {
    const res = await drive.files.list({
      q: "mimeType = 'application/vnd.google-apps.folder' and name = 'wa-engine-files' and trashed = false",
      fields: 'files(id, name, owners, sharedWithMeTime)',
      pageSize: 10
    });

    const folders = res.data.files || [];
    if (!folders.length) {
      console.log('❌ NOT FOUND\n');
      console.log('   Make sure you have shared the "wa-engine-files" folder with:');
      console.log(`   ${key.client_email}\n`);
      process.exit(1);
    }

    folderId   = folders[0].id;
    folderName = folders[0].name;
    console.log(`✅ Found (ID: ${folderId})\n`);
  } catch (err) {
    console.log(`❌ FAIL\n   ${err.message}\n`);
    process.exit(1);
  }

  // ── Step 3: List all files inside the folder ───────────────────────────────
  console.log(`📋 Files inside "${folderName}":\n`);
  let allFiles = [];
  try {
    let pageToken = null;
    do {
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, size, mimeType, modifiedTime)',
        orderBy: 'modifiedTime desc',
        pageSize: 100,
        pageToken: pageToken || undefined
      });
      allFiles = allFiles.concat(res.data.files || []);
      pageToken = res.data.nextPageToken;
    } while (pageToken);

    if (!allFiles.length) {
      console.log('   (folder is empty)\n');
    } else {
      allFiles.forEach((f, i) => {
        const isFolder = f.mimeType === 'application/vnd.google-apps.folder';
        const icon  = isFolder ? '📁' : '📄';
        const ts    = f.modifiedTime ? new Date(f.modifiedTime).toLocaleString() : '';
        const size  = isFolder ? '' : `  [${fmtSize(parseInt(f.size || 0))}]`;
        console.log(`   ${icon} ${(i+1).toString().padStart(2)}. ${f.name}${size}  ${ts}`);
      });
      console.log('');
    }
  } catch (err) {
    console.log(`   ❌ Failed to list files: ${err.message}\n`);
    process.exit(1);
  }

  // ── Step 4: Recurse into subfolders (phone number folders) ───────────────
  let allBackupFiles = [];

  for (const item of allFiles) {
    if (item.mimeType === 'application/vnd.google-apps.folder') {
      console.log(`   📂 Listing subfolder "${item.name}"...`);
      try {
        // List direct children
        const subRes = await drive.files.list({
          q: `'${item.id}' in parents and trashed = false`,
          fields: 'files(id, name, size, mimeType, modifiedTime)',
          orderBy: 'modifiedTime desc',
          pageSize: 100
        });
        const subFiles = subRes.data.files || [];

        for (const sf of subFiles) {
          const isSubFolder = sf.mimeType === 'application/vnd.google-apps.folder';
          const size = isSubFolder ? '' : `  [${fmtSize(parseInt(sf.size || 0))}]`;
          console.log(`      ${isSubFolder ? '📁' : '📄'} ${sf.name}${size}`);

          if (isSubFolder) {
            // One more level deep (e.g. AndroidData/)
            const deepRes = await drive.files.list({
              q: `'${sf.id}' in parents and trashed = false`,
              fields: 'files(id, name, size, mimeType, modifiedTime)',
              pageSize: 100
            });
            const deepFiles = deepRes.data.files || [];
            deepFiles.forEach(df => {
              console.log(`         📄 ${df.name}  [${fmtSize(parseInt(df.size || 0))}]`);
              if (/\.(crypt14|crypt15|crypt12|zip)$/i.test(df.name)) {
                allBackupFiles.push(df);
              }
            });
          } else if (/\.(crypt14|crypt15|crypt12|zip)$/i.test(sf.name)) {
            allBackupFiles.push(sf);
          }
        }
      } catch (err) {
        console.log(`      ❌ Could not list: ${err.message}`);
      }
      console.log('');
    } else if (/\.(crypt14|crypt15|crypt12|zip)$/i.test(item.name)) {
      allBackupFiles.push(item);
    }
  }

  // ── Step 5: WhatsApp backup summary ───────────────────────────────────────
  console.log(`🔍 WhatsApp backup files found: ${allBackupFiles.length}`);
  allBackupFiles.forEach(f => {
    console.log(`   ✅ ${f.name}  [${fmtSize(parseInt(f.size || 0))}]  ID: ${f.id}`);
  });
  if (!allBackupFiles.length) {
    console.log('   (none yet — upload backups to this folder to process them)');
  }

  // ── Step 6: Test downloading a small backup file ───────────────────────────
  const testFile = allBackupFiles.find(f => parseInt(f.size || 0) < 50 * 1024 * 1024);
  if (testFile) {
    console.log(`\n⬇️  Testing download of "${testFile.name}"...`);
    try {
      const res = await drive.files.get(
        { fileId: testFile.id, alt: 'media' },
        { responseType: 'arraybuffer' }
      );
      const buf = Buffer.from(res.data);
      console.log(`   ✅ Downloaded ${fmtSize(buf.length)} — download works!`);
    } catch (err) {
      console.log(`   ❌ Download failed: ${err.message}`);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n========================================');
  console.log(`  Folders in wa-engine-files : ${allFiles.filter(f => f.mimeType.includes('folder')).length}`);
  console.log(`  WhatsApp backup files      : ${allBackupFiles.length}`);
  console.log('========================================\n');
  console.log('✅ DRIVE ACCESS WORKING — Service account can read the folder!\n');
}

main().catch(err => {
  console.error('\n❌ Fatal:', err.message);
  process.exit(1);
});
