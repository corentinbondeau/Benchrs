"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api-client";
import { useTeam } from "@/lib/team";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Calendar, Check, MapPin, Plus, Users, X } from "lucide-react";
import { toast } from "sonner";

interface FriendlyMatch {
  id: string;
  team_id: string;
  organizer_id: string;
  opponent_club_name: string;
  opponent_contact: string | null;
  category: string | null;
  level: string | null;
  match_date: string;
  match_time: string | null;
  location_type: "home" | "away" | "neutral";
  venue_address: string | null;
  notes: string | null;
  status: "open" | "accepted" | "confirmed" | "cancelled" | "declined";
  accepted_by_team_id: string | null;
  accepted_by_coach_id: string | null;
}

interface FriendlyProposal {
  id: string;
  friendly_id: string;
  team_id: string;
  coach_id: string;
  message: string | null;
  status: "pending" | "accepted" | "declined";
}

interface CoachInfo {
  team_id: string;
  team_name: string;
  club_id: string | null;
  club_name: string | null;
  coach_id: string;
  first_name: string | null;
  last_name: string | null;
}

interface FetchResult {
  matches: FriendlyMatch[];
  proposalsByFriendly: Record<string, FriendlyProposal[]>;
  coaches: CoachInfo[];
}

const LOCATION_LABELS: Record<FriendlyMatch["location_type"], string> = {
  home: "Domicile",
  away: "Extérieur",
  neutral: "Terrain neutre",
};

const STATUS_LABELS: Record<FriendlyMatch["status"], string> = {
  open: "En recherche d'adversaire",
  accepted: "Adversaire trouvé",
  confirmed: "Confirmé",
  cancelled: "Annulé",
  declined: "Refusé",
};

function formatMatchDate(date: string, time: string | null): string {
  const d = new Date(`${date}T${time || "00:00"}`);
  const day = d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return time ? `${day} à ${time.slice(0, 5)}` : day;
}

