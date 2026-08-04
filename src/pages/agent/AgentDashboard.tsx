import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import MainLayout from '@/components/layouts/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { getAgentRequests, getNotifications, markNotificationRead, createVideoCall, createNotification, getRequestById, claimRequest } from '@/lib/api';
import { StatusBadge } from '@/components/common/StatusBadge';
import { supabase } from '@/lib/supabase';
import type { VerificationRequest, Notification } from '@/types/types';
import {
  ClipboardList, CheckCircle2, History, Clock,
  PauseCircle, PlayCircle, Coffee, PhoneCall, Phone, Bell, X,
  CheckCircle, XCircle, Timer, Lock, Loader2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import VideoCallModal from '@/components/video/VideoCallModal';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';

// Format seconds → "Xmin Ys"
function fmtSec(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}min ${sec}s` : `${sec}s`;
}

export default function AgentDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests]   = useState<VerificationRequest[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showTotalModal, setShowTotalModal] = useState(false);

  // ── Horloge en temps réel ──────────────────────────────
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Rappels ──────────────────────────────────────────
  const [recalls, setRecalls] = useState<Notification[]>([]);
  const [activeCall, setActiveCall] = useState<{ callId: string; requestId: string; remoteName: string } | null>(null);

  // ── Pause state ──────────────────────────────────────
  const [isPaused, setIsPaused]             = useState(false);
  const isPausedRef                         = useRef(false); // miroir ref pour load()
  const [pauseCount, setPauseCount]         = useState(0);
  const [totalPauseSec, setTotalPauseSec]   = useState(0);
  const [currentPauseSec, setCurrentPauseSec] = useState(0);
  const pauseSessionId                      = useRef<string | null>(null);
  const pauseTimerRef                       = useRef<ReturnType<typeof setInterval> | null>(null);

  const todayStr = new Date().toLocaleDateString('fr-CA', { timeZone: 'Africa/Brazzaville' });

  // Synchronise le ref dès que l'état change (toujours frais dans load)
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

  // Charge les demandes — exclut la file d'attente si l'agent est en pause
  const load = useCallback(async () => {
    if (!profile) return;
    const data = await getAgentRequests(profile.id, 200);
    // Quand l'agent est en pause : on ne lui montre que SES demandes (pas la file publique)
    setRequests(isPausedRef.current ? data.filter(r => r.agent_id === profile.id) : data);
    setLoading(false);
  }, [profile]);
  const loadRecalls = useCallback(async () => {
    if (!profile) return;
    const notifs = await getNotifications(profile.id, 50);
    setRecalls(notifs.filter(n => n.type === 'recall_request' && !n.is_read));
  }, [profile]);

  // ── Load today's pause stats from DB ────────────────
  const loadPauseStats = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('pause_sessions')
      .select('duration_seconds, ended_at')
      .eq('agent_id', profile.id)
      .gte('started_at', todayStr + 'T00:00:00')
      .lte('started_at', todayStr + 'T23:59:59');
    if (!Array.isArray(data)) return;
    setPauseCount(data.length);
    const completedSec = data
      .filter(p => p.ended_at !== null)
      .reduce((acc, p) => acc + (p.duration_seconds ?? 0), 0);
    setTotalPauseSec(completedSec);
  }, [profile, todayStr]);

  useEffect(() => { load(); loadPauseStats(); loadRecalls(); }, [load, loadPauseStats, loadRecalls]);

  // ── Restaure l'état de pause depuis la DB au montage ─────────────────────
  // Garantit que le rafraîchissement de la page préserve l'état en pause
  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('is_paused')
        .eq('id', profile.id)
        .maybeSingle();
      if (data?.is_paused) {
        setIsPaused(true);
        // Cherche une session de pause ouverte (sans ended_at) pour la reprendre
        const { data: openSession } = await supabase
          .from('pause_sessions')
          .select('id')
          .eq('agent_id', profile.id)
          .is('ended_at', null)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (openSession) pauseSessionId.current = openSession.id;
        // Recharge en mode paused pour vider la file d'attente
        isPausedRef.current = true;
        load();
      }
    })();
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime ─────────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    const chReq = supabase.channel('agent-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'verification_requests' }, () => load())
      .subscribe();
    // Écoute les nouvelles notifications de rappel
    const chNotifs = supabase.channel(`agent-notifs-${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` }, () => loadRecalls())
      .subscribe();
    return () => {
      supabase.removeChannel(chReq);
      supabase.removeChannel(chNotifs);
    };
  }, [profile, load, loadRecalls]);

  // ── Pause live timer ─────────────────────────────────
  useEffect(() => {
    if (isPaused) {
      setCurrentPauseSec(0);
      pauseTimerRef.current = setInterval(() => setCurrentPauseSec(s => s + 1), 1000);
    } else {
      if (pauseTimerRef.current) clearInterval(pauseTimerRef.current);
      setCurrentPauseSec(0);
    }
    return () => { if (pauseTimerRef.current) clearInterval(pauseTimerRef.current); };
  }, [isPaused]);

  // ── Toggle pause ─────────────────────────────────────
  async function togglePause() {
    if (!profile) return;
    if (!isPaused) {
      // Start pause — vide immédiatement la file d'attente
      const { data, error } = await supabase
        .from('pause_sessions')
        .insert({ agent_id: profile.id })
        .select('id')
        .single();
      if (error) { toast.error('Erreur lors de la mise en pause.'); return; }
      pauseSessionId.current = data.id;
      await supabase.from('profiles').update({ is_paused: true }).eq('id', profile.id);
      setIsPaused(true);
      isPausedRef.current = true;
      setPauseCount(c => c + 1);
      // Recharge en mode paused : filtre les demandes en attente
      load();
      toast.info('⏸ Pause activée — vous ne recevrez plus de nouvelles demandes.');
    } else {
      // End pause — réaffiche la file d'attente
      if (pauseSessionId.current) {
        await supabase
          .from('pause_sessions')
          .update({ ended_at: new Date().toISOString() })
          .eq('id', pauseSessionId.current);
        pauseSessionId.current = null;
      }
      await supabase.from('profiles').update({ is_paused: false }).eq('id', profile.id);
      setIsPaused(false);
      isPausedRef.current = false;
      setTotalPauseSec(s => s + currentPauseSec);
      // Recharge en mode actif : montre de nouveau la file d'attente
      load();
      toast.success('▶ Pause terminée — vous êtes de nouveau disponible.');
    }
  }

  // ── Dismiss recall ───────────────────────────────────
  async function dismissRecall(id: string) {
    await markNotificationRead(id);
    setRecalls(prev => prev.filter(r => r.id !== id));
  }

  const [claiming, setClaiming] = useState(false);

  // ── Appeler depuis un rappel ─────────────────────────
  async function handleCallRecall(notif: Notification) {
    if (!profile || !notif.request_id) return;
    const req = await getRequestById(notif.request_id);
    if (!req) { toast.error('Demande introuvable.'); return; }
    const call = await createVideoCall({ request_id: req.id, agent_id: profile.id, applicant_id: req.applicant_id });
    if (!call) { toast.error("Impossible de démarrer l'appel."); return; }
    // Broadcast + notification vers le coach mobile
    const broadcastPayload = { call_id: call.id, applicant_id: req.applicant_id, agent_name: profile.username, request_id: req.id };
    const ch = supabase.channel(`user-call-${req.applicant_id}`);
    ch.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        ch.send({ type: 'broadcast', event: 'call_offer', payload: broadcastPayload });
        setTimeout(() => supabase.removeChannel(ch), 2000);
      }
    });
    await createNotification({
      user_id: req.applicant_id,
      type: 'call_started',
      title: 'Appel vidéo entrant',
      body: `L'agent ${profile.username} vous rappelle pour votre demande.`,
      request_id: req.id,
    });
    // Marquer la notif rappel comme lue + ouvrir l'appel
    await dismissRecall(notif.id);
    setActiveCall({ callId: call.id, requestId: req.id, remoteName: req.applicant?.username ?? 'Coach mobile' });
  }

  // ── Derived stats — file d'attente = TOUTES les demandes non traitées ──
  const today      = new Date().toISOString().split('T')[0];
  // Toutes les demandes en attente, quelle que soit la date de création
  const pending    = requests.filter(r => r.status === 'pending');
  // Toutes les demandes en cours pour cet agent
  const processing = requests.filter(r => r.status === 'processing' && r.agent_id === profile?.id);

  const myProcessed = requests.filter(r =>
    ['accepted', 'rejected'].includes(r.status) && r.agent_id === profile?.id
  );
  const todayProcessed = myProcessed.filter(r =>
    (r.processed_at ?? r.updated_at)?.startsWith(today)
  );
  const totalProcessed  = todayProcessed.length;
  const todayAccepted   = todayProcessed.filter(r => r.status === 'accepted').length;
  const todayRejected   = todayProcessed.filter(r => r.status === 'rejected').length;

  return (
    <MainLayout>
      <div className="space-y-6">

        {/* ── En-tête + bouton pause ─────────────────── */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground text-balance">Tableau de bord Agent</h1>
            <p className="text-muted-foreground text-sm mt-1">Bienvenue, {profile?.username}. Voici votre charge de travail.</p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Horloge */}
            <div className="neu-pressed rounded-2xl px-4 py-2.5 flex items-center gap-2 tabular-nums">
              <Timer size={16} className="text-primary shrink-0" />
              <div className="text-right">
                <p className="text-lg font-bold text-foreground leading-none">
                  {now.toLocaleTimeString('fr-FR', { timeZone: 'Africa/Brazzaville', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5 capitalize">
                  {now.toLocaleDateString('fr-FR', { timeZone: 'Africa/Brazzaville', weekday: 'short', day: '2-digit', month: 'short' })}
                </p>
              </div>
            </div>

            {/* Bouton pause */}
            <button
              onClick={togglePause}
              className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-semibold text-sm transition-all ${
                isPaused
                  ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg'
                  : 'bg-orange-500 hover:bg-orange-600 text-white shadow-lg'
              }`}
            >
              {isPaused
                ? <><PlayCircle size={18} /> Reprendre le travail</>
                : <><PauseCircle size={18} /> Mettre en pause</>}
            </button>
          </div>
        </div>

        {/* ── Bandeau pause active ───────────────────── */}
        {isPaused && (
          <div className="neu-pressed flex items-center gap-4 px-5 py-3 rounded-xl border-l-4 border-orange-400 animate-in slide-in-from-top-2">
            <Coffee size={20} className="text-orange-500 shrink-0 animate-pulse" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground text-sm">Pause en cours</p>
              <p className="text-xs text-muted-foreground">Durée actuelle : <span className="font-bold text-orange-500 tabular-nums">{fmtSec(currentPauseSec)}</span></p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-muted-foreground">Total pauses aujourd'hui</p>
              <p className="font-bold text-foreground tabular-nums">{pauseCount} pause{pauseCount > 1 ? 's' : ''} · {fmtSec(totalPauseSec + currentPauseSec)}</p>
            </div>
          </div>
        )}

        {/* ── KPI cards ─────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {[
            { label: 'File d\'attente',       value: pending.length,        icon: <Clock size={22} className="text-orange-500" />,  color: 'text-orange-500',   clickable: false },
            { label: 'En cours',              value: processing.length,     icon: <ClipboardList size={22} className="text-primary" />, color: 'text-primary',  clickable: false },
            { label: 'Traités aujourd\'hui',  value: todayProcessed.length, icon: <CheckCircle2 size={22} className="text-green-600" />, color: 'text-green-600', clickable: false },
            { label: 'Total traité',          value: totalProcessed,        icon: <History size={22} className="text-purple-500" />,  color: 'text-purple-500', clickable: true  },
            { label: 'Pauses auj.',           value: pauseCount,            icon: <PauseCircle size={22} className="text-orange-400" />, color: 'text-orange-400', clickable: false },
            { label: 'Durée pauses',          value: fmtSec(totalPauseSec + (isPaused ? currentPauseSec : 0)),
              icon: <Coffee size={22} className="text-amber-500" />, color: 'text-amber-500', isText: true, clickable: false },
          ].map(s => {
            const inner = (
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wide leading-tight">{s.label}</p>
                  <p className={`text-xl sm:text-2xl font-bold mt-1 ${s.color} ${'isText' in s && s.isText ? 'text-sm sm:text-base leading-tight mt-1 sm:mt-2' : ''}`}>
                    {loading ? '—' : s.value}
                  </p>
                </div>
                <div className="neu-flat w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0 ml-1 sm:ml-2 scale-75 sm:scale-100">{s.icon}</div>
              </div>
            );
            return s.clickable ? (
              <button
                key={s.label}
                type="button"
                onClick={() => setShowTotalModal(true)}
                className="stat-card p-3 sm:p-4 h-full text-left cursor-pointer hover:ring-2 hover:ring-purple-400/40 transition-all"
              >
                {inner}
                <p className="text-[9px] sm:text-[10px] text-purple-400 mt-1 font-medium">Voir le détail →</p>
              </button>
            ) : (
              <div key={s.label} className="stat-card p-3 sm:p-4 h-full">{inner}</div>
            );
          })}
        </div>

        {/* ── Rappels demandés ──────────────────────── */}
        {recalls.length > 0 && (
          <div className="neu-card space-y-3">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <Bell size={18} className="text-red-500 animate-bounce" />
              Rappels demandés
              <span className="ml-1 text-xs font-bold bg-red-500 text-white rounded-full px-2 py-0.5">
                {recalls.length}
              </span>
            </h2>
            <div className="space-y-2">
              {recalls.map(r => {
                // Extraire le numéro depuis le body : "+XXXXXXX"
                const phoneMatch = r.body.match(/\+[\d]+/);
                const phone = phoneMatch ? phoneMatch[0] : '';
                return (
                  <div key={r.id}
                    className="neu-pressed flex items-center gap-4 px-4 py-3 rounded-xl border-l-4 border-red-400">
                    <div className="neu-flat w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
                      <PhoneCall size={18} className="text-red-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{r.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.body}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: fr })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleCallRecall(r)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white text-xs font-semibold transition-colors"
                      >
                        <Phone size={14} />
                        Appeler
                      </button>
                      <button
                        onClick={() => dismissRecall(r.id)}
                        className="neu-flat w-8 h-8 rounded-lg flex items-center justify-center hover:text-destructive transition-colors"
                        title="Ignorer"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── File d'attente complète ────────────────── */}
        <div className="neu-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <ClipboardList size={18} className="text-primary" />
              Vos demandes en cours
              {!loading && processing.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground">
                  ({processing.length})
                </span>
              )}
            </h2>
          </div>

          {loading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="neu-pressed h-16 rounded-xl animate-pulse" />)}</div>
          ) : isPaused ? (
            /* ── Overlay pause : file d'attente masquée ── */
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <div className="neu-pressed w-16 h-16 rounded-2xl flex items-center justify-center">
                <Coffee size={28} className="text-orange-400 animate-pulse" />
              </div>
              <p className="font-semibold text-foreground text-sm">Pause active</p>
              <p className="text-xs text-muted-foreground max-w-[220px] text-pretty">
                La file d'attente est masquée pendant votre pause. Reprenez le travail pour traiter de nouvelles demandes.
              </p>
              <button
                onClick={togglePause}
                className="mt-1 flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition-colors">
                <PlayCircle size={15} />Reprendre maintenant
              </button>
            </div>
          ) : (
            <>
              {/* ── Demandes en cours ── */}
              {processing.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm bg-muted/20 rounded-xl mb-4 border border-dashed border-border">
                  <p>Aucune demande en cours de traitement.</p>
                </div>
              ) : (
                <div className="space-y-2 mb-6">
                  {processing.map(r => (
                    <Link key={r.id} to={`/agent/process/${r.id}`}
                      className="flex items-center gap-4 p-3 rounded-xl transition-all hover:-translate-y-0.5 border-l-4 border-primary"
                      style={{ background: 'var(--neu-base)', boxShadow: 'var(--shadow-neu-flat)' }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">+{r.phone_to_certify}</p>
                        <p className="text-xs text-primary font-medium truncate">
                          Cette demande vous est attribuée — Cliquez pour traiter
                        </p>
                      </div>
                      <StatusBadge status={r.status} />
                    </Link>
                  ))}
                </div>
              )}

              {/* ── Demandes en attente (Accordion) ── */}
              {pending.length > 0 && (
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="pending" className="border-none">
                    <AccordionTrigger className="neu-pressed rounded-xl px-4 py-3 hover:no-underline [&[data-state=open]]:rounded-b-none transition-all">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <Lock size={16} className="text-muted-foreground" />
                        Demandes en attente
                        <span className="text-xs font-normal text-muted-foreground ml-1 bg-muted/50 px-2 py-0.5 rounded-full">
                          {pending.length}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="neu-pressed border-t-0 rounded-b-xl px-4 py-3 bg-muted/5">
                      <div className="space-y-2 mt-2">
                        {pending.slice(0, 1).map(r => (
                          <div key={r.id} className="flex items-center justify-between gap-4 p-3 rounded-xl bg-background border border-border select-none hover:border-primary/30 transition-colors">
                            <div className="flex items-center gap-4 min-w-0">
                              <div className="neu-flat w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
                                <Lock size={18} className="text-muted-foreground" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate">+{r.phone_to_certify}</p>
                                <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                                  <Clock size={10} />
                                  En attente d'assignation
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <StatusBadge status={r.status} />
                              <button
                                onClick={async (e) => {
                                  e.preventDefault();
                                  if (!profile || claiming) return;
                                  if (processing.length >= 2) {
                                    toast.error("Vous ne pouvez pas traiter plus de 2 demandes simultanément.");
                                    return;
                                  }
                                  setClaiming(true);
                                  const { error } = await claimRequest(r.id, profile.id);
                                  if (error) {
                                    toast.error("Impossible de s'attribuer cette demande. Elle a peut-être déjà été prise.");
                                  } else {
                                    toast.success(`Demande +${r.phone_to_certify} ajoutée à vos demandes en cours.`);
                                  }
                                  setClaiming(false);
                                  load();
                                }}
                                disabled={claiming || processing.length >= 2}
                                title={processing.length >= 2 ? "Limite de 2 demandes simultanées atteinte" : "Prendre cette demande"}
                                className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                              >
                                {claiming ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                Prendre
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Appel vidéo depuis rappel ───────────────── */}
      {activeCall && (
        <VideoCallModal
          callId={activeCall.callId}
          remoteUserName={activeCall.remoteName}
          isInitiator={true}
          requestId={activeCall.requestId}
          onClose={() => setActiveCall(null)}
        />
      )}

      {/* ── Modale détail Total traité ───────────────── */}
      <Dialog open={showTotalModal} onOpenChange={setShowTotalModal}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History size={18} className="text-purple-500" />
              Total traité aujourd'hui
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            {/* Acceptés */}
            <div className="neu-pressed rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle size={18} className="text-green-500 shrink-0" />
                <span className="text-sm font-semibold text-foreground">Numéros acceptés</span>
              </div>
              <span className="text-2xl font-bold text-green-500 tabular-nums shrink-0">
                {loading ? '—' : todayAccepted}
              </span>
            </div>
            {/* Rejetés */}
            <div className="neu-pressed rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <XCircle size={18} className="text-destructive shrink-0" />
                <span className="text-sm font-semibold text-foreground">Numéros rejetés</span>
              </div>
              <span className="text-2xl font-bold text-destructive tabular-nums shrink-0">
                {loading ? '—' : todayRejected}
              </span>
            </div>
            {/* Total */}
            <div className="neu-pressed rounded-xl px-4 py-3 flex items-center justify-between gap-3 border border-purple-400/30">
              <div className="flex items-center gap-2">
                <History size={18} className="text-purple-500 shrink-0" />
                <span className="text-sm font-semibold text-foreground">Total traité</span>
              </div>
              <span className="text-2xl font-bold text-purple-500 tabular-nums shrink-0">
                {loading ? '—' : totalProcessed}
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
