"use client";

import { useFontSize, type FontSizeLevel } from "@/hooks/useFontSize";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function FontSizeControl() {
  const { fontSize, changeFontSize } = useFontSize();

  const sizes: { level: FontSizeLevel; label: string; preview: string }[] = [
    { level: "S", label: "Petit (80%)", preview: "A" },
    { level: "M", label: "Moyen (100%)", preview: "A" },
    { level: "L", label: "Grand (120%)", preview: "A" },
    { level: "XL", label: "Très grand (150%)", preview: "A" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Taille d'écriture</CardTitle>
        <CardDescription>
          Ajuste la taille du texte pour une meilleure lisibilité
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Buttons */}
        <div className="flex gap-2 flex-wrap">
          {sizes.map(({ level, label }) => (
            <Button
              key={level}
              onClick={() => changeFontSize(level)}
              variant={fontSize === level ? "default" : "outline"}
              className="flex-1 min-w-fit"
            >
              {label}
            </Button>
          ))}
        </div>

        {/* Preview */}
        <div
          className="p-4 border rounded-lg bg-muted/50 text-center transition-all"
          style={{ fontSize: `calc(1rem * var(--font-size-multiplier))` }}
        >
          Ceci est un aperçu du texte
        </div>

        <p className="text-xs text-muted-foreground">
          Cette préférence est sauvegardée dans votre compte.
        </p>
      </CardContent>
    </Card>
  );
}
