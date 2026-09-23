"use client";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { useQueryCache } from "@/lib/queryCache";
import { MatchNotebookForm } from "@/components/match/MatchNotebookForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Check } from "lucide-react";

interface NotebookMatch {
  event_id: string;
  event_date: string;
  opponent: string | null;
  title: string | null;
  status: string;
}

interface PromptData {
  match: NotebookMatch;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1)
    .toString()
    .padStart(2, "0")}/${d.getFullYear()}`;
}

export function MatchNotebookPrompt() {
  const { user } = useAuth();
  const { currentTeam } = useTeam();

  const key =
    currentTeam && user?.id ? `match-notebook:${currentTeam.id}:${user.id}` : null;

  const { data, revalidate } = useQueryCache<PromptData | null>(
    key,
    async () => {
      if (!currentTeam || !user?.id) return null;
      const supabase = createClient();

      const { data: stats } = await supabase
        .from("match_stats")
        .select("event_id")
        .eq("player_id", user.id)
        .eq("team_id", currentTeam.id);

      const eventIds = (stats || []).map((s) => s.event_id as string);
      if (eventIds.length === 0) return null;

      const { data: events } = await supabase
        .from("events")
        .select("id, event_date, opponent, title, status")
        .in("id", eventIds)
        .eq("status", "completed")
        .order("event_date", { ascending: false });

      const matches = (events || []) as unknown as NotebookMatch[];
      if (matches.length === 0) return null;

      const { data: entries } = await supabase
        .from("player_notebook_entries")
        .select("event_id")
        .eq("player_id", user.id)
        .in("event_id", matches.map((m) => m.event_id));

      const editedIds = new Set((entries || []).map((e) => e.event_id as string));
      const match = matches.find((m) => !editedIds.has(m.event_id));
      if (!match) return null;

      return { match };
    },
    { ttl: 60_000 }
  );

  if (!currentTeam || !user?.id || !data) return null;

  const { match } = data;
  const title = match.opponent || match.title || "Match";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-[var(--color-gold)]" />
          Raconte ton match
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatDate(match.event_date)} · Ton carnet de match t&apos;attend
          </p>
        </div>
        <MatchNotebookForm
          playerId={user.id}
          teamId={currentTeam.id}
          eventId={match.event_id}
          onSaved={() => revalidate()}
        />
        <button
          type="button"
          onClick={() => revalidate()}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Check className="h-3.5 w-3.5" />
          Déjà répondu ?
        </button>
      </CardContent>
    </Card>
  );
}