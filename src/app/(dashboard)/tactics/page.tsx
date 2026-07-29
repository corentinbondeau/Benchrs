"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Calendar,
  Clock,
  Target,
  FileText,
  ArrowLeft,
  Trash2,
  Shirt,
  Users,
  Crown,
  Swords,
  ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import type {
  TrainingSession,
  Exercise,
  Profile,
  Event,
} from "@/types";

const DRILL_TYPES = [
  "échauffement",
  "technique",
  "tactique",
  "physique",
  "jeu",
];

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// --- Séance Tab ----------------------------------------------------------------

const PHASE_OBJECTIVES: Record<string, string[]> = {
  "DÉSEQUILIBRER / FINIR": [
    "Jeu combiné pour créer le surnombre",
    "Jouer à l'opposé après avoir fixer",
    "Rechercher joueur lancé dans la profondeur",
    "Se démarquer, éliminer passer ou tirer face à une défense en place",
    "Se démarquer, éliminer passer ou tirer face à une défense en crise",
  ],
  "CONSERVER / PROGRESSER": [
    "Créer et utiliser des espaces",
    "Jouer dans les intervalles et entre les lignes",
    "Jouer combiné à 2 / à 3 créer de la mobilité et de la vitesse de circulation",
  ],
  "S’OPPOSER À LA PROGRESSION": [
    "Freiner la progression / réorganiser les alignements",
    "Anticiper la profondeur",
    "Protéger l'axe, le couloir de jeu direct, organiser les prises en charge",
  ],
  "S’ORGANISER POUR RECUPERER": [
    "S'organiser en déséquilibre",
    "Densifier dans le couloir de jeu",
    "Couvrir le partenaire dans l'action défensive",
  ],
  ATHLETISATION: [],
};

