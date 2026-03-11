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
    // ── Gather context from Supabase ──────────────────────────────
    const [phonesRes, insightsRes, logsRes, msgCountRes] = await Promise.allSettled([
      sb.from('phones').select('phone_number,employee_name,department,last_sync_at,total_messages,google_refresh_token').order('employee_name'),
      sb.from('ai_insights').select('summary,sentiment,red_flags,key_topics,message_count,analyzed_at,chats(contact_name,group_name,is_group),phones(employee_name,phone_number)').order('analyzed_at', { ascending: false }).limit(30),
      sb.from('pipeline_logs').select('status,messages_added,chats_added,error_message,started_at,phones(phone_number,employee_name)').order('started_at', { ascending: false }).limit(20),
      sb.from('messages').select('id', { count: 'exact', head: true })
    ]);

    const phones   = phonesRes.value?.data   || [];
    const insights = insightsRes.value?.data  || [];
    const logs     = logsRes.value?.data      || [];
    const totalMessages = msgCountRes.value?.count || 0;

    // ── Build compact context string ─────────────────────────────
    const now = new Date();
    const day = 86400000;

    const phoneSummary = phones.map(p => {
      const syncAge = p.last_sync_at ? Math.floor((now - new Date(p.last_sync_at)) / day) : null;
      const syncStatus = syncAge === null ? 'never synced' : syncAge === 0 ? 'synced today' : `last synced ${syncAge}d ago`;
      const driveStatus = p.google_refresh_token ? 'Drive connected' : 'Drive not connected';
      return `- ${p.employee_name || 'Unknown'} (${p.phone_number}), dept: ${p.department || 'N/A'}, msgs: ${p.total_messages || 0}, ${syncStatus}, ${driveStatus}`;
    }).join('\n');

    const insightSummary = insights.map(i => {
      const name = i.chats?.contact_name || i.chats?.group_name || 'Unknown chat';
      const agent = i.phones?.employee_name || i.phones?.phone_number || 'Unknown agent';
      const flags = i.red_flags?.length ? ` | RED FLAGS: ${i.red_flags.join(', ')}` : '';
      const topics = i.key_topics?.length ? ` | topics: ${i.key_topics.join(', ')}` : '';
      return `- [${i.sentiment}] ${agent} → "${name}": ${i.summary}${topics}${flags}`;
    }).join('\n');

    const logSummary = logs.map(l => {
      const agent = l.phones?.employee_name || l.phones?.phone_number || 'Unknown';
      return `- ${l.status} | ${agent} | ${l.messages_added || 0} msgs${l.error_message ? ` | error: ${l.error_message}` : ''}`;
    }).join('\n');

    const context = `
You are an AI assistant for a WhatsApp backup monitoring system.
You have full read access to this organization's WhatsApp backup data.
Today is ${now.toDateString()}.

OVERVIEW:
- Total phones monitored: ${phones.length}
- Total messages stored: ${totalMessages}
- Phones with Drive connected: ${phones.filter(p => p.google_refresh_token).length}
- Phones never synced: ${phones.filter(p => !p.last_sync_at).length}

AGENTS / PHONES:
${phoneSummary || 'No phones found'}

RECENT AI INSIGHTS (last 30 analyzed chats):
${insightSummary || 'No AI insights yet'}

RECENT SYNC LOGS (last 20):
${logSummary || 'No logs yet'}
`.trim();

    // ── Build messages for Claude ─────────────────────────────────
    const systemPrompt = `${context}

Answer questions about agents, messages, sync status, AI insights, red flags, and overall system health.
Be concise and direct. Use bullet points for lists. If asked for names or numbers, be specific.
If data is missing or tables are empty, say so clearly.`;

    const messages = [
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: question }
    ];

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
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
