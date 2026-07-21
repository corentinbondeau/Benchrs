import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { auth } from "@/lib/auth/config";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "coach") {
    return NextResponse.json({ error: "Accès restreint aux coachs" }, { status: 403 });
  }

  const supabase = await createClient();

  const { data: players } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "player")
    .eq("is_active", true)
    .order("last_name");

  if (!players || players.length === 0) {
    return new NextResponse("Aucun joueur", { status: 404 });
  }

  // Get stats for each player
  const playerIds = players.map((p) => p.id);
  const { data: allStats } = await supabase
    .from("match_stats")
    .select("player_id, goals, assists, yellow_cards, red_cards, minutes_played")
    .in("player_id", playerIds);

  const { data: allAttendances } = await supabase
    .from("attendances")
    .select("user_id, status")
    .in("user_id", playerIds);

  // Aggregate stats
  const statsMap: Record<string, { goals: number; assists: number; yellows: number; reds: number; minutes: number; total: number; present: number }> = {};
  for (const p of players) {
    statsMap[p.id] = { goals: 0, assists: 0, yellows: 0, reds: 0, minutes: 0, total: 0, present: 0 };
  }

  for (const s of allStats || []) {
    if (statsMap[s.player_id]) {
      statsMap[s.player_id].goals += s.goals || 0;
      statsMap[s.player_id].assists += s.assists || 0;
      statsMap[s.player_id].yellows += s.yellow_cards || 0;
      statsMap[s.player_id].reds += s.red_cards || 0;
      statsMap[s.player_id].minutes += s.minutes_played || 0;
    }
  }

  for (const a of allAttendances || []) {
    if (statsMap[a.user_id]) {
      statsMap[a.user_id].total += 1;
      if (a.status === "present" || a.status === "late") {
        statsMap[a.user_id].present += 1;
      }
    }
  }

  // Build CSV
  const headers = ["Nom", "Prénom", "Numéro", "Poste", "Téléphone", "Buts", "Passes", "Jaunes", "Rouges", "Minutes", "Présence (%)"];
  const rows = players.map((p) => {
    const s = statsMap[p.id];
    const attendance = s.total > 0 ? Math.round((s.present / s.total) * 100) : 0;
    return [
      p.last_name,
      p.first_name,
      p.shirt_number || "",
      p.position || "",
      p.phone || "",
      s.goals,
      s.assists,
      s.yellows,
      s.reds,
      s.minutes,
      `${attendance}%`,
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="effectif_sportplus_${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
