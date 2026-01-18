import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️  Supabase credentials not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY');
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
  
  // Insert in batches of 1000
  const batchSize = 1000;
  let totalInserted = 0;
  
  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize);
    const { error } = await supabase
      .from('messages')
      .insert(batch);
    
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
    
    // Get today's messages
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count: messagesToday } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', today.toISOString());
    
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

export default supabase;
