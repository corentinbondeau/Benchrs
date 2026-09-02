"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Clock, MapPin, Radio } from "lucide-react";

interface LiveEvent {
  event_type: string;
  player_id: string | null;
  related_player_id: string | null;
  minute: number | null;
  notes: string | null;
}

interface LivePlayer {
  id: string;
  first_name: string;
  last_name: string;
  shirt_number: number | null;
}

interface LiveStat {
  player_id: string;
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
  minutes_played: number;
}

interface LiveLineup {
  player_id: string;
  position: string | null;
  is_starter: boolean;
}

interface LiveData {
  id: string;
  teamName: string;
  title: string;
  opponent: string | null;
  location: string | null;
  eventDate: string;
  status: string;
  scoreUs: number | null;
  scoreThem: number | null;
  startedAt: string | null;
  endedAt: string | null;
  halftimeAt: string | null;
  resumedAt: string | null;
  halfDuration?: number;
  events?: LiveEvent[];
  players?: LivePlayer[];
  stats?: LiveStat[];
  lineups?: LiveLineup[];
}

const POLL_MS = 5000;

function matchClock(live: LiveData): string | null {
  if (!live.startedAt || live.endedAt) return null;
  const half = live.halfDuration ?? 45;
  const halftimeAt = live.halftimeAt ? new Date(live.halftimeAt).getTime() : null;
  const resumedAt = live.resumedAt ? new Date(live.resumedAt).getTime() : null;
  const now = Date.now();
  const base = new Date(live.startedAt).getTime();
  const elapsed = (now - base) / 60000;

  let display: number;
  let label: string;
  if (halftimeAt && resumedAt && now >= resumedAt) {
    display = half + (now - resumedAt) / 60000;
    label = "2e mi-temps";
  } else if (halftimeAt && now >= halftimeAt) {
    display = half;
    label = "Mi-temps";
  } else {
    display = Math.min(elapsed, half);
    label = "1re mi-temps";
  }
  const mm = Math.max(0, Math.floor(display));
  return `${label} · ${mm}'`;
}

function scoreLive(live: LiveData) {
  return (live.scoreUs ?? 0) + " - " + (live.scoreThem ?? 0);
}

function badgeStatus(live: LiveData) {
  if (live.status === "completed" || live.endedAt) return { text: "Terminé", cls: "bg-slate-100 text-slate-600" };
  if (live.startedAt) return { text: "En direct", cls: "bg-red-100 text-red-600" };
  return { text: "À venir", cls: "bg-amber-100 text-amber-700" };
}

function eventIcon(type: string): string {
  switch (type) {
    case "goal": return "⚽";
    case "opponent_goal": return "⚽";
    case "yellow_card": return "🟨";
    case "red_card": return "🟥";
    case "substitution": return "🔄";
    case "injury": return "🤕";
    default: return "•";
  }
}

