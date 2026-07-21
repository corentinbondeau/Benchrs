"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Heart, Plus, AlertTriangle } from "lucide-react";
import type { Injury, Profile } from "@/types";

interface InjuryWithPlayer extends Injury {
  player?: Profile;
}

export default function MedicalPage() {
  const { user } = useAuth();
  const [injuries, setInjuries] = useState<InjuryWithPlayer[]>([]);
  const [players, setPlayers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ playerId: "", description: "", injuryType: "", injuryDate: "", expectedReturn: "" });

  const isCoach = user?.profile?.role === "coach";

  function fetchData() {
    const supabase = createClient();
    Promise.all([
      supabase.from("injuries").select("*, player:profiles!injuries_player_id_fkey(first_name, last_name)").order("created_at", { ascending: false }),
      supabase.from("profiles").select("*").eq("role", "player").eq("is_active", true).order("last_name"),
    ]).then(([injuriesRes, playersRes]) => {
      setInjuries((injuriesRes.data as InjuryWithPlayer[]) || []);
      setPlayers((playersRes.data as Profile[]) || []);
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
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Infirmerie</h2>
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  const activeInjuries = injuries.filter((i) => i.status === "active");
  const recoveredInjuries = injuries.filter((i) => i.status === "recovered");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Infirmerie</h2>
          <p className="text-muted-foreground mt-1">Suivi des blessures</p>
        </div>
        {isCoach && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger render={<Button className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold" />}>
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
                  <Select value={form.playerId} onValueChange={(v) => v && setForm({ ...form, playerId: v })}>
                    <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                    <SelectContent>
                      {players.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.first_name} {p.last_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                <Button type="submit" className="w-full bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold">Signaler</Button>
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
            <p className="text-sm text-muted-foreground text-center py-4">Aucune blessure active</p>
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
