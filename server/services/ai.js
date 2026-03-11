import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ============================================
// Analyze a single chat's messages
// ============================================
export async function analyzeChat(chatInfo, messages) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set in .env');
  }

  if (!messages || messages.length === 0) {
    return { summary: 'No messages to analyze', sentiment: 'neutral', key_topics: [], red_flags: [] };
  }

  const messageText = messages
    .filter(m => m.text_data)
    .slice(-100) // last 100 messages
    .map(m => `[${m.from_me ? 'Agent' : 'Customer'}] ${m.text_data}`)
    .join('\n');

  if (!messageText.trim()) {
    return { summary: 'No text messages found', sentiment: 'neutral', key_topics: [], red_flags: [] };
  }

  const chatName = chatInfo?.contact_name || chatInfo?.group_name || 'Unknown';

  const prompt = `Analyze this WhatsApp sales conversation for chat "${chatName}".

MESSAGES:
${messageText.slice(0, 8000)}

Provide a JSON analysis with:
- summary: 2-3 sentence overview of the conversation
- sentiment: one of "positive", "neutral", "negative", "mixed"
- key_topics: array of up to 5 main topics discussed
- red_flags: array of any concerns (complaints, unprofessional language, policy violations, unresolved issues). Empty array if none.

Respond ONLY with valid JSON, no markdown.`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }]
  });

  const text = response.content[0].text.trim();

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return JSON.parse(text);
  } catch (e) {
    return { summary: text.slice(0, 200), sentiment: 'neutral', key_topics: [], red_flags: [] };
  }
}

// ============================================
// Analyze all chats for a phone
// ============================================
export async function analyzePhoneChats(phoneId, supabase) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[AI] ANTHROPIC_API_KEY not set — skipping analysis');
    return { analyzed: 0, skipped: 0 };
  }

  // Get chats with messages
  const { data: chats } = await supabase
    .from('chats')
    .select('*')
    .eq('phone_id', phoneId)
    .gt('total_messages', 0)
    .order('last_message_at', { ascending: false })
    .limit(20); // analyze top 20 most active chats

  if (!chats?.length) return { analyzed: 0, skipped: 0 };

  let analyzed = 0;
  let skipped = 0;

  for (const chat of chats) {
    try {
      // Check if already analyzed recently (within 24h)
      const { data: existing } = await supabase
        .from('ai_insights')
        .select('id, analyzed_at')
        .eq('chat_id', chat.id)
        .order('analyzed_at', { ascending: false })
        .limit(1)
        .single();

      if (existing) {
        const age = Date.now() - new Date(existing.analyzed_at).getTime();
        if (age < 24 * 60 * 60 * 1000) { // less than 24h old
          skipped++;
          continue;
        }
      }

      // Get recent messages for this chat
      const { data: messages } = await supabase
        .from('messages')
        .select('text_data, from_me, timestamp')
        .eq('chat_id', chat.id)
        .order('timestamp', { ascending: false })
        .limit(100);

      const insight = await analyzeChat(chat, messages || []);

      // Save insight
      await supabase.from('ai_insights').upsert({
        phone_id: phoneId,
        chat_id: chat.id,
        summary: insight.summary,
        sentiment: insight.sentiment,
        key_topics: insight.key_topics || [],
        red_flags: insight.red_flags || [],
        message_count: messages?.length || 0,
        analyzed_at: new Date().toISOString()
      }, { onConflict: 'chat_id' });

      analyzed++;
      console.log(`[AI] Analyzed chat ${chat.contact_name || chat.group_name}: ${insight.sentiment}`);

      // Rate limit: 1 request per second
      await new Promise(r => setTimeout(r, 1000));

    } catch (e) {
      console.error(`[AI] Error analyzing chat ${chat.id}:`, e.message);
      skipped++;
    }
  }

  return { analyzed, skipped };
}
