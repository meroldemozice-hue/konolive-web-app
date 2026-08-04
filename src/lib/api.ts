import { supabase } from './supabase';
import type {
  Profile, VerificationRequest, RequestDocument,
  Message, Notification, ActivityLog, AgentStats, GlobalStats, RequestStatus
} from '@/types/types';

// ─── PROFILES ───────────────────────────────────────────
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  return data;
}

export async function getAllProfiles(limit = 100): Promise<Profile[]> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return Array.isArray(data) ? data : [];
}

export async function updateProfile(userId: string, updates: Partial<Profile>) {
  return supabase.from('profiles').update(updates).eq('id', userId);
}

// ─── VERIFICATION REQUESTS ───────────────────────────────
export async function getMyRequests(applicantId: string, limit = 50): Promise<VerificationRequest[]> {
  const { data } = await supabase
    .from('verification_requests')
    .select('*, documents:request_documents(*)')
    .eq('applicant_id', applicantId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return Array.isArray(data) ? data : [];
}

export async function getAllRequests(limit = 100): Promise<VerificationRequest[]> {
  const { data } = await supabase
    .from('verification_requests')
    .select('*, applicant:profiles!verification_requests_applicant_id_fkey(id,username,phone,locality), agent:profiles!verification_requests_agent_id_fkey(id,username), documents:request_documents(*)')
    .order('created_at', { ascending: false })
    .limit(limit);
  return Array.isArray(data) ? data : [];
}

export interface ProcessingRequest {
  id: string;
  applicant_id: string;
  applicant_phone?: string;
  applicant_username?: string;
  agent_id: string | null;
  agent_username: string | null;
  processing_started_at: string | null;
  created_at: string;
}

export interface PendingRequest {
  id: string;
  applicant_id: string;
  applicant_phone: string | null;
  applicant_username: string | null;
  created_at: string;
}

/** Demandes en attente */
export async function getPendingRequests(): Promise<PendingRequest[]> {
  const { data } = await supabase
    .from('verification_requests')
    .select('id, applicant_id, created_at, applicant:profiles!verification_requests_applicant_id_fkey(username,phone)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (!Array.isArray(data)) return [];
  return data.map((r: any) => ({
    id: r.id,
    applicant_id: r.applicant_id,
    applicant_phone: r.applicant?.phone ?? null,
    applicant_username: r.applicant?.username ?? null,
    created_at: r.created_at,
  }));
}

/** Demandes actuellement en cours de traitement avec nom agent + heure de début */
export async function getProcessingRequests(): Promise<ProcessingRequest[]> {
  const { data } = await supabase
    .from('verification_requests')
    .select('id, applicant_id, agent_id, processing_started_at, created_at, applicant:profiles!verification_requests_applicant_id_fkey(username,phone), agent:profiles!verification_requests_agent_id_fkey(username)')
    .eq('status', 'processing')
    .order('processing_started_at', { ascending: true });
  if (!Array.isArray(data)) return [];
  return data.map((r: any) => ({
    id: r.id,
    applicant_id: r.applicant_id,
    applicant_phone: r.applicant?.phone ?? null,
    applicant_username: r.applicant?.username ?? null,
    agent_id: r.agent_id,
    agent_username: r.agent?.username ?? null,
    processing_started_at: r.processing_started_at,
    created_at: r.created_at,
  }));
}

/** Demandes en cours depuis plus de 7 minutes (alerte superviseur) */
export interface OvertimeRequest {
  id: string;
  applicant_id: string;
  agent_id: string | null;
  processing_started_at: string;
  elapsed_minutes: number;
  applicant_username: string | null;
  applicant_phone: string | null;
  agent_username: string | null;
}

export async function getOvertimeRequests(): Promise<OvertimeRequest[]> {
  const { data, error } = await supabase.rpc('get_overtime_requests');
  if (error || !Array.isArray(data)) return [];
  return data as OvertimeRequest[];
}

/** Transfert atomique d'une demande vers un autre agent */
export async function transferRequest(requestId: string, newAgentId: string): Promise<boolean> {
  const { error } = await supabase.rpc('transfer_request', {
    p_request_id: requestId,
    p_new_agent_id: newAgentId,
  });
  return !error;
}

/** Agents actuellement en ligne (ont une demande en cours de traitement) */
export async function getOnlineAgentProfiles(): Promise<{ id: string; username: string }[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('role', 'agent')
    .eq('is_online', true)
    .eq('is_paused', false);
  if (!Array.isArray(data)) return [];
  return data.map((r: any) => ({ id: r.id, username: r.username ?? r.id }));
}

/** Agents actuellement en pause */
export async function getPausedAgentProfiles(): Promise<{ id: string; username: string }[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('role', 'agent')
    .eq('is_online', true)
    .eq('is_paused', true);
  if (!Array.isArray(data)) return [];
  return data.map((r: any) => ({ id: r.id, username: r.username ?? r.id }));
}

export async function getAgentRequests(agentId: string, limit = 200): Promise<VerificationRequest[]> {
  const { data } = await supabase
    .from('verification_requests')
    .select('*, applicant:profiles!verification_requests_applicant_id_fkey(id,username,phone,locality), documents:request_documents(*)')
    .or(`status.eq.pending,agent_id.eq.${agentId}`)
    .order('created_at', { ascending: false })
    .limit(limit);
  return Array.isArray(data) ? data : [];
}

export async function getRequestById(id: string): Promise<VerificationRequest | null> {
  const { data } = await supabase
    .from('verification_requests')
    .select('*, applicant:profiles!verification_requests_applicant_id_fkey(*), agent:profiles!verification_requests_agent_id_fkey(id,username), documents:request_documents(*)')
    .eq('id', id)
    .maybeSingle();
  return data;
}

export async function checkPhoneInProgress(phone: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_phone_in_progress', { p_phone: phone });
  if (error) {
    console.error('Error checking phone:', error);
    return false;
  }
  return !!data;
}

export async function createRequest(payload: { applicant_id: string; phone_to_certify: string }) {
  return supabase.from('verification_requests').insert(payload).select().maybeSingle();
}

export async function updateRequestStatus(
  requestId: string,
  status: RequestStatus,
  agentId?: string,
  notes?: string
) {
  const updates: Partial<VerificationRequest> & { processing_duration_seconds?: number } = { status, notes: notes ?? null };
  if (agentId) updates.agent_id = agentId;

  // Enregistre l'heure de début de traitement dès que la demande passe en "processing"
  if (status === 'processing') {
    (updates as any).processing_started_at = new Date().toISOString();
  }

  if (['accepted', 'rejected', 'unchanged'].includes(status)) {
    const now = new Date();
    updates.processed_at = now.toISOString();

    // Compute processing duration from processing_started_at
    const { data: current } = await supabase
      .from('verification_requests')
      .select('processing_started_at')
      .eq('id', requestId)
      .maybeSingle();

    if (current?.processing_started_at) {
      const startedAt = new Date(current.processing_started_at);
      const durationSec = Math.round((now.getTime() - startedAt.getTime()) / 1000);
      if (durationSec > 0) updates.processing_duration_seconds = durationSec;
    }
  }

  return supabase.from('verification_requests').update(updates).eq('id', requestId);
}

/**
 * Atomic claim: assigns a pending request to an agent ONLY if the agent has no
 * active processing request. Uses a Postgres function with row-level locking
 * to prevent race conditions.
 * Returns { data, error } — error.message starts with 'AGENT_BUSY' or 'REQUEST_UNAVAILABLE'.
 */
export async function claimRequest(requestId: string, agentId: string) {
  const { data, error } = await supabase
    .rpc('claim_request', { p_request_id: requestId, p_agent_id: agentId })
    .single();
  return { data, error };
}

// ─── DOCUMENTS ───────────────────────────────────────────
export async function upsertDocuments(doc: Partial<RequestDocument> & { request_id: string }) {
  const { error } = await supabase.from('request_documents').upsert(doc, { onConflict: 'request_id' });
  return { error };
}

// ─── MESSAGES ────────────────────────────────────────────
export async function getMessages(requestId: string, limit = 100): Promise<Message[]> {
  const { data } = await supabase
    .from('messages')
    .select('*, sender:profiles!messages_sender_id_fkey(id,username,role)')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true })
    .limit(limit);
  return Array.isArray(data) ? data : [];
}

