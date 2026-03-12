import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(' Supabase credentials not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY');
}

export const supabase = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    })
  : null;

// ============================================
// Phone Operations
// ============================================
export async function getPhones() {
  if (!supabase) return { data: [], error: 'Supabase not configured' };
  
  const { data, error } = await supabase
    .from('phones')
    .select('*')
    .order('employee_name');
  
  return { data, error };
}

export async function getPhoneById(phoneId) {
  if (!supabase) return { data: null, error: 'Supabase not configured' };
  
  const { data, error } = await supabase
    .from('phones')
    .select('*')
    .eq('id', phoneId)
    .single();
  
  return { data, error };
}

export async function getPhoneByNumber(phoneNumber) {
  if (!supabase) return { data: null, error: 'Supabase not configured' };
  
  const { data, error } = await supabase
    .from('phones')
    .select('*')
    .eq('phone_number', phoneNumber)
    .single();
  
  return { data, error };
}

export async function updatePhoneLastSync(phoneId, messagesAdded, chatsAdded) {
  if (!supabase) return { error: 'Supabase not configured' };
  
  const { error } = await supabase
    .from('phones')
    .update({
      last_sync_at: new Date().toISOString(),
      total_messages: supabase.rpc('increment_counter', { row_id: phoneId, amount: messagesAdded }),
      total_chats: chatsAdded,
      updated_at: new Date().toISOString()
    })
    .eq('id', phoneId);
  
  return { error };
}

// ============================================
// Chat Operations
// ============================================
export async function upsertChat(phoneId, chatData) {
  if (!supabase) return { data: null, error: 'Supabase not configured' };
  
  const { data, error } = await supabase
    .from('chats')
    .upsert({
      phone_id: phoneId,
      jid: chatData.jid,
      contact_name: chatData.contact_name,
      contact_number: chatData.contact_number,
      is_group: chatData.is_group || false,
      group_name: chatData.group_name,
      last_message_at: chatData.last_message_at,
      last_message_preview: chatData.last_message_preview,
      total_messages: chatData.total_messages || 0,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'phone_id,jid'
    })
    .select()
    .single();
  
  return { data, error };
}

export async function getChatsForPhone(phoneId) {
  if (!supabase) return { data: [], error: 'Supabase not configured' };
  
  const { data, error } = await supabase
    .from('chats')
    .select('*')
    .eq('phone_id', phoneId)
    .order('last_message_at', { ascending: false });
  
  return { data, error };
}

// ============================================
// Message Operations
// ============================================
export async function insertMessages(messages) {
  if (!supabase) return { error: 'Supabase not configured' };
  if (!messages || messages.length === 0) return { error: null };

  // Deduplicate in JS — fetch existing wa_message_ids for this phone
  // so we never hit a DB constraint error (no schema change needed)
  const phoneId = messages[0].phone_id;
  const { data: existing } = await supabase
    .from('messages')
    .select('wa_message_id')
    .eq('phone_id', phoneId);

  const existingIds = new Set((existing || []).map(m => m.wa_message_id));
  const newMessages = messages.filter(m => !existingIds.has(m.wa_message_id));

  if (newMessages.length === 0) return { error: null, inserted: 0 };

  // Insert in batches of 500
  const batchSize = 500;
  let totalInserted = 0;

  for (let i = 0; i < newMessages.length; i += batchSize) {
    const batch = newMessages.slice(i, i + batchSize);
    const { error } = await supabase.from('messages').insert(batch);

    if (error) {
      console.error(`Batch insert error at ${i}:`, error);
      return { error, inserted: totalInserted };
    }

    totalInserted += batch.length;
  }

  return { error: null, inserted: totalInserted };
}

export async function getMessagesForChat(chatId, limit = 100, offset = 0) {
  if (!supabase) return { data: [], error: 'Supabase not configured' };
  
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('timestamp', { ascending: false })
    .range(offset, offset + limit - 1);
  
  return { data, error };
}

// ============================================
// Pipeline Logs Operations
// ============================================
export async function createPipelineLog(phoneId, filename, fileSize) {
  if (!supabase) return { data: { id: 'mock-log-id' }, error: null };
  
  const { data, error } = await supabase
    .from('pipeline_logs')
    .insert({
      phone_id: phoneId,
      backup_filename: filename,
      file_size_bytes: fileSize,
      status: 'received',
      started_at: new Date().toISOString()
    })
    .select()
    .single();
  
  return { data, error };
}

export async function updatePipelineLog(logId, updates) {
  if (!supabase) return { error: null };
  
  const { error } = await supabase
    .from('pipeline_logs')
    .update({
      ...updates,
      completed_at: updates.status === 'success' || updates.status === 'failed' 
        ? new Date().toISOString() 
        : undefined
    })
    .eq('id', logId);
  
  return { error };
}

