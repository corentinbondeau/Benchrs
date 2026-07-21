"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AttendanceTable } from "@/components/attendance/AttendanceTable";
import { SyncPanel } from "@/components/attendance/SyncPanel";

export default function AttendancePage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Présences</h2>
        <p className="text-muted-foreground mt-1">
          Suivi des présences aux entraînements et matchs
        </p>
      </div>

      <SyncPanel />

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">Tous</TabsTrigger>
          <TabsTrigger value="training">Entraînements</TabsTrigger>
          <TabsTrigger value="match">Matchs</TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <AttendanceTable />
        </TabsContent>
        <TabsContent value="training">
          <AttendanceTable eventType="training" />
        </TabsContent>
        <TabsContent value="match">
          <AttendanceTable eventType="match" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
