"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Crown,
  Building2,
  Users,
  ChevronRight,
  CalendarDays,
  CalendarClock,
  Trophy,
} from "lucide-react";

interface ClubRow {
  club_id: string;
  role: "president" | "comite";
  club: {
    id: string;
    name: string;
    logo_url: string | null;
  }[];
}

interface CommitteeMember {
  user_id: string;
  role: "president" | "comite";
  profile?: {
    first_name: string | null;
    last_name: string | null;
  };
}

interface MatchInfo {
  id: string;
  title: string;
  event_date: string;
  status: "upcoming" | "ongoing" | "completed" | "cancelled";
  opponent: string | null;
  score_us: number | null;
  score_them: number | null;
  match_result: "win" | "loss" | "draw" | null;
}

interface ClubTeam {
  id: string;
  name: string;
  color_primary: string | null;
  color_secondary: string | null;
  nextMatch: MatchInfo | null;
  results: MatchInfo[];
}

interface ClubData {
  id: string;
  name: string;
  logo_url: string | null;
  myRole: "president" | "comite";
  teams: ClubTeam[];
  members: CommitteeMember[];
}

function formatMatchDay(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function ResultBadge({ match }: { match: MatchInfo }) {
  const hasScore =
    match.score_us !== null && match.score_them !== null;
  const tone =
    match.match_result === "win"
      ? "bg-emerald-500/10 text-emerald-700"
      : match.match_result === "loss"
        ? "bg-red-500/10 text-red-700"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}
    >
      {hasScore ? (
        <>
          {match.score_us}–{match.score_them}
        </>
      ) : (
        "—"
      )}
      <span className="max-w-[10rem] truncate">
        {match.opponent || match.title}
      </span>
    </span>
  );
}

