"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Leaderboard } from "@/components/stats/Leaderboard";
import { PlayerProfile } from "@/components/stats/PlayerProfile";
import { useAuth } from "@/lib/auth";

export default function StatsPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Statistiques</h2>
        <p className="text-muted-foreground mt-1">
          Classements et performances de l&apos;equipe
        </p>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">Generales</TabsTrigger>
          <TabsTrigger value="me">Mon profil</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <Leaderboard />
        </TabsContent>
        <TabsContent value="me">
          {user?.id && <PlayerProfile playerId={user.id} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
