"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, UserPlus } from "lucide-react";
import type { Profile } from "@/types";

const positionLabels: Record<string, string> = {
  goalkeeper: "Gardien",
  defender: "Defenseur",
  midfielder: "Milieu",
  forward: "Attaquant",
};

export default function RosterPage() {
  const { user } = useAuth();
  const [players, setPlayers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    position: "",
    shirtNumber: "",
  });

  const isCoach = user?.profile?.role === "coach";

  function fetchPlayers() {
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("*")
      .eq("role", "player")
      .eq("is_active", true)
      .order("last_name", { ascending: true })
      .then(({ data }) => {
        setPlayers((data as Profile[]) || []);
        setLoading(false);
      });
  }

  useEffect(() => {
    fetchPlayers();
  }, []);

  async function handleAddPlayer(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        password: form.password,
        role: "player",
      }),
    });

    if (res.ok) {
      // Update profile with extra fields
      const data = await res.json();
      const supabase = createClient();
      await supabase
        .from("profiles")
        .update({
          position: form.position || null,
          shirt_number: form.shirtNumber ? parseInt(form.shirtNumber) : null,
        })
        .eq("id", data.user.id);

      setAddOpen(false);
      setForm({ firstName: "", lastName: "", email: "", password: "", position: "", shirtNumber: "" });
      fetchPlayers();
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Effectif</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Effectif</h2>
          <p className="text-muted-foreground mt-1">
            {players.length} joueur{players.length > 1 ? "s" : ""} actif{players.length > 1 ? "s" : ""}
          </p>
        </div>
        {isCoach && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger render={<Button className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold" />}>
              <Plus className="h-4 w-4 mr-1" />
              Ajouter
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ajouter un joueur</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddPlayer} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Prenom *</Label>
                    <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Nom *</Label>
                    <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Mot de passe *</Label>
                  <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Poste</Label>
                    <Select value={form.position} onValueChange={(v) => v && setForm({ ...form, position: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choisir" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="goalkeeper">Gardien</SelectItem>
                        <SelectItem value="defender">Defenseur</SelectItem>
                        <SelectItem value="midfielder">Milieu</SelectItem>
                        <SelectItem value="forward">Attaquant</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Numéro</Label>
                    <Input type="number" min="1" max="99" value={form.shirtNumber} onChange={(e) => setForm({ ...form, shirtNumber: e.target.value })} />
                  </div>
                </div>
                <Button type="submit" className="w-full bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold">
                  Creer le compte
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {players.map((player) => (
          <Card key={player.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-royal)]/10 text-[var(--color-royal)] text-lg font-bold">
                  {player.shirt_number || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">
                    {player.first_name} {player.last_name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {positionLabels[player.position || ""] || "Joueur"}
                  </p>
                </div>
                {player.position && (
                  <Badge variant="secondary" className="shrink-0">
                    {positionLabels[player.position] || player.position}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {players.length === 0 && (
          <div className="col-span-full">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <UserPlus className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="font-semibold text-lg">Aucun joueur</h3>
              <p className="text-muted-foreground text-sm mt-1">
                {isCoach ? "Ajoutez des joueurs pour commencer." : "Aucun joueur dans l'equipe."}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