export async function sendMessage(payload: {
  request_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
}) {
  return supabase.from('messages').insert(payload);
}

export async function markMessagesRead(requestId: string, userId: string) {
  return supabase
    .from('messages')
    .update({ is_read: true })
    .eq('request_id', requestId)
    .eq('receiver_id', userId);
}

// ─── NOTIFICATIONS ───────────────────────────────────────
export async function getNotifications(userId: string, limit = 30): Promise<Notification[]> {
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return Array.isArray(data) ? data : [];
}

export async function markNotificationRead(notificationId: string) {
  return supabase.from('notifications').update({ is_read: true }).eq('id', notificationId);
}

export async function markAllNotificationsRead(userId: string) {
  return supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false);
}

export async function createNotification(payload: {
  user_id: string;
  type: string;
  title: string;
  body: string;
  request_id?: string;
}) {
  return supabase.from('notifications').insert(payload);
}

// ─── VIDEO CALLS ─────────────────────────────────────────
export async function createVideoCall(payload: {
  request_id: string;
  agent_id: string;
  applicant_id: string;
}) {
  const { data } = await supabase
    .from('video_calls')
    .insert({ ...payload, status: 'initiated' })
    .select()
    .maybeSingle();
  return data;
}

export async function updateVideoCall(callId: string, updates: {
  status?: string;
  started_at?: string;
  ended_at?: string;
  duration_seconds?: number;
}) {
  return supabase.from('video_calls').update(updates).eq('id', callId);
}

