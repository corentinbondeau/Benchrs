import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureAttendanceRows } from "@/lib/convocations";

export interface AutoConvocationResult {
  eventsProcessed: number;
  notificationsCreated: number;
}

/**
 * Crée automatiquement les convocations pour les événements dont `event_date`
 * tombe dans la fenêtre `[now, now + convocation_lead_days]` ET dont
 * `convocations_sent_at IS NULL`.
 *
 * Pour chaque événement trouvé :
 *   1. Récupère les joueurs actifs de l'équipe + leurs parents
 *   2. Insère des notifications de type "convocation" (livrées immédiatement par le delivery)
 *   3. Appelle ensureAttendanceRows pour créer les lignes attendance
 *   4. Met à jour convocations_sent_at sur l'événement (dedup — idempotent)
 */
export async function createAutoConvocations(
  supabase: SupabaseClient
): Promise<AutoConvocationResult> {
  const now = new Date();
  const nowIso = now.toISOString();

  // Fenêtre maximale de convocation : on récupère tous les événements dont
  // convocation_lead_days > 0 et event_date dans [now, now + max_window].
  // On filtre ensuite par la vraie fenêtre calculée par chaque événement.
  // Pour simplifier et rester idempotent, on utilise un large horizon (30 jours)
  // puis on filtre en JS selon le convocation_lead_days de chaque événement.
  const maxWindow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Récupérer les événements à convoquer :
  // - event_date dans la fenêtre [now, now + 30j]
  // - convocations_sent_at IS NULL
  // - convocation_lead_days > 0 (filtré en JS)
  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("id, team_id, type, title, event_date, convocation_lead_days, convocations_sent_at")
    .is("convocations_sent_at", null)
    .gte("event_date", nowIso)
    .lte("event_date", maxWindow.toISOString());

  if (eventsError || !events || events.length === 0) {
    return { eventsProcessed: 0, notificationsCreated: 0 };
  }

  type EventRow = {
    id: string;
    team_id: string | null;
    type: string;
    title: string;
    event_date: string;
    convocation_lead_days: number | null;
    convocations_sent_at: string | null;
  };

  // Filtrer les événements dans leur fenêtre propre
  const toProcess = (events as EventRow[]).filter((ev) => {
    const leadDays = ev.convocation_lead_days;
    if (!leadDays || leadDays <= 0) return false;
    if (!ev.team_id) return false;

    const eventDate = new Date(ev.event_date);
    const windowEnd = new Date(now.getTime() + leadDays * 24 * 60 * 60 * 1000);

    // L'événement doit être dans la fenêtre [now, now + leadDays]
    return eventDate <= windowEnd;
  });

  if (toProcess.length === 0) {
    return { eventsProcessed: 0, notificationsCreated: 0 };
  }

  let eventsProcessed = 0;
  let notificationsCreated = 0;

  for (const ev of toProcess) {
    const teamId = ev.team_id!;

    // 1. Récupérer les joueurs actifs de l'équipe
    const { data: members } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("team_id", teamId)
      .in("role", ["player"]);

    const playerIds = (members || []).map((m: { user_id: string }) => m.user_id);
    if (playerIds.length === 0) {
      // Pas de joueurs → on marque quand même l'événement pour ne pas reboucler
      await supabase
        .from("events")
        .update({ convocations_sent_at: nowIso })
        .eq("id", ev.id);
      eventsProcessed++;
      continue;
    }

    // 2. Filtrer les joueurs actifs (order: select → eq → in pour coller au mock)
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id")
      .eq("is_active", true)
      .in("id", playerIds);

    const activeIds = (profiles || []).map((p: { id: string }) => p.id);

    // 3. Récupérer les parents des joueurs actifs
    const parentLinks = activeIds.length > 0
      ? await supabase
          .from("parent_student")
          .select("parent_id, student_id")
          .in("student_id", activeIds)
      : { data: [] };

    const parentIds = [
      ...new Set(
        ((parentLinks.data || []) as { parent_id: string; student_id: string }[]).map(
          (l) => l.parent_id
        )
      ),
    ];

    // Liste complète des destinataires (joueurs actifs + parents)
    const allUserIds = [...new Set([...activeIds, ...parentIds])];

    if (allUserIds.length === 0) {
      await supabase
        .from("events")
        .update({ convocations_sent_at: nowIso })
        .eq("id", ev.id);
      eventsProcessed++;
      continue;
    }

    // 4. Dedup : vérifier les notifications déjà créées pour cet événement
    const { data: existingNotifs } = await supabase
      .from("notifications")
      .select("id")
      .eq("type", "convocation")
      .in("reference_id", [ev.id]);

    const hasExisting = existingNotifs && existingNotifs.length > 0;

    // Si des notifications existent déjà pour cet événement, on saute l'insertion
    // mais on met quand même à jour convocations_sent_at (dedup complet)
    if (!hasExisting) {
      // 5. Insérer les notifications de type "convocation"
      const isMatch = ev.type === "match";
      const eventDate = new Date(ev.event_date);
      const dateLabel = eventDate.toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
      const hour = eventDate.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      });

      const rows = allUserIds.map((uid: string) => ({
        user_id: uid,
        team_id: teamId,
        type: "convocation",
        title: isMatch ? "Convocation pour un match" : "Convocation pour un entraînement",
        body: `${isMatch ? "Match" : "Entraînement"} le ${dateLabel} à ${hour}`,
        reference_id: ev.id,
        url: isMatch ? `/matches/${ev.id}` : `/trainings/${ev.id}`,
        scheduled_for: nowIso,
      }));

      const { error: insertError } = await supabase
        .from("notifications")
        .insert(rows);

      if (!insertError) {
        notificationsCreated += rows.length;
      }
    }

    // 6. Créer les lignes attendance (ensureAttendanceRows gère le dedup interne)
    await ensureAttendanceRows(ev.id, teamId, activeIds);

    // 7. Marquer l'événement comme convoqué
    await supabase
      .from("events")
      .update({ convocations_sent_at: nowIso })
      .eq("id", ev.id);

    eventsProcessed++;
  }

  return { eventsProcessed, notificationsCreated };
}
