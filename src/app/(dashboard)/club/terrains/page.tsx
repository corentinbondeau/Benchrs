"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building2,
  CalendarRange,
  Loader2,
  MapPin,
  Plus,
  Trash2,
} from "lucide-react";

const WEEKDAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

interface Pitch {
  id: string;
  club_id: string;
  name: string;
  location: string | null;
}

interface Booking {
  id: string;
  pitch_id: string;
  club_id: string;
  team_id: string | null;
  weekday: number;
  start_time: string;
  end_time: string;
  label: string | null;
}

interface TeamRow {
  id: string;
  name: string;
  color_primary: string | null;
}

interface ClubData {
  id: string;
  name: string;
  canManage: boolean;
  teams: TeamRow[];
  pitches: Pitch[];
  bookings: Booking[];
}

function fmtTime(t: string) {
  return t.slice(0, 5);
}

export default function ClubPitchesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [clubs, setClubs] = useState<ClubData[]>([]);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [pitchOpen, setPitchOpen] = useState(false);
  const [pitchName, setPitchName] = useState("");
  const [pitchLocation, setPitchLocation] = useState("");

  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingPitch, setBookingPitch] = useState("");
  const [bookingWeekday, setBookingWeekday] = useState("1");
  const [bookingStart, setBookingStart] = useState("18:00");
  const [bookingEnd, setBookingEnd] = useState("20:00");
  const [bookingTeam, setBookingTeam] = useState("none");
  const [bookingLabel, setBookingLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const loadClubs = useCallback(async (userId: string) => {
    const supabase = createClient();
    const [membersRes, createdRes] = await Promise.all([
      supabase
        .from("club_members")
        .select("club_id, role")
        .eq("user_id", userId),
      supabase.from("clubs").select("id, name").eq("created_by", userId),
    ]);
    const members = (membersRes.data || []) as { club_id: string; role: string }[];
    const created = (createdRes.data || []) as { id: string; name: string }[];
    const seen = new Set<string>();
    const clubs: { id: string; name: string; canManage: boolean }[] = [];
    for (const m of members) {
      if (!seen.has(m.club_id)) {
        seen.add(m.club_id);
        clubs.push({ id: m.club_id, name: "", canManage: true });
      }
    }
    for (const c of created) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        clubs.push({ id: c.id, name: c.name, canManage: true });
      }
    }
    if (clubs.length === 0) return [] as ClubData[];

    const ids = clubs.map((c) => c.id);
    const [clubRes, teamsRes, pitchesRes, bookingsRes] = await Promise.all([
      supabase.from("clubs").select("id, name").in("id", ids),
      supabase.from("teams").select("id, name, color_primary").in("club_id", ids),
      supabase.from("pitches").select("*").in("club_id", ids).order("name"),
      supabase.from("pitch_bookings").select("*").in("club_id", ids),
    ]);

    const nameMap = new Map((clubRes.data || []).map((c) => [c.id, c.name as string]));
    const teamsByClub = new Map<string, TeamRow[]>();
    for (const t of (teamsRes.data || []) as unknown as (TeamRow & { club_id: string })[]) {
      if (!teamsByClub.has(t.club_id)) teamsByClub.set(t.club_id, []);
      teamsByClub.get(t.club_id)!.push({ id: t.id, name: t.name, color_primary: t.color_primary });
    }
    const pitchesByClub = new Map<string, Pitch[]>();
    for (const p of (pitchesRes.data || []) as Pitch[]) {
      if (!pitchesByClub.has(p.club_id)) pitchesByClub.set(p.club_id, []);
      pitchesByClub.get(p.club_id)!.push(p);
    }
    const bookingsByClub = new Map<string, Booking[]>();
    for (const b of (bookingsRes.data || []) as Booking[]) {
      if (!bookingsByClub.has(b.club_id)) bookingsByClub.set(b.club_id, []);
      bookingsByClub.get(b.club_id)!.push(b);
    }

    return clubs.map((c) => ({
      id: c.id,
      name: c.name || nameMap.get(c.id) || "Club",
      canManage: c.canManage,
      teams: teamsByClub.get(c.id) || [],
      pitches: pitchesByClub.get(c.id) || [],
      bookings: (bookingsByClub.get(c.id) || []).sort((a, b) =>
        a.start_time.localeCompare(b.start_time)
      ),
    }));
  }, []);

  useEffect(() => {
    if (!user) return;
    loadClubs(user.id).then((data) => {
      setClubs(data);
      if (data.length > 0 && !selectedClubId) setSelectedClubId(data[0].id);
      setLoading(false);
    });
  }, [user, loadClubs, selectedClubId]);

  const club = clubs.find((c) => c.id === selectedClubId) || null;
  const teamName = new Map(club?.teams.map((t) => [t.id, t.name]));

  function bookingLabelOf(b: Booking) {
    if (b.label) return b.label;
    if (b.team_id) return teamName.get(b.team_id) || "";
    return "Créneau libre";
  }

  async function addPitch() {
    if (!club || !pitchName.trim()) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("pitches").insert({
        club_id: club.id,
        name: pitchName.trim(),
        location: pitchLocation.trim() || null,
        created_by: user?.id,
      });
      if (error) throw error;
      toast.success("Terrain ajouté");
      setPitchName("");
      setPitchLocation("");
      setPitchOpen(false);
      await refreshClub();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function deletePitch(pitchId: string) {
    if (!club) return;
    const supabase = createClient();
    const { error } = await supabase.from("pitches").delete().eq("id", pitchId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Terrain supprimé");
    await refreshClub();
  }

  async function addBooking() {
    if (!club || !bookingPitch) return;
    if (!bookingStart || !bookingEnd || bookingStart >= bookingEnd) {
      toast.error("Horaires invalides");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("pitch_bookings").insert({
        pitch_id: bookingPitch,
        club_id: club.id,
        team_id: bookingTeam === "none" ? null : bookingTeam,
        weekday: Number(bookingWeekday),
        start_time: bookingStart,
        end_time: bookingEnd,
        label: bookingTeam === "none" && bookingLabel.trim() ? bookingLabel.trim() : bookingTeam === "none" ? null : null,
        created_by: user?.id,
      });
      if (error) throw error;
      toast.success("Créneau ajouté");
      setBookingOpen(false);
      setBookingTeam("none");
      setBookingLabel("");
      await refreshClub();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function deleteBooking(bookingId: string) {
    const supabase = createClient();
    const { error } = await supabase.from("pitch_bookings").delete().eq("id", bookingId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Créneau supprimé");
    await refreshClub();
  }

  const refreshClub = useCallback(async () => {
    if (!user) return;
    const data = await loadClubs(user.id);
    setClubs(data);
  }, [user, loadClubs]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">Chargement...</CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4 md:space-y-6 pb-20 md:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <CalendarRange className="h-6 w-6" />
            Terrains & créneaux
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Répartition des terrains entre les équipes du club
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/club")}>
          Retour à l&apos;espace club
        </Button>
      </div>

      {clubs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Vous n&apos;êtes rattaché à aucun club pour le moment.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {clubs.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedClubId(c.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  c.id === selectedClubId
                    ? "border-foreground bg-foreground text-background"
                    : "bg-background text-muted-foreground hover:border-foreground/25"
                }`}
              >
                <Building2 className="h-3.5 w-3.5" />
                {c.name}
              </button>
            ))}
          </div>

          {club && (
            <>
              {club.canManage && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setPitchOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Ajouter un terrain
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (club.pitches.length === 0) {
                        toast.error("Ajoutez d'abord un terrain");
                        return;
                      }
                      setBookingPitch(club.pitches[0].id);
                      setBookingOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Ajouter un créneau
                  </Button>
                </div>
              )}

              {club.pitches.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    Aucun terrain enregistré pour {club.name}.
                  </CardContent>
                </Card>
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-[900px]">
                    <div className="grid grid-cols-[150px_repeat(7,minmax(0,1fr))] gap-px bg-border rounded-lg overflow-hidden border border-border">
                      <div className="bg-muted p-2.5 text-xs font-semibold text-muted-foreground">
                        Terrain / Jour
                      </div>
                      {WEEKDAYS.map((day) => (
                        <div key={day} className="bg-muted p-2.5 text-center text-xs font-semibold">
                          {day}
                        </div>
                      ))}

                      {club.pitches.map((pitch) => (
                        <Fragment key={pitch.id}>
                          <div
                            className="bg-card p-2.5 space-y-1"
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold leading-tight break-words">
                                {pitch.name}
                              </span>
                              {club.canManage && (
                                <button
                                  type="button"
                                  onClick={() => deletePitch(pitch.id)}
                                  className="text-muted-foreground hover:text-red-500"
                                  title="Supprimer le terrain"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                            {pitch.location && (
                              <p className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                                <MapPin className="h-3 w-3 shrink-0" />
                                <span className="truncate">{pitch.location}</span>
                              </p>
                            )}
                          </div>
                          {WEEKDAYS.map((day, idx) => {
                            const dayBookings = club.bookings.filter(
                              (b) => b.pitch_id === pitch.id && b.weekday === idx
                            );
                            return (
                              <div key={`${pitch.id}-${idx}`} className="bg-card p-1.5 space-y-1 min-h-[72px]">                                {dayBookings.map((b) => {
                                  const team = club.teams.find((t) => t.id === b.team_id);
                                  return (
                                    <div
                                      key={b.id}
                                      className="group rounded-md border px-1.5 py-1 text-[11px] leading-tight"
                                      style={
                                        team
                                          ? { borderColor: (team.color_primary || "#EAB308") + "55" }
                                          : undefined
                                      }
                                    >
                                      <div className="font-semibold tabular-nums">
                                        {fmtTime(b.start_time)}–{fmtTime(b.end_time)}
                                      </div>
                                      <div className="flex items-center gap-1">
                                        {team && (
                                          <span
                                            className="h-1.5 w-1.5 rounded-full shrink-0"
                                            style={{ backgroundColor: team.color_primary || "#EAB308" }}
                                          />
                                        )}
                                        <span className="truncate">{bookingLabelOf(b)}</span>
                                        {club.canManage && (
                                          <button
                                            type="button"
                                            onClick={() => deleteBooking(b.id)}
                                            className="ml-auto text-muted-foreground opacity-60 hover:opacity-100 hover:text-red-500"
                                            title="Supprimer le créneau"
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </Fragment>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {!club.canManage && (
                <Badge variant="secondary" className="text-[10px]">
                  Lecture seule
                </Badge>
              )}
            </>
          )}
        </>
      )}

      <Dialog open={pitchOpen} onOpenChange={setPitchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter un terrain</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nom du terrain</Label>
              <Input
                value={pitchName}
                onChange={(e) => setPitchName(e.target.value)}
                placeholder="Stade municipal"
              />
            </div>
            <div className="space-y-1">
              <Label>Lieu (optionnel)</Label>
              <Input
                value={pitchLocation}
                onChange={(e) => setPitchLocation(e.target.value)}
                placeholder="12 rue du Sport"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={addPitch} disabled={!pitchName.trim() || saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bookingOpen} onOpenChange={setBookingOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter un créneau</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Terrain</Label>
              <Select value={bookingPitch} onValueChange={(v) => v && setBookingPitch(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choisir un terrain" />
                </SelectTrigger>
                <SelectContent>
                  {club?.pitches.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Jour</Label>
                <Select value={bookingWeekday} onValueChange={(v) => v && setBookingWeekday(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((d, i) => (
                      <SelectItem key={d} value={String(i)}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Équipe</Label>
                <Select value={bookingTeam} onValueChange={(v) => v && setBookingTeam(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucune (libre)</SelectItem>
                    {club?.teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Début</Label>
                <Input
                  type="time"
                  value={bookingStart}
                  onChange={(e) => setBookingStart(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Fin</Label>
                <Input
                  type="time"
                  value={bookingEnd}
                  onChange={(e) => setBookingEnd(e.target.value)}
                />
              </div>
            </div>
            {bookingTeam === "none" && (
              <div className="space-y-1">
                <Label>Libellé (optionnel)</Label>
                <Input
                  value={bookingLabel}
                  onChange={(e) => setBookingLabel(e.target.value)}
                  placeholder="Ex : réservé école de foot"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={addBooking} disabled={!bookingPitch || saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
