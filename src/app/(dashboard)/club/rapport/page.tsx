"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserClubs } from "@/lib/useUserClubs";
import { ClubPageShell } from "@/components/club/ClubPageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/api-client";
import {
  FileText,
  Sparkles,
  Download,
  Trophy,
  CalendarDays,
  Users,
  Percent,
  ShieldCheck,
  Wallet,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { currentSeasonLabel } from "@/lib/goals";

interface TeamAgg {
  teamId: string;
  teamName: string;
  players: number;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  attendanceAvg: number | null;
  licencesValid: number;
  licencesTotal: number;
  cotisationsExpected: number;
  cotisationsPaid: number;
  income: number;
  expense: number;
}

function teamSeasonWindow(season: string): { start: string; end: string } {
  const [sy, ey] = season.split("-").map(Number);
  return {
    start: new Date(Date.UTC(sy, 7, 1)).toISOString().slice(0, 10),
    end: new Date(Date.UTC(ey, 6, 31)).toISOString().slice(0, 10),
  };
}

export default function ClubRapportPage() {
  const { clubs, loading } = useUserClubs();
  const [requested, setRequested] = useState<string | null>(null);
  const [season, setSeason] = useState(currentSeasonLabel());
  const [teams, setTeams] = useState<TeamAgg[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [bilanLoading, setBilanLoading] = useState(false);
  const [bilan, setBilan] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const supabaseRef = useRef(createClient());
  const clubId =
    requested && clubs.some((c) => c.club_id === requested)
      ? requested
      : (clubs[0]?.club_id ?? null);
  const selectedClub = clubs.find((c) => c.club_id === clubId) ?? null;
  const isCommittee = selectedClub?.role != null;

  const load = useCallback(async (cid: string, seasonLabel: string) => {
    const { data: teamsData } = await supabaseRef.current
      .from("teams")
      .select("id, name")
      .eq("club_id", cid);
    const teamRows = (teamsData || []) as { id: string; name: string }[];
    const teamIds = teamRows.map((t) => t.id);
    if (teamIds.length === 0) return { teams: [] };

    const range = teamSeasonWindow(seasonLabel);
    const now = new Date().toISOString();
    const { data: eventsData } = await supabaseRef.current
      .from("events")
      .select("id, team_id, type, status, score_us, score_them, match_result, event_date")
      .in("team_id", teamIds)
      .lte("event_date", now)
      .gte("event_date", `${range.start}T00:00:00.000Z`)
      .lte("event_date", `${range.end}T23:59:59.999Z`);

    const eventRows = (eventsData || []) as {
      id: string;
      team_id: string;
      type: string;
      status: string;
      score_us: number | null;
      score_them: number | null;
      match_result: string | null;
    }[];
    const matches = eventRows.filter((e) => e.type === "match" && e.status === "completed");
    const matchIds = matches.map((m) => m.id);

    const [{ data: membersData }, { data: licencesData }, { data: cotisData }, { data: txData }, { data: attData }] =
      await Promise.all([
        supabaseRef.current
          .from("team_members")
          .select("user_id, team_id, role")
          .in("team_id", teamIds),
        supabaseRef.current
          .from("licences")
          .select("team_id, status")
          .in("team_id", teamIds)
          .eq("season", seasonLabel),
        supabaseRef.current
          .from("cotisations")
          .select("team_id, amount_expected, amount_paid")
          .in("team_id", teamIds)
          .eq("season", seasonLabel),
        supabaseRef.current
          .from("treasury_transactions")
          .select("team_id, type, amount, txn_date")
          .in("team_id", teamIds)
          .gte("txn_date", range.start)
          .lte("txn_date", range.end),
        matchIds.length
          ? supabaseRef.current
              .from("attendances")
              .select("event_id, status")
              .in("event_id", matchIds)
          : (Promise.resolve({ data: [] as { event_id: string; status: string }[] }) as never),
      ]);

    const memberRows = (membersData || []) as { user_id: string; team_id: string; role: string }[];
    const licenceRows = (licencesData || []) as { team_id: string; status: string }[];
    const cotisRows = (cotisData || []) as {
      team_id: string;
      amount_expected: number;
      amount_paid: number;
    }[];
    const txRows = (txData || []) as { team_id: string; type: string; amount: number }[];
    const attRows = (attData || []) as { event_id: string; status: string }[];

    const aggs: TeamAgg[] = teamRows.map((t) => {
      const tm = matches.filter((m) => m.team_id === t.id);
      const ids = new Set(
        memberRows.filter((m) => m.team_id === t.id && m.role === "player").map((m) => m.user_id)
      );
      const teamMatchIds = new Set(tm.map((m) => m.id));
      let attSum = 0;
      let attEvents = 0;
      for (const mid of teamMatchIds) {
        const rows = attRows.filter((a) => a.event_id === mid);
        const responded = rows.filter((r) => r.status !== "pending");
        if (responded.length === 0) continue;
        const present = responded.filter((r) => r.status === "present" || r.status === "late").length;
        attSum += present / responded.length;
        attEvents += 1;
      }
      const licences = licenceRows.filter((l) => l.team_id === t.id);
      const cotisations = cotisRows.filter((c) => c.team_id === t.id);
      const txs = txRows.filter((x) => x.team_id === t.id);
      return {
        teamId: t.id,
        teamName: t.name,
        players: ids.size,
        matches: tm.length,
        wins: tm.filter((m) => m.match_result === "win").length,
        draws: tm.filter((m) => m.match_result === "draw").length,
        losses: tm.filter((m) => m.match_result === "loss").length,
        goalsFor: tm.reduce((s, m) => s + ((m.score_us as number | null) ?? 0), 0),
        goalsAgainst: tm.reduce((s, m) => s + ((m.score_them as number | null) ?? 0), 0),
        attendanceAvg: attEvents > 0 ? Math.round((attSum / attEvents) * 100) : null,
        licencesValid: licences.filter((l) => l.status === "valid").length,
        licencesTotal: licences.length,
        cotisationsExpected: cotisations.reduce((s, c) => s + c.amount_expected, 0),
        cotisationsPaid: cotisations.reduce((s, c) => s + c.amount_paid, 0),
        income: txs.filter((x) => x.type === "income").reduce((s, x) => s + x.amount, 0),
        expense: txs.filter((x) => x.type === "expense").reduce((s, x) => s + x.amount, 0),
      };
    });
    return { teams: aggs };
  }, []);

  useEffect(() => {
    if (!clubId || !season) return;
    load(clubId, season).then((res) => {
      setTeams(res.teams);
      setPageLoading(false);
    });
  }, [clubId, season, load]);

  function onChangeClub(id: string) {
    setRequested(id);
    setPageLoading(true);
    setBilan(null);
  }

  const seasons = useMemoSeasonOptions();

  const tot = teams.reduce(
    (acc, t) => ({
      players: acc.players + t.players,
      matches: acc.matches + t.matches,
      wins: acc.wins + t.wins,
      draws: acc.draws + t.draws,
      losses: acc.losses + t.losses,
      goalsFor: acc.goalsFor + t.goalsFor,
      goalsAgainst: acc.goalsAgainst + t.goalsAgainst,
      licencesValid: acc.licencesValid + t.licencesValid,
      licencesTotal: acc.licencesTotal + t.licencesTotal,
      cotisationsExpected: acc.cotisationsExpected + t.cotisationsExpected,
      cotisationsPaid: acc.cotisationsPaid + t.cotisationsPaid,
      income: acc.income + t.income,
      expense: acc.expense + t.expense,
    }),
    {
      players: 0,
      matches: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      licencesValid: 0,
      licencesTotal: 0,
      cotisationsExpected: 0,
      cotisationsPaid: 0,
      income: 0,
      expense: 0,
    }
  );

  async function exportPdf() {
    if (!clubId) return;
    setPdfLoading(true);
    try {
      const res = await authFetch("/api/clubs/season-report", {
        method: "POST",
        body: JSON.stringify({ clubId, season }),
      });
      const data = await res.json();
      if (!res.ok || !data.pdf) throw new Error(data.error || "Échec");
      downloadPdf(data.pdf, `rapport-${season}.pdf`);
      toast.success("Rapport PDF généré");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la génération");
    } finally {
      setPdfLoading(false);
    }
  }

  function downloadPdf(dataUrl: string, filename: string) {
    const byteString = atob(dataUrl.split(",")[1]);
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i += 1) bytes[i] = byteString.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function generateBilan() {
    if (!clubId) return;
    if (teams.length === 0) {
      toast.error("Aucune donnée pour cette saison");
      return;
    }
    setBilanLoading(true);
    try {
      const res = await authFetch("/api/clubs/bilan-ia", {
        method: "POST",
        body: JSON.stringify({ clubId, season }),
      });
      const data = await res.json();
      if (!res.ok || !data.bilan) throw new Error(data.error || "Échec");
      setBilan(data.bilan as string);
      toast.success("Bilan IA généré");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la génération");
    } finally {
      setBilanLoading(false);
    }
  }

  const fmtEur = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";

  if (!isCommittee) {
    return (
      <ClubPageShell
        title="Rapport de saison"
        clubs={clubs}
        clubId={clubId}
        onChangeClub={onChangeClub}
        loading={loading || (clubId ? pageLoading : false)}
      >
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Rapport de saison réservé au comité.
          </CardContent>
        </Card>
      </ClubPageShell>
    );
  }

  return (
    <ClubPageShell
      title="Rapport de saison"
      subtitle="Bilan sportif et financier par équipe"
      clubs={clubs}
      clubId={clubId}
      onChangeClub={onChangeClub}
      loading={loading || (clubId ? pageLoading : false)}
      actions={
        <div className="flex items-center gap-1.5">
          <select
            value={season}
            onChange={(e) => {
              setSeason(e.target.value);
              setPageLoading(true);
              setBilan(null);
            }}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {seasons.map((s) => (
              <option key={s} value={s}>
                Saison {s}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={exportPdf}
            disabled={pdfLoading || teams.length === 0}
          >
            {pdfLoading ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5 mr-1" />
            )}
            PDF
          </Button>
          <Button
            size="sm"
            className="bg-[var(--color-gold)] text-[var(--color-navy)]"
            onClick={generateBilan}
            disabled={bilanLoading || teams.length === 0}
          >
            {bilanLoading ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 mr-1" />
            )}
            Bilan IA
          </Button>
        </div>
      }
    >
      {pageLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--color-royal)]" />
        </div>
      ) : teams.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Aucune donnée pour cette saison.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <SummaryStat icon={<Trophy className="h-4 w-4 text-[var(--color-royal)]" />} label={`${tot.matches} matchs`} value={`${tot.wins}V ${tot.draws}N ${tot.losses}D`} />
            <SummaryStat icon={<Users className="h-4 w-4 text-[var(--color-royal)]" />} label="Joueurs" value={`${tot.players}`} />
            <SummaryStat icon={<Percent className="h-4 w-4 text-[var(--color-royal)]" />} label="Buts P/C" value={`${tot.goalsFor}–${tot.goalsAgainst}`} />
            <SummaryStat icon={<ShieldCheck className="h-4 w-4 text-[var(--color-royal)]" />} label="Licences" value={`${tot.licencesValid}/${tot.licencesTotal}`} />
            <SummaryStat icon={<Wallet className="h-4 w-4 text-[var(--color-royal)]" />} label="Cotisations" value={`${fmtEur(tot.cotisationsPaid)}/${fmtEur(tot.cotisationsExpected)}`} />
            <SummaryStat icon={<Wallet className="h-4 w-4 text-[var(--color-royal)]" />} label="Trésorerie" value={`${tot.income - tot.expense >= 0 ? "+" : "−"}${fmtEur(Math.abs(tot.income - tot.expense))}`} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                <CalendarDays className="h-4 w-4 inline mr-1 text-[var(--color-royal)]" />
                Détail par équipe
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {teams.map((t) => (
                <div key={t.teamId} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{t.teamName}</p>
                    <div className="flex gap-1.5 flex-wrap">
                      <Badge variant="outline">{t.players} joueurs</Badge>
                      <Badge variant="outline">
                        {t.matches} matchs · {t.wins}V {t.draws}N {t.losses}D
                      </Badge>
                      <Badge variant="outline">
                        {t.goalsFor}–{t.goalsAgainst}
                      </Badge>
                      {t.attendanceAvg !== null && (
                        <Badge variant="outline">Assiduité {t.attendanceAvg}%</Badge>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs">
                    <p className="text-muted-foreground">
                      Licences : <b className="text-foreground">{t.licencesValid}/{t.licencesTotal}</b>
                    </p>
                    <p className="text-muted-foreground">
                      Cotisations : <b className="text-foreground">{fmtEur(t.cotisationsPaid)}</b>{" "}
                      <span className="text-muted-foreground">/ {fmtEur(t.cotisationsExpected)}</span>
                    </p>
                    <p className="text-muted-foreground">
                      Recettes : <b className="text-green-600">+{fmtEur(t.income)}</b>
                    </p>
                    <p className="text-muted-foreground">
                      Dépenses : <b className="text-red-500">−{fmtEur(t.expense)}</b>
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {bilan && (
            <Card className="mt-4">
              <CardHeader className="flex flex-row items-center gap-2">
                <FileText className="h-4 w-4 text-[var(--color-gold)]" />
                <CardTitle className="text-base">Bilan de la saison {season}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-relaxed whitespace-pre-wrap">
                {bilan}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </ClubPageShell>
  );
}

function SummaryStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">{icon} {label}</div>
      <p className="text-lg font-bold mt-0.5 truncate">{value}</p>
    </div>
  );
}

function useMemoSeasonOptions(): string[] {
  const now = new Date();
  const sy = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return [0, 1, 2, 3].map((offset) => `${sy - offset}-${sy - offset + 1}`);
}