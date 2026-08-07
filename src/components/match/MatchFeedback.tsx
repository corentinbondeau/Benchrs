"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquarePlus, Check, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { authFetch } from "@/lib/api-client";
import { RatingSelect, RatingStars } from "@/components/match/RatingStars";
import type { Profile } from "@/types";

interface Props {
  matchId: string;
  teamId: string;
  isCoach: boolean;
  userId?: string | null;
  players: Profile[];
}

interface RatingRow {
  id: string;
  player_id: string;
  rating: number;
  notes: string | null;
}

interface FormEntry {
  rating: number;
  notes: string;
}

export function MatchFeedback({ matchId, teamId, isCoach, userId, players }: Props) {
  const [ratings, setRatings] = useState<RatingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, FormEntry>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("match_ratings")
      .select("*")
      .eq("event_id", matchId)
      .then(({ data }) => {
        if (cancelled) return;
        setRatings((data as RatingRow[]) || []);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  function initForm() {
    const next: Record<string, FormEntry> = {};
    for (const p of players) {
      const r = ratings.find((x) => x.player_id === p.id);
      next[p.id] = {
        rating: r?.rating || 0,
        notes: r?.notes || "",
      };
    }
    setForm(next);
    setEditing(true);
  }

  async function notifyPlayer(playerId: string, name: string, rating: number, hasNotes: boolean) {
    if (rating === 0 && !hasNotes) return;
    try {
      const supabase = createClient();
      const { data: links } = await supabase
        .from("parent_student")
        .select("parent_id")
        .eq("team_id", teamId)
        .eq("student_id", playerId);
      const parentIds = [
        ...new Set((links || []).map((l) => (l as { parent_id: string }).parent_id)),
      ];
      const userIds = [...new Set([playerId, ...parentIds])];
      await authFetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_ids: userIds,
          title: "Retour du coach sur le match",
          body: rating > 0
            ? `${name} : ${rating}/10${hasNotes ? " avec un commentaire" : ""}`
            : `${name} : un commentaire a été ajouté`,
          type: "match_retour",
          reference_id: matchId,
          team_id: teamId,
          url: `/stats/${playerId}`,
        }),
      });
    } catch (err) {
      console.error("[match-feedback] notify error:", err);
    }
  }

  async function save() {
    setSaving(true);
    const supabase = createClient();
    const prevByPlayer = new Map(ratings.map((r) => [r.player_id, r]));

    for (const p of players) {
      const entry = form[p.id];
      if (!entry) continue;
      const hasData = entry.rating > 0 || entry.notes.trim().length > 0;
      const prev = prevByPlayer.get(p.id);
      const changed =
        !prev || prev.rating !== entry.rating || (prev.notes || "") !== entry.notes.trim();

      if (!hasData) {
        if (prev) await supabase.from("match_ratings").delete().eq("id", prev.id);
        continue;
      }

      if (prev) {
        await supabase
          .from("match_ratings")
          .update({ rating: entry.rating, notes: entry.notes.trim() || null })
          .eq("id", prev.id);
      } else {
        await supabase.from("match_ratings").insert({
          event_id: matchId,
          rater_id: userId ?? null,
          player_id: p.id,
          team_id: teamId,
          rating: entry.rating,
          notes: entry.notes.trim() || null,
        });
      }

      if (changed && (entry.rating > 0 || entry.notes.trim())) {
        notifyPlayer(p.id, `${p.first_name} ${p.last_name}`, entry.rating, entry.notes.trim().length > 0);
      }
    }

    const { data } = await supabase
      .from("match_ratings")
      .select("*")
      .eq("event_id", matchId);
    setRatings((data as RatingRow[]) || []);
    setEditing(false);
    setSaving(false);
    toast.success("Retours enregistrés");
  }

  const sorted = [...ratings].sort((a, b) => b.rating - a.rating);
  const nameById = new Map(players.map((p) => [p.id, `${p.first_name} ${p.last_name}`]));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquarePlus className="h-4 w-4 text-[var(--color-royal)]" />
            Retour du coach
          </CardTitle>
          {isCoach &&
            (editing ? (
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Annuler
                </Button>
                <Button
                  size="sm"
                  className="bg-[var(--color-gold)] text-[var(--color-navy)]"
                  onClick={save}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                  Enregistrer
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={initForm}>
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Saisir les retours
              </Button>
            ))}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-20 animate-pulse rounded bg-muted" />
        ) : editing ? (
          <div className="space-y-3">
            {players.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Aucun joueur actif dans l&apos;équipe.
              </p>
            ) : (
              players.map((p) => (
                <div key={p.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">
                      {p.first_name} {p.last_name}
                    </span>
                    <div className="flex items-center gap-1">
                      <RatingSelect
                        value={form[p.id]?.rating || 0}
                        onChange={(v) =>
                          setForm((prev) => ({
                            ...prev,
                            [p.id]: { ...prev[p.id], rating: v },
                          }))
                        }
                      />
                    </div>
                  </div>
                  <Textarea
                    value={form[p.id]?.notes || ""}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        [p.id]: { ...prev[p.id], notes: e.target.value },
                      }))
                    }
                    placeholder="Commentaire (facultatif)..."
                    rows={2}
                  />
                </div>
              ))
            )}
          </div>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isCoach
              ? "Donne une note et un commentaire à chaque joueur après le match. Le joueur (et ses parents) recevront une notification."
              : "Le coach n'a pas encore publié de retour sur ce match."}
          </p>
        ) : (
          <div className="space-y-2">
            {sorted.map((r) => (
              <div key={r.id} className="flex items-start gap-3 rounded-lg border p-3">
                <RatingStars value={r.rating} size="h-3.5 w-3.5" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{nameById.get(r.player_id) || "Joueur"}</p>
                  {r.notes && (
                    <p className="text-sm text-muted-foreground mt-0.5">{r.notes}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
