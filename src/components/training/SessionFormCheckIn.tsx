"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Check, Smile } from "lucide-react";
import { toast } from "sonner";
import type { Profile } from "@/types";

const FORM_OPTIONS = [1, 2, 3, 4, 5];

const FORM_LABELS: Record<number, string> = {
  1: "Épuisé",
  2: "Fatigué",
  3: "Correct",
  4: "En forme",
  5: "Excellent",
};

interface RpeRow {
  id: string;
  event_id: string;
  player_id: string;
  team_id: string;
  form_level: number | null;
  checked_in_at: string | null;
  created_at: string;
}

interface SessionFormCheckInProps {
  eventId: string;
  teamId: string;
  isCoach: boolean;
  userId?: string;
  userRole: string | null;
  childId: string | null;
  trainingOver: boolean;
}

export function SessionFormCheckIn({
  eventId,
  teamId,
  isCoach,
  userId,
  userRole,
  childId,
  trainingOver,
}: SessionFormCheckInProps) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [allRpe, setAllRpe] = useState<RpeRow[]>([]);
  const [players, setPlayers] = useState<Record<string, Profile>>({});

  const [selectedForm, setSelectedForm] = useState(0);
  const [savingForm, setSavingForm] = useState(false);

  const myPlayerId = userRole === "player" ? userId : childId;

  const loadData = useCallback(async (): Promise<{
    enabled: boolean;
    myRpe: RpeRow | null;
    allRpe: RpeRow[];
    players: Record<string, Profile>;
  }> => {
    const supabase = createClient();
    const [settingsRes, rowsRes] = await Promise.all([
      supabase
        .from("team_settings")
        .select("enable_rpe")
        .eq("team_id", teamId)
        .maybeSingle(),
      supabase.from("session_rpe").select("*").eq("event_id", eventId),
    ]);

    const rows = (rowsRes.data as RpeRow[]) || [];
    const playerIds = Array.from(new Set(rows.map((r) => r.player_id)));
    let players: Record<string, Profile> = {};
    if (playerIds.length > 0) {
      const profRes = await supabase.from("profiles").select("*").in("id", playerIds);
      players = ((profRes.data as Profile[]) || []).reduce<Record<string, Profile>>(
        (acc, p) => ({ ...acc, [p.id]: p }),
        {}
      );
    }

    return {
      enabled: settingsRes.data?.enable_rpe === true,
      myRpe: myPlayerId ? rows.find((r) => r.player_id === myPlayerId) ?? null : null,
      allRpe: rows,
      players,
    };
  }, [teamId, eventId, myPlayerId]);

  useEffect(() => {
    let cancelled = false;
    loadData().then((res) => {
      if (cancelled) return;
      setEnabled(res.enabled);
      setAllRpe(res.allRpe);
      setPlayers(res.players);
      setSelectedForm(res.myRpe?.form_level ?? 0);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  async function handleSaveForm() {
    if (!myPlayerId || !selectedForm) return;
    setSavingForm(true);
    const supabase = createClient();
    const { error } = await supabase.from("session_rpe").upsert(
      {
        event_id: eventId,
        player_id: myPlayerId,
        team_id: teamId,
        form_level: selectedForm,
        checked_in_at: new Date().toISOString(),
      },
      { onConflict: "event_id,player_id" }
    );
    setSavingForm(false);
    if (error) {
      toast.error("Erreur lors de l'enregistrement");
      return;
    }
    toast.success("Forme enregistrée");
    loadData().then((res) => {
      setAllRpe(res.allRpe);
    });
  }

  if (trainingOver) {
    return null;
  }

  if (loading) {
    return null;
  }

  if (!enabled) {
    return null;
  }

  const formRows = allRpe.filter((r) => r.form_level != null);
  const avgForm = formRows.length > 0 ? formRows.reduce((s, r) => s + r.form_level!, 0) / formRows.length : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Smile className="h-4 w-4 text-green-600" />
          État de forme
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {myPlayerId && !isCoach && (
          <div className="space-y-3 rounded-lg border border-dashed p-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Smile className="h-4 w-4 text-green-600" />
              Comment te sens-tu aujourd&apos;hui ?
            </p>
            <div className="flex justify-between gap-1">
              {FORM_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSelectedForm(n)}
                  className={`h-10 flex-1 rounded-lg border text-base font-semibold transition-colors ${
                    selectedForm === n
                      ? "border-green-500 bg-green-500/10 text-green-700"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedForm ? FORM_LABELS[selectedForm] : "Choisis ton état de forme avant la séance"}
            </p>
            <Button
              onClick={handleSaveForm}
              disabled={savingForm || selectedForm === 0}
              className="bg-green-600 text-white hover:bg-green-700 font-semibold"
            >
              {savingForm ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
              Enregistrer ma forme
            </Button>
          </div>
        )}

        {isCoach && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                État de forme des joueurs
              </p>
              {avgForm != null && (
                <span className="flex items-center gap-1 text-xs font-medium text-green-700">
                  <Smile className="h-3 w-3" /> Moyenne {avgForm.toFixed(1)}/5
                </span>
              )}
            </div>
            {formRows.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">
                Aucun joueur n&apos;a encore renseigné son état de forme.
              </p>
            ) : (
              <div className="space-y-1">
                {formRows.map((r) => {
                  const profile = players[r.player_id];
                  return (
                    <div key={r.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                      <span className="font-medium">
                        {profile ? `${profile.first_name} ${profile.last_name}` : "Joueur"}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className={`font-semibold ${r.form_level! >= 4 ? "text-green-700" : r.form_level! <= 2 ? "text-red-600" : "text-amber-600"}`}>
                          {r.form_level}/5
                        </span>
                        <span className="text-xs text-muted-foreground">{FORM_LABELS[r.form_level!]}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
