"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { authFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  CalendarCheck,
  BellRing,
  MessageCircle,
  LineChart,
  ChevronRight,
  ChevronLeft,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

const STEPS = [
  {
    icon: Sparkles,
    title: "Bienvenue !",
    body: "Benchrs vous permet de suivre la saison de votre enfant : convocations, entraînements, matches, résultats et bien plus. Voici un rapide tour d'horizon.",
  },
  {
    icon: CalendarCheck,
    title: "Convocations & présence",
    body: "Répondez aux convocations depuis les notifications ou le calendrier : présent, absent, excusé. Le coach voit votre réponse instantanément.",
  },
  {
    icon: BellRing,
    title: "Notifications push",
    body: "Activez les notifications dans Réglages → Notifications pour ne rien manquer : convocations, rappels, compte-rendus de match et messages du coach.",
  },
  {
    icon: MessageCircle,
    title: "Messagerie avec le coach",
    body: "Chaque enfant dispose d'un canal de discussion privé avec le coach, accessible dans l'onglet Messagerie. Une question ? Écrivez directement au coach.",
  },
  {
    icon: LineChart,
    title: "Suivi de l'enfant",
    body: "Retrouvez sur la fiche de votre enfant ses statistiques, ses notes, ses performances VMA/VMI, ses trophées et le compte-rendu de chaque match.",
  },
];

export function ParentOnboarding() {
  const { user, refreshUser } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const isParent = user?.profile?.role === "parent";
  const alreadyDone = user?.profile?.parent_onboarding_done;
  if (!isParent || alreadyDone) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  async function markDone() {
    if (saving) return;
    setSaving(true);
    try {
      const res = await authFetch("/api/account/onboarding-done", {
        method: "POST",
      });
      if (res.ok) {
        await refreshUser();
      } else {
        const data = await res.json();
        toast.error(data.error || "Erreur lors de la fin du guide");
        setSaving(false);
      }
    } catch {
      toast.error("Erreur de connexion au serveur");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--color-navy)] p-5">
      <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-gold)]/15">
            <Icon className="h-8 w-8 text-[var(--color-gold)]" />
          </div>
        </div>

        <h2 className="mt-4 text-center text-xl font-bold">
          {current.title}
        </h2>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          {current.body}
        </p>

        <div className="mt-5 flex items-center justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step
                  ? "w-6 bg-[var(--color-gold)]"
                  : i < step
                    ? "w-1.5 bg-[var(--color-gold)]/60"
                    : "w-1.5 bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>

        <div className="mt-6 flex gap-2">
          <Button
            variant="ghost"
            className="flex-1"
            onClick={markDone}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Passer"}
          </Button>
          {step > 0 && !isLast && (
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setStep(step - 1)}
              disabled={saving}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Précédent
            </Button>
          )}
          <Button
            className="flex-1 bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
            onClick={isLast ? markDone : () => setStep(step + 1)}
            disabled={saving}
          >
            {isLast ? "C'est parti" : "Suivant"}
            {!isLast && <ChevronRight className="h-4 w-4 ml-1" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