// ─── INTERNAL MESSAGES (agent ↔ agent/supervisor) ────────

export interface InternalMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string | null;
  image_url: string | null;
  audio_url: string | null;
  is_read: boolean;
  created_at: string;
  sender?: Profile;
  receiver?: Profile;
}

export interface InternalCall {
  id: string;
  initiator_id: string;
  participants: string[];
  status: 'initiated' | 'active' | 'ended';
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

/** Fetch conversation between two users */
export async function getInternalMessages(userId: string, contactId: string, limit = 100): Promise<InternalMessage[]> {
  const { data } = await supabase
    .from('internal_messages')
    .select('*, sender:profiles!internal_messages_sender_id_fkey(id,username,role,avatar_url)')
    .or(`and(sender_id.eq.${userId},receiver_id.eq.${contactId}),and(sender_id.eq.${contactId},receiver_id.eq.${userId})`)
    .order('created_at', { ascending: true })
    .limit(limit);
  return Array.isArray(data) ? (data as InternalMessage[]) : [];
}

/** List latest message per contact (for conversation list) */
export async function getInternalConversations(userId: string): Promise<InternalMessage[]> {
  const { data } = await supabase
    .from('internal_messages')
    .select('*, sender:profiles!internal_messages_sender_id_fkey(id,username,role,avatar_url), receiver:profiles!internal_messages_receiver_id_fkey(id,username,role,avatar_url)')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(200);
  if (!Array.isArray(data)) return [];
  // Deduplicate: keep only the most recent message per contact pair
  const seen = new Set<string>();
  const result: InternalMessage[] = [];
  for (const msg of data as InternalMessage[]) {
    const key = [msg.sender_id, msg.receiver_id].sort().join('-');
    if (!seen.has(key)) { seen.add(key); result.push(msg); }
  }
  return result;
}

export async function sendInternalMessage(payload: {
  sender_id: string;
  receiver_id: string;
  content?: string;
  image_url?: string;
  audio_url?: string;
}) {
  return supabase.from('internal_messages').insert(payload);
}

export async function markInternalMessagesRead(senderId: string, receiverId: string) {
  return supabase
    .from('internal_messages')
    .update({ is_read: true })
    .eq('sender_id', senderId)
    .eq('receiver_id', receiverId)
    .eq('is_read', false);
}

export async function countUnreadInternalMessages(userId: string): Promise<number> {
  const { count } = await supabase
    .from('internal_messages')
    .select('*', { count: 'exact', head: true })
    .eq('receiver_id', userId)
    .eq('is_read', false);
  return count ?? 0;
}

/** Fetch agents and supervisors as potential contacts */
export async function getInternalContacts(): Promise<Profile[]> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .in('role', ['agent', 'supervisor'])
    .eq('is_active', true)
    .order('username');
  return Array.isArray(data) ? (data as Profile[]) : [];
}

// ─── INTERNAL CALLS ──────────────────────────────────────

