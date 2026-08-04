import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useVideoCall } from '@/contexts/VideoCallContext'; // floating call context
import { getDashboardPath } from '@/components/common/RouteGuard';
import ThemeToggle from '@/components/common/ThemeToggle';
import {
  LayoutDashboard, FileText, History, MessageSquare, Bell,
  Users, Settings, BarChart2, ClipboardList, LogOut,
  Menu, ChevronRight, Shield, UserCheck, Eye, Video, Clock, Wifi, AlertTriangle, KeyRound, CalendarDays, TrendingUp
} from 'lucide-react';import type { UserRole } from '@/types/types';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import InternalCallModal from '@/components/discussion/InternalCallModal';
import { countUnreadInternalMessages } from '@/lib/api';
import type { Profile, InternalMessage } from '@/types/types';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

function getNavItems(role: UserRole | null): NavItem[] {
  switch (role) {
    case 'applicant':
      return [
        { label: 'Tableau de bord', path: '/dashboard', icon: <LayoutDashboard size={18} /> },
        { label: 'Nouvelle demande', path: '/dashboard/new-request', icon: <FileText size={18} /> },
        { label: 'Mes demandes', path: '/dashboard/requests', icon: <History size={18} /> },
        { label: 'Messages', path: '/dashboard/messages', icon: <MessageSquare size={18} /> },
        { label: 'Notifications', path: '/dashboard/notifications', icon: <Bell size={18} /> },
      ];
    case 'agent':
      return [
        { label: 'Tableau de bord', path: '/agent', icon: <LayoutDashboard size={18} /> },
        { label: 'Évolution quotidienne', path: '/agent/daily-evolution', icon: <TrendingUp size={18} /> },
        { label: 'Discussion', path: '/discussion', icon: <MessageSquare size={18} /> },
        { label: 'Mon historique', path: '/agent/history', icon: <History size={18} /> },
        { label: 'Suivi mensuel', path: '/agent/monthly-tracking', icon: <CalendarDays size={18} /> },
        { label: 'Notifications', path: '/agent/notifications', icon: <Bell size={18} /> },
        { label: 'Paramètres', path: '/agent/settings', icon: <Settings size={18} /> },
      ];
    case 'supervisor':
      return [
        { label: 'Tableau de bord',    path: '/supervisor',                icon: <LayoutDashboard size={18} /> },
        { label: 'Stats globales',     path: '/supervisor/stats',          icon: <BarChart2 size={18} /> },
        { label: 'Stats des agents',   path: '/supervisor/agents',         icon: <UserCheck size={18} /> },
        { label: 'Statut des agents',  path: '/supervisor/agents-status',  icon: <Wifi size={18} /> },
        { label: 'Toutes les demandes',path: '/supervisor/requests',       icon: <ClipboardList size={18} /> },
        { label: 'Historique',         path: '/supervisor/history',        icon: <History size={18} /> },
        { label: 'Processing Time',    path: '/supervisor/processing-time',icon: <Clock size={18} /> },
        { label: 'Rapports',           path: '/supervisor/reports',        icon: <FileText size={18} /> },
        { label: 'Paramètres',         path: '/supervisor/settings',       icon: <Settings size={18} /> },
        { label: 'Discussion',         path: '/discussion',                icon: <MessageSquare size={18} /> },
      ];
    case 'admin':
      return [
        { label: 'Tableau de bord',    path: '/admin',         icon: <LayoutDashboard size={18} /> },
        { label: 'Utilisateurs',       path: '/admin/users',   icon: <Users size={18} /> },
        { label: 'Toutes les demandes',path: '/admin/requests',icon: <ClipboardList size={18} /> },
        { label: 'Statistiques',       path: '/admin/stats',   icon: <BarChart2 size={18} /> },
        { label: 'Historique',         path: '/admin/history', icon: <History size={18} /> },
        { label: "Journaux d'activité",path: '/admin/logs',    icon: <Eye size={18} /> },
        { label: 'Configuration',      path: '/admin/config',  icon: <Settings size={18} /> },
        { label: 'Mon compte',         path: '/admin/account', icon: <KeyRound size={18} /> },
      ];
    default:
      return [];
  }
}

