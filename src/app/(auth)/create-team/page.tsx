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
import { authFetch } from "@/lib/api-client";
import { normalizeFffNumber } from "@/lib/clubs";
import { toast } from "sonner";

export default function CreateTeamPage() {
  const [clubName, setClubName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [fffNumber, setFffNumber] = useState("");
  const [existingClub, setExistingClub] = useState<{ id: string; name: string } | null>(null);
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

  async function handleLookupFff(value: string) {
    const fff = normalizeFffNumber(value);
    if (!fff) {
      setExistingClub(null);
      return;
    }
    const res = await authFetch(`/api/clubs/lookup?fffNumber=${fff}`);
    if (!res.ok) return;
    const { club } = await res.json();
    setExistingClub(club ?? null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const fff = normalizeFffNumber(fffNumber);
    if (!fff) {
      setError("Numéro d'affiliation FFF invalide (6 chiffres requis)");
      return;
    }

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
      const res = await authFetch("/api/auth/create-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, clubName, teamName, fffNumber: fff }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur lors de la création");
        setLoading(false);
        return;
      }

      toast.success(
        data.clubName && data.clubName !== clubName.trim()
          ? `Équipe ajoutée au club ${data.clubName}`
          : `Code d'invitation : ${data.inviteCode}`,
        {
          description:
            data.clubName && data.clubName !== clubName.trim()
              ? "Ce club existait déjà (même numéro FFF)"
              : "Vous le trouverez dans Paramètres > Équipe",
          duration: 5000,
        }
      );

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
          <img src="/favicon.png" alt="Benchrs" className="h-12 w-12 mx-auto mb-2" />
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
            <Label htmlFor="fffNumber">
              Numéro d&apos;affiliation FFF <span className="text-destructive">*</span>
            </Label>
            <Input
              id="fffNumber"
              inputMode="numeric"
              placeholder="501234"
              value={fffNumber}
              onChange={(e) => {
                setFffNumber(e.target.value);
                setExistingClub(null);
              }}
              onBlur={() => handleLookupFff(fffNumber)}
              required
            />
            {existingClub && (
              <p className="text-xs text-[var(--color-royal)] font-medium">
                Ce numéro appartient au club {existingClub.name} — l&apos;équipe sera
                ajoutée à ce club existant.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              6 chiffres, sur votre licence FFF ou la fiche du club.
            </p>
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
