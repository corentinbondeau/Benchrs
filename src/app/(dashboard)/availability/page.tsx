"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTeam } from "@/lib/team";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Calendar, Plus, Trash2 } from "lucide-react";

type Availability = {
  id: string;
  team_id: string;
  player_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  profile?: { first_name: string; last_name: string } | null;
};

export default function AvailabilityPage() {
  const { currentTeam, userRole } = useTeam();
  const { user } = useAuth();
  const [items, setItems] = useState<Availability[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const isCoach = userRole === "coach" || userRole === "owner";
  const myPlayerId = user?.id;

  async function load() {
    if (!currentTeam) return;
    setLoading(true);
    let query = supabase
      .from("player_availability")
      .select("id, team_id, player_id, start_date, end_date, reason")
      .eq("team_id", currentTeam.id)
      .order("start_date", { ascending: true });
    
    if (!isCoach && myPlayerId) {
      query = query.eq("player_id", myPlayerId);
    }
    
    const { data } = await query;
    setItems((data as Availability[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTeam?.id, userRole]);

  async function addAvailability() {
    if (!currentTeam || !myPlayerId || !startDate || !endDate) {
      toast.error("Veuillez remplir les dates");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("player_availability").insert({
      team_id: currentTeam.id,
      player_id: myPlayerId,
      start_date: startDate,
      end_date: endDate,
      reason: reason || null,
      created_by: myPlayerId,
    });
    setSaving(false);
    if (error) {
      toast.error("Erreur lors de l'ajout");
      return;
    }
    toast.success("Indisponibilité ajoutée");
    setShowForm(false);
    setStartDate("");
    setEndDate("");
    setReason("");
    load();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("player_availability").delete().eq("id", id);
    if (error) {
      toast.error("Erreur");
      return;
    }
    toast.success("Supprimé");
    load();
  }

  return (
    <div className="section-gap">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Indisponibilités</h1>
          <p className="text-sm text-muted-foreground">Gérez vos périodes d'indisponibilité</p>
        </div>
        {!isCoach && (
          <Button onClick={() => setShowForm(!showForm)} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Ajouter
          </Button>
        )}
      </div>

      {showForm && !isCoach && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nouvelle indisponibilité</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Du</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Au</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Raison (facultatif)</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Blessure, vacances..." />
            </div>
            <div className="flex gap-2">
              <Button onClick={addAvailability} disabled={saving} size="sm">
                {saving ? "Enregistrement..." : "Enregistrer"}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)} size="sm">Annuler</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Chargement...</div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
              Aucune indisponibilité
            </div>
          ) : (
            <div className="divide-y">
              {items.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm font-medium">
                      Du {new Date(item.start_date).toLocaleDateString("fr-FR")} au {new Date(item.end_date).toLocaleDateString("fr-FR")}
                    </p>
                    {item.reason && <p className="text-xs text-muted-foreground">{item.reason}</p>}
                  </div>
                  {!isCoach && item.player_id === myPlayerId && (
                    <Button variant="ghost" size="sm" onClick={() => remove(item.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
