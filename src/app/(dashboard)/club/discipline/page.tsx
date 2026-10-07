"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserClubs } from "@/lib/useUserClubs";
import { ClubPageShell } from "@/components/club/ClubPageShell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ShieldAlert,
  Plus,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { Profile, Team } from "@/types";
import { currentSeasonLabel } from "@/lib/goals";

const OFFENSE_TYPES = [
  { value: "carton_jaune", label: "Carton jaune" },
  { value: "carton_rouge", label: "Carton rouge" },
  { value: "suspension", label: "Suspension" },
  { value: "exclusion", label: "Exclusion" },
  { value: "autre", label: "Autre" },
] as const;

interface DisciplineEntry {
  id: string;
  team_id: string | null;
  player_id: string;
  season: string;
  offense_type: string;
  label: string | null;
  reason: string | null;
  incident_date: string;
  end_date: string | null;
  status: "active" | "resolved";
  created_at: string;
}

interface PlayerOption {
  id: string;
  first_name: string;
  last_name: string;
  team_id: string;
}

export default function ClubDisciplinePage() {
  const { clubs, loading } = useUserClubs();
  const [requested, setRequested] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [entries, setEntries] = useState<DisciplineEntry[]>([]);
  const [pageLoading, setPageLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [teamId, setTeamId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [offenseType, setOffenseType] = useState("suspension");
  const [label, setLabel] = useState("");
  const [reason, setReason] = useState("");
  const [incidentDate, setIncidentDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState("");
  const [season, setSeason] = useState(() => currentSeasonLabel());

  const supabaseRef = useRef(createClient());
  const clubId =
    requested && clubs.some((c) => c.club_id === requested)
      ? requested
      : (clubs[0]?.club_id ?? null);
  const selectedClub = clubs.find((c) => c.club_id === clubId) ?? null;
  const isCommittee = selectedClub?.role != null;

  const load = useCallback(async (cid: string) => {
    const { data: teamsData } = await supabaseRef.current
      .from("teams")
      .select("id, name, color_primary")
      .eq("club_id", cid)
      .order("name", { ascending: true });
    const teamRows = (teamsData || []) as Team[];

    const [{ data: entriesData }, { data: membersData }] = await Promise.all([
      supabaseRef.current
        .from("club_discipline")
        .select("*")
        .eq("club_id", cid)
        .order("incident_date", { ascending: false }),
      teamRows.length
        ? supabaseRef.current
            .from("team_members")
            .select("user_id, team_id")
            .in(
              "team_id",
              teamRows.map((t) => t.id)
            )
            .eq("role", "player")
        : { data: [] as { user_id: string; team_id: string }[] },
    ]);

    const memberRows = (membersData || []) as { user_id: string; team_id: string }[];
    const userIds = [...new Set(memberRows.map((m) => m.user_id))];
    let profiles: Profile[] = [];
    if (userIds.length > 0) {
      const { data } = await supabaseRef.current
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", userIds);
      profiles = (data as Profile[]) || [];
    }
    const profById = new Map(profiles.map((p) => [p.id, p]));
    const playerTeam = new Map<string, string>();
    for (const m of memberRows) {
      if (!playerTeam.has(m.user_id)) playerTeam.set(m.user_id, m.team_id);
    }

    return {
      teams: teamRows,
      players: [...playerTeam.entries()]
        .map(([id, tid]) => {
          const p = profById.get(id);
          return p
            ? { id, first_name: p.first_name, last_name: p.last_name, team_id: tid }
            : null;
        })
        .filter((p): p is PlayerOption => p !== null)
        .sort((a, b) => a.last_name.localeCompare(b.last_name)),
      entries: ((entriesData || []) as Record<string, unknown>[]).map((e) => ({
        id: e.id as string,
        team_id: (e.team_id as string | null) ?? null,
        player_id: e.player_id as string,
        season: e.season as string,
        offense_type: e.offense_type as string,
        label: (e.label as string | null) ?? null,
        reason: (e.reason as string | null) ?? null,
        incident_date: e.incident_date as string,
        end_date: (e.end_date as string | null) ?? null,
        status: e.status as DisciplineEntry["status"],
        created_at: e.created_at as string,
      })),
    };
  }, []);

  useEffect(() => {
    if (!clubId) return;
    load(clubId).then((res) => {
      setTeams(res.teams);
      setPlayers(res.players);
      setEntries(res.entries);
      setPageLoading(false);
    });
  }, [clubId, load]);

  function onChangeClub(id: string) {
    setRequested(id);
  }

  async function addEntry() {
    if (!clubId || !playerId || !incidentDate) {
      toast.error("Joueur et date requis");
      return;
    }
    const { error } = await supabaseRef.current.from("club_discipline").insert({
      club_id: clubId,
      player_id: playerId,
      team_id: teamId || null,
      season,
      offense_type: offenseType,
      label: label.trim() || null,
      reason: reason.trim() || null,
      incident_date: incidentDate,
      end_date: endDate || null,
      status: "active",
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setCreateOpen(false);
    setPlayerId("");
    setLabel("");
    setReason("");
    setEndDate("");
    if (clubId) load(clubId).then((res) => setEntries(res.entries));
  }

  async function setStatus(entry: DisciplineEntry, status: "active" | "resolved") {
    if (!clubId) return;
    const { error } = await supabaseRef.current
      .from("club_discipline")
      .update({ status })
      .eq("id", entry.id)
      .eq("club_id", clubId);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (clubId) load(clubId).then((res) => setEntries(res.entries));
  }

  async function deleteEntry(entry: DisciplineEntry) {
    if (!clubId) return;
    const { error } = await supabaseRef.current
      .from("club_discipline")
      .delete()
      .eq("id", entry.id)
      .eq("club_id", clubId);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (clubId) load(clubId).then((res) => setEntries(res.entries));
  }

  const teamNameById = new Map(teams.map((t) => [t.id, t.name]));
  const playerById = new Map(players.map((p) => [p.id, p]));
  const typeLabel = (t: string) =>
    OFFENSE_TYPES.find((x) => x.value === t)?.label ?? t;
  const activeEntries = entries.filter((e) => e.status === "active");

  return (
    <ClubPageShell
      title="Registre discipline"
      subtitle="Suspensions et cartons à l'échelle du club"
      clubs={clubs}
      clubId={clubId}
      onChangeClub={onChangeClub}
      loading={loading || (clubId ? pageLoading : false)}
      actions={
        isCommittee ? (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger render={<Button size="sm" />}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Signaler
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-[var(--color-royal)]" />
                  Nouvelle entrée disciplinaire
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 pt-1">
                {teams.length > 1 && (
                  <div className="space-y-1.5">
                    <Label>Équipe</Label>
                    <Select
                      value={teamId}
                      onValueChange={(v) => {
                        setTeamId(v ?? "");
                        setPlayerId("");
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner une équipe" />
                      </SelectTrigger>
                      <SelectContent>
                        {teams.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Joueur</Label>
                  <Select value={playerId} onValueChange={(v) => setPlayerId(v ?? "")}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un joueur" />
                    </SelectTrigger>
                    <SelectContent>
                      {players
                        .filter((p) => !teamId || p.team_id === teamId)
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.first_name} {p.last_name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <Select
                      value={offenseType}
                      onValueChange={(v) => setOffenseType(v ?? "suspension")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OFFENSE_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="disc-incident">Date de l&apos;incident</Label>
                    <Input
                      id="disc-incident"
                      type="date"
                      value={incidentDate}
                      onChange={(e) => setIncidentDate(e.target.value)}
                    />
                  </div>
                </div>
                {offenseType === "suspension" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="disc-end">Fin de suspension (optionnel)</Label>
                    <Input
                      id="disc-end"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="disc-season">Saison</Label>
                  <Input
                    id="disc-season"
                    value={season}
                    onChange={(e) => setSeason(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="disc-label">Libellé (optionnel)</Label>
                  <Input
                    id="disc-label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Ex. : 2e carton jaune"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="disc-reason">Motif / justificatif</Label>
                  <Textarea
                    id="disc-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    placeholder="Mise à pied à l'entraînement du…"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>
                    Annuler
                  </Button>
                  <Button onClick={addEntry} disabled={!playerId}>
                    Enregistrer
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        ) : undefined
      }
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="destructive">
            {activeEntries.length} actif{activeEntries.length > 1 ? "s" : ""}
          </Badge>
          <Badge variant="secondary">
            {entries.length - activeEntries.length} réglé(s)
          </Badge>
        </div>
        <Input
          className="w-36 h-9"
          value={season}
          onChange={(e) => setSeason(e.target.value)}
          placeholder="Saison"
        />
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Aucune entrée disciplinaire.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const p = playerById.get(entry.player_id);
            return (
              <Card key={entry.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {typeLabel(entry.offense_type)}
                        <Badge
                          variant={entry.status === "active" ? "destructive" : "secondary"}
                        >
                          {entry.status === "active" ? "Actif" : "Réglé"}
                        </Badge>
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {p ? `${p.first_name} ${p.last_name}` : "Joueur"}
                        {entry.team_id && teamNameById.has(entry.team_id)
                          ? ` · ${teamNameById.get(entry.team_id)}`
                          : ""}
                        {" · "}saison {entry.season}
                      </p>
                    </div>
                    {isCommittee && (
                      <div className="flex gap-1 shrink-0">
                        {entry.status === "active" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setStatus(entry, "resolved")}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                            Régler
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => deleteEntry(entry)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="text-sm">
                  <p className="text-muted-foreground">
                    Le {new Date(entry.incident_date + "T00:00:00").toLocaleDateString("fr-FR")}
                    {entry.offense_type === "suspension" && entry.end_date
                      ? ` · jusqu'au ${new Date(entry.end_date + "T00:00:00").toLocaleDateString("fr-FR")}`
                      : ""}
                  </p>
                  {entry.label && (
                    <p className="mt-1 font-medium text-sm">{entry.label}</p>
                  )}
                  {entry.reason && (
                    <p className="mt-0.5 text-sm text-muted-foreground">{entry.reason}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </ClubPageShell>
  );
}