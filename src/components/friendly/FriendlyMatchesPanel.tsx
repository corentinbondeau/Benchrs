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
  opponent_club_name: string | null;
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

interface FetchResult {
  matches: FriendlyMatch[];
  proposalsByFriendly: Record<string, FriendlyProposal[]>;
  teamNames: Record<string, string>;
  error: string | null;
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

// Date locale du jour au format YYYY-MM-DD (les match_date sont des `date`).
function todayIso(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function FriendlyMatchesPanel() {
  const { currentTeam, userRole } = useTeam();
  const isCoach = userRole === "coach" || userRole === "owner";

  const [matches, setMatches] = useState<FriendlyMatch[]>([]);
  const [proposalsByFriendly, setProposalsByFriendly] = useState<
    Record<string, FriendlyProposal[]>
  >({});
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);

  const [category, setCategory] = useState("");
  const [level, setLevel] = useState("");
  const [matchDate, setMatchDate] = useState("");
  const [matchTime, setMatchTime] = useState("");
  const [locationType, setLocationType] = useState<"home" | "away" | "neutral">(
    "home"
  );
  const [venueAddress, setVenueAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [proposalMsg, setProposalMsg] = useState<Record<string, string>>({});

  const [filterCategory, setFilterCategory] = useState("");
  const [filterLevel, setFilterLevel] = useState("");

  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchData = useCallback(async (): Promise<FetchResult | null> => {
    if (!currentTeam || !isCoach) return null;
    // Purge best-effort des annonces expirées (idempotent) avant lecture.
    await authFetch("/api/friendly/purge", { method: "POST" }).catch(() => {});
    const supabase = createClient();
    const { data: matchesData, error: matchesError } = await supabase
      .from("friendly_matches")
      .select("*")
      .order("match_date", { ascending: true });

    const { data: proposalsData, error: proposalsError } = await supabase
      .from("friendly_proposals")
      .select("*");

    if (matchesError || proposalsError) {
      return {
        matches: [],
        proposalsByFriendly: {},
        teamNames: {},
        error: matchesError?.message || proposalsError?.message || "Erreur inconnue",
      };
    }

    const proposalMap: Record<string, FriendlyProposal[]> = {};
    for (const p of (proposalsData as FriendlyProposal[]) || []) {
      proposalMap[p.friendly_id] = proposalMap[p.friendly_id] || [];
      proposalMap[p.friendly_id].push(p);
    }

    const teamIds = new Set<string>(
      ((matchesData as FriendlyMatch[]) || [])
        .flatMap((m) => [m.team_id, m.accepted_by_team_id])
        .filter((id): id is string => !!id)
    );
    for (const p of (proposalsData as FriendlyProposal[]) || []) {
      teamIds.add(p.team_id);
    }

    const { data: teamsData } = teamIds.size
      ? await supabase.from("teams").select("id, name").in("id", Array.from(teamIds))
      : { data: [] };

    const namesMap: Record<string, string> = {};
    for (const t of (teamsData as { id: string; name: string }[]) || []) {
      namesMap[t.id] = t.name;
    }
    if (currentTeam) namesMap[currentTeam.id] = currentTeam.name;

    return {
      matches: (matchesData as FriendlyMatch[]) || [],
      proposalsByFriendly: proposalMap,
      teamNames: namesMap,
      error: null,
    };
  }, [currentTeam, isCoach]);

  const apply = useCallback((res: FetchResult) => {
    setMatches(res.matches);
    setProposalsByFriendly(res.proposalsByFriendly);
    setTeamNames(res.teamNames);
    setFetchError(res.error);
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

  // Toutes les actions passent par ici : on ne montre "succès" que si
  // l'API a réellement accepté, sinon on affiche l'erreur renvoyée.
  async function post(url: string, body?: unknown): Promise<boolean> {
    try {
      const res = await authFetch(url, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({} as Record<string, string>));
      if (!res.ok || data.error) {
        toast.error(data.error || "Erreur lors de l'action");
        return false;
      }
      return true;
    } catch {
      toast.error("Erreur réseau — action non effectuée");
      return false;
    }
  }
  async function createMatch() {
    if (!currentTeam || !matchDate) return;
    setSaving(true);
    const ok = await post("/api/friendly", {
      team_id: currentTeam.id,
      category: category || null,
      level: level || null,
      match_date: matchDate,
      match_time: matchTime || null,
      location_type: locationType,
      venue_address: locationType !== "home" ? venueAddress || null : null,
      notes: notes || null,
    });
    setSaving(false);
    if (!ok) return;
    setOpen(false);
    setCategory("");
    setLevel("");
    setMatchDate("");
    setMatchTime("");
    setLocationType("home");
    setVenueAddress("");
    setNotes("");
    await refresh();
    toast.success("Créneau publié — en attente de propositions");
  }

  async function propose(friendlyId: string) {
    if (!currentTeam) return;
    const msg = proposalMsg[friendlyId] || "";
    const ok = await post(`/api/friendly/${friendlyId}/propose`, {
      team_id: currentTeam.id,
      message: msg || null,
    });
    if (!ok) return;
    setProposalMsg((m) => ({ ...m, [friendlyId]: "" }));
    await refresh();
    toast.success("Proposition envoyée");
  }

  async function acceptProposal(friendlyId: string, proposalId: string) {
    const ok = await post(`/api/friendly/${friendlyId}/proposals/${proposalId}/accept`);
    if (!ok) return;
    await refresh();
    toast.success("Proposition acceptée");
  }

  async function declineProposal(friendlyId: string, proposalId: string) {
    const ok = await post(`/api/friendly/${friendlyId}/proposals/${proposalId}/decline`);
    if (!ok) return;
    await refresh();
    toast.success("Proposition refusée");
  }

  async function confirmMatch(friendlyId: string) {
    const ok = await post(`/api/friendly/${friendlyId}/confirm`);
    if (!ok) return;
    await refresh();
    toast.success("Match confirmé");
  }

  async function cancelMatch(friendlyId: string) {
    const ok = await post(`/api/friendly/${friendlyId}/cancel`);
    if (!ok) return;
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
  const today = todayIso();
  // Une annonce ouverte dont la date est passée n'a plus lieu d'être affichée
  // (elle est aussi supprimée en base par la purge).
  const isActive = (m: FriendlyMatch) =>
    !(m.status === "open" && m.match_date < today);

  const myMatches = matches.filter(
    (m) =>
      (m.team_id === currentTeam.id || m.accepted_by_team_id === currentTeam.id) &&
      isActive(m)
  );

  const myProposals = (proposalsByFriendly &&
    Object.entries(proposalsByFriendly)
      .map(([friendlyId, props]) => {
        const m = matches.find((x) => x.id === friendlyId);
        if (
          !m ||
          !isActive(m) ||
          m.team_id === currentTeam.id ||
          m.accepted_by_team_id === currentTeam.id
        )
          return null;
        const myProp = props.find((p) => p.team_id === currentTeam.id);
        if (!myProp) return null;
        return { match: m, proposal: myProp };
      })
      .filter(Boolean)) as { match: FriendlyMatch; proposal: FriendlyProposal }[];

  const myProposalFriendlyIds = new Set(myProposals.map((p) => p.match.id));

  const openMatches = matches.filter(
    (m) =>
      m.status === "open" &&
      m.match_date >= today &&
      m.team_id !== currentTeam.id &&
      m.accepted_by_team_id !== currentTeam.id &&
      !myProposalFriendlyIds.has(m.id)
  );

  // Filtres catégorie / niveau : options issues des annonces visibles.
  const categoryOptions = Array.from(
    new Set(openMatches.map((m) => m.category).filter((c): c is string => !!c))
  ).sort((a, b) => a.localeCompare(b, "fr"));
  const levelOptions = Array.from(
    new Set(openMatches.map((m) => m.level).filter((l): l is string => !!l))
  ).sort((a, b) => a.localeCompare(b, "fr"));

  const filteredOpenMatches = openMatches.filter(
    (m) =>
      (!filterCategory || m.category === filterCategory) &&
      (!filterLevel || m.level === filterLevel)
  );

  const statusVariant = (
    status: FriendlyMatch["status"]
  ): "default" | "secondary" | "destructive" | "outline" => {
    if (status === "confirmed") return "default";
    if (status === "cancelled" || status === "declined") return "destructive";
    if (status === "accepted") return "secondary";
    return "outline";
  };

  function teamName(id: string | null) {
    if (!id) return "—";
    return teamNames[id] || id;
  }
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
                Chercher un adversaire
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Chercher un adversaire</DialogTitle>
              </DialogHeader>
              <p className="text-xs text-muted-foreground">
                Publiez un créneau : les coachs intéressés se proposeront et
                vous choisirez votre adversaire.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
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
                <Button onClick={createMatch} disabled={saving || !matchDate}>
                  Publier
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {fetchError && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-700">
            Impossible de charger les matchs amicaux — la base n&apos;est peut-être
            pas à jour (migration « matchs amicaux »).<br />
            <span className="font-mono break-all">{fetchError}</span>
          </div>
        )}

        {/* Mes annonces */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase">
            Mes annonces
          </p>
          {myMatches.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Aucun créneau publié pour le moment. Publiez une date et les
              coachs intéressés se proposeront.
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
                          ? m.status === "open"
                            ? "Recherche d'adversaire"
                            : `Match contre ${teamName(m.accepted_by_team_id)}`
                          : `Match contre ${teamName(m.team_id)}`}
                      </p>
                      {(m.category || m.level) && (
                        <p className="text-muted-foreground text-xs">
                          {m.category || ""}
                          {m.category && m.level ? " · " : ""}
                          {m.level || ""}
                        </p>
                      )}
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
                            <p className="text-xs font-medium">{teamName(p.team_id)}</p>
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

                  {isOrganizer && m.status === "accepted" && (
                    <div className="mt-3 flex items-center justify-between border-t pt-2">
                      <p className="text-xs text-muted-foreground">
                        Adversaire : {teamName(m.accepted_by_team_id)}
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
        {/* Mes demandes en cours */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase">
            Mes demandes en cours
          </p>
          {myProposals.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Aucune proposition envoyée pour le moment.
            </p>
          )}
          <div className="space-y-2">
            {myProposals.map(({ match: m, proposal: p }) => (
              <div key={p.id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {teamName(m.team_id)} — recherche un adversaire
                    </p>
                    {(m.category || m.level) && (
                      <p className="text-xs text-muted-foreground">
                        {m.category || ""}
                        {m.category && m.level ? " · " : ""}
                        {m.level || ""}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline">
                    {p.status === "pending"
                      ? "En attente"
                      : p.status === "accepted"
                      ? "Acceptée"
                      : "Refusée"}
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
                {p.message && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Mon message : {p.message}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
        {/* Annonces des autres équipes (créneaux ouverts) */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase">
            Annonces des autres équipes
          </p>

          {(categoryOptions.length > 0 || levelOptions.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {categoryOptions.length > 0 && (
                <select
                  className="rounded-md border bg-background px-3 py-1.5 text-xs"
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                >
                  <option value="">Toutes les catégories</option>
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
              {levelOptions.length > 0 && (
                <select
                  className="rounded-md border bg-background px-3 py-1.5 text-xs"
                  value={filterLevel}
                  onChange={(e) => setFilterLevel(e.target.value)}
                >
                  <option value="">Tous les niveaux</option>
                  {levelOptions.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              )}
              {(filterCategory || filterLevel) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-auto px-2 py-1 text-xs"
                  onClick={() => {
                    setFilterCategory("");
                    setFilterLevel("");
                  }}
                >
                  Réinitialiser
                </Button>
              )}
            </div>
          )}

          {filteredOpenMatches.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {openMatches.length === 0
                ? "Aucune annonce disponible pour le moment."
                : "Aucune annonce ne correspond à ces filtres."}
            </p>
          )}
          <div className="space-y-2">
            {filteredOpenMatches.map((m) => (
              <div key={m.id} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">
                  {teamName(m.team_id)}
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    — recherche un adversaire
                  </span>
                </p>
                {(m.category || m.level) && (
                  <p className="text-xs text-muted-foreground">
                    {m.category || ""}
                    {m.category && m.level ? " · " : ""}
                    {m.level || ""}
                  </p>
                )}
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
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
