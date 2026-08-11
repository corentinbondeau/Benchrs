"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api-client";
import { toast } from "sonner";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  CalendarRange,
  Loader2,
  MapPin,
  Plus,
  Send,
  Trash2,
  Trophy,
} from "lucide-react";
import type { Tournament, TournamentMatch } from "@/types";

function fmtDate(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) +
    " · " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export default function TournamentPage() {
  const { user } = useAuth();
  const { currentTeam, userRole } = useTeam();
  const isCoach = userRole === "coach" || userRole === "owner";
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [matchesByTournament, setMatchesByTournament] = useState<Record<string, TournamentMatch[]>>({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [matchOpen, setMatchOpen] = useState(false);
  const [matchTournament, setMatchTournament] = useState<string>("");
  const [opponent, setOpponent] = useState("");
  const [matchDatetime, setMatchDatetime] = useState("");
  const [venue, setVenue] = useState("");

  const fetchData = useCallback(async (teamId: string) => {
    const supabase = createClient();
    const [tourRes, matchRes] = await Promise.all([
      supabase
        .from("tournaments")
        .select("*")
        .eq("team_id", teamId)
        .order("start_date", { ascending: false }),
      supabase
        .from("tournament_matches")
        .select("*")
        .eq("team_id", teamId)
        .order("match_datetime", { ascending: true }),
    ]);
    const tournaments = (tourRes.data as Tournament[]) || [];
    const map: Record<string, TournamentMatch[]> = {};
    for (const m of (matchRes.data as TournamentMatch[]) || []) {
      if (!map[m.tournament_id]) map[m.tournament_id] = [];
      map[m.tournament_id].push(m);
    }
    return { tournaments, matchesByTournament: map };
  }, []);

  useEffect(() => {
    if (!currentTeam) return;
    fetchData(currentTeam.id).then((data) => {
      setTournaments(data.tournaments);
      setMatchesByTournament(data.matchesByTournament);
      setLoading(false);
    });
  }, [currentTeam?.id, fetchData]);

  async function createTournament() {
    if (!name.trim() || !currentTeam) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("tournaments")
        .insert({
          team_id: currentTeam.id,
          name: name.trim(),
          start_date: startDate,
          end_date: endDate,
          location: location.trim() || null,
          notes: notes.trim() || null,
          created_by: user?.id,
        })
        .select()
        .single();
      if (error) throw error;
      toast.success("Tournoi créé");
      setTournaments((prev) => [data as Tournament, ...prev]);
      setCreateOpen(false);
      setName("");
      setLocation("");
      setNotes("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTournament(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("tournaments").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setTournaments((prev) => prev.filter((t) => t.id !== id));
    toast.success("Tournoi supprimé");
  }

  async function addMatch() {
    if (!matchTournament || !opponent.trim() || !matchDatetime) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("tournament_matches")
        .insert({
          tournament_id: matchTournament,
          team_id: currentTeam!.id,
          opponent: opponent.trim(),
          match_datetime: new Date(matchDatetime).toISOString(),
          venue: venue.trim() || null,
          sort_order: 0,
        })
        .select()
        .single();
      if (error) throw error;
      setMatchesByTournament((prev) => ({
        ...prev,
        [matchTournament]: [...(prev[matchTournament] || []), data as TournamentMatch].sort((a, b) =>
          new Date(a.match_datetime).getTime() - new Date(b.match_datetime).getTime()
        ),
      }));
      toast.success("Match ajouté");
      setMatchOpen(false);
      setOpponent("");
      setMatchDatetime("");
      setVenue("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function deleteMatch(id: string, tournamentId: string) {
    const supabase = createClient();
    const { error } = await supabase.from("tournament_matches").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMatchesByTournament((prev) => ({
      ...prev,
      [tournamentId]: (prev[tournamentId] || []).filter((m) => m.id !== id),
    }));
  }

  async function sendToFamilies(tournament: Tournament) {
    if (!currentTeam || !user) return;
    setSending(tournament.id);
    try {
      const supabase = createClient();
      const { data: players } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("team_id", currentTeam.id)
        .eq("role", "player");
      const playerIds = (players || []).map((p) => (p as { user_id: string }).user_id);
      const { data: active } = playerIds.length
        ? await supabase.from("profiles").select("id").in("id", playerIds).neq("is_active", false)
        : { data: [] as { id: string }[] };
      const { data: links } = await supabase
        .from("parent_student")
        .select("parent_id")
        .eq("team_id", currentTeam.id)
        .in("student_id", playerIds);
      const parentIds = [...new Set((links || []).map((l) => (l as { parent_id: string }).parent_id))];
      const userIds = [...new Set([...((active || []).map((p) => p.id)), ...parentIds])];
      if (userIds.length === 0) {
        toast.error("Aucun destinataire");
        return;
      }
      const matches = matchesByTournament[tournament.id] || [];
      const body = matches
        .map((m) => `${fmtDateTime(m.match_datetime)} — ${m.opponent}${m.venue ? ` (${m.venue})` : ""}`)
        .join("\n");
      const res = await authFetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_ids: userIds,
          title: `Tournoi : ${tournament.name}`,
          body:
            `${tournament.location ? `📍 ${tournament.location}\n` : ""}${body || "Détails à venir."}\n` +
            (tournament.notes ? `\n${tournament.notes}` : ""),
          type: "tournament",
          reference_id: tournament.id,
          team_id: currentTeam.id,
          url: "/tournament",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Erreur lors de l'envoi");
      }
      toast.success(`Programme envoyé à ${userIds.length} destinataire(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'envoi");
    } finally {
      setSending(null);
    }
  }

  if (!currentTeam) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 md:space-y-6 pb-20 md:pb-0">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Trophy className="h-6 w-6" />
            Tournois & week-ends
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Préparez un week-end de tournoi et envoyez le programme aux familles
          </p>
        </div>
        {isCoach && (
          <Button
            size="sm"
            onClick={() => {
              setName("");
              setLocation("");
              setNotes("");
              setCreateOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            Nouveau tournoi
          </Button>
        )}
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">Chargement...</CardContent>
        </Card>
      ) : tournaments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Trophy className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground">
              Aucun tournoi. {isCoach && "Créez-en un pour planifier le week-end."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tournaments.map((t) => {
            const matches = matchesByTournament[t.id] || [];
            return (
              <Card key={t.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{t.name}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                        <CalendarRange className="h-3.5 w-3.5" />
                        {fmtDate(t.start_date)} → {fmtDate(t.end_date)}
                        {t.location && (
                          <>
                            <MapPin className="h-3.5 w-3.5 ml-1" />
                            {t.location}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isCoach && (
                        <Button
                          size="sm"
                          className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
                          disabled={sending !== null}
                          onClick={() => sendToFamilies(t)}
                        >
                          {sending === t.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                          ) : (
                            <Send className="h-3.5 w-3.5 mr-1" />
                          )}
                          Envoyer aux familles
                        </Button>
                      )}
                      {isCoach && (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="text-red-500"
                          onClick={() => deleteTournament(t.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {t.notes && <p className="text-sm text-muted-foreground">{t.notes}</p>}

                  <div className="space-y-1.5">
                    {matches.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Aucun match planifié.
                      </p>
                    ) : (
                      matches.map((m) => (
                        <div key={m.id} className="flex items-center gap-2 rounded-lg border bg-background p-2">
                          <Badge variant="outline" className="shrink-0 tabular-nums">
                            {fmtDateTime(m.match_datetime)}
                          </Badge>
                          <span className="text-sm font-medium truncate">vs {m.opponent}</span>
                          {m.venue && (
                            <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                              · {m.venue}
                            </span>
                          )}
                          {isCoach && (
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              className="ml-auto text-red-500"
                              onClick={() => deleteMatch(m.id, t.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      ))
                    )}
                    {isCoach && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setMatchTournament(t.id);
                          setOpponent("");
                          setMatchDatetime("");
                          setVenue("");
                          setMatchOpen(true);
                        }}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Ajouter un match
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau tournoi</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nom *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tournoi de la Toussaint" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Début</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Fin</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Lieu (optionnel)</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Complexe sportif..." />
            </div>
            <div className="space-y-1">
              <Label>Notes (optionnel)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Hébergement, repas..." />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={createTournament} disabled={!name.trim() || saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={matchOpen} onOpenChange={setMatchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter un match</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Adversaire *</Label>
              <Input value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="AS Camphin" />
            </div>
            <div className="space-y-1">
              <Label>Date et heure *</Label>
              <Input
                type="datetime-local"
                value={matchDatetime}
                onChange={(e) => setMatchDatetime(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Lieu (optionnel)</Label>
              <Input value={venue} onChange={(e) => setVenue(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={addMatch} disabled={!opponent.trim() || !matchDatetime || saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