export async function createInternalCall(initiatorId: string, participantIds: string[]): Promise<InternalCall | null> {
  const { data } = await supabase
    .from('internal_calls')
    .insert({ initiator_id: initiatorId, participants: participantIds, status: 'initiated' })
    .select()
    .maybeSingle();
  return data as InternalCall | null;
}

export async function updateInternalCall(callId: string, updates: { status?: string; started_at?: string; ended_at?: string }) {
  return supabase.from('internal_calls').update(updates).eq('id', callId);
}

// ─── ACTIVITY LOGS ───────────────────────────────────────
export async function getActivityLogs(limit = 100): Promise<ActivityLog[]> {
  const { data } = await supabase
    .from('activity_logs')
    .select('*, user:profiles!activity_logs_user_id_fkey(id,username,role)')
    .order('created_at', { ascending: false })
    .limit(limit);
  return Array.isArray(data) ? data : [];
}

export async function logActivity(userId: string, action: string, details?: Record<string, unknown>) {
  return supabase.from('activity_logs').insert({ user_id: userId, action, details: details ?? null });
}

// ─── STATISTICS ──────────────────────────────────────────
export interface DashboardKpi {
  total: number;
  accepted: number;
  rejected: number;
  unchanged: number;
  other: number;
  pending: number;
  processing: number;
  avg_processing_min: number;
  avg_waiting_min: number;
  hourly_rate: number;
  agents_online: number;
  agents_paused: number;
}

export interface HourlyVolumeRow {
  hour: string;       // "06h"
  received: number;
  accepted: number;
  rejected: number;
  pending: number;
  processing: number;
  unchanged: number;
  other: number;
  avgTime: number; // In seconds
}

/** Full dashboard KPIs + hourly volume for today */
export async function getDashboardKpi(): Promise<{ kpi: DashboardKpi; hourlyVolume: HourlyVolumeRow[] }> {
  // Toujours utiliser le fuseau horaire du Congo pour l'alignement strict avec la base de données
  const formatter = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Africa/Brazzaville', year: 'numeric', month: '2-digit', day: '2-digit' });
  const todayStr = formatter.format(new Date());

  const [{ data: allReqs }, { data: onlineProfiles }, { data: pausedProfiles }] = await Promise.all([
    supabase.from('verification_requests')
      .select('id, status, created_at, processed_at, processing_duration_seconds, agent_id')
      .order('created_at', { ascending: false })
      .limit(5000),
    supabase.from('profiles')
      .select('id')
      .eq('role', 'agent')
      .eq('is_online', true)
      .eq('is_paused', false),
    supabase.from('profiles')
      .select('id')
      .eq('role', 'agent')
      .eq('is_online', true)
      .eq('is_paused', true),
  ]);

  const allRows = Array.isArray(allReqs) ? allReqs : [];
  
  // Strictement les demandes REÇUES aujourd'hui (Cohorte du jour, fuseau Congo)
  const rows = allRows.filter(r => {
    return formatter.format(new Date(r.created_at)) === todayStr;
  });

  const onlineCount = Array.isArray(onlineProfiles) ? onlineProfiles.length : 0;
  const pausedCount = Array.isArray(pausedProfiles) ? pausedProfiles.length : 0;

  const accepted   = rows.filter(r => r.status === 'accepted').length;
  const rejected   = rows.filter(r => r.status === 'rejected').length;
  const unchanged  = rows.filter(r => r.status === 'unchanged').length;
  const other      = rows.filter(r => r.status === 'other').length;
  
  const pending    = rows.filter(r => r.status === 'pending').length;
  const processing = rows.filter(r => r.status === 'processing').length;
  const total      = rows.length;

  const durations = rows
    .map(r => r.processing_duration_seconds)
    .filter((v): v is number => typeof v === 'number' && v > 0);
  const avg_processing_min = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 60)
    : 0;

  // Hourly rate: completed dossiers / hours elapsed today (min 1h)
  const hourFormatter = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Africa/Brazzaville', hour: 'numeric', hour12: false });
  const nowHourStr = hourFormatter.format(new Date());
  const nowHour = Math.max(parseInt(nowHourStr, 10) || 1, 1);
  const hourly_rate = Math.round((accepted + rejected + unchanged + other) / nowHour);

  // Build hourly volume map (06h–22h or 0-23h)
  const hourMap: Record<number, HourlyVolumeRow & { totalSeconds: number; countForAvg: number }> = {};
  for (let h = 0; h <= 23; h++) {
    hourMap[h] = { 
      hour: `${String(h).padStart(2,'0')}h`, 
      received: 0, accepted: 0, rejected: 0, pending: 0, processing: 0, unchanged: 0, other: 0, avgTime: 0, 
      totalSeconds: 0, countForAvg: 0 
    };
  }
  
  for (const r of rows) {
    const hStr = hourFormatter.format(new Date(r.created_at));
    const h = parseInt(hStr, 10);
    if (isNaN(h) || !hourMap[h]) continue;
    hourMap[h].received++;
    if (r.status === 'pending') hourMap[h].pending++;
    else if (r.status === 'processing') hourMap[h].processing++;
    else if (r.status === 'accepted')  hourMap[h].accepted++;
    else if (r.status === 'rejected') hourMap[h].rejected++;
    else if (r.status === 'other') hourMap[h].other++;
    else hourMap[h].unchanged++;

    if (['accepted', 'rejected', 'unchanged', 'other'].includes(r.status) && r.processing_duration_seconds) {
      hourMap[h].totalSeconds += r.processing_duration_seconds;
      hourMap[h].countForAvg++;
    }
  }

  for (const h of Object.values(hourMap)) {
    h.avgTime = h.countForAvg > 0 ? h.totalSeconds / h.countForAvg : 0;
  }

  return {
    kpi: {
      total, accepted, rejected, unchanged, other, pending, processing,
      avg_processing_min, avg_waiting_min: 0,
      hourly_rate, agents_online: onlineCount, agents_paused: pausedCount,
    },
    hourlyVolume: Object.values(hourMap),
  };
}

