"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Leaderboard } from "@/components/stats/Leaderboard";
import { PlayerProfile } from "@/components/stats/PlayerProfile";
import { CoachStats } from "@/components/stats/CoachStats";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";

export default function StatsPage() {
  const { user } = useAuth();
  const { userRole } = useTeam();
  const isCoach = userRole === "coach" || userRole === "owner";

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      <div>
        <h2 className="text-xl md:text-2xl font-bold">Statistiques</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Classements et performances de l&apos;équipe
        </p>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="overflow-x-auto">
          <TabsTrigger value="general" className="shrink-0">Générales</TabsTrigger>
          {isCoach && <TabsTrigger value="coach" className="shrink-0">Coach</TabsTrigger>}
          {!isCoach && <TabsTrigger value="me" className="shrink-0">Mon profil</TabsTrigger>}
        </TabsList>
        <TabsContent value="general">
          <Leaderboard />
        </TabsContent>
        {isCoach && (
          <TabsContent value="coach">
            <CoachStats />
          </TabsContent>
        )}
        {!isCoach && (
          <TabsContent value="me">
            {user?.id && <PlayerProfile playerId={user.id} />}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
