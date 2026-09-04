"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";
import { toast } from "sonner";
import type { Profile } from "@/types";

/**
 * Bloque la navigation pour les parents qui n'ont pas renseigné leur ville.
 * S'affiche comme une modale plein écran, impossible à fermer sans remplir le champ.
 */
export function CityRequiredGuard() {
  const { user, refreshUser } = useAuth();
  const { userRole } = useTeam();
  const [city, setCity] = useState("");
  const [saving, setSaving] = useState(false);

  const mustFill = userRole === "parent" || userRole === "coach" || userRole === "owner";
  const profile = user?.profile as Profile | undefined;
  const hasCity = !!profile?.city?.trim();

  if (!mustFill || hasCity || !profile) return null;

  async function handleSave() {
    if (!city.trim()) {
      toast.error("Veuillez saisir votre ville");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ city: city.trim() })
      .eq("id", profile!.id);
    setSaving(false);
    if (error) {
      toast.error("Erreur lors de l'enregistrement");
      return;
    }
    toast.success("Ville enregistrée !");
    refreshUser?.();
  }

  return (
    <div className="fixed inset-0 z-[70] bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-primary-blue)]/10">
            <MapPin className="h-5 w-5 text-[var(--color-primary-blue)]" />
          </div>
          <div>
            <h2 className="font-bold text-lg">Renseignez votre ville</h2>
            <p className="text-xs text-muted-foreground">
              Pour faciliter l&apos;organisation du covoiturage
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Les autres parents pourront voir votre ville pour proposer ou rejoindre un covoiturage.
        </p>
        <Input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Ex : Lille, Camphin-en-Pévèle..."
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
        />
        <Button
          variant="primary"
          className="w-full"
          onClick={handleSave}
          disabled={saving || !city.trim()}
        >
          {saving ? "Enregistrement..." : "Continuer"}
        </Button>
      </div>
    </div>
  );
}
