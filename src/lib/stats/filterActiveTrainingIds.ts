type EventForFilter = { id: string; type: string; status: string };

export function filterActiveTrainingIds(events: EventForFilter[]): string[] {
  return events
    .filter((e) => e.type === "training" && e.status !== "cancelled")
    .map((e) => e.id);
}
