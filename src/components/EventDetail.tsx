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
  onClick,
  children,
}: {
  active: boolean;
  activeClass: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      size="sm"
      variant="outline"
      className={`flex-1 ${active ? activeClass : ""}`}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

// Part 1 — Informations globales (RDV, début, lieu + présence du joueur)
export function EventInfoCard({
  date,
  meetingTime,
  location,
  myPresence,
  onRespond,
}: {
  date: Date;
  meetingTime: string | null;
  location: string | null;
  myPresence?: MyPresenceInfo;
  onRespond?: (status: "present" | "late" | "absent", reason?: string) => void;
}) {
  const [showRetardReason, setShowRetardReason] = useState(false);
  const [retardReason, setRetardReason] = useState("");

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

  function startRespond(status: "present" | "late" | "absent") {
    if (!onRespond) return;
    if (status === "late") {
      setShowRetardReason(true);
      return;
    }
    onRespond(status);
  }

  function confirmRetard() {
    if (!onRespond || !retardReason.trim()) return;
    onRespond("late", retardReason.trim());
    setShowRetardReason(false);
    setRetardReason("");
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
        {location && <InfoRow icon={MapPin} label="Lieu" value={location} />}

        {myPresence && onRespond && (
          <div className="rounded-lg bg-muted/50 p-3 mt-1 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-[var(--color-royal)]" />
                {myPresence.label}
              </p>
              <StatusBadge status={myPresence.status} />
            </div>
            <div className="flex gap-2">
              <ResponseButton
                active={myPresence.status === "present"}
                activeClass="bg-green-600 text-white border-green-600 hover:bg-green-700"
                onClick={() => startRespond("present")}
              >
                <Check className="h-3.5 w-3.5 mr-1" />
                Présent
              </ResponseButton>
              <ResponseButton
                active={myPresence.status === "late" || showRetardReason}
                activeClass="bg-amber-500 text-white border-amber-500 hover:bg-amber-600"
                onClick={() => startRespond("late")}
              >
                <Clock className="h-3.5 w-3.5 mr-1" />
                Retard
              </ResponseButton>
              <ResponseButton
                active={myPresence.status === "absent"}
                activeClass="bg-red-600 text-white border-red-600 hover:bg-red-700"
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
  onUpdate,
}: {
  players: PlayerAttendanceRow[];
  isCoach: boolean;
  onUpdate: (userId: string, status: AttendanceStatus) => void;
}) {
  const present = players.filter((p) => p.status === "present" || p.status === "late");
  const absent = players.filter((p) => p.status === "absent");
  const excused = players.filter((p) => p.status === "excused");
  const waiting = players.filter((p) => p.status === null || p.status === "pending");
  const total = players.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-[var(--color-gold)]" />
          Présents et absents
          {total > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              — {present.length}/{total}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Aucun joueur actif
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
