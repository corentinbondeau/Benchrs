"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Save, Share2, Shield, User, ClipboardList, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Event, Formation } from "@/types";

interface LineupEntry {
  id: string;
  player_id: string;
  position_label: string | null;
  is_starter: boolean;
  profile?: { id: string; first_name: string; last_name: string; shirt_number: number | null; position: string | null };
}

interface FormationData {
  positions: { player_id: string; x: number; y: number; label: string }[];
  captain_id?: string;
}

type MatchEvent = Event & { meeting_time: string | null };

export default function FeuilleMatchPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { currentTeam, userRole } = useTeam();
  const isCoach = userRole === "coach" || userRole === "owner";
  const matchId = params.id as string;

  const [match, setMatch] = useState<MatchEvent | null>(null);
  const [formation, setFormation] = useState<Formation | null>(null);
  const [lineups, setLineups] = useState<LineupEntry[]>([]);
  const [referee, setReferee] = useState("");
  const [delegate, setDelegate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const [matchRes, formRes, lineupsRes] = await Promise.all([
      supabase.from("events").select("*").eq("id", matchId).eq("team_id", currentTeam!.id).single(),
      supabase
        .from("formations")
        .select("*")
        .eq("event_id", matchId)
        .eq("team_id", currentTeam!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("match_lineups")
        .select("*, profile:profiles!match_lineups_player_id_fkey(id, first_name, last_name, shirt_number, position)")
        .eq("event_id", matchId)
        .eq("team_id", currentTeam!.id),
    ]);
    return {
      match: matchRes.data as MatchEvent | null,
      formation: formRes.data as Formation | null,
      lineups: (lineupsRes.data || []) as LineupEntry[],
    };
  }, [matchId, currentTeam]);

  useEffect(() => {
    if (!currentTeam) return;
    loadData().then((res) => {
      setMatch(res.match);
      setFormation(res.formation);
      setLineups(res.lineups);
      setReferee(res.match?.referee ?? "");
      setDelegate(res.match?.delegate ?? "");
      setLoading(false);
    });
  }, [currentTeam, loadData]);

  async function saveOfficials() {
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("events")
        .update({ referee: referee.trim() || null, delegate: delegate.trim() || null })
        .eq("id", matchId);
      if (error) throw error;
      toast.success("Officiels enregistrés");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!currentTeam) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chargement de l&apos;équipe...</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!match) return null;

  const fd = formation?.formation_data as FormationData | null;
  const positions = fd?.positions || [];
  const captainId = fd?.captain_id;
  const starters: LineupEntry[] = [];
  for (const pos of positions) {
    const player = lineups.find((l) => l.player_id === pos.player_id)?.profile;
    if (player) {
      starters.push({ id: pos.player_id, player_id: pos.player_id, position_label: pos.label, is_starter: true, profile: player });
    }
  }
  const subs = lineups.filter((l) => !l.is_starter);
  const startersWithProfile = starters.length > 0 ? starters : lineups.filter((l) => l.is_starter);

  const eventDate = new Date(match.event_date);
  const dateStr = eventDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeStr = eventDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  const compose = (row: LineupEntry) => {
    const isCapt = row.player_id === captainId;
    return `  ${row.profile?.shirt_number ?? "?"} — ${row.profile?.first_name} ${row.profile?.last_name}${row.position_label ? ` (${row.position_label})` : ""}${isCapt ? " (C)" : ""}`;
  };

  const text = [
    `📋 Feuille de match — ${currentTeam.name}`,
    match.opponent ? `⚽ ${currentTeam.name} vs ${match.opponent}` : `⚽ ${match.title}`,
    `📅 ${dateStr} à ${timeStr}`,
    match.location ? `📍 ${match.location}` : "",
    match.meeting_time ? `⏰ Rendez-vous : ${match.meeting_time.slice(0, 5)}` : "",
    referee ? `👨‍⚖️ Arbitre : ${referee}` : "",
    delegate ? `🪪 Délégué : ${delegate}` : "",
    `🟢 Composition${formation ? ` (${formation.name})` : ""} :`,
    ...(startersWithProfile.length > 0 ? startersWithProfile.map(compose) : ["  (Aucune composition enregistrée)"]),
    "",
    subs.length > 0 ? `🟡 Remplaçants :\n${subs.map(compose).join("\n")}` : "",
    "",
    "Partagé depuis Benchrs ⚽",
  ]
    .filter(Boolean)
    .join("\n");

  async function shareWhatsApp() {
    const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Texte copié — colle-le dans WhatsApp");
    } catch {
      /* ignore */
    }
    window.open(waUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <button
        onClick={() => router.push(`/matches/${matchId}`)}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour au match
      </button>

      <Card className="overflow-hidden border-0">
        <div className="bg-[var(--color-navy)] p-5 text-white">
          <div className="flex items-center gap-2 text-xs text-white/70">
            <ClipboardList className="h-3.5 w-3.5" />
            FEUILLE DE MATCH
          </div>
          <h1 className="mt-1 text-xl font-bold">
            {match.opponent ? `${currentTeam.name} vs ${match.opponent}` : match.title}
          </h1>
          <p className="mt-1 text-sm text-white/80 capitalize">{dateStr} · {timeStr}</p>
          {match.location && <p className="text-sm text-white/80">📍 {match.location}</p>}
        </div>
        <CardContent className="p-5 space-y-4">
          {isCoach && (
            <div className="space-y-2 rounded-lg bg-muted/40 p-3">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <ClipboardList className="h-4 w-4 text-[var(--color-gold)]" />
                Officiels du match
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Arbitre</Label>
                  <Input value={referee} onChange={(e) => setReferee(e.target.value)} placeholder="Nom de l'arbitre" className="text-sm h-8 mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Délégué</Label>
                  <Input value={delegate} onChange={(e) => setDelegate(e.target.value)} placeholder="Nom du délégué" className="text-sm h-8 mt-1" />
                </div>
              </div>
              <Button size="sm" className="h-8 text-xs" onClick={saveOfficials} disabled={saving}>
                {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                Enregistrer
              </Button>
            </div>
          )}

          {(!isCoach && (match.referee || match.delegate)) && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              {match.referee && <p className="flex items-center gap-1.5"><User className="h-4 w-4 text-muted-foreground" /> Arbitre : {match.referee}</p>}
              {match.delegate && <p className="flex items-center gap-1.5"><User className="h-4 w-4 text-muted-foreground" /> Délégué : {match.delegate}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-[var(--color-royal)]" />
            Titulaires{formation ? ` — ${formation.name}` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {startersWithProfile.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Aucune composition enregistrée. Renseigne-la depuis l&apos;onglet Tactiques → Feuillet Match.
            </p>
          ) : (
            <div className="space-y-1">
              {startersWithProfile.map((l) => {
                const isCapt = l.player_id === captainId;
                return (
                  <div key={l.player_id} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5 text-sm">
                    <span className="font-bold text-xs w-6 text-center">{l.profile?.shirt_number ?? "?"}</span>
                    <span className="flex-1 truncate">
                      {l.profile?.first_name} {l.profile?.last_name} {isCapt && <span className="text-xs text-yellow-600 font-semibold">(C)</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">{l.position_label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4 text-[var(--color-gold)]" />
            Remplaçants ({subs.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {subs.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucun remplaçant enregistré.</p>
          ) : (
            <div className="space-y-1">
              {subs.map((l) => (
                <div key={l.id} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5 text-sm">
                  <span className="font-bold text-xs w-6 text-center">{l.profile?.shirt_number ?? "?"}</span>
                  <span className="flex-1 truncate">{l.profile?.first_name} {l.profile?.last_name}</span>
                  <span className="text-xs text-muted-foreground">{l.position_label}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Button
        className="w-full bg-[#25D366] hover:bg-[#1fb355] text-white font-semibold h-11"
        onClick={shareWhatsApp}
      >
        <Share2 className="h-4 w-4 mr-2" />
        Partager sur WhatsApp
      </Button>
    </div>
  );
}
