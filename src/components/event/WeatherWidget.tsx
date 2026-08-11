"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CloudSun, CloudRain, Cloud, Sun, Wind, MapPin, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

const WEATHER_CODES: Record<number, { label: string; icon: typeof Sun }> = {
  0: { label: "Ciel dégagé", icon: Sun },
  1: { label: "Peu nuageux", icon: Sun },
  2: { label: "Partiellement nuageux", icon: CloudSun },
  3: { label: "Couvert", icon: Cloud },
  45: { label: "Brouillard", icon: Cloud },
  48: { label: "Brouillard givrant", icon: Cloud },
  51: { label: "Bruine légère", icon: CloudRain },
  53: { label: "Bruine", icon: CloudRain },
  55: { label: "Bruine dense", icon: CloudRain },
  61: { label: "Pluie faible", icon: CloudRain },
  63: { label: "Pluie", icon: CloudRain },
  65: { label: "Pluie forte", icon: CloudRain },
  66: { label: "Pluie verglaçante", icon: CloudRain },
  67: { label: "Pluie verglaçante forte", icon: CloudRain },
  71: { label: "Neige faible", icon: CloudRain },
  73: { label: "Neige", icon: CloudRain },
  75: { label: "Neige forte", icon: CloudRain },
  80: { label: "Averses faibles", icon: CloudRain },
  81: { label: "Averses", icon: CloudRain },
  82: { label: "Averses violentes", icon: CloudRain },
  95: { label: "Orage", icon: CloudRain },
};

interface WeatherData {
  temp: number;
  wind: number;
  precipitationProb: number;
  code: number;
}

export function WeatherWidget({
  eventId,
  latitude,
  longitude,
  location,
  isCoach,
}: {
  eventId: string;
  latitude: number | null;
  longitude: number | null;
  location: string | null;
  isCoach: boolean;
}) {
  const [edited, setEdited] = useState<{ lat: number | null; lng: number | null }>({
    lat: null,
    lng: null,
  });
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [editing, setEditing] = useState(false);

  const lat = edited.lat ?? latitude;
  const lng = edited.lng ?? longitude;

  useEffect(() => {
    if (lat == null || lng == null) return;
    let mounted = true;
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,wind_speed_10m&daily=precipitation_probability_max&timezone=auto`
    )
      .then((r) => r.json())
      .then((data) => {
        if (!mounted) return;
        setWeather({
          temp: Math.round(data?.current?.temperature_2m ?? 0),
          wind: Math.round(data?.current?.wind_speed_10m ?? 0),
          precipitationProb: Math.round(data?.daily?.precipitation_probability_max?.[0] ?? 0),
          code: data?.current?.weather_code ?? 0,
        });
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [lat, lng]);

  async function geocode() {
    if (!location?.trim()) {
      toast.error("L'événement n'a pas de lieu renseigné");
      return;
    }
    setGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`
      );
      const rows = await res.json();
      if (!rows?.length) {
        toast.error("Lieu introuvable, saisis les coordonnées manuellement");
        return;
      }
      const foundLat = parseFloat(rows[0].lat);
      const foundLng = parseFloat(rows[0].lon);
      setEdited({ lat: foundLat, lng: foundLng });
      await saveCoords(foundLat, foundLng);
      setEditing(false);
    } catch {
      toast.error("Impossible de localiser le lieu");
    } finally {
      setGeocoding(false);
    }
  }

  async function saveCoords(newLat: number, newLng: number) {
    const supabase = createClient();
    const { error } = await supabase
      .from("events")
      .update({ latitude: newLat, longitude: newLng })
      .eq("id", eventId);
    if (error) toast.error("Erreur lors de l'enregistrement des coordonnées");
  }

  if (editing || lat == null || lng == null) {
    if (!isCoach) return null;
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <CloudSun className="h-4 w-4 text-[var(--color-gold)]" />
            <p className="text-sm font-medium">Météo du jour J</p>
          </div>
          {lat != null && lng != null && !editing ? (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditing(true)}>
              <MapPin className="h-3 w-3 mr-1" />
              Configurer les coordonnées du terrain
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  step="any"
                  placeholder="Latitude"
                  value={edited.lat ?? latitude ?? ""}
                  onChange={(e) => setEdited((p) => ({ ...p, lat: parseFloat(e.target.value) || null }))}
                  className="text-sm h-8"
                />
                <Input
                  type="number"
                  step="any"
                  placeholder="Longitude"
                  value={edited.lng ?? longitude ?? ""}
                  onChange={(e) => setEdited((p) => ({ ...p, lng: parseFloat(e.target.value) || null }))}
                  className="text-sm h-8"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-7 text-xs flex-1"
                  disabled={lat == null || lng == null}
                  onClick={async () => {
                    await saveCoords(lat!, lng!);
                    setEditing(false);
                  }}
                >
                  Enregistrer
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={geocode} disabled={geocoding}>
                  {geocoding ? <Loader2 className="h-3 w-3 animate-spin" /> : <MapPin className="h-3 w-3" />}
                  Localiser le lieu
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const meta = WEATHER_CODES[weather?.code ?? 0] ?? { label: "—", icon: CloudSun };
  const MetaIcon = meta.icon;
  const terrainGras = (weather?.precipitationProb ?? 0) >= 50 || weather?.code === 95 || weather?.code === 65;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MetaIcon className="h-5 w-5 text-[var(--color-gold)]" />
            <div>
              <p className="text-sm font-medium">{meta.label}</p>
              <p className="text-xs text-muted-foreground">
                {weather ? `${weather.temp}°C · Risque de pluie ${weather.precipitationProb}%` : "Météo du jour J"}
              </p>
            </div>
          </div>
          <div className="text-right">
            {weather && (
              <>
                <p className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                  <Wind className="h-3 w-3" /> {weather.wind} km/h
                </p>
                <p
                  className={`text-xs font-semibold mt-1 ${
                    terrainGras ? "text-amber-600" : "text-green-600"
                  }`}
                >
                  {terrainGras ? "Terrain gras" : "Terrain sec"}
                </p>
              </>
            )}
          </div>
          {isCoach && (
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditing(true)}>
              Modifier
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
