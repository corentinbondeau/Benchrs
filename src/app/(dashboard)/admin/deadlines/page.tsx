"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTeam } from "@/lib/team";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarClock, ShieldCheck, Stethoscope, Wallet } from "lucide-react";
import { toast } from "sonner";
import type { Profile, Cotisation } from "@/types";
import { currentSeasonLabel } from "@/lib/goals";

interface DeadlineRow extends Profile {
  cotisation: Cotisation | null;
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr + "T00:00:00").getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

export default function DeadlinesPage() {
  const { currentTeam, userRole } = useTeam();
  const [players, setPlayers] = useState<DeadlineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [season] = useState(currentSeasonLabel());

  const loadData = useCallback(async () => {
    if (!currentTeam) return null;
    const supabase = createClient();
    const [membersRes, cotisRes] = await Promise.all([
      supabase.from("team_members").select("user_id").eq("team_id", currentTeam.id).in("role", ["player"]),
      supabase.from("cotisations").select("*").eq("team_id", currentTeam.id).eq("season", season),
    ]);
    const memberIds = (membersRes.data || []).map((m) => m.user_id);
    let rows: DeadlineRow[] = [];
    if (memberIds.length > 0) {
      const { data: p } = await supabase
        .from("profiles")
        .select("*")
        .in("id", memberIds)
        .order("last_name", { ascending: true });
      const cotis = (cotisRes.data as Cotisation[]) || [];
      const map = new Map<string, Cotisation>();
      for (const c of cotis) map.set(c.player_id, c);
      rows = ((p as Profile[]) || []).map((prof) => ({ ...prof, cotisation: map.get(prof.id) ?? null }));
    }
    return rows;
  }, [currentTeam?.id, season]);

  useEffect(() => {
    let cancelled = false;
    loadData().then((res) => {
      if (!cancelled && res) {
        setPlayers(res);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  async function saveDeadlines(player: DeadlineRow, licence: string, medical: string) {
    if (!currentTeam) return;
    const supabase = createClient();
    const { error } = await supabase.rpc("update_player_deadlines", {
      p_player_id: player.id,
      p_licence_expires_at: licence || null,
      p_medical_cert_expires_at: medical || null,
    });
    if (error) {
      toast.error(error.message || "Erreur lors de l'enregistrement");
      return;
    }
    toast.success("Échéances mises à jour");
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === player.id ? { ...p, licence_expires_at: licence || null, medical_cert_expires_at: medical || null } : p
      )
    );
  }

  const licenceWarnings = players.filter(
    (p) => (p.licence_expires_at && (daysUntil(p.licence_expires_at) ?? 0) <= 30)
  ).length;
  const medicalWarnings = players.filter(
    (p) => (p.medical_cert_expires_at && (daysUntil(p.medical_cert_expires_at) ?? 0) <= 30)
  ).length;
  const cotisWarnings = players.filter(
    (p) => p.cotisation?.due_date && daysUntil(p.cotisation.due_date) !== null && (daysUntil(p.cotisation.due_date) ?? 0) <= 30 && Number(p.cotisation.amount_paid) < Number(p.cotisation.amount_expected)
  ).length;

  function badgeFor(days: number | null): { label: string; variant: "default" | "destructive" | "secondary" | "outline" } {
    if (days === null) return { label: "Non renseignée", variant: "outline" };
    if (days < 0) return { label: "Expiré", variant: "destructive" };
    if (days <= 30) return { label: `Dans ${days} j`, variant: "secondary" };
    return { label: "OK", variant: "default" };
  }

  if (!currentTeam) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chargement de l&apos;équipe...</p>
      </div>
    );
  }

  const isCoach = userRole === "coach" || userRole === "owner";
  if (!isCoach) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Accès réservé au coach</p>
      </div>
    );
  }

  return (
    <div className="section-gap">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-[var(--color-royal)]" />
          Échéances
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Licences, certificats médicaux et cotisations — alertes envoyées automatiquement à 30 jours.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Licences à surveiller</p>
              <p className="text-lg font-bold">{licenceWarnings}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <Stethoscope className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Certificats à surveiller</p>
              <p className="text-lg font-bold">{medicalWarnings}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cotisations à échoir</p>
              <p className="text-lg font-bold">{cotisWarnings}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {players.map((p) => {
            const licenceDays = daysUntil(p.licence_expires_at);
            const medicalDays = daysUntil(p.medical_cert_expires_at);
            const cotisDays = p.cotisation?.due_date ? daysUntil(p.cotisation.due_date) : null;
            return (
              <Card key={p.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-royal)]/10 text-[var(--color-royal)] text-xs font-bold">
                      {p.first_name[0]}{p.last_name[0]}
                    </div>
                    {p.first_name} {p.last_name}
                    {p.position && <span className="text-xs font-normal text-muted-foreground">· {p.position}</span>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3" /> Licence
                    </Label>
                    <Input
                      type="date"
                      defaultValue={p.licence_expires_at ?? ""}
                      onBlur={(e) => {
                        if ((e.target.value || null) !== p.licence_expires_at) {
                          saveDeadlines(p, e.target.value, p.medical_cert_expires_at ?? "");
                        }
                      }}
                    />
                    <Badge variant={badgeFor(licenceDays).variant}>{badgeFor(licenceDays).label}</Badge>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Stethoscope className="h-3 w-3" /> Certificat médical
                    </Label>
                    <Input
                      type="date"
                      defaultValue={p.medical_cert_expires_at ?? ""}
                      onBlur={(e) => {
                        if ((e.target.value || null) !== p.medical_cert_expires_at) {
                          saveDeadlines(p, p.licence_expires_at ?? "", e.target.value);
                        }
                      }}
                    />
                    <Badge variant={badgeFor(medicalDays).variant}>{badgeFor(medicalDays).label}</Badge>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Wallet className="h-3 w-3" /> Cotisation {season}
                    </Label>
                    {p.cotisation ? (
                      <div className="text-sm">
                        <Input
                          type="date"
                          defaultValue={p.cotisation.due_date ?? ""}
                          className="mb-1"
                          onBlur={async (e) => {
                            if (!p.cotisation) return;
                            const val = e.target.value || null;
                            if (val === p.cotisation.due_date) return;
                            const supabase = createClient();
                            const { error } = await supabase
                              .from("cotisations")
                              .update({ due_date: val })
                              .eq("id", p.cotisation.id);
                            if (error) {
                              toast.error(error.message || "Erreur");
                              return;
                            }
                            toast.success("Échéance de cotisation mise à jour");
                            setPlayers((prev) =>
                              prev.map((x) =>
                                x.id === p.id && x.cotisation ? { ...x, cotisation: { ...x.cotisation, due_date: val } } : x
                              )
                            );
                          }}
                        />
                        <span className="text-xs text-muted-foreground">
                          Reste {Math.max(0, Number(p.cotisation.amount_expected) - Number(p.cotisation.amount_paid)).toFixed(2)} €
                        </span>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground py-2">Aucune cotisation définie</p>
                    )}
                    {cotisDays !== null && (
                      <Badge variant={badgeFor(cotisDays).variant}>{badgeFor(cotisDays).label}</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
