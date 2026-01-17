import { Router } from 'express';
import multer from 'multer';
import { decryptBackup } from '../services/decryptor.js';
import { parseWhatsAppDatabase, getDatabaseInfo } from '../services/parser.js';
import {
  getPhones,
  getPhoneById,
  getPhoneByNumber,
  upsertChat,
  insertMessages,
  createPipelineLog,
  updatePipelineLog,
  getPipelineLogs,
  getDashboardStats
} from '../services/supabase.js';

const router = Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB max
});

// ============================================
// Upload & Process Backup
// ============================================
router.post('/upload-backup', upload.single('file'), async (req, res) => {
  const startTime = Date.now();
  let logId = null;
  
  try {
    const { phone_id, phone_number } = req.body;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    if (!phone_id && !phone_number) {
      return res.status(400).json({ error: 'phone_id or phone_number required' });
    }
    
    // Get phone record
    let phone;
    if (phone_id) {
      const result = await getPhoneById(phone_id);
      phone = result.data;
    } else {
      const result = await getPhoneByNumber(phone_number);
      phone = result.data;
    }
    
    if (!phone) {
      return res.status(404).json({ error: 'Phone not found' });
    }
    
    if (!phone.encryption_key) {
      return res.status(400).json({ error: 'Phone has no encryption key configured' });
    }
    
    // Create pipeline log
    const logResult = await createPipelineLog(phone.id, file.originalname, file.size);
    logId = logResult.data?.id;
    
    // Update status: decrypting
    await updatePipelineLog(logId, { status: 'decrypting' });
    
    // Decrypt backup
    let decryptResult;
    try {
      decryptResult = await decryptBackup(file.buffer, phone.encryption_key);
    } catch (decryptError) {
      await updatePipelineLog(logId, { 
        status: 'failed',
        error_message: `Decryption failed: ${decryptError.message}`
      });
      return res.status(400).json({ error: `Decryption failed: ${decryptError.message}` });
    }
    
    // Update status: parsing
    await updatePipelineLog(logId, { status: 'parsing' });
    
    // Parse database
    let parseResult;
    try {
      parseResult = await parseWhatsAppDatabase(decryptResult.database, phone.id);
    } catch (parseError) {
      await updatePipelineLog(logId, {
        status: 'failed',
        error_message: `Parsing failed: ${parseError.message}`
      });
      return res.status(400).json({ error: `Parsing failed: ${parseError.message}` });
    }
    
    // Update status: inserting
    await updatePipelineLog(logId, { status: 'inserting' });
    
    // Upsert chats
    const chatIdMap = {};
    for (const chat of parseResult.chats) {
      const result = await upsertChat(phone.id, chat);
      if (result.data) {
        chatIdMap[chat.jid] = result.data.id;
      }
    }
    
    // Add chat_id to messages
    const messagesWithChatId = parseResult.messages.map(msg => ({
      ...msg,
      chat_id: chatIdMap[msg.chat_jid] || null
    }));
    
    // Insert messages
    const insertResult = await insertMessages(messagesWithChatId);
    
    if (insertResult.error) {
      await updatePipelineLog(logId, {
        status: 'failed',
        error_message: `Insert failed: ${insertResult.error}`
      });
      return res.status(500).json({ error: `Insert failed: ${insertResult.error}` });
    }
    
    // Update log with success
    const duration = Date.now() - startTime;
    await updatePipelineLog(logId, {
      status: 'success',
      duration_ms: duration,
      messages_added: parseResult.messages.length,
      chats_added: parseResult.chats.length
    });
    
    res.json({
      success: true,
      phone: {
        id: phone.id,
        phone_number: phone.phone_number,
        employee_name: phone.employee_name
      },
      stats: {
        decryption: decryptResult.stats,
        parsing: parseResult.stats,
        totalDurationMs: duration
      }
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    
    if (logId) {
      await updatePipelineLog(logId, {
        status: 'failed',
        error_message: error.message,
        error_stack: error.stack
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Get All Phones
// ============================================
router.get('/phones', async (req, res) => {
  try {
    const { data, error } = await getPhones();
    
    if (error) {
      return res.status(500).json({ error });
    }
    
    res.json({ phones: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Get Phone by ID
// ============================================
router.get('/phones/:id', async (req, res) => {
  try {
    const { data, error } = await getPhoneById(req.params.id);
    
    if (error) {
      return res.status(500).json({ error });
    }
    
    if (!data) {
      return res.status(404).json({ error: 'Phone not found' });
    }
    
    res.json({ phone: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Get Pipeline Logs
// ============================================
router.get('/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const phoneId = req.query.phone_id || null;
    
    const { data, error } = await getPipelineLogs(limit, phoneId);
    
    if (error) {
      return res.status(500).json({ error });
    }
    
    res.json({ logs: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Get Dashboard Stats
// ============================================
router.get('/stats', async (req, res) => {
  try {
    const { data, error } = await getDashboardStats();
    
    if (error) {
      return res.status(500).json({ error });
    }
    
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Test Decryption (without saving to DB)
// ============================================
router.post('/test-decrypt', upload.single('file'), async (req, res) => {
  try {
    const { key } = req.body;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    if (!key || key.length !== 64) {
      return res.status(400).json({ error: 'Key must be 64-character hex string' });
    }
    
    // Decrypt
    const decryptResult = await decryptBackup(file.buffer, key);
    
    // Get database info
    const dbInfo = await getDatabaseInfo(decryptResult.database);
    
    res.json({
      success: true,
      stats: decryptResult.stats,
      database: dbInfo
    });
    
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
