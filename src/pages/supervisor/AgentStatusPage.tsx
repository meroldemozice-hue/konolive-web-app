import React, { useEffect, useState, useCallback } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { supabase } from '@/lib/supabase';
import { Wifi, WifiOff, PauseCircle, RefreshCw, Users } from 'lucide-react';

interface AgentRow {
  id: string;
  username: string;
  email: string;
  is_online: boolean;
  is_paused: boolean;
}

type StatusFilter = 'all' | 'online' | 'paused' | 'offline';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all',     label: 'Tous' },
  { value: 'online',  label: 'En ligne' },
  { value: 'paused',  label: 'En pause' },
  { value: 'offline', label: 'Hors ligne' },
];

function statusOf(a: AgentRow): StatusFilter {
  if (!a.is_online)  return 'offline';
  if (a.is_paused)   return 'paused';
  return 'online';
}

const STATUS_CONFIG: Record<StatusFilter, { label: string; dot: string; badge: string }> = {
  online:  { label: 'En ligne',  dot: 'bg-green-400', badge: 'text-green-700 bg-green-100' },
  paused:  { label: 'En pause',  dot: 'bg-orange-400', badge: 'text-orange-700 bg-orange-100' },
  offline: { label: 'Hors ligne', dot: 'bg-muted-foreground/40', badge: 'text-muted-foreground bg-muted/60' },
  all:     { label: 'Tous', dot: '', badge: '' },
};

export default function AgentStatusPage() {
  const [agents, setAgents]     = useState<AgentRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<StatusFilter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, username, email, is_online, is_paused')
      .eq('role', 'agent')
      .order('username', { ascending: true });
    setAgents(Array.isArray(data) ? (data as AgentRow[]) : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime — mise à jour instantanée quand is_online / is_paused change
  useEffect(() => {
    const ch = supabase.channel('agent-status-rt')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, payload => {
        const updated = payload.new as AgentRow;
        if (!updated?.id) return;
        setAgents(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = agents.filter(a => filter === 'all' || statusOf(a) === filter);
  const counts = {
    online:  agents.filter(a => statusOf(a) === 'online').length,
    paused:  agents.filter(a => statusOf(a) === 'paused').length,
    offline: agents.filter(a => statusOf(a) === 'offline').length,
  };

  return (
    <MainLayout>
      <div className="space-y-6">

        {/* En-tête */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground text-balance">Statut des agents</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Vue en temps réel de la disponibilité de tous les agents.
            </p>
          </div>
          <button
            onClick={load}
            className="neu-btn flex items-center gap-2 px-4 py-2 text-sm shrink-0"
          >
            <RefreshCw size={15} />
            Actualiser
          </button>
        </div>

        {/* KPI pills */}
        <div className="grid grid-cols-3 gap-4">
          {([
            { key: 'online',  label: 'En ligne',   count: counts.online,  icon: <Wifi size={20} className="text-green-600" />,  color: 'text-green-600'  },
            { key: 'paused',  label: 'En pause',   count: counts.paused,  icon: <PauseCircle size={20} className="text-orange-500" />, color: 'text-orange-500' },
            { key: 'offline', label: 'Hors ligne', count: counts.offline, icon: <WifiOff size={20} className="text-muted-foreground" />, color: 'text-muted-foreground' },
          ] as const).map(s => (
            <div key={s.key} className="stat-card h-full cursor-pointer" onClick={() => setFilter(filter === s.key ? 'all' : s.key)}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{s.label}</p>
                  <p className={`text-3xl font-bold mt-1 ${s.color}`}>{loading ? '—' : s.count}</p>
                </div>
                <div className="neu-flat w-11 h-11 rounded-xl flex items-center justify-center shrink-0">{s.icon}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Filtres */}
        <div className="neu-card py-4 px-5">
          <div className="flex items-center gap-2 flex-wrap">
            <Users size={15} className="text-muted-foreground shrink-0" />
            {STATUS_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  filter === f.value ? 'neu-btn-primary' : 'neu-btn'
                }`}
              >
                {f.label}
                {f.value !== 'all' && (
                  <span className="ml-1.5 text-xs opacity-70">
                    ({f.value === 'online' ? counts.online : f.value === 'paused' ? counts.paused : counts.offline})
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Grille agents */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3,4,5,6].map(i => <div key={i} className="neu-flat h-20 rounded-xl animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="neu-card text-center py-16">
            <Users size={40} className="mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-muted-foreground text-sm">Aucun agent trouvé.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(agent => {
              const st = statusOf(agent);
              const cfg = STATUS_CONFIG[st];
              return (
                <div key={agent.id} className="neu-card flex items-center gap-4">
                  {/* Avatar initiale */}
                  <div className="neu-flat w-12 h-12 rounded-full flex items-center justify-center shrink-0 relative">
                    <span className="text-lg font-bold text-primary">
                      {(agent.username ?? 'A')[0].toUpperCase()}
                    </span>
                    {/* Indicateur statut */}
                    <span className={`absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full border-2 border-card ${cfg.dot}`} />
                  </div>

                  {/* Infos */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-sm truncate">{agent.username}</p>
                    <p className="text-xs text-muted-foreground truncate">{agent.email}</p>
                  </div>

                  {/* Badge statut */}
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${cfg.badge}`}>
                    {cfg.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
