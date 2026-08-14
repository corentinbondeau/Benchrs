"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { authFetch } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarClock, ShieldCheck, Stethoscope, Wallet, Bell, Send, Loader2 } from "lucide-react";
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
  const { currentTeam, userRole, clubMemberships } = useTeam();
  const { user } = useAuth();
  const [players, setPlayers] = useState<DeadlineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [season] = useState(currentSeasonLabel());
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);
  const [sendingBulk, setSendingBulk] = useState(false);

  const isCoach = userRole === "coach" || userRole === "owner";
  const hasClubRole = clubMemberships.length > 0;

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
    toast.success("Echeances mises a jour");
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === player.id ? { ...p, licence_expires_at: licence || null, medical_cert_expires_at: medical || null } : p
      )
    );
  }

  function getMissingDocs(p: DeadlineRow): string[] {
    const missing: string[] = [];
    const licenceDays = daysUntil(p.licence_expires_at);
    const medicalDays = daysUntil(p.medical_cert_expires_at);
    if (licenceDays === null || licenceDays < 0) missing.push("licence");
    else if (licenceDays <= 30) missing.push("renouvellement de licence");
    if (medicalDays === null || medicalDays < 0) missing.push("certificat medical");
    else if (medicalDays <= 30) missing.push("renouvellement du certificat medical");
    if (p.cotisation) {
      const paid = Number(p.cotisation.amount_paid);
      const expected = Number(p.cotisation.amount_expected);
      if (paid < expected) missing.push("paiement de la cotisation");
    }
    return missing;
  }

  async function sendReminder(player: DeadlineRow) {
    if (!currentTeam) return;
    const missing = getMissingDocs(player);
    if (missing.length === 0) {
      toast.info(`${player.first_name} est a jour`);
      return;
    }
    setSendingReminder(player.id);

    // Also find parents to notify
    const supabase = createClient();
    const { data: links } = await supabase
      .from("parent_student")
      .select("parent_id")
      .eq("student_id", player.id)
      .eq("team_id", currentTeam.id);
    const parentIds = (links || []).map((l) => l.parent_id);
    const targetIds = [player.id, ...parentIds];

    const docList = missing.join(", ");
    const res = await authFetch("/api/notifications/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_ids: targetIds,
        title: "Document(s) manquant(s)",
        body: `Bonjour, merci de fournir : ${docList}. Contactez le club pour plus d'informations.`,
        type: "deadline_reminder",
        reference_id: null,
        team_id: currentTeam.id,
        url: "/settings",
      }),
    });

    setSendingReminder(null);
    if (!res.ok) {
      toast.error("Impossible d'envoyer la relance");
      return;
    }
    toast.success(`Relance envoyee a ${player.first_name}${parentIds.length > 0 ? " et ses parents" : ""}`);
  }

  async function sendBulkReminder() {
    if (!currentTeam) return;
    const playersToRemind = players.filter((p) => getMissingDocs(p).length > 0);
    if (playersToRemind.length === 0) {
      toast.info("Tous les joueurs sont a jour");
      return;
    }
    setSendingBulk(true);

    const supabase = createClient();
    // Get all parent links for these players
    const playerIds = playersToRemind.map((p) => p.id);
    const { data: links } = await supabase
      .from("parent_student")
      .select("parent_id, student_id")
      .eq("team_id", currentTeam.id)
      .in("student_id", playerIds);

    let sentCount = 0;
    for (const player of playersToRemind) {
      const missing = getMissingDocs(player);
      const parentIds = (links || []).filter((l) => l.student_id === player.id).map((l) => l.parent_id);
      const targetIds = [player.id, ...parentIds];
      const docList = missing.join(", ");

      await authFetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_ids: targetIds,
          title: "Document(s) manquant(s)",
          body: `Bonjour ${player.first_name}, merci de fournir : ${docList}.`,
          type: "deadline_reminder",
          reference_id: null,
          team_id: currentTeam.id,
          url: "/settings",
        }),
      });
      sentCount++;
    }

    setSendingBulk(false);
    toast.success(`Relances envoyees a ${sentCount} joueur${sentCount > 1 ? "s" : ""}`);
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
  const totalMissing = players.filter((p) => getMissingDocs(p).length > 0).length;

  function badgeFor(days: number | null): { label: string; variant: "default" | "destructive" | "secondary" | "outline" } {
    if (days === null) return { label: "Non renseignee", variant: "outline" };
    if (days < 0) return { label: "Expire", variant: "destructive" };
    if (days <= 30) return { label: `Dans ${days} j`, variant: "secondary" };
    return { label: "OK", variant: "default" };
  }

  if (!currentTeam) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    );
  }

  if (!isCoach && !hasClubRole) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Acces reserve au coach ou au comite</p>
      </div>
    );
  }

  return (
    <div className="section-gap">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-[var(--color-primary-blue)]" />
            Echeances
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Licences, certificats medicaux et cotisations
          </p>
        </div>
        {!loading && totalMissing > 0 && (
          <Button
            className="bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold"
            disabled={sendingBulk}
            onClick={sendBulkReminder}
          >
            {sendingBulk ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-1" />
            )}
            {sendingBulk ? "Envoi..." : `Relancer ${totalMissing} joueur${totalMissing > 1 ? "s" : ""}`}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/30 text-[var(--color-primary-blue)]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Licences a surveiller</p>
            <p className="text-lg font-bold">{licenceWarnings}</p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 dark:bg-green-950/30 text-[var(--color-success)]">
            <Stethoscope className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Certificats a surveiller</p>
            <p className="text-lg font-bold">{medicalWarnings}</p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/30 text-[var(--color-warning)]">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Cotisations a echoir</p>
            <p className="text-lg font-bold">{cotisWarnings}</p>
          </div>
        </div>
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
            const missing = getMissingDocs(p);
            const isReminding = sendingReminder === p.id;
            return (
              <Card key={p.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] text-xs font-bold">
                        {p.first_name[0]}{p.last_name[0]}
                      </div>
                      {p.first_name} {p.last_name}
                      {p.position && <span className="text-xs font-normal text-muted-foreground">· {p.position}</span>}
                    </CardTitle>
                    {missing.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1 shrink-0"
                        disabled={isReminding}
                        onClick={() => sendReminder(p)}
                      >
                        {isReminding ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Bell className="h-3.5 w-3.5" />
                        )}
                        {isReminding ? "Envoi..." : "Relancer"}
                      </Button>
                    )}
                  </div>
                  {missing.length > 0 && (
                    <p className="text-[11px] text-[var(--color-danger)] mt-1 ml-10">
                      Manquant : {missing.join(", ")}
                    </p>
                  )}
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
                      <Stethoscope className="h-3 w-3" /> Certificat medical
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
                            toast.success("Echeance de cotisation mise a jour");
                            setPlayers((prev) =>
                              prev.map((x) =>
                                x.id === p.id && x.cotisation ? { ...x, cotisation: { ...x.cotisation, due_date: val } } : x
                              )
                            );
                          }}
                        />
                        <span className="text-xs text-muted-foreground">
                          Reste {Math.max(0, Number(p.cotisation.amount_expected) - Number(p.cotisation.amount_paid)).toFixed(2)} EUR
                        </span>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground py-2">Aucune cotisation definie</p>
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
