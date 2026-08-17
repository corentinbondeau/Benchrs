"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Sofa, Building2, Loader2, Plus, Trash2 } from "lucide-react";
import type { ClubhouseReservation, Profile } from "@/types";
import { fr } from "date-fns/locale";

// ─── Types locaux ─────────────────────────────────────────────────────────────

interface ClubData {
  id: string;
  name: string;
  canManage: boolean;
  reservations: ClubhouseReservation[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(t: string) {
  return t.slice(0, 5);
}

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function creatorName(r: ClubhouseReservation): string {
  if (r.creator) {
    const { first_name, last_name } = r.creator;
    return [first_name, last_name].filter(Boolean).join(" ") || "Inconnu";
  }
  return "";
}

// ─── Composant principal ───────────────────────────────────────────────────────

export default function ClubhousePage() {
  const { user } = useAuth();
  const router = useRouter();

  const [clubs, setClubs] = useState<ClubData[]>([]);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Calendrier : date sélectionnée (par défaut = aujourd'hui)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Dialog "Nouvelle réservation"
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createDate, setCreateDate] = useState("");
  const [createStartTime, setCreateStartTime] = useState("");
  const [createEndTime, setCreateEndTime] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  // Dialog de confirmation de suppression
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // ─── Chargement des clubs et réservations ─────────────────────────────────

  const loadClubs = useCallback(async (userId: string): Promise<ClubData[]> => {
    const supabase = createClient();

    // Récupère les clubs dont l'utilisateur est membre (comité)
    const [membersRes, teamsRes] = await Promise.all([
      supabase.from("club_members").select("club_id, role").eq("user_id", userId),
      supabase.from("team_members").select("team_id, role, teams(club_id)").eq("user_id", userId),
    ]);

    const seen = new Set<string>();
    const clubList: { id: string; canManage: boolean }[] = [];

    // Membres du comité
    for (const m of (membersRes.data || []) as { club_id: string; role: string }[]) {
      if (!seen.has(m.club_id)) {
        seen.add(m.club_id);
        clubList.push({ id: m.club_id, canManage: true });
      }
    }

    // Coaches d'équipes du club
    for (const tm of (teamsRes.data || []) as unknown as { team_id: string; role: string; teams: { club_id: string } | null }[]) {
      const clubId = tm.teams?.club_id;
      if (!clubId) continue;
      const isCoach = tm.role === "owner" || tm.role === "coach";
      if (!seen.has(clubId)) {
        seen.add(clubId);
        clubList.push({ id: clubId, canManage: isCoach });
      } else if (isCoach) {
        // Upgrade canManage si déjà vu comme simple membre
        const existing = clubList.find((c) => c.id === clubId);
        if (existing) existing.canManage = true;
      }
    }

    if (clubList.length === 0) return [];

    const ids = clubList.map((c) => c.id);

    // Noms des clubs + réservations avec jointure créateur
    const [clubRes, reservationsRes] = await Promise.all([
      supabase.from("clubs").select("id, name").in("id", ids),
      supabase
        .from("clubhouse_reservations")
        .select(
          "id, club_id, title, description, reservation_date, start_time, end_time, created_by, created_at, creator:profiles!created_by(id, first_name, last_name, avatar_url)"
        )
        .in("club_id", ids)
        .order("reservation_date", { ascending: true })
        .order("start_time", { ascending: true }),
    ]);

    const nameMap = new Map(
      (clubRes.data || []).map((c) => [c.id, c.name as string])
    );

    const reservationsByClub = new Map<string, ClubhouseReservation[]>();
    for (const r of (reservationsRes.data || []) as unknown as ClubhouseReservation[]) {
      if (!reservationsByClub.has(r.club_id)) reservationsByClub.set(r.club_id, []);
      reservationsByClub.get(r.club_id)!.push(r);
    }

    return clubList.map((c) => ({
      id: c.id,
      name: nameMap.get(c.id) || "Club",
      canManage: c.canManage,
      reservations: reservationsByClub.get(c.id) || [],
    }));
  }, []);

  // ─── Refresh helper ───────────────────────────────────────────────────────

  const refreshClubs = useCallback(async () => {
    if (!user) return;
    const data = await loadClubs(user.id);
    setClubs(data);
  }, [user, loadClubs]);

  useEffect(() => {
    if (!user) return;
    loadClubs(user.id).then((data) => {
      setClubs(data);
      if (data.length > 0 && !selectedClubId) setSelectedClubId(data[0].id);
      setLoading(false);
    });
  }, [user, loadClubs, selectedClubId]);

  // ─── Données dérivées ─────────────────────────────────────────────────────

  const club = clubs.find((c) => c.id === selectedClubId) || null;
  const selectedDateStr = toLocalDateStr(selectedDate);

  // Réservations du jour sélectionné
  const todayReservations = (club?.reservations || []).filter(
    (r) => r.reservation_date === selectedDateStr
  );

  // Jours ayant au moins une réservation (pour les indicateurs visuels)
  const daysWithReservations = new Set(
    (club?.reservations || []).map((r) => r.reservation_date)
  );

  // Modificateur react-day-picker pour marquer les jours avec réservations
  const hasReservation = (date: Date) =>
    daysWithReservations.has(toLocalDateStr(date));

  // ─── Création de réservation ──────────────────────────────────────────────

  function openCreateDialog() {
    setCreateTitle("");
    setCreateDescription("");
    setCreateDate(toLocalDateStr(selectedDate));
    setCreateStartTime("");
    setCreateEndTime("");
    setCreateError(null);
    setCreateOpen(true);
  }

  async function handleCreateReservation() {
    if (!club || !user) return;
    if (!createTitle.trim()) {
      setCreateError("Le titre est requis.");
      return;
    }
    if (!createStartTime || !createEndTime) {
      setCreateError("Les heures de début et de fin sont requises.");
      return;
    }
    if (createStartTime >= createEndTime) {
      setCreateError("L'heure de fin doit être après l'heure de début.");
      return;
    }
    setCreateError(null);
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("clubhouse_reservations").insert({
        club_id: club.id,
        title: createTitle.trim(),
        description: createDescription.trim() || null,
        reservation_date: createDate,
        start_time: createStartTime,
        end_time: createEndTime,
        created_by: user.id,
      });
      if (error) {
        // Détecter le conflit de créneau (contrainte EXCLUDE PostgreSQL)
        const msg = error.message.toLowerCase();
        if (
          msg.includes("overlap") ||
          msg.includes("exclude") ||
          msg.includes("conflict") ||
          error.code === "23P01"
        ) {
          setCreateError("Ce créneau est déjà réservé. Veuillez choisir un autre créneau.");
          return;
        }
        throw error;
      }
      toast.success("Réservation créée");
      setCreateOpen(false);
      await refreshClubs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la création");
    } finally {
      setSaving(false);
    }
  }

  // ─── Suppression ──────────────────────────────────────────────────────────

  async function handleDeleteConfirm() {
    if (!deleteTargetId) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("clubhouse_reservations")
        .delete()
        .eq("id", deleteTargetId);
      if (error) throw error;
      toast.success("Réservation supprimée");
      setDeleteOpen(false);
      setDeleteTargetId(null);
      await refreshClubs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la suppression");
    } finally {
      setSaving(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground" role="status" aria-live="polite">
          Chargement...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-6xl mx-auto section-gap">
      {/* ── En-tête ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sofa className="h-6 w-6" aria-hidden="true" />
            Club House
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Calendrier de réservation de l&apos;espace commun du club
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/club")}>
          Retour à l&apos;espace club
        </Button>
      </div>

      {/* ── Pas de club ── */}
      {clubs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Vous n&apos;êtes rattaché à aucun club pour le moment.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── Sélecteur de club (si plusieurs) ── */}
          {clubs.length > 1 && (
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
                  aria-pressed={c.id === selectedClubId}
                >
                  <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {club && (
            <>
              {/* ── Bouton "Nouvelle réservation" (visible si canManage) ── */}
              {club.canManage && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={openCreateDialog}
                    aria-label="Créer une nouvelle réservation du Club House"
                  >
                    <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
                    Nouvelle réservation
                  </Button>
                </div>
              )}

              {/* ── Corps : calendrier + liste ── */}
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Calendrier */}
                <div className="shrink-0 w-full lg:w-auto">
                  <Card className="overflow-hidden">
                    <CardContent className="p-3 flex justify-center">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(date) => date && setSelectedDate(date)}
                        locale={fr}
                        modifiers={{ hasReservation }}
                        modifiersClassNames={{
                          hasReservation:
                            "after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-[var(--color-gold)]",
                        }}
                      />
                    </CardContent>
                  </Card>
                </div>

                {/* Liste des réservations du jour */}
                <div className="flex-1 min-w-0">
                  <div className="mb-3">
                    <h2 className="text-base font-semibold">
                      {selectedDate.toLocaleDateString("fr-FR", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </h2>
                  </div>

                  {todayReservations.length === 0 ? (
                    <Card>
                      <CardContent className="py-8 text-center text-muted-foreground" role="status">
                        Aucune réservation pour ce jour.
                      </CardContent>
                    </Card>
                  ) : (
                    <ul className="space-y-3" aria-label="Réservations du jour sélectionné" aria-live="polite">
                      {todayReservations.map((r) => (
                        <li key={r.id}>
                          <Card>
                            <CardContent className="py-3 px-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  {/* Horaires */}
                                  <p className="text-sm font-semibold tabular-nums text-muted-foreground">
                                    {fmtTime(r.start_time)} – {fmtTime(r.end_time)}
                                  </p>
                                  {/* Titre */}
                                  <p className="font-medium mt-0.5 break-words">{r.title}</p>
                                  {/* Description */}
                                  {r.description && (
                                    <p className="text-sm text-muted-foreground mt-1 break-words">
                                      {r.description}
                                    </p>
                                  )}
                                  {/* Créateur */}
                                  {r.creator && (
                                    <p className="text-xs text-muted-foreground mt-1.5">
                                      Créé par {creatorName(r)}
                                    </p>
                                  )}
                                </div>
                                {/* Bouton suppression (visible si canManage) */}
                                {club.canManage && (
                                  <button
                                    type="button"
                                    title={`Supprimer la réservation « ${r.title} »`}
                                    aria-label={`Supprimer la réservation « ${r.title} »`}
                                    onClick={() => {
                                      setDeleteTargetId(r.id);
                                      setDeleteOpen(true);
                                    }}
                                    className="shrink-0 rounded p-1 text-muted-foreground hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors mt-0.5"
                                  >
                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                                  </button>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {!club.canManage && (
                <Badge variant="secondary" className="text-[10px]">
                  Lecture seule
                </Badge>
              )}
            </>
          )}
        </>
      )}

      {/* ── Dialog "Nouvelle réservation" ── */}
      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setCreateError(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle réservation</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Titre */}
            <div className="space-y-1">
              <Label htmlFor="res-title">
                Titre <span aria-hidden="true" className="text-destructive">*</span>
              </Label>
              <Input
                id="res-title"
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                placeholder="Ex : Réunion de bureau"
                required
                aria-required="true"
                aria-describedby={createError ? "res-error" : undefined}
              />
            </div>
            {/* Description */}
            <div className="space-y-1">
              <Label htmlFor="res-description">Description <span className="text-muted-foreground font-normal">(optionnelle)</span></Label>
              <Textarea
                id="res-description"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder="Détails de la réservation..."
                rows={2}
              />
            </div>
            {/* Date */}
            <div className="space-y-1">
              <Label htmlFor="res-date">
                Date <span aria-hidden="true" className="text-destructive">*</span>
              </Label>
              <Input
                id="res-date"
                type="date"
                value={createDate}
                onChange={(e) => setCreateDate(e.target.value)}
                required
                aria-required="true"
              />
            </div>
            {/* Horaires */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="res-start-time">
                  Heure de début <span aria-hidden="true" className="text-destructive">*</span>
                </Label>
                <Input
                  id="res-start-time"
                  type="time"
                  value={createStartTime}
                  onChange={(e) => setCreateStartTime(e.target.value)}
                  required
                  aria-required="true"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="res-end-time">
                  Heure de fin <span aria-hidden="true" className="text-destructive">*</span>
                </Label>
                <Input
                  id="res-end-time"
                  type="time"
                  value={createEndTime}
                  onChange={(e) => setCreateEndTime(e.target.value)}
                  required
                  aria-required="true"
                />
              </div>
            </div>
            {/* Message d'erreur (conflit ou validation) */}
            {createError && (
              <p id="res-error" className="text-sm text-destructive" role="alert" aria-live="assertive">
                {createError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setCreateOpen(false); setCreateError(null); }}
              disabled={saving}
            >
              Annuler
            </Button>
            <Button
              onClick={handleCreateReservation}
              disabled={saving || !createTitle.trim()}
              aria-disabled={saving || !createTitle.trim()}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" aria-hidden="true" />}
              {saving ? "Création en cours…" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog de confirmation de suppression (Tâche 2.3) ── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer la réservation</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground" id="delete-confirm-desc">
            Êtes-vous sûr de vouloir supprimer cette réservation ? Cette action
            est irréversible.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteOpen(false);
                setDeleteTargetId(null);
              }}
              disabled={saving}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={saving}
              aria-describedby="delete-confirm-desc"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" aria-hidden="true" />}
              {saving ? "Suppression…" : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
