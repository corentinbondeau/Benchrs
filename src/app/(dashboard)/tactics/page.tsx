"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PitchEditor } from "@/components/tactics/PitchEditor";
import { SessionEditor } from "@/components/tactics/SessionEditor";
import { MatchSheet } from "@/components/tactics/MatchSheet";
import { MatchLineupEditor } from "@/components/tactics/MatchLineupEditor";

export default function TacticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Tactique & Séances</h2>
        <p className="text-muted-foreground mt-1">
          Gestion des entraînements et compositions d&apos;équipe
        </p>
      </div>

      <Tabs defaultValue="lineup" className="space-y-4">
        <TabsList>
          <TabsTrigger value="lineup">Composition</TabsTrigger>
          <TabsTrigger value="pitch">Terrain</TabsTrigger>
          <TabsTrigger value="session">Séance</TabsTrigger>
          <TabsTrigger value="match">Feuillet match</TabsTrigger>
        </TabsList>
        <TabsContent value="lineup">
          <MatchLineupEditor />
        </TabsContent>
        <TabsContent value="pitch">
          <PitchEditor />
        </TabsContent>
        <TabsContent value="session">
          <SessionEditor />
        </TabsContent>
        <TabsContent value="match">
          <MatchSheet />
        </TabsContent>
      </Tabs>
    </div>
  );
}
