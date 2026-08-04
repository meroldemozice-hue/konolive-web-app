import React, { useEffect, useState, useCallback, useMemo } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { getAllRequests } from '@/lib/api';
import { StatusBadge } from '@/components/common/StatusBadge';
import type { VerificationRequest } from '@/types/types';
import {
  History, CheckCircle2, XCircle, Minus,
  ChevronLeft, ChevronRight, CalendarDays, ChevronDown, ChevronUp, X,
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval,
         getDay, isSameDay, isSameMonth, addMonths, subMonths,
         parseISO, isToday } from 'date-fns';
import { fr } from 'date-fns/locale';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function requestDate(r: VerificationRequest): Date | null {
  const raw = r.processed_at ?? r.updated_at;
  if (!raw) return null;
  try { return parseISO(raw); } catch { return null; }
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function AgentHistoryPage() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading]   = useState(true);
  // Mois affiché dans le calendrier
  const [viewMonth, setViewMonth] = useState(() => new Date());
  // Jour sélectionné (filtre la liste) — par défaut : aujourd'hui
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date());
  // Calendrier masqué par défaut
  const [showCalendar, setShowCalendar] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    const data = await getAllRequests(500);
    setRequests(
      data.filter(r =>
        r.agent_id === profile.id &&
        ['accepted', 'rejected', 'unchanged'].includes(r.status)
      )
    );
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  // ── Statistiques globales ─────────────────────────────────────────────────
  const stats = useMemo(() => ({
    accepted:  requests.filter(r => r.status === 'accepted').length,
    rejected:  requests.filter(r => r.status === 'rejected').length,
    unchanged: requests.filter(r => r.status === 'unchanged').length,
  }), [requests]);

  // ── Map : date-key → liste de demandes ────────────────────────────────────
  const byDay = useMemo(() => {
    const map = new Map<string, VerificationRequest[]>();
    for (const r of requests) {
      const d = requestDate(r);
      if (!d) continue;
      const k = getDateKey(d);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return map;
  }, [requests]);

  // ── Jours du mois + padding ────────────────────────────────────────────────
  const calendarDays = useMemo(() => {
    const firstDay = startOfMonth(viewMonth);
    const lastDay  = endOfMonth(viewMonth);
    const days = eachDayOfInterval({ start: firstDay, end: lastDay });
    // lundi = 0 … dimanche = 6
    const startPad = (getDay(firstDay) + 6) % 7;
    return { days, startPad };
  }, [viewMonth]);

  // ── Liste affichée (toujours filtrée par le jour sélectionné) ─────────────
  const displayedRequests = useMemo(() => {
    return byDay.get(getDateKey(selectedDay)) ?? [];
  }, [byDay, selectedDay]);

  // ── Couleur intensité par nombre de demandes ──────────────────────────────
  function dotColor(count: number): string {
    if (count === 0) return '';
    if (count <= 2)  return 'bg-primary/30';
    if (count <= 5)  return 'bg-primary/60';
    return 'bg-primary';
  }

  const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  return (
    <MainLayout>
      <div className="space-y-6">

        {/* ── En-tête ── */}
        <div>
          <h1 className="text-2xl font-bold text-foreground text-balance">Mon historique</h1>
          <p className="text-muted-foreground text-sm mt-1">Toutes les demandes que vous avez traitées.</p>
        </div>

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {[
            { label: 'Acceptées',  value: stats.accepted,  icon: <CheckCircle2 size={20} className="text-green-600" />,  color: 'text-green-600' },
            { label: 'Rejetées',   value: stats.rejected,  icon: <XCircle      size={20} className="text-red-500" />,    color: 'text-red-500'   },
            { label: 'Inchangées', value: stats.unchanged, icon: <Minus        size={20} className="text-gray-500" />,   color: 'text-gray-500'  },
          ].map(s => (
            <div key={s.label} className="stat-card h-full p-3 sm:p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide leading-tight">{s.label}</p>
                  <p className={`text-xl sm:text-3xl font-bold mt-1 ${s.color}`}>{s.value}</p>
                </div>
                <div className="neu-flat w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 scale-75 sm:scale-100">{s.icon}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Tableau filtré ── */}
        <div className="neu-card">
          {/* En-tête du tableau avec bouton calendrier */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground flex items-center gap-2 flex-1 min-w-0">
              <History size={18} className="text-primary shrink-0" />
              <span className="truncate">
                Demandes du {format(selectedDay, 'd MMMM yyyy', { locale: fr })}
              </span>
              <span className="neu-flat text-xs font-bold text-primary px-2 py-0.5 rounded-full shrink-0">
                {displayedRequests.length}
              </span>
            </h2>
            {/* Bouton toggle calendrier */}
            <button
              onClick={() => setShowCalendar(v => !v)}
              className={[
                'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all ml-2',
                showCalendar ? 'neu-pressed text-primary' : 'neu-flat text-muted-foreground hover:text-primary',
              ].join(' ')}
              aria-label={showCalendar ? 'Masquer le calendrier' : 'Afficher le calendrier'}
            >
              <CalendarDays size={15} />
              <span className="hidden md:inline">Calendrier</span>
              {showCalendar ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>

          {/* ── Calendrier (accordéon) ── */}
          {showCalendar && (
            <div className="mb-5 pb-5 border-b border-border/50">
              {/* Navigation mois */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold text-foreground capitalize">
                  {format(viewMonth, 'MMMM yyyy', { locale: fr })}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setViewMonth(m => subMonths(m, 1))}
                    className="neu-flat w-8 h-8 rounded-lg flex items-center justify-center hover:text-primary transition-colors"
                    aria-label="Mois précédent">
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => setViewMonth(m => addMonths(m, 1))}
                    className="neu-flat w-8 h-8 rounded-lg flex items-center justify-center hover:text-primary transition-colors"
                    aria-label="Mois suivant">
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>

              {/* En-têtes jours */}
              <div className="grid grid-cols-7 mb-2">
                {DAY_LABELS.map(d => (
                  <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">{d}</div>
                ))}
              </div>

              {/* Grille jours — sélection unique, pas de désélection */}
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: calendarDays.startPad }).map((_, i) => (
                  <div key={`pad-${i}`} />
                ))}

                {calendarDays.days.map(day => {
                  const key        = getDateKey(day);
                  const count      = byDay.get(key)?.length ?? 0;
                  const isSelected = isSameDay(day, selectedDay);
                  const isCurrent  = isToday(day);
                  const inMonth    = isSameMonth(day, viewMonth);

                  return (
                    <button
                      key={key}
                      onClick={() => {
                        setSelectedDay(day);
                        setShowCalendar(false); // ferme le calendrier après sélection
                      }}
                      className={[
                        'relative flex flex-col items-center justify-center rounded-xl p-1.5 min-h-[52px] transition-all',
                        inMonth ? '' : 'opacity-30',
                        isSelected
                          ? 'neu-pressed ring-2 ring-primary text-primary'
                          : 'neu-flat hover:neu-pressed cursor-pointer',
                      ].join(' ')}
                      aria-label={`${format(day, 'd MMMM', { locale: fr })} — ${count} demande${count > 1 ? 's' : ''}`}
                      aria-pressed={isSelected}
                    >
                      <span className={[
                        'text-xs font-semibold leading-none',
                        isCurrent && !isSelected ? 'text-primary' : 'text-foreground',
                      ].join(' ')}>
                        {format(day, 'd')}
                      </span>

                      {count > 0 && (
                        <span className={[
                          'mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none',
                          isSelected ? 'bg-primary text-white' : `${dotColor(count)} text-primary`,
                        ].join(' ')}>
                          {count}
                        </span>
                      )}

                      {isCurrent && (
                        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Légende */}
              <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border/50">
                {[
                  { label: '1–2', cls: 'bg-primary/30' },
                  { label: '3–5', cls: 'bg-primary/60' },
                  { label: '6+',  cls: 'bg-primary' },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <span className={`w-3 h-3 rounded-full ${l.cls}`} />
                    <span className="text-xs text-muted-foreground">{l.label} demande{l.label === '1–2' ? '' : 's'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Liste des demandes du jour ── */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="neu-pressed h-14 rounded-xl animate-pulse" />)}
            </div>
          ) : displayedRequests.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <History size={32} className="mx-auto mb-2 opacity-30" />
              <p>Aucune demande traitée le {format(selectedDay, 'd MMMM', { locale: fr })}.</p>
              <button
                onClick={() => setShowCalendar(true)}
                className="mt-3 text-xs text-primary hover:underline flex items-center gap-1 mx-auto">
                <CalendarDays size={13} />Changer de date
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground uppercase tracking-wide border-b border-border">
                    <th className="pb-3 pr-4 whitespace-nowrap font-medium">Téléphone</th>
                    <th className="pb-3 pr-4 whitespace-nowrap font-medium">Coach mobile</th>
                    <th className="pb-3 pr-4 whitespace-nowrap font-medium">Traitée le</th>
                    <th className="pb-3 whitespace-nowrap font-medium">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedRequests.map(r => {
                    const d = requestDate(r);
                    return (
                      <tr key={r.id} className="border-b border-border/50 last:border-0">
                        <td className="py-3 pr-4 text-sm font-medium whitespace-nowrap">+{r.phone_to_certify}</td>
                        <td className="py-3 pr-4 text-sm whitespace-nowrap">{r.applicant?.username ?? '—'}</td>
                        <td className="py-3 pr-4 text-sm text-muted-foreground whitespace-nowrap">
                          {d ? format(d, 'd MMM yyyy, HH:mm', { locale: fr }) : '—'}
                        </td>
                        <td className="py-3 whitespace-nowrap"><StatusBadge status={r.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
