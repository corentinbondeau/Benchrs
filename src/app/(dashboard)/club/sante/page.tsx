"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useUserClubs } from "@/lib/useUserClubs";
import { ClubPageShell } from "@/components/club/ClubPageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HeartPulse, Users, Activity, Gavel, CalendarClock } from "lucide-react";

interface TeamHealth {
  team_id: string;
  team_name: string;
  active_players: number;
  injured: { id: string; name: string; injury_type: string | null; expected_return: string | null }[];
  attendance_pct: number | null;
  incidents: number;
  next_match: { label: string; date: string } | null;
}

const ATTENDED = ["present", "late"];
const RESPONDED = ["present", "late", "absent", "excused"];

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" }).format(
    new Date(iso)
  );
}

function asProfile(p: unknown): unknown {
  return Array.isArray(p) ? p[0] ?? null : (p ?? null);
}

export default function ClubSantePage() {
  const { user } = useAuth();
  const { clubs, loading: clubsLoading } = useUserClubs();
  const [requested, setRequested] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [teams, setTeams] = useState<TeamHealth[]>([]);

  const supabaseRef = useRef(createClient());

  const clubId =
    requested && clubs.some((c) => c.club_id === requested)
      ? requested
      : (clubs[0]?.club_id ?? null);
  const selectedClub = clubs.find((c) => c.club_id === clubId) ?? null;
  const isCommittee = selectedClub?.role != null;

  const load = useCallback(
    async (cid: string) => {
      const { data: teamsData } = await supabaseRef.current.from("teams").select("id, name").eq("club_id", cid);
      const allTeams = ((teamsData || []) as { id: string; name: string }[]).map((t) => ({
        team_id: t.id,
        team_name: t.name,
      }));
      if (allTeams.length === 0) return { teams: [] as TeamHealth[] };
      const clubTeamIds = allTeams.map((t) => t.team_id);

      // Comité = toutes les équipes ; les autres membres ne voient que leur(s) équipe(s).
      let scope = clubTeamIds;
      if (user && !isCommittee) {
        const { data: mine } = await supabaseRef.current
          .from("team_members")
          .select("team_id")
          .eq("user_id", user.id)
          .in("team_id", clubTeamIds);
        const mineIds = new Set(((mine || []) as { team_id: string }[]).map((m) => m.team_id));
        scope = clubTeamIds.filter((id) => mineIds.has(id));
        if (scope.length === 0) return { teams: [] as TeamHealth[] };
      }
      const scopeTeamNames = new Map(
        allTeams.filter((t) => scope.includes(t.team_id)).map((t) => [t.team_id, t.team_name])
      );

      // Effectif actif par équipe (joueurs, profil is_active).
      const { data: membersData } = await supabaseRef.current
        .from("team_members")
        .select("team_id, profile:profiles!inner(is_active)")
        .in("team_id", scope)
        .eq("role", "player");
      const activePerTeam = new Map<string, number>();
      for (const m of membersData || []) {
        const row = m as { team_id: string; profile: { is_active: boolean }[] };
        const prof = asProfile(row.profile) as { is_active?: boolean } | undefined;
        if (prof?.is_active) {
          activePerTeam.set(row.team_id, (activePerTeam.get(row.team_id) ?? 0) + 1);
        }
      }

      // Blessures actives par équipe (team_id direct sur injuries).
      const { data: injuriesData } = await supabaseRef.current
        .from("injuries")
        .select("id, team_id, injury_type, expected_return, profile:profiles!injuries_player_id_fkey(first_name, last_name)")
        .in("team_id", scope)
        .eq("status", "active");
      const injuredPerTeam = new Map<string, TeamHealth["injured"]>();
      for (const i of injuriesData || []) {
        const row = i as {
          id: string;
          team_id: string;
          injury_type: string | null;
          expected_return: string | null;
          profile: { first_name: string | null; last_name: string | null }[];
        };
        if (!row.team_id) continue;
        const p = asProfile(row.profile) as
          | { first_name: string | null; last_name: string | null }
          | undefined;
        const name = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() || "Joueur";
        if (!injuredPerTeam.has(row.team_id)) injuredPerTeam.set(row.team_id, []);
        injuredPerTeam.get(row.team_id)!.push({
          id: row.id,
          name,
          injury_type: row.injury_type,
          expected_return: row.expected_return,
        });
      }

      // Discipline : club_discipline (club_id + player_id) → équipe du joueur.
      const { data: disciplineData } = await supabaseRef.current
        .from("club_discipline")
        .select("player_id")
        .eq("club_id", cid);
      const { data: playerTeamsData } = await supabaseRef.current
        .from("team_members")
        .select("user_id, team_id")
        .in("team_id", scope)
        .eq("role", "player");
      const playerTeam = new Map<string, string>();
      for (const p of playerTeamsData || []) {
        const row = p as { user_id: string; team_id: string };
        if (row.user_id && !playerTeam.has(row.user_id)) playerTeam.set(row.user_id, row.team_id);
      }
      const incidentsPerTeam = new Map<string, number>();
      for (const d of disciplineData || []) {
        const pid = (d as { player_id: string }).player_id;
        const team = playerTeam.get(pid);
        if (team) incidentsPerTeam.set(team, (incidentsPerTeam.get(team) ?? 0) + 1);
      }

      // Assiduité : 10 derniers événements par équipe, % présents parmi les réponses.
      const { data: eventsData } = await supabaseRef.current
        .from("events")
        .select("id, team_id, event_date")
        .in("team_id", scope)
        .neq("status", "cancelled")
        .gte("event_date", new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString())
        .order("event_date", { ascending: false });
      const eventsByTeam = new Map<string, string[]>();
      for (const e of eventsData || []) {
        const row = e as { id: string; team_id: string; event_date: string };
        if (!eventsByTeam.has(row.team_id)) eventsByTeam.set(row.team_id, []);
        const list = eventsByTeam.get(row.team_id)!;
        if (list.length < 10) list.push(row.id);
      }
      const windowEventIds = [...eventsByTeam.values()].flat();
      const attendancePerTeam = new Map<string, { responded: number; attended: number }>();
      if (windowEventIds.length > 0) {
        const { data: attData } = await supabaseRef.current
          .from("attendances")
          .select("event_id, status")
          .in("event_id", windowEventIds)
          .in("status", RESPONDED);
        for (const a of attData || []) {
          const row = a as { event_id: string; status: string };
          const teamOf = [...eventsByTeam.entries()].find(([, ids]) => ids.includes(row.event_id))?.[0];
          if (!teamOf) continue;
          const acc = attendancePerTeam.get(teamOf) ?? { responded: 0, attended: 0 };
          acc.responded += 1;
          if (ATTENDED.includes(row.status)) acc.attended += 1;
          attendancePerTeam.set(teamOf, acc);
        }
      }

      // Prochain match par équipe.
      const { data: nextData } = await supabaseRef.current
        .from("events")
        .select("id, team_id, title, opponent, event_date")
        .in("team_id", scope)
        .eq("type", "match")
        .in("status", ["upcoming", "ongoing"])
        .gte("event_date", new Date().toISOString())
        .order("event_date", { ascending: true });
      const nextMatch = new Map<string, { label: string; date: string }>();
      for (const e of nextData || []) {
        const row = e as { id: string; team_id: string; title: string; opponent: string | null; event_date: string };
        if (!nextMatch.has(row.team_id) && scopeTeamNames.has(row.team_id)) {
          nextMatch.set(row.team_id, {
            label: row.opponent?.trim() || row.title.trim() || "Match",
            date: row.event_date,
          });
        }
      }

      const rows: TeamHealth[] = [...scopeTeamNames.keys()].map((team_id) => {
        const att = attendancePerTeam.get(team_id);
        return {
          team_id,
          team_name: scopeTeamNames.get(team_id)!,
          active_players: activePerTeam.get(team_id) ?? 0,
          injured: injuredPerTeam.get(team_id) ?? [],
          attendance_pct: att && att.responded > 0 ? Math.round((att.attended / att.responded) * 100) : null,
          incidents: incidentsPerTeam.get(team_id) ?? 0,
          next_match: nextMatch.get(team_id) ?? null,
        };
      });
      rows.sort((a, b) => a.team_name.localeCompare(b.team_name));
      return { teams: rows };
    },
    [user, isCommittee]
  );

  useEffect(() => {
    if (!clubId) return;
    load(clubId).then((res) => {
      setTeams(res.teams);
      setPageLoading(false);
    });
  }, [clubId, load]);

  function onChangeClub(id: string) {
    setRequested(id);
    setPageLoading(true);
  }

  return (
    <ClubPageShell
      title="Santé de la catégorie"
      subtitle="Effectifs, blessures, assiduité et discipline par équipe"
      clubs={clubs}
      clubId={clubId}
      onChangeClub={onChangeClub}
      loading={clubsLoading || pageLoading}
      comiteOnly
    >
      <div className="grid gap-4 md:grid-cols-2">
        {teams.map((t) => (
          <Card key={t.team_id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t.team_name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg border p-2">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="h-3 w-3" /> Effectif actif
                  </p>
                  <p className="text-lg font-bold">{t.active_players}</p>
                </div>
                <div className="rounded-lg border p-2">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Activity className="h-3 w-3" /> Assiduité
                  </p>
                  <p className="text-lg font-bold">{t.attendance_pct != null ? `${t.attendance_pct}%` : "—"}</p>
                </div>
                <div className="rounded-lg border p-2">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <HeartPulse className="h-3 w-3" /> Blessés
                  </p>
                  <p className="text-lg font-bold">{t.injured.length}</p>
                </div>
                <div className="rounded-lg border p-2">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Gavel className="h-3 w-3" /> Incidents
                  </p>
                  <p className="text-lg font-bold">{t.incidents}</p>
                </div>
              </div>

              {t.injured.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50/50 p-3">
                  <p className="text-xs font-semibold mb-1 flex items-center gap-1">
                    <HeartPulse className="h-3 w-3 text-red-500" />
                    Blessés actuellement
                  </p>
                  <ul className="space-y-0.5">
                    {t.injured.map((i) => (
                      <li key={i.id} className="text-sm flex flex-wrap items-center gap-1">
                        {i.name}
                        {i.injury_type && <Badge variant="outline">{i.injury_type}</Badge>}
                        {i.expected_return && (
                          <span className="text-xs text-muted-foreground">
                            retour : {formatDate(i.expected_return)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {t.next_match && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <CalendarClock className="h-3 w-3" />
                  Prochain match : <strong>{t.next_match.label}</strong> · {formatDate(t.next_match.date)}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
        {teams.length === 0 && (
          <Card className="md:col-span-2">
            <CardContent className="py-12 text-center">
              <HeartPulse className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground">Aucune équipe à afficher pour ce club.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </ClubPageShell>
  );
}