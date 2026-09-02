"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Clock, MapPin, Radio } from "lucide-react";

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
    <main className="min-h-screen bg-[var(--color-navy)] text-white flex flex-col">
      <header className="border-b border-white/10 px-6 py-5 text-center">
        <div className="flex items-center justify-center gap-2 text-xs font-medium text-white/60 uppercase tracking-widest">
          <Radio className="h-3.5 w-3.5" />
          {live ? live.teamName : "Score live"}
        </div>
        <h1 className="mt-1 text-lg font-bold text-white">{live ? live.title : "Match"}</h1>
        {live && (
          <div className="mt-1 flex items-center justify-center gap-3 text-xs text-white/60">
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {live.location || "Lieu non renseigné"}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {dateLabel}
            </span>
          </div>
        )}
      </header>

      <div className="flex-1 flex items-center justify-center px-6">
        {loading && <p className="text-white/60">Chargement du score live…</p>}
        {error && !loading && (
          <div className="text-center">
            <p className="text-lg font-semibold">{error}</p>
            <p className="mt-2 text-sm text-white/60">Demandez un nouveau lien à votre coach.</p>
          </div>
        )}
        {live && !error && (
          <div className="w-full max-w-md text-center">
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
          </div>
        )}
      </div>

      <footer className="border-t border-white/10 px-6 py-4 text-center text-[10px] text-white/40">
        Propulsé par Benchrs
      </footer>
    </main>
  );
}
