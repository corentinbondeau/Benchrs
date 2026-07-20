"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Clock, HelpCircle } from "lucide-react";
import type { AttendanceStatus } from "@/types";

interface AttendanceToggleProps {
  attendanceId: string;
  currentStatus: AttendanceStatus;
  onStatusChange: (newStatus: AttendanceStatus) => void;
}

const statusConfig: Record<
  AttendanceStatus,
  { label: string; color: string; icon: React.ElementType }
> = {
  present: {
    label: "Présent",
    color: "bg-green-100 text-green-700 border-green-200",
    icon: Check,
  },
  absent: {
    label: "Absent",
    color: "bg-red-100 text-red-700 border-red-200",
    icon: X,
  },
  late: {
    label: "En retard",
    color: "bg-amber-100 text-amber-700 border-amber-200",
    icon: Clock,
  },
  excused: {
    label: "Excusé",
    color: "bg-blue-100 text-blue-700 border-blue-200",
    icon: HelpCircle,
  },
  pending: {
    label: "En attente",
    color: "bg-gray-100 text-gray-700 border-gray-200",
    icon: HelpCircle,
  },
};

export function AttendanceToggle({
  attendanceId,
  currentStatus,
  onStatusChange,
}: AttendanceToggleProps) {
  const { data: session } = useSession();
  const isCoach = session?.user?.role === "coach";
  const [updating, setUpdating] = useState(false);

  async function updateStatus(status: AttendanceStatus) {
    if (!isCoach) return;
    setUpdating(true);

    const supabase = createClient();
    await supabase
      .from("attendances")
      .update({
        status,
        responded_at: new Date().toISOString(),
      })
      .eq("id", attendanceId);

    onStatusChange(status);
    setUpdating(false);
  }

  if (!isCoach) {
    const config = statusConfig[currentStatus];
    return (
      <Badge variant="outline" className={config.color}>
        <config.icon className="h-3 w-3 mr-1" />
        {config.label}
      </Badge>
    );
  }

  return (
    <div className="flex gap-1">
      {(["present", "late", "absent", "excused"] as const).map((status) => {
        const config = statusConfig[status];
        const isActive = currentStatus === status;
        return (
          <Button
            key={status}
            size="icon"
            variant={isActive ? "default" : "outline"}
            className={`h-7 w-7 ${
              isActive ? config.color : ""
            }`}
            onClick={() => updateStatus(status)}
            disabled={updating}
            title={config.label}
          >
            <config.icon className="h-3.5 w-3.5" />
          </Button>
        );
      })}
    </div>
  );
}
