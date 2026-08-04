import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MainLayout from '@/components/layouts/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useVideoCall } from '@/contexts/VideoCallContext'; // floating call context
import {
  getRequestById, updateRequestStatus, createVideoCall,
  createNotification, sendMessage, getMessages,
  markMessagesRead, resolveDocuments, getRejectionReasons, getOtherReasons,
  getAgentRequests, claimRequest
} from '@/lib/api';
import { startTimer, getElapsedSeconds, clearTimer } from '@/lib/timerStore';
import { StatusBadge } from '@/components/common/StatusBadge';
import { supabase } from '@/lib/supabase';
import type { VerificationRequest } from '@/types/types';
import {
  Video, CheckCircle2, XCircle, Minus, MoreHorizontal,
  ArrowLeft, Phone, ZoomIn, X, AlertTriangle, Timer, FileImage, PhoneCall, Copy, Check
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const WARN_SECONDS  = 300;  // 5 minutes
const ALERT_SECONDS = 600;  // 10 minutes (second alert)

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function ProcessRequestPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { startCall } = useVideoCall();
  const [request, setRequest] = useState<VerificationRequest | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // Rejection reason modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectionPresets, setRejectionPresets] = useState<string[]>([]);

  // Autre modal
  const [showOtherModal, setShowOtherModal] = useState(false);
  const [otherReason, setOtherReason] = useState('');
  const [otherPresets, setOtherPresets] = useState<string[]>([]);

  // Modal de blocage navigation
  const [showBlockModal, setShowBlockModal] = useState(false);

  // ── Multi-requests Logic (Sidebar) ──
  const [agentReqs, setAgentReqs] = useState<VerificationRequest[]>([]);
  const [claiming, setClaiming] = useState(false);

  const loadAgentReqs = useCallback(async () => {
    if (!profile) return;
    const data = await getAgentRequests(profile.id, 50);
    setAgentReqs(data);
  }, [profile]);

  useEffect(() => { loadAgentReqs(); }, [loadAgentReqs]);

  useEffect(() => {
    if (!profile) return;
    const ch = supabase.channel('process-agent-reqs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'verification_requests' }, () => loadAgentReqs())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile, loadAgentReqs]);

  const pendingList = agentReqs.filter(r => r.status === 'pending');
  const myProcessing = agentReqs.filter(r => r.status === 'processing' && r.agent_id === profile?.id);
  const canTakeAnother = myProcessing.length < 2;

  async function handleTakeAnother(reqId: string) {
    if (claiming || !profile) return;
    setClaiming(true);
    const { error } = await claimRequest(reqId, profile.id);
    setClaiming(false);
    if (!error) {
      toast.success("Nouvelle demande prise en charge.");
    } else {
      toast.error("Cette demande n'est plus disponible.");
      loadAgentReqs();
    }
  }
  // ────────────────────────────────────

  // Bloque la navigation (retour navigateur) tant que la demande n'est pas clôturée
  const isActive = !!request && request.status === 'processing' && request.agent_id === profile?.id && !submitting;
  const isActiveRef = useRef(isActive);
  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);

  // Pousse un état fantôme pour intercepter le bouton "back" du navigateur
  useEffect(() => {
    if (!isActive) return;
    // Pousse un état supplémentaire pour que "back" revienne ici d'abord
    window.history.pushState({ blockedNav: true }, '');

    function handlePopState() {
      if (isActiveRef.current) {
        // Repousse l'état fantôme et affiche la modale
        window.history.pushState({ blockedNav: true }, '');
        setShowBlockModal(true);
      }
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isActive]);

  // Processing timer — persists across navigation via timerStore
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const alerted5Ref  = useRef(false);
  const alerted10Ref = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Start timer on mount (no-op if already running for this request)
  useEffect(() => {
    if (!id) return;
    startTimer(id);
    setElapsedSeconds(getElapsedSeconds(id));
    if (getElapsedSeconds(id) >= WARN_SECONDS)  alerted5Ref.current  = true;
    if (getElapsedSeconds(id) >= ALERT_SECONDS) alerted10Ref.current = true;
    intervalRef.current = setInterval(() => {
      setElapsedSeconds(getElapsedSeconds(id));
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [id]);

  // Charge les motifs de rejet et motifs "Autre" configurés par le superviseur
  useEffect(() => {
    getRejectionReasons().then(setRejectionPresets);
    getOtherReasons().then(setOtherPresets);
  }, []);

  // Trigger alerts at thresholds
  useEffect(() => {
    if (elapsedSeconds >= WARN_SECONDS && !alerted5Ref.current) {
      alerted5Ref.current = true;
      toast.warning('⏱ Temps de traitement dépassé', {
        description: 'Cette demande est en traitement depuis plus de 5 minutes. Veuillez la clôturer rapidement.',
        duration: 8000,
      });
    }
    if (elapsedSeconds >= ALERT_SECONDS && !alerted10Ref.current) {
      alerted10Ref.current = true;
      toast.error('⏱ Traitement trop long !', {
        description: 'Cette demande est en traitement depuis plus de 10 minutes.',
        duration: 10000,
      });
    }
  }, [elapsedSeconds]);

  // Vert en dessous de 5 min, rouge au-dessus
  const timerOverdue = elapsedSeconds >= WARN_SECONDS;
  const timerColor   = timerOverdue ? 'text-red-500'   : 'text-green-500';
  const timerBg      = timerOverdue ? 'bg-red-500/10'  : 'bg-green-500/10';
  const timerPulse   = timerOverdue;

  const load = useCallback(async () => {
    if (!id || !profile) return;
    const req = await getRequestById(id);
    
    // Block unauthorized access to pending or assigned-to-other requests
    if (req) {
      if (req.status === 'pending') {
        toast.error('Vous devez utiliser le bouton "Traiter la prochaine demande" ou attendre une assignation automatique.');
        navigate('/agent', { replace: true });
        return;
      }
      if (req.agent_id && req.agent_id !== profile.id) {
        toast.error('Cette demande est déjà traitée par un autre agent.');
        navigate('/agent', { replace: true });
        return;
      }
    }
    setRequest(req);
  }, [id, profile, navigate]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!id) return;
    const ch = supabase.channel(`process-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'verification_requests', filter: `id=eq.${id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, load]);

  async function handleCall() {
    if (!request || !profile) return;
    const call = await createVideoCall({ request_id: request.id, agent_id: profile.id, applicant_id: request.applicant_id });
    if (!call) { toast.error("Impossible de démarrer l'appel"); return; }
    
    // Récupérer les informations d'appel générique
    const { data: genericSettings } = await supabase.from('app_settings').select('value').eq('key', 'generic_call_settings').single();
    const callerName = genericSettings?.value?.name || 'Agent Konolive';
    const callerPhoto = genericSettings?.value?.photo_url || null;

    const payload = { call_id: call.id, applicant_id: request.applicant_id, agent_name: callerName, agent_photo: callerPhoto, request_id: request.id };
    const broadcastChannels = [
      supabase.channel(`req-detail-${request.id}`),
      supabase.channel(`user-call-${request.applicant_id}`),
    ];
    broadcastChannels.forEach(channel => {
      channel.subscribe(status => {
        if (status === 'SUBSCRIBED') {
          channel.send({ type: 'broadcast', event: 'call_offer', payload });
          setTimeout(() => supabase.removeChannel(channel), 2000);
        }
      });
    });
    await createNotification({
      user_id: request.applicant_id,
      type: 'call_started',
      title: 'Appel vidéo entrant',
      body: `${callerName} vous appelle pour votre demande de vérification.`,
      request_id: request.id,
    });
    // Ouvre la fenêtre flottante globale — persistante pendant toute la navigation
    startCall({
      callId: call.id,
      remoteUserName: request.applicant?.username ?? 'Coach mobile',
      isInitiator: true,
      requestId: request.id,
    });
  }
  const [recallSent, setRecallSent] = useState(false);

  // ── Présence en temps réel du Coach mobile ────────────────────────────────
  const [coachOnline, setCoachOnline] = useState(false);

  useEffect(() => {
    if (!request?.applicant_id) return;

    // Fetch initial state as fallback
    supabase.from('profiles').select('is_online').eq('id', request.applicant_id).single()
      .then(({ data }) => setCoachOnline(data?.is_online ?? false));

    const presenceCh = supabase.channel(`user-presence-${request.applicant_id}`, {
      config: { presence: { key: request.applicant_id } },
    });
    
    presenceCh
      .on('presence', { event: 'sync' }, () => {
        const state = presenceCh.presenceState();
        if (Object.keys(state).length > 0) setCoachOnline(true);
      })
      .on('presence', { event: 'join' }, () => setCoachOnline(true))
      .on('presence', { event: 'leave' }, () => {
        const state = presenceCh.presenceState();
        setCoachOnline(Object.keys(state).length > 0);
      })
      .subscribe();

    const pgCh = supabase.channel(`profile-presence-${request.applicant_id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${request.applicant_id}` }, (payload) => {
        if (payload.new.is_online !== undefined) {
          // Fallback sur Postgres si la websocket presence rate
          setCoachOnline(prev => prev || payload.new.is_online);
        }
      })
      .subscribe();
      
    return () => { 
      supabase.removeChannel(presenceCh); 
      supabase.removeChannel(pgCh);
    };
  }, [request?.applicant_id]);

  async function handleRecallRequest() {
    if (!request || !profile || !request.agent_id) return;
    setRecallSent(true);
    await createNotification({
      user_id: request.agent_id,
      type: 'recall_request',
      title: 'Rappel demandé',
      body: `L'agent ${profile.username} vous demande de rappeler le numéro +${request.phone_to_certify}.`,
      request_id: request.id,
    });
    const ch = supabase.channel(`recall-${request.agent_id}`);
    ch.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        ch.send({ type: 'broadcast', event: 'recall_request', payload: { request_id: request.id, phone: request.phone_to_certify, from: profile.username } });
        setTimeout(() => supabase.removeChannel(ch), 2000);
      }
    });
    toast.success("Demande de rappel envoyée à l'agent.");
  }

  const [showNextPrompt, setShowNextPrompt] = useState(false);

  async function handleNextRequest() {
    if (!profile) return;
    const { data: pending } = await supabase
      .from('verification_requests')
      .select('id')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!pending) {
      toast.info("Aucune demande en attente.");
      navigate('/agent');
      return;
    }

    const { error } = await claimRequest(pending.id, profile.id);
    if (error) {
      toast.error("Impossible d'attribuer la demande suivante.");
      navigate('/agent');
      return;
    }
    
    setShowNextPrompt(false);
    navigate(`/agent/process/${pending.id}`);
  }

  async function handleDecision(decision: 'accepted' | 'rejected' | 'unchanged' | 'other', reason?: string) {
    if (!request || !profile) return;
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    clearTimer(request.id);
    setSubmitting(decision);
    await updateRequestStatus(request.id, decision, profile.id, reason || undefined);
    const decisionLabels: Record<string, string> = {
      accepted: 'acceptée', rejected: 'rejetée', unchanged: 'inchangée', other: 'classée Autre',
    };
    const body = (decision === 'rejected' || decision === 'other') && reason
      ? `Votre demande pour +${request.phone_to_certify} a été ${decisionLabels[decision]}. Motif : ${reason}`
      : `Votre demande de vérification pour +${request.phone_to_certify} a été ${decisionLabels[decision] ?? decision}.`;
    await createNotification({
      user_id: request.applicant_id,
      type: 'status_changed',
      title: `Demande ${decisionLabels[decision] ?? decision}`,
      body,
      request_id: request.id,
    });
    toast.success(`Demande marquée comme ${decisionLabels[decision] ?? decision}`);
    setSubmitting(null);
    
    if (profile.manual_next_request) {
      const { count } = await supabase
        .from('verification_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
        
      if ((count || 0) > 0) {
        setShowNextPrompt(true);
      } else {
        navigate('/agent');
      }
    } else {
      setTimeout(() => {
        navigate('/agent');
      }, 500);
    }
  }

  function openRejectModal() { setRejectReason(''); setShowRejectModal(true); }
  async function confirmReject() {
    if (!rejectReason.trim()) { toast.error('Veuillez renseigner le motif du rejet.'); return; }
    setShowRejectModal(false);
    await handleDecision('rejected', rejectReason.trim());
  }

  function openOtherModal() { setOtherReason(''); setShowOtherModal(true); }
  async function confirmOther() {
    if (!otherReason.trim()) { toast.error('Veuillez renseigner le motif.'); return; }
    setShowOtherModal(false);
    await handleDecision('other', otherReason.trim());
  }

  if (!request) return (
    <MainLayout>
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    </MainLayout>
  );

  const docs = resolveDocuments(request);

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-6">
        
        {/* Main Content */}
        <div className="flex-1 space-y-6 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-3">
            {/* Bouton retour — désactivé si demande en cours */}
          <button
            onClick={() => { if (isActive) { setShowBlockModal(true); } else { navigate('/agent'); } }}
            title={isActive ? 'Clôturez la demande avant de quitter' : 'Retour'}
            className={`neu-flat w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
              isActive ? 'opacity-40 cursor-not-allowed text-muted-foreground' : 'hover:text-primary'
            }`}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground text-balance">Traiter la demande</h1>
            <p className="text-xs text-muted-foreground font-mono">{request.id.slice(0, 8)}…</p>
          </div>

          {/* Processing timer */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-mono font-semibold ml-auto shrink-0 neu-flat ${timerBg} ${timerColor} ${timerPulse ? 'animate-pulse' : ''}`}>
            <Timer size={15} className="shrink-0" />
            <span>{formatElapsed(elapsedSeconds)}</span>
          </div>

          <StatusBadge status={request.status} className="shrink-0" />
        </div>

        <div className="max-w-xl mx-auto space-y-6">
          {/* Left: info + documents + actions */}
          <div className="space-y-6">
            {/* Applicant info */}
            <div className="neu-card">
              <div className="flex items-center gap-3 mb-3">
                <Phone size={18} className="text-primary" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Numéro à certifier</p>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-xl text-foreground">+{request.phone_to_certify}</p>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`+${request.phone_to_certify}`);
                        toast.success('Numéro copié !');
                      }}
                      className="neu-flat p-1.5 rounded-lg hover:text-primary transition-colors ml-2"
                      title="Copier le numéro"
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border text-sm">
                <div><p className="text-xs text-muted-foreground">Coach mobile</p><p className="font-medium">{request.applicant?.username}</p></div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Localité</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{request.applicant?.locality ?? '—'}</p>
                    {/* Voyant présence Coach mobile */}
                    <span className="relative flex items-center gap-1.5 shrink-0">
                      <span className="relative flex items-center shrink-0">
                        {coachOnline && (
                          <span className="absolute inline-flex h-3 w-3 rounded-full bg-green-400 opacity-75 animate-ping" />
                        )}
                        <span className={[
                          'relative inline-flex h-3 w-3 rounded-full',
                          coachOnline ? 'bg-green-500' : 'bg-gray-400',
                        ].join(' ')} />
                      </span>
                      <span className={[
                        'text-xs font-semibold',
                        coachOnline ? 'text-green-600' : 'text-muted-foreground',
                      ].join(' ')}>
                        {coachOnline ? 'En ligne' : 'Hors ligne'}
                      </span>
                    </span>
                  </div>
                </div>
                <div><p className="text-xs text-muted-foreground">Téléphone</p><p className="font-medium">{request.applicant?.phone ?? '—'}</p></div>
                <div><p className="text-xs text-muted-foreground">Soumise le</p><p className="font-medium">{format(new Date(request.created_at), 'dd MMM, HH:mm')}</p></div>
              </div>
            </div>

            {/* Documents & Actions — section unifiée */}
            <div className="neu-card space-y-4">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <FileImage size={17} className="text-primary" />
                Documents &amp; Actions
              </h2>

              {/* Thumbnails */}
              {docs ? (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Recto pièce d'id.", url: docs.doc_front_url },
                    { label: "Verso pièce d'id.", url: docs.doc_back_url },
                    { label: 'Photo en direct',   url: docs.live_photo_url },
                  ].map(d => (
                    <div key={d.label} className="space-y-1">
                      <div className="aspect-[4/3] w-full overflow-hidden neu-pressed rounded-xl relative group cursor-pointer" onClick={() => d.url && setLightbox(d.url)}>
                        {d.url
                          ? <><img src={d.url} alt={d.label} className="w-full h-full object-cover" /><div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center"><ZoomIn size={20} className="text-white opacity-0 group-hover:opacity-100 transition-all" /></div></>
                          : <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">N/D</div>}
                      </div>
                      <p className="text-xs text-center text-muted-foreground font-medium">{d.label}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-2">Aucun document soumis.</p>
              )}

              {/* Divider */}
              <div className="border-t border-border" />

              {/* Action buttons */}
              <div className="flex flex-col gap-3">
                <button onClick={handleCall} className="neu-btn-primary py-3 flex items-center justify-center gap-2">
                  <Video size={18} /><span>Démarrer l'appel vidéo</span>
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => handleDecision('accepted')} disabled={!!submitting}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-white text-sm font-medium transition-all disabled:opacity-50 bg-green-500 hover:bg-green-600">
                    {submitting === 'accepted'
                      ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <><CheckCircle2 size={16} /><span>Accepter</span></>}
                  </button>
                  <button onClick={openRejectModal} disabled={!!submitting}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-white text-sm font-medium transition-all disabled:opacity-50 bg-destructive hover:opacity-90">
                    {submitting === 'rejected'
                      ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <><XCircle size={16} /><span>Rejeter</span></>}
                  </button>
                  <button onClick={() => handleDecision('unchanged')} disabled={!!submitting}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-white text-sm font-medium transition-all disabled:opacity-50 bg-gray-500 hover:bg-gray-600">
                    {submitting === 'unchanged'
                      ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <><Minus size={16} /><span>Inchangé</span></>}
                  </button>
                  <button onClick={openOtherModal} disabled={!!submitting}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-white text-sm font-medium transition-all disabled:opacity-50 bg-amber-500 hover:bg-amber-600">
                    {submitting === 'other'
                      ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <><MoreHorizontal size={16} /><span>Autre</span></>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-full lg:w-[320px] shrink-0 space-y-6">
        {/* Mes demandes en cours */}
        <div className="neu-card space-y-4 border-2 border-primary/20">
          <h3 className="font-bold text-foreground">En cours ({myProcessing.length}/2)</h3>
          <div className="space-y-3">
            {myProcessing.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">Aucune demande</p>
            ) : (
              myProcessing.map(r => (
                <div key={r.id} className={`p-3 rounded-xl border ${r.id === id ? 'border-primary bg-primary/10 shadow-sm' : 'border-border bg-card'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[10px] text-muted-foreground uppercase">{r.id.slice(0, 8)}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-600 ml-auto">En cours</span>
                  </div>
                  <p className="text-sm font-semibold mb-2">+{r.applicant?.phone || r.phone_to_certify}</p>
                  {r.id !== id && (
                    <button 
                      onClick={() => navigate(`/agent/process/${r.id}`)}
                      className="w-full py-1.5 neu-flat text-xs font-medium rounded-lg hover:text-primary transition-colors">
                      Afficher
                    </button>
                  )}
                  {r.id === id && (
                    <div className="w-full py-1.5 bg-primary/10 text-primary text-xs font-semibold rounded-lg text-center">
                      Actuelle
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Demandes en attente */}
        <div className="neu-card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-foreground">En attente</h3>
            <span className="neu-flat px-2 py-0.5 rounded-md text-xs font-mono">{pendingList.length}</span>
          </div>
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {pendingList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Aucune demande en attente</p>
            ) : (
              pendingList.map(r => (
                <div key={r.id} className="p-3 rounded-xl border border-border bg-card">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[10px] text-muted-foreground uppercase">{r.id.slice(0, 8)}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-500/10 text-orange-600 ml-auto">En attente</span>
                  </div>
                  <p className="text-sm font-medium mb-3 text-muted-foreground">+{r.phone_to_certify}</p>
                  <button
                    onClick={() => handleTakeAnother(r.id)}
                    disabled={!canTakeAnother || claiming}
                    className="w-full py-2 text-xs font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed neu-btn-primary"
                  >
                    Prendre cette demande
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>

      {/* ── Rejection reason modal ── */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowRejectModal(false)}>
          <div className="w-full max-w-[calc(100%-2rem)] md:max-w-md neu-card space-y-5" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                  <AlertTriangle size={20} className="text-destructive" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground text-balance">Motif du rejet</h3>
                  <p className="text-xs text-muted-foreground">Demande +{request.phone_to_certify}</p>
                </div>
              </div>
              <button onClick={() => setShowRejectModal(false)} className="neu-flat w-8 h-8 rounded-lg flex items-center justify-center hover:text-destructive transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Reason presets */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sélectionner un motif ou saisir librement</p>
              <div className="flex flex-wrap gap-2">
                {rejectionPresets.map(preset => (
                  <button key={preset} type="button"
                    onClick={() => setRejectReason(preset)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      rejectReason === preset
                        ? 'bg-destructive text-white border-destructive'
                        : 'neu-flat text-foreground hover:border-destructive/50'
                    }`}>
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Free text */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Motif personnalisé</label>
              <textarea
                className="neu-input resize-none"
                rows={3}
                placeholder="Précisez le motif du rejet…"
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowRejectModal(false)} className="neu-btn px-4 py-2 text-sm">
                Annuler
              </button>
              <button onClick={confirmReject} disabled={!rejectReason.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold bg-destructive hover:opacity-90 transition-all disabled:opacity-40">
                <XCircle size={16} />Confirmer le rejet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Autre modal ── */}
      {showOtherModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowOtherModal(false)}>
          <div className="w-full max-w-[calc(100%-2rem)] md:max-w-md neu-card space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <MoreHorizontal size={20} className="text-amber-500" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">Motif — Autre</h3>
                  <p className="text-xs text-muted-foreground">Demande +{request.phone_to_certify}</p>
                </div>
              </div>
              <button onClick={() => setShowOtherModal(false)} className="neu-flat w-8 h-8 rounded-lg flex items-center justify-center hover:text-amber-500 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sélectionner un motif ou saisir librement</p>
              <div className="flex flex-wrap gap-2">
                {otherPresets.map(preset => (
                  <button key={preset} type="button"
                    onClick={() => setOtherReason(preset)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      otherReason === preset
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'neu-flat text-foreground hover:border-amber-400/60'
                    }`}>
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Motif personnalisé</label>
              <textarea
                className="neu-input resize-none"
                rows={3}
                placeholder="Précisez le motif…"
                value={otherReason}
                onChange={e => setOtherReason(e.target.value)}
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowOtherModal(false)} className="neu-btn px-4 py-2 text-sm">Annuler</button>
              <button onClick={confirmOther} disabled={!otherReason.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold bg-amber-500 hover:bg-amber-600 transition-all disabled:opacity-40">
                <MoreHorizontal size={16} />Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Next Prompt ── */}
      {showNextPrompt && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-[calc(100%-2rem)] md:max-w-md neu-card space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <CheckCircle2 size={24} className="text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-foreground text-balance">
                  Demande clôturée avec succès
                </h3>
                <p className="text-sm text-muted-foreground mt-1 text-pretty">
                  L'option de passage manuel est activée. Que souhaitez-vous faire ?
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button 
                onClick={() => navigate('/agent')} 
                className="flex-1 px-4 py-2.5 neu-flat text-sm font-semibold rounded-xl hover:text-primary transition-colors">
                Tableau de bord
              </button>
              <button 
                onClick={handleNextRequest} 
                className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors shadow-sm text-center">
                Passer à une autre demande
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal blocage navigation ── */}
      {showBlockModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-[calc(100%-2rem)] md:max-w-md neu-card space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
                <AlertTriangle size={24} className="text-orange-500" />
              </div>
              <div>
                <h3 className="font-bold text-foreground text-balance">
                  Demande en cours de traitement
                </h3>
                <p className="text-sm text-muted-foreground mt-1 text-pretty">
                  Vous devez <strong>clôturer cette demande</strong> (Accepter, Rejeter ou Inchangé)
                  avant de pouvoir quitter cette page.
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowBlockModal(false)}
                className="neu-btn px-5 py-2.5 text-sm font-semibold">
                Rester sur la page
              </button>
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Document" className="max-w-full max-h-full rounded-xl" />
        </div>
      )}
    </MainLayout>
  );
}
