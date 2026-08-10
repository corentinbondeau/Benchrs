import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureAttendanceRows } from "@/lib/convocations";
import webpush from "@/lib/webpush";
import { currentSeasonLabel, seasonDateRange } from "@/lib/goals";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // --- Rappels la veille : planifie une notif « demain » pour chaque événement du lendemain ---
  const startTomorrow = new Date();
  startTomorrow.setHours(0, 0, 0, 0);
  startTomorrow.setDate(startTomorrow.getDate() + 1);
  const endTomorrow = new Date(startTomorrow);
  endTomorrow.setDate(endTomorrow.getDate() + 1);

  const { data: tomorrowEvents } = await supabase
    .from("events")
    .select("id, team_id, type, title, opponent, event_date")
    .eq("status", "upcoming")
    .gte("event_date", startTomorrow.toISOString())
    .lt("event_date", endTomorrow.toISOString());

  for (const ev of (tomorrowEvents || []) as { id: string; team_id: string | null; type: string; title: string; opponent: string | null; event_date: string }[]) {
    if (!ev.team_id) continue;
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("type", "rappel")
      .eq("reference_id", ev.id)
      .limit(1)
      .maybeSingle();
    if (existing) continue;

    const { data: members } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("team_id", ev.team_id)
      .in("role", ["player"]);
    const playerIds = (members || []).map((m) => m.user_id);
    if (playerIds.length === 0) continue;

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id")
      .in("id", playerIds)
      .eq("is_active", true);
    const activeIds = (profiles || []).map((p) => p.id);
    if (activeIds.length === 0) continue;

    const { data: links } = await supabase
      .from("parent_student")
      .select("parent_id")
      .eq("team_id", ev.team_id)
      .in("student_id", activeIds);
    const parentIds = [...new Set((links || []).map((l) => (l as { parent_id: string }).parent_id))];
    const userIds = [...new Set([...activeIds, ...parentIds])];

    const dateLabel = new Date(ev.event_date).toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    const hour = new Date(ev.event_date).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const isMatch = ev.type === "match";

    const rows = userIds.map((uid: string) => ({
      user_id: uid,
      team_id: ev.team_id,
      type: "rappel",
      title: isMatch ? "Match demain !" : "Entraînement demain",
      body: `Demain ${dateLabel} à ${hour}${isMatch && ev.opponent ? ` contre ${ev.opponent}` : ""}`,
      reference_id: ev.id,
      url: isMatch ? `/matches/${ev.id}` : `/trainings/${ev.id}`,
      scheduled_for: now,
    }));
    const { error: insertErr } = await supabase.from("notifications").insert(rows);
    if (insertErr) {
      console.error("[notifications/cron] rappel insert error:", insertErr);
    }
  }

  // --- Digest hebdomadaire : envoyé chaque lundi (résumé résultats + prochain match + séances) ---
  if (new Date().getDay() === 1) {
    await sendWeeklyDigest(supabase, now);
  }

  // --- Alertes d'échéances : licences, certificats médicaux, cotisations (fenêtre 30 jours) ---
  await sendExpiryAlerts(supabase, now);

  // --- Relances auto de convocation (joueurs sans réponse) ---
  await sendAttendanceReminders(supabase, now);

  // --- Alerte équité du temps de jeu (hebdomadaire, lundi) ---
  if (new Date().getDay() === 1) {
    await sendPlayingTimeAlerts(supabase, now);
  }

  // --- Félicitations auto : anniversaires, premier but, 50e match ---
  await sendCongrats(supabase, now);

  const { data: pending } = await supabase
    .from("notifications")
    .select("id, user_id, title, body, type, reference_id, team_id, url")
    .lte("scheduled_for", now)
    .is("delivered_at", null)
    .limit(500);

  if (!pending || pending.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, processed: 0 });
  }

  const userIds = [...new Set(pending.map((n) => n.user_id))];

  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("user_id, team_id, type, push_enabled")
    .in("user_id", userIds);

  const prefMap = new Map<string, boolean>();
  for (const p of (prefs || []) as { user_id: string; team_id: string; type: string; push_enabled: boolean }[]) {
    prefMap.set(`${p.user_id}|${p.team_id}|${p.type}`, p.push_enabled);
  }

  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth")
    .in("user_id", userIds);

  const subsByUser = new Map<string, { endpoint: string; p256dh: string; auth: string }[]>();
  for (const s of (subscriptions || []) as { user_id: string; endpoint: string; p256dh: string; auth: string }[]) {
    const arr = subsByUser.get(s.user_id) || [];
    arr.push({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth });
    subsByUser.set(s.user_id, arr);
  }

  // Resolve target URL for notifications without a stored one (older rows):
  // fetch the event type so the click opens the séance/match page.
  const refIds = [
    ...new Set(
      pending
        .filter((n) => !n.url && n.reference_id)
        .map((n) => n.reference_id as string)
    ),
  ];
  const eventTypeMap = new Map<string, string>();
  if (refIds.length > 0) {
    const { data: events } = await supabase
      .from("events")
      .select("id, type")
      .in("id", refIds);
    for (const evt of (events || []) as { id: string; type: string }[]) {
      eventTypeMap.set(evt.id, evt.type);
    }
  }

  function resolveUrl(notif: { url?: string | null; type?: string | null; reference_id?: string | null }): string {
    if (notif.url) return notif.url;
    if (notif.reference_id) {
      const type = eventTypeMap.get(notif.reference_id);
      if (type === "match") return `/matches/${notif.reference_id}`;
      if (type === "training") return `/trainings/${notif.reference_id}`;
      if (notif.type === "convocation") return "/calendar";
    }
    return "/";
  }

  let sent = 0;
  const deliveredIds: string[] = [];
  const convokedEvents = new Map<
    string,
    { eventId: string; teamId: string | null; userIds: Set<string> }
  >();
  for (const notif of pending) {
    if (prefMap.get(`${notif.user_id}|${notif.team_id}|${notif.type}`) === false) {
      continue;
    }
    const subs = subsByUser.get(notif.user_id) || [];
    if (subs.length === 0) {
      continue;
    }
    const url = resolveUrl(notif);
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: notif.title, body: notif.body, url })
        );
        sent++;
      } catch (err) {
        console.error("[notifications/cron] push failed for", sub.endpoint, err);
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", sub.endpoint);
        }
      }
    }
    deliveredIds.push(notif.id);
    if (notif.type === "convocation" && notif.reference_id) {
      const key = `${notif.reference_id}|${notif.team_id}`;
      const entry = convokedEvents.get(key) || {
        eventId: notif.reference_id,
        teamId: notif.team_id || null,
        userIds: new Set<string>(),
      };
      entry.userIds.add(notif.user_id);
      convokedEvents.set(key, entry);
    }
  }

  if (deliveredIds.length > 0) {
    await supabase
      .from("notifications")
      .update({ delivered_at: now })
      .in("id", deliveredIds);
  }

  for (const entry of convokedEvents.values()) {
    if (entry.teamId) {
      await ensureAttendanceRows(entry.eventId, entry.teamId, [...entry.userIds]);
    }
    await supabase
      .from("events")
      .update({ convocations_sent_at: now })
      .eq("id", entry.eventId);
  }

  return NextResponse.json({ ok: true, sent, processed: deliveredIds.length });
}

