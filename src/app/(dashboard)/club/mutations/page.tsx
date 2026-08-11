"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  ArrowRight,
  Building2,
  Check,
  Loader2,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";

interface ClubData {
  id: string;
  name: string;
  canReview: boolean;
  teams: { id: string; name: string; color_primary: string | null }[];
  coachTeamIds: string[];
  transfers: TransferRow[];
}

interface TransferRow {
  id: string;
  club_id: string;
  player_id: string;
  from_team_id: string;
  to_team_id: string;
  status: "pending" | "approved" | "rejected";
  notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  player?: { first_name: string | null; last_name: string | null } | null;
}

const STATUS_BADGE: Record<TransferRow["status"], { label: string; className: string }> = {
  pending: { label: "En attente", className: "bg-[var(--color-gold)] text-[var(--color-navy)]" },
  approved: { label: "Validée", className: "bg-emerald-500 text-white" },
  rejected: { label: "Refusée", className: "bg-red-500 text-white" },
};

export default function ClubMutationsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [clubs, setClubs] = useState<ClubData[]>([]);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [reqOpen, setReqOpen] = useState(false);
  const [reqFrom, setReqFrom] = useState("");
  const [reqTo, setReqTo] = useState("");
  const [reqPlayer, setReqPlayer] = useState("");
  const [reqNotes, setReqNotes] = useState("");
  const [playersOfFrom, setPlayersOfFrom] = useState<{ id: string; name: string }[]>([]);

  const loadClubs = useCallback(async (userId: string) => {
    const supabase = createClient();
    const [membersRes, createdRes] = await Promise.all([
      supabase.from("club_members").select("club_id").eq("user_id", userId),
      supabase.from("clubs").select("id").eq("created_by", userId),
    ]);
    const memberIds = new Set((membersRes.data || []).map((m) => (m as { club_id: string }).club_id));
    const createdIds = (createdRes.data || []).map((c) => (c as { id: string }).id);
    const ids = [...new Set([...memberIds, ...createdIds])];
    if (ids.length === 0) return [] as ClubData[];

    const [clubRes, teamsRes, myTeamsRes, transfersRes] = await Promise.all([
      supabase.from("clubs").select("id, name").in("id", ids),
      supabase.from("teams").select("id, name, color_primary, club_id").in("club_id", ids),
      supabase.from("team_members").select("team_id, role").eq("user_id", userId),
      supabase
        .from("player_transfers")
        .select(
          "id, club_id, player_id, from_team_id, to_team_id, status, notes, created_at, reviewed_at, player:profiles(first_name, last_name)"
        )
        .in("club_id", ids)
        .order("created_at", { ascending: false }),
    ]);

    const nameMap = new Map((clubRes.data || []).map((c) => [c.id, c.name as string]));
    const teamsByClub = new Map<string, { id: string; name: string; color_primary: string | null }[]>();
    for (const t of (teamsRes.data || []) as unknown as {
      id: string;
      name: string;
      color_primary: string | null;
      club_id: string;
    }[]) {
      if (!teamsByClub.has(t.club_id)) teamsByClub.set(t.club_id, []);
      teamsByClub.get(t.club_id)!.push({ id: t.id, name: t.name, color_primary: t.color_primary });
    }
    const myCoachTeamIds = new Set(
      ((myTeamsRes.data || []) as { team_id: string; role: string }[])
        .filter((m) => m.role === "owner" || m.role === "coach")
        .map((m) => m.team_id)
    );
    const transfersByClub = new Map<string, TransferRow[]>();
    for (const t of (transfersRes.data || []) as unknown as (TransferRow & { player: unknown })[]) {
      const row = t as TransferRow;
      if (!transfersByClub.has(row.club_id)) transfersByClub.set(row.club_id, []);
      transfersByClub.get(row.club_id)!.push(row);
    }

    return ids.map((id) => ({
      id,
      name: nameMap.get(id) || "Club",
      canReview: memberIds.has(id),
      teams: teamsByClub.get(id) || [],
      coachTeamIds: (teamsByClub.get(id) || []).map((t) => t.id).filter((tid) => myCoachTeamIds.has(tid)),
      transfers: transfersByClub.get(id) || [],
    }));
  }, []);

  useEffect(() => {
    if (!user) return;
    loadClubs(user.id).then((data) => {
      setClubs(data);
      if (data.length > 0 && !selectedClubId) setSelectedClubId(data[0].id);
      setLoading(false);
    });
  }, [user, loadClubs, selectedClubId]);

  const refresh = useCallback(async () => {
    if (!user) return;
    setClubs(await loadClubs(user.id));
  }, [user, loadClubs]);

  const club = clubs.find((c) => c.id === selectedClubId) || null;
  const teamName = new Map((club?.teams || []).map((t) => [t.id, t.name]));
  const teamColor = new Map((club?.teams || []).map((t) => [t.id, t.color_primary]));

  async function onReqFromChange(teamId: string) {
    setReqFrom(teamId);
    setReqPlayer("");
    if (!teamId) {
      setPlayersOfFrom([]);
      return;
    }
    const supabase = createClient();
    const { data: members } = await supabase
      .from("team_members")
      .select("user_id, profile:profiles(first_name, last_name)")
      .eq("team_id", teamId)
      .eq("role", "player");
    setPlayersOfFrom(
      ((members || []) as unknown as { user_id: string; profile: { first_name: string | null; last_name: string | null } }[]).map(
        (m) => ({
          id: m.user_id,
          name: `${m.profile?.first_name ?? ""} ${m.profile?.last_name ?? ""}`.trim() || "Joueur",
        })
      )
    );
  }

  async function requestTransfer() {
    if (!club || !reqFrom || !reqTo || !reqPlayer) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("player_transfers").insert({
        club_id: club.id,
        player_id: reqPlayer,
        from_team_id: reqFrom,
        to_team_id: reqTo,
        status: "pending",
        notes: reqNotes.trim() || null,
        requested_by: user?.id,
      });
      if (error) throw error;
      toast.success("Demande de mutation envoyée au comité");
      setReqOpen(false);
      setReqNotes("");
      setReqPlayer("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la demande");
    } finally {
      setBusy(false);
    }
  }

  async function review(transferId: string, approve: boolean) {
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc(
        approve ? "approve_player_transfer" : "reject_player_transfer",
        { p_transfer_id: transferId }
      );
      if (error) throw error;
      toast.success(approve ? "Mutation validée, joueur déplacé" : "Mutation refusée");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors du traitement");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">Chargement...</CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4 md:space-y-6 pb-20 md:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <RefreshCw className="h-6 w-6" />
            Mutations entre équipes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Déplacements de joueurs entre les équipes du club, validés par le comité
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/club")}>
          Retour à l&apos;espace club
        </Button>
      </div>

      {clubs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Vous n&apos;êtes rattaché à aucun club pour le moment.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {clubs.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedClubId(c.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  c.id === selectedClubId
                    ? "border-foreground bg-foreground text-background"
                    : "bg-background text-muted-foreground hover:border-foreground/25"
                }`}
              >
                <Building2 className="h-3.5 w-3.5" />
                {c.name}
              </button>
            ))}
          </div>

          {club && (
            <>
              {club.coachTeamIds.length > 0 && (
                <Button
                  size="sm"
                  onClick={() => {
                    const first = club.coachTeamIds[0];
                    setReqFrom(first);
                    setReqTo("");
                    setReqPlayer("");
                    setPlayersOfFrom([]);
                    setReqOpen(true);
                    onReqFromChange(first);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Demander une mutation
                </Button>
              )}

              {club.transfers.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    Aucune demande de mutation pour {club.name}.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {club.transfers.map((t) => {
                    const badge = STATUS_BADGE[t.status];
                    return (
                      <Card key={t.id}>
                        <CardContent className="p-3.5 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">
                              {t.player?.first_name} {t.player?.last_name}
                            </span>
                            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <span
                                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5"
                                style={{ backgroundColor: (teamColor.get(t.from_team_id) || "#EAB308") + "22" }}
                              >
                                {teamName.get(t.from_team_id) || "?"}
                              </span>
                              <ArrowRight className="h-3.5 w-3.5" />
                              <span
                                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5"
                                style={{ backgroundColor: (teamColor.get(t.to_team_id) || "#EAB308") + "22" }}
                              >
                                {teamName.get(t.to_team_id) || "?"}
                              </span>
                            </span>
                            <Badge className={badge.className}>{badge.label}</Badge>
                          </div>
                          {t.notes && <p className="text-sm text-muted-foreground">{t.notes}</p>}
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">
                              Demandée le{" "}
                              {new Date(t.created_at).toLocaleDateString("fr-FR", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                              {t.reviewed_at &&
                                ` · traitée le ${new Date(t.reviewed_at).toLocaleDateString("fr-FR", {
                                  day: "numeric",
                                  month: "short",
                                })}`}
                            </span>
                            {t.status === "pending" && club.canReview && (
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600"
                                  disabled={busy}
                                  onClick={() => review(t.id, false)}
                                >
                                  <X className="h-3.5 w-3.5 mr-1" />
                                  Refuser
                                </Button>
                                <Button
                                  size="sm"
                                  className="bg-emerald-500 text-white hover:bg-emerald-600"
                                  disabled={busy}
                                  onClick={() => review(t.id, true)}
                                >
                                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                                  <Check className="h-3.5 w-3.5 mr-1" />
                                  Valider
                                </Button>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              {!club.canReview && club.coachTeamIds.length === 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  Lecture seule
                </Badge>
              )}
            </>
          )}
        </>
      )}

      <Dialog open={reqOpen} onOpenChange={setReqOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Demander une mutation</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Équipe actuelle du joueur</Label>
              <Select
                value={reqFrom}
                onValueChange={(v) => v && onReqFromChange(v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choisir l'équipe" />
                </SelectTrigger>
                <SelectContent>
                  {club?.coachTeamIds.map((tid) => (
                    <SelectItem key={tid} value={tid}>
                      {teamName.get(tid)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Joueur</Label>
              <Select value={reqPlayer} onValueChange={(v) => v && setReqPlayer(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choisir le joueur" />
                </SelectTrigger>
                <SelectContent>
                  {playersOfFrom.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Équipe de destination</Label>
              <Select value={reqTo} onValueChange={(v) => v && setReqTo(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choisir l'équipe" />
                </SelectTrigger>
                <SelectContent>
                  {(club?.teams || [])
                    .filter((t) => t.id !== reqFrom)
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Motif (optionnel)</Label>
              <Input
                value={reqNotes}
                onChange={(e) => setReqNotes(e.target.value)}
                placeholder="Ex : montée de catégorie, besoin d'effectif..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={requestTransfer} disabled={!reqFrom || !reqTo || !reqPlayer || busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Envoyer la demande
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
