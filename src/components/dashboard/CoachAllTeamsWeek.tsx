"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Users, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";

type EventItem = {
  id: string;
  title: string;
  type: string;
  event_date: string;
  team_id: string;
  team_name: string;
  opponent: string | null;
  location: string | null;
  present_count: number;
  total_count: number;
};

export function CoachAllTeamsWeek() {
  const { user } = useAuth();
  const { currentTeam } = useTeam();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    const supabase = createClient();
    
    async function load() {
      // Get all teams where user is coach/owner
      const { data: memberships } = await supabase
        .from("team_members")
        .select("team_id, role")
        .eq("user_id", user!.id)
        .in("role", ["coach", "owner"]);
      
      if (!memberships || memberships.length === 0) {
        setLoading(false);
        return;
      }
      
      const teamIds = memberships.map(m => m.team_id);
      const { data: teams } = await supabase.from("teams").select("id, name").in("id", teamIds);
      const teamMap = new Map((teams || []).map(t => [t.id, t.name]));
      
      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay() + 1);
      startOfWeek.setHours(0,0,0,0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23,59,59,999);
      
      const { data: evs } = await supabase
        .from("events")
        .select("id, title, type, event_date, team_id, opponent, location")
        .in("team_id", teamIds)
        .gte("event_date", startOfWeek.toISOString())
        .lte("event_date", endOfWeek.toISOString())
        .order("event_date", { ascending: true });
      
      const items: EventItem[] = [];
      for (const ev of (evs || []) as any[]) {
        const { count: present } = await supabase
          .from("attendances")
          .select("*", { count: "exact", head: true })
          .eq("event_id", ev.id)
          .in("status", ["present", "late"]);
        const { count: total } = await supabase
          .from("attendances")
          .select("*", { count: "exact", head: true })
          .eq("event_id", ev.id);
        
        items.push({
          id: ev.id,
          title: ev.title,
          type: ev.type,
          event_date: ev.event_date,
          team_id: ev.team_id,
          team_name: teamMap.get(ev.team_id) || "",
          opponent: ev.opponent,
          location: ev.location,
          present_count: present || 0,
          total_count: total || 0,
        });
      }
      setEvents(items);
      setLoading(false);
    }
    load();
  }, [user?.id]);

  if (loading) return null;
  if (events.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calendar className="h-5 w-5 text-[var(--color-primary-blue)]" />
          Semaine de toutes mes équipes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {events.map((ev) => {
          const href = ev.type === "match" ? `/matches/${ev.id}` : `/trainings/${ev.id}`;
          const date = new Date(ev.event_date);
          return (
            <button
              key={ev.id}
              onClick={() => {
                if (ev.team_id !== currentTeam?.id) {
                  try {
                    localStorage.setItem("selectedTeamId", ev.team_id);
                  } catch {}
                  // Force reload to switch team
                  window.location.href = href;
                  return;
                }
                window.location.href = href;
              }}
              className="w-full text-left flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{ev.team_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} {date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p className="font-medium text-sm mt-1 truncate">
                  {ev.type === "match" ? `Match vs ${ev.opponent || "?"}` : ev.title}
                </p>
                {ev.location && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3" /> {ev.location}
                  </p>
                )}
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className={ev.present_count >= ev.total_count * 0.7 ? "text-green-600" : "text-orange-600"}>
                    {ev.present_count}/{ev.total_count}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">présents</p>
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
