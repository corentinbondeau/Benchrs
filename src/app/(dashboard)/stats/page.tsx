"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Leaderboard } from "@/components/stats/Leaderboard";

export default function StatsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Statistiques</h2>
        <p className="text-muted-foreground mt-1">
          Classements et performances de l&apos;équipe
        </p>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">Générales</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <Leaderboard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
