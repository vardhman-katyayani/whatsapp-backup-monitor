import { google } from 'googleapis';
import { readFileSync, writeFileSync, createWriteStream, existsSync } from 'fs';
import { createReadStream } from 'fs';
import { promisify } from 'util';
import { pipeline } from 'stream/promises';
import initSqlJs from 'sql.js';
import { createHash, createDecipheriv, pbkdf2Sync } from 'crypto';
import readline from 'readline';
import dotenv from 'dotenv';

dotenv.config();

// OAuth2 configuration
// Need both scopes: readonly for regular files, appdata for app data folder
const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.appdata'
];
const TOKEN_PATH = process.env.TOKEN_PATH || './token.json';

// WhatsApp App Data folder ID in Google Drive
const WHATSAPP_APP_DATA_FOLDER = 'appDataFolder';

/**
 * Get OAuth2 client
 */
function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  // Use out-of-band redirect for desktop apps (no redirect URI needed)
  const redirectUri = 'urn:ietf:wg:oauth:2.0:oob';

  if (!clientId || !clientSecret) {
    throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env file');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Get and store new token after prompting for user authorization
 */
async function getNewToken(oAuth2Client, providedCode = null) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log('Authorize this app by visiting this url:', authUrl);
  
  // If code provided as argument, use it directly
  if (providedCode) {
    return new Promise((resolve, reject) => {
      oAuth2Client.getToken(providedCode, (err, token) => {
        if (err) {
          console.error('Error while trying to retrieve access token', err);
          reject(err);
          return;
        }
        oAuth2Client.setCredentials(token);
        // Store the token to disk for later program executions
        writeFileSync(TOKEN_PATH, JSON.stringify(token));
        console.log('Token stored to', TOKEN_PATH);
        resolve(oAuth2Client);
      });
    });
  }
  
  // Otherwise, prompt for code
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    rl.question('Enter the code from that page here: ', (code) => {
      rl.close();
      oAuth2Client.getToken(code, (err, token) => {
        if (err) {
          console.error('Error while trying to retrieve access token', err);
          reject(err);
          return;
        }
        oAuth2Client.setCredentials(token);
        // Store the token to disk for later program executions
        writeFileSync(TOKEN_PATH, JSON.stringify(token));
        console.log('Token stored to', TOKEN_PATH);
        resolve(oAuth2Client);
      });
    });
  });
}

/**
 * Load or request authorization
 */
async function authorize(authCode = null) {
  const oAuth2Client = getOAuth2Client();
  
  // Check if we have previously stored a token
  if (existsSync(TOKEN_PATH)) {
    const token = JSON.parse(readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);
    
    // Try to refresh if expired
    try {
      await oAuth2Client.refreshAccessToken();
    } catch (err) {
      console.log('Token expired, getting new token...');
      return await getNewToken(oAuth2Client, authCode);
    }
    
    return oAuth2Client;
  } else {
    return await getNewToken(oAuth2Client, authCode);
  }
}

/**
 * Find WhatsApp backup file in Drive App Data folder
 */
