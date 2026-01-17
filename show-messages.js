import initSqlJs from 'sql.js';
import { readFileSync } from 'fs';

async function main() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(readFileSync('msgstore.db'));
  
  console.log('═'.repeat(70));
  console.log('📱 WHATSAPP MESSAGES - VERIFICATION');
  console.log('═'.repeat(70));
  
  // Get JID table for contact names
  let jidMap = {};
  try {
    const jids = db.exec('SELECT _id, raw_string FROM jid');
    if (jids.length > 0) {
      jids[0].values.forEach(row => {
        jidMap[row[0]] = row[1];
      });
    }
  } catch (e) {}
  
  // Show last 30 messages with full details
  console.log('\n📨 Last 30 Messages:\n');
  
  const messages = db.exec(`
    SELECT 
      m._id,
      datetime(m.timestamp/1000, 'unixepoch', 'localtime') as time,
      m.from_me,
      m.chat_row_id,
      m.sender_jid_row_id,
      m.text_data,
      m.message_type
    FROM message m
    WHERE m.text_data IS NOT NULL AND m.text_data != ''
    ORDER BY m.timestamp DESC
    LIMIT 30
  `);
  
  if (messages.length > 0) {
    messages[0].values.forEach((row, i) => {
      const msgId = row[0];
      const time = row[1];
      const fromMe = row[2] === 1;
      const chatId = row[3];
      const senderId = row[4];
      const text = row[5] || '';
      const msgType = row[6];
      
      const sender = fromMe ? 'YOU' : (jidMap[senderId] || `Contact#${senderId}`);
      const chat = jidMap[chatId] || `Chat#${chatId}`;
      
      console.log(`─`.repeat(70));
      console.log(`#${i+1} | ${time} | ${fromMe ? '➡️ SENT' : '⬅️ RECEIVED'}`);
      console.log(`From: ${sender}`);
      console.log(`Chat: ${chat}`);
      console.log(`Message: ${text.substring(0, 200)}${text.length > 200 ? '...' : ''}`);
    });
  }
  
  console.log(`\n${'─'.repeat(70)}`);
  
  // Show some sent messages specifically
  console.log('\n📤 Your SENT Messages (last 10):\n');
  
  const sentMsgs = db.exec(`
    SELECT 
      datetime(m.timestamp/1000, 'unixepoch', 'localtime') as time,
      m.text_data
    FROM message m
    WHERE m.from_me = 1 AND m.text_data IS NOT NULL AND m.text_data != ''
    ORDER BY m.timestamp DESC
    LIMIT 10
  `);
  
  if (sentMsgs.length > 0) {
    sentMsgs[0].values.forEach((row, i) => {
      console.log(`${i+1}. [${row[0]}] ${row[1].substring(0, 100)}`);
    });
  } else {
    console.log('  No sent messages found');
  }
  
  console.log('\n' + '═'.repeat(70));
  console.log('✅ Verification complete - These are YOUR real WhatsApp messages!');
  console.log('═'.repeat(70));
}

main().catch(console.error);
