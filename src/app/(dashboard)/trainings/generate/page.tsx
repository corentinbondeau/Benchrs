"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Clock, Sparkles, FileDown, Dumbbell, Eye } from "lucide-react";
import { toast } from "sonner";
import { TACTICAL_PHASES, TACTICAL_PHASE_NAMES } from "@/lib/training/phases";
import {
  EXPERTISE_LEVELS,
  FOOTBALL_SYSTEMS,
  type AISession,
  type ExpertiseLevel,
} from "@/lib/training/ai-generator";

export default function GenerateTrainingPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<string>(TACTICAL_PHASE_NAMES[0]);
  const [objectives, setObjectives] = useState<string[]>([]);
  const [freeObjective, setFreeObjective] = useState("");
  const [playerCount, setPlayerCount] = useState(12);
  const [systeme, setSysteme] = useState<string>("");
  const [expertise, setExpertise] = useState<ExpertiseLevel>("UEFA B");
  const [generating, setGenerating] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfPages, setPdfPages] = useState<number | null>(null);
  const [session, setSession] = useState<AISession | null>(null);

  function toggleObjective(obj: string) {
    if (objectives.includes(obj)) {
      setObjectives(objectives.filter((x) => x !== obj));
    } else if (objectives.length < 2) {
      setObjectives([...objectives, obj]);
    }
  }

  async function handleGenerate() {
    const allObjectives = [
      ...objectives,
      ...(freeObjective.trim() ? [freeObjective.trim()] : []),
    ];
    if (allObjectives.length === 0) {
      toast.error("Sélectionne un objectif ou décris-en un");
      return;
    }
    setGenerating(true);
    setPdfUrl(null);
    setPdfPages(null);
    setSession(null);
    try {
      const res = await fetch("/api/trainings/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase, objectives: allObjectives, playerCount, systeme: systeme || undefined, expertise }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Erreur");
      }
      const data = await res.json();
      const pdfData = data.pdf as string;
      const base64 = pdfData.split(",")[1] || "";
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      setPdfPages((base64.match(/\/Type \/Page\b/g) || []).length || null);
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      setSession(data.session as AISession);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la génération");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      <div className="flex items-center gap-3">
        <button className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted transition-colors" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-xl md:text-2xl font-bold">Générer une séance</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Fiche de séance complète générée par IA</p>
        </div>
      </div>

      {!pdfUrl ? (
        <div className="space-y-6 max-w-xl">
          {/* Phase */}
          <div className="space-y-3">
            <label className="text-sm font-semibold">Phase de jeu</label>
            <div className="grid grid-cols-1 gap-2">
              {TACTICAL_PHASE_NAMES.map((p) => (
                <button
                  key={p}
                  className={`rounded-lg border p-3 text-left transition-all ${phase === p ? "border-[var(--color-royal)] bg-blue-50 ring-1 ring-[var(--color-royal)]" : "hover:border-blue-200"}`}
                  onClick={() => { setPhase(p); setObjectives([]); }}
                >
                  <p className="font-medium text-sm">{p}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Objectifs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold">Objectifs (1 ou 2 max)</label>
              <span className="text-xs text-muted-foreground">{objectives.length}/2</span>
            </div>
            {TACTICAL_PHASES[phase].length > 0 ? (
              <div className="space-y-2">
                {TACTICAL_PHASES[phase].map((obj) => (
                  <button
                    key={obj}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition-all ${objectives.includes(obj) ? "bg-[var(--color-royal)] text-white border-[var(--color-royal)]" : "hover:border-blue-200"}`}
                    onClick={() => toggleObjective(obj)}
                  >
                    {obj}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucun objectif prédéfini pour cette phase — choisis la phase de jeu ou décris l&apos;objectif dans le champ libre.</p>
            )}
          </div>

          {/* Objectif libre (optionnel) */}
          <div className="space-y-3">
            <label className="text-sm font-semibold">Objectif spécifique (optionnel)</label>
            <Textarea
              value={freeObjective}
              onChange={(e) => setFreeObjective(e.target.value)}
              placeholder="Ex : Améliorer le jeu du troisième homme, travailler la fermeture des espaces intérieurs..."
              rows={2}
            />
          </div>

          {/* Joueurs */}
          <div className="space-y-3">
            <label className="text-sm font-semibold">Nombre de joueurs présents</label>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => setPlayerCount(Math.max(4, playerCount - 1))}>-</Button>
              <span className="text-2xl font-bold min-w-[3rem] text-center">{playerCount}</span>
              <Button variant="outline" size="sm" onClick={() => setPlayerCount(Math.min(30, playerCount + 1))}>+</Button>
            </div>
          </div>

          {/* Système de jeu (optionnel) */}
          <div className="space-y-3">
            <label className="text-sm font-semibold">Système de jeu (optionnel)</label>
            <div className="flex flex-wrap gap-2">
              <button
                className={`rounded-lg border px-3 py-1.5 text-sm transition-all ${systeme === "" ? "border-[var(--color-royal)] bg-blue-50 ring-1 ring-[var(--color-royal)]" : "hover:border-blue-200"}`}
                onClick={() => setSysteme("")}
              >
                Aucun
              </button>
              {FOOTBALL_SYSTEMS.map((s) => (
                <button
                  key={s}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition-all ${systeme === s ? "border-[var(--color-royal)] bg-blue-50 ring-1 ring-[var(--color-royal)]" : "hover:border-blue-200"}`}
                  onClick={() => setSysteme(s)}
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">L&apos;IA adaptera l&apos;animation offensive/défensive à ce système.</p>
          </div>

          {/* Niveau d'expertise */}
          <div className="space-y-3">
            <label className="text-sm font-semibold">Niveau d&apos;expertise du coach IA</label>
            <div className="flex flex-wrap gap-2">
              {EXPERTISE_LEVELS.map((e) => (
                <button
                  key={e}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition-all ${expertise === e ? "border-[var(--color-royal)] bg-blue-50 ring-1 ring-[var(--color-royal)]" : "hover:border-blue-200"}`}
                  onClick={() => setExpertise(e)}
                >
                  {e}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Le niveau adapte la pédagogie et la profondeur de la fiche (consignes simples pour BMF, détails méthodologiques avancés pour UEFA A).</p>
          </div>

          <Button
            className="w-full bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold"
            onClick={handleGenerate}
            disabled={generating}
          >
            <Sparkles className="h-4 w-4 mr-1" />
            {generating ? "Génération par l'IA..." : "Générer la séance"}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <Card className="bg-gradient-to-r from-[var(--color-navy)] to-[var(--color-royal)] text-white">
            <CardContent className="p-6 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-lg font-bold truncate">{session?.title || "Fiche de séance"}</h3>
                <p className="text-sm text-white/80 mt-1 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />Séance de 90 min · niveau {expertise} · avec animation simple
                </p>
                {pdfPages && (
                  <p className="text-xs text-emerald-300 mt-1.5 flex items-center gap-1">
                    ✓ PDF prêt · {pdfPages} pages
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  className="bg-white/10 text-white border-white/30"
                  onClick={() => pdfUrl && window.open(pdfUrl, "_blank")}
                >
                  <Eye className="h-4 w-4 mr-1" />
                  Ouvrir le PDF
                </Button>
                <a
                  href={pdfUrl || undefined}
                  download={`${session?.title || "seance"}.pdf`.replace(/[^\w\s-]/g, "").trim()}
                >
                  <Button className="w-full bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold">
                    <FileDown className="h-4 w-4 mr-1" />
                    Télécharger
                  </Button>
                </a>
              </div>
            </CardContent>
          </Card>

          <div className="rounded-lg border bg-muted/30 hidden md:block">
            <iframe
              src={pdfUrl || undefined}
              title="Fiche de séance"
              className="w-full rounded-lg"
              style={{ height: "70vh" }}
            />
          </div>
          <Button
            variant="outline"
            className="w-full md:hidden"
            onClick={() => pdfUrl && window.open(pdfUrl, "_blank")}
          >
            <Eye className="h-4 w-4 mr-1" />
            Ouvrir le PDF (viewer natif)
          </Button>

          {session && (
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Dumbbell className="h-4 w-4" />
                Fiche détaillée
              </h3>

              {session.material && (
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm font-semibold mb-1">Matériel nécessaire</p>
                    <p className="text-sm text-muted-foreground">{session.material}</p>
                  </CardContent>
                </Card>
              )}

              {session.sections.map((section, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <h4 className="font-semibold text-sm">{section.name}</h4>
                      {section.duration > 0 && (
                        <span className="text-xs text-muted-foreground shrink-0">{section.duration} min</span>
                      )}
                    </div>
                    <div className="space-y-3">
                      {section.items.map((item, j) => (
                        <div key={j}>
                          {item.label && <p className="text-xs font-semibold text-[var(--color-royal)] mb-0.5">{item.label}</p>}
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.text}</p>
                        </div>
                      ))}
                    </div>
                    {section.variants.length > 0 && (
                      <div className="mt-3 border-t pt-3">
                        <p className="text-xs font-semibold mb-1.5">Variantes / Progression</p>
                        <ul className="space-y-1">
                          {section.variants.map((v, k) => (
                            <li key={k} className="flex items-start gap-2 text-sm text-muted-foreground">
                              <span className="text-[var(--color-gold)]">•</span>
                              {v}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {section.animation && (
                      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                        <p className="text-xs font-semibold text-emerald-700 mb-1.5">Animation simple (déroulé)</p>
                        <p className="text-sm text-emerald-900 whitespace-pre-wrap">{section.animation}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}

              {session.conseilsCoach.length > 0 && (
                <Card className="border-[var(--color-gold)]/40">
                  <CardContent className="p-4">
                    <h4 className="font-semibold text-sm mb-3">Conseils du coach (niveau {expertise})</h4>
                    <ol className="space-y-2">
                      {session.conseilsCoach.map((tip, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-gold)] text-[var(--color-navy)] text-xs font-bold mt-0.5">
                            {i + 1}
                          </span>
                          <span className="text-muted-foreground">{tip}</span>
                        </li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => { setPdfUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; }); setSession(null); }}>
              Modifier les critères
            </Button>
            <Button
              className="flex-1 bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? "Génération..." : "Régénérer"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
