"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Plus, Users, Check, X } from "lucide-react";
import { toast } from "sonner";
import type { Profile } from "@/types";

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
  team?: { name: string };
}

interface CoachInfo {
  team_id: string;
  team_name: string;
  club_id: string | null;
  club_name: string | null;
  coach_id: string;
  first_name: string | null;
  last_name: string | null;
  category: string | null;
}

export function FriendlyMatchesPanel() {
  const { user } = useAuth();
  const { currentTeam, userRole } = useTeam();
  const isCoach = userRole === "coach" || userRole === "owner";

  const [matches, setMatches] = useState<FriendlyMatch[]>([]);
  const [proposals, setProposals] = useState<Record<string, FriendlyProposal[]>>({});
  const [coaches, setCoaches] = useState<CoachInfo[]>([]);
  const [open, setOpen] = useState(false);

  const [opponent, setOpponent] = useState("");
  const [category, setCategory] = useState("");
  const [level, setLevel] = useState("");
  const [matchDate, setMatchDate] = useState("");
  const [matchTime, setMatchTime] = useState("");
  const [locationType, setLocationType] = useState<"home" | "away" | "neutral">("home");
  const [venueAddress, setVenueAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [opponentContact, setOpponentContact] = useState("");
  const [saving, setSaving] = useState(false);
  const [proposalMsg, setProposalMsg] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!currentTeam || !isCoach) return;
    const supabase = createClient();
    const { data: matchesData } = await supabase.from("friendly_matches").select("*").order("created_at", { ascending: false });
    setMatches((matchesData as any) || []);
    const { data: proposalsData } = await supabase.from("friendly_proposals").select("*");
    const all = (proposalsData as any) || [];
    const by: Record<string, any[]> = {};
    for (const p of all) {
      by[p.friendly_id] = by[p.friendly_id] || [];
      by[p.friendly_id].push(p);
    }
    setProposals(by);
    const { data: teamsData } = await supabase.from("teams").select("id, name, club_id");
    const { data: membersData } = await supabase.from("team_members").select("team_id, user_id").in("role", ["coach", "owner"]);
    const coachIds = [...new Set((membersData as any[])?.map((m) => m.user_id) || [])];
    const { data: profsData } = coachIds.length ? await supabase.from("profiles").select("id, first_name, last_name") : { data: [] };
    const { data: clubsData } = await supabase.from("clubs").select("id, name");
    const clubsMap = new Map((clubsData as any[])?.map((c) => [c.id, c.name]) || []);
    const profsMap = new Map((profsData as any[])?.map((p) => [p.id, p]) || []);
    const list: CoachInfo[] = ((membersData as any[]) || []).map((m) => {
      const team = (teamsData as any[])?.find((t) => t.id === m.team_id);
      return {
        team_id: m.team_id,
        team_name: team?.name || "",
        club_id: team?.club_id || null,
        club_name: team?.club_id ? clubsMap.get(team.club_id) || null : null,
        coach_id: m.user_id,
        first_name: profsMap.get(m.user_id)?.first_name || null,
        last_name: profsMap.get(m.user_id)?.last_name || null,
        category: null,
      };
    });
    setCoaches(list);
  }, [currentTeam, isCoach]);

  useEffect(() => { load(); }, [load]);

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
    setOpponent(""); setCategory(""); setLevel(""); setMatchDate(""); setMatchTime(""); setLocationType("home"); setVenueAddress(""); setNotes(""); setOpponentContact("");
    load();
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
    load();
    toast.success("Proposition envoyée");
  }

  async function acceptProposal(friendlyId: string, proposalId: string) {
    await authFetch(`/api/friendly/${friendlyId}/proposals/${proposalId}/accept`, { method: "POST" });
    load();
    toast.success("Proposition acceptée");
  }

  async function declineProposal(friendlyId: string, proposalId: string) {
    await authFetch(`/api/friendly/${friendlyId}/proposals/${proposalId}/decline`, { method: "POST" });
    load();
    toast.success("Proposition refusée");
  }

  async function confirmMatch(friendlyId: string) {
    await authFetch(`/api/friendly/${friendlyId}/confirm`, { method: "POST" });
    load();
    toast.success("Match confirmé");
  }

  async function cancelMatch(friendlyId: string) {
    await authFetch(`/api/friendly/${friendlyId}/cancel`, { method: "POST" });
    load();
    toast.success("Match annulé");
  }

  if (!isCoach) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2"><Users className="h-4 w-4" />Matchs amicaux</div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger><Button size="sm"><Plus className="mr-1 h-4 w-4" />Proposer un match</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Proposer un match amical</DialogTitle></DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>Club adverse</Label><Input value={opponent} onChange={(e)=>setOpponent(e.target.value)}/></div>
                <div className="space-y-1"><Label>Contact adverse</Label><Input value={opponentContact} onChange={(e)=>setOpponentContact(e.target.value)}/></div>
                <div className="space-y-1"><Label>Catégorie</Label><Input value={category} onChange={(e)=>setCategory(e.target.value)}/></div>
                <div className="space-y-1"><Label>Niveau souhaité</Label><Input value={level} onChange={(e)=>setLevel(e.target.value)}/></div>
                <div className="space-y-1"><Label>Date</Label><Input type="date" value={matchDate} onChange={(e)=>setMatchDate(e.target.value)}/></div>
                <div className="space-y-1"><Label>Heure</Label><Input type="time" value={matchTime} onChange={(e)=>setMatchTime(e.target.value)}/></div>
                <div className="space-y-1 sm:col-span-2"><Label>Lieu</Label>
                  <select className="w-full rounded-md border px-3 py-2 text-sm" value={locationType} onChange={(e)=>setLocationType(e.target.value as any)}>
                    <option value="home">Domicile (adresse de notre terrain/club)</option>
                    <option value="away">Extérieur (chez l'adversaire)</option>
                    <option value="neutral">Neutre</option>
                  </select>
                </div>
                {locationType!=="home" && <div className="space-y-1 sm:col-span-2"><Label>Adresse du lieu</Label><Input value={venueAddress} onChange={(e)=>setVenueAddress(e.target.value)}/></div>}
                <div className="space-y-1 sm:col-span-2"><Label>Notes</Label><Textarea value={notes} onChange={(e)=>setNotes(e.target.value)}/></div>
              </div>
              <div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setOpen(false)}>Annuler</Button><Button onClick={createMatch} disabled={saving||!opponent||!matchDate}>Proposer</Button></div>
            </DialogContent>
          </Dialog>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2"><p className="text-xs font-semibold text-muted-foreground uppercase">Coachs utilisant l'application</p>
          <div className="grid gap-2 sm:grid-cols-2">{coaches.map((c,i)=>(<div key={`${c.coach_id}-${c.team_id}-${i}`} className="rounded-lg border p-2 text-xs"><p className="font-medium">{c.last_name} {c.first_name}</p><p className="text-muted-foreground">{c.club_name||"—"}</p><p className="text-muted-foreground">Équipe : {c.team_name}</p>{c.category&&<p className="text-muted-foreground">Catégorie : {c.category}</p>}</div>))}{coaches.length===0&&<p className="text-xs text-muted-foreground">Aucun autre coach trouvé</p>}</div>
        </div>
      </CardContent>
    </Card>
  );
}
