"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Send, Trophy } from "lucide-react";
import { toast } from "sonner";

interface WeekendEvent {
  id: string;
  team_id: string;
  type: "match" | "training";
  title: string;
  opponent: string | null;
  event_date: string;
  location: string | null;
  status: "upcoming" | "ongoing" | "completed" | "cancelled";
  score_us: number | null;
  score_them: number | null;
  match_result: "win" | "loss" | "draw" | null;
}

function mondayOf(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function formatDay(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
}

function formatHour(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

const RESULT_LABEL: Record<"win" | "loss" | "draw", string> = { win: "V", loss: "D", draw: "N" };

export default function ClubWeekEndPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [pageLoading, setPageLoading] = useState(true);
  const [events, setEvents] = useState<WeekendEvent[]>([]);
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [canSend, setCanSend] = useState(false);
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const [sending, setSending] = useState(false);
  const [clubId, setClubId] = useState<string | null>(null);
  const [userTeamId, setUserTeamId] = useState<string | null>(null);

  const supabaseRef = useRef(createClient());

  useEffect(() => {
    async function resolve() {
      if (!user) return;
      // Récupérer toutes les équipes de l'utilisateur
      const { data: tms } = await supabaseRef.current.from("team_members").select("team_id").eq("user_id", user.id);
      const teamIds = (tms || []).map((t) => t.team_id);
      if (teamIds.length === 0) {
        setPageLoading(false);
        return;
      }
      setUserTeamId(teamIds[0]);
      const { data: teams } = await supabaseRef.current.from("teams").select("id, club_id").in("id", teamIds).not("club_id", "is", null);
      if (teams && teams.length > 0 && teams[0].club_id) {
        setClubId(teams[0].club_id);
        return;
      }
      // Chercher par club_members
      const { data: cms } = await supabaseRef.current.from("club_members").select("club_id").eq("user_id", user.id);
      if (cms && cms.length > 0) {
        setClubId(cms[0].club_id);
        return;
      }
      setPageLoading(false);
    }
    resolve();
  }, [user]);

  const load = useCallback(
    async (cid: string, winStart: Date) => {
      const { data: allTeams } = await supabaseRef.current.from("teams").select("id, name").eq("club_id", cid);
      const teams = (allTeams || []).map((t) => t.id);
      const names = Object.fromEntries((allTeams || []).map((t) => [t.id, t.name]));
      if (teams.length === 0) return { events: [] as WeekendEvent[], teamNames: names, canSend: false };

      const start = mondayOf(winStart);
      const end = new Date(start.getTime() + 7 * 24 * 3600 * 1000);

      const { data: eventsData } = await supabaseRef.current
        .from("events")
        .select("id, team_id, type, title, opponent, event_date, location, status, score_us, score_them, match_result")
        .in("team_id", teams)
        .eq("type", "match")
        .neq("status", "cancelled")
        .gte("event_date", start.toISOString())
        .lt("event_date", end.toISOString())
        .order("event_date", { ascending: true });

      const rows = ((eventsData || []) as Record<string, unknown>[]).map((e) => ({
        id: e.id as string,
        team_id: e.team_id as string,
        type: "match" as const,
        title: e.title as string,
        opponent: (e.opponent as string | null) ?? null,
        event_date: e.event_date as string,
        location: (e.location as string | null) ?? null,
        status: (e.status as WeekendEvent["status"]) ?? "upcoming",
        score_us: (e.score_us as number | null) ?? null,
        score_them: (e.score_them as number | null) ?? null,
        match_result: (e.match_result as WeekendEvent["match_result"]) ?? null,
      }));

      let canSend = false;
      if (user) {
        const { data: cms } = await supabaseRef.current.from("club_members").select("club_id").eq("user_id", user.id).eq("club_id", cid);
        if (cms && cms.length > 0) canSend = true;
        if (!canSend) {
          const { data: mine } = await supabaseRef.current.from("team_members").select("role").eq("user_id", user.id).in("team_id", teams).in("role", ["coach", "owner"]);
          canSend = (mine?.length ?? 0) > 0;
        }
      }

      return { events: rows, teamNames: names, canSend };
    },
    [user]
  );

  useEffect(() => {
    if (!clubId) { setPageLoading(false); return; }
    setPageLoading(true);
    load(clubId, weekStart).then((res) => {
      setEvents(res.events);
      setTeamNames(res.teamNames);
      setCanSend(res.canSend);
      setPageLoading(false);
    });
  }, [clubId, weekStart, load]);

  function changeWeek(dir: -1 | 1) {
    setWeekStart((prev) => new Date(prev.getTime() + dir * 7 * 24 * 3600 * 1000));
    setPageLoading(true);
  }

  async function sendRecap() {
    if (!clubId) return;
    setSending(true);
    try {
      const res = await authFetch("/api/clubs/weekend-recap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clubId, weekStart: `${mondayOf(new Date()).toISOString().slice(0, 10)}` }) });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) { toast.error(data.error ?? "Envoi impossible"); return; }
      toast.success("Récap du week-end envoyé aux familles");
    } finally {
      setSending(false);
    }
  }

  const matches = events.filter((e) => e.type === "match");

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><CalendarDays className="h-5 w-5" />Week-end du club</h1>
          <p className="text-sm text-muted-foreground">Tous les matchs de toutes les équipes</p>
        </div>
        {canSend && clubId && (
          <Button size="sm" onClick={sendRecap} disabled={sending}><Send className="h-4 w-4 mr-1" />{sending ? "Envoi…" : "Envoyer aux familles"}</Button>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => changeWeek(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <p className="font-semibold text-sm">Semaine du {formatDay(mondayOf(weekStart).toISOString())}</p>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => changeWeek(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <Badge variant="secondary">{matches.length} match{matches.length > 1 ? "s" : ""}</Badge>
      </div>

      {pageLoading ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Chargement...</CardContent></Card>
      ) : !clubId ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Aucun club trouvé</CardContent></Card>
      ) : events.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><CalendarDays className="h-8 w-8 mx-auto mb-3 text-muted-foreground" /><p className="text-muted-foreground">Aucun match cette semaine</p></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {events.map((e) => {
            const team = teamNames[e.team_id] ?? "Équipe";
            const hasResult = e.status === "completed" || (e.score_us != null && e.score_them != null);
            return (
              <Card key={e.id} className="cursor-pointer hover:bg-accent/40 transition" onClick={() => { try { localStorage.setItem("selectedTeamId", e.team_id); } catch {}; router.push(`/club/week-end/${e.id}`); }}>
                <CardContent className="p-4 flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="default"><Trophy className="h-3 w-3 mr-1" />Match</Badge>
                      <span className="text-sm font-semibold">{team}</span>
                    </div>
                    <p className="text-sm mt-1">
                      {e.opponent ? (e.location?.toLowerCase().includes("domicile") ? `Domicile vs ${e.opponent}` : e.location?.toLowerCase().includes("extérieur") ? `Extérieur vs ${e.opponent}` : `vs ${e.opponent}`) : e.title}
                    </p>
                    <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                      {formatDay(e.event_date)} · {formatHour(e.event_date)}
                      {e.location && !e.location.toLowerCase().includes("domicile") && !e.location.toLowerCase().includes("extérieur") && !e.location.toLowerCase().includes("exterieur") && (
                        <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{e.location}</span>
                      )}
                    </p>
                  </div>
                  {hasResult && e.score_us != null && (
                    <div className="flex items-center gap-2">
                      <span className="font-bold tabular-nums">{e.score_us} - {e.score_them ?? 0}</span>
                    </div>
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
