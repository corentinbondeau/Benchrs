"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Crown,
  Building2,
  Users,
  CalendarDays,
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
} from "lucide-react";

interface ClubRow {
  club_id: string;
  role: "president" | "comite";
  club:
    | {
        id: string;
        name: string;
        logo_url: string | null;
      }
    | {
        id: string;
        name: string;
        logo_url: string | null;
      }[]
    | null;
}

function firstClub(
  row: { id: string; name: string; logo_url: string | null } | { id: string; name: string; logo_url: string | null }[] | null | undefined
): { id: string; name: string; logo_url: string | null } | undefined {
  if (Array.isArray(row)) return row[0];
  return row ?? undefined;
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
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const diffDays = Math.round((day.getTime() - today.getTime()) / 86400000);
  const weekday = d.toLocaleDateString("fr-FR", { weekday: "short" });
  const date = d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  if (diffDays === 0) return `Aujourd'hui · ${date}`;
  if (diffDays === 1) return `Demain · ${date}`;
  return `${weekday} ${date}`;
}

function ResultDot({ match }: { match: MatchInfo }) {
  const hasScore = match.score_us !== null && match.score_them !== null;
  const win = match.match_result === "win";
  const loss = match.match_result === "loss";
  const tone = win
    ? "bg-emerald-500 text-white"
    : loss
      ? "bg-red-500 text-white"
      : "bg-muted text-muted-foreground";
  return (
    <span
      title={match.opponent || match.title}
      className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[11px] font-bold ${tone}`}
    >
      {hasScore ? `${match.score_us}-${match.score_them}` : win ? "V" : loss ? "D" : "N"}
    </span>
  );
}

function TeamCard({
  team,
  onOpen,
}: {
  team: ClubTeam;
  onOpen: (href: string) => void;
}) {
  const color = team.color_primary || "#EAB308";
  const result = team.results[team.results.length - 1];
  const FormIcon = result
    ? result.match_result === "win"
      ? TrendingUp
      : result.match_result === "loss"
        ? TrendingDown
        : Minus
    : null;
  const formTone = result
    ? result.match_result === "win"
      ? "text-emerald-600"
      : result.match_result === "loss"
        ? "text-red-600"
        : "text-muted-foreground"
    : "";

  const actions: { href: string; label: string; icon: typeof CalendarDays }[] = [
    { href: "/calendar", label: "Calendrier", icon: CalendarDays },
    { href: "/roster", label: "Effectif", icon: Users },
    { href: "/stats", label: "Stats", icon: BarChart3 },
  ];

  return (
    <div className="group relative flex flex-col gap-2.5 rounded-xl border p-3.5 text-left hover:border-foreground/20 hover:shadow-sm transition-all">
      <span
        className="absolute inset-x-0 top-0 h-1 rounded-t-xl"
        style={{ backgroundColor: color }}
      />
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="flex items-center gap-2 min-w-0">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span className="text-sm font-semibold truncate">{team.name}</span>
        </span>
        {FormIcon && <FormIcon className={`h-4 w-4 shrink-0 ${formTone}`} />}
      </div>

      <div className="space-y-1">
        {team.nextMatch ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            <span className="shrink-0 font-medium text-foreground">
              {formatMatchDay(team.nextMatch.event_date)}
            </span>
            <span className="truncate">
              {team.nextMatch.opponent || team.nextMatch.title}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            Aucun prochain match
          </div>
        )}

        <div className="flex items-center gap-2">
          {team.results.length > 0 ? (
            <>
              <Trophy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="flex items-center gap-1">
                {team.results.map((r) => (
                  <ResultDot key={r.id} match={r} />
                ))}
              </span>
              <span className="text-[11px] text-muted-foreground">
                derniers matchs
              </span>
            </>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              Aucun résultat
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 pt-0.5">
        {actions.map((action) => (
          <button
            key={action.href}
            type="button"
            onClick={() => onOpen(action.href)}
            className="flex items-center justify-center gap-1 rounded-lg border bg-background px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground/25 transition-colors"
          >
            <action.icon className="h-3.5 w-3.5 shrink-0" />
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ClubPage() {
  const { user } = useAuth();
  const { switchTeam } = useTeam();
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
    const joined: ClubRow[] = [];
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
      const club = firstClub(row.club);
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

  function openTeam(teamId: string, href: string) {
    switchTeam(teamId);
    router.push(href);
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4 md:space-y-6 pb-20 md:pb-0">
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
          <div key={club.id} className="space-y-3 md:space-y-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {club.logo_url ? (
                <img
                  src={club.logo_url}
                  alt={club.name}
                  className="h-8 w-8 rounded-lg object-cover"
                />
              ) : (
                <Building2 className="h-6 w-6 text-muted-foreground" />
              )}
              <h2 className="text-lg font-bold">{club.name}</h2>
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
              <span className="text-xs text-muted-foreground">
                · {club.teams.length} équipe(s)
              </span>
            </div>

            {club.teams.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  Aucune équipe dans ce club.
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {club.teams.map((team) => (
                  <TeamCard
                    key={team.id}
                    team={team}
                    onOpen={(href) => openTeam(team.id, href)}
                  />
                ))}
              </div>
            )}

            <div className="space-y-2 pt-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Comité ({club.members.length})
              </p>
              {club.members.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun membre du comité.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {club.members.map((m) => (
                    <span
                      key={m.user_id}
                      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm"
                    >
                      <span className="font-medium truncate">
                        {m.profile?.first_name} {m.profile?.last_name}
                      </span>
                      {m.user_id === user?.id && (
                        <span className="text-xs text-muted-foreground">(vous)</span>
                      )}
                      {m.role === "president" ? (
                        <span className="flex items-center gap-0.5 text-xs text-[var(--color-gold)] font-medium">
                          <Crown className="h-3 w-3" />
                          Président
                        </span>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          Comité
                        </Badge>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
