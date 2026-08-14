"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useTeam } from "@/lib/team";
import { authFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Users, Loader2, Check } from "lucide-react";
import { toast } from "sonner";

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
      <div className="px-4 pt-4 pb-1">
        <h2 className="text-xl font-bold">Lier un enfant</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Sélectionnez le ou les joueurs qui sont vos enfants pour suivre leurs
          convocations, résultats et notifications.
        </p>
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
