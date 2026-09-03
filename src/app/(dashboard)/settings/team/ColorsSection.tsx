"use client";

import { useState, useEffect } from "react";
import { useTeam } from "@/lib/team";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface ColorsSectionProps {
  isOwner: boolean;
}

export default function ColorsSection({ isOwner }: ColorsSectionProps) {
  const { currentTeam, refreshTeams } = useTeam();
  const [colorPrimary, setColorPrimary] = useState("#EAB308");
  const [colorSecondary, setColorSecondary] = useState("#1E40AF");
  const [savingColors, setSavingColors] = useState(false);

  useEffect(() => {
    if (!currentTeam) return;
    setColorPrimary(currentTeam.color_primary || "#EAB308");
    setColorSecondary(currentTeam.color_secondary || "#1E40AF");
  }, [currentTeam]);

  async function saveColors() {
    if (!currentTeam) return;
    setSavingColors(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("teams")
      .update({ color_primary: colorPrimary, color_secondary: colorSecondary })
      .eq("id", currentTeam.id);
    if (error) {
      toast.error("Erreur lors de la sauvegarde des couleurs");
    } else {
      await refreshTeams();
      toast.success("Couleurs mises à jour !");
    }
    setSavingColors(false);
  }

  if (!isOwner || !currentTeam) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personnalisation</CardTitle>
        <CardDescription>
          Configurez les couleurs de l&apos;interface pour toute l&apos;équipe
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Couleur principale</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={colorPrimary}
                onChange={(e) => setColorPrimary(e.target.value)}
                className="h-10 w-10 rounded border cursor-pointer"
              />
              <Input
                value={colorPrimary}
                onChange={(e) => setColorPrimary(e.target.value)}
                className="font-mono h-10"
                maxLength={7}
              />
            </div>
            <p className="text-xs text-muted-foreground">Boutons CTA, highlights</p>
          </div>
          <div className="space-y-2">
            <Label>Couleur secondaire</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={colorSecondary}
                onChange={(e) => setColorSecondary(e.target.value)}
                className="h-10 w-10 rounded border cursor-pointer"
              />
              <Input
                value={colorSecondary}
                onChange={(e) => setColorSecondary(e.target.value)}
                className="font-mono h-10"
                maxLength={7}
              />
            </div>
            <p className="text-xs text-muted-foreground">Sidebar, accents, liens</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={saveColors}
            disabled={savingColors}
            variant="primary"
          >
            {savingColors ? "Sauvegarde..." : "Sauvegarder les couleurs"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setColorPrimary("#EAB308");
              setColorSecondary("#1E40AF");
            }}
          >
            Réinitialiser
          </Button>
        </div>
        <div className="rounded-lg border p-3 flex items-center gap-4 bg-muted/50">
          <div className="h-10 w-10 rounded-lg" style={{ backgroundColor: colorPrimary }} />
          <div className="h-10 w-10 rounded-lg" style={{ backgroundColor: colorSecondary }} />
          <span className="text-sm text-muted-foreground">Aperçu</span>
        </div>
      </CardContent>
    </Card>
  );
}