function mondayStart(): Date {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // lundi = 0
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(now.getDate() - day);
  return start;
}

function dateLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

async function sendWeeklyDigest(
  supabase: ReturnType<typeof createAdminClient>,
  now: string
): Promise<void> {
  const weekStart = mondayStart();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekKey = weekStart.toISOString().slice(0, 10);

  // Énumération des équipes via les événements (l'admin client lit toutes les tables)
  const { data: allEvents } = await supabase
    .from("events")
    .select("team_id");
  const teamIds = [
    ...new Set((allEvents || []).map((e) => (e as { team_id: string | null }).team_id).filter(Boolean) as string[]),
  ];

  for (const teamId of teamIds) {
    const { data: team } = await supabase
      .from("teams")
      .select("name")
      .eq("id", teamId)
      .maybeSingle();
    const teamName = (team as { name?: string } | null)?.name || "Équipe";

    const digestRef = `digest:${teamId}:${weekKey}`;
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("type", "digest_hebdo")
      .eq("reference_id", digestRef)
      .limit(1)
      .maybeSingle();
    if (existing) continue;

    // Résultats de la semaine passée
    const lastMonday = new Date(weekStart);
    lastMonday.setDate(lastMonday.getDate() - 7);
    const { data: results } = await supabase
      .from("events")
      .select("event_date, opponent, score_us, score_them, match_result")
      .eq("team_id", teamId)
      .eq("type", "match")
      .eq("status", "completed")
      .gte("event_date", lastMonday.toISOString())
      .lt("event_date", weekStart.toISOString())
      .order("event_date", { ascending: true });

    const resultLines = ((results || []) as {
      event_date: string;
      opponent: string | null;
      score_us: number | null;
      score_them: number | null;
      match_result: "win" | "loss" | "draw" | null;
    }[]).map((m) => {
      const resultLabel =
        m.match_result === "win" ? "Victoire" : m.match_result === "draw" ? "Nul" : m.match_result === "loss" ? "Défaite" : "Match";
      const score =
        m.score_us != null && m.score_them != null ? `${m.score_us}-${m.score_them}` : "";
      const opp = m.opponent ? ` vs ${m.opponent}` : "";
      return `${resultLabel}${score ? ` ${score}` : ""}${opp} (${dateLabel(m.event_date)})`;
    });

    // Prochain événement + prochaines séances
    const { data: nextEvent } = await supabase
      .from("events")
      .select("id, type, title, opponent, event_date")
      .eq("team_id", teamId)
      .in("status", ["upcoming", "ongoing"])
      .gte("event_date", now)
      .order("event_date", { ascending: true })
      .limit(1)
      .maybeSingle();

    const { data: nextTrainings } = await supabase
      .from("events")
      .select("id, title, event_date")
      .eq("team_id", teamId)
      .eq("type", "training")
      .in("status", ["upcoming", "ongoing"])
      .gte("event_date", now)
      .order("event_date", { ascending: true })
      .limit(2);

    const nextEv = nextEvent as {
      id: string;
      type: string;
      title: string;
      opponent: string | null;
      event_date: string;
    } | null;
    const trainings = (nextTrainings || []) as { title: string; event_date: string }[];

    const parts: string[] = [];
    if (resultLines.length > 0) {
      parts.push(`Résultats : ${resultLines.join(" · ")}`);
    }
    if (nextEv) {
      const isMatch = nextEv.type === "match";
      parts.push(
        `Prochain ${isMatch ? "match" : "événement"} : ${dateLabel(nextEv.event_date)}${isMatch && nextEv.opponent ? ` vs ${nextEv.opponent}` : ""}`
      );
    }
    if (trainings.length > 0) {
      parts.push(
        `Séances : ${trainings.map((t) => `${dateLabel(t.event_date)} (${t.title})`).join(" · ")}`
      );
    }
    if (parts.length === 0) continue;

    // Destinataires : joueurs actifs + parents
    const { data: members } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("team_id", teamId)
      .in("role", ["player"]);
    const playerIds = (members || []).map((m) => m.user_id);
    if (playerIds.length === 0) continue;
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id")
      .in("id", playerIds)
      .eq("is_active", true);
    const activeIds = (profiles || []).map((p) => p.id);
    if (activeIds.length === 0) continue;
    const { data: links } = await supabase
      .from("parent_student")
      .select("parent_id")
      .eq("team_id", teamId)
      .in("student_id", activeIds);
    const parentIds = [...new Set((links || []).map((l) => (l as { parent_id: string }).parent_id))];
    const userIds = [...new Set([...activeIds, ...parentIds])];

    const rows = userIds.map((uid: string) => ({
      user_id: uid,
      team_id: teamId,
      type: "digest_hebdo",
      title: `Semaine en bref — ${teamName}`,
      body: parts.join(". ").slice(0, 2000),
      reference_id: digestRef,
      url: nextEv ? (nextEv.type === "match" ? `/matches/${nextEv.id}` : `/trainings/${nextEv.id}`) : "/",
      scheduled_for: now,
    }));

    const { error } = await supabase.from("notifications").insert(rows);
    if (error) {
      console.error("[notifications/cron] digest insert error:", error);
    }
  }
}

