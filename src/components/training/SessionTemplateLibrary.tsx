"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BookOpen,
  Search,
  Sparkles,
  Play,
  Loader2,
  Clock,
  Filter,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { authFetch } from "@/lib/api-client";
import type { AISession } from "@/lib/training/ai-generator";

interface SessionTemplate {
  id: string;
  title: string;
  phase: string;
  objective: string | null;
  expertise: string;
  is_shared: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

interface Props {
  teamId: string;
  /** Callback appelé quand le coach clique "Utiliser ce template". Reçoit la session complète. */
  onUse?: (session: AISession, templateId: string) => void;
}

const PHASE_LABELS: Record<string, string> = {
  ATHLETISATION: "Athlétisation",
  "PREPARATION PHYSIQUE": "Prépa physique",
  DEFENSIVE: "Défensif",
  OFFENSIVE: "Offensif",
  "TRANSITION OFFENSIVE": "Transition off.",
  "TRANSITION DEFENSIVE": "Transition déf.",
  "JEU EN PLACE": "Jeu en place",
};

const PHASE_COLORS: Record<string, string> = {
  ATHLETISATION: "bg-orange-50 text-orange-700 border-orange-200",
  "PREPARATION PHYSIQUE": "bg-red-50 text-red-700 border-red-200",
  DEFENSIVE: "bg-blue-50 text-blue-700 border-blue-200",
  OFFENSIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  "TRANSITION OFFENSIVE": "bg-purple-50 text-purple-700 border-purple-200",
  "TRANSITION DEFENSIVE": "bg-indigo-50 text-indigo-700 border-indigo-200",
};

function phaseLabel(phase: string) {
  return PHASE_LABELS[phase] ?? phase;
}

function phaseColor(phase: string) {
  return PHASE_COLORS[phase] ?? "bg-muted text-muted-foreground border-border";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function SessionTemplateLibrary({ teamId, onUse }: Props) {
  const [templates, setTemplates] = useState<SessionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activePhase, setActivePhase] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    const params = new URLSearchParams({ team_id: teamId });
    if (activePhase) params.set("phase", activePhase);
    if (search.trim()) params.set("q", search.trim());

    authFetch(`/api/trainings/templates?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error("Erreur lors du chargement");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setTemplates(data.templates ?? []);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        toast.error(e instanceof Error ? e.message : "Erreur");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [teamId, activePhase, search]);

  async function handleUse(template: SessionTemplate) {
    if (!onUse) return;
    setLoadingId(template.id);
    try {
      // Charger les session_data complètes depuis Supabase côté client
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data, error } = await supabase
        .from("session_templates")
        .select("session_data")
        .eq("id", template.id)
        .single();

      if (error || !data?.session_data) {
        throw new Error("Impossible de charger le template");
      }

      // Incrémenter le compteur d'utilisation
      await supabase
        .from("session_templates")
        .update({ usage_count: template.usage_count + 1 })
        .eq("id", template.id);

      onUse(data.session_data as AISession, template.id);
      toast.success(`Template « ${template.title} » chargé`);

      // Rafraîchir le compteur localement
      setTemplates((prev) =>
        prev.map((t) =>
          t.id === template.id ? { ...t, usage_count: t.usage_count + 1 } : t
        )
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors du chargement");
    } finally {
      setLoadingId(null);
    }
  }

  // Phases présentes dans les templates chargés
  const availablePhases = [...new Set(templates.map((t) => t.phase))].sort();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-[var(--color-gold)]" />
            Bibliothèque de séances
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {loading ? "…" : `${templates.length} template${templates.length !== 1 ? "s" : ""}`}
          </span>
        </div>

        {/* Barre de recherche */}
        <div className="relative mt-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un template..."
            className="pl-8 h-9 text-sm"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filtres par phase */}
        {availablePhases.length > 1 && (
          <div className="flex gap-1.5 flex-wrap mt-1">
            <Button
              size="sm"
              variant={activePhase === "" ? "default" : "outline"}
              className="h-7 px-2.5 text-xs"
              onClick={() => setActivePhase("")}
            >
              <Filter className="h-3 w-3 mr-1" />
              Toutes
            </Button>
            {availablePhases.map((p) => (
              <Button
                key={p}
                size="sm"
                variant={activePhase === p ? "default" : "outline"}
                className="h-7 px-2.5 text-xs"
                onClick={() => setActivePhase(activePhase === p ? "" : p)}
              >
                {phaseLabel(p)}
              </Button>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
            <Sparkles className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {search || activePhase
                ? "Aucun template ne correspond à votre recherche."
                : "Aucun template dans la bibliothèque. Sauvegardez une séance IA pour commencer."}
            </p>
            {(search || activePhase) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSearch("");
                  setActivePhase("");
                }}
              >
                Effacer les filtres
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => (
              <div
                key={t.id}
                className="rounded-lg border bg-card p-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">{t.title}</p>
                    {t.is_shared && (
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 shrink-0 text-[10px] px-1.5 py-0">
                        Partagé
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge className={`${phaseColor(t.phase)} text-[10px] px-1.5 py-0 font-medium`}>
                      {phaseLabel(t.phase)}
                    </Badge>
                    {t.expertise && (
                      <Badge className="bg-[var(--color-gold)]/15 text-[var(--color-gold)] border-[var(--color-gold)]/30 text-[10px] px-1.5 py-0">
                        {t.expertise}
                      </Badge>
                    )}
                  </div>

                  {t.objective && (
                    <p className="text-xs text-muted-foreground line-clamp-1">{t.objective}</p>
                  )}

                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(t.updated_at)}
                    </span>
                    {t.usage_count > 0 && (
                      <span>{t.usage_count} utilisation{t.usage_count > 1 ? "s" : ""}</span>
                    )}
                  </div>
                </div>

                {onUse && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => handleUse(t)}
                    disabled={loadingId === t.id}
                  >
                    {loadingId === t.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    ) : (
                      <Play className="h-3.5 w-3.5 mr-1" />
                    )}
                    Utiliser
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