function getRoleLabel(role: UserRole | null) {
  switch (role) {
    case 'applicant': return { label: 'Coach mobile', color: 'bg-blue-500', icon: <FileText size={14} /> };
    case 'agent': return { label: 'Agent', color: 'bg-green-500', icon: <UserCheck size={14} /> };
    case 'supervisor': return { label: 'Superviseur', color: 'bg-purple-500', icon: <Eye size={14} /> };
    case 'admin': return { label: 'Administrateur', color: 'bg-red-500', icon: <Shield size={14} /> };
    default: return { label: 'Utilisateur', color: 'bg-gray-500', icon: null };
  }
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { profile, role, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const navItems = getNavItems(role);
  const roleInfo = getRoleLabel(role);

  const [unreadDiscussionCount, setUnreadDiscussionCount] = useState(0);
  const [isProcessingLocked, setIsProcessingLocked] = useState(false);

  useEffect(() => {
    // Request notification permission to alert agents when app is in background
    if (role === 'agent' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }, [role]);

  useEffect(() => {
    if (role === 'agent' && profile) {
      const checkProcessing = async () => {
        const { count } = await supabase
          .from('verification_requests')
          .select('id', { count: 'exact', head: true })
          .eq('agent_id', profile.id)
          .eq('status', 'processing');
        setIsProcessingLocked((count || 0) > 0);
      };
      checkProcessing();

      const channel = supabase.channel(`main-layout-req-${profile.id}-${Math.random()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'verification_requests', filter: `agent_id=eq.${profile.id}` },
          (payload: any) => {
            checkProcessing();
            
            // Auto-redirect to Process page if a request is assigned and agent is not paused
            if ((payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') && payload.new.status === 'processing' && !profile.is_paused) {
              
              // Notify agent if app is in background
              if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
                new Notification('Nouvelle demande Konolive', {
                  body: 'Une nouvelle demande vous a été attribuée.',
                  icon: '/favicon.png',
                });
              }

              if (!window.location.pathname.startsWith('/agent/process/')) {
                navigate(`/agent/process/${payload.new.id}`);
              }
            }
          }
        )
        .subscribe();

      return () => { 
        supabase.removeChannel(channel).catch(err => console.warn('Erreur lors du nettoyage du canal:', err)); 
      };
    }
  }, [profile, role, navigate]);

  useEffect(() => {
    if (!profile || (role !== 'agent' && role !== 'supervisor' && role !== 'admin')) return;
    const fetchUnread = async () => {
      const count = await countUnreadInternalMessages(profile.id);
      setUnreadDiscussionCount(count);
    };
    fetchUnread();

    const channel = supabase.channel(`main-layout-unread-${profile.id}-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'internal_messages', filter: `receiver_id=eq.${profile.id}` },
        () => {
          fetchUnread();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel).catch(err => console.warn('Erreur lors du nettoyage du canal:', err));
    };
  }, [profile, role]);

  // Bloc déconnexion agent avec demande en cours
  const [blockLogout, setBlockLogout] = useState(false);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);

  const handleSignOut = async () => {
    // Pour les agents : vérifier s'il y a une demande en cours avant de déconnecter
    if (role === 'agent' && profile?.id) {
      const { data } = await supabase
        .from('verification_requests')
        .select('id')
        .eq('agent_id', profile.id)
        .eq('status', 'processing')
        .maybeSingle();

      if (data) {
        setActiveRequestId(data.id);
        setBlockLogout(true);
        return;
      }
    }
    await signOut();
    navigate('/login');
  };

  return (
    <div className="flex flex-col h-full bg-sidebar">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-sidebar-border">
        <Link to={getDashboardPath(role)} className="flex items-center gap-3" onClick={onNavigate}>
          <div className="w-9 h-9 rounded-xl bg-sidebar-primary flex items-center justify-center shadow-lg">
            <Video size={18} className="text-white" />
          </div>
          <span className="text-xl font-bold text-sidebar-foreground tracking-tight">Konolive</span>
        </Link>
      </div>

      {/* Profile */}
      <div className="px-4 py-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-2 rounded-xl" style={{ background: 'hsl(var(--sidebar-accent))' }}>
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold"
            style={{ background: 'hsl(var(--sidebar-primary))' }}>
            {profile?.username?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-sidebar-foreground truncate">{profile?.username}</p>
            <div className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-white mt-0.5', roleInfo.color)}>
              {roleInfo.icon}<span>{roleInfo.label}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className={`flex-1 overflow-y-auto py-3 px-3 ${isProcessingLocked ? 'opacity-50 pointer-events-none select-none grayscale' : ''}`}>
        <ul className="space-y-1">
          {navItems.map(item => {
            const isActive = location.pathname === item.path ||
              (item.path !== getDashboardPath(role) && location.pathname.startsWith(item.path));
            return (
              <li key={item.path}>
                <Link
                  to={item.path}
                  onClick={onNavigate}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-md'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  )}
                >
                  {item.icon}
                  <span className="flex-1 min-w-0 truncate">{item.label}</span>
                  {item.path === '/discussion' && unreadDiscussionCount > 0 && (
                    <Badge variant="destructive" className="ml-auto rounded-full px-1.5 min-w-[20px] h-5 flex items-center justify-center text-[10px]">
                      {unreadDiscussionCount > 99 ? '99+' : unreadDiscussionCount}
                    </Badge>
                  )}
                  {isActive && item.path !== '/discussion' && <ChevronRight size={14} className="ml-auto" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="px-3 py-4 border-t border-sidebar-border">
        <div className="flex items-center gap-2">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 flex-1 px-3 py-2.5 rounded-xl text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-200"
          >
            <LogOut size={18} />
            <span>Se déconnecter</span>
          </button>
          <ThemeToggle />
        </div>
      </div>

      {/* ── Modale de blocage déconnexion agent ── */}
      <Dialog open={blockLogout} onOpenChange={setBlockLogout}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-amber-500" />
              </div>
              <DialogTitle className="text-balance">Déconnexion impossible</DialogTitle>
            </div>
            <DialogDescription className="text-pretty">
              Vous avez une <strong>demande en cours de traitement</strong>. Veuillez la clôturer
              (Accepter, Rejeter, Inchangé ou Autre) avant de vous déconnecter.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
            <Button
              variant="outline"
              onClick={() => setBlockLogout(false)}
              className="w-full sm:w-auto"
            >
              Annuler
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => {
                setBlockLogout(false);
                if (activeRequestId) {
                  navigate(`/agent/process/${activeRequestId}`);
                  onNavigate?.();
                } else {
                  navigate('/agent');
                  onNavigate?.();
                }
              }}
            >
              Aller à la demande
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { profile, role } = useAuth();
  const { startCall } = useVideoCall();
  const roleInfo = getRoleLabel(role);

  // Global incoming call listener for applicants — works on any page
  // Redirige vers la fenêtre flottante globale (FloatingVideoCall via VideoCallContext)
  useEffect(() => {
    if (!profile || role !== 'applicant') return;
    const ch = supabase
      .channel(`user-call-${profile.id}`)
      .on('broadcast', { event: 'call_offer' }, ({ payload }) => {
        if (payload?.applicant_id === profile.id) {
          startCall({
            callId: payload.call_id,
            remoteUserName: payload.agent_name ?? 'Agent',
            remoteUserPhoto: payload.agent_photo ?? null,
            isInitiator: false,
            requestId: payload.request_id ?? '',
          });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch).catch(err => console.warn('Erreur lors du nettoyage du canal:', err)); };
  }, [profile, role, startCall]);

  // ── Global incoming INTERNAL call listener (agent & supervisor) ──────────
  // Runs on every page — receives call_invite regardless of current route
  const [globalInternalCall, setGlobalInternalCall] = useState<{
    callId: string; initiatorName: string; participants: Profile[];
  } | null>(null);
  const [activeInternalCall, setActiveInternalCall] = useState<{
    callId: string; participants: Profile[];
  } | null>(null);

  // ── Global presence tracking (all authenticated users) ───────────────────
  useEffect(() => {
    if (!profile) return;

    // 1. Supabase Presence (WebSocket) - Ultra-rapide et gère les coupures réseau
    const presenceCh = supabase.channel(`user-presence-${profile.id}`, {
      config: { presence: { key: profile.id } },
    });
    presenceCh.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        presenceCh.track({ user_id: profile.id, online_at: new Date().toISOString() });
      }
    });

    // 2. Database is_online (REST/PATCH) - Pour les requêtes SQL (stats)
    const supabaseUrl    = import.meta.env.VITE_SUPABASE_URL as string;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

    const setOnline  = () => supabase.from('profiles').update({ is_online: true,  is_paused: false }).eq('id', profile.id);
    const setOffline = () => supabase.from('profiles').update({ is_online: false, is_paused: false }).eq('id', profile.id);

    // fetch keepalive → garantit le PATCH à la fermeture
    const sendOfflineBeacon = () => {
      const url = `${supabaseUrl}/rest/v1/profiles?id=eq.${profile.id}`;
      fetch(url, {
        method: 'PATCH',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ is_online: false, is_paused: false }),
      }).catch(() => {});
    };

    setOnline().then(() => {});

    const handleUnload = () => sendOfflineBeacon();
    window.addEventListener('beforeunload', handleUnload);

    const handleVisibility = () => {
      if (document.hidden) setOffline().then(() => {});
      else setOnline().then(() => {});
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      document.removeEventListener('visibilitychange', handleVisibility);
      sendOfflineBeacon();
      supabase.removeChannel(presenceCh).catch(err => console.warn('Erreur lors du nettoyage du canal presence:', err));
    };
  }, [profile]);

  useEffect(() => {
    if (!profile || (role !== 'agent' && role !== 'supervisor')) return;
    const ch = supabase.channel(`internal-call-invite-${profile.id}-${Math.random()}`)
      .on('broadcast', { event: 'call_invite' }, ({ payload }) => {
        if (payload.to !== profile.id) return;
        // Éviter de rouvrir si un appel interne est déjà actif
        setGlobalInternalCall(prev => prev ? prev : {
          callId: payload.callId,
          initiatorName: payload.initiatorName ?? 'Collègue',
          participants: payload.participants ?? [],
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch).catch(err => console.warn('Erreur lors du nettoyage du canal:', err)); };
  }, [profile, role]);

  return (
    <div className="flex min-h-screen w-full">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 fixed inset-y-0 left-0 z-30">
        <SidebarContent />
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 lg:ml-64 flex flex-col">
        {/* Top header (mobile) */}
        <header className="lg:hidden sticky top-0 z-20 flex items-center gap-3 px-4 py-3 border-b border-border"
          style={{ background: 'var(--neu-base)' }}>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0 text-foreground">
                <Menu size={22} />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-64 bg-sidebar" aria-describedby={undefined}>
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Video size={18} className="text-primary shrink-0" />
            <span className="font-bold text-foreground text-balance">Konolive</span>
          </div>
          <div className={cn('flex items-center gap-1 px-2 py-1 rounded-full text-xs text-white shrink-0', roleInfo.color)}>
            {roleInfo.icon}<span className="sr-only md:not-sr-only">{profile?.username}</span>
          </div>
        </header>

        {/* Desktop header */}
        <header className="hidden lg:flex items-center gap-4 px-8 py-4 border-b border-border"
          style={{ background: 'var(--neu-base)' }}>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <div className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-white', roleInfo.color)}>
              {roleInfo.icon}<span className="font-medium">{profile?.username} — {roleInfo.label}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>

      {/* ── Bannière appel entrant interne (agent / superviseur) ─── */}
      {globalInternalCall && !activeInternalCall && (
        <div className="fixed bottom-6 right-6 z-50 w-80 neu-card shadow-2xl border border-primary/20 animate-in slide-in-from-bottom-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="text-primary animate-pulse">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.16 3.22a2 2 0 0 1 1.99-2.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6.13 6.13l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-foreground text-sm">Appel entrant</p>
              <p className="text-xs text-muted-foreground truncate">
                De : <span className="font-medium text-foreground">{globalInternalCall.initiatorName}</span>
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              className="flex-1 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-semibold transition-colors"
              onClick={() => {
                setActiveInternalCall({ callId: globalInternalCall.callId, participants: globalInternalCall.participants });
                setGlobalInternalCall(null);
              }}>
              Répondre
            </button>
            <button
              className="flex-1 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors"
              onClick={() => setGlobalInternalCall(null)}>
              Refuser
            </button>
          </div>
        </div>
      )}

      {/* ── Modal appel interne actif ──────────────────────── */}
      {activeInternalCall && profile && (
        <InternalCallModal
          callId={activeInternalCall.callId}
          participants={activeInternalCall.participants.filter(p => p.id !== profile.id)}
          isInitiator={false}
          onClose={() => setActiveInternalCall(null)}
        />
      )}
    </div>
  );
}
