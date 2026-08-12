"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api-client";

function JoinTeamForm() {
  const searchParams = useSearchParams();
  const [inviteCode, setInviteCode] = useState(searchParams.get("code") || "");
  const [role, setRole] = useState<"player" | "parent">("player");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState<{ id: string } | null>(null);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        setUser(null);
        setChecking(false);
        return;
      }
      supabase
        .from("team_members")
        .select("id")
        .eq("user_id", user.id)
        .limit(1)
        .then(({ data }) => {
          if (data && data.length > 0) {
            window.location.href = "/";
          } else {
            setUser(user as { id: string });
            setChecking(false);
          }
        });
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Vous devez être connecté pour rejoindre une équipe");
      setLoading(false);
      return;
    }

    try {
      const res = await authFetch("/api/auth/join-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, inviteCode, role }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur lors de la connexion à l'équipe");
        setLoading(false);
        return;
      }

      localStorage.setItem("selectedTeamId", data.team.id);
      if (role === "parent") {
        router.push(`/link-child?teamId=${data.team.id}`);
      } else {
        router.push("/");
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

  if (!user) {
    const next = `/join${inviteCode ? `?code=${encodeURIComponent(inviteCode)}` : ""}`;
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img src="/favicon.png" alt="Benchrs" className="h-12 w-12 mx-auto mb-2" />
          <CardTitle className="text-2xl">Rejoindre une équipe</CardTitle>
          <CardDescription>
            Vous avez été invité à rejoindre une équipe. Connectez-vous ou créez un
            compte pour continuer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Link href={`/login?next=${encodeURIComponent(next)}`}>
            <Button className="w-full bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold">
              Se connecter
            </Button>
          </Link>
          <Link href={`/register?next=${encodeURIComponent(next)}`}>
            <Button type="button" variant="outline" className="w-full">
              Créer un compte
            </Button>
          </Link>
        </CardContent>
        <CardFooter>
          <p className="w-full text-center text-xs text-muted-foreground">
            Vous pourrez rejoindre l&apos;équipe juste après votre connexion
          </p>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <img src="/favicon.png" alt="Benchrs" className="h-12 w-12 mx-auto mb-2" />
        <CardTitle className="text-2xl">Rejoindre une équipe</CardTitle>
        <CardDescription>
          Entrez le code d&apos;invitation partagé par votre coach
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive text-center">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="inviteCode">Code d&apos;invitation</Label>
            <Input
              id="inviteCode"
              placeholder="abc123def456"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              required
              className="text-center text-lg tracking-wider font-mono"
            />
          </div>

          <div className="space-y-2">
            <Label>Votre rôle dans cette équipe</Label>
            <Select value={role} onValueChange={(v) => v && setRole(v as "player" | "parent")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="player">Joueur</SelectItem>
                <SelectItem value="parent">Parent</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Vous pouvez avoir un rôle différent dans chaque équipe
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button
            type="submit"
            className="w-full bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
            disabled={loading}
          >
            {loading ? "Connexion..." : "Rejoindre l'équipe"}
          </Button>
          <Link href="/create-team" className="w-full">
            <Button
              type="button"
              variant="outline"
              className="w-full"
            >
              Créer mon équipe
            </Button>
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function JoinTeamPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <p className="text-white/60">Chargement...</p>
      </div>
    }>
      <JoinTeamForm />
    </Suspense>
  );
}
