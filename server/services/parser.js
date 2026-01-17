import initSqlJs from 'sql.js';

/**
 * WhatsApp SQLite Database Parser
 * Extracts messages and chats from decrypted msgstore.db
 */

let SQL = null;

async function getSQL() {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  return SQL;
}

// ============================================
// Parse WhatsApp Database
// ============================================
export async function parseWhatsAppDatabase(databaseBuffer, phoneId) {
  const startTime = Date.now();
  const SQLite = await getSQL();
  const db = new SQLite.Database(databaseBuffer);
  
  try {
    // Build JID map for contact names
    const jidMap = {};
    try {
      const jids = db.exec('SELECT _id, raw_string FROM jid');
      if (jids.length > 0) {
        jids[0].values.forEach(row => {
          jidMap[row[0]] = row[1];
        });
      }
    } catch (e) {
      console.warn('Could not load JID table:', e.message);
    }
    
    // Extract chats
    const chats = [];
    try {
      const chatResult = db.exec(`
        SELECT 
          c._id,
          c.jid_row_id,
          c.subject,
          c.created_timestamp,
          (SELECT COUNT(*) FROM message m WHERE m.chat_row_id = c._id) as msg_count,
          (SELECT MAX(m.timestamp) FROM message m WHERE m.chat_row_id = c._id) as last_msg_time,
          (SELECT m.text_data FROM message m WHERE m.chat_row_id = c._id ORDER BY m.timestamp DESC LIMIT 1) as last_msg
        FROM chat c
        ORDER BY last_msg_time DESC
      `);
      
      if (chatResult.length > 0) {
        chatResult[0].values.forEach(row => {
          const jid = jidMap[row[1]] || `unknown_${row[1]}`;
          const isGroup = jid.includes('@g.us');
          
          chats.push({
            wa_chat_id: row[0],
            jid: jid,
            contact_name: isGroup ? (row[2] || jid.split('@')[0]) : jid.split('@')[0],
            contact_number: isGroup ? null : jid.split('@')[0],
            is_group: isGroup,
            group_name: isGroup ? row[2] : null,
            total_messages: row[4] || 0,
            last_message_at: row[5] ? new Date(row[5]).toISOString() : null,
            last_message_preview: row[6] ? row[6].substring(0, 200) : null
          });
        });
      }
    } catch (e) {
      console.warn('Could not extract chats:', e.message);
    }
    
    // Extract messages
    const messages = [];
    try {
      const msgResult = db.exec(`
        SELECT 
          m._id,
          m.chat_row_id,
          m.timestamp,
          m.from_me,
          m.sender_jid_row_id,
          m.text_data,
          m.message_type,
          m.starred,
          m.forwarded
        FROM message m
        WHERE m.timestamp > 0
        ORDER BY m.timestamp ASC
      `);
      
      if (msgResult.length > 0) {
        const chatJidMap = {};
        chats.forEach(c => {
          chatJidMap[c.wa_chat_id] = c.jid;
        });
        
        msgResult[0].values.forEach(row => {
          const chatId = row[1];
          const senderId = row[4];
          const timestamp = row[2];
          
          // Get message type string
          const msgTypeNum = row[6] || 0;
          let messageType = 'text';
          switch (msgTypeNum) {
            case 0: messageType = 'text'; break;
            case 1: messageType = 'image'; break;
            case 2: messageType = 'audio'; break;
            case 3: messageType = 'video'; break;
            case 4: messageType = 'contact'; break;
            case 5: messageType = 'location'; break;
            case 8: messageType = 'document'; break;
            case 9: messageType = 'sticker'; break;
            case 15: messageType = 'gif'; break;
            default: messageType = 'other';
          }
          
          messages.push({
            phone_id: phoneId,
            wa_message_id: String(row[0]),
            chat_jid: chatJidMap[chatId] || `chat_${chatId}`,
            timestamp: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
            from_me: row[3] === 1,
            sender_jid: jidMap[senderId] || null,
            sender_name: jidMap[senderId] ? jidMap[senderId].split('@')[0] : null,
            message_type: messageType,
            text_data: row[5] || null,
            is_starred: row[7] === 1,
            is_forwarded: row[8] === 1
          });
        });
      }
    } catch (e) {
      console.warn('Could not extract messages:', e.message);
    }
    
    db.close();
    
    const duration = Date.now() - startTime;
    
    return {
      chats,
      messages,
      stats: {
        chatCount: chats.length,
        messageCount: messages.length,
        durationMs: duration
      }
    };
  } catch (error) {
    db.close();
    throw error;
  }
}

// ============================================
// Get Database Schema Info
// ============================================
export async function getDatabaseInfo(databaseBuffer) {
  const SQLite = await getSQL();
  const db = new SQLite.Database(databaseBuffer);
  
  try {
    const tables = db.exec(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      ORDER BY name
    `);
    
    const tableList = tables.length > 0 
      ? tables[0].values.map(row => row[0])
      : [];
    
    // Get counts for key tables
    const counts = {};
    for (const table of ['message', 'chat', 'jid']) {
      if (tableList.includes(table)) {
        try {
          const result = db.exec(`SELECT COUNT(*) FROM ${table}`);
          counts[table] = result[0]?.values[0]?.[0] || 0;
        } catch (e) {
          counts[table] = 'error';
        }
      }
    }
    
    db.close();
    
    return {
      tables: tableList,
      counts
    };
  } catch (error) {
    db.close();
    throw error;
  }
}

export default { parseWhatsAppDatabase, getDatabaseInfo };