function SéanceTab() {
  const { user } = useAuth();
  const { currentTeam } = useTeam();
  const isCoach = user?.profile?.role === "coach";
  const supabase = createClient();

  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<TrainingSession | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [attendanceCount, setAttendanceCount] = useState<{ present: number; total: number } | null>(null);

  const [form, setForm] = useState({
    event_id: "",
    title: "",
    notes: "",
  });
  const [selectedObjectives, setSelectedObjectives] = useState<string[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([
    { name: "", duration: 15, description: "", drill_type: "échauffement" },
  ]);

  if (!currentTeam) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Chargement de l'équipe...</p></div>;
  }

  const fetchData = useCallback(async () => {
    const [sessionsRes, eventsRes] = await Promise.all([
      supabase
        .from("training_sessions")
        .select("*")
        .eq("team_id", currentTeam!.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("events")
        .select("*")
        .eq("team_id", currentTeam!.id)
        .eq("type", "training")
        .order("event_date", { ascending: true }),
    ]);
    setSessions((sessionsRes.data as TrainingSession[]) || []);
    setEvents((eventsRes.data as Event[]) || []);
    setLoading(false);
  }, [supabase, currentTeam]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!selectedSession?.event_id || !currentTeam) return;
    supabase
      .from("attendances")
      .select("status")
      .eq("event_id", selectedSession.event_id)
      .then(({ data }) => {
        if (!data) { setAttendanceCount(null); return; }
        const present = data.filter((a) => a.status === "present" || a.status === "late").length;
        setAttendanceCount({ present, total: data.length });
      });
  }, [selectedSession?.event_id, currentTeam]);

  function addExercise() {
    setExercises([
      ...exercises,
      { name: "", duration: 15, description: "", drill_type: "technique" },
    ]);
  }

  function removeExercise(index: number) {
    setExercises(exercises.filter((_, i) => i !== index));
  }

  function updateExercise(index: number, field: keyof Exercise, value: string | number) {
    const updated = [...exercises];
    updated[index] = { ...updated[index], [field]: value };
    setExercises(updated);
  }

  async function handleDeleteSession() {
    if (!selectedSession) return;
    if (!confirm("Supprimer cette séance ?")) return;
    const { error } = await supabase
      .from("training_sessions")
      .delete()
      .eq("id", selectedSession.id);
    if (error) {
      toast.error("Erreur lors de la suppression");
    } else {
      toast.success("Séance supprimée");
      setSelectedSession(null);
      fetchData();
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.event_id) {
      toast.error("Veuillez sélectionner un événement");
      return;
    }

    setSubmitting(true);
    const validExercises = exercises.filter((ex) => ex.name.trim() !== "");
    const objectives = selectedObjectives;

    const { error } = await supabase.from("training_sessions").insert({
      event_id: form.event_id,
      title: form.title,
      objectives: objectives.length > 0 ? objectives : null,
      exercises: validExercises.length > 0 ? validExercises : null,
      notes: form.notes || null,
      created_by: user?.id || null,
      team_id: currentTeam!.id,
    });

    if (error) {
      toast.error("Erreur lors de la création");
    } else {
      toast.success("Séance créée avec succès");
      setCreateOpen(false);
      resetForm();
      fetchData();
    }
    setSubmitting(false);
  }

  function resetForm() {
    setForm({ event_id: "", title: "", notes: "" });
    setSelectedObjectives([]);
    setExercises([{ name: "", duration: 15, description: "", drill_type: "échauffement" }]);
  }

  const eventMap = new Map(events.map((ev) => [ev.id, ev]));

  if (selectedSession) {
    const event = eventMap.get(selectedSession.event_id);
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSelectedSession(null)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Button>
          {isCoach && (
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleDeleteSession}>
              <Trash2 className="mr-2 h-4 w-4" />
              Supprimer
            </Button>
          )}
        </div>
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-xl">{selectedSession.title ? `Phase : ${selectedSession.title}` : "(Sans phase)"}</CardTitle>
                {event && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {event.title} — {formatDate(event.event_date)}
                  </p>
                )}
                {attendanceCount && (
                  <div className="mt-3 flex items-center gap-1.5 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-foreground">{attendanceCount.present}</span>
                    <span className="text-muted-foreground">/ {attendanceCount.total} présents</span>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedSession.objectives && selectedSession.objectives.length > 0 && (
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Target className="h-4 w-4" />
                  Objectifs
                </h4>
                <div className="flex flex-wrap gap-2">
                  {selectedSession.objectives.map((obj, i) => (
                    <Badge key={i} variant="secondary">
                      {obj}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {selectedSession.exercises && selectedSession.exercises.length > 0 && (
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Clock className="h-4 w-4" />
                  Exercices ({selectedSession.exercises.length})
                </h4>
                <div className="space-y-3">
                  {selectedSession.exercises.map((ex, i) => (
                    <div key={i} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {ex.drill_type}
                          </Badge>
                          <span className="font-medium">{ex.name}</span>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {ex.duration} min
                        </span>
                      </div>
                      {ex.description && (
                        <p className="mt-2 text-sm text-muted-foreground">
                          {ex.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedSession.notes && (
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <FileText className="h-4 w-4" />
                  Notes
                </h4>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {selectedSession.notes}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {sessions.length} séance{sessions.length !== 1 ? "s" : ""}
        </p>
        {isCoach && (
          <Dialog
            open={createOpen}
            onOpenChange={(open) => {
              setCreateOpen(open);
              if (!open) resetForm();
            }}
          >
            <DialogTrigger render={<Button size="sm" className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold" />}>
              <Plus className="mr-1 h-4 w-4" />
              Nouvelle séance
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Créer une séance</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>Événement *</Label>
                  <Select
                    value={form.event_id}
                    onValueChange={(v) => setForm({ ...form, event_id: v ?? "" })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sélectionner un entraînement">
                        {(v) => {
                          if (!v) return "Sélectionner un entraînement";
                          const ev = events.find((e) => e.id === v);
                          return ev ? `${ev.title} — ${formatDate(ev.event_date)}` : v;
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {events
                        .filter(
                          (ev) =>
                            !sessions.some((s) => s.event_id === ev.id)
                        )
                        .map((ev) => (
                          <SelectItem key={ev.id} value={ev.id}>
                            {ev.title} — {formatDate(ev.event_date)}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Phase</Label>
                  <Select
                    value={form.title}
                    onValueChange={(v) => {
                      setForm({ ...form, title: v ?? "" });
                      setSelectedObjectives([]);
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sélectionner une phase">
                        {(v) => {
                          if (!v) return "Sélectionner une phase";
                          return v;
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DÉSEQUILIBRER / FINIR">DÉSEQUILIBRER / FINIR</SelectItem>
                      <SelectItem value="CONSERVER / PROGRESSER">CONSERVER / PROGRESSER</SelectItem>
                      <SelectItem value="S’OPPOSER À LA PROGRESSION">S’OPPOSER À LA PROGRESSION</SelectItem>
                      <SelectItem value="S’ORGANISER POUR RECUPERER">S’ORGANISER POUR RECUPERER</SelectItem>
                      <SelectItem value="ATHLETISATION">ATHLETISATION</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Objectifs (max 2)</Label>
                  {PHASE_OBJECTIVES[form.title] && PHASE_OBJECTIVES[form.title].length > 0 ? (
                    <div className="space-y-1.5">
                      {PHASE_OBJECTIVES[form.title].map((obj) => {
                        const checked = selectedObjectives.includes(obj);
                        const atMax = selectedObjectives.length >= 2 && !checked;
                        return (
                          <label
                            key={obj}
                            className={`flex items-start gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                              checked ? "border-[var(--color-gold)] bg-[var(--color-gold)]/5" : "hover:bg-muted"
                            } ${atMax ? "opacity-40" : ""}`}
                          >
                            <Checkbox
                              checked={checked}
                              disabled={atMax}
                              onCheckedChange={() => {
                                setSelectedObjectives(
                                  checked
                                    ? selectedObjectives.filter((o) => o !== obj)
                                    : [...selectedObjectives, obj]
                                );
                              }}
                            />
                            <span className="text-sm">{obj}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {form.title ? "Aucun objectif disponible pour cette phase" : "Sélectionnez d'abord une phase"}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Notes supplémentaires..."
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Exercices</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addExercise} className="border-[var(--color-gold)] text-[var(--color-gold)] hover:bg-[var(--color-gold)]/10">
                      <Plus className="mr-1 h-3 w-3" />
                      Ajouter
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {exercises.map((ex, i) => (
                      <div key={i} className="rounded-lg border p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground">
                            Exercice {i + 1}
                          </span>
                          {exercises.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeExercise(i)}
                              className="h-6 px-2 text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                        <Input
                          value={ex.name}
                          onChange={(e) => updateExercise(i, "name", e.target.value)}
                          placeholder="Nom de l'exercice"
                        />
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <Input
                              type="number"
                              min={1}
                              value={ex.duration}
                              onChange={(e) =>
                                updateExercise(i, "duration", parseInt(e.target.value) || 15)
                              }
                              placeholder="Durée (min)"
                            />
                          </div>
                          <div className="flex-1">
                            <Select
                              value={ex.drill_type}
                              onValueChange={(v) =>
                                updateExercise(i, "drill_type", v ?? "technique")
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {DRILL_TYPES.map((dt) => (
                                  <SelectItem key={dt} value={dt}>
                                    {dt}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <Textarea
                          value={ex.description}
                          onChange={(e) => updateExercise(i, "description", e.target.value)}
                          placeholder="Description (optionnel)"
                          rows={2}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setCreateOpen(false);
                      resetForm();
                    }}
                    className="border-[var(--color-gold)] text-[var(--color-gold)] hover:bg-[var(--color-gold)]/10"
                  >
                    Annuler
                  </Button>
                  <Button type="submit" disabled={submitting} className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold">
                    {submitting ? "Création..." : "Créer"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center text-muted-foreground">
          Chargement...
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
          Aucune séance enregistrée
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => {
            const event = eventMap.get(session.event_id);
            return (
              <Card
                key={session.id}
                className="cursor-pointer transition-colors hover:bg-accent/50"
                onClick={() => setSelectedSession(session)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <h3 className="font-medium">{session.title ? `Phase : ${session.title}` : "(Sans phase)"}</h3>
                      {event && (
                        <p className="text-sm text-muted-foreground">
                          {event.title} — {formatDate(event.event_date)}
                        </p>
                      )}
                    </div>
                    <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {session.exercises && session.exercises.length > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {session.exercises.length} exercice
                        {session.exercises.length !== 1 ? "s" : ""}
                      </Badge>
                    )}
                    {session.objectives &&
                      session.objectives.slice(0, 2).map((obj, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {obj}
                        </Badge>
                      ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- Pitch SVG (reusable) ---

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

const POSITION_ROW: Record<string, number> = {
  goalkeeper: 82,
  defender: 65,
  midfielder: 45,
  forward: 25,
};

function normalizePosition(pos: string | null): string {
  if (!pos) return "forward";
  const lower = pos.toLowerCase();
  if (lower.includes("gardien")) return "goalkeeper";
  if (lower.includes("défense") || lower.includes("arrière")) return "defender";
  if (lower.includes("milieu") || lower.includes("ailier")) return "midfielder";
  return "forward";
}

function FeuilletMatchTab() {
  const { currentTeam } = useTeam();
  const supabase = createClient();

  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [presentPlayers, setPresentPlayers] = useState<Profile[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingPlayers, setLoadingPlayers] = useState(false);

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
        setLoadingEvents(false);
      });
  }, [currentTeam]);

  useEffect(() => {
    if (!selectedEventId || !currentTeam) {
      setPresentPlayers([]);
      return;
    }
    setLoadingPlayers(true);
    supabase
      .from("attendances")
      .select("profile:profiles!attendances_user_id_fkey(*)")
      .eq("event_id", selectedEventId)
      .eq("status", "present")
      .then(({ data }) => {
        if (!data) { setPresentPlayers([]); setLoadingPlayers(false); return; }
        const players = data
          .map((a) => {
            const p = a.profile as unknown as Profile | null;
            return p;
          })
          .filter((p): p is Profile => p !== null);
        setPresentPlayers(players);
        setLoadingPlayers(false);
      });
  }, [selectedEventId, currentTeam]);

  const positionOrder = ["goalkeeper", "defender", "midfielder", "forward"];

  function pitchPlayers() {
    const grouped: Record<string, Profile[]> = {};
    for (const p of presentPlayers) {
      const pos = normalizePosition(p.position);
      if (!grouped[pos]) grouped[pos] = [];
      grouped[pos].push(p);
    }
    const result: { profile: Profile; x: number; y: number }[] = [];
    for (const pos of positionOrder) {
      const list = grouped[pos] || [];
      list.forEach((profile, i) => {
        const x = list.length <= 1 ? 50 : 12 + (i / (list.length - 1)) * 76;
        const y = POSITION_ROW[pos] || 50;
        result.push({ profile, x, y });
      });
    }
    return result;
  }

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  return (
    <div className="space-y-4 pb-20">
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

      {selectedEventId && (
        <div className="mx-auto max-w-[240px]">
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
              pitchPlayers().map(({ profile, x, y }) => (
                <div
                  key={profile.id}
                  className="absolute z-10 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
                  style={{ left: `${x}%`, top: `${y}%` }}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold shadow-lg bg-[var(--color-royal)] text-white">
                    {profile.shirt_number ?? "?"}
                  </div>
                  <span className="mt-0.5 max-w-[64px] truncate text-[9px] font-medium text-white/90 drop-shadow text-center">
                    {profile.first_name.charAt(0)}. {profile.last_name}
                  </span>
                </div>
              ))
            )}
            {!loadingPlayers && presentPlayers.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-xs text-white/60">Aucun joueur présent</p>
              </div>
            )}
          </div>
        </div>
      )}

      {selectedEvent && presentPlayers.length > 0 && (
        <div className="text-center text-sm text-muted-foreground">
          {presentPlayers.length} joueur{presentPlayers.length > 1 ? "s" : ""} présent{presentPlayers.length > 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}

// --- Page ----------------------------------------------------------------------

export default function TacticsPage() {
  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      <div>
        <h2 className="text-xl md:text-2xl font-bold">Tactique & Séances</h2>
        <p className="text-sm mt-1 text-muted-foreground">
          Gestion des entraînements et compositions d&apos;équipe
        </p>
      </div>

      <Tabs defaultValue="seance" className="space-y-4">
        <TabsList className="overflow-x-auto">
          <TabsTrigger value="seance" className="shrink-0"><ClipboardList className="h-4 w-4 mr-1.5" />Séance</TabsTrigger>
          <TabsTrigger value="match" className="shrink-0"><Swords className="h-4 w-4 mr-1.5" />Feuillet Match</TabsTrigger>
        </TabsList>
        <TabsContent value="seance">
          <SéanceTab />
        </TabsContent>
        <TabsContent value="match">
          <FeuilletMatchTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
