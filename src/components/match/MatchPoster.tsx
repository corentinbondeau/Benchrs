"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";

interface PosterData {
  teamName: string;
  title: string;
  opponent: string | null;
  eventDate: string;
  scoreUs: number | null;
  scoreThem: number | null;
  result: "win" | "loss" | "draw" | null;
  scorers: { name: string; goals: number }[];
  mvp: { name: string; votes: number } | null;
  location: string | null;
}

async function fetchPosterData(teamId: string, eventId: string): Promise<PosterData> {
  const supabase = createClient();

  const [{ data: event }, { data: team }] = await Promise.all([
    supabase
      .from("events")
      .select("title, opponent, event_date, score_us, score_them, match_result, location")
      .eq("id", eventId)
      .eq("team_id", teamId)
      .maybeSingle(),
    supabase.from("teams").select("name").eq("id", teamId).maybeSingle(),
  ]);

  const ev = event as {
    title: string;
    opponent: string | null;
    event_date: string;
    score_us: number | null;
    score_them: number | null;
    match_result: "win" | "loss" | "draw" | null;
    location: string | null;
  } | null;

  const [{ data: stats }, { data: motm }] = await Promise.all([
    supabase
      .from("match_stats")
      .select("player_id, goals, profile:profiles!match_stats_player_id_fkey(first_name, last_name)")
      .eq("event_id", eventId)
      .eq("team_id", teamId),
    supabase.from("motm_votes").select("candidate_id").eq("event_id", eventId),
  ]);

  interface StatRow {
    player_id: string;
    goals: number;
    profile: { first_name: string; last_name: string } | null;
  }
  const statRows = (stats || []) as unknown as StatRow[];

  const nameById = new Map<string, string>();
  for (const s of statRows) {
    const n = s.profile ? `${s.profile.first_name} ${s.profile.last_name}`.trim() : "Joueur";
    if (!nameById.has(s.player_id)) nameById.set(s.player_id, n);
  }

  const scorerMap = new Map<string, { name: string; goals: number }>();
  for (const s of statRows) {
    if ((s.goals || 0) > 0) {
      const name = s.profile ? `${s.profile.first_name} ${s.profile.last_name}`.trim() : "Joueur";
      const cur = scorerMap.get(s.player_id) ?? { name, goals: 0 };
      cur.goals += s.goals;
      scorerMap.set(s.player_id, cur);
    }
  }
  const scorers = [...scorerMap.values()].sort((a, b) => b.goals - a.goals).slice(0, 4);

  const voteCounts = new Map<string, number>();
  for (const v of (motm || []) as { candidate_id: string }[]) {
    voteCounts.set(v.candidate_id, (voteCounts.get(v.candidate_id) ?? 0) + 1);
  }
  const mvpCandidate = [...voteCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const mvp = mvpCandidate && nameById.has(mvpCandidate)
    ? { name: nameById.get(mvpCandidate)!, votes: voteCounts.get(mvpCandidate)! }
    : null;

  return {
    teamName: (team as { name?: string } | null)?.name || "Benchrs",
    title: ev?.title || "Match",
    opponent: ev?.opponent ?? null,
    eventDate: ev?.event_date || "",
    scoreUs: ev?.score_us ?? null,
    scoreThem: ev?.score_them ?? null,
    result: ev?.match_result ?? null,
    scorers,
    mvp,
    location: ev?.location ?? null,
  };
}

export function MatchPoster({
  eventId,
  teamId,
  open,
  onOpenChange,
}: {
  eventId: string;
  teamId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [data, setData] = useState<PosterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const posterRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    return fetchPosterData(teamId, eventId);
  }, [teamId, eventId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadData()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, loadData]);

  async function exportImage() {
    if (!posterRef.current || !data) return;
    setExporting(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(posterRef.current, { pixelRatio: 2, cacheBust: true });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `affiche-match-${data.eventDate.slice(0, 10)}.png`, {
        type: "image/png",
      });
      const shareData = {
        files: [file],
        title: "Affiche de match",
        text: data.scoreUs != null && data.scoreThem != null
          ? `${data.teamName} ${data.scoreUs} - ${data.scoreThem} ${data.opponent ?? ""}`.trim()
          : `${data.teamName} — ${data.opponent ?? "Match"}`,
      };
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share(shareData);
      } else {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = file.name;
        a.click();
      }
      toast.success("Affiche partagée");
    } catch (e) {
      console.error("[poster] export error:", e);
      toast.error("Partage non disponible sur cet appareil");
    } finally {
      setExporting(false);
    }
  }

  const dateLabel = data
    ? new Date(data.eventDate).toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

  const resultLabel =
    data?.result === "win" ? "VICTOIRE" : data?.result === "draw" ? "MATCH NUL" : data?.result === "loss" ? "DÉFAITE" : "MATCH";
  const resultColor =
    data?.result === "win" ? "text-emerald-300" : data?.result === "draw" ? "text-amber-300" : data?.result === "loss" ? "text-red-300" : "text-white";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Affiche de match</DialogTitle>
        </DialogHeader>

        {loading || !data ? (
          <div className="h-96 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div
              ref={posterRef}
              className="relative mx-auto w-72 overflow-hidden rounded-2xl bg-gradient-to-b from-[#0B1E3A] via-[#142C55] to-[#0B1E3A] text-white shadow-xl ring-4 ring-[var(--color-gold)]/60"
            >
              <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_70%_20%,#F6C453,transparent_60%)]" />
              <div className="relative p-4 text-center">
                <p className="text-[10px] uppercase tracking-[0.3em] text-white/50">{dateLabel}</p>
                <p className="mt-1 text-sm font-bold text-[var(--color-gold)]">{data.teamName}</p>

                <div className="mt-4 flex items-center justify-center gap-4">
                  <div className="flex-1 text-left">
                    <p className="text-lg font-black leading-tight">Benchrs</p>
                    <p className="text-xs text-white/60">{data.location || ""}</p>
                  </div>
                  <p className="text-2xl font-black text-[var(--color-gold)]">VS</p>
                  <div className="flex-1 text-right">
                    <p className="text-lg font-black leading-tight">{data.opponent || "Adversaire"}</p>
                    <p className="text-xs text-white/60">{data.location || ""}</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-center gap-4">
                  <span className="text-6xl font-black">{data.scoreUs ?? "–"}</span>
                  <span className="text-4xl font-black text-white/40">:</span>
                  <span className="text-6xl font-black">{data.scoreThem ?? "–"}</span>
                </div>

                <p className={`mt-2 text-xl font-black tracking-widest ${resultColor}`}>{resultLabel}</p>

                {data.scorers.length > 0 && (
                  <div className="mt-4 rounded-lg bg-white/10 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-[var(--color-gold)] mb-1.5">Buteurs</p>
                    <div className="space-y-0.5">
                      {data.scorers.map((s, i) => (
                        <p key={i} className="text-sm flex justify-between">
                          <span>{s.name}</span>
                          <span className="font-bold">⚽ {s.goals}</span>
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {data.mvp && (
                  <div className="mt-3 rounded-lg border border-[var(--color-gold)]/50 bg-[var(--color-gold)]/10 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-[var(--color-gold)] mb-1">
                      ⭐ Joueur du match
                    </p>
                    <p className="text-sm font-bold">{data.mvp.name}</p>
                  </div>
                )}

                <p className="mt-4 text-[9px] uppercase tracking-[0.2em] text-white/40">
                  Affiche générée par Benchrs
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button className="flex-1" onClick={exportImage} disabled={exporting}>
                {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Share2 className="h-4 w-4 mr-1" />}
                Partager
              </Button>
              <Button variant="outline" onClick={exportImage} disabled={exporting}>
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
