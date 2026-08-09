import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAuthUserDetailed,
  unauthorized,
  forbidden,
  isTeamMember,
  isTeamCoach,
} from "@/lib/api-auth";
import { fetchSeasonData } from "@/lib/seasonReport";

export const dynamic = "force-dynamic";

export interface SeasonReportContent {
  title: string;
  summary: string;
  points_forts: string[];
  points_faibles: string[];
  axes_progression: string[];
  note_equipe: number;
  meilleurs_joueurs: { nom: string; raison: string }[];
  meilleur_buteur: string | null;
  meilleure_passeur: string | null;
  joueur_plus_present: string | null;
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

function sanitizeReport(raw: Record<string, unknown>): SeasonReportContent {
  const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 600) : "");
  const strArr = (v: unknown) =>
    Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean).slice(0, 8) : [];
  const num = (v: unknown) =>
    typeof v === "number" && !Number.isNaN(v) ? Math.min(10, Math.max(0, v)) : 0;
  const opt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null);

  return {
    title: str(raw.title) || "Bilan de saison",
    summary: str(raw.summary),
    points_forts: strArr(raw.points_forts),
    points_faibles: strArr(raw.points_faibles),
    axes_progression: strArr(raw.axes_progression),
    note_equipe: num(raw.note_equipe),
    meilleurs_joueurs: Array.isArray(raw.meilleurs_joueurs)
      ? (raw.meilleurs_joueurs as Record<string, unknown>[])
          .map((m) => ({
            nom: str(m?.nom).slice(0, 120),
            raison: str(m?.raison),
          }))
          .filter((m) => m.nom)
          .slice(0, 5)
      : [],
    meilleur_buteur: opt(raw.meilleur_buteur),
    meilleure_passeur: opt(raw.meilleure_passeur),
    joueur_plus_present: opt(raw.joueur_plus_present),
  };
}

export async function POST(req: Request) {
  try {
    const { user, reason } = await getAuthUserDetailed(req);
    if (!user) return unauthorized(reason);

    const body = await req.json();
    const { teamId, season } = body;
    if (!teamId || typeof teamId !== "string" || !season || typeof season !== "string") {
      return NextResponse.json({ error: "teamId et season requis" }, { status: 400 });
    }
    if (!(await isTeamMember(user.id, teamId))) return forbidden();
    if (!(await isTeamCoach(user.id, teamId))) {
      return NextResponse.json(
        { error: "Seuls les coachs peuvent générer un rapport de saison" },
        { status: 403 }
      );
    }

    const supabase = createAdminClient();
    const data = await fetchSeasonData(supabase, teamId, season);

    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "MISTRAL_API_KEY manquante" }, { status: 500 });
    }

    const userContent = `Équipe : ${data.teamName}
Saison : ${data.season}

Bilan : ${data.wins} victoires, ${data.draws} nuls, ${data.losses} défaites (${data.matches.length} matchs joués).
Buts marqués : ${data.goalsFor} · Buts encaissés : ${data.goalsAgainst}.

Matchs :
${JSON.stringify(data.matches, null, 2)}

Statistiques des joueurs (nom, poste, matchs, buts, passes décisives, minutes, cartons jaunes/rouges, % de présence, note moyenne du coach, fois joueur du match) :
${JSON.stringify(
  data.players.map((p) => ({
    nom: p.name,
    poste: p.position,
    matchs: p.matches,
    buts: p.goals,
    passes: p.assists,
    minutes: p.minutes,
    cartons_jaunes: p.yellowCards,
    cartons_rouges: p.redCards,
    presence_pct: p.attendancePct,
    note_moyenne: p.avgRating,
    joueur_du_match: p.motm,
  })),
  null,
  2
)}

Meilleur buteur pressenti : ${data.topScorers[0]?.name ?? "non déterminé"} (${data.topScorers[0]?.goals ?? 0} buts).
Meilleur passeur pressenti : ${data.topAssists[0]?.name ?? "non déterminé"} (${data.topAssists[0]?.assists ?? 0} passes).
Joueur le plus présent : ${data.mostPresent[0]?.name ?? "non déterminé"} (${data.mostPresent[0]?.pct ?? 0} %).

Rédige le bilan de saison de cette équipe de jeunes.`;

    const systemPrompt = `Tu es un entraîneur de football diplômé UEFA A, expert en formation des jeunes joueurs. À partir des statistiques d'une saison complète, tu rédiges un bilan de saison destiné aux joueurs, parents et dirigeants.

Règles :
- Ton toujours constructif, bienveillant et professionnel.
- Tu réponds UNIQUEMENT par un objet JSON valide (aucun texte avant/après, aucun bloc markdown) avec exactement cette structure :
{
  "title": "titre du bilan (ex : Bilan de la saison 2025-2026 de l'ECC U14)",
  "summary": "paragraphe synthétique de 4 à 6 phrases : bilan général, progression collective, ambiance",
  "points_forts": ["2 à 4 points forts collectifs observables"],
  "points_faibles": ["2 à 3 points à améliorer, formulés positivement"],
  "axes_progression": ["2 à 3 axes de travail concrets pour la saison prochaine"],
  "note_equipe": 7.5,
  "meilleurs_joueurs": [{"nom": "Prénom Nom", "raison": "courte justification basée sur les stats"}],
  "meilleur_buteur": "Prénom Nom ou null",
  "meilleure_passeur": "Prénom Nom ou null",
  "joueur_plus_present": "Prénom Nom ou null"
}
- "note_equipe" : nombre entre 0 et 10.
- "meilleurs_joueurs" : 1 à 3 joueurs, choisis d'après les buts, passes, notes du coach, présences ou titres de joueur du match.
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

    const result = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = result.choices?.[0]?.message?.content ?? "";
    if (!content) throw new Error("Réponse vide de Mistral");

    const parsed = JSON.parse(cleanJson(content)) as Record<string, unknown>;
    const report = sanitizeReport(parsed);

    const { error } = await supabase.from("season_reports").upsert(
      {
        team_id: teamId,
        season,
        content: report as unknown as Record<string, unknown>,
        created_by: user.id,
      },
      { onConflict: "team_id,season" }
    );
    if (error) throw error;

    return NextResponse.json({ ok: true, report, season });
  } catch (e) {
    console.error("[season/report] erreur:", e);
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
    const teamId = url.searchParams.get("teamId");
    const season = url.searchParams.get("season");
    if (!teamId || !season) {
      return NextResponse.json({ error: "teamId et season requis" }, { status: 400 });
    }
    if (!(await isTeamMember(user.id, teamId))) return forbidden();

    const supabase = createAdminClient();
    const { data: report } = await supabase
      .from("season_reports")
      .select("content, created_at, updated_at")
      .eq("team_id", teamId)
      .eq("season", season)
      .maybeSingle();

    return NextResponse.json({
      report: report?.content ?? null,
      created_at: report?.created_at ?? null,
      updated_at: report?.updated_at ?? null,
    });
  } catch (e) {
    console.error("[season/report] erreur GET:", e);
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}