export async function getGlobalStats(): Promise<GlobalStats> {
  const today = new Date().toISOString().split('T')[0];
  const { data: all } = await supabase.from('verification_requests').select('status, created_at');
  const rows = Array.isArray(all) ? all : [];
  return {
    total_today: rows.filter(r => r.created_at.startsWith(today)).length,
    total_all: rows.filter(r => ['accepted', 'rejected', 'unchanged'].includes(r.status)).length,
    accepted: rows.filter(r => r.status === 'accepted').length,
    rejected: rows.filter(r => r.status === 'rejected').length,
    unchanged: rows.filter(r => r.status === 'unchanged').length,
    pending: rows.filter(r => r.status === 'pending').length,
    processing: rows.filter(r => r.status === 'processing').length,
  };
}

export async function getAgentStats(): Promise<AgentStats[]> {
  const today = new Date().toISOString().split('T')[0];
  const { data: agents } = await supabase.from('profiles').select('*').eq('role', 'agent');
  const { data: requests } = await supabase
    .from('verification_requests')
    .select('agent_id, status, created_at, processing_duration_seconds')
    .in('status', ['accepted', 'rejected', 'unchanged']);

  const agentList = Array.isArray(agents) ? agents : [];
  const reqList = Array.isArray(requests) ? requests : [];

  return agentList.map(agent => {
    const agentReqs = reqList.filter(r => r.agent_id === agent.id);
    const todayReqs = agentReqs.filter(r => r.created_at?.startsWith(today));
    const durations = agentReqs.map(r => r.processing_duration_seconds).filter(Boolean) as number[];
    return {
      agent,
      total_processed: agentReqs.length,
      accepted: agentReqs.filter(r => r.status === 'accepted').length,
      rejected: agentReqs.filter(r => r.status === 'rejected').length,
      unchanged: agentReqs.filter(r => r.status === 'unchanged').length,
      avg_processing_seconds: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
      today_processed: todayReqs.filter(r => ['accepted', 'rejected'].includes(r.status)).length,
    };
  });
}

export interface HourlyProcessingRow {
  hour: string;           // "06:00"
  agents: number;         // distinct agents who processed in that hour
  total: number;
  pct_0_2: number;
  pct_2_5: number;
  pct_5_10: number;
  pct_10_15: number;
  pct_15_30: number;
  pct_over30: number;
}

/**
 * Builds hourly processing-time distribution from verification_requests.
 * Groups processed requests by the hour of `processed_at`, counts distinct
 * agents, total requests, and percentages across 6 duration buckets.
 */
