"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useUserClubs } from "@/lib/useUserClubs";
import { ClubPageShell } from "@/components/club/ClubPageShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HeartPulse, FileDown, Phone, AlertTriangle, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { authFetch } from "@/lib/api-client";

interface MatchEvent {
  id: string;
  team_id: string;
  team_name: string;
  title: string;
  event_date: string | null;
}
interface UrgenceRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  phone: string | null;
  allergies: string | null;
  emergency_contacts: { name?: string; phone?: string; relation?: string }[] | null;
  medical_cert_expires_at: string | null;
}

export default function ClubUrgencesPage() {
  const { user } = useAuth();
  const { clubs, loading: clubsLoading } = useUserClubs();
  const [requested, setRequested] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [rows, setRows] = useState<UrgenceRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [canBook, setCanBook] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const supabaseRef = useRef(createClient());

  const clubId =
    requested && clubs.some((c) => c.club_id === requested)
      ? requested
      : (clubs[0]?.club_id ?? null);
  const selectedClub = clubs.find((c) => c.club_id === clubId) ?? null;
  const isCommittee = selectedClub?.role != null;

  const loadEvents = useCallback(async (cid: string) => {
    const { data: teamsData } = await supabaseRef.current
      .from("teams")
      .select("id, name")
      .eq("club_id", cid);
    const teamIds = ((teamsData || []) as { id: string; name: string }[]).map((t) => t.id);
    if (teamIds.length === 0) return { events: [] };

    const { data: eventsData } = await supabaseRef.current
      .from("events")
      .select("id, team_id, title, event_date")
      .in("team_id", teamIds)
      .eq("type", "match")
      .order("event_date", { ascending: false })
      .limit(50);
    const teamName = new Map(((teamsData || []) as { id: string; name: string }[]).map((t) => [t.id, t.name]));
    return {
      events: ((eventsData || []) as { id: string; team_id: string; title: string | null; event_date: string | null }[]).map(
        (e) => ({
          id: e.id,
          team_id: e.team_id,
          team_name: teamName.get(e.team_id) ?? "Équipe",
          title: e.title || "Match",
          event_date: e.event_date,
        })
      ),
    };
  }, []);

  const loadEventRows = useCallback(
    async (eventId: string, uid: string) => {
      setRowsLoading(true);
      const [{ data: attendances }, { data: teamRole }] = await Promise.all([
        supabaseRef.current
          .from("attendances")
          .select("user_id")
          .eq("event_id", eventId)
          .in("status", ["present", "late"]),
        supabaseRef.current
          .from("events")
          .select("team_id")
          .eq("id", eventId)
          .maybeSingle(),
      ]);
      const playerIds = ((attendances || []) as { user_id: string }[]).map((a) => a.user_id);
      if (playerIds.length === 0) {
        setRows([]);
        setRowsLoading(false);
        return;
      }
      const [{ data: profiles }, { data: coach }] = await Promise.all([
        supabaseRef.current
          .from("profiles")
          .select(
            "id, first_name, last_name, date_of_birth, phone, allergies, emergency_contacts, medical_cert_expires_at"
          )
          .in("id", playerIds),
        teamRole
          ? supabaseRef.current
              .from("team_members")
              .select("id")
              .eq("team_id", (teamRole as { team_id: string }).team_id)
              .eq("user_id", uid)
              .in("role", ["coach", "owner"])
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const isCoach = !!coach;
      const sorted = ((profiles || []) as UrgenceRow[]).sort((a, b) =>
        `${a.last_name ?? ""} ${a.first_name ?? ""}`.localeCompare(
          `${b.last_name ?? ""} ${b.first_name ?? ""}`,
          "fr"
        )
      );
      setRows(sorted);
      setCanBook(isCommittee || isCoach);
      setRowsLoading(false);
    },
    [isCommittee]
  );

  useEffect(() => {
    if (!clubId || !user) return;
    loadEvents(clubId).then((res) => {
      setEvents(res.events);
      setSelectedEventId(res.events[0]?.id ?? "");
      setRows([]);
      setPageLoading(false);
      if (res.events[0]?.id) {
        loadEventRows(res.events[0].id, user.id);
      }
    });
  }, [clubId, user, loadEvents, loadEventRows]);

  function onChangeClub(id: string) {
    setRequested(id);
    setPageLoading(true);
  }

  function onSelectEvent(eventId: string) {
    setSelectedEventId(eventId);
    if (user) loadEventRows(eventId, user.id).then(() => undefined);
  }

  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null;

  function downloadPdf(dataUrl: string, filename: string) {
    const byteString = atob(dataUrl.split(",")[1]);
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i += 1) bytes[i] = byteString.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function generatePdf() {
    if (!selectedEventId) return;
    setPdfLoading(true);
    try {
      const res = await authFetch("/api/clubs/emergency-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: selectedEventId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec");
      downloadPdf(data.pdf, `cahier-urgences-${selectedEvent?.title ?? "match"}.pdf`);
      toast.success("Cahier des urgences généré");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la génération");
    } finally {
      setPdfLoading(false);
    }
  }

  const withAllergies = rows.filter((r) => r.allergies && r.allergies.trim() !== "").length;

  return (
    <ClubPageShell
      title="Cahier des urgences"
      subtitle="Informations d'urgence des joueurs convoqués — à avoir le jour du match"
      clubs={clubs}
      clubId={clubId}
      onChangeClub={onChangeClub}
      loading={clubsLoading || (clubId ? pageLoading : false)}
      comiteOnly
    >
      <div className="space-y-4">
        <Card>
          <CardContent className="py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <HeartPulse className="h-5 w-5 text-red-600" />
              <div>
                <p className="font-medium text-sm">Match concerné</p>
                <p className="text-xs text-muted-foreground">
                  {selectedEvent ? (
                    <>
                      {selectedEvent.team_name} · {selectedEvent.title}
                      {selectedEvent.event_date
                        ? ` · ${new Date(selectedEvent.event_date).toLocaleDateString("fr-FR")}`
                        : ""}
                    </>
                  ) : (
                    "Aucun match trouvé dans ce club"
                  )}
                </p>
              </div>
            </div>
            {events.length > 1 && (
              <Select value={selectedEventId} onValueChange={(v) => onSelectEvent(v ?? "")}>
                <SelectTrigger className="w-56 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {events.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.team_name} — {e.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>

        {rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{rows.length} joueur{rows.length > 1 ? "s" : ""} présent{rows.length > 1 ? "s" : ""}</Badge>
            {withAllergies > 0 && (
              <Badge variant="destructive">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {withAllergies} allergie{withAllergies > 1 ? "s" : ""}
              </Badge>
            )}
            {canBook && (
              <Button size="sm" onClick={generatePdf} disabled={pdfLoading}>
                <FileDown className="h-3.5 w-3.5 mr-1" />
                {pdfLoading ? "Génération…" : "Télécharger le PDF"}
              </Button>
            )}
            {!canBook && (
              <span className="text-xs text-muted-foreground">
                Le téléchargement est réservé au coach de l&apos;équipe et au comité.
              </span>
            )}
          </div>
        )}

        {rowsLoading ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">Chargement…</CardContent>
          </Card>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Aucun joueur présent (statut « présent » ou « en retard ») sur ce match.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="divide-y">
              {rows.map((r) => {
                const firstContact = r.emergency_contacts?.[0];
                const certExpired =
                  r.medical_cert_expires_at &&
                  new Date(r.medical_cert_expires_at + "T00:00:00") < new Date();
                return (
                  <div key={r.id} className="py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-sm">
                        {r.last_name?.toUpperCase()} {r.first_name}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {r.date_of_birth && <span>Né(e) {new Date(r.date_of_birth).toLocaleDateString("fr-FR")}</span>}
                        {r.phone && (
                          <a href={`tel:${r.phone}`} className="flex items-center gap-1 text-blue-600 hover:underline">
                            <Phone className="h-3 w-3" />
                            {r.phone}
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="mt-1 space-y-0.5 text-sm">
                      {r.allergies ? (
                        <p className="flex items-center gap-1.5 text-red-700 font-medium">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Allergies : {r.allergies}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Aucune allergie connue</p>
                      )}
                      {firstContact && (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {firstContact.name || "Contact"}{firstContact.relation ? ` (${firstContact.relation})` : ""}
                          {firstContact.phone ? ` · ${firstContact.phone}` : ""}
                        </p>
                      )}
                      <p
                        className={`flex items-center gap-1.5 text-xs ${
                          certExpired ? "text-red-700 font-medium" : "text-muted-foreground"
                        }`}
                      >
                        <Stethoscope className="h-3 w-3" />
                        Certificat médical :{" "}
                        {r.medical_cert_expires_at
                          ? `${new Date(r.medical_cert_expires_at + "T00:00:00").toLocaleDateString("fr-FR")}${certExpired ? " (expiré)" : ""}`
                          : "non renseigné"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>
    </ClubPageShell>
  );
}