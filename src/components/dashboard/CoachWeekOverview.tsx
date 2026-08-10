"use client";

import { createClient } from "@/lib/supabase/client";
import { useTeam } from "@/lib/team";
import { useRouter } from "next/navigation";
import { useQueryCache } from "@/lib/queryCache";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  CalendarCheck,
  CalendarClock,
  Dumbbell,
  Flame,
  Footprints,
  HeartPulse,
  Loader2,
  ShieldAlert,
  Trophy,
} from "lucide-react";
interface WeekEvent {
  id: string;
  type: "match" | "training";
  title: string;
  opponent: string | null;
  event_date: string;
  status: string;
}

interface WeekInjury {
  id: string;
  playerName: string;
  injury_type: string | null;
  expected_return: string | null;
}

interface WeekData {
  events: WeekEvent[];
  availability: { eventId: string; dispo: number; total: number }[];
  rpe: { eventId: string; label: string; avg: number; count: number; load: number }[];
  injuries: WeekInjury[];
  challenge: { title: string; difficulty: string; submissions: number } | null;
}

function weekRange(): { start: Date; end: Date } {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // lundi = 0
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(now.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  end.setMilliseconds(-1);
  return { start, end };
}

export function CoachWeekOverview() {
  const router = useRouter();
  const { currentTeam } = useTeam();

  const { data, loading } = useQueryCache<WeekData | null>(
    currentTeam ? `coach:week:${currentTeam.id}` : null,
    async () => {
      if (!currentTeam) return null;
      const supabase = createClient();
      const { start, end } = weekRange();

      const [{ data: events }, { data: injuries }, { data: challenge }] = await Promise.all([
        supabase
          .from("events")
          .select("id, type, title, opponent, event_date, status")
          .eq("team_id", currentTeam.id)
          .in("type", ["match", "training"])
          .in("status", ["upcoming", "ongoing"])
          .gte("event_date", start.toISOString())
          .lte("event_date", end.toISOString())
          .order("event_date", { ascending: true }),
        supabase
          .from("injuries")
          .select("id, player_id, injury_type, expected_return, player:profiles!injuries_player_id_fkey(first_name, last_name)")
          .eq("team_id", currentTeam.id)
          .eq("status", "active"),
        supabase
          .from("weekly_challenges")
          .select("id, title, difficulty")
          .eq("team_id", currentTeam.id)
          .eq("week_start", weekStartLabel())
          .maybeSingle(),
      ]);

      const weekEvents = (events || []) as WeekEvent[];
      const matchIds = weekEvents.filter((e) => e.type === "match").map((e) => e.id);
      const trainingIds = weekEvents.filter((e) => e.type === "training").map((e) => e.id);

      const [availRows, rpeRows, subsRows] = await Promise.all([
        matchIds.length
          ? supabase
              .from("match_availability")
              .select("event_id, availability")
              .eq("team_id", currentTeam.id)
              .in("event_id", matchIds)
          : Promise.resolve({ data: [] as never[] }),
        trainingIds.length
          ? supabase
              .from("session_rpe")
              .select("event_id, rpe, session_duration")
              .eq("team_id", currentTeam.id)
              .in("event_id", trainingIds)
          : Promise.resolve({ data: [] as never[] }),
        challenge
          ? supabase
              .from("challenge_submissions")
              .select("id, status")
              .eq("challenge_id", (challenge as { id: string }).id)
          : Promise.resolve({ data: [] as never[] }),
      ]);

      const availByEvent = new Map<string, { dispo: number; total: number }>();
      for (const r of (availRows.data || []) as { event_id: string; availability: string }[]) {
        const a = availByEvent.get(r.event_id) ?? { dispo: 0, total: 0 };
        a.total += 1;
        if (r.availability === "dispo") a.dispo += 1;
        availByEvent.set(r.event_id, a);
      }
      const availability = [...availByEvent.entries()].map(([eventId, a]) => ({ eventId, ...a }));

      const rpeByEvent = new Map<string, { sum: number; count: number; load: number }>();
      for (const r of (rpeRows.data || []) as { event_id: string; rpe: number; session_duration: number | null }[]) {
        const a = rpeByEvent.get(r.event_id) ?? { sum: 0, count: 0, load: 0 };
        a.sum += r.rpe;
        a.count += 1;
        a.load += r.rpe * (r.session_duration ?? 90);
        rpeByEvent.set(r.event_id, a);
      }
      const rpe = weekEvents
        .filter((e) => e.type === "training")
        .map((e) => {
          const a = rpeByEvent.get(e.id);
          return {
            eventId: e.id,
            label: new Date(e.event_date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric" }),
            avg: a ? Math.round((a.sum / a.count) * 10) / 10 : 0,
            count: a?.count ?? 0,
            load: a?.load ?? 0,
          };
        });

      const challengeRow = challenge as { id: string; title: string; difficulty: string } | null;

      return {
        events: weekEvents,
        availability,
        rpe,
        injuries: ((injuries || []) as unknown[]).map((i) => {
          const row = i as {
            id: string;
            injury_type: string | null;
            expected_return: string | null;
            player: { first_name: string; last_name: string } | null;
          };
          return {
            id: row.id,
            playerName: row.player
              ? `${row.player.first_name} ${row.player.last_name}`.trim()
              : "Joueur",
            injury_type: row.injury_type,
            expected_return: row.expected_return,
          };
        }),
        challenge: challengeRow
          ? {
              title: challengeRow.title,
              difficulty: challengeRow.difficulty,
              submissions: (subsRows.data || []).length,
            }
          : null,
      };
    },
    { ttl: 60_000 }
  );

  if (!currentTeam) return null;

  const sectionTitle = (icon: React.ReactNode, label: string) => (
    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
      {icon}
      {label}
    </div>
  );

  const isEmpty =
    data &&
    data.events.length === 0 &&
    data.injuries.length === 0 &&
    !data.challenge;

  return (
    <Card className="border-[var(--color-gold)]/40">
      <CardContent className="p-4 md:p-5 space-y-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-[var(--color-gold)]" />
          <h3 className="font-semibold">Cette semaine</h3>
          <Badge
            className="ml-auto bg-[var(--color-gold)]/20 text-[var(--color-gold)] border-[var(--color-gold)]/30"
          >
            {new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(weekRange().start)}
          </Badge>
        </div>

        {loading || !data ? (
          <div className="h-24 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : isEmpty ? (
          <p className="text-sm text-muted-foreground">
            Rien de prévu cette semaine — aucun événement, blessure ou défi en cours.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.events.length > 0 && (
              <div className="rounded-lg border p-3">
                {sectionTitle(<CalendarCheck className="h-3.5 w-3.5" />, "Événements à venir")}
                <div className="space-y-1.5">
                  {data.events.map((e) => {
                    const date = new Date(e.event_date);
                    return (
                      <button
                        key={e.id}
                        className="w-full text-left flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors"
                        onClick={() =>
                          router.push(e.type === "match" ? `/matches/${e.id}` : `/trainings/${e.id}`)
                        }
                      >
                        {e.type === "match" ? (
                          <Trophy className="h-3.5 w-3.5 shrink-0 text-[var(--color-gold)]" />
                        ) : (
                          <Dumbbell className="h-3.5 w-3.5 shrink-0 text-[var(--color-royal)]" />
                        )}
                        <span className="min-w-0 flex-1 truncate">
                          {e.type === "match" ? `Match ${e.opponent ? `vs ${e.opponent}` : ""}` : e.title}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {data.availability.length > 0 && (
              <div className="rounded-lg border p-3">
                {sectionTitle(<Footprints className="h-3.5 w-3.5" />, "Disponibilités")}
                <div className="space-y-1.5">
                  {data.availability.map((a) => {
                    const pct = a.total > 0 ? Math.round((a.dispo / a.total) * 100) : 0;
                    return (
                      <div key={a.eventId} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-28 truncate shrink-0">
                          {new Date(
                            data.events.find((e) => e.id === a.eventId)?.event_date ?? ""
                          ).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })}
                        </span>
                        <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold shrink-0">{a.dispo}/{a.total} dispo</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {data.rpe.some((r) => r.count > 0) && (
              <div className="rounded-lg border p-3">
                {sectionTitle(<Activity className="h-3.5 w-3.5" />, "Retours RPE")}
                <div className="space-y-1.5">
                  {data.rpe
                    .filter((r) => r.count > 0)
                    .map((r) => (
                      <div key={r.eventId} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground capitalize">{r.label}</span>
                        <span className="flex items-center gap-2">
                          <span className="font-bold">{r.avg}/10</span>
                          <span className="text-xs text-muted-foreground">
                            {r.count} joueur{r.count > 1 ? "s" : ""} · charge {r.load}
                          </span>
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {data.injuries.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50/40 p-3">
                {sectionTitle(<ShieldAlert className="h-3.5 w-3.5 text-red-500" />, "Blessés")}
                <div className="space-y-1.5">
                  {data.injuries.map((i) => (
                    <div key={i.id} className="text-sm">
                      <div className="flex items-center gap-2">
                        <HeartPulse className="h-3.5 w-3.5 shrink-0 text-red-500" />
                        <span className="min-w-0 flex-1 truncate font-medium">{i.playerName}</span>
                        {i.injury_type && (
                          <Badge className="bg-red-100 text-red-700 border-red-200 shrink-0">
                            {i.injury_type}
                          </Badge>
                        )}
                      </div>
                      {i.expected_return && (
                        <span className="text-xs text-muted-foreground block mt-0.5 ml-5">
                          retour {i.expected_return}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.challenge && (
              <div className="rounded-lg border p-3">
                {sectionTitle(<Flame className="h-3.5 w-3.5 text-[var(--color-gold)]" />, "Défi de la semaine")}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium min-w-0 flex-1 truncate">{data.challenge.title}</span>
                  <Badge className="shrink-0">{data.challenge.difficulty}</Badge>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {data.challenge.submissions} preuve(s)
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function weekStartLabel(): string {
  const { start } = weekRange();
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, "0");
  const d = String(start.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