export async function getHourlyProcessingStats(date?: string): Promise<HourlyProcessingRow[]> {
  const targetDate = date ?? new Date().toISOString().split('T')[0];

  const { data } = await supabase
    .from('verification_requests')
    .select('agent_id, processed_at, processing_duration_seconds')
    .in('status', ['accepted', 'rejected', 'unchanged'])
    .gte('processed_at', `${targetDate}T00:00:00`)
    .lte('processed_at', `${targetDate}T23:59:59`);

  const rows = Array.isArray(data) ? data : [];
  const hourFormatter = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Africa/Brazzaville', hour: 'numeric', hour12: false });

  // Group by hour
  const byHour: Record<string, typeof rows> = {};
  for (const r of rows) {
    if (!r.processed_at) continue;
    const hStr = hourFormatter.format(new Date(r.processed_at));
    const h = parseInt(hStr, 10);
    if (isNaN(h)) continue;
    const key = `${String(h).padStart(2, '0')}:00`;
    if (!byHour[key]) byHour[key] = [];
    byHour[key].push(r);
  }

  // Build all 24h slots (06:00–23:00 range matching the reference image)
  const result: HourlyProcessingRow[] = [];
  for (let h = 0; h < 24; h++) {
    const key = `${String(h).padStart(2, '0')}:00`;
    const group = byHour[key] ?? [];
    if (group.length === 0) continue; // skip empty hours

    const total = group.length;
    const agents = new Set(group.map(r => r.agent_id).filter(Boolean)).size;

    const pct = (count: number) => total > 0 ? Math.round((count / total) * 1000) / 10 : 0;

    const b0_2   = group.filter(r => (r.processing_duration_seconds ?? 0) < 120).length;
    const b2_5   = group.filter(r => { const s = r.processing_duration_seconds ?? 0; return s >= 120 && s < 300; }).length;
    const b5_10  = group.filter(r => { const s = r.processing_duration_seconds ?? 0; return s >= 300 && s < 600; }).length;
    const b10_15 = group.filter(r => { const s = r.processing_duration_seconds ?? 0; return s >= 600 && s < 900; }).length;
    const b15_30 = group.filter(r => { const s = r.processing_duration_seconds ?? 0; return s >= 900 && s < 1800; }).length;
    const bOver30 = group.filter(r => (r.processing_duration_seconds ?? 0) >= 1800).length;

    result.push({ hour: key, agents, total, pct_0_2: pct(b0_2), pct_2_5: pct(b2_5), pct_5_10: pct(b5_10), pct_10_15: pct(b10_15), pct_15_30: pct(b15_30), pct_over30: pct(bOver30) });
  }

  return result.sort((a, b) => a.hour.localeCompare(b.hour));
}

// ─── HELPERS ─────────────────────────────────────────────

/** PostgREST returns request_documents as an array; normalise to single object or null */
export function resolveDocuments(req: VerificationRequest): RequestDocument | null {
  if (!req.documents) return null;
  if (Array.isArray(req.documents)) return (req.documents as RequestDocument[])[0] ?? null;
  return req.documents as RequestDocument;
}

// ─── STORAGE ─────────────────────────────────────────────
export async function uploadFile(bucket: string, path: string, file: File): Promise<string | null> {
  const { data, error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true, contentType: file.type });
  if (error || !data) return null;
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);
  return urlData.publicUrl;
}

// ─── APK ─────────────────────────────────────────────────
/** Cache mémoire pour app_settings (TTL 5 min) — évite les lectures répétées à grande échelle */
const _settingsCache: Record<string, { value: string; expiresAt: number }> = {};
const SETTINGS_TTL = 5 * 60 * 1000;

async function getAppSetting(key: string): Promise<string | null> {
  const cached = _settingsCache[key];
  if (cached && Date.now() < cached.expiresAt) return cached.value;
  const { data, error } = await supabase
    .from('app_settings').select('value').eq('key', key).single();
  if (error || !data) return null;
  const val = typeof data.value === 'string' ? data.value : String(data.value ?? '');
  _settingsCache[key] = { value: val, expiresAt: Date.now() + SETTINGS_TTL };
  return val;
}

