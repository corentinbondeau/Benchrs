"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Check, Clock, User } from "lucide-react";
import type { Task, Event, Profile } from "@/types";

interface TaskWithRelations extends Task {
  event?: Event;
  assignee?: Profile;
}

interface TaskPlanningBoardProps {
  refreshKey: number;
}

export function TaskPlanningBoard({ refreshKey }: TaskPlanningBoardProps) {
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function fetchTasks() {
      const { data } = await supabase
        .from("tasks")
        .select("*, event:events!tasks_event_id_fkey(id, title, event_date, type, status), assignee:profiles!tasks_assigned_to_fkey(id, first_name, last_name, avatar_url)")
        .order("created_at", { ascending: false });

      setTasks((data as TaskWithRelations[]) || []);
      setLoading(false);
    }

    fetchTasks();
  }, [refreshKey]);

  async function toggleComplete(taskId: string, current: boolean) {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isCompleted: !current }),
    });

    if (res.ok) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, is_completed: !current } : t
        )
      );
    }
  }

  const pendingTasks = tasks.filter((t) => !t.is_completed);
  const completedTasks = tasks.filter((t) => t.is_completed);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          En attente ({pendingTasks.length})
        </h3>
        {pendingTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Aucune tâche en attente
          </p>
        ) : (
          pendingTasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/30 transition-colors"
            >
              <Checkbox
                checked={false}
                onCheckedChange={() => toggleComplete(task.id, false)}
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{task.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {task.event && (
                    <Badge variant="secondary" className="text-[10px]">
                      <Clock className="h-2.5 w-2.5 mr-1" />
                      {task.event.title} —{" "}
                      {new Date(task.event.event_date).toLocaleDateString(
                        "fr-FR"
                      )}
                    </Badge>
                  )}
                  {task.description && (
                    <span className="text-xs text-muted-foreground truncate">
                      {task.description}
                    </span>
                  )}
                </div>
              </div>
              {task.assignee ? (
                <Avatar className="h-7 w-7 shrink-0">
                  <AvatarImage src={task.assignee.avatar_url || undefined} />
                  <AvatarFallback className="bg-[var(--royal)] text-[var(--royal-foreground)] text-[10px] font-bold">
                    {task.assignee.first_name[0]}
                    {task.assignee.last_name[0]}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </div>
          ))
        )}
      </div>

      {completedTasks.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Terminé ({completedTasks.length})
          </h3>
          {completedTasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-3 rounded-lg border p-3 opacity-60"
            >
              <Checkbox
                checked={true}
                onCheckedChange={() => toggleComplete(task.id, true)}
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm line-through">{task.title}</p>
              </div>
              {task.assignee && (
                <Avatar className="h-7 w-7 shrink-0">
                  <AvatarImage src={task.assignee.avatar_url || undefined} />
                  <AvatarFallback className="bg-[var(--royal)] text-[var(--royal-foreground)] text-[10px] font-bold">
                    {task.assignee.first_name[0]}
                    {task.assignee.last_name[0]}
                  </AvatarFallback>
                </Avatar>
              )}
              <Check className="h-4 w-4 text-green-500 shrink-0" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
