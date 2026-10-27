"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Users, MapPin, Trophy, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type TeamSummary = {
  team_id: string;
  team_name: string;
  events: any[];
  matchCount: number;
  trainingCount: number;
};

export default function MultiTeamHomePage() {
  const { user } = useAuth();
  const { teams, switchTeam, currentTeam } = useTeam();
  const [summaries, setSummaries] = useState<TeamSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
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
          .gte("event_date", startOfWeek.toISOString())
          .lte("event_date", endOfWeek.toISOString())
          .order("event_date", { ascending: true });
        
        const events = (evs || []) as any[];
        results.push({
          team_id: team.id,
          team_name: team.name,
          events,
          matchCount: events.filter(e => e.type === "match").length,
          trainingCount: events.filter(e => e.type === "training").length,
        });
      }
      setSummaries(results);
      setLoading(false);
    }
    load();
  }, [user?.id, teams]);

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
          </CardHeader>
          <CardContent className="space-y-2">
            {summary.events.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Aucun événement cette semaine</p>
            ) : (
              summary.events.map((ev) => {
                const date = new Date(ev.event_date);
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
                        {ev.type === "match" ? `Match vs ${ev.opponent || "?"}` : ev.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} à {date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                      {ev.location && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3" /> {ev.location}
                        </p>
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
