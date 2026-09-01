interface Profile {
  id: string;
  [key: string]: unknown;
}

interface PlayerAttendanceRow {
  profile: Profile;
  status: "present" | "late" | "absent" | "excused" | "pending" | null;
}

export function filterPresentPlayers(
  allPlayers: Profile[],
  matchPlayers: PlayerAttendanceRow[]
): Profile[] {
  const presentIds = new Set(
    matchPlayers
      .filter((p) => p.status === "present" || p.status === "late")
      .map((p) => p.profile.id)
  );
  return allPlayers.filter((p) => presentIds.has(p.id));
}
