"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { createClient } from "@/lib/supabase/client";
import { useTeam } from "@/lib/team";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { currentSeasonLabel } from "@/lib/goals";

interface CardStats {
  firstName: string;
  lastName: string;
  position: string | null;
  shirtNumber: number | null;
  vma: number | null;
  goals: number;
  assists: number;
  matches: number;
  minutes: number;
  attendanceRate: number;
  motm: number;
}

async function fetchCardStats(teamId: string, playerId: string): Promise<CardStats> {
  const supabase = createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, position, shirt_number, vma")
    .eq("id", playerId)
    .maybeSingle();

  const { data: matchStats } = await supabase
    .from("match_stats")
    .select("goals, assists, minutes_played")
    .eq("team_id", teamId)
    .eq("player_id", playerId);

  const { data: trainings } = await supabase
    .from("events")
    .select("id")
    .eq("team_id", teamId)
    .eq("type", "training");

  const trainingIds = (trainings || []).map((t) => t.id);
  const { data: atts } = trainingIds.length
    ? await supabase.from("attendances").select("status").eq("user_id", playerId).in("event_id", trainingIds)
    : { data: [] as never[] };

  const { data: motmVotes } = await supabase
    .from("motm_votes")
    .select("candidate_id")
    .eq("team_id", teamId)
    .eq("candidate_id", playerId);

  const attList = atts as { status: string }[];
  const attended = attList.filter((a) => a.status === "present" || a.status === "late").length;

  const prof = profile as {
    first_name: string;
    last_name: string;
    position: string | null;
    shirt_number: number | null;
    vma: number | null;
  } | null;

  return {
    firstName: prof?.first_name || "Joueur",
    lastName: prof?.last_name || "",
    position: prof?.position || null,
    shirtNumber: prof?.shirt_number ?? null,
    vma: prof?.vma ?? null,
    goals: (matchStats || []).reduce((s, m) => s + (m.goals || 0), 0),
    assists: (matchStats || []).reduce((s, m) => s + (m.assists || 0), 0),
    matches: (matchStats || []).length,
    minutes: (matchStats || []).reduce((s, m) => s + (m.minutes_played || 0), 0),
    attendanceRate: attList.length > 0 ? Math.round((attended / attList.length) * 100) : 0,
    motm: (motmVotes || []).length,
  };
}

export function PlayerPaniniCard({
  playerId,
  teamId,
  open,
  onOpenChange,
}: {
  playerId: string;
  teamId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { currentTeam } = useTeam();
  const [stats, setStats] = useState<CardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    return fetchCardStats(teamId, playerId);
  }, [teamId, playerId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadData()
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, loadData]);

  async function exportImage() {
    if (!cardRef.current || !stats) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `carte-${stats.firstName.toLowerCase()}-${stats.lastName.toLowerCase()}.png`, {
        type: "image/png",
      });
      const shareData = {
        files: [file],
        title: `Carte ${stats.firstName} ${stats.lastName}`,
        text: `La carte de ${stats.firstName} ${stats.lastName} — ${currentTeam?.name ?? ""}`,
      };
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share(shareData);
      } else {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = file.name;
        a.click();
      }
      toast.success("Carte partagée");
    } catch (e) {
      console.error("[panini] export error:", e);
      toast.error("Partage non disponible sur cet appareil");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Carte joueur</DialogTitle>
        </DialogHeader>

        {loading || !stats ? (
          <div className="h-96 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div
              ref={cardRef}
              className="relative mx-auto w-72 overflow-hidden rounded-2xl bg-gradient-to-b from-[#0B1E3A] via-[#142C55] to-[#0B1E3A] text-white shadow-xl ring-4 ring-[var(--color-gold)]/60"
            >
              <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_30%_20%,#F6C453,transparent_60%)]" />
              <div className="relative p-4">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-[var(--color-gold)]">
                  <span>{currentTeam?.name || "Benchrs"}</span>
                  <span>{currentSeasonLabel().replace("-", "/")}</span>
                </div>

                <div className="my-3 flex items-center justify-center">
                  <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-gold)] to-amber-500 text-4xl font-black text-[var(--color-navy)] shadow-inner">
                    {stats.shirtNumber ?? "•"}
                  </div>
                </div>

                <div className="text-center">
                  <p className="text-lg font-black leading-tight">
                    {stats.firstName} {stats.lastName}
                  </p>
                  <p className="text-xs uppercase tracking-widest text-[var(--color-gold)] mt-0.5">
                    {stats.position || "Joueur"}
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-4 gap-1.5 text-center">
                  {[
                    { label: "Buts", value: stats.goals },
                    { label: "Passes", value: stats.assists },
                    { label: "Matchs", value: stats.matches },
                    { label: "MVP", value: stats.motm },
                  ].map((s) => (
                    <div key={s.label} className="rounded-lg bg-white/10 px-1 py-2">
                      <p className="text-lg font-black">{s.value}</p>
                      <p className="text-[9px] uppercase tracking-wide text-white/60">{s.label}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 space-y-2">
                  {[
                    { label: "Attaque", value: Math.min(100, stats.goals * 5) },
                    { label: "Créativité", value: Math.min(100, stats.assists * 10) },
                    {
                      label: "Physique",
                      value: stats.vma ? Math.min(100, Math.round((stats.vma / 20) * 100)) : Math.min(100, Math.round(stats.minutes / 1500 * 100)),
                    },
                    { label: "Assiduité", value: stats.attendanceRate },
                  ].map((b) => (
                    <div key={b.label}>
                      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-white/70 mb-0.5">
                        <span>{b.label}</span>
                        <span>{Math.min(99, b.value)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/15 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[var(--color-gold)] to-amber-400"
                          style={{ width: `${Math.min(100, b.value)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 text-center text-[9px] uppercase tracking-[0.2em] text-white/40">
                  {stats.minutes.toLocaleString("fr-FR")} minutes jouées
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button className="flex-1" onClick={exportImage} disabled={exporting}>
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Share2 className="h-4 w-4 mr-1" />
                )}
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
