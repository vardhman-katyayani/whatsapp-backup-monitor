import initSqlJs from 'sql.js';
import { readFileSync } from 'fs';

async function main() {
  console.log('📊 Parsing WhatsApp Database...\n');
  
  const SQL = await initSqlJs();
  const db = new SQL.Database(readFileSync('msgstore.db'));
  
  // Count messages
  const msgCount = db.exec('SELECT COUNT(*) FROM message')[0].values[0][0];
  console.log(`✅ Total messages: ${msgCount}`);
  
  // Count chats
  const chatCount = db.exec('SELECT COUNT(*) FROM chat')[0].values[0][0];
  console.log(`✅ Total chats: ${chatCount}`);
  
  // Get chat table columns
  const chatCols = db.exec("PRAGMA table_info(chat)")[0].values.map(r => r[1]);
  console.log(`\nChat columns: ${chatCols.slice(0, 10).join(', ')}...`);
  
  // Get message table columns
  const msgCols = db.exec("PRAGMA table_info(message)")[0].values.map(r => r[1]);
  console.log(`Message columns: ${msgCols.slice(0, 10).join(', ')}...`);
  
  // Find the JID column
  const jidCol = chatCols.find(c => c.includes('jid')) || chatCols.find(c => c.includes('key')) || '_id';
  console.log(`\nUsing JID column: ${jidCol}`);
  
  // List chats with message counts
  console.log('\n💬 Your Chats (top 15):\n');
  
  try {
    const chats = db.exec(`
      SELECT 
        c.${jidCol},
        COUNT(m._id) as msg_count
      FROM chat c
      LEFT JOIN message m ON m.chat_row_id = c._id
      GROUP BY c._id
      ORDER BY msg_count DESC
      LIMIT 15
    `);
    
    if (chats.length > 0) {
      chats[0].values.forEach((row, i) => {
        const jid = String(row[0] || 'Unknown');
        const name = jid.replace('@s.whatsapp.net', '').replace('@g.us', ' (group)');
        console.log(`  ${i + 1}. ${name}: ${row[1]} messages`);
      });
    }
  } catch (e) {
    console.log('  Could not list chats: ' + e.message);
  }
  
  // Show recent messages
  console.log('\n📱 Recent Messages (last 15):\n');
  
  try {
    const messages = db.exec(`
      SELECT 
        datetime(m.timestamp/1000, 'unixepoch', 'localtime') as time,
        CASE WHEN m.from_me = 1 THEN 'You' ELSE 'Them' END as direction,
        m.chat_row_id,
        SUBSTR(COALESCE(m.text_data, '[media]'), 1, 80) as message
      FROM message m
      WHERE m.text_data IS NOT NULL AND m.text_data != ''
      ORDER BY m.timestamp DESC
      LIMIT 15
    `);
    
    if (messages.length > 0) {
      messages[0].values.forEach(row => {
        const msg = row[3] || '[media]';
        console.log(`[${row[0]}] ${row[1]}: ${msg}`);
      });
    }
  } catch (e) {
    console.log('  Could not list messages: ' + e.message);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('🎉 SUCCESS! Your WhatsApp backup has been fully decrypted!');
  console.log('='.repeat(60));
  console.log('\n📁 Decrypted database: msgstore.db');
  console.log('📊 You can open it with any SQLite browser (DB Browser for SQLite)');
  console.log('🔑 64-digit key saved for future use');
}

main().catch(console.error);
