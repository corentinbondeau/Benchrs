"use client";

import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Calendar,
  Check,
  Clock,
  Info,
  MapPin,
  User,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import type { AttendanceStatus, Profile } from "@/types";
import {
  groupRemindersByEvent,
  countPendingPlayers,
  type ReminderEvent,
  type ReminderParentLink,
} from "@/lib/convocation-reminders";
import { RemindAllButton } from "@/components/RemindAllButton";

export interface PlayerAttendanceRow {
  profile: Profile;
  status: AttendanceStatus | null;
  attendanceId: string | null;
  absenceReason: string | null;
}

export interface MyPresenceInfo {
  label: string;
  playerId: string;
  status: AttendanceStatus | null;
}

export async function getParentChildId(
  userId: string,
  teamId: string
): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("parent_student")
    .select("student_id")
    .eq("parent_id", userId)
    .eq("team_id", teamId)
    .maybeSingle();
  return (data?.student_id as string | undefined) ?? null;
}

function formatMeetingTime(time: string) {
  return time.slice(0, 5);
}

function StatusBadge({ status }: { status: AttendanceStatus | null }) {
  if (status === "present") {
    return <Badge className="bg-green-100 text-green-700 border-green-200">Présent</Badge>;
  }
  if (status === "late") {
    return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Retard</Badge>;
  }
  if (status === "absent") {
    return <Badge className="bg-red-100 text-red-700 border-red-200">Absent</Badge>;
  }
  if (status === "excused") {
    return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Excusé</Badge>;
  }
  return null;
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="text-sm text-muted-foreground w-24 shrink-0">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function ResponseButton({
  active,
  activeClass,
  idleClass,
  onClick,
  children,
}: {
  active: boolean;
  activeClass: string;
  idleClass: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      size="sm"
      variant="outline"
      className={`flex-1 ${active ? activeClass : idleClass}`}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

// Part 1 — Informations globales (RDV, début, lieu + présence du joueur)
export function EventInfoCard({
  date,
  endDate,
  meetingTime,
  location,
  isCoach,
  myPresence,
  convocationsSent,
  onRespond,
}: {
  date: Date;
  endDate?: Date | null;
  meetingTime: string | null;
  location: string | null;
  isCoach?: boolean;
  myPresence?: MyPresenceInfo;
  convocationsSent: boolean;
  onRespond?: (status: "present" | "late" | "absent", reason?: string) => Promise<void>;
}) {
  const [showRetardReason, setShowRetardReason] = useState(false);
  const [retardReason, setRetardReason] = useState("");
  const [showAbsenceReason, setShowAbsenceReason] = useState(false);
  const [absenceReason, setAbsenceReason] = useState("");
  // Coloration OPTIMISTE : le bouton cliqué s'affiche coloré immédiatement,
  // sans attendre l'aller-retour base. Effacé quand l'écriture se termine
  // (l'état parent `myPresence.status` — mis à jour en optimiste par le
  // caller — prend alors le relais pour garder le bouton coloré).
  const [pendingStatus, setPendingStatus] = useState<"present" | "late" | "absent" | null>(null);

  const mapsUrl = location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
    : null;

  const dateStr = date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const startStr = date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const endStr = endDate
    ? endDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : null;

  function startRespond(status: "present" | "late" | "absent") {
    if (!onRespond) return;
    if (status === "late") {
      // Motif de retard requis : ouvre la saisie, le bouton se colore déjà.
      setShowAbsenceReason(false);
      setPendingStatus("late");
      setShowRetardReason(true);
      return;
    }
    if (status === "absent") {
      // Motif d'absence requis (comme dans l'accueil) : ouvre la saisie.
      setShowRetardReason(false);
      setPendingStatus("absent");
      setShowAbsenceReason(true);
      return;
    }
    setShowRetardReason(false);
    setShowAbsenceReason(false);
    setPendingStatus("present");
    onRespond("present")
      .catch(() => {})
      .finally(() => setPendingStatus((prev) => (prev === "present" ? null : prev)));
  }

  function confirmRetard() {
    if (!onRespond || !retardReason.trim()) return;
    onRespond("late", retardReason.trim())
      .catch(() => {})
      .finally(() => setPendingStatus(null));
    setShowRetardReason(false);
    setRetardReason("");
  }

  function confirmAbsence() {
    if (!onRespond || !absenceReason.trim()) return;
    onRespond("absent", absenceReason.trim())
      .catch(() => {})
      .finally(() => setPendingStatus(null));
    setShowAbsenceReason(false);
    setAbsenceReason("");
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Info className="h-4 w-4 text-[var(--color-gold)]" />
          Informations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <InfoRow icon={Calendar} label="Date" value={dateStr} />
        {meetingTime && (
          <InfoRow icon={Clock} label="Rendez-vous" value={formatMeetingTime(meetingTime)} />
        )}
        <InfoRow icon={Clock} label="Début" value={startStr} />
        {endStr && <InfoRow icon={Clock} label="Fin" value={endStr} />}
        {location && (
          <div className="flex items-center justify-between gap-2">
            <InfoRow icon={MapPin} label="Lieu" value={location} />
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--color-royal)]/30 bg-[var(--color-royal)]/5 px-2 py-1 text-xs font-medium text-[var(--color-royal)] hover:bg-[var(--color-royal)]/10"
              >
                <MapPin className="h-3 w-3" />
                Itinéraire
              </a>
            )}
          </div>
        )}

        {myPresence && onRespond && convocationsSent && (
          <div className="rounded-lg bg-muted/50 p-3 mt-1 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-[var(--color-royal)]" />
                {myPresence.label}
              </p>
              {/* `excused` n'a pas de bouton de réponse : le badge latéral est
                  son seul indicateur. Les autres statuts sont portés par le
                  fond coloré des boutons (actif = réponse en cours). */}
              {myPresence.status === "excused" && <StatusBadge status={myPresence.status} />}
            </div>
            <div className="flex gap-2">
              <ResponseButton
                active={myPresence.status === "present" || pendingStatus === "present"}
                activeClass="bg-green-600 text-white border-green-600 hover:bg-green-700 dark:bg-green-600 dark:border-green-600 dark:text-white dark:hover:bg-green-700"
                idleClass="border-border bg-background text-foreground hover:bg-muted"
                onClick={() => startRespond("present")}
              >
                <Check className="h-3.5 w-3.5 mr-1" />
                Présent
              </ResponseButton>
              <ResponseButton
                active={myPresence.status === "late" || pendingStatus === "late" || showRetardReason}
                activeClass="bg-amber-500 text-white border-amber-500 hover:bg-amber-600 dark:bg-amber-500 dark:border-amber-500 dark:text-white dark:hover:bg-amber-600"
                idleClass="border-border bg-background text-foreground hover:bg-muted"
                onClick={() => startRespond("late")}
              >
                <Clock className="h-3.5 w-3.5 mr-1" />
                Retard
              </ResponseButton>
              <ResponseButton
                active={myPresence.status === "absent" || pendingStatus === "absent" || showAbsenceReason}
                activeClass="bg-red-600 text-white border-red-600 hover:bg-red-700 dark:bg-red-600 dark:border-red-600 dark:text-white dark:hover:bg-red-700"
                idleClass="border-border bg-background text-foreground hover:bg-muted"
                onClick={() => startRespond("absent")}
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Absent
              </ResponseButton>
            </div>
            {showRetardReason && (
              <div className="space-y-2 pt-1">
                <Label className="text-xs">Explication du retard (obligatoire)</Label>
                <Input
                  placeholder="Ex: Retenu(e) au travail, embouteillages..."
                  value={retardReason}
                  onChange={(e) => setRetardReason(e.target.value)}
                  className="text-sm h-8"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-amber-500 text-white hover:bg-amber-600 flex-1"
                    disabled={!retardReason.trim()}
                    onClick={confirmRetard}
                  >
                    Confirmer
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs flex-1"
                    onClick={() => {
                      setShowRetardReason(false);
                      setRetardReason("");
                      setPendingStatus((prev) => (prev === "late" ? null : prev));
                    }}
                  >
                    Annuler
                  </Button>
                </div>
              </div>
            )}

            {showAbsenceReason && (
              <div className="space-y-2 pt-1">
                <Label className="text-xs">Motif d&apos;absence (obligatoire)</Label>
                <Input
                  placeholder="Ex: Malade, examens, famille..."
                  value={absenceReason}
                  onChange={(e) => setAbsenceReason(e.target.value)}
                  className="text-sm h-8"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-red-600 text-white hover:bg-red-700 flex-1"
                    disabled={!absenceReason.trim()}
                    onClick={confirmAbsence}
                  >
                    Confirmer
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs flex-1"
                    onClick={() => {
                      setShowAbsenceReason(false);
                      setAbsenceReason("");
                      setPendingStatus((prev) => (prev === "absent" ? null : prev));
                    }}
                  >
                    Annuler
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PlayerListSection({
  title,
  titleClass,
  rowClass,
  textClass,
  players,
  actions,
}: {
  title: string;
  titleClass: string;
  rowClass: string;
  textClass: string;
  players: PlayerAttendanceRow[];
  actions?: (player: PlayerAttendanceRow) => ReactNode;
}) {
  if (players.length === 0) return null;
  return (
    <div>
      <p className={`text-xs font-medium mb-2 ${titleClass}`}>{title}</p>
      <div className="space-y-1">
        {players.map((p) => (
          <div
            key={p.profile.id}
            className={`flex items-center gap-2 rounded-lg ${rowClass} px-3 py-2`}
          >
            <div className="flex-1 min-w-0">
              <span className={`text-sm ${textClass}`}>
                {p.profile.first_name} {p.profile.last_name}
              </span>
              {p.absenceReason && (
                <p className={`text-xs mt-0.5 truncate ${textClass} opacity-70`}>
                  {p.absenceReason}
                </p>
              )}
            </div>
            {actions?.(p)}
          </div>
        ))}
      </div>
    </div>
  );
}

// Part 2 — Liste des présents et absents
export function AttendanceLists({
  players,
  isCoach,
  convocationsSent,
  onUpdate,
  event,
  teamId,
  parentLinks,
  onRemindDone,
}: {
  players: PlayerAttendanceRow[];
  isCoach: boolean;
  convocationsSent: boolean;
  onUpdate: (userId: string, status: AttendanceStatus) => void;
  event?: ReminderEvent;
  teamId?: string;
  parentLinks?: ReminderParentLink[];
  onRemindDone?: () => void;
}) {
  // Dénominateur = joueurs CONVOQUÉS (ayant une ligne attendances), pas tous les actifs.
  const convoked = players.filter((p) => p.attendanceId !== null);
  const present = convoked.filter((p) => p.status === "present");
  const late = convoked.filter((p) => p.status === "late");
  const absent = convoked.filter((p) => p.status === "absent");
  const excused = convoked.filter((p) => p.status === "excused");
  const waiting = convoked.filter(
    (p) => p.attendanceId !== null && (p.status === null || p.status === "pending")
  );
  const total = convoked.length;

  const canRemindAll = isCoach && !!event && !!teamId;
  const reminderTargets = canRemindAll
    ? groupRemindersByEvent({
        events: [event!],
        attendances: waiting.map((p) => ({
          event_id: event!.id,
          user_id: p.profile.id,
          status: p.status,
        })),
        parentLinks: parentLinks || [],
      })
    : [];
  const pendingPlayerCount = canRemindAll
    ? countPendingPlayers(
        reminderTargets,
        waiting.map((p) => ({ event_id: event!.id, user_id: p.profile.id, status: p.status }))
      )
    : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-[var(--color-gold)]" />
          Présents et absents
          {total > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              — {present.length + late.length}/{total}
            </span>
          )}
          {canRemindAll && (
            <div className="ml-auto">
              <RemindAllButton
                targets={reminderTargets}
                pendingCount={pendingPlayerCount}
                teamId={teamId!}
                onDone={onRemindDone}
              />
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Aucun joueur convoqué
          </p>
        ) : (
          <div className="space-y-4">
            <PlayerListSection
              title={`Présents (${present.length})`}
              titleClass="text-green-600"
              rowClass="bg-green-50"
              textClass="text-green-900"
              players={present}
              actions={
                isCoach
                  ? (p) => (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => onUpdate(p.profile.id, "absent")}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )
                  : undefined
              }
            />

            <PlayerListSection
              title={`En retard (${late.length})`}
              titleClass="text-amber-600"
              rowClass="bg-amber-50"
              textClass="text-amber-900"
              players={late}
              actions={
                isCoach
                  ? (p) => (
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-green-500 hover:text-green-700 hover:bg-green-50"
                          onClick={() => onUpdate(p.profile.id, "present")}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => onUpdate(p.profile.id, "absent")}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )
                  : undefined
              }
            />

            <PlayerListSection
              title={`Absents (${absent.length})`}
              titleClass="text-red-600"
              rowClass="bg-red-50"
              textClass="text-red-900"
              players={absent}
              actions={
                isCoach
                  ? (p) => (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-green-500 hover:text-green-700 hover:bg-green-50"
                        onClick={() => onUpdate(p.profile.id, "present")}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    )
                  : undefined
              }
            />

            <PlayerListSection
              title={`Excusés (${excused.length})`}
              titleClass="text-blue-600"
              rowClass="bg-blue-50"
              textClass="text-blue-900"
              players={excused}
              actions={
                isCoach
                  ? (p) => (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-green-500 hover:text-green-700 hover:bg-green-50"
                        onClick={() => onUpdate(p.profile.id, "present")}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    )
                  : undefined
              }
            />

            {!convocationsSent && waiting.length > 0 ? (
              <div className="rounded-lg bg-muted/50 px-3 py-2">
                <p className="text-sm text-muted-foreground">
                  Aucune convocation envoyée
                </p>
              </div>
            ) : (
              <PlayerListSection
                title={`En attente (${waiting.length})`}
                titleClass="text-muted-foreground"
                rowClass="bg-muted/50"
                textClass="text-muted-foreground"
                players={waiting}
                actions={
                  isCoach
                    ? (p) => (
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-green-500 hover:text-green-700 hover:bg-green-50"
                            onClick={() => onUpdate(p.profile.id, "present")}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => onUpdate(p.profile.id, "absent")}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )
                    : undefined
                }
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
