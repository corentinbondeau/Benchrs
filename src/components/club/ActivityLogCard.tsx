"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { History, ClipboardList, UserCheck, FileText, Zap, Megaphone } from "lucide-react";
import { activityActionLabel } from "@/lib/activity";
import type { ActivityLog } from "@/types";

const ACTION_ICONS: Record<string, typeof Zap> = {
  "match.score": Zap,
  "attendance.update": UserCheck,
  "match.report": FileText,
  "match.event": Zap,
  "event.convocation": Megaphone,
};

interface LogRow extends ActivityLog {
  actor: { id: string; first_name: string; last_name: string } | null;
  team: { id: string; name: string; color_primary: string | null } | null;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "hier";
  return `il y a ${days} j`;
}

export function ActivityLogCard({ clubId }: { clubId: string }) {
  const [logs, setLogs] = useState<LogRow[] | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from("activity_logs")
        .select(
          "id, club_id, team_id, user_id, action_type, description, metadata, created_at, actor:profiles!activity_logs_user_id_fkey(id, first_name, last_name), team:teams(id, name, color_primary)"
        )
        .eq("club_id", clubId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (!cancelled) setLogs((data || []) as unknown as LogRow[]);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  if (!logs) return null;

  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-3">
          <History className="h-3.5 w-3.5" />
          Journal d&apos;activité du club
        </p>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Aucune activité récente pour le moment.
          </p>
        ) : (
          <ScrollArea className="w-full whitespace-nowrap rounded-md">
            <div className="flex gap-2 pb-2">
              {logs.map((log) => {
                const Icon = ACTION_ICONS[log.action_type] || ClipboardList;
                const color = log.team?.color_primary || "#64748b";
                return (
                  <div
                    key={log.id}
                    className="inline-flex flex-col gap-1 rounded-lg border p-3 w-64 shrink-0"
                  >
                    <div className="flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {activityActionLabel(log.action_type)}
                      </span>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {timeAgo(log.created_at)}
                      </span>
                    </div>
                    <p className="text-xs font-medium leading-snug text-foreground">
                      {log.description}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-[10px] text-muted-foreground truncate">
                        {log.team?.name}
                      </span>
                      {log.actor && (
                        <span className="text-[10px] text-muted-foreground truncate">
                          · {log.actor.first_name} {log.actor.last_name}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
