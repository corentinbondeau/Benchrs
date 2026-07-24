"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

export default function RegisterPage() {
  const [step, setStep] = useState<"info" | "team">("info");
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "" as "coach" | "player" | "parent" | "",
    phone: "",
    childEmail: "",
    inviteCode: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmitInfo(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (formData.password !== formData.confirmPassword) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }
    if (!formData.role) {
      setError("Veuillez sélectionner un rôle");
      return;
    }

    setStep("team");
  }

  async function handleSubmitTeam(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Step 1: Register user
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          password: formData.password,
          role: formData.role,
          phone: formData.phone || undefined,
          childEmail: formData.role === "parent" ? formData.childEmail || undefined : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur lors de l'inscription");
        setLoading(false);
        return;
      }

      // Step 2: Auto-login
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (loginError) {
        setError("Compte créé, mais connexion échouée. Veuillez vous connecter.");
        setTimeout(() => router.push("/login"), 2000);
        setLoading(false);
        return;
      }

      // Step 3: If invite code provided, join team
      if (formData.inviteCode) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await fetch("/api/auth/join-team", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: user.id, inviteCode: formData.inviteCode }),
          });
        }
        router.push("/");
      } else {
        // No invite code → redirect to create team
        router.push("/create-team");
      }
    } catch {
      setError("Erreur de connexion au serveur");
      setLoading(false);
    }
  }

  if (step === "team") {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-gold)] text-[var(--color-navy)] font-bold text-lg mx-auto mb-2">
            SP
          </div>
          <CardTitle className="text-2xl">Rejoindre une équipe</CardTitle>
          <CardDescription>
            Entrez un code d&apos;invitation ou créez votre propre équipe
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmitTeam}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive text-center">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="inviteCode">Code d&apos;invitation (optionnel)</Label>
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
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button
              type="submit"
              className="w-full bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
              disabled={loading}
            >
              {loading ? "Inscription..." : formData.inviteCode ? "Rejoindre l'équipe" : "Continuer sans équipe"}
            </Button>
            <Link href="/create-team" className="w-full">
              <Button
                type="button"
                variant="outline"
                className="w-full border-white/20 text-white hover:bg-white/10"
              >
                Créer mon équipe
              </Button>
            </Link>
            <Link href="/login?registered=true" className="text-sm text-muted-foreground hover:underline">
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
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-gold)] text-[var(--color-navy)] font-bold text-lg mx-auto mb-2">
          SP
        </div>
        <CardTitle className="text-2xl">Créer un compte</CardTitle>
        <CardDescription>
          Rejoignez SportPlus en quelques clics
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
            <Label>Role</Label>
            <Select
              value={formData.role}
              onValueChange={(value) =>
                setFormData({ ...formData, role: value as "coach" | "player" | "parent" })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionnez votre rôle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="coach">Coach</SelectItem>
                <SelectItem value="player">Joueur</SelectItem>
                <SelectItem value="parent">Parent</SelectItem>
              </SelectContent>
            </Select>
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

          {formData.role === "parent" && (
            <div className="space-y-2">
              <Label htmlFor="childEmail">Email de votre enfant (joueur)</Label>
              <Input
                id="childEmail"
                type="email"
                placeholder="email@enfant.com"
                value={formData.childEmail}
                onChange={(e) => setFormData({ ...formData, childEmail: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                L&apos;adresse email du compte joueur de votre enfant
              </p>
            </div>
          )}

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
