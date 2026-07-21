"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "next-auth/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { HeartPulse, AlertTriangle, Activity } from "lucide-react";
import type { Injury, Profile } from "@/types";

const injuryTypes = [
  "Entorse",
  "Foulure",
  "Déchirure musculaire",
  "Élongation",
  "Fracture",
  "Contusion",
  "Tendinite",
  "Lésion méniscale",
  "Autre",
];

export function InjuryList() {
  const [injuries, setInjuries] = useState<(Injury & { player: Profile })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    async function fetchInjuries() {
      const { data } = await supabase
        .from("injuries")
        .select("*, player:profiles!injuries_player_id_fkey(*)")
        .eq("status", "active")
        .order("injury_date", { ascending: false });

      setInjuries((data as (Injury & { player: Profile })[]) || []);
      setLoading(false);
    }
    fetchInjuries();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--royal)] border-t-transparent" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Blessures actives
          {injuries.length > 0 && (
            <Badge className="bg-red-100 text-red-700">{injuries.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {injuries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Aucune blessure active
          </p>
        ) : (
          <div className="space-y-3">
            {injuries.map((injury) => (
              <div
                key={injury.id}
                className="flex items-start gap-3 rounded-lg border p-3"
              >
                <HeartPulse className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">
                    {injury.player?.first_name} {injury.player?.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {injury.description}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {injury.injury_type && (
                      <Badge variant="secondary" className="text-xs">
                        {injury.injury_type}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs">
                      Depuis le{" "}
                      {new Date(injury.injury_date).toLocaleDateString("fr-FR")}
                    </Badge>
                    {injury.expected_return && (
                      <Badge variant="outline" className="text-xs">
                        Retour estimé :{" "}
                        {new Date(injury.expected_return).toLocaleDateString(
                          "fr-FR"
                        )}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function InjuryForm({ onClose }: { onClose: () => void }) {
  const { data: session } = useSession();
  const [players, setPlayers] = useState<Profile[]>([]);
  const [formData, setFormData] = useState({
    playerId: "",
    injuryType: "",
    description: "",
    injuryDate: new Date().toISOString().split("T")[0],
    expectedReturn: "",
  });

  useEffect(() => {
    const supabase = createClient();
    async function fetchPlayers() {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "player")
        .eq("is_active", true)
        .order("last_name");
      setPlayers((data as Profile[]) || []);
    }
    fetchPlayers();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();

    await supabase.from("injuries").insert({
      player_id: formData.playerId,
      injury_type: formData.injuryType || null,
      description: formData.description,
      injury_date: formData.injuryDate,
      expected_return: formData.expectedReturn || null,
      reported_by: session?.user?.id,
      status: "active",
    });

    onClose();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Joueur</Label>
        <select
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={formData.playerId}
          onChange={(e) =>
            setFormData({ ...formData, playerId: e.target.value })
          }
          required
        >
          <option value="">Sélectionner un joueur</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.first_name} {p.last_name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label>Type de blessure</Label>
        <select
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={formData.injuryType}
          onChange={(e) =>
            setFormData({ ...formData, injuryType: e.target.value })
          }
        >
          <option value="">— Sélectionner —</option>
          {injuryTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          placeholder="Décrivez la blessure..."
          value={formData.description}
          onChange={(e) =>
            setFormData({ ...formData, description: e.target.value })
          }
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Date de la blessure</Label>
          <Input
            type="date"
            value={formData.injuryDate}
            onChange={(e) =>
              setFormData({ ...formData, injuryDate: e.target.value })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Retour estimé</Label>
          <Input
            type="date"
            value={formData.expectedReturn}
            onChange={(e) =>
              setFormData({ ...formData, expectedReturn: e.target.value })
            }
          />
        </div>
      </div>
      <Button
        type="submit"
        className="w-full bg-[var(--gold)] text-[var(--gold-foreground)] hover:bg-[var(--gold)]/90"
      >
        Signaler la blessure
      </Button>
    </form>
  );
}

export function FitnessRatingWidget() {
  const { data: session } = useSession();
  const [fatigue, setFatigue] = useState(3);
  const [form, setForm] = useState(3);
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    if (!session?.user?.id) return;
    const supabase = createClient();
    await supabase.from("fitness_ratings").insert({
      user_id: session.user.id,
      fatigue_level: fatigue,
      form_level: form,
      notes: notes || null,
    });
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Activity className="h-8 w-8 mx-auto text-green-500 mb-2" />
          <p className="text-sm font-medium">
            Merci pour votre évaluation !
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-green-500" />
          Auto-évaluation forme
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm">
            Fatigue : {fatigue}/5
          </Label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setFatigue(n)}
                className={`h-8 w-8 rounded-lg text-sm font-medium transition-colors ${
                  n <= fatigue
                    ? "bg-amber-500 text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-sm">
            Niveau de forme : {form}/5
          </Label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setForm(n)}
                className={`h-8 w-8 rounded-lg text-sm font-medium transition-colors ${
                  n <= form
                    ? "bg-green-500 text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <Textarea
          placeholder="Notes optionnelles..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />
        <Button
          onClick={handleSubmit}
          className="w-full bg-[var(--royal)] text-white hover:bg-[var(--royal)]/90"
        >
          Envoyer mon évaluation
        </Button>
      </CardContent>
    </Card>
  );
}