interface ExpiryCandidate {
  id: string;
  first_name: string;
  last_name: string;
  team_id: string;
  licence_expires_at: string | null;
  medical_cert_expires_at: string | null;
}

async function sendExpiryAlerts(supabase: ReturnType<typeof createAdminClient>, now: string) {
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - 1); // déjà expiré depuis 24h
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + 30); // échéance dans les 30 jours

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, team_id, licence_expires_at, medical_cert_expires_at")
    .eq("is_active", true);

  const candidates = (profiles || []) as ExpiryCandidate[];
  for (const p of candidates) {
    if (!p.team_id) continue;
    const alerts: { kind: "licence" | "medical"; date: string }[] = [];
    if (p.licence_expires_at) {
      const d = new Date(p.licence_expires_at + "T00:00:00");
      if (d >= windowStart && d <= windowEnd) alerts.push({ kind: "licence", date: p.licence_expires_at });
    }
    if (p.medical_cert_expires_at) {
      const d = new Date(p.medical_cert_expires_at + "T00:00:00");
      if (d >= windowStart && d <= windowEnd) alerts.push({ kind: "medical", date: p.medical_cert_expires_at });
    }
    for (const a of alerts) {
      const dedupRef = `echeance:${a.kind}:${p.id}:${a.date}`;
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("type", "echeance")
        .eq("reference_id", dedupRef)
        .limit(1)
        .maybeSingle();
      if (existing) continue;

      const { data: links } = await supabase
        .from("parent_student")
        .select("parent_id")
        .eq("team_id", p.team_id)
        .eq("student_id", p.id);
      const parentIds = [...new Set((links || []).map((l) => (l as { parent_id: string }).parent_id))];
      const userIds = [...new Set([p.id, ...parentIds])];

      const expired = new Date(a.date + "T00:00:00") < new Date(now);
      const daysLeft = Math.ceil(
        (new Date(a.date + "T00:00:00").getTime() - Date.now()) / 86400000
      );
      const label = a.kind === "licence" ? "la licence" : "le certificat médical";
      const title = expired ? "Échéance dépassée" : `Échéance dans ${daysLeft} j`;
      const body = `${p.first_name} ${p.last_name} : ${label} expire le ${new Date(a.date + "T00:00:00").toLocaleDateString("fr-FR")}.`;

      const rows = userIds.map((uid: string) => ({
        user_id: uid,
        team_id: p.team_id,
        type: "echeance",
        title,
        body,
        reference_id: dedupRef,
        url: "/settings/team",
        scheduled_for: now,
      }));
      const { error } = await supabase.from("notifications").insert(rows);
      if (error) {
        console.error("[notifications/cron] echeance insert error:", error);
      }
    }
  }
}

