import initSqlJs from 'sql.js';
import { readFileSync } from 'fs';

async function main() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(readFileSync('msgstore.db'));
  
  console.log('═'.repeat(80));
  console.log('👥 WHATSAPP TEAM/GROUP MESSAGES');
  console.log('═'.repeat(80));
  
  // Get JID table for contact/group names
  let jidMap = {};
  try {
    const jids = db.exec('SELECT _id, raw_string FROM jid');
    if (jids.length > 0) {
      jids[0].values.forEach(row => {
        jidMap[row[0]] = row[1];
      });
    }
  } catch (e) {
    console.error('Error loading JID table:', e.message);
  }
  
  // Get chat table to find group chats
  let chatMap = {};
  try {
    const chats = db.exec('SELECT _id, jid_row_id, subject FROM chat');
    if (chats.length > 0) {
      chats[0].values.forEach(row => {
        const chatId = row[0];
        const jidId = row[1];
        const subject = row[2];
        const jid = jidMap[jidId] || '';
        
        // Check if it's a group (ends with @g.us)
        if (jid.includes('@g.us')) {
          chatMap[chatId] = {
            jid: jid,
            name: subject || jid.split('@')[0] || `Group ${chatId}`,
            isGroup: true
          };
        } else {
          chatMap[chatId] = {
            jid: jid,
            name: subject || jid.split('@')[0] || `Chat ${chatId}`,
            isGroup: false
          };
        }
      });
    }
  } catch (e) {
    console.error('Error loading chat table:', e.message);
  }
  
  // Filter only group chats
  const groupChatIds = Object.keys(chatMap).filter(id => chatMap[id].isGroup);
  
  console.log(`\n📊 Found ${groupChatIds.length} group chats\n`);
  
  // List all groups
  if (groupChatIds.length > 0) {
    console.log('📋 Group Chats List:');
    console.log('─'.repeat(80));
    groupChatIds.forEach((chatId, i) => {
      const chat = chatMap[chatId];
      const msgCount = db.exec(`SELECT COUNT(*) FROM message WHERE chat_row_id = ${chatId}`)[0]?.values[0]?.[0] || 0;
      console.log(`${i + 1}. ${chat.name}`);
      console.log(`   JID: ${chat.jid}`);
      console.log(`   Messages: ${msgCount}`);
      console.log('');
    });
  }
  
  // Show messages from all groups
  console.log('\n💬 Team/Group Messages (Most Recent First):\n');
  console.log('═'.repeat(80));
  
  if (groupChatIds.length === 0) {
    console.log('❌ No group chats found in database');
    return;
  }
  
  // Get messages from group chats - NO LIMIT, show ALL messages
  const groupChatIdsStr = groupChatIds.join(',');
  const messages = db.exec(`
    SELECT 
      m._id,
      datetime(m.timestamp/1000, 'unixepoch', 'localtime') as time,
      m.from_me,
      m.chat_row_id,
      m.sender_jid_row_id,
      m.text_data,
      m.message_type,
      m.timestamp
    FROM message m
    WHERE m.chat_row_id IN (${groupChatIdsStr})
      AND m.text_data IS NOT NULL 
      AND m.text_data != ''
    ORDER BY m.timestamp DESC
  `);
  
  if (messages.length > 0 && messages[0].values.length > 0) {
    console.log(`\n📨 Total messages found: ${messages[0].values.length}\n`);
    messages[0].values.forEach((row, i) => {
      const msgId = row[0];
      const time = row[1];
      const fromMe = row[2] === 1;
      const chatId = row[3];
      const senderId = row[4];
      const text = row[5] || '';
      const msgType = row[6];
      
      const chat = chatMap[chatId] || { name: `Chat#${chatId}`, isGroup: false };
      const sender = fromMe ? 'YOU' : (jidMap[senderId] ? jidMap[senderId].split('@')[0] : `Member#${senderId}`);
      
      // Get message type name
      const typeNames = {
        0: '📝 Text',
        1: '🖼️ Image',
        2: '🎵 Audio',
        3: '🎥 Video',
        8: '📄 Document',
        9: '😀 Sticker',
        15: '🎬 GIF'
      };
      const typeName = typeNames[msgType] || `Type ${msgType}`;
      
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`#${i + 1} | ${time} | ${fromMe ? '➡️ YOU' : '⬅️ ' + sender}`);
      console.log(`Group: ${chat.name}`);
      console.log(`Type: ${typeName}`);
      console.log(`Message:`);
      // Show complete message, wrap long lines if needed
      const lines = text.split('\n');
      lines.forEach(line => {
        console.log(`   ${line}`);
      });
    });
  } else {
    console.log('❌ No messages found in group chats');
  }
  
  // Show messages grouped by chat
  console.log('\n\n' + '═'.repeat(80));
  console.log('📊 Messages by Group:\n');
  
  groupChatIds.forEach(chatId => {
    const chat = chatMap[chatId];
    const groupMessages = db.exec(`
      SELECT 
        datetime(m.timestamp/1000, 'unixepoch', 'localtime') as time,
        m.from_me,
        m.sender_jid_row_id,
        m.text_data
      FROM message m
      WHERE m.chat_row_id = ${chatId}
        AND m.text_data IS NOT NULL 
        AND m.text_data != ''
      ORDER BY m.timestamp DESC
    `);
    
    if (groupMessages.length > 0 && groupMessages[0].values.length > 0) {
      console.log(`\n${'═'.repeat(80)}`);
      console.log(`👥 ${chat.name} (${groupMessages[0].values.length} total messages)`);
      console.log('─'.repeat(80));
      
      groupMessages[0].values.forEach((row, i) => {
        const time = row[0];
        const fromMe = row[1] === 1;
        const senderId = row[2];
        const text = row[3] || '';
        
        const sender = fromMe ? 'YOU' : (jidMap[senderId] ? jidMap[senderId].split('@')[0] : `Member#${senderId}`);
        const prefix = fromMe ? '➡️' : '⬅️';
        
        console.log(`\n${prefix} [${time}] ${sender}:`);
        // Show complete message without truncation
        const lines = text.split('\n');
        lines.forEach(line => {
          console.log(`   ${line}`);
        });
      });
    }
  });
  
  console.log('\n' + '═'.repeat(80));
  console.log('✅ Team messages display complete!');
  console.log('═'.repeat(80));
}

main().catch(console.error);
