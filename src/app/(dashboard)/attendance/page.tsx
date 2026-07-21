"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, Clock, UserCheck } from "lucide-react";
import type { Attendance, Event, Profile } from "@/types";

interface AttendanceWithDetails extends Attendance {
  event?: Event;
  profile?: Profile;
}

export default function AttendancePage() {
  const { user } = useAuth();
  const [attendances, setAttendances] = useState<AttendanceWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "training" | "match">("all");
  const isCoach = user?.profile?.role === "coach";

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("attendances")
      .select("*, event:events!attendances_event_id_fkey(*), profile:profiles!attendances_user_id_fkey(first_name, last_name)")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setAttendances((data as AttendanceWithDetails[]) || []);
        setLoading(false);
      });
  }, []);

  async function updateStatus(attendanceId: string, status: "present" | "absent" | "late") {
    const supabase = createClient();
    await supabase.from("attendances").update({ status, responded_at: new Date().toISOString() }).eq("id", attendanceId);
    setAttendances((prev) =>
      prev.map((a) => (a.id === attendanceId ? { ...a, status } : a))
    );
  }

  const filtered = attendances.filter((a) => {
    if (filter === "all") return true;
    return a.event?.type === filter;
  });

  const statusColors: Record<string, string> = {
    present: "bg-green-100 text-green-700",
    absent: "bg-red-100 text-red-700",
    late: "bg-amber-100 text-amber-700",
    excused: "bg-blue-100 text-blue-700",
    pending: "bg-gray-100 text-gray-700",
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Presences</h2>
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Presences</h2>
        <p className="text-muted-foreground mt-1">Suivi des presences aux entrainements et matchs</p>
      </div>

      <Tabs defaultValue="all" onValueChange={(v) => setFilter((v ?? "all") as typeof filter)}>
        <TabsList>
          <TabsTrigger value="all">Tous</TabsTrigger>
          <TabsTrigger value="training">Entrainements</TabsTrigger>
          <TabsTrigger value="match">Matchs</TabsTrigger>
        </TabsList>
        <TabsContent value={filter}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <UserCheck className="h-4 w-4" />
                {filtered.length} enregistrement{filtered.length > 1 ? "s" : ""}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Aucune presence enregistree
                </p>
              ) : (
                <div className="space-y-2">
                  {filtered.map((att) => (
                    <div key={att.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {att.profile?.first_name} {att.profile?.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {att.event?.title} - {new Date(att.event?.event_date || "").toLocaleDateString("fr-FR")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={statusColors[att.status] || "bg-gray-100"}>
                          {att.status === "present" ? "Present" :
                           att.status === "absent" ? "Absent" :
                           att.status === "late" ? "En retard" :
                           att.status === "excused" ? "Excuse" : "En attente"}
                        </Badge>
                        {isCoach && att.status === "pending" && (
                          <div className="flex gap-1">
                            <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateStatus(att.id, "present")}>
                              <Check className="h-3 w-3 text-green-600" />
                            </Button>
                            <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateStatus(att.id, "late")}>
                              <Clock className="h-3 w-3 text-amber-600" />
                            </Button>
                            <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateStatus(att.id, "absent")}>
                              <X className="h-3 w-3 text-red-600" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
