"use client";

import { useState, useEffect } from "react";
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
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

export default function CreateTeamPage() {
  const [clubName, setClubName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace("/login");
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
            setChecking(false);
          }
        });
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    try {
      const res = await fetch("/api/auth/create-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, clubName, teamName }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur lors de la création");
        setLoading(false);
        return;
      }

      toast.success(`Code d'invitation : ${data.inviteCode}`, {
        description: "Vous le trouverez dans Paramètres > Équipe",
        duration: 5000,
      });

      window.location.href = "/";
    } catch (err) {
      console.error("[create-team]", err);
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

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-gold)] text-[var(--color-navy)] font-bold text-lg mx-auto mb-2">
          SP
        </div>
        <CardTitle className="text-2xl">Créer votre équipe</CardTitle>
        <CardDescription>
          Créez un club et une équipe pour commencer
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
            <Label htmlFor="clubName">Nom du club</Label>
            <Input
              id="clubName"
              placeholder="AS Monaco"
              value={clubName}
              onChange={(e) => setClubName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="teamName">Nom de l&apos;équipe</Label>
            <Input
              id="teamName"
              placeholder="U17 Senior"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              required
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button
            type="submit"
            className="w-full bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
            disabled={loading}
          >
            {loading ? "Création..." : "Créer l'équipe"}
          </Button>
          <p className="text-sm text-muted-foreground text-center">
            Vous avez un code d&apos;invitation ?{" "}
            <Link href="/join" className="text-[var(--color-royal)] hover:underline font-medium">
              Rejoindre une équipe
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
