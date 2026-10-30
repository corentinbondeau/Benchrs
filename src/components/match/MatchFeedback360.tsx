"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircleHeart, Check, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

interface Props {
  eventId: string;
  teamId: string;
  userId: string;
}

interface FeedbackRow {
  id: string;
  ambiance: number | null;
  communication: number | null;
  satisfaction: number | null;
  comment: string | null;
}

interface FormState {
  ambiance: number;
  communication: number;
  satisfaction: number;
  comment: string;
}

const EMPTY_FORM: FormState = {
  ambiance: 0,
  communication: 0,
  satisfaction: 0,
  comment: "",
};

const SLIDER_LABELS: Record<keyof Omit<FormState, "comment">, string> = {
  ambiance: "Ambiance",
  communication: "Communication",
  satisfaction: "Satisfaction globale",
};

const EMOJI_BY_SCORE: Record<number, string> = {
  1: "😞",
  2: "😕",
  3: "😐",
  4: "🙂",
  5: "😄",
};

function SliderField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-lg" aria-hidden>
          {value > 0 ? EMOJI_BY_SCORE[value] : "—"}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            aria-label={`${label} : ${v}/5`}
            className={`flex-1 h-10 rounded-lg text-sm font-bold border transition-colors ${
              value === v
                ? "bg-[var(--color-primary-blue)] text-white border-[var(--color-primary-blue)]"
                : value > 0 && v <= value
                  ? "bg-[var(--color-primary-blue)]/15 text-[var(--color-primary-blue)] border-[var(--color-primary-blue)]/30"
                  : "bg-muted text-muted-foreground border-border hover:bg-muted/70"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

export function MatchFeedback360({ eventId, teamId, userId }: Props) {
  const [existing, setExisting] = useState<FeedbackRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("match_feedback_360")
      .select("id, ambiance, communication, satisfaction, comment")
      .eq("event_id", eventId)
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setExisting(data as FeedbackRow | null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, userId]);

  function initForm() {
    setForm({
      ambiance: existing?.ambiance ?? 0,
      communication: existing?.communication ?? 0,
      satisfaction: existing?.satisfaction ?? 0,
      comment: existing?.comment ?? "",
    });
    setEditing(true);
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    if (!form.ambiance || !form.communication || !form.satisfaction) {
      toast.error("Remplis les 3 curseurs avant d'envoyer");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const payload = {
        event_id: eventId,
        team_id: teamId,
        user_id: userId,
        ambiance: form.ambiance,
        communication: form.communication,
        satisfaction: form.satisfaction,
        comment: form.comment.trim() || null,
      };

      if (existing) {
        const { error } = await supabase
          .from("match_feedback_360")
          .update({
            ambiance: payload.ambiance,
            communication: payload.communication,
            satisfaction: payload.satisfaction,
            comment: payload.comment,
          })
          .eq("id", existing.id);
        if (error) throw error;
        setExisting({ ...existing, ...payload });
      } else {
        const { data, error } = await supabase
          .from("match_feedback_360")
          .insert(payload)
          .select("id, ambiance, communication, satisfaction, comment")
          .single();
        if (error) throw error;
        setExisting(data as FeedbackRow);
      }

      setEditing(false);
      toast.success("Feedback envoyé — merci !");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'envoi");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircleHeart className="h-4 w-4 text-[var(--color-royal)]" />
            Feedback 360°
          </CardTitle>
          {!editing && existing && (
            <Button size="sm" variant="outline" onClick={initForm}>
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Modifier
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="h-24 animate-pulse rounded bg-muted" />
        ) : editing ? (
          <div className="space-y-5">
            <p className="text-xs text-muted-foreground">
              Ton avis est anonyme — seul le coach verra les moyennes de l&apos;équipe.
            </p>

            {(["ambiance", "communication", "satisfaction"] as const).map((key) => (
              <SliderField
                key={key}
                label={SLIDER_LABELS[key]}
                value={form[key]}
                onChange={(v) => setField(key, v)}
              />
            ))}

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Commentaire (facultatif)</label>
              <Textarea
                value={form.comment}
                onChange={(e) => setField("comment", e.target.value)}
                placeholder="Un mot sur le match, l'équipe, l'ambiance..."
                rows={3}
                maxLength={500}
              />
              {form.comment.length > 400 && (
                <p className="text-xs text-muted-foreground text-right">
                  {form.comment.length}/500
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button
                className="bg-[var(--color-primary-blue)] text-white font-semibold"
                onClick={save}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Check className="h-4 w-4 mr-1" />
                )}
                Envoyer
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                Annuler
              </Button>
            </div>
          </div>
        ) : existing ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Tu as déjà donné ton feedback.</p>
            <div className="grid grid-cols-3 gap-2">
              {(["ambiance", "communication", "satisfaction"] as const).map((key) => (
                <div
                  key={key}
                  className="flex flex-col items-center rounded-lg border bg-muted/40 p-2 gap-1"
                >
                  <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                    {SLIDER_LABELS[key]}
                  </span>
                  <span className="text-lg" aria-hidden>
                    {existing[key] ? EMOJI_BY_SCORE[existing[key] as number] : "—"}
                  </span>
                  <span className="text-sm font-bold">{existing[key] ?? "—"}/5</span>
                </div>
              ))}
            </div>
            {existing.comment && (
              <p className="text-sm text-muted-foreground italic">&quot;{existing.comment}&quot;</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Donne ton avis sur ce match — ambiance, communication et satisfaction.
              C&apos;est anonyme, seul le coach verra les moyennes.
            </p>
            <Button
              className="bg-[var(--color-primary-blue)] text-white font-semibold"
              onClick={initForm}
            >
              <MessageCircleHeart className="h-4 w-4 mr-1.5" />
              Donner mon feedback
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