export default function ClubPage() {
  const { user } = useAuth();
  const { switchTeam, userRole } = useTeam();
  const router = useRouter();
  const [clubs, setClubs] = useState<ClubData[]>([]);
  const [loading, setLoading] = useState(true);

  const loadClubs = useCallback(async (userId: string) => {
    const supabase = createClient();
    const [rowsRes, createdRes] = await Promise.all([
      supabase
        .from("club_members")
        .select("club_id, role, club:clubs(id, name, logo_url)")
        .eq("user_id", userId),
      supabase.from("clubs").select("id, name, logo_url").eq("created_by", userId),
    ]);

    const rows = rowsRes.data as unknown as ClubRow[] | null;
    const created = (createdRes.data || []) as { id: string; name: string; logo_url: string | null }[];
    const seen = new Set<string>();
    const joined: { club_id: string; role: "president" | "comite"; club: { id: string; name: string; logo_url: string | null }[] }[] = [];
    for (const row of rows || []) {
      if (!seen.has(row.club_id)) {
        seen.add(row.club_id);
        joined.push(row);
      }
    }
    for (const club of created) {
      if (!seen.has(club.id)) {
        seen.add(club.id);
        joined.push({
          club_id: club.id,
          role: "president",
          club: [club],
        });
      }
    }

    if (joined.length === 0) return [];

    const result: ClubData[] = [];
    for (const row of joined as unknown as ClubRow[]) {
      const club = row.club?.[0];
      if (!club) continue;

      const [teamsRes, membersRes] = await Promise.all([
        supabase
          .from("teams")
          .select("id, name, color_primary, color_secondary")
          .eq("club_id", club.id)
          .order("name"),
        supabase
          .from("club_members")
          .select("user_id, role")
          .eq("club_id", club.id),
      ]);

      const teamRows = (teamsRes.data || []) as {
        id: string;
        name: string;
        color_primary: string | null;
        color_secondary: string | null;
      }[];

      const teamIds = teamRows.map((t) => t.id);
      const { data: events } = teamIds.length
        ? await supabase
            .from("events")
            .select("id, team_id, type, title, event_date, status, opponent, score_us, score_them, match_result")
            .in("team_id", teamIds)
            .eq("type", "match")
            .order("event_date", { ascending: true })
        : { data: [] };

      const now = new Date();
      const byTeam = new Map<string, MatchInfo[]>();
      for (const ev of (events || []) as unknown as {
        id: string;
        team_id: string;
        title: string;
        event_date: string;
        status: string;
        opponent: string | null;
        score_us: number | null;
        score_them: number | null;
        match_result: "win" | "loss" | "draw" | null;
      }[]) {
        if (!byTeam.has(ev.team_id)) byTeam.set(ev.team_id, []);
        byTeam.get(ev.team_id)!.push({
          id: ev.id,
          title: ev.title,
          event_date: ev.event_date,
          status: ev.status as MatchInfo["status"],
          opponent: ev.opponent,
          score_us: ev.score_us,
          score_them: ev.score_them,
          match_result: ev.match_result,
        });
      }

      const teams: ClubTeam[] = teamRows.map((t) => {
        const matches = byTeam.get(t.id) || [];
        const results = matches
          .filter((m) => m.status === "completed")
          .slice(-3)
          .reverse();
        const nextMatch =
          matches.find(
            (m) => m.status === "upcoming" && new Date(m.event_date) >= now
          ) || null;
        return {
          id: t.id,
          name: t.name,
          color_primary: t.color_primary,
          color_secondary: t.color_secondary,
          nextMatch,
          results,
        };
      });

      const memberRows = (membersRes.data || []) as {
        user_id: string;
        role: "president" | "comite";
      }[];
      const userIds = memberRows.map((m) => m.user_id);
      const { data: profiles } = userIds.length
        ? await supabase
            .from("profiles")
            .select("id, first_name, last_name")
            .in("id", userIds)
        : { data: [] as { id: string; first_name: string | null; last_name: string | null }[] };
      const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

      result.push({
        id: club.id,
        name: club.name,
        logo_url: club.logo_url,
        myRole: row.role,
        teams,
        members: memberRows.map((m) => ({
          ...m,
          profile: profileMap.get(m.user_id) as CommitteeMember["profile"],
        })),
      });
    }
    return result;
  }, []);

  useEffect(() => {
    if (!user) return;
    loadClubs(user.id).then((data) => {
      setClubs(data);
      setLoading(false);
    });
  }, [user, loadClubs]);

  function openTeam(teamId: string) {
    switchTeam(teamId);
    router.push(userRole ? "/" : "/calendar");
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 md:space-y-6 pb-20 md:pb-0">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Building2 className="h-6 w-6" />
          Espace club
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vue d&apos;ensemble des équipes du club (lecture seule)
        </p>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Chargement...
          </CardContent>
        </Card>
      ) : clubs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Vous n&apos;êtes membre du comité d&apos;aucun club pour le moment.
            </p>
          </CardContent>
        </Card>
      ) : (
        clubs.map((club) => (
          <Card key={club.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {club.logo_url ? (
                  <img
                    src={club.logo_url}
                    alt={club.name}
                    className="h-8 w-8 rounded-lg object-cover"
                  />
                ) : (
                  <Building2 className="h-6 w-6 text-muted-foreground" />
                )}
                {club.name}
                {club.myRole === "president" ? (
                  <span className="flex items-center gap-1 text-xs text-[var(--color-gold)] font-medium">
                    <Crown className="h-3.5 w-3.5" />
                    Président
                  </span>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">
                    Comité
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {club.teams.length} équipe(s) dans le club
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Équipes du club
                </p>
                {club.teams.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucune équipe dans ce club.
                  </p>
                ) : (
                  <div className="divide-y rounded-lg border">
                    {club.teams.map((team) => (
                      <button
                        key={team.id}
                        type="button"
                        onClick={() => openTeam(team.id)}
                        className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className="h-3 w-3 rounded-full shrink-0"
                            style={{ backgroundColor: team.color_primary || "#EAB308" }}
                          />
                          <span className="text-sm font-medium truncate">
                            {team.name}
                          </span>
                        </div>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                          Ouvrir
                          <ChevronRight className="h-3.5 w-3.5" />
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Résultats et prochains matchs
                </p>
                {club.teams.every((t) => !t.nextMatch && t.results.length === 0) ? (
                  <p className="text-sm text-muted-foreground">
                    Aucun match enregistré pour le moment.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {club.teams
                      .filter((t) => t.nextMatch || t.results.length > 0)
                      .map((team) => (
                        <div key={team.id} className="rounded-lg border p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: team.color_primary || "#EAB308" }}
                            />
                            <span className="text-sm font-medium">{team.name}</span>
                          </div>
                          <div className="space-y-2">
                            {team.nextMatch ? (
                              <div className="flex items-center gap-2 text-sm">
                                <CalendarClock className="h-4 w-4 text-[var(--color-gold)] shrink-0" />
                                <span className="text-muted-foreground">
                                  Prochain match · {formatMatchDay(team.nextMatch.event_date)}
                                </span>
                                <span className="truncate">
                                  {team.nextMatch.opponent || team.nextMatch.title}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <CalendarDays className="h-4 w-4 shrink-0" />
                                Aucun prochain match prévu
                              </div>
                            )}
                            {team.results.length > 0 && (
                              <div className="flex items-center gap-2 text-sm">
                                <Trophy className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="flex flex-wrap gap-1.5">
                                  {team.results.map((r) => (
                                    <ResultBadge key={r.id} match={r} />
                                  ))}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Comité ({club.members.length})
                </p>
                {club.members.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucun membre du comité.
                  </p>
                ) : (
                  <div className="divide-y rounded-lg border">
                    {club.members.map((m) => (
                      <div
                        key={m.user_id}
                        className="flex items-center justify-between px-3 py-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-medium truncate">
                            {m.profile?.first_name} {m.profile?.last_name}
                          </span>
                          {m.user_id === user?.id && (
                            <span className="text-xs text-muted-foreground">
                              (vous)
                            </span>
                          )}
                        </div>
                        {m.role === "president" ? (
                          <span className="flex items-center gap-1 text-xs text-[var(--color-gold)] font-medium">
                            <Crown className="h-3.5 w-3.5" />
                            Président
                          </span>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">
                            Comité
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
