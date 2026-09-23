"use client";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { useQueryCache } from "@/lib/queryCache";
import { isEventLocked } from "@/lib/event-lock";
import { MatchNotebookForm } from "@/components/match/MatchNotebookForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Check } from "lucide-react";

interface NotebookMatch {
  id: string;
  event_date: string;
  end_date?: string | null;
  opponent: string | null;
  title: string | null;
  status?: string | null;
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

      const { data: events } = await supabase
        .from("events")
        .select("id, event_date, end_date, opponent, title, status")
        .eq("team_id", currentTeam.id)
        .eq("type", "match")
        .neq("status", "cancelled")
        .lt("event_date", new Date().toISOString())
        .order("event_date", { ascending: false })
        .limit(10);

      const pastMatches = ((events || []) as unknown as NotebookMatch[]).filter((e) =>
        isEventLocked(e.event_date, e.end_date)
      );
      if (pastMatches.length === 0) return null;

      const eventIds = pastMatches.map((m) => m.id);

      const { data: entriesRes } = await supabase
        .from("player_notebook_entries")
        .select("event_id")
        .eq("player_id", user.id)
        .in("event_id", eventIds);

      const editedIds = new Set(
        (entriesRes || []).map((e) => e.event_id as string)
      );

      const match = pastMatches.find((m) => !editedIds.has(m.id));
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
          eventId={match.id}
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