function TimelineSection({ events, players }: { events: LiveEvent[]; players: LivePlayer[] }) {
  function getPlayerName(playerId: string | null): string {
    if (!playerId) return "";
    const p = players.find((pl) => pl.id === playerId);
    if (!p) return "Inconnu";
    return `${p.first_name} ${p.last_name}`;
  }

  if (events.length === 0) {
    return (
      <section className="w-full max-w-md mx-auto px-4 mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">Événements</h2>
        <p className="text-sm text-white/40 text-center py-4">Aucun événement pour le moment</p>
      </section>
    );
  }

  return (
    <section className="w-full max-w-md mx-auto px-4 mt-6">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">Événements</h2>
      <ol className="space-y-2">
        {events.map((ev, idx) => {
          const icon = eventIcon(ev.event_type);
          const minute = ev.minute !== null ? `${ev.minute}'` : "—";
          const mainPlayer = getPlayerName(ev.player_id);
          const relatedPlayer = getPlayerName(ev.related_player_id);

          let description = mainPlayer;
          if (ev.event_type === "goal" && relatedPlayer) {
            description = `${mainPlayer} (pass. ${relatedPlayer})`;
          } else if (ev.event_type === "substitution" && relatedPlayer) {
            description = `${mainPlayer} → ${relatedPlayer}`;
          }

          const isOpponent = ev.event_type === "opponent_goal";

          return (
            <li
              key={idx}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${isOpponent ? "bg-white/5 opacity-60" : "bg-white/10"}`}
            >
              <span className="w-8 text-right text-xs font-mono text-white/50 shrink-0">{minute}</span>
              <span className="text-base leading-none">{icon}</span>
              <span className="flex-1 text-white/90">
                {description || ev.notes || ev.event_type}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function LineupSection({ lineups, players }: { lineups: LiveLineup[]; players: LivePlayer[] }) {
  function getPlayer(playerId: string): LivePlayer | undefined {
    return players.find((p) => p.id === playerId);
  }

  function formatPlayer(playerId: string): string {
    const p = getPlayer(playerId);
    if (!p) return "Inconnu";
    const num = p.shirt_number !== null ? `#${p.shirt_number} ` : "";
    return `${num}${p.first_name} ${p.last_name}`;
  }

  const starters = lineups.filter((l) => l.is_starter);
  const subs = lineups.filter((l) => !l.is_starter);

  if (lineups.length === 0) return null;

  return (
    <section className="w-full max-w-md mx-auto px-4 mt-6">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">Composition</h2>
      {starters.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-white/50 mb-1.5">Titulaires</p>
          <ul className="space-y-1">
            {starters.map((l, idx) => (
              <li key={idx} className="flex items-center gap-2 text-sm text-white/85">
                <span className="text-xs text-white/40 w-16 shrink-0">{l.position || ""}</span>
                <span>{formatPlayer(l.player_id)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {subs.length > 0 && (
        <div>
          <p className="text-xs text-white/50 mb-1.5">Remplaçants</p>
          <ul className="space-y-1">
            {subs.map((l, idx) => (
              <li key={idx} className="flex items-center gap-2 text-sm text-white/60">
                <span className="text-xs text-white/30 w-16 shrink-0">{l.position || ""}</span>
                <span>{formatPlayer(l.player_id)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function StatsSection({ stats, players }: { stats: LiveStat[]; players: LivePlayer[] }) {
  function getPlayerName(playerId: string): string {
    const p = players.find((pl) => pl.id === playerId);
    if (!p) return "Inconnu";
    return `${p.first_name} ${p.last_name}`;
  }

  const activeStats = stats
    .filter((s) => s.goals > 0 || s.assists > 0 || s.yellow_cards > 0 || s.red_cards > 0 || s.minutes_played > 0)
    .sort((a, b) => b.minutes_played - a.minutes_played);

  if (activeStats.length === 0) return null;

  return (
    <section className="w-full max-w-md mx-auto px-4 mt-6">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">Stats joueurs</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-white/40 border-b border-white/10">
              <th className="text-left pb-2 font-medium">Joueur</th>
              <th className="text-center pb-2 font-medium w-8">⚽</th>
              <th className="text-center pb-2 font-medium w-8">🅰️</th>
              <th className="text-center pb-2 font-medium w-8">🟨</th>
              <th className="text-center pb-2 font-medium w-8">🟥</th>
              <th className="text-center pb-2 font-medium w-12">Min</th>
            </tr>
          </thead>
          <tbody>
            {activeStats.map((s, idx) => (
              <tr key={idx} className="border-b border-white/5 text-white/80">
                <td className="py-2 pr-2">{getPlayerName(s.player_id)}</td>
                <td className="py-2 text-center tabular-nums">{s.goals || "—"}</td>
                <td className="py-2 text-center tabular-nums">{s.assists || "—"}</td>
                <td className="py-2 text-center tabular-nums">{s.yellow_cards || "—"}</td>
                <td className="py-2 text-center tabular-nums">{s.red_cards || "—"}</td>
                <td className="py-2 text-center tabular-nums text-white/50">{s.minutes_played || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function LivePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const eventId = params.eventId as string;
  const token = searchParams.get("token");

  const [live, setLive] = useState<LiveData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const liveToken = token;
    let cancelled = false;

    async function fetchLive() {
      if (!liveToken) {
        setError("Lien incomplet : token manquant");
        setLoading(false);
        return;
      }
      const res = await fetch(`/api/live/${eventId}?token=${encodeURIComponent(liveToken)}`);
      if (!res.ok) {
        if (!cancelled) {
          setError("Lien invalide ou expiré");
          setLoading(false);
        }
        return;
      }
      const data = (await res.json()) as LiveData;
      if (!cancelled) {
        setLive(data);
        setError(null);
        setLoading(false);
      }
    }
    fetchLive();
    const interval = setInterval(fetchLive, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [eventId, token]);

  const status = live ? badgeStatus(live) : null;
  const clock = live ? matchClock(live) : null;
  const dateLabel = live
    ? new Date(live.eventDate).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <main className="min-h-screen bg-[var(--color-navy)] text-white flex flex-col pb-8">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-5 text-center">
        <div className="flex items-center justify-center gap-2 text-xs font-medium text-white/60 uppercase tracking-widest">
          <Radio className="h-3.5 w-3.5" />
          {live ? live.teamName : "Score live"}
        </div>
        <h1 className="mt-1 text-lg font-bold text-white">{live ? live.title : "Match"}</h1>
      </header>

      {/* Loading / Error */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-white/60">Chargement du score live…</p>
        </div>
      )}
      {error && !loading && (
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <div>
            <p className="text-lg font-semibold">{error}</p>
            <p className="mt-2 text-sm text-white/60">Demandez un nouveau lien à votre coach.</p>
          </div>
        </div>
      )}

      {/* Match content */}
      {live && !error && (
        <>
          {/* Score block */}
          <div className="w-full max-w-md mx-auto px-4 pt-8 text-center">
            <div className="flex items-center justify-center gap-2">
              {status && <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.cls}`}>{status.text}</span>}
              {clock && <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">{clock}</span>}
            </div>
            <p className="mt-6 text-7xl font-black tabular-nums tracking-tight">{scoreLive(live)}</p>
            {live.opponent && (
              <p className="mt-3 text-sm font-medium text-white/70">vs {live.opponent}</p>
            )}
            <p className="mt-1 text-xs text-white/40">
              {live.status === "completed" || live.endedAt ? "Score final" : "Le score se met à jour en direct"}
            </p>

            {/* Lieu + Date */}
            <div className="mt-4 flex items-center justify-center gap-4 text-xs text-white/50">
              {live.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {live.location}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {dateLabel}
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="w-full max-w-md mx-auto px-4 mt-8">
            <div className="border-t border-white/10" />
          </div>

          {/* Timeline */}
          <TimelineSection events={live.events ?? []} players={live.players ?? []} />

          {/* Divider */}
          {(live.lineups ?? []).length > 0 && (
            <div className="w-full max-w-md mx-auto px-4 mt-6">
              <div className="border-t border-white/10" />
            </div>
          )}

          {/* Composition */}
          <LineupSection lineups={live.lineups ?? []} players={live.players ?? []} />

          {/* Divider */}
          {(live.stats ?? []).length > 0 && (
            <div className="w-full max-w-md mx-auto px-4 mt-6">
              <div className="border-t border-white/10" />
            </div>
          )}

          {/* Stats */}
          <StatsSection stats={live.stats ?? []} players={live.players ?? []} />
        </>
      )}

      <footer className="border-t border-white/10 px-6 py-4 mt-8 text-center text-[10px] text-white/40">
        Propulsé par Benchrs
      </footer>
    </main>
  );
}
