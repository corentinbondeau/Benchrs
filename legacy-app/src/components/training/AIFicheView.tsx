import { Card, CardContent } from "@/components/ui/card";
import { Dumbbell, Shirt } from "lucide-react";
import type { AISession } from "@/lib/training/ai-generator";

export function AIFicheView({ session }: { session: AISession }) {
  return (
    <div className="space-y-3">
      {session.material && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-semibold mb-1 flex items-center gap-1.5">
              <Shirt className="h-3.5 w-3.5" />
              Matériel nécessaire
            </p>
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
            <h4 className="font-semibold text-sm mb-3 flex items-center gap-1.5">
              <Dumbbell className="h-3.5 w-3.5" />
              Conseils du coach (Méthodologie UEFA B)
            </h4>
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
  );
}

export function isAiSessionExercises(ex: unknown): ex is AISession {
  return !!ex && Array.isArray((ex as AISession).sections);
}
