import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAuthUserDetailed,
  unauthorized,
  forbidden,
  isTeamMember,
  isTeamCoach,
} from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export interface MatchReportContent {
  title: string;
  summary: string;
  points_forts: string[];
  points_faibles: string[];
  axes_progression: string[];
  note_equipe: number;
  meilleurs_joueurs: { nom: string; raison: string }[];
}

function cleanJson(text: string): string {
  const t = text.trim();
  const fenceMatch = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) return fenceMatch[1];
  const firstBrace = t.indexOf("{");
  const lastBrace = t.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) return t.slice(firstBrace, lastBrace + 1);
  return t;
}

function sanitizeManualReport(raw: Record<string, unknown>): MatchReportContent | null {
  if (!raw) return null;
  const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 500) : "");
  const strArr = (v: unknown) =>
    Array.isArray(v)
      ? v.map((x) => str(x)).filter(Boolean).slice(0, 8)
      : [];
  const num = (v: unknown) =>
    typeof v === "number" && !Number.isNaN(v) ? Math.min(10, Math.max(0, v)) : 0;

  const title = str(raw.title);
  if (!title) return null;

  const meilleurs_joueurs = Array.isArray(raw.meilleurs_joueurs)
    ? (raw.meilleurs_joueurs as Record<string, unknown>[])
        .map((m) => ({
          nom: str(m?.nom).slice(0, 120),
          raison: str(m?.raison),
        }))
        .filter((m) => m.nom)
        .slice(0, 5)
    : [];

  return {
    title,
    summary: str(raw.summary),
    points_forts: strArr(raw.points_forts),
    points_faibles: strArr(raw.points_faibles),
    axes_progression: strArr(raw.axes_progression),
    note_equipe: num(raw.note_equipe),
    meilleurs_joueurs,
  };
}

async function upsertReport(
  supabase: ReturnType<typeof createAdminClient>,
  eventId: string,
  teamId: string,
  userId: string,
  report: MatchReportContent,
  source: "ai" | "manual"
) {
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("match_reports")
    .select("id")
    .eq("event_id", eventId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("match_reports")
      .update({ content: report, source, updated_at: now })
      .eq("event_id", eventId);
  } else {
    await supabase.from("match_reports").insert({
      event_id: eventId,
      team_id: teamId,
      content: report,
      source,
      created_by: userId,
    });
  }
}

