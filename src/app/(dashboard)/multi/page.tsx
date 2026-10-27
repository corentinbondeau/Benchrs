"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Users, MapPin, Trophy, ArrowRight, CheckCircle, XCircle, Clock, Bell, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { toast } from "sonner";

type TeamSummary = {
  team_id: string;
  team_name: string;
  events: any[];
  matchCount: number;
  trainingCount: number;
  attendances: Record<string, { present: number; late: number; absent: number; excused: number; total: number; noResponse: number }>;
  convocationsNoResponse: number;
};

export default function MultiTeamHomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { teams, switchTeam, currentTeam, userRole } = useTeam();
  const [summaries, setSummaries] = useState<TeamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState<string | null>(null);

  const isCoach = userRole === "coach" || userRole === "owner";
  const isMultiCoach = isCoach && teams.length > 1;

  useEffect(() => {
    if (isCoach === undefined || teams === undefined) return;
    if (!isMultiCoach) {
      router.replace("/");
    }
  }, [isCoach, teams, isMultiCoach, router]);

  const handleResendConvocations = async (eventId: string, teamId: string) => {
    setResending(eventId);
    try {
      const res = await fetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          type: "convocation",
          referenceId: eventId,
          sendToAll: true,
        }),
      });
      if (res.ok) {
        toast.success("Convocations relancées");
      } else {
        toast.error("Erreur lors du relancement");
      }
    } catch {
      toast.error("Erreur lors du relancement");
    } finally {
      setResending(null);
    }
  };

  useEffect(() => {
    if (!user?.id || !isMultiCoach) return;
    const supabase = createClient();
    
    async function load() {
      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay() + 1);
      startOfWeek.setHours(0,0,0,0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23,59,59,999);
      
      const results: TeamSummary[] = [];
      for (const team of teams) {
        const { data: evs } = await supabase
          .from("events")
          .select("id, title, type, event_date, opponent, location, status")
          .eq("team_id", team.id)
          .neq("status", "cancelled")
          .gte("event_date", startOfWeek.toISOString())
          .lte("event_date", endOfWeek.toISOString())
          .order("event_date", { ascending: true });
        
        const events = (evs || []) as any[];
        const eventIds = events.map((e: any) => e.id);
        
        let attendances: Record<string, { present: number; late: number; absent: number; excused: number; total: number; noResponse: number }> = {};
        let convocationsNoResponse = 0;
        
        if (eventIds.length > 0) {
          const { data: att } = await supabase
            .from("attendances")
            .select("event_id, status, user_id")
            .in("event_id", eventIds);
          
          const { data: players } = await supabase
            .from("team_members")
            .select("user_id")
            .eq("team_id", team.id)
            .eq("role", "player");
          
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id")
            .eq("team_id", team.id)
            .eq("is_active", true);
          
          const activePlayerIds = new Set((profiles || []).map((p: any) => p.id));
          const playerUserIds = new Set((players || []).filter((p: any) => activePlayerIds.has(p.user_id)).map((p: any) => p.user_id));
          const totalPlayers = playerUserIds.size;
          
          for (const ev of events) {
            const evAtt = (att || []).filter((a: any) => a.event_id === ev.id && playerUserIds.has(a.user_id));
            const present = evAtt.filter((a: any) => a.status === "present").length;
            const late = evAtt.filter((a: any) => a.status === "late").length;
            const absent = evAtt.filter((a: any) => a.status === "absent").length;
            const excused = evAtt.filter((a: any) => a.status === "excused").length;
            const responded = present + late + absent + excused;
            const noResponse = Math.max(0, totalPlayers - responded);
            attendances[ev.id] = { present, late, absent, excused, total: totalPlayers, noResponse };
            if (noResponse > 0) convocationsNoResponse += noResponse;
          }
        }
        
        results.push({
          team_id: team.id,
          team_name: team.name,
          events,
          matchCount: events.filter(e => e.type === "match").length,
          trainingCount: events.filter(e => e.type === "training").length,
          attendances,
          convocationsNoResponse,
        });
      }
      setSummaries(results);
      setLoading(false);
    }
    load();
  }, [user?.id, teams, isMultiCoach]);

  if (!isMultiCoach) {
    return <div className="p-6 text-center text-muted-foreground">Redirection...</div>;
  }

  if (loading) return <div className="p-6 text-center text-muted-foreground">Chargement...</div>;

  return (
    <div className="section-gap">
      <div>
        <h1 className="text-2xl font-bold">Récapitulatif de toutes mes équipes</h1>
        <p className="text-sm text-muted-foreground">Semaine en cours</p>
      </div>

      {summaries.map((summary) => (
        <Card key={summary.team_id}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-[var(--color-gold)]" />
                {summary.team_name}
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  localStorage.setItem("selectedTeamId", summary.team_id);
                  switchTeam(summary.team_id);
                  window.location.href = "/";
                }}
              >
                Aller à l'accueil équipe
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {summary.matchCount} match{summary.matchCount > 1 ? "s" : ""} • {summary.trainingCount} entraînement{summary.trainingCount > 1 ? "s" : ""}
            </p>
            {summary.convocationsNoResponse > 0 && (
              <div className="mt-2 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 px-2 py-1 rounded">
                <Bell className="h-3 w-3" />
                {summary.convocationsNoResponse} convocation{summary.convocationsNoResponse > 1 ? "s" : ""} sans réponse
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {summary.events.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Aucun événement cette semaine</p>
            ) : (
              summary.events.map((ev) => {
                const date = new Date(ev.event_date);
                const att = summary.attendances[ev.id];
                return (
                  <button
                    key={ev.id}
                    onClick={() => {
                      localStorage.setItem("selectedTeamId", summary.team_id);
                      const href = ev.type === "match" ? `/matches/${ev.id}` : `/trainings/${ev.id}`;
                      window.location.href = href;
                    }}
                    className="w-full text-left flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">
                        {ev.type === "match" 
                          ? ev.location && ev.location.toLowerCase().includes("domicile")
                            ? `Domicile vs ${ev.opponent || "?"}`
                            : ev.location && (ev.location.toLowerCase().includes("extérieur") || ev.location.toLowerCase().includes("exterieur"))
                              ? `Extérieur vs ${ev.opponent || "?"}`
                              : `Match vs ${ev.opponent || "?"}`
                          : ev.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} à {date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                      {ev.location && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3" /> {ev.location}
                        </p>
                      )}
                      {att && (
                        <div className="flex items-center justify-between mt-1">
                          <div className="flex items-center gap-3 text-xs">
                            <span className="flex items-center gap-1 text-green-600"><CheckCircle className="h-3 w-3" />{att.present}</span>
                            <span className="flex items-center gap-1 text-orange-600"><Clock className="h-3 w-3" />{att.late}</span>
                            <span className="flex items-center gap-1 text-red-600"><XCircle className="h-3 w-3" />{att.absent}</span>
                            <span className="flex items-center gap-1 text-gray-500"><Clock className="h-3 w-3" />{att.noResponse} sans rép.</span>
                          </div>
                          {att.noResponse > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-xs"
                              disabled={resending === ev.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleResendConvocations(ev.id, summary.team_id);
                              }}
                            >
                              <Send className="h-3 w-3 mr-1" />
                              {resending === ev.id ? "Envoi..." : "Relancer"}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${ev.type === "match" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                      {ev.type === "match" ? "Match" : "Entraînement"}
                    </span>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
