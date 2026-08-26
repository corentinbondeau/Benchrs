"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api-client";
import { enablePushSubscription } from "@/lib/push";
import { POSITIONS } from "@/lib/positions";
import {
  resolveOnboardingRole,
  getOnboardingSteps,
  isOnboardingNeeded,
  getMissingIdentityFields,
  type OnboardingStep,
} from "@/lib/onboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  UserCircle2,
  ShirtIcon,
  Users2,
  Wrench,
  BellRing,
  ChevronRight,
  ChevronLeft,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

const STEP_META: Record<
  OnboardingStep,
  { icon: typeof Sparkles; title: string }
> = {
  welcome: { icon: Sparkles, title: "Bienvenue sur Benchrs !" },
  identity: { icon: UserCircle2, title: "Vos informations" },
  player_profile: { icon: ShirtIcon, title: "Votre profil joueur" },
  link_child: { icon: Users2, title: "Lier un enfant" },
  coach_tools: { icon: Wrench, title: "Vos outils coach" },
  notifications: { icon: BellRing, title: "Notifications" },
  done: { icon: Sparkles, title: "C'est prêt !" },
};

export function UniversalOnboarding() {
  const router = useRouter();
  const { user, loading, refreshUser } = useAuth();
  const { userRole, clubMemberships, currentTeam } = useTeam();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [firstName, setFirstName] = useState(user?.profile?.first_name || "");
  const [lastName, setLastName] = useState(user?.profile?.last_name || "");
  const [dateOfBirth, setDateOfBirth] = useState(
    user?.profile?.date_of_birth || ""
  );
  const [phone, setPhone] = useState(user?.profile?.phone || "");
  const [position, setPosition] = useState(user?.profile?.position || "");
  const [shirtNumber, setShirtNumber] = useState(
    user?.profile?.shirt_number ? String(user.profile.shirt_number) : ""
  );
  const [preferredFoot, setPreferredFoot] = useState(
    user?.profile?.preferred_foot || ""
  );
  const [enablingPush, setEnablingPush] = useState(false);

  const role = useMemo(
    () =>
      resolveOnboardingRole({
        teamRole: userRole,
        profileRole: user?.profile?.role ?? null,
        hasClubMembership: clubMemberships.length > 0,
      }),
    [userRole, user?.profile?.role, clubMemberships.length]
  );

  const steps = useMemo(() => getOnboardingSteps(role), [role]);

  if (loading) return null;
  if (!isOnboardingNeeded(user?.profile)) return null;

  const currentStep = steps[step];
  const meta = STEP_META[currentStep];
  const Icon = meta.icon;
  const isLast = step === steps.length - 1;

  const missingIdentityFields = getMissingIdentityFields({
    first_name: firstName || null,
    last_name: lastName || null,
    date_of_birth: dateOfBirth || null,
    phone: phone || null,
  });

  async function complete() {
    if (saving) return;
    setSaving(true);
    try {
      const res = await authFetch("/api/account/onboarding-complete", {
        method: "POST",
      });
      if (res.ok) {
        await refreshUser();
      } else {
        const data = await res.json().catch(() => null);
        toast.error(data?.error || "Erreur lors de la fin de l'onboarding");
        setSaving(false);
      }
    } catch {
      toast.error("Erreur de connexion au serveur");
      setSaving(false);
    }
  }

  async function saveIdentity() {
    if (!user) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: firstName || null,
        last_name: lastName || null,
        date_of_birth: dateOfBirth || null,
        phone: phone || null,
      })
      .eq("id", user.id);
    if (error) {
      toast.error("Erreur lors de l'enregistrement de vos informations");
      return;
    }
    await refreshUser();
  }

  async function savePlayerProfile() {
    if (!user) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        position: position || null,
        shirt_number: shirtNumber ? Number(shirtNumber) : null,
        preferred_foot: preferredFoot || null,
      })
      .eq("id", user.id);
    if (error) {
      toast.error("Erreur lors de l'enregistrement de votre profil joueur");
      return;
    }
    await refreshUser();
  }

  async function handleLinkChild() {
    await complete();
    router.push("/link-child");
  }

  async function handleEnablePush() {
    if (!user || !currentTeam) return;
    setEnablingPush(true);
    const result = await enablePushSubscription(user.id, currentTeam.id);
    if (!result.ok) {
      toast.error(result.error || "Erreur lors de l'activation des notifications");
    }
    setEnablingPush(false);
  }

  async function handleNext() {
    if (currentStep === "identity") {
      await saveIdentity();
    } else if (currentStep === "player_profile") {
      await savePlayerProfile();
    }
    if (isLast) {
      await complete();
    } else {
      setStep(step + 1);
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

        <h2 className="mt-4 text-center text-xl font-bold">{meta.title}</h2>

        <div className="mt-4">
          {currentStep === "welcome" && (
            <p className="text-center text-sm text-muted-foreground">
              Benchrs vous accompagne au quotidien : convocations,
              entraînements, matches, statistiques et échanges avec votre
              équipe. Prenons quelques instants pour finaliser votre profil.
            </p>
          )}

          {currentStep === "identity" && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="onboarding-first-name">Prénom</Label>
                <Input
                  id="onboarding-first-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="onboarding-last-name">Nom</Label>
                <Input
                  id="onboarding-last-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="onboarding-dob">Date de naissance</Label>
                <Input
                  id="onboarding-dob"
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="onboarding-phone">Téléphone</Label>
                <Input
                  id="onboarding-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              {missingIdentityFields.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Champs à compléter : {missingIdentityFields.join(", ")}
                </p>
              )}
            </div>
          )}

          {currentStep === "player_profile" && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="onboarding-position">Poste</Label>
                <Select value={position} onValueChange={(v) => setPosition(v || "")}>
                  <SelectTrigger id="onboarding-position">
                    <SelectValue placeholder="Sélectionnez un poste" />
                  </SelectTrigger>
                  <SelectContent>
                    {POSITIONS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="onboarding-shirt-number">
                  Numéro de maillot
                </Label>
                <Input
                  id="onboarding-shirt-number"
                  type="number"
                  value={shirtNumber}
                  onChange={(e) => setShirtNumber(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="onboarding-preferred-foot">Pied fort</Label>
                <Select
                  value={preferredFoot}
                  onValueChange={(v) => setPreferredFoot(v || "")}
                >
                  <SelectTrigger id="onboarding-preferred-foot">
                    <SelectValue placeholder="Sélectionnez" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Gauche</SelectItem>
                    <SelectItem value="right">Droit</SelectItem>
                    <SelectItem value="both">Ambidextre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {currentStep === "link_child" && (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">
                Reliez votre compte au profil de votre enfant pour suivre ses
                convocations, ses résultats et ses statistiques.
              </p>
              <Button variant="outline" className="w-full" onClick={handleLinkChild} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lier mon enfant"}
              </Button>
            </div>
          )}

          {currentStep === "coach_tools" && (
            <p className="text-center text-sm text-muted-foreground">
              Gérez vos convocations, plans d'entraînement, feuilles de match
              et statistiques d&apos;équipe directement depuis Benchrs.
            </p>
          )}

          {currentStep === "notifications" && (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">
                Activez les notifications pour ne rien manquer : convocations,
                rappels et messages.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleEnablePush}
                disabled={enablingPush}
              >
                {enablingPush ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Activer les notifications"
                )}
              </Button>
            </div>
          )}

          {currentStep === "done" && (
            <p className="text-center text-sm text-muted-foreground">
              Votre profil est prêt. Bonne saison avec Benchrs !
            </p>
          )}
        </div>

        <div className="mt-5 flex items-center justify-center gap-1.5">
          {steps.map((_, i) => (
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
            onClick={complete}
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
            className="flex-1 bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold"
            onClick={handleNext}
            disabled={saving}
          >
            {isLast ? "Terminer" : "Suivant"}
            {!isLast && <ChevronRight className="h-4 w-4 ml-1" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
