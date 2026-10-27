"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Trophy } from "lucide-react";

interface WeekendEvent {
  id: string;
  team_id: string;
  type: string;
  title: string;
  opponent: string | null;
  event_date: string;
  location: string | null;
  status: string;
  score_us: number | null;
  score_them: number | null;
  match_result: string | null;
}

function mondayOf(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDay(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
}

function formatHour(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export default function ClubWeekEndPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<WeekendEvent[]>([]);
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      if (!user) return;
      setLoading(true);

      // 1) Trouver le club de l'utilisateur
      let clubId: string | null = null;

      // Via équipe
      const { data: tms } = await supabase.from("team_members").select("team_id").eq("user_id", user.id);
      const teamIds = (tms || []).map((t) => t.team_id);
      if (teamIds.length > 0) {
        const { data: teams } = await supabase.from("teams").select("club_id").in("id", teamIds).not("club_id", "is", null);
        if (teams?.[0]?.club_id) clubId = teams[0].club_id;
      }

      // Via comité si pas trouvé
      if (!clubId) {
        const { data: cms } = await supabase.from("club_members").select("club_id").eq("user_id", user.id);
        if (cms?.[0]?.club_id) clubId = cms[0].club_id;
      }

      if (!clubId) {
        setLoading(false);
        return;
      }

      // 2) Toutes les équipes du club
      const { data: allTeams } = await supabase.from("teams").select("id, name").eq("club_id", clubId);
      const teams = (allTeams || []).map((t) => ({ id: t.id, name: t.name }));
      const names: Record<string, string> = {};
      teams.forEach((t) => (names[t.id] = t.name));
      const teamIdsList = teams.map((t) => t.id);

      if (teamIdsList.length === 0) {
        setLoading(false);
        return;
      }

      // 3) Tous les matchs de toutes ces équipes cette semaine
      const start = mondayOf(weekStart);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);

      const { data: eventsData } = await supabase
        .from("events")
        .select("id, team_id, type, title, opponent, event_date, location, status, score_us, score_them, match_result")
        .in("team_id", teamIdsList)
        .eq("type", "match")
        .neq("status", "cancelled")
        .gte("event_date", start.toISOString())
        .lt("event_date", end.toISOString())
        .order("event_date", { ascending: true });

      setEvents((eventsData || []) as WeekendEvent[]);
      setTeamNames(names);
      setLoading(false);
    }
    load();
  }, [user, weekStart]);

  function changeWeek(dir: -1 | 1) {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + dir * 7);
      return d;
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><CalendarDays className="h-5 w-5" />Week-end du club</h1>
        <p className="text-sm text-muted-foreground">Tous les matchs du club cette semaine</p>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => changeWeek(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <p className="font-semibold text-sm">Semaine du {formatDay(mondayOf(weekStart).toISOString())}</p>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => changeWeek(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <Badge variant="secondary">{events.length} match{events.length > 1 ? "s" : ""}</Badge>
      </div>

      {loading ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Chargement...</CardContent></Card>
      ) : events.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><CalendarDays className="h-8 w-8 mx-auto mb-3 text-muted-foreground" /><p className="text-muted-foreground">Aucun match cette semaine</p></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {events.map((e) => {
            const team = teamNames[e.team_id] || "";
            const hasResult = e.status === "completed" || (e.score_us !== null && e.score_them !== null);
            return (
              <Card key={e.id} className="cursor-pointer hover:bg-accent/40 transition" onClick={() => { try { localStorage.setItem("selectedTeamId", e.team_id); } catch {}; router.push(`/club/week-end/${e.id}`); }}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="default"><Trophy className="h-3 w-3 mr-1" />Match</Badge>
                      {team && <span className="text-sm font-semibold">{team}</span>}
                    </div>
                    <p className="text-sm">
                      {e.location?.toLowerCase().includes("domicile") && e.opponent ? `Domicile vs ${e.opponent}` :
                       e.location?.toLowerCase().includes("extérieur") || e.location?.toLowerCase().includes("exterieur") && e.opponent ? `Extérieur vs ${e.opponent}` :
                       e.opponent ? `vs ${e.opponent}` : e.title}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                      {formatDay(e.event_date)} • {formatHour(e.event_date)}
                      {e.location && !e.location.toLowerCase().includes("domicile") && !e.location.toLowerCase().includes("extérieur") && !e.location.toLowerCase().includes("exterieur") && <><MapPin className="h-3 w-3" />{e.location}</>}
                    </p>
                  </div>
                  {hasResult && e.score_us !== null && e.score_them !== null && (
                    <div className="text-lg font-bold tabular-nums">{e.score_us} - {e.score_them}</div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
