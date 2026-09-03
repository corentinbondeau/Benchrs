"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { useSelectedChild } from "@/lib/useSelectedChild";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Heart, Plus, AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { Injury, Profile } from "@/types";

interface InjuryWithPlayer extends Injury {
  player?: Profile;
}

export default function MedicalPage() {
  const { user } = useAuth();
  const { currentTeam, userRole } = useTeam();
  const [injuries, setInjuries] = useState<InjuryWithPlayer[]>([]);
  const [players, setPlayers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ playerId: "", description: "", injuryType: "", injuryDate: "", expectedReturn: "" });

  const isCoach = userRole === "coach" || userRole === "owner";
  const isParent = userRole === "parent";
  const { children, selectedChildId } = useSelectedChild(currentTeam?.id);
  const canReport = isCoach || isParent;

  if (!currentTeam) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Chargement de l&apos;équipe...</p></div>;
  }

  function fetchData() {
    const supabase = createClient();
    Promise.all([
      supabase.from("injuries").select("*, player:profiles!injuries_player_id_fkey(first_name, last_name)").eq("team_id", currentTeam!.id).order("created_at", { ascending: false }),
      supabase.from("team_members").select("user_id, profiles!inner(id, first_name, last_name, shirt_number, is_active)").eq("team_id", currentTeam!.id).eq("role", "player"),
    ]).then(([injuriesRes, membersRes]) => {
      setInjuries((injuriesRes.data as InjuryWithPlayer[]) || []);
      const teamPlayers = ((membersRes.data || []) as unknown as { profiles: Profile }[])
        .map((m) => m.profiles)
        .filter((p) => p && p.is_active)
        .sort((a, b) => (a.last_name || "").localeCompare(b.last_name || ""));
      setPlayers(teamPlayers);
      setLoading(false);
    });
  }

  useEffect(() => { fetchData(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    await supabase.from("injuries").insert({
      player_id: form.playerId,
      description: form.description,
      injury_type: form.injuryType || null,
      injury_date: form.injuryDate,
      expected_return: form.expectedReturn || null,
      status: "active",
      reported_by: user?.id,
      team_id: currentTeam!.id,
    });
    setAddOpen(false);
    setForm({ playerId: "", description: "", injuryType: "", injuryDate: "", expectedReturn: "" });
    fetchData();
  }

  async function markRecovered(id: string) {
    const supabase = createClient();
    await supabase.from("injuries").update({ status: "recovered" }).eq("id", id);
    fetchData();
  }

  if (loading) {
    return (
      <div className="section-gap">
        <h1 className="text-2xl font-bold">Infirmerie</h1>
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  const activeInjuries = injuries.filter((i) => i.status === "active");
  const recoveredInjuries = injuries.filter((i) => i.status === "recovered");

  return (
    <div className="section-gap">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Infirmerie</h1>
          <p className="text-sm text-muted-foreground mt-1">Suivi des blessures</p>
        </div>
        {canReport && (
          <Dialog open={addOpen} onOpenChange={(open) => {
            setAddOpen(open);
            // Pré-sélectionner l'enfant si c'est un parent
            if (open && isParent && selectedChildId) {
              setForm((f) => ({ ...f, playerId: f.playerId || selectedChildId }));
            }
          }}>
            <DialogTrigger render={<Button className="bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold" />}>
              <Plus className="h-4 w-4 mr-1" />
              Signaler
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Signaler une blessure</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAdd} className="space-y-4">
                <div className="space-y-2">
                  <Label>Joueur *</Label>
                  {isParent && children.length === 1 ? (
                    <p className="text-sm font-medium py-2">{children[0].first_name} {children[0].last_name}</p>
                  ) : (
                    <select
                      value={form.playerId}
                      onChange={(e) => setForm({ ...form, playerId: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      required
                    >
                      <option value="">Sélectionner un joueur</option>
                      {(isParent ? children.map((c) => ({ id: c.id, first_name: c.first_name, last_name: c.last_name })) : players).map((p) => (
                        <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Description *</Label>
                  <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Input value={form.injuryType} onChange={(e) => setForm({ ...form, injuryType: e.target.value })} placeholder="Ex: Entaille, claquage..." />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date *</Label>
                    <Input type="date" value={form.injuryDate} onChange={(e) => setForm({ ...form, injuryDate: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Retour prévu</Label>
                    <Input type="date" value={form.expectedReturn} onChange={(e) => setForm({ ...form, expectedReturn: e.target.value })} />
                  </div>
                </div>
                <Button type="submit" className="w-full bg-[var(--color-primary-blue)] text-white font-semibold">Signaler</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Active Injuries */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            Blessures actives ({activeInjuries.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeInjuries.length === 0 ? (
            <EmptyState
              icon={Heart}
              title="Aucune blessure active"
              description="Tous les joueurs sont en pleine forme."
            />
          ) : (
            <div className="space-y-3">
              {activeInjuries.map((injury) => (
                <div key={injury.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{injury.player?.first_name} {injury.player?.last_name}</p>
                      <p className="text-xs text-muted-foreground mt-1">{injury.description}</p>
                      {injury.injury_type && <Badge variant="secondary" className="mt-1">{injury.injury_type}</Badge>}
                    </div>
                    {isCoach && (
                      <Button size="sm" variant="outline" onClick={() => markRecovered(injury.id)}>
                        Récupéré
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recovered */}
      {recoveredInjuries.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Heart className="h-4 w-4 text-green-500" />
              Récupérés ({recoveredInjuries.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recoveredInjuries.slice(0, 5).map((injury) => (
                <div key={injury.id} className="rounded-lg border p-2 opacity-60">
                  <p className="text-sm">{injury.player?.first_name} {injury.player?.last_name} - {injury.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
