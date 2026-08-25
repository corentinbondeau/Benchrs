"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MapPin, Plus, X } from "lucide-react";
import { toast } from "sonner";

export interface TeamLocation {
  id: string;
  team_id: string;
  name: string;
  address: string;
  created_by: string | null;
  created_at: string;
}

export function LocationPicker({
  teamId,
  value,
  onChange,
  isCoach,
}: {
  teamId: string;
  value: string;
  onChange: (v: string) => void;
  isCoach?: boolean;
}) {
  const [locations, setLocations] = useState<TeamLocation[]>([]);
  const [saving, setSaving] = useState(false);

  const loadLocations = useCallback(async () => {
    if (!teamId) return null;
    const supabase = createClient();
    const { data } = await supabase
      .from("team_locations")
      .select("id, team_id, name, address, created_by, created_at")
      .eq("team_id", teamId)
      .order("name", { ascending: true });
    return (data || []) as TeamLocation[];
  }, [teamId]);

  useEffect(() => {
    if (!teamId) return;
    loadLocations().then((rows) => {
      if (rows) setLocations(rows);
    });
  }, [teamId, loadLocations]);

  async function saveLocation() {
    const address = value.trim();
    if (!address) return;
    setSaving(true);
    const supabase = createClient();
    const name = address.length > 60 ? `${address.slice(0, 57)}…` : address;
    const { error } = await supabase
      .from("team_locations")
      .upsert(
        { team_id: teamId, name, address },
        { onConflict: "team_id,name" }
      );
    setSaving(false);
    if (error) {
      toast.error("Impossible d'enregistrer le lieu");
      return;
    }
    toast.success("Lieu enregistré — réutilisable sur les prochains événements");
    loadLocations().then((rows) => {
      if (rows) setLocations(rows);
    });
  }

  async function deleteLocation(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("team_locations").delete().eq("id", id);
    if (error) {
      toast.error("Impossible de supprimer le lieu");
      return;
    }
    toast.success("Lieu supprimé");
    setLocations((prev) => prev.filter((l) => l.id !== id));
  }

  const trimmed = value.trim();
  const alreadySaved = locations.some((l) => l.address.trim().toLowerCase() === trimmed.toLowerCase());

  return (
    <div className="space-y-2">
      <Label>Lieu</Label>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Stade, terrain, adresse..."
            className="pl-8"
            list={`team-locations-${teamId}`}
          />
          <datalist id={`team-locations-${teamId}`}>
            {locations.map((l) => (
              <option key={l.id} value={l.address}>
                {l.name}
              </option>
            ))}
          </datalist>
        </div>
        {isCoach && trimmed && !alreadySaved && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={saveLocation}
            disabled={saving}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Enregistrer
          </Button>
        )}
      </div>

      {locations.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {locations.map((l) => (
            <span
              key={l.id}
              className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-xs"
            >
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => onChange(l.address)}
                title={l.address}
              >
                {l.name}
              </button>
              {isCoach && (
                <button
                  type="button"
                  className="text-muted-foreground/60 hover:text-red-600"
                  onClick={() => deleteLocation(l.id)}
                  title="Supprimer"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
