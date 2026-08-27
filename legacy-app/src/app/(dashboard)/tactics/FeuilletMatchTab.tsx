"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Crown } from "lucide-react";
import { toast } from "sonner";
import type { Profile, Event, Formation } from "@/types";
import { FORMATIONS } from "@/lib/lineup/formations";
import { autoCompose as autoComposePure } from "@/lib/lineup/autoCompose";

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function PitchSVG() {
  return (
    <svg viewBox="0 0 300 450" className="absolute inset-0 h-full w-full pointer-events-none" preserveAspectRatio="none">
      <rect x="8" y="8" width="284" height="434" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2" rx="2" />
      <line x1="8" y1="225" x2="292" y2="225" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
      <circle cx="150" cy="225" r="50" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
      <circle cx="150" cy="225" r="3" fill="rgba(255,255,255,0.5)" />
      <rect x="75" y="8" width="150" height="80" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
      <rect x="105" y="8" width="90" height="35" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
      <circle cx="150" cy="55" r="3" fill="rgba(255,255,255,0.5)" />
      <path d="M 115 88 Q 150 72 185 88" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
      <rect x="120" y="0" width="60" height="8" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
      <rect x="75" y="362" width="150" height="80" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
      <rect x="105" y="407" width="90" height="35" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
      <circle cx="150" cy="395" r="3" fill="rgba(255,255,255,0.5)" />
      <path d="M 115 362 Q 150 378 185 362" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
      <rect x="120" y="442" width="60" height="8" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
      <path d="M 8 16 A 8 8 0 0 1 16 8" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
      <path d="M 284 8 A 8 8 0 0 1 292 16" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
      <path d="M 8 434 A 8 8 0 0 0 16 442" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
      <path d="M 284 442 A 8 8 0 0 0 292 434" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
    </svg>
  );
}

// --- Feuillet Match Tab --------------------------------------------------------

const BENCH_SLOTS = ["R1", "R2", "R3", "R4", "R5"];

function benchLabels(count: number) {
  return Array.from({ length: count }, (_, i) => `R${i + 1}`);
}