export async function getPipelineLogs(limit = 50, phoneId = null) {
  if (!supabase) return { data: [], error: 'Supabase not configured' };
  
  let query = supabase
    .from('pipeline_logs')
    .select('*, phones(phone_number, employee_name)')
    .order('started_at', { ascending: false })
    .limit(limit);
  
  if (phoneId) {
    query = query.eq('phone_id', phoneId);
  }
  
  const { data, error } = await query;
  return { data, error };
}

// ============================================
// Stats Operations
// ============================================
export async function getDashboardStats() {
  if (!supabase) {
    return {
      data: {
        totalPhones: 0,
        activePhones: 0,
        totalMessages: 0,
        messagesToday: 0,
        successRate: 0,
        recentLogs: []
      },
      error: 'Supabase not configured'
    };
  }
  
  try {
    // Get phone counts
    const { count: totalPhones } = await supabase
      .from('phones')
      .select('*', { count: 'exact', head: true });
    
    const { count: activePhones } = await supabase
      .from('phones')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);
    
    // Get message count
    const { count: totalMessages } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true });
    
    // Get today's messages by actual message timestamp (not DB insert time)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count: messagesToday } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .gte('timestamp', today.toISOString());
    
    // Get recent pipeline logs
    const { data: recentLogs } = await supabase
      .from('pipeline_logs')
      .select('*, phones(phone_number, employee_name)')
      .order('started_at', { ascending: false })
      .limit(10);
    
    // Calculate success rate
    const { count: successCount } = await supabase
      .from('pipeline_logs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'success');
    
    const { count: totalLogs } = await supabase
      .from('pipeline_logs')
      .select('*', { count: 'exact', head: true });
    
    const successRate = totalLogs > 0 ? Math.round((successCount / totalLogs) * 100) : 100;
    
    return {
      data: {
        totalPhones: totalPhones || 0,
        activePhones: activePhones || 0,
        totalMessages: totalMessages || 0,
        messagesToday: messagesToday || 0,
        successRate,
        recentLogs: recentLogs || []
      },
      error: null
    };
  } catch (error) {
    return { data: null, error: error.message };
  }
}

// ============================================
// Messages Operations
// ============================================
export async function getMessagesForChatPaged(chatId, limit = 50, offset = 0) {
  if (!supabase) return { data: [], error: 'Supabase not configured' };

  // Fetch newest first (DESC), then caller reverses for chronological display.
  // "Load more" increments offset to get older messages.
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('timestamp', { ascending: false })
    .range(offset, offset + limit - 1);

  return { data, error };
}

export async function getChatsForPhonePaged(phoneId, limit = 100, offset = 0) {
  if (!supabase) return { data: [], error: 'Supabase not configured' };

  const { data, error } = await supabase
    .from('chats')
    .select('*')
    .eq('phone_id', phoneId)
    .order('total_messages', { ascending: false })  // most active chats first
    .range(offset, offset + limit - 1);

  return { data, error };
}

// ============================================
// AI Insights Operations
// ============================================
export async function getAIInsights(phoneId, chatId = null) {
  if (!supabase) return { data: [], error: 'Supabase not configured' };

  let query = supabase
    .from('ai_insights')
    .select('*, chats(contact_name, group_name, is_group, jid)')
    .eq('phone_id', phoneId)
    .order('analyzed_at', { ascending: false });

  if (chatId) query = query.eq('chat_id', chatId);

  const { data, error } = await query.limit(50);
  return { data, error };
}

export async function saveAIInsight(insight) {
  if (!supabase) return { error: 'Supabase not configured' };

  const { data, error } = await supabase
    .from('ai_insights')
    .upsert(insight, { onConflict: 'chat_id' })
    .select()
    .single();

  return { data, error };
}

export async function getFlaggedInsights(limit = 50) {
  if (!supabase) return { data: [], error: 'Supabase not configured' };

  const { data, error } = await supabase
    .from('ai_insights')
    .select('*, chats(contact_name, group_name, jid), phones(phone_number, employee_name)')
    .not('red_flags', 'eq', '{}')
    .order('analyzed_at', { ascending: false })
    .limit(limit);

  return { data, error };
}

// ============================================
// Google OAuth Token Operations
// ============================================
export async function updatePhoneTokens(phoneId, tokens) {
  if (!supabase) return { error: 'Supabase not configured' };

  const { error } = await supabase
    .from('phones')
    .update({
      google_refresh_token: tokens.refresh_token,
      google_access_token: tokens.access_token,
      google_token_expiry: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : null,
      updated_at: new Date().toISOString()
    })
    .eq('id', phoneId);

  return { error };
}

export async function clearPhoneTokens(phoneId) {
  if (!supabase) return { error: 'Supabase not configured' };

  const { error } = await supabase
    .from('phones')
    .update({
      google_refresh_token: null,
      google_access_token: null,
      google_token_expiry: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', phoneId);

  return { error };
}

export default supabase;
