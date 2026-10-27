"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, Clock, MapPin, Trophy, Users } from "lucide-react";

export default function ClubMatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const matchId = params.id as string;
  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<any>(null);
  const [teamName, setTeamName] = useState<string>("");
  const [events, setEvents] = useState<any[]>([]);
  const [players, setPlayers] = useState<Record<string, any>>({});

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: matchData } = await supabase.from("events").select("*").eq("id", matchId).maybeSingle();
      if (!matchData) {
        setLoading(false);
        return;
      }
      setMatch(matchData);

      const { data: team } = await supabase.from("teams").select("name").eq("id", matchData.team_id).maybeSingle();
      setTeamName(team?.name || "");

      const { data: evs } = await supabase
        .from("match_events")
        .select("*")
        .eq("event_id", matchId)
        .neq("event_type", "substitution")
        .order("minute", { ascending: true });
      setEvents(evs || []);

      const playerIds = Array.from(new Set((evs || []).map((e) => e.player_id).filter(Boolean)));
      if (playerIds.length > 0) {
        const { data: profs } = await supabase.from("profiles").select("id, first_name, last_name, shirt_number").in("id", playerIds);
        const map: Record<string, any> = {};
        (profs || []).forEach((p) => (map[p.id] = p));
        setPlayers(map);
      }

      setLoading(false);
    }
    load();
  }, [matchId]);

  if (loading) return <div className="p-6 text-center text-muted-foreground">Chargement...</div>;
  if (!match) return <div className="p-6 text-center text-muted-foreground">Match introuvable</div>;

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  function fmtTime(d: string) {
    return new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }

  function eventLabel(ev: any) {
    const p = players[ev.player_id];
    const name = p ? `${p.first_name} ${p.last_name}` : "";
    if (ev.event_type === "goal") return `⚽ But - ${name}`;
    if (ev.event_type === "own_goal") return `⚽ CSC - ${name}`;
    if (ev.event_type === "opponent_own_goal") return `⚽ But adverse`;
    if (ev.event_type === "yellow_card") return `🟨 Carton jaune - ${name}`;
    if (ev.event_type === "red_card") return `🟥 Carton rouge - ${name}`;
    if (ev.event_type === "injury") return `🩹 Blessure - ${name}`;
    return ev.event_type;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
      <Button variant="ghost" size="sm" onClick={() => router.back()}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Retour
      </Button>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <Badge variant="default"><Trophy className="h-3 w-3 mr-1" />Match</Badge>
            <span className="text-sm text-muted-foreground">{teamName}</span>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold">
              {match.opponent ? (match.location?.toLowerCase().includes("domicile") ? `Domicile vs ${match.opponent}` : match.location?.toLowerCase().includes("extérieur") ? `Extérieur vs ${match.opponent}` : `vs ${match.opponent}`) : match.title}
            </p>
            {(match.score_us != null && match.score_them != null) && (
              <p className="text-4xl font-bold mt-2">{match.score_us} - {match.score_them}</p>
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><Calendar className="h-4 w-4" />{fmtDate(match.event_date)}</span>
            <span className="flex items-center gap-1"><Clock className="h-4 w-4" />{fmtTime(match.event_date)}</span>
            {match.location && <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{match.location}</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h2 className="font-semibold mb-3 flex items-center gap-2"><Users className="h-4 w-4" />Événements du match</h2>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucun événement</p>
          ) : (
            <div className="space-y-2">
              {events.map((ev) => (
                <div key={ev.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                  <span className="w-10 text-center text-sm font-semibold">{ev.minute ? `${ev.minute}'` : "-"}</span>
                  <span className="flex-1 text-sm">{eventLabel(ev)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
