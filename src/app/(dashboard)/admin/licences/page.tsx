"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTeam } from "@/lib/team";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { FileText, Plus, ShieldCheck, X, IdCard } from "lucide-react";
import { toast } from "sonner";
import type { Profile, Licence, Team } from "@/types";
import { currentSeasonLabel } from "@/lib/goals";
import { fffCategoryFromBirthDate } from "@/lib/vmaNorms";

const STATUS_OPTIONS: { value: Licence["status"]; label: string }[] = [
  { value: "pending_documents", label: "Documents en attente" },
  { value: "valid", label: "Validée" },
  { value: "expired", label: "Expirée" },
];

const statusVariant: Record<
  Licence["status"],
  "default" | "secondary" | "destructive"
> = {
  valid: "default",
  pending_documents: "secondary",
  expired: "destructive",
};

const DOC_PRESETS = [
  "Photo",
  "Certificat médical",
  "Formulaire FFF",
  "Autorisation parentale",
  "RGPD",
];

type LicenceRow = {
  player: Profile;
  teamId: string;
  licence: Licence | undefined;
};

export default function LicencesPage() {
  const { currentTeam, userRole, clubMemberships } = useTeam();
  const [clubTeams, setClubTeams] = useState<Team[]>([]);
  const [rows, setRows] = useState<LicenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [season, setSeason] = useState(() => currentSeasonLabel());
  const [teamFilter, setTeamFilter] = useState<"all" | string>("all");

  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<LicenceRow | null>(null);
  const [editStatus, setEditStatus] = useState<Licence["status"]>("pending_documents");
  const [editDocs, setEditDocs] = useState<string[]>([]);
  const [editNewDoc, setEditNewDoc] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);

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

    const { data: lic } = await supabaseRef.current
      .from("licences")
      .select("*")
      .in("team_id", teamIds)
      .eq("season", season);

    const licenceByPlayer = new Map<string, Licence>();
    for (const l of (lic as Licence[]) || []) licenceByPlayer.set(l.player_id, l);

    const resultRows: LicenceRow[] = [...firstTeam.entries()]
      .map(([uid, teamId]) => {
        const player = profById.get(uid);
        return player ? { player, teamId, licence: licenceByPlayer.get(uid) } : null;
      })
      .filter((r): r is LicenceRow => r !== null)
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

  const filteredRows =
    teamFilter === "all" ? rows : rows.filter((r) => r.teamId === teamFilter);

  const stats = {
    total: filteredRows.length,
    valid: filteredRows.filter((r) => r.licence?.status === "valid").length,
    pending: filteredRows.filter((r) => r.licence?.status === "pending_documents").length,
    expired: filteredRows.filter((r) => r.licence?.status === "expired").length,
    none: filteredRows.filter((r) => !r.licence).length,
  };

  function openEdit(row: LicenceRow) {
    setEditRow(row);
    setEditStatus(row.licence?.status ?? "pending_documents");
    setEditDocs(row.licence?.documents_received ?? []);
    setEditNewDoc("");
    setEditNotes(row.licence?.notes ?? "");
    setEditOpen(true);
  }

  function toggleDoc(doc: string) {
    setEditDocs((prev) =>
      prev.includes(doc) ? prev.filter((d) => d !== doc) : [...prev, doc]
    );
  }

  function addDoc() {
    const doc = editNewDoc.trim();
    if (!doc) return;
    setEditDocs((prev) => (prev.includes(doc) ? prev : [...prev, doc]));
    setEditNewDoc("");
  }

  async function handleSave() {
    if (!editRow) return;
    setSaving(true);
    const payload = {
      player_id: editRow.player.id,
      team_id: editRow.teamId,
      season,
      status: editStatus,
      documents_received: editDocs,
      notes: editNotes.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabaseRef.current
      .from("licences")
      .upsert(payload, { onConflict: "team_id,player_id,season" })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Licence enregistrée");
      setRows((prev) =>
        prev.map((r) =>
          r.player.id === editRow.player.id
            ? { ...r, licence: data as Licence }
            : r
        )
      );
      setEditOpen(false);
    }
    setSaving(false);
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
          <h1 className="text-2xl font-bold">Licences</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Suivi des dossiers de licence par saison
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">Saison</Label>
          <Input
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            className="w-32"
          />
          {clubTeams.length > 1 && (
            <Select value={teamFilter} onValueChange={(v) => setTeamFilter(v ?? "all")}>
              <SelectTrigger className="w-44">
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
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <IdCard className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Joueurs</p>
              <p className="text-lg font-bold">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-green-700">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Validées</p>
              <p className="text-lg font-bold">{stats.valid}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">En attente</p>
              <p className="text-lg font-bold">{stats.pending}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 text-red-700">
              <X className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Expirées</p>
              <p className="text-lg font-bold">{stats.expired}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-purple-700">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Non saisies</p>
              <p className="text-lg font-bold">{stats.none}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {!loading && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Dossiers de licence
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Joueur</TableHead>
                  {clubTeams.length > 1 && <TableHead>Équipe</TableHead>}
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Documents</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={clubTeams.length > 1 ? 6 : 5}
                      className="text-center text-muted-foreground py-8"
                    >
                      Aucun joueur
                    </TableCell>
                  </TableRow>
                )}
                {filteredRows.map((row) => {
                  const l = row.licence;
                  const category = fffCategoryFromBirthDate(row.player.date_of_birth);
                  return (
                    <TableRow key={row.player.id + row.teamId}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-royal)]/10 text-[var(--color-royal)] text-sm font-bold">
                            {row.player.first_name[0]}
                            {row.player.last_name[0]}
                          </div>
                          <div>
                            <p className="font-medium text-sm">
                              {row.player.first_name} {row.player.last_name}
                            </p>
                            {l && l.notes && (
                              <p className="text-xs text-muted-foreground truncate max-w-56">
                                {l.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      {clubTeams.length > 1 && (
                        <TableCell className="text-xs text-muted-foreground">
                          {teamName(row.teamId)}
                        </TableCell>
                      )}
                      <TableCell>
                        {category ? (
                          <Badge variant="outline">{category}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {l && l.documents_received.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {l.documents_received.slice(0, 3).map((d) => (
                              <Badge key={d} variant="secondary" className="text-xs">
                                {d}
                              </Badge>
                            ))}
                            {l.documents_received.length > 3 && (
                              <span className="text-xs text-muted-foreground">
                                +{l.documents_received.length - 3}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {l ? (
                          <Badge variant={statusVariant[l.status]}>
                            {STATUS_OPTIONS.find((s) => s.value === l.status)?.label ??
                              l.status}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Non saisie</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() => openEdit(row)}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          {l ? "Modifier" : "Saisir"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editRow?.licence ? "Modifier la licence" : "Saisir la licence"}</DialogTitle>
            <DialogDescription>
              {editRow?.player.first_name} {editRow?.player.last_name} —{" "}
              {editRow ? teamName(editRow.teamId) : ""} — Saison {season}
              {editRow ? ` — Catégorie ${fffCategoryFromBirthDate(editRow.player.date_of_birth) ?? "—"}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Statut du dossier</Label>
              <Select value={editStatus} onValueChange={(v) => setEditStatus((v ?? "pending_documents") as Licence["status"])}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Documents reçus</Label>
              <div className="flex flex-wrap gap-1.5">
                {DOC_PRESETS.map((doc) => {
                  const active = editDocs.includes(doc);
                  return (
                    <button
                      key={doc}
                      type="button"
                      onClick={() => toggleDoc(doc)}
                      className={
                        active
                          ? "inline-flex items-center rounded-full bg-[var(--color-gold)] px-3 py-1 text-xs font-semibold text-white"
                          : "inline-flex items-center rounded-full border px-3 py-1 text-xs text-muted-foreground"
                      }
                    >
                      {doc}
                      {active && <X className="ml-1 h-3 w-3" />}
                    </button>
                  );
                })}
                {editDocs
                  .filter((d) => !DOC_PRESETS.includes(d))
                  .map((doc) => (
                    <button
                      key={doc}
                      type="button"
                      onClick={() => toggleDoc(doc)}
                      className="inline-flex items-center rounded-full bg-[var(--color-gold)] px-3 py-1 text-xs font-semibold text-white"
                    >
                      {doc}
                      <X className="ml-1 h-3 w-3" />
                    </button>
                  ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={editNewDoc}
                  onChange={(e) => setEditNewDoc(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addDoc();
                    }
                  }}
                  placeholder="Autre document…"
                />
                <Button type="button" variant="outline" onClick={addDoc} disabled={!editNewDoc.trim()}>
                  Ajouter
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes (optionnel)</Label>
              <Input
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Ex: licence cadrée avant le 15/09"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Annuler
            </Button>
            <Button
              className="bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}