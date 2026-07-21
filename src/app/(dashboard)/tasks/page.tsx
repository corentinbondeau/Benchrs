"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { TaskPlanningBoard } from "@/components/tasks/TaskPlanningBoard";
import { TaskAssignmentDialog } from "@/components/tasks/TaskAssignmentDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { Event } from "@/types";

export default function TasksPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    async function fetchEvents() {
      const { data } = await supabase
        .from("events")
        .select("*")
        .order("event_date", { ascending: true });
      setEvents((data as Event[]) || []);
    }
    fetchEvents();
  }, []);

  function handleSaved() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Planning des tâches</h2>
          <p className="text-muted-foreground mt-1">
            Organisation des goûters, maillots et bénévolat
          </p>
        </div>
        <RoleGuard allowedRoles={["coach"]}>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger
              render={
                <Button className="bg-[var(--gold)] text-[var(--gold-foreground)] hover:bg-[var(--gold)]/90" />
              }
            >
              <Plus className="h-4 w-4 mr-1" />
              Nouvelle tâche
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Créer une tâche</DialogTitle>
              </DialogHeader>
              <TaskAssignmentDialog
                events={events}
                onClose={() => setDialogOpen(false)}
                onSaved={handleSaved}
              />
            </DialogContent>
          </Dialog>
        </RoleGuard>
      </div>

      <TaskPlanningBoard refreshKey={refreshKey} />
    </div>
  );
}
