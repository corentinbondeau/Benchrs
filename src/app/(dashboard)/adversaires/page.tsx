"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTeam } from "@/lib/team";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Swords, ChevronDown, ChevronUp } from "lucide-react";

interface MatchRow {
  id: string;
  opponent: string | null;
  event_date: string;
  score_us: number | null;
  score_them: number | null;
  match_result: "win" | "loss" | "draw" | null;
  status: string;
}

interface OpponentSummary {
  name: string;
  matches: MatchRow[];
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  form: ("V" | "N" | "D")[];
}

function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export default function AdversairesPage() {
  const { currentTeam } = useTeam();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!currentTeam) return null;
    const supabase = createClient();
    const { data } = await supabase
      .from("events")
      .select("id, opponent, event_date, score_us, score_them, match_result, status")
      .eq("team_id", currentTeam.id)
      .eq("type", "match")
      .not("opponent", "is", null)
      .order("event_date", { ascending: true });
    return (data || []) as unknown as MatchRow[];
  }, [currentTeam?.id]);

  useEffect(() => {
    let cancelled = false;
    loadData().then((res) => {
      if (!cancelled && res) {
        setMatches(res);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  const opponents = useMemo<OpponentSummary[]>(() => {
    const groups = new Map<string, MatchRow[]>();
    for (const m of matches) {
      if (!m.opponent) continue;
      const key = norm(m.opponent);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    }
    const summaries: OpponentSummary[] = [];
    for (const rows of groups.values()) {
      const completed = rows.filter((r) => r.score_us !== null && r.score_them !== null);
      summaries.push({
        name: rows[0].opponent as string,
        matches: rows,
        wins: completed.filter((r) => r.match_result === "win").length,
        draws: completed.filter((r) => r.match_result === "draw").length,
        losses: completed.filter((r) => r.match_result === "loss").length,
        goalsFor: completed.reduce((s, r) => s + (r.score_us || 0), 0),
        goalsAgainst: completed.reduce((s, r) => s + (r.score_them || 0), 0),
        form: [...completed]
          .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())
          .slice(-6)
          .map((r) => (r.match_result === "win" ? "V" : r.match_result === "draw" ? "N" : "D")),
      });
    }
    return summaries.sort((a, b) => b.matches.length - a.matches.length);
  }, [matches]);

  const formBadge = (r: "V" | "N" | "D") =>
    r === "V" ? "bg-emerald-500 text-white" : r === "N" ? "bg-amber-500 text-white" : "bg-red-500 text-white";

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      <div>
        <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Swords className="h-5 w-5 text-[var(--color-royal)]" />
          Adversaires
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Historique des confrontations : clique sur un adversaire pour voir le détail.
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : opponents.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Swords className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Aucun match enregistré avec adversaire pour le moment.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {opponents.map((o) => (
            <Card key={o.name}>
              <CardHeader
                className="pb-2 cursor-pointer"
                onClick={() => setExpanded(expanded === o.name ? null : o.name)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-royal)]/10 text-[var(--color-royal)] text-sm font-bold">
                      {o.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <CardTitle className="text-sm">{o.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {o.matches.length} confrontation{o.matches.length > 1 ? "s" : ""} ·{" "}
                        {o.goalsFor} buts marqués / {o.goalsAgainst} encaissés
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {o.form.map((r, i) => (
                        <span
                          key={i}
                          className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${formBadge(r)}`}
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                    {expanded === o.name ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="flex gap-2">
                  <Badge variant="outline" className="text-emerald-700">{o.wins}V</Badge>
                  <Badge variant="outline" className="text-amber-700">{o.draws}N</Badge>
                  <Badge variant="outline" className="text-red-700">{o.losses}D</Badge>
                </div>
                {expanded === o.name && (
                  <div className="mt-3 space-y-2">
                    {[...o.matches]
                      .sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime())
                      .map((m) => (
                        <div key={m.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                          <span className="text-xs text-muted-foreground">
                            {new Date(m.event_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                          {m.score_us !== null && m.score_them !== null ? (
                            <span className="font-bold">
                              {m.score_us} - {m.score_them}
                              <span className="ml-2">
                                {m.match_result === "win" ? (
                                  <Badge variant="default" className="bg-emerald-600">V</Badge>
                                ) : m.match_result === "draw" ? (
                                  <Badge variant="default" className="bg-amber-500">N</Badge>
                                ) : (
                                  <Badge variant="default" className="bg-red-600">D</Badge>
                                )}
                              </span>
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">À venir</span>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