export default function FeuilletMatchTab() {
  const { user } = useAuth();
  const { currentTeam, userRole } = useTeam();
  const supabase = createClient();
  const isCoach = userRole === "coach" || userRole === "owner";

  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [formationName, setFormationName] = useState("4-3-3");
  const [presentPlayers, setPresentPlayers] = useState<Profile[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [benchAssignments, setBenchAssignments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [loadedFormationId, setLoadedFormationId] = useState<string | null>(null);
  const [pickingSlot, setPickingSlot] = useState<string | null>(null);
  const [captainId, setCaptainId] = useState<string | null>(null);

  const currentPositions = FORMATIONS[formationName] || FORMATIONS["4-3-3"];

  const assignedPlayerIds = new Set([
    ...Object.values(assignments),
    ...Object.values(benchAssignments),
  ]);

  const availablePlayers = presentPlayers.filter((p) => !assignedPlayerIds.has(p.id));
  const benchSize = Math.max(0, presentPlayers.length - 11);

  function assignToSlot(slotKey: string, playerId: string) {
    if (slotKey.startsWith("bench-")) {
      setBenchAssignments((prev) => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(next)) {
          if (v === playerId) delete next[k];
        }
        for (const [k, v] of Object.entries(assignments)) {
          if (v === playerId) {
            setAssignments((a) => {
              const aNext = { ...a };
              delete aNext[k];
              return aNext;
            });
          }
        }
        next[slotKey] = playerId;
        return next;
      });
    } else {
      setAssignments((prev) => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(next)) {
          if (v === playerId) delete next[k];
        }
        for (const [k, v] of Object.entries(benchAssignments)) {
          if (v === playerId) {
            setBenchAssignments((b) => {
              const bNext = { ...b };
              delete bNext[k];
              return bNext;
            });
          }
        }
        next[slotKey] = playerId;
        return next;
      });
    }
    setPickingSlot(null);
  }

  function removeFromSlot(slotKey: string) {
    if (slotKey.startsWith("bench-")) {
      setBenchAssignments((prev) => {
        const next = { ...prev };
        delete next[slotKey];
        return next;
      });
    } else {
      setAssignments((prev) => {
        const next = { ...prev };
        delete next[slotKey];
        return next;
      });
    }
    setPickingSlot(null);
  }

  function resetAssignments() {
    setAssignments({});
    setBenchAssignments({});
    setLoadedFormationId(null);
    setCaptainId(null);
  }

  function autoCompose() {
    const { assignments: newAssignments, bench: newBench } = autoComposePure({
      slots: currentPositions,
      players: presentPlayers,
      benchSize,
    });

    setAssignments(newAssignments);
    setBenchAssignments(newBench);
    setLoadedFormationId(null);
    setCaptainId((prev) => (prev && presentPlayers.some((p) => p.id === prev) ? prev : null));

    const unfilledSlots = currentPositions.length - Object.keys(newAssignments).length;
    if (unfilledSlots > 0) {
      toast.info(
        `Composition générée — ${unfilledSlots} poste(s) sans joueur au profil adapté`
      );
    } else {
      toast.success("Composition générée — ajustez puis enregistrez");
    }
  }

  function onDragStartPlayer(e: React.DragEvent, pid: string) {
    e.dataTransfer.setData("text/plain", pid);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDropToSlot(slotKey: string, e: React.DragEvent) {
    e.preventDefault();
    const pid = e.dataTransfer.getData("text/plain");
    if (pid) assignToSlot(slotKey, pid);
  }

  function onDragOverSlot(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  async function handleExportPdf() {
    if (!selectedEventId || !currentTeam || !selectedEvent) return;
    setPdfLoading(true);
    try {
      const playersPayload = presentPlayers.map((p) => ({
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        shirt_number: p.shirt_number,
      }));
      const positions = currentPositions.map((slot, i) => ({
        player_id: assignments[`slot-${i}`] || null,
        x: slot.x,
        y: slot.y,
        label: slot.label,
      }));
      const bench = Array.from({ length: benchSize }, (_, i) => benchAssignments[`bench-${i}`] || null);
      const res = await authFetch("/api/export/feuillet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: currentTeam.id,
          teamName: currentTeam.name,
          eventTitle: selectedEvent.title,
          eventDate: selectedEvent.event_date,
          formationName,
          formationData: { positions, bench, captain_id: captainId },
          players: playersPayload,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Erreur lors de l'export");
      }
      const data = await res.json();
      const base64 = (data.pdf as string).split(",")[1] || "";
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      window.open(url, "_blank");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'export PDF");
    } finally {
      setPdfLoading(false);
    }
  }

  // Fetch events
  useEffect(() => {
    if (!currentTeam) return;
    supabase
      .from("events")
      .select("*")
      .eq("team_id", currentTeam.id)
      .eq("type", "match")
      .order("event_date", { ascending: false })
      .then(({ data }) => {
        setEvents((data as Event[]) || []);
        setLoading(false);
      });
  }, [currentTeam]);

  // Fetch present players + existing formation when event changes
  useEffect(() => {
    if (!selectedEventId || !currentTeam) {
      setPresentPlayers([]);
      resetAssignments();
      return;
    }
    setLoadingPlayers(true);

    Promise.all([
      supabase
        .from("attendances")
        .select("profile:profiles!attendances_user_id_fkey(*)")
        .eq("event_id", selectedEventId)
        .eq("status", "present"),
      supabase
        .from("formations")
        .select("*")
        .eq("event_id", selectedEventId)
        .eq("team_id", currentTeam.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]).then(([attendRes, formationRes]) => {
      // Set present players
      if (attendRes.data) {
        const players = attendRes.data
          .map((a: any) => a.profile as unknown as Profile | null)
          .filter((p): p is Profile => p !== null);
        setPresentPlayers(players);
      } else {
        setPresentPlayers([]);
      }

      // Load existing formation
      if (formationRes.error) {
        console.error("Erreur lors du chargement de la composition existante:", formationRes.error);
        toast.error("Impossible de charger la composition existante");
      }
      const existingFormation = formationRes.data as Formation | null;
      if (existingFormation?.formation_data) {
        setFormationName(existingFormation.name);
        setLoadedFormationId(existingFormation.id);
        const fd = existingFormation.formation_data as any;
        if (fd.positions) {
          const newAssignments: Record<string, string> = {};
          fd.positions.forEach((pos: any, i: number) => {
            if (pos.player_id) {
              newAssignments[`slot-${i}`] = pos.player_id;
            }
          });
          setAssignments(newAssignments);
        }
        if (Array.isArray(fd.bench)) {
          const newBench: Record<string, string> = {};
          fd.bench.forEach((pid: string | null, i: number) => {
            if (pid) newBench[`bench-${i}`] = pid;
          });
          setBenchAssignments(newBench);
        }
        setCaptainId(fd.captain_id || null);
      } else {
        resetAssignments();
      }

      setLoadingPlayers(false);
    });
  }, [selectedEventId, currentTeam]);

  async function handleSave() {
    if (!selectedEventId || !currentTeam) return;
    setSaving(true);

    const positions = currentPositions.map((slot, i) => ({
      player_id: assignments[`slot-${i}`] || null,
      x: slot.x,
      y: slot.y,
      label: slot.label,
    }));

    const bench: (string | null)[] = Array.from({ length: benchSize }, (_, i) => benchAssignments[`bench-${i}`] || null);

    const formationData: Record<string, any> = { positions, bench };
    if (captainId) formationData.captain_id = captainId;

    if (loadedFormationId) {
      const { error } = await supabase
        .from("formations")
        .update({
          name: formationName,
          formation_data: formationData,
        })
        .eq("id", loadedFormationId);
      if (error) {
        toast.error("Erreur lors de la mise à jour");
      } else {
        toast.success("Feuillet mis à jour");
      }
    } else {
      const { data, error } = await supabase
        .from("formations")
        .insert({
          event_id: selectedEventId,
          name: formationName,
          formation_data: formationData,
          created_by: user?.id || null,
          is_default: true,
          team_id: currentTeam.id,
        })
        .select()
        .single();
      if (error) {
        toast.error("Erreur lors de la création");
      } else {
        setLoadedFormationId((data as any)?.id || null);
        toast.success("Feuillet enregistré");
      }
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!loadedFormationId) return;
    if (!confirm("Supprimer ce feuillet de match ?")) return;
    const { error } = await supabase
      .from("formations")
      .delete()
      .eq("id", loadedFormationId);
    if (error) {
      toast.error("Erreur lors de la suppression");
    } else {
      toast.success("Feuillet supprimé");
      resetAssignments();
    }
  }

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  function playerById(id: string) {
    return presentPlayers.find((p) => p.id === id);
  }

  if (loading) {
    return <div className="flex h-48 items-center justify-center text-muted-foreground">Chargement...</div>;
  }

  if (!currentTeam) {
    return <div className="flex h-48 items-center justify-center text-muted-foreground">Chargement de l'équipe...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Match</Label>
          <Select
            value={selectedEventId}
            onValueChange={(v) => setSelectedEventId(v ?? "")}
          >
            <SelectTrigger className="w-full h-11">
              <SelectValue placeholder="Sélectionner un match">
                {(v) => {
                  if (!v) return "Sélectionner un match";
                  const ev = events.find((e) => e.id === v);
                  return ev
                    ? `${ev.title}${ev.opponent ? ` vs ${ev.opponent}` : ""}`
                    : v;
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {events.map((ev) => (
                <SelectItem key={ev.id} value={ev.id}>
                  {ev.title}
                  {ev.opponent ? ` vs ${ev.opponent}` : ""} —{" "}
                  {formatDate(ev.event_date)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Formation</Label>
          <Select
            value={formationName}
            onValueChange={(v) => {
              setFormationName(v ?? "4-3-3");
              setAssignments({});
              setBenchAssignments({});
            }}
          >
            <SelectTrigger className="w-full h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(FORMATIONS).map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedEventId && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Pitch */}
          <div className="lg:col-span-2 mx-auto w-full max-w-[200px] lg:max-w-none">
            <div className="relative aspect-[2/3] rounded-lg shadow-lg overflow-hidden bg-green-700">
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(180deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 40px, transparent 40px, transparent 80px)",
                }}
              />
              <PitchSVG />
              {loadingPlayers ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                </div>
              ) : (
                currentPositions.map((slot, i) => {
                  const slotKey = `slot-${i}`;
                  const pid = assignments[slotKey];
                  const player = pid ? playerById(pid) : null;
                  return (
                    <div
                      key={i}
                      className="absolute z-10 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center cursor-pointer"
                      style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                      onClick={() => setPickingSlot(slotKey)}
                      onDragOver={onDragOverSlot}
                      onDrop={(e) => onDropToSlot(slotKey, e)}
                    >
                      {player ? (
                        <div className="relative group">
                          <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold shadow-lg ring-2 ${player.id === captainId ? "bg-yellow-400 text-black ring-yellow-300" : "bg-[var(--color-royal)] text-white ring-white/20"}`}>
                            {player.shirt_number ?? "?"}
                            {player.id === captainId && <Crown className="ml-0.5 h-3 w-3" />}
                          </div>
                          <span className="mt-0.5 max-w-[64px] truncate text-[9px] font-medium text-white/90 drop-shadow text-center block">
                            {player.first_name.charAt(0)}. {player.last_name}
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center opacity-70 hover:opacity-100 transition-opacity">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold border-2 border-dashed border-white/40 text-white/50 bg-white/5">
                            ?
                          </div>
                          <span className="mt-0.5 text-[8px] text-white/50 truncate max-w-[56px] text-center">
                            {slot.label}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Bench */}
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold mb-2">Banc</h4>
              <div className="space-y-1.5">
                {benchLabels(benchSize).map((label, i) => {
                  const slotKey = `bench-${i}`;
                  const pid = benchAssignments[slotKey];
                  const player = pid ? playerById(pid) : null;
                  return (
                    <div
                      key={slotKey}
                      className="flex items-center gap-2.5 rounded-lg border bg-card p-2.5 text-sm cursor-pointer hover:bg-accent/50 transition-colors"
                      onClick={() => setPickingSlot(slotKey)}
                      onDragOver={onDragOverSlot}
                      onDrop={(e) => onDropToSlot(slotKey, e)}
                    >
                      <span className="w-6 shrink-0 text-xs text-muted-foreground">{label}</span>
                      {player ? (
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                            {player.shirt_number ?? "?"}
                          </span>
                          <span className="truncate font-medium text-sm flex-1">
                            {player.first_name} {player.last_name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/50 text-xs">—</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {!loadingPlayers && presentPlayers.length > 0 && (
              <div className="text-xs text-muted-foreground">
                {Object.keys(assignments).length}/11 postes · {Object.keys(benchAssignments).length}/{benchSize} remplaçants
              </div>
            )}

            {/* Joueurs disponibles (draggable) */}
            {isCoach && availablePlayers.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Joueurs disponibles</h4>
                <div className="flex flex-wrap gap-1.5">
                  {availablePlayers.map((p) => (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={(e) => onDragStartPlayer(e, p.id)}
                      className="flex items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-1 text-xs cursor-grab active:cursor-grabbing hover:bg-accent transition-colors"
                      title={`${p.first_name} ${p.last_name} — glissez sur le terrain ou le banc`}
                    >
                      <span className="font-bold">{p.shirt_number ?? "?"}</span>
                      <span className="truncate max-w-[80px]">{p.last_name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Player picker dialog */}
      <Dialog open={pickingSlot !== null} onOpenChange={(open) => { if (!open) setPickingSlot(null); }}>
        <DialogContent className="max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {pickingSlot?.startsWith("bench-") ? "Choisir un remplaçant" : "Choisir un joueur"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            {pickingSlot && (() => {
              const currentPid = pickingSlot.startsWith("bench-")
                ? benchAssignments[pickingSlot]
                : assignments[pickingSlot];
              const currentPlayer = currentPid ? playerById(currentPid) : null;
              return (
                <>
                  {currentPlayer && (
                    <>
                      <button
                        className="flex w-full items-center gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                        onClick={() => removeFromSlot(pickingSlot)}
                      >
                        <span>Retirer {currentPlayer.first_name} {currentPlayer.last_name}</span>
                      </button>
                      {!pickingSlot.startsWith("bench-") && (
                        <button
                          className={`flex w-full items-center gap-2.5 rounded-lg border p-3 text-sm transition-colors ${captainId === currentPlayer.id ? "border-yellow-300 bg-yellow-50 text-yellow-800 hover:bg-yellow-100" : "border-card bg-card hover:bg-accent/50"}`}
                          onClick={() => {
                            setCaptainId(captainId === currentPlayer.id ? null : currentPlayer.id);
                            setPickingSlot(null);
                          }}
                        >
                          <Crown className={`h-4 w-4 ${captainId === currentPlayer.id ? "text-yellow-500" : "text-muted-foreground"}`} />
                          <span>{captainId === currentPlayer.id ? "Retirer le brassard" : "Définir comme capitaine"}</span>
                        </button>
                      )}
                    </>
                  )}
                  {availablePlayers.length === 0 && !currentPlayer && (
                    <p className="py-4 text-center text-sm text-muted-foreground">Aucun joueur disponible</p>
                  )}
                  {availablePlayers.map((p) => (
                    <button
                      key={p.id}
                      className="flex w-full items-center gap-2.5 rounded-lg border bg-card p-3 text-sm hover:bg-accent/50 transition-colors text-left"
                      onClick={() => assignToSlot(pickingSlot, p.id)}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold">
                        {p.shirt_number ?? "?"}
                      </span>
                      <span className="truncate font-medium">{p.first_name} {p.last_name}</span>
                    </button>
                  ))}
                </>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {selectedEventId && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            {isCoach && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={autoCompose}
                  disabled={saving}
                >
                  Composer automatiquement
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportPdf}
                  disabled={pdfLoading}
                >
                  {pdfLoading ? "Génération..." : "Exporter PDF"}
                </Button>
              </>
            )}
            <Button
              onClick={handleSave}
              disabled={saving || !selectedEventId}
              className="bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold"
            >
              {saving ? "Enregistrement..." : "Enregistrer le feuillet"}
            </Button>
            {loadedFormationId && isCoach && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                className="text-destructive border-destructive hover:bg-destructive/10"
              >
                Supprimer
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {Object.keys(assignments).length}/11 postes attribués
          </p>
        </div>
      )}
    </div>
  );
}

