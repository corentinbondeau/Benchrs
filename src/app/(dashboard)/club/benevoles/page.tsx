"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useUserClubs } from "@/lib/useUserClubs";
import { ClubPageShell } from "@/components/club/ClubPageShell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  HandHeart,
  Plus,
  Users,
  CheckCircle2,
  X,
  Clock,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import type { Profile } from "@/types";

export const VOLUNTEER_CATEGORIES = [
  { value: "benevole", label: "Bénévole" },
  { value: "buvette", label: "Buvette" },
  { value: "accompagnement", label: "Accompagnement" },
  { value: "arbitrage", label: "Arbitrage" },
  { value: "autre", label: "Autre" },
] as const;

interface Slot {
  id: string;
  title: string;
  category: string;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  needed: number;
  status: "open" | "closed" | "cancelled";
  created_at: string;
}

interface SlotRow extends Slot {
  volunteers: Profile[];
}

export default function ClubBenevolesPage() {
  const { user } = useAuth();
  const { clubs, loading } = useUserClubs();
  const [requested, setRequested] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [pageLoading, setPageLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("buvette");
  const [needed, setNeeded] = useState(2);
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [location, setLocation] = useState("");

  const supabaseRef = useRef(createClient());
  const clubId =
    requested && clubs.some((c) => c.club_id === requested)
      ? requested
      : (clubs[0]?.club_id ?? null);
  const selectedClub = clubs.find((c) => c.club_id === clubId) ?? null;
  const isCommittee = selectedClub?.role != null;

  const load = useCallback(async (cid: string) => {
    const { data: slotsData } = await supabaseRef.current
      .from("club_volunteer_slots")
      .select("*")
      .eq("club_id", cid)
      .order("event_date", { ascending: true, nullsFirst: false });
    const slotsRows = (slotsData || []) as Record<string, unknown>[];

    let signups: { slot_id: string; user_id: string }[] = [];
    if (slotsRows.length > 0) {
      const { data: signupsData } = await supabaseRef.current
        .from("club_volunteer_signups")
        .select("slot_id, user_id")
        .in(
          "slot_id",
          slotsRows.map((s) => s.id)
        );
      signups = (signupsData || []) as { slot_id: string; user_id: string }[];
    }

    const userIds = [...new Set(signups.map((s) => s.user_id))];
    let profiles: Profile[] = [];
    if (userIds.length > 0) {
      const { data } = await supabaseRef.current
        .from("profiles")
        .select("id, first_name, last_name, role")
        .in("id", userIds);
      profiles = (data as Profile[]) || [];
    }
    const profById = new Map(profiles.map((p) => [p.id, p]));

    const rows: SlotRow[] = slotsRows.map((s) => ({
      id: s.id as string,
      title: s.title as string,
      category: s.category as string,
      event_date: (s.event_date as string | null) ?? null,
      start_time: (s.start_time as string | null) ?? null,
      end_time: (s.end_time as string | null) ?? null,
      location: (s.location as string | null) ?? null,
      needed: (s.needed as number) || 1,
      status: s.status as Slot["status"],
      created_at: s.created_at as string,
      volunteers: signups
        .filter((g) => g.slot_id === s.id)
        .map((g) => profById.get(g.user_id))
        .filter((p): p is Profile => Boolean(p)),
    }));

    return rows;
  }, []);

  useEffect(() => {
    if (!clubId) return;
    load(clubId).then((rows) => {
      setSlots(rows);
      setPageLoading(false);
    });
  }, [clubId, load]);

  function onChangeClub(id: string) {
    setRequested(id);
  }

  async function createSlot() {
    if (!clubId || !title.trim() || !dateStart) {
      toast.error("Titre et début requis");
      return;
    }
    const startIso = new Date(dateStart).toISOString();
    const endIso = dateEnd ? new Date(dateEnd).toISOString() : null;
    const { error } = await supabaseRef.current
      .from("club_volunteer_slots")
      .insert({
        club_id: clubId,
        title: title.trim(),
        category,
        event_date: startIso,
        start_time: startIso,
        end_time: endIso,
        location: location.trim() || null,
        needed: Math.max(1, Math.min(100, needed)),
        created_by: user!.id,
      });
    if (error) {
      toast.error(error.message);
      return;
    }
    setCreateOpen(false);
    setTitle("");
    setDateStart("");
    setDateEnd("");
    setLocation("");
    if (clubId) load(clubId).then(setSlots);
  }

  async function toggleSlotStatus(slot: Slot, status: "closed" | "cancelled" | "open") {
    if (!clubId) return;
    const { error } = await supabaseRef.current
      .from("club_volunteer_slots")
      .update({ status })
      .eq("id", slot.id)
      .eq("club_id", clubId);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (clubId) load(clubId).then(setSlots);
  }

  async function toggleSignup(slot: Slot) {
    if (!user || !clubId) return;
    const existing = await supabaseRef.current
      .from("club_volunteer_signups")
      .select("id")
      .eq("slot_id", slot.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing.data) {
      const { error } = await supabaseRef.current
        .from("club_volunteer_signups")
        .delete()
        .eq("id", existing.data.id);
      if (error) {
        toast.error(error.message);
        return;
      }
    } else {
      const { error } = await supabaseRef.current
        .from("club_volunteer_signups")
        .insert({ slot_id: slot.id, user_id: user.id });
      if (error) {
        toast.error(error.message);
        return;
      }
    }
    if (clubId) load(clubId).then(setSlots);
  }

  const catLabel = (c: string) =>
    VOLUNTEER_CATEGORIES.find((x) => x.value === c)?.label ?? c;

  return (
    <ClubPageShell
      title="Bénévoles & buvette"
      subtitle="Le club a besoin de vous sur les événements"
      clubs={clubs}
      clubId={clubId}
      onChangeClub={onChangeClub}
      loading={loading || (clubId ? pageLoading : false)}
      actions={
        isCommittee ? (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger render={<Button size="sm" />}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Ouvrir un besoin
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <HandHeart className="h-4 w-4 text-[var(--color-royal)]" />
                  Ouvrir un besoin de bénévoles
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 pt-1">
                <div className="space-y-1.5">
                  <Label htmlFor="slot-title">Intitulé</Label>
                  <Input
                    id="slot-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Buvette match U18 vs …"
                    maxLength={200}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <Select value={category} onValueChange={(v) => setCategory(v ?? "buvette")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VOLUNTEER_CATEGORIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="slot-needed">Bénévoles requis</Label>
                    <Input
                      id="slot-needed"
                      type="number"
                      min={1}
                      max={100}
                      value={needed}
                      onChange={(e) => setNeeded(Number(e.target.value))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="slot-start">Début</Label>
                    <Input
                      id="slot-start"
                      type="datetime-local"
                      value={dateStart}
                      onChange={(e) => setDateStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="slot-end">Fin (optionnel)</Label>
                    <Input
                      id="slot-end"
                      type="datetime-local"
                      value={dateEnd}
                      onChange={(e) => setDateEnd(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="slot-location">Lieu</Label>
                  <Input
                    id="slot-location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Complexe de Camphin…"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>
                    Annuler
                  </Button>
                  <Button onClick={createSlot} disabled={!title.trim() || !dateStart}>
                    Ouvrir
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        ) : undefined
      }
    >
      {slots.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Aucun besoin de bénévoles ouvert.
          </CardContent>
        </Card>
      )}
      <div className="space-y-4">
        {slots.map((slot) => {
          const mine = slot.volunteers.some((v) => v.id === user?.id);
          const full = slot.volunteers.length >= slot.needed;
          const past = slot.event_date != null && new Date(slot.event_date) < new Date();
          const closedSlot = slot.status !== "open" || past;
          return (
            <Card key={slot.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{slot.title}</CardTitle>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <Badge variant="secondary">{catLabel(slot.category)}</Badge>
                      {slot.event_date && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(slot.event_date).toLocaleDateString("fr-FR", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}
                          {slot.start_time &&
                            " " + new Date(slot.start_time).toLocaleTimeString("fr-FR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          {slot.end_time &&
                            "–" +
                              new Date(slot.end_time).toLocaleTimeString("fr-FR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                        </span>
                      )}
                      {slot.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {slot.location}
                        </span>
                      )}
                      <Badge
                        variant={
                          closedSlot ? "outline" : full ? "default" : "secondary"
                        }
                      >
                        {slot.volunteers.length}/{slot.needed}
                      </Badge>
                      {slot.status === "closed" && <Badge>Clôturé</Badge>}
                      {slot.status === "cancelled" && (
                        <Badge variant="destructive">Annulé</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {isCommittee ? (
                      <>
                        {slot.status === "open" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleSlotStatus(slot, "closed")}
                          >
                            Clore
                          </Button>
                        )}
                        {slot.status !== "open" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleSlotStatus(slot, "open")}
                          >
                            Rouvrir
                          </Button>
                        )}
                        {slot.status === "open" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => toggleSlotStatus(slot, "cancelled")}
                          >
                            Annuler
                          </Button>
                        )}
                      </>
                    ) : (
                      !closedSlot &&
                      !full && (
                        <Button
                          size="sm"
                          variant={mine ? "outline" : "default"}
                          onClick={() => toggleSignup(slot)}
                        >
                          {mine ? "Retirer ma candidature" : "Je me porte volontaire"}
                        </Button>
                      )
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {slot.volunteers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Aucun volontaire pour l&apos;instant.
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    {slot.volunteers.map((v) => (
                      <span
                        key={v.id}
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
                          v.id === user?.id
                            ? "border-[var(--color-royal)] bg-[var(--color-royal)]/5 font-medium"
                            : ""
                        }`}
                      >
                        {v.first_name} {v.last_name}
                        {v.id === user?.id &&
                          (slot.status === "open" && !full ? (
                            <button
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => toggleSignup(slot)}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          ) : (
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          ))}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </ClubPageShell>
  );
}