async function findWhatsAppBackup(drive) {
  console.log('Searching for WhatsApp backup in Drive App Data folder...');
  
  try {
    let files = [];
    
    // Strategy 1: Search in appDataFolder for crypt14/crypt15 files
    try {
      const response = await drive.files.list({
        spaces: WHATSAPP_APP_DATA_FOLDER,
        q: "name contains 'msgstore' and (name contains '.crypt14' or name contains '.crypt15')",
        fields: 'files(id, name, size, modifiedTime)',
      });
      files = response.data.files || [];
      console.log(`Found ${files.length} file(s) with crypt14/crypt15 extension`);
    } catch (err) {
      console.log('Search in appDataFolder with extension filter failed, trying broader search...');
    }
    
    // Strategy 2: Search more broadly in appDataFolder
    if (files.length === 0) {
      try {
        const broadResponse = await drive.files.list({
          spaces: WHATSAPP_APP_DATA_FOLDER,
          q: "name contains 'msgstore'",
          fields: 'files(id, name, size, modifiedTime)',
        });
        files = broadResponse.data.files || [];
        console.log(`Found ${files.length} file(s) with 'msgstore' in name`);
      } catch (err) {
        console.log('Broad search in appDataFolder failed');
      }
    }
    
    // Strategy 3: List all files in appDataFolder (WhatsApp might use different naming)
    if (files.length === 0) {
      try {
        console.log('Listing all files in appDataFolder...');
        const allFilesResponse = await drive.files.list({
          spaces: WHATSAPP_APP_DATA_FOLDER,
          fields: 'files(id, name, size, modifiedTime)',
          pageSize: 100
        });
        const allFiles = allFilesResponse.data.files || [];
        console.log(`Found ${allFiles.length} total file(s) in appDataFolder`);
        
        // Filter for WhatsApp-related files
        const whatsappFiles = allFiles.filter(f => 
          f.name.toLowerCase().includes('whatsapp') || 
          f.name.toLowerCase().includes('msgstore') ||
          f.name.toLowerCase().includes('crypt')
        );
        
        if (whatsappFiles.length > 0) {
          files = whatsappFiles;
          console.log(`Found ${files.length} WhatsApp-related file(s)`);
        } else if (allFiles.length > 0) {
          // Show what files exist
          console.log('\nFiles found in appDataFolder:');
          allFiles.forEach((f, i) => {
            console.log(`  ${i + 1}. ${f.name} (${(f.size / 1024).toFixed(2)} KB)`);
          });
        }
      } catch (err) {
        console.log('Error listing all files:', err.message);
      }
    }
    
    // Strategy 4: Try searching in regular Drive (some backups might be there)
    if (files.length === 0) {
      try {
        console.log('Searching in regular Drive folders...');
        const driveResponse = await drive.files.list({
          q: "name contains 'msgstore' and (name contains '.crypt14' or name contains '.crypt15')",
          fields: 'files(id, name, size, modifiedTime)',
        });
        const driveFiles = driveResponse.data.files || [];
        if (driveFiles.length > 0) {
          files = driveFiles;
          console.log(`Found ${files.length} backup file(s) in regular Drive`);
        }
      } catch (err) {
        console.log('Search in regular Drive failed:', err.message);
      }
    }
    
    if (files.length === 0) {
      throw new Error(
        'No WhatsApp backup found.\n\n' +
        'Possible reasons:\n' +
        '  1. Backup not enabled in WhatsApp (Settings → Chats → Chat backup)\n' +
        '  2. Backup hasn\'t completed yet (wait a few minutes after enabling)\n' +
        '  3. Backup is stored in a different Google account\n' +
        '  4. WhatsApp uses a different backup location\n\n' +
        'Please check:\n' +
        '  - WhatsApp Settings → Chats → Chat backup → "Back up to Google Drive" is ON\n' +
        '  - You\'re signed in with the correct Google account in WhatsApp\n' +
        '  - A backup has completed recently'
      );
    }

    // Sort by modified time (newest first)
    files.sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime));
    
    console.log(`\n✅ Found ${files.length} backup file(s):`);
    files.forEach((file, index) => {
      const sizeMB = (file.size / 1024 / 1024).toFixed(2);
      console.log(`  ${index + 1}. ${file.name}`);
      console.log(`     Size: ${sizeMB} MB | Modified: ${file.modifiedTime}`);
    });

    return files[0]; // Return the newest one
  } catch (error) {
    console.error('Error finding backup:', error.message);
    throw error;
  }
}

/**
 * Download file from Google Drive
 */
async function downloadFile(drive, fileId, fileName) {
  console.log(`Downloading ${fileName}...`);
  
  const destPath = `./${fileName}`;
  const destStream = createWriteStream(destPath);
  
  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  );

  await pipeline(response.data, destStream);
  console.log(`Downloaded to ${destPath}`);
  
  return destPath;
}

/**
 * Decrypt WhatsApp crypt14/crypt15 backup
 * Based on WhatsApp's encryption format:
 * - Header: salt (16) + IV (16) + key (32) + checksum (3 or 9)
 * - Body: AES-256-GCM encrypted SQLite database
 */
