"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Dumbbell, Clock, Target, Users } from "lucide-react";
import { toast } from "sonner";
import { PHASES, PHASE_OBJECTIVES, THEMES, type Phase } from "@/lib/training/generator";

interface Exercise {
  name: string;
  duration: number;
  description: string;
  drill_type: string;
}

interface GeneratedSession {
  title: string;
  phase: string;
  objectives: string[];
  exercises: Exercise[];
  totalDuration: number;
}

export default function GenerateTrainingPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("perfectionnement");
  const [themes, setThemes] = useState<string[]>([]);
  const [playerCount, setPlayerCount] = useState(12);
  const [generating, setGenerating] = useState(false);
  const [session, setSession] = useState<GeneratedSession | null>(null);

  function toggleTheme(t: string) {
    if (themes.includes(t)) {
      setThemes(themes.filter((x) => x !== t));
    } else if (themes.length < 2) {
      setThemes([...themes, t]);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setSession(null);
    try {
      const res = await fetch("/api/trainings/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase, themes, playerCount }),
      });
      if (!res.ok) throw new Error("Erreur");
      const data = await res.json();
      setSession(data);
    } catch {
      toast.error("Erreur lors de la génération");
    } finally {
      setGenerating(false);
    }
  }

  const phaseObjectives = PHASE_OBJECTIVES[phase] || [];
  const phaseThemes = THEMES[phase] || [];

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      <div className="flex items-center gap-3">
        <button className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted transition-colors" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-xl md:text-2xl font-bold">Générer une séance</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Adaptée à votre phase et effectif</p>
        </div>
      </div>

      {!session ? (
        <div className="space-y-6 max-w-xl">
          {/* Phase */}
          <div className="space-y-3">
            <label className="text-sm font-semibold">Phase</label>
            <div className="grid grid-cols-2 gap-2">
              {PHASES.map((p) => (
                <button
                  key={p.value}
                  className={`rounded-lg border p-3 text-left transition-all ${phase === p.value ? "border-[var(--color-royal)] bg-blue-50 ring-1 ring-[var(--color-royal)]" : "hover:border-blue-200"}`}
                  onClick={() => { setPhase(p.value); setThemes([]); }}
                >
                  <p className="font-medium text-sm">{p.label}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Thèmes */}
          {phaseThemes.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold">Thèmes (1 ou 2 max)</label>
                <span className="text-xs text-muted-foreground">{themes.length}/2</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {phaseThemes.map((t) => (
                  <button
                    key={t}
                    className={`px-3 py-2 rounded-lg text-sm border transition-all ${themes.includes(t) ? "bg-[var(--color-royal)] text-white border-[var(--color-royal)]" : "hover:border-blue-200"}`}
                    onClick={() => toggleTheme(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Joueurs */}
          <div className="space-y-3">
            <label className="text-sm font-semibold">Nombre de joueurs présents</label>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => setPlayerCount(Math.max(4, playerCount - 1))}>-</Button>
              <span className="text-2xl font-bold min-w-[3rem] text-center">{playerCount}</span>
              <Button variant="outline" size="sm" onClick={() => setPlayerCount(Math.min(30, playerCount + 1))}>+</Button>
            </div>
          </div>

          <Button
            className="w-full bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? "Génération..." : "Générer la séance"}
          </Button>
        </div>
      ) : (
        <div className="space-y-6 max-w-xl">
          <Card className="bg-gradient-to-r from-[var(--color-navy)] to-[var(--color-royal)] text-white">
            <CardContent className="p-6">
              <h3 className="text-xl font-bold">{session.title}</h3>
              <div className="flex flex-wrap gap-2 mt-3">
                <Badge className="bg-white/20 text-white border-white/30">{session.phase}</Badge>
                {session.objectives.map((obj) => (
                  <Badge key={obj} className="bg-[var(--color-gold)] text-[var(--color-navy)]">{obj}</Badge>
                ))}
                <Badge className="bg-white/20 text-white border-white/30">
                  <Clock className="h-3 w-3 mr-1" />{session.totalDuration} min
                </Badge>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <h4 className="font-semibold flex items-center gap-2">
              <Dumbbell className="h-4 w-4" />
              Exercices ({session.exercises.length})
            </h4>
            {session.exercises.map((ex, i) => (
              <Card key={i}>
                <CardContent className="p-4 flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-royal)]/10 text-[var(--color-royal)] text-xs font-bold">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{ex.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{ex.description}</p>
                  </div>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <Clock className="h-3 w-3" />{ex.duration}min
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setSession(null)}>
              Modifier les critères
            </Button>
            <Button
              className="flex-1 bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold"
              onClick={handleGenerate}
            >
              Régénérer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