const DEFAULT_REJECTION_REASONS = [
  'Document illisible',
  'Document expiré',
  'Photo non conforme',
  'Identité non vérifiable',
  'Informations incohérentes',
];

/** Récupère la liste des motifs de rejet configurés */
export async function getRejectionReasons(): Promise<string[]> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'rejection_reasons')
    .maybeSingle();
  if (data?.value && Array.isArray(data.value)) return data.value as string[];
  return DEFAULT_REJECTION_REASONS;
}

/** Sauvegarde la liste des motifs de rejet */
export async function saveRejectionReasons(reasons: string[], updatedBy?: string): Promise<boolean> {
  const { error } = await supabase
    .from('app_settings')
    .update({ value: reasons, updated_at: new Date().toISOString(), ...(updatedBy ? { updated_by: updatedBy } : {}) })
    .eq('key', 'rejection_reasons');
  return !error;
}

const DEFAULT_OTHER_REASONS = [
  'Numéro non reconnu',
  'Demande en doublon',
  'Dossier incomplet',
  'Demande annulée par le client',
  'Autre raison',
];

/** Récupère la liste des motifs "Autre" configurés */
export async function getOtherReasons(): Promise<string[]> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'other_reasons')
    .maybeSingle();
  if (data?.value && Array.isArray(data.value)) return data.value as string[];
  return DEFAULT_OTHER_REASONS;
}

/** Sauvegarde la liste des motifs "Autre" */
export async function saveOtherReasons(reasons: string[], updatedBy?: string): Promise<boolean> {
  const { error } = await supabase
    .from('app_settings')
    .update({ value: reasons, updated_at: new Date().toISOString(), ...(updatedBy ? { updated_by: updatedBy } : {}) })
    .eq('key', 'other_reasons');
  return !error;
}

/** Récupère les demandes "Autre" du jour avec leur motif (notes) */
export async function getTodayOtherRequests(): Promise<{ id: string; phone_to_certify: string; notes: string | null; processed_at: string | null }[]> {
  const today = new Date().toLocaleDateString('fr-CA');
  const { data } = await supabase
    .from('verification_requests')
    .select('id, phone_to_certify, notes, processed_at')
    .eq('status', 'other')
    .gte('created_at', today + 'T00:00:00')
    .lte('created_at', today + 'T23:59:59')
    .order('processed_at', { ascending: false });
  return Array.isArray(data) ? data : [];
}

/** Récupère l'URL publique de l'APK hébergé (null si aucun fichier configuré) */
export async function getApkUrl(): Promise<string | null> {
  const val = await getAppSetting('apk_url');
  if (!val || val === '""' || val === '') return null;
  return val.replace(/^"|"$/g, '');
}

/** Upload un fichier APK dans le bucket et enregistre son URL en base */
export async function uploadApk(file: File): Promise<string | null> {
  const path = `konolive-app.apk`;
  const { data, error } = await supabase.storage
    .from('apk-files')
    .upload(path, file, { upsert: true, contentType: 'application/vnd.android.package-archive' });
  if (error || !data) return null;
  const { data: urlData } = supabase.storage.from('apk-files').getPublicUrl(data.path);
  const publicUrl = urlData.publicUrl;
  await supabase
    .from('app_settings')
    .upsert({ key: 'apk_url', value: JSON.stringify(publicUrl), updated_at: new Date().toISOString() });
  return publicUrl;
}

/** Supprime le fichier APK du bucket et efface l'URL en base */
export async function deleteApk(): Promise<boolean> {
  const { error: storageError } = await supabase.storage
    .from('apk-files')
    .remove(['konolive-app.apk']);
  if (storageError) return false;
  await supabase
    .from('app_settings')
    .upsert({ key: 'apk_url', value: '', updated_at: new Date().toISOString() });
  return true;
}

export async function deleteInternalMessage(messageId: string) {
  return supabase
    .from('internal_messages')
    .delete()
    .eq('id', messageId);
}

export interface DailyPerformance {
  day_name: string;
  day_index: number;
  value: number;
}

export async function getDailyPerformances(agentId?: string): Promise<DailyPerformance[]> {
  const { data, error } = await supabase.rpc('get_daily_performances', agentId ? { p_agent_id: agentId } : {});
  if (error || !Array.isArray(data)) return [];
  return data as DailyPerformance[];
}
