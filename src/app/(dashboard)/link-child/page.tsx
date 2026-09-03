"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useTeam } from "@/lib/team";
import { authFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Users, Loader2, Check, UserPlus } from "lucide-react";
import { toast } from "sonner";

type AddPlayerForm = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  position: string;
  shirtNumber: string;
  hasEmail: boolean;
  email: string;
};

const POSITIONS = ["Gardien", "Défenseur", "Milieu", "Attaquant"];

type Player = {
  id: string;
  first_name: string;
  last_name: string;
  shirt_number: number | null;
  position: string | null;
};

function LinkChildForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { currentTeam } = useTeam();
  const teamId = searchParams.get("teamId") || currentTeam?.id || "";
  const [players, setPlayers] = useState<Player[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<AddPlayerForm>({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    position: "",
    shirtNumber: "",
    hasEmail: false,
    email: "",
  });
  const [createSaving, setCreateSaving] = useState(false);

  useEffect(() => {
    if (!teamId) return;
    const supabase = createClient();

    async function loadPlayers() {
      const { data: members } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("team_id", teamId)
        .eq("role", "player");

      if (!members || members.length === 0) {
        setPlayers([]);
        setLoading(false);
        return;
      }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, shirt_number, position")
        .in("id", members.map((m) => m.user_id))
        .eq("is_active", true)
        .order("last_name", { ascending: true });

      setPlayers((profiles as Player[]) || []);
      setLoading(false);
    }

    loadPlayers();
  }, [teamId]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function goToDashboard() {
    if (teamId) localStorage.setItem("selectedTeamId", teamId);
    router.push("/");
  }

  async function handleCreatePlayer(e: React.FormEvent) {
    e.preventDefault();
    if (!teamId) return;
    setCreateSaving(true);
    try {
      const res = await authFetch("/api/auth/create-player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          firstName: createForm.firstName,
          lastName: createForm.lastName,
          dateOfBirth: createForm.dateOfBirth || undefined,
          position: createForm.position || undefined,
          shirtNumber: createForm.shirtNumber || undefined,
          email: createForm.hasEmail && createForm.email ? createForm.email : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erreur lors de la création du profil");
        return;
      }
      toast.success("Profil créé et lié à votre compte");
      setCreateDialogOpen(false);
      setCreateForm({ firstName: "", lastName: "", dateOfBirth: "", position: "", shirtNumber: "", hasEmail: false, email: "" });
      // Ajouter le joueur créé à la sélection et recharger la liste
      const newPlayerId: string = (data.player as { id: string }).id;
      const supabase = createClient();
      const { data: members } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("team_id", teamId)
        .eq("role", "player");
      if (members && members.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, shirt_number, position")
          .in("id", members.map((m) => m.user_id))
          .eq("is_active", true)
          .order("last_name", { ascending: true });
        setPlayers((profiles as Player[]) || []);
      }
      setSelected((prev) => new Set([...prev, newPlayerId]));
    } catch {
      toast.error("Erreur de connexion au serveur");
    } finally {
      setCreateSaving(false);
    }
  }

  async function handleConfirm() {
    if (!teamId || selected.size === 0) return;
    setSaving(true);
    try {
      const res = await authFetch("/api/auth/link-child", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, studentIds: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erreur lors de la liaison");
        setSaving(false);
        return;
      }
      toast.success(
        selected.size > 1
          ? `${selected.size} joueurs liés à votre compte`
          : "Joueur lié à votre compte"
      );
      goToDashboard();
    } catch {
      toast.error("Erreur de connexion au serveur");
      setSaving(false);
    }
  }

  if (!teamId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <Users className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="font-semibold text-lg">Aucune équipe sélectionnée</h3>
        <Button onClick={goToDashboard} className="mt-6">
          Aller au tableau de bord
        </Button>
      </div>
    );
  }

  return (
    <div className="section-gap">
      <div className="px-4 pt-4 pb-1 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Lier un enfant</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Sélectionnez le ou les joueurs qui sont vos enfants pour suivre leurs
            convocations, résultats et notifications.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateDialogOpen(true)}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors mt-1"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Créer
        </button>
      </div>

      {loading ? (
        <div className="px-4 mt-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : players.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center px-4">
          <Users className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="font-semibold text-lg">Aucun joueur</h3>
          <p className="text-muted-foreground text-sm mt-1 max-w-sm">
            Aucun joueur actif dans cette équipe pour le moment. Vous pourrez
            lier votre enfant plus tard.
          </p>
          <Button onClick={goToDashboard} className="mt-6">
            Aller au tableau de bord
          </Button>
        </div>
      ) : (
        <div className="px-4 mt-4 space-y-2">
          {players.map((player) => {
            const checked = selected.has(player.id);
            return (
              <button
                key={player.id}
                type="button"
                onClick={() => toggle(player.id)}
                className={`w-full flex items-center gap-3 rounded-xl border p-4 text-left transition-colors touch-manipulation ${
                  checked
                    ? "border-[var(--color-gold)] bg-[var(--color-gold)]/10"
                    : "bg-card"
                }`}
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold shrink-0 ${
                    checked ? "bg-[var(--color-gold)] text-[var(--color-navy)]" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {player.shirt_number || `${player.first_name[0]}${player.last_name[0]}`}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[15px]">
                    {player.first_name} {player.last_name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {player.position || "Joueur"}
                  </p>
                </div>
                {checked && <Check className="h-5 w-5 text-[var(--color-gold)] shrink-0" />}
              </button>
            );
          })}

          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={goToDashboard}
              disabled={saving}
            >
              Plus tard
            </Button>
            <Button
              className="flex-1 bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold"
              onClick={handleConfirm}
              disabled={selected.size === 0 || saving}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lier"}
            </Button>
          </div>
        </div>
      )}

      {/* Dialog créer profil enfant */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Créer le profil de mon enfant</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreatePlayer} className="space-y-3 mt-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Prénom *</label>
                <input
                  required
                  type="text"
                  value={createForm.firstName}
                  onChange={(e) => setCreateForm((f) => ({ ...f, firstName: e.target.value }))}
                  placeholder="Prénom"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/40"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Nom *</label>
                <input
                  required
                  type="text"
                  value={createForm.lastName}
                  onChange={(e) => setCreateForm((f) => ({ ...f, lastName: e.target.value }))}
                  placeholder="Nom"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/40"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Adresse email</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="createHasEmail"
                    checked={!createForm.hasEmail}
                    onChange={() => setCreateForm((f) => ({ ...f, hasEmail: false, email: "" }))}
                    className="accent-[var(--color-primary-blue)]"
                  />
                  Pas d&apos;email
                </label>
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="createHasEmail"
                    checked={createForm.hasEmail}
                    onChange={() => setCreateForm((f) => ({ ...f, hasEmail: true }))}
                    className="accent-[var(--color-primary-blue)]"
                  />
                  A une adresse email
                </label>
              </div>
              {createForm.hasEmail && (
                <input
                  type="email"
                  required
                  value={createForm.email}
                  onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="email@exemple.com"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/40"
                />
              )}
              {!createForm.hasEmail && (
                <p className="text-[11px] text-muted-foreground">
                  Un compte de service sera créé. Votre enfant pourra revendiquer son compte plus tard en ajoutant son email.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Date de naissance</label>
              <input
                type="date"
                value={createForm.dateOfBirth}
                onChange={(e) => setCreateForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/40"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Poste</label>
                <select
                  value={createForm.position}
                  onChange={(e) => setCreateForm((f) => ({ ...f, position: e.target.value }))}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/40"
                >
                  <option value="">— Poste —</option>
                  {POSITIONS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">N° maillot</label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={createForm.shirtNumber}
                  onChange={(e) => setCreateForm((f) => ({ ...f, shirtNumber: e.target.value }))}
                  placeholder="Ex : 10"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/40"
                />
              </div>
            </div>
            <DialogFooter className="-mx-0 -mb-0 border-t-0 bg-transparent p-0 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
                disabled={createSaving}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={createSaving}
                className="bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90"
              >
                {createSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Créer le profil"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function LinkChildPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Chargement...</p></div>}>
      <LinkChildForm />
    </Suspense>
  );
}
