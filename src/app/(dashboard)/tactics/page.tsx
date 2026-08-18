"use client";

import dynamic from "next/dynamic";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClipboardList, Swords } from "lucide-react";

// Lazy-load heavy tab components to reduce initial bundle size
const SeanceTab = dynamic(() => import("./SeanceTab"), {
  loading: () => (
    <div className="flex h-48 items-center justify-center text-muted-foreground">
      Chargement...
    </div>
  ),
  ssr: false,
});

const FeuilletMatchTab = dynamic(() => import("./FeuilletMatchTab"), {
  loading: () => (
    <div className="flex h-48 items-center justify-center text-muted-foreground">
      Chargement...
    </div>
  ),
  ssr: false,
});

export default function TacticsPage() {
  return (
    <div className="section-gap">
      <div>
        <h1 className="text-2xl font-bold">Tactique & Séances</h1>
        <p className="text-sm mt-1 text-muted-foreground">
          Gestion des entraînements et compositions d&apos;équipe
        </p>
      </div>

      <Tabs defaultValue="seance" className="space-y-4">
        <TabsList className="overflow-x-auto">
          <TabsTrigger value="seance" className="shrink-0">
            <ClipboardList className="h-4 w-4 mr-1.5" />
            Séance
          </TabsTrigger>
          <TabsTrigger value="match" className="shrink-0">
            <Swords className="h-4 w-4 mr-1.5" />
            Feuillet Match
          </TabsTrigger>
        </TabsList>
        <TabsContent value="seance">
          <SeanceTab />
        </TabsContent>
        <TabsContent value="match">
          <FeuilletMatchTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