function decryptWhatsAppBackup(encryptedPath, password) {
  console.log('Decrypting backup...');
  console.log(`File size: ${(readFileSync(encryptedPath).length / 1024 / 1024).toFixed(2)} MB`);
  
  const encryptedData = readFileSync(encryptedPath);
  
  // Determine format (crypt14 or crypt15)
  const isCrypt15 = encryptedPath.includes('.crypt15');
  const HEADER_SIZE = isCrypt15 ? 73 : 67;
  
  if (encryptedData.length < HEADER_SIZE) {
    throw new Error('Backup file too small to be valid');
  }
  
  // Debug: Show first few bytes of header
  console.log(`Format: ${isCrypt15 ? 'crypt15' : 'crypt14'}`);
  console.log(`Header size: ${HEADER_SIZE} bytes`);
  console.log(`First 32 bytes (hex): ${encryptedData.slice(0, 32).toString('hex').substring(0, 64)}...`);

  // Extract header components
  const header = encryptedData.slice(0, HEADER_SIZE);
  const salt = header.slice(0, 16);
  const iv = header.slice(16, 32);
  const keyMaterial = header.slice(32, 64); // Encrypted key in header
  
  // For password-based backups, derive key from password
  // Try different PBKDF2 parameters that might be used
  const pbkdf2Variants = [
    { iterations: 16384, hash: 'sha256', keyLen: 32 }, // Standard
    { iterations: 10000, hash: 'sha256', keyLen: 32 },  // Alternative
    { iterations: 16384, hash: 'sha1', keyLen: 32 },    // SHA-1 variant
    { iterations: 16384, hash: 'sha256', keyLen: 16 },  // 16-byte key
  ];
  
  const derivedKeys = [];
  for (const variant of pbkdf2Variants) {
    try {
      const key = pbkdf2Sync(password, salt, variant.iterations, variant.keyLen, variant.hash);
      derivedKeys.push(key);
    } catch (e) {
      // Skip if hash algorithm not supported
    }
  }
  
  // Use the standard one as primary
  let derivedKey = derivedKeys[0] || pbkdf2Sync(password, salt, 16384, 32, 'sha256');
  
  // For crypt15: Try multiple key derivation approaches
  // Approach 1: Use derived key directly
  // Approach 2: Decrypt keyMaterial with derived key
  // Approach 3: Use keyMaterial as-is (for key-based backups)
  
  // Start with all derived key variants
  const keysToTry = [...derivedKeys];
  
  if (isCrypt15) {
    // For crypt15 password-based: keyMaterial is encrypted with password-derived key
    // Try multiple methods to decrypt keyMaterial
    
    // Method 1: Decrypt keyMaterial using derivedKey with salt as IV (CBC)
    try {
      const keyMaterialDecipher1 = createDecipheriv('aes-256-cbc', derivedKey, salt);
      let keyDecrypted1 = keyMaterialDecipher1.update(keyMaterial);
      let keyFinal1 = keyMaterialDecipher1.final();
      keysToTry.push(Buffer.concat([keyDecrypted1, keyFinal1]));
      console.log('Added keyMaterial decrypted with salt IV (CBC)');
    } catch (e) {
      // Continue
    }
    
    // Method 2: Decrypt keyMaterial using derivedKey with IV from header (CBC)
    try {
      const keyMaterialDecipher2 = createDecipheriv('aes-256-cbc', derivedKey, iv);
      let keyDecrypted2 = keyMaterialDecipher2.update(keyMaterial);
      let keyFinal2 = keyMaterialDecipher2.final();
      keysToTry.push(Buffer.concat([keyDecrypted2, keyFinal2]));
      console.log('Added keyMaterial decrypted with header IV (CBC)');
    } catch (e) {
      // Continue
    }
    
    // Method 3: Decrypt keyMaterial using derivedKey with salt as IV (GCM)
    try {
      // For GCM, we need auth tag - use first 16 bytes as tag, rest as ciphertext
      if (keyMaterial.length >= 16) {
        const keyMaterialTag = keyMaterial.slice(0, 16);
        const keyMaterialCipher = keyMaterial.slice(16);
        const keyMaterialDecipher3 = createDecipheriv('aes-256-gcm', derivedKey, salt);
        keyMaterialDecipher3.setAuthTag(keyMaterialTag);
        let keyDecrypted3 = keyMaterialDecipher3.update(keyMaterialCipher);
        let keyFinal3 = keyMaterialDecipher3.final();
        keysToTry.push(Buffer.concat([keyDecrypted3, keyFinal3]));
        console.log('Added keyMaterial decrypted with salt IV (GCM)');
      }
    } catch (e) {
      // Continue
    }
    
    // Method 4: Try XOR of derivedKey and keyMaterial (some implementations use this)
    try {
      const xorKey = Buffer.from(keyMaterial);
      for (let i = 0; i < Math.min(derivedKey.length, xorKey.length); i++) {
        xorKey[i] ^= derivedKey[i];
      }
      keysToTry.push(xorKey);
      console.log('Added XOR of derivedKey and keyMaterial');
    } catch (e) {
      // Continue
    }
    
    // Method 5: Use keyMaterial directly (for key-based backups)
    keysToTry.push(keyMaterial);
  }
  
  console.log(`Trying ${keysToTry.length} different key derivation methods...`);
  
  const encryptedContent = encryptedData.slice(HEADER_SIZE);
  
  // Try GCM decryption with each key
  for (let i = 0; i < keysToTry.length; i++) {
    const testKey = keysToTry[i];
    try {
      // For GCM, the last 16 bytes are the authentication tag
      if (encryptedContent.length < 16) {
        continue;
      }
      
      const authTag = encryptedContent.slice(encryptedContent.length - 16);
      const ciphertext = encryptedContent.slice(0, encryptedContent.length - 16);
      
      const decipher = createDecipheriv('aes-256-gcm', testKey, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(ciphertext);
      let final = decipher.final();
      
      const decryptedData = Buffer.concat([decrypted, final]);
      
      // Verify it's a valid SQLite database
      const sqliteHeader = decryptedData.slice(0, 16).toString('ascii');
      if (sqliteHeader === 'SQLite format 3') {
        const outputPath = './msgstore.db';
        writeFileSync(outputPath, decryptedData);
        console.log(`✅ SUCCESS! Decrypted using key method ${i + 1}`);
        console.log(`✅ Decrypted database saved to ${outputPath}`);
        return outputPath;
      }
    } catch (gcmError) {
      // Try next key
      continue;
    }
  }
  
  console.log('GCM decryption failed with all key methods, trying alternative modes...');
  
  // Fallback: Try CBC mode with each key
  for (let i = 0; i < keysToTry.length; i++) {
    const testKey = keysToTry[i];
    try {
      const decipher = createDecipheriv('aes-256-cbc', testKey, iv);
      
      let decrypted = decipher.update(encryptedContent);
      let final = decipher.final();
      
      const decryptedData = Buffer.concat([decrypted, final]);
      
      // Verify it's a valid SQLite database
      const sqliteHeader = decryptedData.slice(0, 16).toString('ascii');
      if (sqliteHeader === 'SQLite format 3') {
        const outputPath = './msgstore.db';
        writeFileSync(outputPath, decryptedData);
        console.log(`✅ SUCCESS! Decrypted using CBC mode with key method ${i + 1}`);
        console.log(`✅ Decrypted database saved to ${outputPath}`);
        return outputPath;
      }
    } catch (cbcError) {
      // Try next key
      continue;
    }
  }
  
  throw new Error(
    'Decryption failed: Could not decrypt with provided password.\n' +
    'Please verify:\n' +
    '  1. The password is exactly as you set it in WhatsApp (case-sensitive)\n' +
    '  2. You enabled "End-to-end encrypted backup" with a password (not 64-digit key)\n' +
    '  3. The backup file is not corrupted'
  );
}

/**
 * Parse WhatsApp SQLite database
 */
async function parseWhatsAppDatabase(dbPath) {
  console.log('Parsing WhatsApp database...');
  
  const SQL = await initSqlJs();
  const dbData = readFileSync(dbPath);
  const db = new SQL.Database(dbData);
  
  try {
    // Get messages
    const messagesResult = db.exec(`
      SELECT 
        m._id,
        m.key_remote_jid as chat_jid,
        m.key_from_me as is_from_me,
        m.data as message_text,
        m.timestamp / 1000 as timestamp,
        m.media_mime_type,
        m.media_name,
        m.media_caption,
        c.subject as chat_name
      FROM messages m
      LEFT JOIN chat c ON m.key_remote_jid = c.jid
      ORDER BY m.timestamp DESC
      LIMIT 50
    `);
    
    const messages = messagesResult.length > 0 ? messagesResult[0].values.map(row => ({
      _id: row[0],
      chat_jid: row[1],
      is_from_me: row[2],
      message_text: row[3],
      timestamp: row[4],
      media_mime_type: row[5],
      media_name: row[6],
      media_caption: row[7],
      chat_name: row[8]
    })) : [];
    
    // Get chat list
    const chatsResult = db.exec(`
      SELECT 
        jid,
        subject as name,
        (SELECT COUNT(*) FROM messages WHERE key_remote_jid = chat.jid) as message_count
      FROM chat
      ORDER BY _id DESC
    `);
    
    const chats = chatsResult.length > 0 ? chatsResult[0].values.map(row => ({
      jid: row[0],
      name: row[1],
      message_count: row[2]
    })) : [];
    
    return { messages, chats };
  } finally {
    db.close();
  }
}

/**
 * Display messages in readable format
 */
function displayMessages(data) {
  const { messages, chats } = data;
  
  console.log('\n' + '='.repeat(80));
  console.log('WHATSAPP BACKUP DECRYPTION SUCCESSFUL!');
  console.log('='.repeat(80));
  
  console.log(`\n📊 Summary:`);
  console.log(`   Total chats found: ${chats.length}`);
  console.log(`   Recent messages shown: ${messages.length}`);
  
  console.log(`\n💬 Recent Messages:\n`);
  
  messages.forEach((msg, index) => {
    const date = new Date(msg.timestamp * 1000);
    const direction = msg.is_from_me ? '📤 OUTGOING' : '📥 INCOMING';
    const chatName = msg.chat_name || msg.chat_jid.split('@')[0];
    const text = msg.message_text || msg.media_caption || `[${msg.media_mime_type || 'Media'}]`;
    
    console.log(`${index + 1}. ${direction} - ${chatName}`);
    console.log(`   ${date.toLocaleString()}`);
    console.log(`   ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
    if (msg.media_name) {
      console.log(`   📎 Media: ${msg.media_name}`);
    }
    console.log('');
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ Decryption test completed successfully!');
  console.log('='.repeat(80));
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('WhatsApp Backup Decryption Test\n');
    
    // Check password
    const password = process.env.WA_BACKUP_PASSWORD;
    if (!password) {
      console.error('Error: WA_BACKUP_PASSWORD not set in .env file');
      console.log('Please set WA_BACKUP_PASSWORD=your-password in .env');
      process.exit(1);
    }
    
    // Check if local backup file path provided
    const localBackupPath = process.argv[2];
    
    let backupPath;
    
    if (localBackupPath && existsSync(localBackupPath)) {
      // Use local backup file
      console.log(`✅ Using local backup file: ${localBackupPath}\n`);
      backupPath = localBackupPath;
    } else if (localBackupPath) {
      console.error(`❌ Error: File not found: ${localBackupPath}`);
      console.log('\nUsage:');
      console.log('  node test-decrypt.js                    # Download from Google Drive');
      console.log('  node test-decrypt.js <backup-file-path>  # Use local backup file');
      process.exit(1);
    } else {
      // Download from Google Drive
      console.log('📥 Downloading from Google Drive...\n');
      
      // Check if auth code provided as command line argument
      const authCode = process.argv[2] || null;
      
      // Authorize and get Drive client
      const auth = await authorize(authCode);
      const drive = google.drive({ version: 'v3', auth });
      
      // Verify access by getting user info
      try {
        const about = await drive.about.get({ fields: 'user' });
        console.log(`✅ Connected to Google Drive`);
        console.log(`   Account: ${about.data.user.emailAddress || 'Unknown'}`);
        console.log(`   Please verify this matches the Google account in WhatsApp\n`);
      } catch (err) {
        console.log('⚠️  Could not verify account info:', err.message);
      }
      
      // Find backup file
      const backupFile = await findWhatsAppBackup(drive);
      
      // Download backup
      backupPath = await downloadFile(drive, backupFile.id, backupFile.name);
    }
    
    // Decrypt backup
    console.log(`\n🔐 Decrypting backup file...`);
    const dbPath = decryptWhatsAppBackup(backupPath, password);
    
    // Parse database
    console.log(`\n📊 Parsing database...`);
    const data = await parseWhatsAppDatabase(dbPath);
    
    // Display results
    displayMessages(data);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the main function
main();
