"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { authFetch } from "@/lib/api-client";
import { normalizeFffNumber } from "@/lib/clubs";
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
  const [teamMode, setTeamMode] = useState<"join" | "create" | "comite">("join");
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
    fffNumber: "",
  });
  const [comiteClub, setComiteClub] = useState<{ id: string; name: string } | null>(null);
  const [comiteInviteCode, setComiteInviteCode] = useState("");
  const [matchFormat, setMatchFormat] = useState(11);
  const [halfDuration, setHalfDuration] = useState(45);
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

  async function handleLookupComiteFff(value: string) {
    const fff = normalizeFffNumber(value);
    if (!fff) {
      setComiteClub(null);
      return;
    }
    const res = await fetch(`/api/clubs/lookup-public?fffNumber=${fff}`);
    if (!res.ok) return;
    const { club } = await res.json();
    setComiteClub(club ?? null);
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
              role: formData.joinRole,
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

      if (teamMode === "comite") {
        if (!comiteClub) {
          setError("Veuillez renseigner le numéro d'affiliation FFF de votre club");
          setLoading(false);
          return;
        }
        if (!comiteInviteCode.trim()) {
          setError("Veuillez renseigner le code d'invitation du club (demandez-le au président)");
          setLoading(false);
          return;
        }
        const clubRes = await authFetch("/api/auth/join-club", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clubId: comiteClub.id,
            inviteCode: comiteInviteCode.trim(),
          }),
        });
        const clubData = await clubRes.json();
        if (!clubRes.ok) {
          setError(clubData.error || "Erreur lors de la rejoint du club");
          setLoading(false);
          return;
        }
        localStorage.removeItem("selectedTeamId");
        window.location.href = "/club";
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
        const fff = normalizeFffNumber(formData.fffNumber);
        if (!fff) {
          setError("Numéro d'affiliation FFF invalide (6 chiffres requis)");
          setLoading(false);
          return;
        }
        const teamRes = await authFetch("/api/auth/create-team", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            clubName: formData.clubName,
            teamName: formData.teamName,
            fffNumber: fff,
            matchFormat,
            halfDuration,
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
          <Image src="/favicon.png" alt="Benchrs" width={48} height={48} className="mx-auto mb-2" />
          <CardTitle className="text-2xl">
            {teamMode === "comite" ? "Comité du club" : "Votre équipe"}
          </CardTitle>
          <CardDescription>
            {teamMode === "join"
              ? "Entrez un code d&apos;invitation ou créez votre propre équipe"
              : teamMode === "create"
                ? "Créez un club et une équipe pour commencer"
                : "Suivez l&apos;actualité de toutes les équipes de votre club"}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmitTeam}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive text-center">
                {error}
              </div>
            )}

            <div className="flex gap-1 rounded-lg border p-0.5">
              <button
                type="button"
                onClick={() => setTeamMode("join")}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  teamMode === "join"
                    ? "bg-[var(--color-navy)] text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Joueur
              </button>
              <button
                type="button"
                onClick={() => setTeamMode("create")}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  teamMode === "create"
                    ? "bg-[var(--color-navy)] text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Coach / Créer
              </button>
              <button
                type="button"
                onClick={() => setTeamMode("comite")}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  teamMode === "comite"
                    ? "bg-[var(--color-navy)] text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Comité du club
              </button>
            </div>

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
                      setFormData({ ...formData, joinRole: value as "player" | "parent" })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="player">Joueur</SelectItem>
                      <SelectItem value="parent">Parent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : teamMode === "create" ? (
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
                  <Label htmlFor="fffNumber">
                    Numéro d&apos;affiliation FFF <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="fffNumber"
                    inputMode="numeric"
                    placeholder="501234"
                    value={formData.fffNumber}
                    onChange={(e) =>
                      setFormData({ ...formData, fffNumber: e.target.value })
                    }
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    6 chiffres, sur votre licence FFF ou la fiche du club.
                  </p>
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

                {/* Format de match */}
                <div className="space-y-2">
                  <Label htmlFor="matchFormat">Format de match</Label>
                  <select
                    id="matchFormat"
                    value={matchFormat}
                    onChange={(e) => setMatchFormat(parseInt(e.target.value))}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value={5}>Foot à 5</option>
                    <option value={7}>Foot à 7</option>
                    <option value={8}>Foot à 8</option>
                    <option value={11}>Foot à 11</option>
                  </select>
                </div>

                {/* Durée d'une mi-temps */}
                <div className="space-y-2">
                  <Label htmlFor="halfDuration">Durée d&apos;une mi-temps</Label>
                  <select
                    id="halfDuration"
                    value={halfDuration}
                    onChange={(e) => setHalfDuration(parseInt(e.target.value))}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value={20}>20 minutes</option>
                    <option value={25}>25 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={35}>35 minutes</option>
                    <option value={40}>40 minutes</option>
                    <option value={45}>45 minutes</option>
                  </select>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="comiteFff">
                    Numéro d&apos;affiliation FFF du club{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="comiteFff"
                    inputMode="numeric"
                    placeholder="501234"
                    value={formData.fffNumber}
                    onChange={(e) => {
                      setFormData({ ...formData, fffNumber: e.target.value });
                      setComiteClub(null);
                    }}
                    onBlur={() => handleLookupComiteFff(formData.fffNumber)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Le numéro de votre club (sur la licence FFF ou la fiche du club).
                  </p>
                  {comiteClub ? (
                    <p className="text-xs text-[var(--color-primary-blue)] font-medium">
                      Club trouvé : {comiteClub.name} — vous rejoindrez son comité.
                    </p>
                  ) : (
                    formData.fffNumber.length === 6 && (
                      <p className="text-xs text-destructive">
                        Aucun club trouvé avec ce numéro.
                      </p>
                    )
                  )}
                </div>
                {comiteClub && (
                  <div className="space-y-2">
                    <Label htmlFor="comiteInvite">
                      Code d&apos;invitation du club{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="comiteInvite"
                      placeholder="Demandez-le au président"
                      value={comiteInviteCode}
                      onChange={(e) => setComiteInviteCode(e.target.value)}
                      autoComplete="off"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Le président du club vous transmet ce code pour rejoindre le
                      comité en toute sécurité.
                    </p>
                  </div>
                )}
                <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">Membre du comité</p>
                  <p>
                    Vous suivrez les équipes de votre club en lecture seule
                    (calendrier, résultats, statistiques). La gestion du comité se
                    fait par le président.
                  </p>
                </div>
              </>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button
              type="submit"
              className="w-full bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold"
              disabled={loading}
            >
              {loading
                ? "Inscription..."
                : teamMode === "join"
                  ? formData.inviteCode
                    ? "Rejoindre l'équipe"
                    : "Continuer sans équipe"
                  : teamMode === "create"
                    ? "Créer et continuer"
                    : "Rejoindre le comité"}
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
        <Image src="/favicon.png" alt="Benchrs" width={48} height={48} className="mx-auto mb-2" />
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
            className="w-full bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold"
          >
            Continuer
          </Button>
          <p className="text-sm text-muted-foreground text-center">
            Déjà un compte ?{" "}
            <Link href="/login" className="text-[var(--color-primary-blue)] hover:underline font-medium">
              Se connecter
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
