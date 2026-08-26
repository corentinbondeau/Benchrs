"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Activity, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "@/components/charts";
import type { Profile } from "@/types";

const RPE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

interface RpeRow {
  id: string;
  event_id: string;
  player_id: string;
  team_id: string;
  rpe: number | null;
  session_duration: number | null;
  created_at: string;
}

interface HistoryRow extends RpeRow {
  events: { event_date: string; title: string; type: string } | null;
}

interface SessionRpeProps {
  eventId: string;
  teamId: string;
  isCoach: boolean;
  userId?: string;
  userRole: string | null;
  childId: string | null;
  trainingOver: boolean;
  durationHint: number | null;
}

export function SessionRpe({
  eventId,
  teamId,
  isCoach,
  userId,
  userRole,
  childId,
  trainingOver,
  durationHint,
}: SessionRpeProps) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [myRpe, setMyRpe] = useState<RpeRow | null>(null);
  const [allRpe, setAllRpe] = useState<RpeRow[]>([]);
  const [players, setPlayers] = useState<Record<string, Profile>>({});
  const [history, setHistory] = useState<HistoryRow[]>([]);

  const [selectedRpe, setSelectedRpe] = useState(0);
  const [duration, setDuration] = useState<number>(durationHint ?? 90);
  const [saving, setSaving] = useState(false);

  const myPlayerId = userRole === "player" ? userId : childId;

  const loadData = useCallback(async (): Promise<{
    enabled: boolean;
    myRpe: RpeRow | null;
    allRpe: RpeRow[];
    players: Record<string, Profile>;
    history: HistoryRow[];
  }> => {
    const supabase = createClient();
    const [settingsRes, rowsRes, historyRes] = await Promise.all([
      supabase
        .from("team_settings")
        .select("enable_rpe")
        .eq("team_id", teamId)
        .maybeSingle(),
      supabase.from("session_rpe").select("*").eq("event_id", eventId),
      supabase
        .from("session_rpe")
        .select("id, event_id, player_id, team_id, rpe, session_duration, created_at, events(event_date, title, type)")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

    const rows = (rowsRes.data as RpeRow[]) || [];
    const history = (historyRes.data as unknown as HistoryRow[]) || [];
    const playerIds = Array.from(new Set([...rows.map((r) => r.player_id), ...history.map((h) => h.player_id)]));
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
      history,
    };
  }, [teamId, eventId, myPlayerId]);

  useEffect(() => {
    let cancelled = false;
    loadData().then((res) => {
      if (cancelled) return;
      setEnabled(res.enabled);
      setMyRpe(res.myRpe);
      setAllRpe(res.allRpe);
      setPlayers(res.players);
      setHistory(res.history);
      setSelectedRpe(res.myRpe?.rpe ?? 0);
      setDuration(res.myRpe?.session_duration ?? durationHint ?? 90);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadData, durationHint]);

  async function handleSave() {
    if (!myPlayerId || !selectedRpe) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("session_rpe").upsert(
      {
        event_id: eventId,
        player_id: myPlayerId,
        team_id: teamId,
        rpe: selectedRpe,
        session_duration: duration || null,
      },
      { onConflict: "event_id,player_id" }
    );
    setSaving(false);
    if (error) {
      toast.error("Erreur lors de l'enregistrement");
      return;
    }
    toast.success("Intensité enregistrée");
    loadData().then((res) => {
      setMyRpe(res.myRpe);
      setAllRpe(res.allRpe);
    });
  }

  if (!trainingOver) {
    return null;
  }

  if (loading) {
    return null;
  }

  if (!enabled) {
    return null;
  }

  const chartData = history
    .filter((h) => h.events?.type === "training" && h.events.event_date && h.rpe != null)
    .reduce<Record<string, { label: string; charge: number }>>((acc, h) => {
      const evId = h.event_id;
      const load = h.rpe! * (h.session_duration ?? 90);
      const current = acc[evId];
      if (current) {
        current.charge += load;
      } else {
        const date = new Date(h.events!.event_date).toLocaleDateString("fr-FR", {
          day: "numeric",
          month: "short",
        });
        acc[evId] = { label: date, charge: load };
      }
      return acc;
    }, {});
  const chart = Object.values(chartData)
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(-10);
  const teamTotalLoad = chartData[eventId]
    ? Math.round(chartData[eventId].charge)
    : allRpe.reduce((sum, r) => sum + (r.rpe != null ? r.rpe * (r.session_duration ?? 90) : 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="h-4 w-4 text-[var(--color-royal)]" />
          Suivi de charge (RPE)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {myPlayerId && !isCoach && (
          <div className="space-y-3 rounded-lg border border-dashed p-3">
            <p className="text-sm font-medium">Intensité perçue de la séance (1-10)</p>
            <div className="flex flex-wrap gap-1">
              {RPE_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSelectedRpe(n)}
                  className={`h-9 w-9 rounded-lg border text-sm font-medium transition-colors ${
                    selectedRpe === n
                      ? "border-[var(--color-gold)] bg-[var(--color-gold)]/10 text-[var(--color-gold)]"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Durée (min)</span>
              <Input
                type="number"
                min={1}
                max={240}
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value) || 90)}
                className="h-9 w-20"
              />
            </div>
            <Button
              onClick={handleSave}
              disabled={saving || selectedRpe === 0}
              className="bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold"
            >
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
              Enregistrer
            </Button>
            {myRpe && myRpe.rpe != null && (
              <p className="text-xs text-muted-foreground">
                Charge enregistrée : {myRpe.rpe} × {myRpe.session_duration ?? durationHint ?? 90} min ={" "}
                <span className="font-semibold text-foreground">
                  {myRpe.rpe * (myRpe.session_duration ?? durationHint ?? 90)}
                </span>
              </p>
            )}
          </div>
        )}

        {isCoach && allRpe.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Retour des joueurs
            </p>
            <div className="space-y-1">
              {allRpe.map((r) => {
                const profile = players[r.player_id];
                return (
                  <div key={r.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                    <span className="font-medium">
                      {profile ? `${profile.first_name} ${profile.last_name}` : "Joueur"}
                    </span>
                    <span className="text-muted-foreground">
                      {r.rpe != null ? `RPE ${r.rpe} · charge ${r.rpe * (r.session_duration ?? 90)}` : "Sans intensité"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isCoach && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Charge d&apos;équipe
              </p>
              <span className="text-xs text-muted-foreground">Cette séance : {teamTotalLoad}</span>
            </div>
            {chart.length < 2 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                Encore trop peu de données pour afficher la courbe.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={chart} margin={{ top: 5, right: 5, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={44} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="charge"
                    name="Charge (RPE × min)"
                    stroke="var(--color-royal)"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
