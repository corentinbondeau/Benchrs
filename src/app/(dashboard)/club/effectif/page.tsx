"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTeam } from "@/lib/team";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  Download,
  Search,
  ShieldCheck,
  IdCard,
  AlertTriangle,
  FileText,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { authFetch } from "@/lib/api-client";
import type { Profile, Licence, Cotisation, Team } from "@/types";
import { fffCategoryFromBirthDate } from "@/lib/vmaNorms";
import { currentSeasonLabel } from "@/lib/goals";

type EffectifRow = {
  player: Profile;
  teamId: string;
  licence: Licence | undefined;
  cotisation: Cotisation | undefined;
};

const licenceStatusLabel: Record<string, string> = {
  valid: "Validée",
  pending_documents: "En attente",
  expired: "Expirée",
};

const cotisStatusLabel: Record<string, string> = {
  paid: "Payé",
  partial: "Partiel",
  pending: "En attente",
};

function categoryOf(player: Profile): string {
  return fffCategoryFromBirthDate(player.date_of_birth) ?? "Inconnu";
}

export default function ClubEffectifPage() {
  const { currentTeam, userRole, clubMemberships } = useTeam();
  const [clubTeams, setClubTeams] = useState<Team[]>([]);
  const [rows, setRows] = useState<EffectifRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [season, setSeason] = useState(() => currentSeasonLabel());

  const [teamFilter, setTeamFilter] = useState<"all" | string>("all");
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [licenceFilter, setLicenceFilter] = useState("all");
  const [cotisFilter, setCotisFilter] = useState("all");
  const [pdfFor, setPdfFor] = useState<string | null>(null);

  const supabaseRef = useRef(createClient());

  const isCoach = userRole === "coach" || userRole === "owner";
  const hasClubRole = clubMemberships.length > 0;
  const clubId = clubMemberships[0]?.club_id;
  const hasAccess = isCoach || hasClubRole;

  const load = useCallback(async () => {
    if (!hasAccess) return null;

    let clubTeamsData: Team[] = [];
    if (hasClubRole && clubId) {
      const { data } = await supabaseRef.current
        .from("teams")
        .select("*")
        .eq("club_id", clubId)
        .order("name", { ascending: true });
      clubTeamsData = (data as Team[]) || [];
    }

    const teamIds =
      clubTeamsData.length > 0
        ? clubTeamsData.map((t) => t.id)
        : currentTeam
          ? [currentTeam.id]
          : [];
    if (teamIds.length === 0) return { teams: clubTeamsData, rows: [] };

    let membersQuery = supabaseRef.current
      .from("team_members")
      .select("user_id, team_id")
      .eq("role", "player");
    membersQuery =
      clubTeamsData.length > 0
        ? membersQuery.in("team_id", teamIds)
        : membersQuery.eq("team_id", teamIds[0]);
    const { data: members } = await membersQuery;

    const userIds = [...new Set((members ?? []).map((m) => m.user_id))];
    let profiles: Profile[] = [];
    if (userIds.length > 0) {
      const { data } = await supabaseRef.current
        .from("profiles")
        .select("*")
        .in("id", userIds);
      profiles = (data as Profile[]) || [];
    }
    const profById = new Map(profiles.map((p) => [p.id, p]));

    const firstTeam = new Map<string, string>();
    for (const m of members ?? []) {
      if (!firstTeam.has(m.user_id)) firstTeam.set(m.user_id, m.team_id);
    }

    const [{ data: lic }, { data: cotis }] = await Promise.all([
      supabaseRef.current
        .from("licences")
        .select("*")
        .in("team_id", teamIds)
        .eq("season", season),
      supabaseRef.current
        .from("cotisations")
        .select("*")
        .in("team_id", teamIds)
        .eq("season", season),
    ]);

    const licenceByPlayer = new Map<string, Licence>();
    for (const l of (lic as Licence[]) || []) licenceByPlayer.set(l.player_id, l);
    const cotisByPlayer = new Map<string, Cotisation>();
    for (const c of (cotis as Cotisation[]) || []) cotisByPlayer.set(c.player_id, c);

    const resultRows: EffectifRow[] = [...firstTeam.entries()]
      .map(([uid, teamId]) => {
        const player = profById.get(uid);
        return player
          ? {
              player,
              teamId,
              licence: licenceByPlayer.get(uid),
              cotisation: cotisByPlayer.get(uid),
            }
          : null;
      })
      .filter((r): r is EffectifRow => r !== null)
      .sort((a, b) =>
        (a.player.last_name ?? "").localeCompare(b.player.last_name ?? "")
      );

    return { teams: clubTeamsData, rows: resultRows };
  }, [hasAccess, hasClubRole, clubId, currentTeam, season]);

  useEffect(() => {
    let ignore = false;
    load().then((res) => {
      if (ignore || !res) return;
      setClubTeams(res.teams);
      setRows(res.rows);
      setLoading(false);
    });
    return () => {
      ignore = true;
    };
  }, [load]);

  const teamName = (teamId: string) =>
    clubTeams.find((t) => t.id === teamId)?.name ??
    (currentTeam?.id === teamId ? currentTeam.name : "Équipe");

  const categories = [...new Set(rows.map((r) => categoryOf(r.player)))].sort((a, b) =>
    a === "Inconnu" ? 1 : b === "Inconnu" ? -1 : a.localeCompare(b, "fr")
  );

  const filteredRows = rows.filter((r) => {
    if (teamFilter !== "all" && r.teamId !== teamFilter) return false;
    if (catFilter !== "all" && categoryOf(r.player) !== catFilter) return false;
    if (licenceFilter === "none" && r.licence) return false;
    if (licenceFilter !== "all" && licenceFilter !== "none" && r.licence?.status !== licenceFilter)
      return false;
    if (cotisFilter === "none" && r.cotisation) return false;
    if (cotisFilter !== "all" && cotisFilter !== "none" && r.cotisation?.status !== cotisFilter)
      return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const name = `${r.player.first_name} ${r.player.last_name}`.toLowerCase();
      if (!name.includes(q)) return false;
    }
    return true;
  });

  const restantDu = filteredRows.reduce(
    (s, r) => s + (r.cotisation ? Math.max(0, Number(r.cotisation.amount_expected) - Number(r.cotisation.amount_paid)) : 0),
    0
  );
  const overdue = filteredRows.filter(
    (r) =>
      r.cotisation &&
      r.cotisation.status !== "paid" &&
      r.cotisation.due_date &&
      r.cotisation.due_date < new Date().toISOString().slice(0, 10)
  ).length;
  const validLicences = filteredRows.filter((r) => r.licence?.status === "valid").length;
  const pendingLicences = filteredRows.filter((r) => r.licence?.status === "pending_documents").length;

  function csvCell(value: string | number | null | undefined): string {
    const s = value === null || value === undefined ? "" : String(value);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function exportCsv() {
    if (filteredRows.length === 0) return;
    const rowsOut: string[] = [
      "Équipe;Nom;Prénom;Né(e) le;Catégorie;Poste;N°;Téléphone;VMA;VMI;Licence;Cotisation attendue;Cotisation payée",
    ];
    for (const r of filteredRows) {
      rowsOut.push(
        [
          csvCell(teamName(r.teamId)),
          csvCell(r.player.last_name),
          csvCell(r.player.first_name),
          csvCell(r.player.date_of_birth ? new Date(r.player.date_of_birth).toLocaleDateString("fr-FR") : ""),
          csvCell(categoryOf(r.player)),
          csvCell(r.player.position || ""),
          csvCell(r.player.shirt_number),
          csvCell(r.player.phone),
          csvCell(r.player.vma),
          csvCell(r.player.vmi),
          csvCell(r.licence ? licenceStatusLabel[r.licence.status] ?? r.licence.status : "Non saisie"),
          csvCell(r.cotisation ? Number(r.cotisation.amount_expected).toFixed(2) : ""),
          csvCell(r.cotisation ? Number(r.cotisation.amount_paid).toFixed(2) : ""),
        ].join(";")
      );
    }
    const blob = new Blob(["\uFEFF" + rowsOut.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const label =
      (hasClubRole && clubTeams.length > 0 ? clubTeams[0].name : currentTeam?.name) ?? "club";
    a.href = url;
    a.download = `effectif-${label.replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${filteredRows.length} joueur(s) exporté(s)`);
  }

  async function downloadAttestation(playerId: string) {
    if (!clubId) return;
    setPdfFor(playerId);
    try {
      const res = await authFetch("/api/clubs/licence-attestation", {
        method: "POST",
        body: JSON.stringify({ clubId, playerId, season }),
      });
      const data = await res.json();
      if (!res.ok || !data.pdf) throw new Error(data.error || "Échec");
      const byteString = atob(data.pdf.split(",")[1]);
      const bytes = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i += 1) bytes[i] = byteString.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const label =
        (hasClubRole && clubTeams.length > 0 ? clubTeams[0].name : currentTeam?.name) ?? "club";
      a.href = url;
      a.download = `attestation-licence-${label.replace(/\s+/g, "-").toLowerCase()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Attestation de licence téléchargée");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la génération");
    } finally {
      setPdfFor(null);
    }
  }

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Accès réservé au coach ou au comité</p>
      </div>
    );
  }

  return (
    <div className="section-gap">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-5 w-5 text-[var(--color-royal)]" />
            Effectif du club
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tous les joueurs, toutes les équipes — licences &amp; cotisations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">Saison</Label>
          <Input
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            className="w-32"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={exportCsv}
            disabled={filteredRows.length === 0}
          >
            <Download className="h-3.5 w-3.5 mr-1" />
            CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Joueurs</p>
              <p className="text-lg font-bold">{filteredRows.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Licences validées</p>
              <p className="text-lg font-bold">{validLicences}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <IdCard className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">En attente de doc.</p>
              <p className="text-lg font-bold">{pendingLicences}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-purple-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Restant dû</p>
              <p className="text-lg font-bold">{restantDu.toFixed(0)} €</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 text-red-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Échéances dépassées</p>
              <p className="text-lg font-bold">{overdue}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <div className="flex flex-wrap items-center gap-2 p-3 border-b">
                <div className="relative flex-1 min-w-40 max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Rechercher un joueur…"
                    className="pl-8 h-9"
                  />
                </div>
                {clubTeams.length > 1 && (
                  <Select value={teamFilter} onValueChange={(v) => setTeamFilter(v ?? "all")}>
                    <SelectTrigger className="w-40 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Toutes les équipes</SelectItem>
                      {clubTeams.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Select value={catFilter} onValueChange={(v) => setCatFilter(v ?? "all")}>
                  <SelectTrigger className="w-36 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Catégorie</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={licenceFilter} onValueChange={(v) => setLicenceFilter(v ?? "all")}>
                  <SelectTrigger className="w-44 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Licence — toutes</SelectItem>
                    <SelectItem value="none">Non saisie</SelectItem>
                    <SelectItem value="valid">Validée</SelectItem>
                    <SelectItem value="pending_documents">En attente</SelectItem>
                    <SelectItem value="expired">Expirée</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={cotisFilter} onValueChange={(v) => setCotisFilter(v ?? "all")}>
                  <SelectTrigger className="w-44 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Cotisation — toutes</SelectItem>
                    <SelectItem value="none">Non définie</SelectItem>
                    <SelectItem value="paid">Payée</SelectItem>
                    <SelectItem value="partial">Partielle</SelectItem>
                    <SelectItem value="pending">En attente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                Joueurs ({filteredRows.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Joueur</TableHead>
                    {clubTeams.length > 1 && <TableHead>Équipe</TableHead>}
                    <TableHead>Catégorie</TableHead>
                    <TableHead className="text-right">N°</TableHead>
                    <TableHead className="text-right">VMA</TableHead>
                    <TableHead className="text-right">VMI</TableHead>
                    <TableHead>Licence</TableHead>
                    <TableHead>Cotisation</TableHead>
                    {hasClubRole && <TableHead>Attestation</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={7 + (clubTeams.length > 1 ? 1 : 0) + (hasClubRole ? 1 : 0)}
                        className="text-center text-muted-foreground py-8"
                      >
                        Aucun joueur ne correspond aux filtres
                      </TableCell>
                    </TableRow>
                  )}
                  {filteredRows.map((r) => {
                    const c = r.cotisation;
                    const restant = c
                      ? Math.max(0, Number(c.amount_expected) - Number(c.amount_paid))
                      : 0;
                    return (
                      <TableRow key={r.player.id + r.teamId}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-royal)]/10 text-[var(--color-royal)] text-sm font-bold">
                              {r.player.first_name[0]}
                              {r.player.last_name[0]}
                            </div>
                            <div>
                              <p className="font-medium text-sm">
                                {r.player.first_name} {r.player.last_name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {r.player.date_of_birth
                                  ? new Date(r.player.date_of_birth).toLocaleDateString("fr-FR")
                                  : ""}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        {clubTeams.length > 1 && (
                          <TableCell className="text-xs text-muted-foreground">
                            {teamName(r.teamId)}
                          </TableCell>
                        )}
                        <TableCell>
                          <Badge variant="outline">{categoryOf(r.player)}</Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {r.player.shirt_number ?? "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm">{r.player.vma ?? "—"}</TableCell>
                        <TableCell className="text-right text-sm">{r.player.vmi ?? "—"}</TableCell>
                        <TableCell>
                          {r.licence ? (
                            <Badge
                              variant={
                                r.licence.status === "valid"
                                  ? "default"
                                  : r.licence.status === "expired"
                                    ? "destructive"
                                    : "secondary"
                              }
                            >
                              {licenceStatusLabel[r.licence.status] ?? r.licence.status}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">Non saisie</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {c ? (
                            <div className="flex flex-col gap-0.5">
                              <Badge
                                variant={
                                  c.status === "paid"
                                    ? "default"
                                    : c.status === "partial"
                                      ? "secondary"
                                      : "destructive"
                                }
                              >
                                {cotisStatusLabel[c.status] ?? c.status}
                              </Badge>
                              {restant > 0 && (
                                <span className="text-[11px] text-muted-foreground">
                                  restant {restant.toFixed(2)} €
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Non définie</span>
                          )}
                        </TableCell>
                        {hasClubRole && (
                          <TableCell>
                            {r.licence?.status === "valid" ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2 text-xs"
                                disabled={pdfFor === r.player.id}
                                onClick={() => downloadAttestation(r.player.id)}
                              >
                                {pdfFor === r.player.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <FileText className="h-3.5 w-3.5" />
                                )}
                                <span className="ml-1">PDF</span>
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}