// ---------- Relances auto de convocation ----------
async function sendAttendanceReminders(supabase: ReturnType<typeof createAdminClient>, now: string) {
  const start = new Date(now);
  const end = new Date(now);
  end.setDate(end.getDate() + 2);

  const { data: settings } = await supabase
    .from("team_settings")
    .select("team_id, attendance_reminders_enabled")
    .eq("attendance_reminders_enabled", true);
  const enabledTeams = new Set((settings || []).map((s) => (s as { team_id: string }).team_id));

  const { data: events } = await supabase
    .from("events")
    .select("id, team_id, type, title, opponent, event_date")
    .in("status", ["upcoming", "ongoing"])
    .gte("event_date", start.toISOString())
    .lt("event_date", end.toISOString());

  for (const ev of (events || []) as { id: string; team_id: string | null; type: string; title: string; opponent: string | null; event_date: string }[]) {
    if (!ev.team_id) continue;
    if (enabledTeams.size > 0 && !enabledTeams.has(ev.team_id)) continue;

    const { data: atts } = await supabase
      .from("attendances")
      .select("user_id, status")
      .eq("event_id", ev.id)
      .eq("team_id", ev.team_id);
    const pendingIds = ((atts || []) as { user_id: string; status: string | null }[])
      .filter((a) => !a.status || a.status === "pending")
      .map((a) => a.user_id);
    if (pendingIds.length === 0) continue;

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id")
      .in("id", pendingIds)
      .eq("is_active", true);
    const activeIds = (profiles || []).map((p) => p.id);
    if (activeIds.length === 0) continue;

    const { data: links } = await supabase
      .from("parent_student")
      .select("parent_id")
      .eq("team_id", ev.team_id)
      .in("student_id", activeIds);
    const parentIds = [...new Set((links || []).map((l) => (l as { parent_id: string }).parent_id))];

    const isMatch = ev.type === "match";
    const dateLabel = new Date(ev.event_date).toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    const hour = new Date(ev.event_date).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    for (const uid of activeIds) {
      const ref = `relance:${ev.id}:${uid}`;
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("type", "relance_convocation")
        .eq("reference_id", ref)
        .limit(1)
        .maybeSingle();
      if (existing) continue;

      const userIds = [...new Set([uid, ...parentIds])];
      const rows = userIds.map((targetId: string) => ({
        user_id: targetId,
        team_id: ev.team_id,
        type: "relance_convocation",
        title: `Réponds à la convocation${isMatch && ev.opponent ? ` — ${ev.opponent}` : ""}`,
        body: `${isMatch ? "Match" : "Entraînement"} ${dateLabel} à ${hour}. Merci de répondre.`,
        reference_id: ref,
        url: isMatch ? `/matches/${ev.id}` : `/trainings/${ev.id}`,
        scheduled_for: now,
      }));
      const { error } = await supabase.from("notifications").insert(rows);
      if (error) {
        console.error("[notifications/cron] relance insert error:", error);
      }
    }
  }
}

