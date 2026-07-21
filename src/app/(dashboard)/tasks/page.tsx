"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ListTodo } from "lucide-react";
import type { Task, Event, Profile } from "@/types";

interface TaskWithDetails extends Task {
  event?: Event;
  assignee?: Profile;
}

export default function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskWithDetails[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [players, setPlayers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", eventId: "", assignedTo: "" });

  const isCoach = user?.profile?.role === "coach";

  function fetchData() {
    const supabase = createClient();
    Promise.all([
      supabase.from("tasks").select("*, event:events(*), assignee:profiles!tasks_assigned_to_fkey(first_name, last_name)").order("created_at", { ascending: false }),
      supabase.from("events").select("*").order("event_date", { ascending: true }),
      supabase.from("profiles").select("*").eq("role", "player").eq("is_active", true).order("last_name"),
    ]).then(([tasksRes, eventsRes, playersRes]) => {
      setTasks((tasksRes.data as TaskWithDetails[]) || []);
      setEvents((eventsRes.data as Event[]) || []);
      setPlayers((playersRes.data as Profile[]) || []);
      setLoading(false);
    });
  }

  useEffect(() => { fetchData(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    await supabase.from("tasks").insert({
      title: form.title,
      description: form.description || null,
      event_id: form.eventId || events[0]?.id,
      assigned_to: form.assignedTo || null,
    });
    setAddOpen(false);
    setForm({ title: "", description: "", eventId: "", assignedTo: "" });
    fetchData();
  }

  async function toggleComplete(id: string, current: boolean) {
    const supabase = createClient();
    await supabase.from("tasks").update({ is_completed: !current }).eq("id", id);
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, is_completed: !current } : t));
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Taches</h2>
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  const pendingTasks = tasks.filter((t) => !t.is_completed);
  const completedTasks = tasks.filter((t) => t.is_completed);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Taches</h2>
          <p className="text-muted-foreground mt-1">Organisation des goûters, maillots et benevolat</p>
        </div>
        {isCoach && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger render={<Button className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold" />}>
              <Plus className="h-4 w-4 mr-1" />
              Tache
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nouvelle tache</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>Titre *</Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Assigner a</Label>
                  <Select value={form.assignedTo} onValueChange={(v) => setForm({ ...form, assignedTo: v ?? "" })}>
                    <SelectTrigger><SelectValue placeholder="Non assigne" /></SelectTrigger>
                    <SelectContent>
                      {players.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.first_name} {p.last_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold">Creer</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Pending Tasks */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-amber-500" />
            A faire ({pendingTasks.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pendingTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucune tache en cours</p>
          ) : (
            <div className="space-y-2">
              {pendingTasks.map((task) => (
                <div key={task.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <Checkbox checked={false} onCheckedChange={() => toggleComplete(task.id, false)} />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{task.title}</p>
                    {task.description && <p className="text-xs text-muted-foreground">{task.description}</p>}
                    {task.assignee && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Assigne a: {task.assignee.first_name} {task.assignee.last_name}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Completed Tasks */}
      {completedTasks.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-muted-foreground">
              Terminees ({completedTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {completedTasks.map((task) => (
                <div key={task.id} className="flex items-center gap-3 rounded-lg border p-3 opacity-60">
                  <Checkbox checked={true} onCheckedChange={() => toggleComplete(task.id, true)} />
                  <p className="text-sm line-through">{task.title}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
