"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchTeamActivePlayers } from "@/lib/players";
import { useTeam } from "@/lib/team";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowLeft, ShieldCheck, TrendingDown } from "lucide-react";
import type { Attendance, SessionRpe } from "@/types";

interface PlayerMetric {
  id: string;
  name: string;
  presence: number | null;
  presenceConvoked: number;
  rpeRecent: number | null;
  rpePrev: number | null;
  formRecent: number | null;
  formPrev: number | null;
  alerts: string[];
  level: "ok" | "watch" | "alert";
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export default function FormDropPage() {
  const router = useRouter();
  const { currentTeam, userRole } = useTeam();
  const isCoach = userRole === "coach" || userRole === "owner";
  const [metrics, setMetrics] = useState<PlayerMetric[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async (teamId: string) => {
    const supabase = createClient();
    const players = await fetchTeamActivePlayers(teamId);

    const [attendRes, rpeRes, eventsRes] = await Promise.all([
      supabase.from("attendances").select("*").eq("team_id", teamId),
      supabase.from("session_rpe").select("*").eq("team_id", teamId),
      supabase
        .from("events")
        .select("id, event_date, type")
        .eq("team_id", teamId)
        .neq("status", "cancelled")
        .order("event_date", { ascending: false }),
    ]);

    const events = (eventsRes.data || []).map((e) => ({
      id: (e as { id: string }).id,
      date: new Date((e as { event_date: string }).event_date).getTime(),
      type: (e as { type: string }).type,
    }));
    const eventDateById = new Map(events.map((e) => [e.id, e.date]));
    const attendances = (attendRes.data || []) as Attendance[];
    const rpes = (rpeRes.data || []) as SessionRpe[];

    const trainingEvents = events.filter((e) => e.type === "training");
    const allTrainingIds = new Set(trainingEvents.map((e) => e.id));

    const byPlayer = new Map<string, { attend: Attendance[]; rpe: SessionRpe[] }>();
    for (const a of attendances) {
      if (!byPlayer.has(a.user_id)) byPlayer.set(a.user_id, { attend: [], rpe: [] });
      byPlayer.get(a.user_id)!.attend.push(a);
    }
    for (const r of rpes) {
      if (!byPlayer.has(r.player_id)) byPlayer.set(r.player_id, { attend: [], rpe: [] });
      byPlayer.get(r.player_id)!.rpe.push(r);
    }

    const rows: PlayerMetric[] = players.map((p) => {
      const data = byPlayer.get(p.id) || { attend: [], rpe: [] };

      const convoked = data.attend.filter((a) => allTrainingIds.has(a.event_id));
      const present = convoked.filter((a) => a.status === "present" || a.status === "late").length;
      const presence = convoked.length > 0 ? (present / convoked.length) * 100 : null;

      const rpeWithDate = data.rpe
        .filter((r) => r.rpe != null)
        .map((r) => ({ v: r.rpe as number, t: eventDateById.get(r.event_id) ?? 0 }))
        .sort((a, b) => b.t - a.t)
        .map((r) => r.v);
      const rpeRecent = avg(rpeWithDate.slice(0, 4));
      const rpePrev = avg(rpeWithDate.slice(4, 8));

      const formWithDate = data.rpe
        .filter((r) => r.form_level != null)
        .map((r) => ({ v: r.form_level as number, t: eventDateById.get(r.event_id) ?? 0 }))
        .sort((a, b) => b.t - a.t)
        .map((r) => r.v);
      const formRecent = avg(formWithDate.slice(0, 3));
      const formPrev = avg(formWithDate.slice(3, 6));

      const alerts: string[] = [];
      if (convoked.length >= 2 && presence !== null && presence < 60) {
        alerts.push(`Assiduité ${Math.round(presence)}% (${present}/${convoked.length} entraînements)`);
      }
      if (rpePrev !== null && rpeRecent !== null && rpePrev - rpeRecent > 1.5) {
        alerts.push(`RPE en baisse de ${(rpePrev - rpeRecent).toFixed(1)} (${rpeRecent.toFixed(1)} vs ${rpePrev.toFixed(1)})`);
      }
      if (formPrev !== null && formRecent !== null && formPrev - formRecent > 0.8) {
        alerts.push(`Forme ressentie en baisse de ${(formPrev - formRecent).toFixed(1)} (${formRecent.toFixed(1)} vs ${formPrev.toFixed(1)})`);
      }

      const level: PlayerMetric["level"] = alerts.length >= 2 ? "alert" : alerts.length === 1 ? "watch" : "ok";
      return {
        id: p.id,
        name: `${p.first_name} ${p.last_name}`.trim() || "Joueur",
        presence,
        presenceConvoked: convoked.length,
        rpeRecent,
        rpePrev,
        formRecent,
        formPrev,
        alerts,
        level,
      };
    });

    rows.sort((a, b) => {
      const order = { alert: 0, watch: 1, ok: 2 } as const;
      return order[a.level] - order[b.level] || b.alerts.length - a.alerts.length;
    });
    return rows;
  }, []);

  useEffect(() => {
    if (!currentTeam) return;
    loadData(currentTeam.id).then((rows) => {
      setMetrics(rows);
      setLoading(false);
    });
  }, [currentTeam?.id, loadData]);

  if (!currentTeam) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    );
  }

  if (!isCoach) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Réservé aux coachs.</p>
        </CardContent>
      </Card>
    );
  }

  const alertCount = metrics.filter((m) => m.level !== "ok").length;

  return (
    <div className="max-w-3xl mx-auto section-gap">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingDown className="h-6 w-6" />
            Alerte de baisse de forme
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Assiduité + RPE ressenti + check-in de forme : qui décroche&nbsp;?
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/physical")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Prépa physique
        </Button>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">Chargement...</CardContent>
        </Card>
      ) : (
        <>
          {alertCount > 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-amber-300/50 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <span>
                <strong>{alertCount}</strong> joueur{alertCount > 1 ? "s" : ""} à surveiller.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-300/50 bg-emerald-50 dark:bg-emerald-950/20 p-3 text-sm">
              <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>Tout le monde est au niveau : aucun signal de baisse de forme.</span>
            </div>
          )}

          {metrics.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Aucun joueur actif.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {metrics.map((m) => {
                const tone =
                  m.level === "alert"
                    ? "border-red-300/60 bg-red-50/50 dark:bg-red-950/20"
                    : m.level === "watch"
                      ? "border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/10"
                      : "border-border";
                return (
                  <Card key={m.id} className={tone}>
                    <CardContent className="p-3.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{m.name}</span>
                        {m.level === "alert" && (
                          <Badge className="bg-red-500 text-white">À surveiller</Badge>
                        )}
                        {m.level === "watch" && (
                          <Badge className="bg-amber-500 text-white">Attention</Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-background p-2">
                          <p className="text-[11px] text-muted-foreground">Assiduité</p>
                          <p className="text-sm font-semibold">
                            {m.presence === null ? "—" : `${Math.round(m.presence)}%`}
                          </p>
                          {m.presence !== null && m.presenceConvoked > 0 && (
                            <p className="text-[10px] text-muted-foreground">
                              sur {m.presenceConvoked} convocations
                            </p>
                          )}
                        </div>
                        <div className="rounded-lg bg-background p-2">
                          <p className="text-[11px] text-muted-foreground">RPE récent</p>
                          <p className="text-sm font-semibold">
                            {m.rpeRecent === null ? "—" : m.rpeRecent.toFixed(1)}
                          </p>
                          {m.rpeRecent !== null && m.rpePrev !== null && (
                            <p
                              className={`text-[10px] ${
                                m.rpePrev - m.rpeRecent > 1.5 ? "text-red-600" : "text-muted-foreground"
                              }`}
                            >
                              avant : {m.rpePrev.toFixed(1)}
                            </p>
                          )}
                        </div>
                        <div className="rounded-lg bg-background p-2">
                          <p className="text-[11px] text-muted-foreground">Forme ressentie</p>
                          <p className="text-sm font-semibold">
                            {m.formRecent === null ? "—" : m.formRecent.toFixed(1)}
                          </p>
                          {m.formRecent !== null && m.formPrev !== null && (
                            <p
                              className={`text-[10px] ${
                                m.formPrev - m.formRecent > 0.8 ? "text-red-600" : "text-muted-foreground"
                              }`}
                            >
                              avant : {m.formPrev.toFixed(1)}
                            </p>
                          )}
                        </div>
                      </div>
                      {m.alerts.length > 0 && (
                        <ul className="space-y-1">
                          {m.alerts.map((a) => (
                            <li key={a} className="text-xs text-red-700 dark:text-red-400 flex items-start gap-1.5">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                              {a}
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