// ---------- Alerte équité du temps de jeu (lundi) ----------
async function sendPlayingTimeAlerts(supabase: ReturnType<typeof createAdminClient>, now: string) {
  const season = currentSeasonLabel(new Date(now));
  const range = seasonDateRange(season);
  if (!range) return;

  const { data: settings } = await supabase
    .from("team_settings")
    .select("team_id, min_playing_minutes")
    .gt("min_playing_minutes", 0);
  if (!settings || settings.length === 0) return;

  for (const row of settings as { team_id: string; min_playing_minutes: number }[]) {
    const teamId = row.team_id;
    const threshold = row.min_playing_minutes;

    const ref = `playingtime:${teamId}:${season}`;
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("type", "equite_temps_jeu")
      .eq("reference_id", ref)
      .limit(1)
      .maybeSingle();
    if (existing) continue;

    const { data: matchStats } = await supabase
      .from("match_stats")
      .select("player_id, minutes_played, event:events!match_stats_event_id_fkey(event_date, status)")
      .eq("team_id", teamId);

    const minutesMap = new Map<string, number>();
    for (const s of (matchStats || []) as unknown as { player_id: string; minutes_played: number; event: { event_date: string; status: string } | null }[]) {
      if (!s.event || s.event.status !== "completed") continue;
      const d = new Date(s.event.event_date);
      if (d < range.start || d > range.end) continue;
      minutesMap.set(s.player_id, (minutesMap.get(s.player_id) || 0) + (s.minutes_played || 0));
    }

    const { data: members } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("team_id", teamId)
      .in("role", ["player"]);
    const playerIds = (members || []).map((m) => m.user_id);
    if (playerIds.length === 0) continue;

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", playerIds)
      .eq("is_active", true);

    const below = ((profiles || []) as { id: string; first_name: string; last_name: string }[])
      .map((p) => ({ name: `${p.first_name} ${p.last_name}`, minutes: minutesMap.get(p.id) || 0 }))
      .filter((p) => p.minutes < threshold)
      .sort((a, b) => a.minutes - b.minutes);
    if (below.length === 0) continue;

    const body =
      `Saison ${season} — sous l'objectif de ${threshold} min : ` +
      below.map((p) => `${p.name} (${p.minutes}')`).join(", ");

    const { data: coaches } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("team_id", teamId)
      .in("role", ["owner", "coach"]);

    const rows = (coaches || []).map((c) => ({
      user_id: (c as { user_id: string }).user_id,
      team_id: teamId,
      type: "equite_temps_jeu",
      title: "Alerte équité — temps de jeu",
      body,
      reference_id: ref,
      url: "/stats",
      scheduled_for: now,
    }));
    if (rows.length === 0) continue;
    const { error } = await supabase.from("notifications").insert(rows);
    if (error) {
      console.error("[notifications/cron] equite insert error:", error);
    }
  }
}

