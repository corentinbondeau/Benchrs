"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Leaderboard } from "@/components/stats/Leaderboard";
import { PlayerProfile } from "@/components/stats/PlayerProfile";
import { CoachStats } from "@/components/stats/CoachStats";
import { SeasonReportCard } from "@/components/stats/SeasonReportCard";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";

export default function StatsPage() {
  const { user } = useAuth();
  const { userRole, clubMemberships, currentTeam } = useTeam();
  const isCoach = userRole === "coach" || userRole === "owner";
  const isComiteOnly = clubMemberships.length > 0 && userRole === null;
  const loading = currentTeam === undefined;

  if (loading) {
    return (
      <div className="section-gap">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="space-y-3 mt-4">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="section-gap">
      <div>
        <h1 className="text-2xl font-bold">Performance</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Classements et performances de l&apos;equipe
        </p>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="overflow-x-auto">
          <TabsTrigger value="general" className="shrink-0">Générales</TabsTrigger>
          {isCoach && <TabsTrigger value="coach" className="shrink-0">Coach</TabsTrigger>}
          {!isCoach && !isComiteOnly && <TabsTrigger value="me" className="shrink-0">Mon profil</TabsTrigger>}
        </TabsList>
        <TabsContent value="general">
          <Leaderboard />
        </TabsContent>
        {isCoach && (
          <TabsContent value="coach" className="space-y-4">
            {currentTeam?.id && (
              <SeasonReportCard teamId={currentTeam.id} isCoach={isCoach} />
            )}
            <CoachStats />
          </TabsContent>
        )}
        {!isCoach && !isComiteOnly && (
          <TabsContent value="me">
            {user?.id && <PlayerProfile playerId={user.id} />}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
