import { authFetch } from "@/lib/api-client";

export async function computeTravelTime(
  teamId: string,
  destination: string,
  origin?: string
): Promise<number | null> {
  if (!destination.trim()) return null;
  try {
    const res = await authFetch("/api/travel-time", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId, destination, origin }),
    });
    const data = (await res.json()) as { minutes?: number };
    if (!res.ok) return null;
    return typeof data.minutes === "number" ? data.minutes : null;
  } catch {
    return null;
  }
}

export function formatTravelTime(minutes: number | null | undefined): string | null {
  if (minutes == null) return null;
  if (minutes < 60) return `~${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `~${h}h` : `~${h}h${String(m).padStart(2, "0")}`;
}
