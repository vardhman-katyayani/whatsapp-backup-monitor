import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const router = Router();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ============================================
// POST /api/chat  — ask anything about your data
// ============================================
router.post('/chat', async (req, res) => {
  const { question, history = [] } = req.body;

  if (!question?.trim()) {
    return res.status(400).json({ error: 'question is required' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  try {
    // ── Gather rich context from Supabase ────────────────────────
    const [
      phonesRes,
      insightsRes,
      logsRes,
      chatsRes,
      recentMsgsRes,
      flaggedRes
    ] = await Promise.allSettled([
      // All phones with full stats
      sb.from('phones')
        .select('phone_number,employee_name,department,last_sync_at,total_messages,is_active')
        .order('employee_name'),

      // All AI insights with chat + phone info
      sb.from('ai_insights')
        .select('summary,sentiment,red_flags,key_topics,message_count,analyzed_at,chats(contact_name,group_name,is_group,jid),phones(employee_name,phone_number)')
        .order('analyzed_at', { ascending: false })
        .limit(100),

      // Recent sync pipeline logs
      sb.from('pipeline_logs')
        .select('status,messages_added,chats_added,error_message,started_at,backup_filename,phones(phone_number,employee_name)')
        .order('started_at', { ascending: false })
        .limit(50),

      // All chats with message counts
      sb.from('chats')
        .select('contact_name,group_name,is_group,total_messages,last_message_at,last_message_preview,phones(employee_name,phone_number)')
        .order('total_messages', { ascending: false })
        .limit(100),

      // Recent messages sample (last 200 messages across all chats)
      sb.from('messages')
        .select('text_data,from_me,timestamp,chats(contact_name,group_name),phones(employee_name)')
        .not('text_data', 'is', null)
        .order('timestamp', { ascending: false })
        .limit(200),

      // Flagged / red flag insights only
      sb.from('ai_insights')
        .select('summary,red_flags,sentiment,chats(contact_name,group_name),phones(employee_name,phone_number),analyzed_at')
        .not('red_flags', 'eq', '{}')
        .order('analyzed_at', { ascending: false })
        .limit(50)
    ]);

    const phones       = phonesRes.value?.data    || [];
    const insights     = insightsRes.value?.data   || [];
    const logs         = logsRes.value?.data       || [];
    const chats        = chatsRes.value?.data      || [];
    const recentMsgs   = recentMsgsRes.value?.data || [];
    const flagged      = flaggedRes.value?.data    || [];

    const now = new Date();
    const day = 86400000;

    // ── Format each section ───────────────────────────────────────

    const phoneSummary = phones.length
      ? phones.map(p => {
          const syncAge = p.last_sync_at ? Math.floor((now - new Date(p.last_sync_at)) / day) : null;
          const syncStatus = syncAge === null ? 'never synced' : syncAge === 0 ? 'synced today' : `last synced ${syncAge}d ago`;
          return `- ${p.employee_name || 'Unknown'} (${p.phone_number}) | dept: ${p.department || 'N/A'} | msgs: ${p.total_messages || 0} | ${syncStatus} | ${p.is_active ? 'active' : 'inactive'}`;
        }).join('\n')
      : 'No phones found';

    const chatSummary = chats.length
      ? chats.map(c => {
          const name = c.contact_name || c.group_name || 'Unknown';
          const agent = c.phones?.employee_name || c.phones?.phone_number || '?';
          const preview = c.last_message_preview ? ` | last: "${c.last_message_preview.slice(0, 60)}"` : '';
          return `- [${c.is_group ? 'GROUP' : 'DM'}] ${agent} ↔ "${name}" | ${c.total_messages || 0} msgs${preview}`;
        }).join('\n')
      : 'No chats found';

    const insightSummary = insights.length
      ? insights.map(i => {
          const name  = i.chats?.contact_name || i.chats?.group_name || 'Unknown chat';
          const agent = i.phones?.employee_name || i.phones?.phone_number || 'Unknown';
          const flags = i.red_flags?.length ? ` | 🚨 RED FLAGS: ${i.red_flags.join('; ')}` : '';
          const topics = i.key_topics?.length ? ` | topics: ${i.key_topics.join(', ')}` : '';
          return `- [${i.sentiment?.toUpperCase()}] ${agent} → "${name}" (${i.message_count} msgs): ${i.summary}${topics}${flags}`;
        }).join('\n')
      : 'No AI insights yet — run AI Analysis first from the dashboard';

    const flaggedSummary = flagged.length
      ? flagged.map(f => {
          const name  = f.chats?.contact_name || f.chats?.group_name || 'Unknown';
          const agent = f.phones?.employee_name || f.phones?.phone_number || 'Unknown';
          return `- ${agent} → "${name}": ${f.red_flags?.join(' | ')} (${f.sentiment})`;
        }).join('\n')
      : 'No red flags found';

    const logSummary = logs.length
      ? logs.map(l => {
          const agent = l.phones?.employee_name || l.phones?.phone_number || 'Unknown';
          const err = l.error_message ? ` | ❌ ${l.error_message.slice(0, 80)}` : '';
          return `- [${l.status}] ${agent} | ${l.messages_added || 0} msgs added | ${new Date(l.started_at).toLocaleString('en-IN')}${err}`;
        }).join('\n')
      : 'No sync logs yet';

    // Recent message samples for context
    const msgSamples = recentMsgs.length
      ? recentMsgs.map(m => {
          const chat  = m.chats?.contact_name || m.chats?.group_name || 'Unknown';
          const agent = m.phones?.employee_name || '?';
          const dir   = m.from_me ? 'SENT' : 'RECV';
          const time  = m.timestamp ? new Date(m.timestamp).toLocaleString('en-IN') : '';
          return `[${dir}][${agent}→${chat}][${time}] ${m.text_data?.slice(0, 120)}`;
        }).join('\n')
      : 'No messages found';

    // ── System prompt ─────────────────────────────────────────────
    const systemPrompt = `You are an AI assistant for a WhatsApp backup monitoring system used by Katyayani Organics.
You have FULL read access to all WhatsApp backup data. Today is ${now.toDateString()}.

OVERVIEW:
- Total phones monitored: ${phones.length} (${phones.filter(p => p.is_active).length} active)
- Total chats tracked: ${chats.length}
- AI-analyzed chats: ${insights.length}
- Chats with RED FLAGS: ${flagged.length}
- Syncs in last 50 logs: ${logs.filter(l => l.status === 'success').length} success, ${logs.filter(l => l.status === 'failed').length} failed

AGENTS / PHONES:
${phoneSummary}

ALL CHATS (top 100 by message count):
${chatSummary}

AI INSIGHTS (last 100 analyzed chats):
${insightSummary}

RED FLAG ALERTS:
${flaggedSummary}

RECENT SYNC LOGS (last 50):
${logSummary}

RECENT MESSAGES SAMPLE (last 200 text messages):
${msgSamples}

INSTRUCTIONS:
- Answer questions about agents, their conversations, red flags, sync status, and system health
- Be specific — use real names, numbers, and message content from the data above
- If asked about a specific person or chat, find it in the data and give details
- For red flags or issues, list them clearly with the agent name
- If something is not in the data, say so explicitly
- Use bullet points for lists. Keep responses clear and structured.`;

    const messages = [
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: question }
    ];

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: systemPrompt,
      messages
    });

    res.json({ answer: response.content[0].text });

  } catch (err) {
    console.error('[Chat] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
