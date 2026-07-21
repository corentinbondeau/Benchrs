"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function TacticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Tactique & Seances</h2>
        <p className="text-muted-foreground mt-1">Gestion des entrainements et compositions d&apos;equipe</p>
      </div>

      <Tabs defaultValue="pitch" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pitch">Terrain</TabsTrigger>
          <TabsTrigger value="session">Seance</TabsTrigger>
          <TabsTrigger value="match">Feuillet match</TabsTrigger>
        </TabsList>
        <TabsContent value="pitch">
          <div className="flex h-96 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
            <div className="text-center">
              <p className="text-lg">Editeur de terrain</p>
              <p className="text-sm mt-1">Bientot disponible</p>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="session">
          <div className="flex h-96 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
            <div className="text-center">
              <p className="text-lg">Editeur de seance</p>
              <p className="text-sm mt-1">Bientot disponible</p>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="match">
          <div className="flex h-96 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
            <div className="text-center">
              <p className="text-lg">Feuillet de match</p>
              <p className="text-sm mt-1">Bientot disponible</p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