// ---------- Félicitations auto ----------
async function sendCongrats(supabase: ReturnType<typeof createAdminClient>, now: string) {
  // Anniversaires du jour
  const today = new Date(now);
  const { data: birthdays } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, date_of_birth, team_id")
    .eq("is_active", true);
  for (const p of (birthdays || []) as { id: string; first_name: string; last_name: string; date_of_birth: string | null; team_id: string | null }[]) {
    if (!p.date_of_birth || !p.team_id) continue;
    const dob = new Date(p.date_of_birth + (p.date_of_birth.length === 10 ? "T00:00:00" : ""));
    if (isNaN(dob.getTime())) continue;
    if (dob.getDate() !== today.getDate() || dob.getMonth() !== today.getMonth()) continue;

    const ref = `birthday:${p.id}:${today.toISOString().slice(0, 10)}`;
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("type", "felicitation")
      .eq("reference_id", ref)
      .limit(1)
      .maybeSingle();
    if (existing) continue;

    const { data: links } = await supabase
      .from("parent_student")
      .select("parent_id")
      .eq("team_id", p.team_id)
      .eq("student_id", p.id);
    const parentIds = [...new Set((links || []).map((l) => (l as { parent_id: string }).parent_id))];
    const rows = [p.id, ...parentIds].map((uid: string) => ({
      user_id: uid,
      team_id: p.team_id,
      type: "felicitation",
      title: "Joyeux anniversaire ! 🎂",
      body: `Toute l'équipe souhaite un bon anniversaire à ${p.first_name} ${p.last_name}.`,
      reference_id: ref,
      url: `/stats/${p.id}`,
      scheduled_for: now,
    }));
    const { error } = await supabase.from("notifications").insert(rows);
    if (error) {
      console.error("[notifications/cron] birthday insert error:", error);
    }
  }

  // Premier but / 50e match (matchs terminés ces dernières 24h)
  const dayAgo = new Date(now);
  dayAgo.setDate(dayAgo.getDate() - 1);
  const { data: recentEvents } = await supabase
    .from("events")
    .select("id, team_id, event_date, opponent")
    .eq("type", "match")
    .eq("status", "completed")
    .gte("event_date", dayAgo.toISOString());

  for (const ev of (recentEvents || []) as { id: string; team_id: string | null; event_date: string; opponent: string | null }[]) {
    if (!ev.team_id) continue;

    const { data: stats } = await supabase
      .from("match_stats")
      .select("player_id, goals")
      .eq("event_id", ev.id)
      .eq("team_id", ev.team_id);
    const scorers = ((stats || []) as { player_id: string; goals: number }[]).filter((s) => s.goals > 0);

    for (const scorer of scorers) {
      // Buts de carrière AVANT ce match
      const careerStats = await supabase
        .from("match_stats")
        .select("player_id, goals, event:events!match_stats_event_id_fkey(event_date)")
        .eq("player_id", scorer.player_id)
        .eq("team_id", ev.team_id);
      const careerRows = (careerStats.data || []) as unknown as { goals: number; event: { event_date: string } | null }[];
      const careerGoals = careerRows.reduce(
        (sum, s) => sum + (s.goals || 0),
        0
      );
      const goalsBefore = careerRows.reduce(
        (sum, s) => {
          if (s.event && new Date(s.event.event_date) < new Date(ev.event_date)) return sum + (s.goals || 0);
          return sum;
        },
        0
      );

      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", scorer.player_id)
        .maybeSingle();
      const name = `${(profile as { first_name?: string } | null)?.first_name ?? "Joueur"} ${(profile as { last_name?: string } | null)?.last_name ?? ""}`.trim();

      const { data: links } = await supabase
        .from("parent_student")
        .select("parent_id")
        .eq("team_id", ev.team_id)
        .eq("student_id", scorer.player_id);
      const parentIds = [...new Set((links || []).map((l) => (l as { parent_id: string }).parent_id))];
      const userIds = [...new Set([scorer.player_id, ...parentIds])];

      if (careerGoals >= 1 && goalsBefore === 0) {
        const ref = `first-goal:${ev.id}:${scorer.player_id}`;
        const { data: existing } = await supabase
          .from("notifications")
          .select("id")
          .eq("type", "felicitation")
          .eq("reference_id", ref)
          .limit(1)
          .maybeSingle();
        if (!existing) {
          const rows = userIds.map((uid: string) => ({
            user_id: uid,
            team_id: ev.team_id,
            type: "felicitation",
            title: "Premier but ! 🎯",
            body: `${name} a marqué son tout premier but${ev.opponent ? ` contre ${ev.opponent}` : ""}. Bravo !`,
            reference_id: ref,
            url: `/stats/${scorer.player_id}`,
            scheduled_for: now,
          }));
          const { error } = await supabase.from("notifications").insert(rows);
          if (error) console.error("[notifications/cron] first-goal insert error:", error);
        }
      }

      // Nombre de matchs de carrière jusqu'à ce match inclus
      const matchesUpTo = careerRows.filter(
        (s) => s.event && new Date(s.event.event_date) <= new Date(ev.event_date)
      ).length;
      if (matchesUpTo === 50) {
        const ref = `match-50:${ev.id}:${scorer.player_id}`;
        const { data: existing } = await supabase
          .from("notifications")
          .select("id")
          .eq("type", "felicitation")
          .eq("reference_id", ref)
          .limit(1)
          .maybeSingle();
        if (!existing) {
          const rows = userIds.map((uid: string) => ({
            user_id: uid,
            team_id: ev.team_id,
            type: "felicitation",
            title: "50e match ! 🏅",
            body: `${name} a disputé son 50e match avec l'équipe. Félicitations !`,
            reference_id: ref,
            url: `/stats/${scorer.player_id}`,
            scheduled_for: now,
          }));
          const { error } = await supabase.from("notifications").insert(rows);
          if (error) console.error("[notifications/cron] match-50 insert error:", error);
        }
      }
    }
  }
}