export async function POST(req: Request) {
  try {
    const { user, reason } = await getAuthUserDetailed(req);
    if (!user) return unauthorized(reason);

    const body = await req.json().catch(() => null);
    const eventId = typeof body?.eventId === "string" ? body.eventId : "";
    if (!eventId) {
      return NextResponse.json({ error: "eventId manquant" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: event } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventId)
      .eq("type", "match")
      .maybeSingle();

    if (!event) {
      return NextResponse.json({ error: "Match introuvable" }, { status: 404 });
    }
    const teamId = event.team_id as string;

    if (!(await isTeamMember(user.id, teamId))) {
      return forbidden();
    }
    if (!(await isTeamCoach(user.id, teamId))) {
      return NextResponse.json(
        { error: "Seuls les coachs peuvent générer ou rédiger un compte-rendu" },
        { status: 403 }
      );
    }

    const mode = body?.mode === "manual" ? "manual" : "ai";

    // Mode manuel : le coach rédige lui-même le compte-rendu
    if (mode === "manual") {
      const report = sanitizeManualReport(
        (body?.report ?? null) as Record<string, unknown>
      );
      if (!report) {
        return NextResponse.json(
          { error: "Compte-rendu invalide : un titre est requis" },
          { status: 400 }
        );
      }
      await upsertReport(supabase, eventId, teamId, user.id, report, "manual");
      return NextResponse.json({ ok: true, report, source: "manual" });
    }

    const [statsRes, eventsRes, attRes, membersRes] = await Promise.all([
      supabase
        .from("match_stats")
        .select("player_id, goals, assists, yellow_cards, red_cards, minutes_played, clean_sheet, saves")
        .eq("event_id", eventId),
      supabase
        .from("match_events")
        .select("event_type, player_id, related_player_id, minute, notes")
        .eq("event_id", eventId)
        .order("minute", { ascending: true }),
      supabase
        .from("attendances")
        .select("user_id, status")
        .eq("event_id", eventId),
      supabase
        .from("team_members")
        .select("user_id, role")
        .eq("team_id", teamId),
    ]);

    const memberIds = (membersRes.data || []).map((m) => m.user_id);
    const { data: profiles } = memberIds.length
      ? await supabase
          .from("profiles")
          .select("id, first_name, last_name, position, shirt_number")
          .in("id", memberIds)
      : { data: [] as { id: string; first_name: string; last_name: string; position: string | null; shirt_number: number | null }[] };

    const nameById = new Map(
      (profiles || []).map((p) => [
        p.id,
        `${p.first_name} ${p.last_name}`.trim(),
      ])
    );

    const stats = (statsRes.data || []).map((s) => ({
      joueur: nameById.get(s.player_id as string) || "Joueur",
      buts: s.goals || 0,
      passes: s.assists || 0,
      cartons_jaunes: s.yellow_cards || 0,
      cartons_rouges: s.red_cards || 0,
      minutes: s.minutes_played || 0,
    }));

    const events = (eventsRes.data || []).map((ev) => ({
      minute: ev.minute,
      type: ev.event_type,
      joueur: nameById.get(ev.player_id as string) || null,
      joueur_lie: nameById.get(ev.related_player_id as string) || null,
      notes: ev.notes || null,
    }));

    const presentCount = (attRes.data || []).filter(
      (a) => a.status === "present"
    ).length;

    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "MISTRAL_API_KEY manquante" },
        { status: 500 }
      );
    }

    const opponent = event.opponent || "adversaire";
    const score = event.score_us != null && event.score_them != null
      ? `${event.score_us} - ${event.score_them}`
      : "non renseigné";
    const result = event.match_result || "non renseigné";

    const userContent = `Match : ${event.title || "Match"} contre ${opponent}.
Date : ${event.event_date || ""}.
Score : ${score} (résultat : ${result}).
Effectif présent : ${presentCount} joueurs.

Statistiques individuelles (buts / passes décisives / cartons jaunes / cartons rouges / minutes jouées) :
${JSON.stringify(stats, null, 2)}

Événements du match (type, minute, joueurs impliqués, notes) :
${JSON.stringify(events, null, 2)}

Rédige un compte-rendu de match constructif, bienveillant et professionnel.`;

    const systemPrompt = `Tu es un entraîneur de football diplômé UEFA B. À partir des statistiques et événements d'un match, tu rédiges un compte-rendu de match destiné aux joueurs et aux parents.

Règles :
- Ton est toujours constructif, positif et professionnel (jamais de critique personnelle).
- Tu réponds UNIQUEMENT par un objet JSON valide (aucun texte avant/après, aucun bloc markdown) avec exactement cette structure :
{
  "title": "titre du compte-rendu (ex: Compte-rendu du match du 15/02 contre ...)",
  "summary": "paragraphe synthétique de 3 à 5 phrases résumant le match (contexte, tournant, résultat)",
  "points_forts": ["2 à 4 points forts collectifs observables"],
  "points_faibles": ["2 à 3 points à améliorer, formulés positivement"],
  "axes_progression": ["2 à 3 axes de travail concrets pour la prochaine séance"],
  "note_equipe": 7.5,
  "meilleurs_joueurs": [{"nom": "Prénom Nom", "raison": "courte justification basée sur les stats ou événements"}]
}
- "note_equipe" : nombre entre 0 et 10.
- "meilleurs_joueurs" : 1 à 3 joueurs, choisis d'après les buts, passes décisives, arrêts, minutes jouées ou événements marquants.
- Tout est rédigé en français.`;

    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.MISTRAL_MODEL || "mistral-small-latest",
        temperature: 0.5,
        max_tokens: 2048,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Mistral API ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? "";
    if (!content) throw new Error("Réponse vide de Mistral");

    const parsed = JSON.parse(cleanJson(content)) as Record<string, unknown>;
    const report: MatchReportContent = {
      title:
        typeof parsed.title === "string"
          ? parsed.title
          : `Compte-rendu du match contre ${opponent}`,
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      points_forts: Array.isArray(parsed.points_forts)
        ? parsed.points_forts.filter((p): p is string => typeof p === "string")
        : [],
      points_faibles: Array.isArray(parsed.points_faibles)
        ? parsed.points_faibles.filter((p): p is string => typeof p === "string")
        : [],
      axes_progression: Array.isArray(parsed.axes_progression)
        ? parsed.axes_progression.filter((p): p is string => typeof p === "string")
        : [],
      note_equipe:
        typeof parsed.note_equipe === "number" ? parsed.note_equipe : 0,
      meilleurs_joueurs: Array.isArray(parsed.meilleurs_joueurs)
        ? (parsed.meilleurs_joueurs as Record<string, unknown>[]).map((m) => ({
            nom: typeof m?.nom === "string" ? m.nom : "",
            raison: typeof m?.raison === "string" ? m.raison : "",
          }))
        : [],
    };

    await upsertReport(supabase, eventId, teamId, user.id, report, "ai");

    return NextResponse.json({ ok: true, report, source: "ai" });
  } catch (e) {
    console.error("[matches/report] erreur:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur lors de la génération du rapport" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const { user, reason } = await getAuthUserDetailed(req);
    if (!user) return unauthorized(reason);

    const url = new URL(req.url);
    const eventId = url.searchParams.get("eventId");
    if (!eventId) {
      return NextResponse.json({ error: "eventId manquant" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: event } = await supabase
      .from("events")
      .select("team_id")
      .eq("id", eventId)
      .maybeSingle();
    if (!event) return NextResponse.json({ error: "Match introuvable" }, { status: 404 });

    const teamId = event.team_id as string;
    if (!(await isTeamMember(user.id, teamId))) return forbidden();

    const { data: report } = await supabase
      .from("match_reports")
      .select("content, source, created_at, updated_at")
      .eq("event_id", eventId)
      .maybeSingle();

    return NextResponse.json({
      report: report?.content ?? null,
      source: report?.source ?? null,
      created_at: report?.created_at ?? null,
      updated_at: report?.updated_at ?? null,
    });
  } catch (e) {
    console.error("[matches/report] erreur GET:", e);
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}
