"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { useUserClubs } from "@/lib/useUserClubs";
import { ClubPageShell } from "@/components/club/ClubPageShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(
    new Date(iso)
  );
}

function formatHour(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

const RESULT_LABEL: Record<"win" | "loss" | "draw", string> = { win: "V", loss: "D", draw: "N" };

export default function ClubWeekEndPage() {
  const { user } = useAuth();
  const { clubs, loading: clubsLoading } = useUserClubs();
  const [requested, setRequested] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [events, setEvents] = useState<WeekendEvent[]>([]);
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [canSend, setCanSend] = useState(false);
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const [sending, setSending] = useState(false);

  const supabaseRef = useRef(createClient());

  const clubId =
    requested && clubs.some((c) => c.club_id === requested)
      ? requested
      : (clubs[0]?.club_id ?? null);
  const selectedClub = clubs.find((c) => c.club_id === clubId) ?? null;
  const isCommittee = selectedClub?.role != null;

  const load = useCallback(
    async (cid: string, winStart: Date) => {
      const { data: teamsData } = await supabaseRef.current.from("teams").select("id, name").eq("club_id", cid);
      const teams = ((teamsData || []) as { id: string; name: string }[]).map((t) => t.id);
      const names = Object.fromEntries(
        ((teamsData || []) as { id: string; name: string }[]).map((t) => [t.id, t.name])
      );
      if (teams.length === 0) return { events: [] as WeekendEvent[], teamNames: names, canSend: false };

      const start = mondayOf(winStart);
      const end = new Date(start.getTime() + 7 * 24 * 3600 * 1000);

      const { data: eventsData } = await supabaseRef.current
        .from("events")
        .select("id, team_id, type, title, opponent, event_date, location, status, score_us, score_them, match_result")
        .in("team_id", teams)
        .gte("event_date", start.toISOString())
        .lt("event_date", end.toISOString())
        .order("event_date", { ascending: true });
      const rows = ((eventsData || []) as Record<string, unknown>[]).map((e) => ({
        id: e.id as string,
        team_id: e.team_id as string,
        type: (e.type as "match") ?? "match",
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
        const { data: mine } = await supabaseRef.current
          .from("team_members")
          .select("team_id")
          .eq("user_id", user.id)
          .in("team_id", teams)
          .in("role", ["coach", "owner"]);
        canSend = (mine?.length ?? 0) > 0;
      }

      return { events: rows, teamNames: names, canSend };
    },
    [user]
  );

  useEffect(() => {
    if (!clubId) return;
    load(clubId, weekStart).then((res) => {
      setEvents(res.events);
      setTeamNames(res.teamNames);
      setCanSend(res.canSend);
      setPageLoading(false);
    });
  }, [clubId, weekStart, load]);

  function onChangeClub(id: string) {
    setRequested(id);
    setPageLoading(true);
  }

  function changeWeek(dir: -1 | 1) {
    setWeekStart((prev) => new Date(prev.getTime() + dir * 7 * 24 * 3600 * 1000));
    setPageLoading(true);
  }

  async function sendRecap() {
    if (!clubId) return;
    setSending(true);
    try {
      const res = await authFetch("/api/clubs/weekend-recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clubId,
          weekStart: `${mondayOf(new Date()).toISOString().slice(0, 10)}`,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Envoi impossible");
        return;
      }
      toast.success("Récap du week-end envoyé aux familles");
    } finally {
      setSending(false);
    }
  }

  const matches = events.filter((e) => e.type === "match");
  const trainings = events.filter((e) => e.type === "training");
  const wins = matches.filter((m) => m.status === "completed" && m.match_result === "win").length;

  return (
    <ClubPageShell
      title="Le week-end du club"
      subtitle="Tous les matchs et entraînements des équipes"
      clubs={clubs}
      clubId={clubId}
      onChangeClub={onChangeClub}
      loading={clubsLoading || pageLoading}
      actions={
        (isCommittee || canSend) &&
        clubId && (
          <Button size="sm" onClick={sendRecap} disabled={sending}>
            <Send className="h-4 w-4 mr-1" />
            {sending ? "Envoi…" : "Envoyer aux familles"}
          </Button>
        )
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => changeWeek(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <p className="font-semibold text-sm">
              Semaine du {formatDay(mondayOf(weekStart).toISOString())}
            </p>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => changeWeek(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-1 text-xs">
            <Badge variant="secondary">
              {matches.length} match{matches.length > 1 ? "s" : ""}
            </Badge>
            <Badge variant="outline">
              {trainings.length} entraînement{trainings.length > 1 ? "s" : ""}
            </Badge>
            {wins > 0 && <Badge variant="default">{wins} victoire{wins > 1 ? "s" : ""}</Badge>}
          </div>
        </div>

        {events.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <CalendarDays className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground">Aucun événement cette semaine.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {events.map((e) => {
              const isMatch = e.type === "match";
              const team = teamNames[e.team_id] ?? "Équipe";
              return (
                <Card key={e.id}>
                  <CardContent className="p-4 flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {isMatch ? (
                          <Badge variant="default">
                            <Trophy className="h-3 w-3 mr-1" />
                            Match
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Entraînement</Badge>
                        )}
                        <span className="text-sm font-semibold">{team}</span>
                        {e.status === "cancelled" && <Badge variant="destructive">Annulé</Badge>}
                      </div>
                      <p className="text-sm mt-1">
                        {isMatch && e.opponent ? `Face à ${e.opponent}` : e.title}
                      </p>
                      <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                        {formatDay(e.event_date)} · {formatHour(e.event_date)}
                        {e.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {e.location}
                          </span>
                        )}
                      </p>
                    </div>
                    {isMatch && e.status === "completed" && e.score_us != null && (
                      <div className="flex items-center gap-2">
                        {e.match_result && (
                          <Badge
                            variant={e.match_result === "win" ? "default" : e.match_result === "draw" ? "secondary" : "destructive"}
                          >
                            {RESULT_LABEL[e.match_result]}
                          </Badge>
                        )}
                        <span className="font-bold tabular-nums">
                          {e.score_us} - {e.score_them ?? 0}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </ClubPageShell>
  );
}