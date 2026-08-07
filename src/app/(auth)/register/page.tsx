"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function extractCode(next: string | null): string {
  if (!next) return "";
  const m = next.match(/[?&]code=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <p className="text-white/60">Chargement...</p>
      </div>
    }>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const searchParams = useSearchParams();
  const rawNext = searchParams.get("next");
  const next =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : null;
  const [step, setStep] = useState<"info" | "team">("info");
  const [teamMode, setTeamMode] = useState<"join" | "create">("join");
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone: "",
    inviteCode: extractCode(next),
    joinRole: "player",
    clubName: "",
    teamName: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  useEffect(() => {
    import("@/lib/supabase/client").then(({ createClient }) => {
      const client = createClient();
      client.auth.getUser().then(({ data: { user } }) => {
        if (!user) {
          setChecking(false);
          return;
        }
        client
          .from("team_members")
          .select("id")
          .eq("user_id", user.id)
          .limit(1)
          .then(({ data }) => {
            if (data && data.length > 0) {
              window.location.href = "/";
            } else {
              setChecking(false);
            }
          });
      });
    });
  }, []);

  async function handleSubmitInfo(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (formData.password !== formData.confirmPassword) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }

    setStep("team");
  }

  async function handleSubmitTeam(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    // Try register, or login if account already exists
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        password: formData.password,
        phone: formData.phone || undefined,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      // If email already registered, try to login directly
      if (data.error?.includes("already") || data.error?.includes("registered")) {
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });
        if (loginError) {
          // Can't login - redirect to login page
          setError("Un compte existe déjà avec cet email. Connectez-vous avec votre mot de passe.");
          setTimeout(() => (window.location.href = "/login"), 2500);
          setLoading(false);
          return;
        }
        // Login succeeded - check if profile exists, create if not
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: existingProfile } = await supabase
            .from("profiles")
            .select("id")
            .eq("id", user.id)
            .single();
          if (!existingProfile) {
            await supabase.from("profiles").insert({
              id: user.id,
              role: "player",
              first_name: formData.firstName,
              last_name: formData.lastName,
              phone: formData.phone || null,
              is_active: true,
            });
          }
        }
      } else {
        setError(data.error || "Erreur lors de l'inscription");
        setLoading(false);
        return;
      }
    } else {
      // New registration → auto-login
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (loginError) {
        setError("Compte créé, mais connexion échouée. Veuillez vous connecter.");
        setTimeout(() => (window.location.href = "/login"), 2000);
        setLoading(false);
        return;
      }
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Connexion échouée.");
        setLoading(false);
        return;
      }

      if (teamMode === "join" && formData.inviteCode) {
        const joinRes = await authFetch("/api/auth/join-team", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            inviteCode: formData.inviteCode,
            role: formData.joinRole,
          }),
        });
        if (!joinRes.ok) {
          const joinData = await joinRes.json();
          setError(joinData.error || "Erreur lors de la rejointe de l'équipe");
          setLoading(false);
          return;
        }
        const joinData = await joinRes.json();
        localStorage.setItem("selectedTeamId", joinData.team.id);
        if (formData.joinRole === "parent") {
          window.location.href = `/link-child?teamId=${joinData.team.id}`;
        } else {
          window.location.href = "/";
        }
      } else if (teamMode === "create" && formData.clubName && formData.teamName) {
        const teamRes = await authFetch("/api/auth/create-team", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            clubName: formData.clubName,
            teamName: formData.teamName,
          }),
        });

        if (!teamRes.ok) {
          const teamData = await teamRes.json();
          setError(teamData.error || "Erreur lors de la création de l'équipe");
          setLoading(false);
          return;
        }

        const teamData = await teamRes.json();
        localStorage.setItem("selectedTeamId", teamData.team.id);
        const { toast } = await import("sonner");
        toast.success(`Code d'invitation : ${teamData.inviteCode}`, {
          description: "Vous le trouverez dans Paramètres > Équipe",
          duration: 5000,
        });
        window.location.href = "/";
      } else {
        router.push(next || "/create-team");
      }
    } catch {
      setError("Erreur de connexion au serveur");
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-white/60">Chargement...</p>
      </div>
    );
  }

  if (step === "team") {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img src="/favicon.png" alt="Benchrs" className="h-12 w-12 mx-auto mb-2" />
          <CardTitle className="text-2xl">Votre équipe</CardTitle>
          <CardDescription>
            {teamMode === "join"
              ? "Entrez un code d&apos;invitation ou créez votre propre équipe"
              : "Créez un club et une équipe pour commencer"}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmitTeam}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive text-center">
                {error}
              </div>
            )}

            {teamMode === "join" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="inviteCode">Code d&apos;invitation</Label>
                  <Input
                    id="inviteCode"
                    placeholder="abc123def456"
                    value={formData.inviteCode}
                    onChange={(e) => setFormData({ ...formData, inviteCode: e.target.value })}
                    className="text-center font-mono"
                  />
                  <p className="text-xs text-muted-foreground text-center">
                    Demandez le code à votre coach
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Votre rôle dans cette équipe</Label>
                  <Select
                    value={formData.joinRole}
                    onValueChange={(value) =>
                      setFormData({ ...formData, joinRole: value as "player" | "coach" | "parent" })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="player">Joueur</SelectItem>
                      <SelectItem value="coach">Coach</SelectItem>
                      <SelectItem value="parent">Parent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="clubName">Nom du club</Label>
                  <Input
                    id="clubName"
                    placeholder="AS Monaco"
                    value={formData.clubName}
                    onChange={(e) => setFormData({ ...formData, clubName: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="teamName">Nom de l&apos;équipe</Label>
                  <Input
                    id="teamName"
                    placeholder="U17 Senior"
                    value={formData.teamName}
                    onChange={(e) => setFormData({ ...formData, teamName: e.target.value })}
                    required
                  />
                </div>
              </>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button
              type="submit"
              className="w-full bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
              disabled={loading}
            >
              {loading
                ? "Inscription..."
                : teamMode === "join"
                  ? formData.inviteCode
                    ? "Rejoindre l'équipe"
                    : "Continuer sans équipe"
                  : "Créer et continuer"}
            </Button>
            {teamMode === "join" ? (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setTeamMode("create");
                  setError("");
                }}
              >
                Créer mon équipe
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setTeamMode("join");
                  setError("");
                }}
              >
                Rejoindre avec un code
              </Button>
            )}
            <Link
              href={
                next
                  ? `/login?next=${encodeURIComponent(next)}`
                  : "/login?registered=true"
              }
              className="text-sm text-muted-foreground hover:underline"
            >
              Se connecter
            </Link>
          </CardFooter>
        </form>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <img src="/favicon.png" alt="Benchrs" className="h-12 w-12 mx-auto mb-2" />
        <CardTitle className="text-2xl">Créer un compte</CardTitle>
        <CardDescription>
          Rejoignez Benchrs en quelques clics
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmitInfo}>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive text-center">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">Prénom</Label>
              <Input
                id="firstName"
                placeholder="Jean"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Nom</Label>
              <Input
                id="lastName"
                placeholder="Dupont"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="votre@email.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Téléphone (optionnel)</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="06 12 34 56 78"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              minLength={8}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              required
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button
            type="submit"
            className="w-full bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
          >
            Continuer
          </Button>
          <p className="text-sm text-muted-foreground text-center">
            Déjà un compte ?{" "}
            <Link href="/login" className="text-[var(--color-royal)] hover:underline font-medium">
              Se connecter
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