export function FriendlyMatchesPanel() {
  const { currentTeam, userRole } = useTeam();
  const isCoach = userRole === "coach" || userRole === "owner";

  const [matches, setMatches] = useState<FriendlyMatch[]>([]);
  const [proposalsByFriendly, setProposalsByFriendly] = useState<
    Record<string, FriendlyProposal[]>
  >({});
  const [coaches, setCoaches] = useState<CoachInfo[]>([]);
  const [open, setOpen] = useState(false);

  const [opponent, setOpponent] = useState("");
  const [category, setCategory] = useState("");
  const [level, setLevel] = useState("");
  const [matchDate, setMatchDate] = useState("");
  const [matchTime, setMatchTime] = useState("");
  const [locationType, setLocationType] = useState<"home" | "away" | "neutral">(
    "home"
  );
  const [venueAddress, setVenueAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [opponentContact, setOpponentContact] = useState("");
  const [saving, setSaving] = useState(false);
  const [proposalMsg, setProposalMsg] = useState<Record<string, string>>({});

  const fetchData = useCallback(async (): Promise<FetchResult | null> => {
    if (!currentTeam || !isCoach) return null;
    const supabase = createClient();
    const { data: matchesData } = await supabase
      .from("friendly_matches")
      .select("*")
      .order("match_date", { ascending: true });
    const { data: proposalsData } = await supabase
      .from("friendly_proposals")
      .select("*");

    const proposalMap: Record<string, FriendlyProposal[]> = {};
    for (const p of (proposalsData as FriendlyProposal[]) || []) {
      proposalMap[p.friendly_id] = proposalMap[p.friendly_id] || [];
      proposalMap[p.friendly_id].push(p);
    }

    const { data: teamsData } = await supabase
      .from("teams")
      .select("id, name, club_id");
    const teamRows = (teamsData as { id: string; name: string; club_id: string | null }[]) || [];

    const { data: membersData } = await supabase
      .from("team_members")
      .select("team_id, user_id")
      .in("role", ["coach", "owner"]);
    const memberRows = (membersData as { team_id: string; user_id: string }[]) || [];

    const coachIds = [...new Set(memberRows.map((m) => m.user_id))];
    const { data: profsData } = coachIds.length
      ? await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", coachIds)
      : { data: [] };
    const profRows =
      (profsData as { id: string; first_name: string | null; last_name: string | null }[]) || [];

    const { data: clubsData } = await supabase
      .from("clubs")
      .select("id, name");
    const clubRows = (clubsData as { id: string; name: string }[]) || [];
    const clubsMap = new Map(clubRows.map((c) => [c.id, c.name]));
    const profsMap = new Map(profRows.map((p) => [p.id, p]));

    const list: CoachInfo[] = memberRows.map((m) => {
      const team = teamRows.find((t) => t.id === m.team_id);
      const prof = profsMap.get(m.user_id);
      return {
        team_id: m.team_id,
        team_name: team?.name || "",
        club_id: team?.club_id || null,
        club_name: team?.club_id ? clubsMap.get(team.club_id) || null : null,
        coach_id: m.user_id,
        first_name: prof?.first_name || null,
        last_name: prof?.last_name || null,
      };
    });

    return {
      matches: (matchesData as FriendlyMatch[]) || [],
      proposalsByFriendly: proposalMap,
      coaches: list,
    };
  }, [currentTeam, isCoach]);

  const apply = useCallback((res: FetchResult) => {
    setMatches(res.matches);
    setProposalsByFriendly(res.proposalsByFriendly);
    setCoaches(res.coaches);
  }, []);

  useEffect(() => {
    let active = true;
    fetchData().then((res) => {
      if (active && res) apply(res);
    });
    return () => {
      active = false;
    };
  }, [fetchData, apply]);

  async function refresh() {
    const res = await fetchData();
    if (res) apply(res);
  }

  async function createMatch() {
    if (!currentTeam || !opponent || !matchDate) return;
    setSaving(true);
    await authFetch("/api/friendly", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        team_id: currentTeam.id,
        opponent_club_name: opponent,
        opponent_contact: opponentContact || null,
        category: category || null,
        level: level || null,
        match_date: matchDate,
        match_time: matchTime || null,
        location_type: locationType,
        venue_address: locationType !== "home" ? venueAddress || null : null,
        notes: notes || null,
      }),
    });
    setSaving(false);
    setOpen(false);
    setOpponent("");
    setCategory("");
    setLevel("");
    setMatchDate("");
    setMatchTime("");
    setLocationType("home");
    setVenueAddress("");
    setNotes("");
    setOpponentContact("");
    await refresh();
    toast.success("Match amical proposé");
  }

  async function propose(friendlyId: string) {
    if (!currentTeam) return;
    const msg = proposalMsg[friendlyId] || "";
    await authFetch(`/api/friendly/${friendlyId}/propose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team_id: currentTeam.id, message: msg || null }),
    });
    setProposalMsg((m) => ({ ...m, [friendlyId]: "" }));
    await refresh();
    toast.success("Proposition envoyée");
  }

  async function acceptProposal(friendlyId: string, proposalId: string) {
    await authFetch(
      `/api/friendly/${friendlyId}/proposals/${proposalId}/accept`,
      { method: "POST" }
    );
    await refresh();
    toast.success("Proposition acceptée");
  }

  async function declineProposal(friendlyId: string, proposalId: string) {
    await authFetch(
      `/api/friendly/${friendlyId}/proposals/${proposalId}/decline`,
      { method: "POST" }
    );
    await refresh();
    toast.success("Proposition refusée");
  }

  async function confirmMatch(friendlyId: string) {
    await authFetch(`/api/friendly/${friendlyId}/confirm`, { method: "POST" });
    await refresh();
    toast.success("Match confirmé");
  }

  async function cancelMatch(friendlyId: string) {
    await authFetch(`/api/friendly/${friendlyId}/cancel`, { method: "POST" });
    await refresh();
    toast.success("Match annulé");
  }

  if (!isCoach) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          Les matchs amicaux sont réservés aux coachs de l&apos;équipe.
        </CardContent>
      </Card>
    );
  }
  if (!currentTeam) return null;

  const teamNameById = new Map(coaches.map((c) => [c.team_id, c.team_name]));
  teamNameById.set(currentTeam.id, currentTeam.name);

  const myMatches = matches.filter(
    (m) =>
      m.team_id === currentTeam.id || m.accepted_by_team_id === currentTeam.id
  );
  const openMatches = matches.filter(
    (m) => m.status === "open" && m.team_id !== currentTeam.id
  );

  const statusVariant = (
    status: FriendlyMatch["status"]
  ): "default" | "secondary" | "destructive" | "outline" => {
    if (status === "confirmed") return "default";
    if (status === "cancelled" || status === "declined") return "destructive";
    if (status === "accepted") return "secondary";
    return "outline";
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Matchs amicaux
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger>
              <Button size="sm">
                <Plus className="mr-1 h-4 w-4" />
                Proposer un match
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Proposer un match amical</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Club adverse</Label>
                  <Input
                    value={opponent}
                    onChange={(e) => setOpponent(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Contact adverse</Label>
                  <Input
                    value={opponentContact}
                    onChange={(e) => setOpponentContact(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Catégorie</Label>
                  <Input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Niveau souhaité</Label>
                  <Input
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={matchDate}
                    onChange={(e) => setMatchDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Heure</Label>
                  <Input
                    type="time"
                    value={matchTime}
                    onChange={(e) => setMatchTime(e.target.value)}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Lieu</Label>
                  <select
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    value={locationType}
                    onChange={(e) =>
                      setLocationType(
                        e.target.value as "home" | "away" | "neutral"
                      )
                    }
                  >
                    <option value="home">
                      Domicile (adresse de notre terrain/club)
                    </option>
                    <option value="away">Extérieur (chez l&apos;adversaire)</option>
                    <option value="neutral">Neutre</option>
                  </select>
                </div>
                {locationType !== "home" && (
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Adresse du lieu</Label>
                    <Input
                      value={venueAddress}
                      onChange={(e) => setVenueAddress(e.target.value)}
                    />
                  </div>
                )}
                <div className="space-y-1 sm:col-span-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Annuler
                </Button>
                <Button
                  onClick={createMatch}
                  disabled={saving || !opponent || !matchDate}
                >
                  Proposer
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Mes matchs amicaux */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase">
            Mes annonces
          </p>
          {myMatches.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Aucun match amical proposé pour le moment.
            </p>
          )}
          <div className="space-y-2">
            {myMatches.map((m) => {
              const isOrganizer = m.team_id === currentTeam.id;
              const proposals = proposalsByFriendly[m.id] || [];
              const pending = proposals.filter((p) => p.status === "pending");
              return (
                <div key={m.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {isOrganizer
                          ? `Cherche adversaire — ${m.opponent_club_name}`
                          : `Match contre ${teamNameById.get(m.team_id) || "adversaire"}`}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {m.opponent_club_name}
                        {m.category ? ` · ${m.category}` : ""}
                        {m.level ? ` · ${m.level}` : ""}
                      </p>
                    </div>
                    <Badge variant={statusVariant(m.status)}>
                      {STATUS_LABELS[m.status]}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatMatchDate(m.match_date, m.match_time)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {LOCATION_LABELS[m.location_type]}
                      {m.venue_address ? ` — ${m.venue_address}` : ""}
                    </span>
                  </div>
                  {m.notes && (
                    <p className="mt-1 text-xs text-muted-foreground">{m.notes}</p>
                  )}

                  {/* Propositions reçues (organisateur) */}
                  {isOrganizer && m.status === "open" && pending.length > 0 && (
                    <div className="mt-3 space-y-2 border-t pt-2">
                      <p className="text-xs font-semibold">
                        {pending.length} proposition(s)
                      </p>
                      {pending.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1.5"
                        >
                          <div>
                            <p className="text-xs font-medium">
                              {teamNameById.get(p.team_id) || "Équipe"}
                            </p>
                            {p.message && (
                              <p className="text-xs text-muted-foreground">
                                {p.message}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              onClick={() => acceptProposal(m.id, p.id)}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => declineProposal(m.id, p.id)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Actions organisateur */}
                  {isOrganizer && m.status === "accepted" && (
                    <div className="mt-3 flex items-center justify-between border-t pt-2">
                      <p className="text-xs text-muted-foreground">
                        Adversaire : {teamNameById.get(m.accepted_by_team_id || "") || "—"}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => cancelMatch(m.id)}
                        >
                          Annuler
                        </Button>
                        <Button size="sm" onClick={() => confirmMatch(m.id)}>
                          Confirmer
                        </Button>
                      </div>
                    </div>
                  )}
                  {isOrganizer &&
                    (m.status === "confirmed" || m.status === "open") && (
                      <div className="mt-3 flex justify-end border-t pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => cancelMatch(m.id)}
                        >
                          Annuler l&apos;annonce
                        </Button>
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Matchs ouverts des autres équipes */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase">
            Annonces des autres équipes
          </p>
          {openMatches.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Aucune annonce disponible pour le moment.
            </p>
          )}
          <div className="space-y-2">
            {openMatches.map((m) => {
              const myProposal = (proposalsByFriendly[m.id] || []).find(
                (p) => p.team_id === currentTeam.id
              );
              return (
                <div key={m.id} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">
                    {teamNameById.get(m.team_id) || "Équipe"}
                    {" · "}
                    <span className="text-muted-foreground font-normal">
                      {m.opponent_club_name}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {m.category ? `${m.category}` : ""}
                    {m.level ? ` · ${m.level}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatMatchDate(m.match_date, m.match_time)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {LOCATION_LABELS[m.location_type]}
                      {m.venue_address ? ` — ${m.venue_address}` : ""}
                    </span>
                  </div>
                  {m.notes && (
                    <p className="mt-1 text-xs text-muted-foreground">{m.notes}</p>
                  )}
                  {myProposal ? (
                    <p className="mt-2 text-xs font-medium text-[var(--color-royal)]">
                      {myProposal.status === "pending"
                        ? "Proposition envoyée — en attente de réponse"
                        : myProposal.status === "accepted"
                          ? "Vous avez été retenu"
                          : "Proposition refusée"}
                    </p>
                  ) : (
                    <div className="mt-3 flex items-end gap-2">
                      <Textarea
                        className="min-h-9 flex-1"
                        placeholder="Message (optionnel)"
                        value={proposalMsg[m.id] || ""}
                        onChange={(e) =>
                          setProposalMsg((s) => ({
                            ...s,
                            [m.id]: e.target.value,
                          }))
                        }
                      />
                      <Button size="sm" onClick={() => propose(m.id)}>
                        Se proposer
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Coachs utilisant l'application */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase">
            Coachs utilisant l&apos;application
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {coaches.map((c, i) => (
              <div
                key={`${c.coach_id}-${c.team_id}-${i}`}
                className="rounded-lg border p-2 text-xs"
              >
                <p className="font-medium">
                  {c.last_name} {c.first_name}
                </p>
                <p className="text-muted-foreground">{c.club_name || "—"}</p>
                <p className="text-muted-foreground">Équipe : {c.team_name}</p>
              </div>
            ))}
            {coaches.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Aucun autre coach trouvé
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
