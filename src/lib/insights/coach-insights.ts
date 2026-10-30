import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { callAI, isAIConfigured } from "@/lib/ai/client";

export interface InsightAlert {
  type: "warning" | "info" | "success";
  title: string;
  description: string;
}

export interface InsightTrend {
  label: string;
  direction: "up" | "down" | "stable";
  detail: string;
}

export interface CoachInsightsData {
  alerts: InsightAlert[];
  trends: InsightTrend[];
  suggestions: string[];
  /** true quand les insights viennent du moteur de règles (IA non configurée) */
  isRulesBased?: boolean;
}

const EMPTY_INSIGHTS: CoachInsightsData = {
  alerts: [],
  trends: [],
  suggestions: [],
  isRulesBased: true,
};

export async function generateCoachInsights(
  teamId: string
): Promise<CoachInsightsData> {
  const supabase = createAdminClient();
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  // Fetch all data in parallel
  const [matchesRes, attendancesRes, rpeRes, injuriesRes, matchStatsRes] =
    await Promise.all([
      // 10 derniers matchs complétés
      supabase
        .from("events")
        .select(
          "id, title, event_date, match_result, score_home, score_away, opponent"
        )
        .eq("team_id", teamId)
        .eq("type", "match")
        .eq("status", "completed")
        .order("event_date", { ascending: false })
        .limit(10),

      // Assiduité 30 derniers jours
      supabase
        .from("attendances")
        .select("status, event_id, user_id")
        .eq("team_id", teamId)
        .gte("created_at", thirtyDaysAgo),

      // RPE moyen 30 derniers jours
      supabase
        .from("session_rpe")
        .select("rpe, recorded_at")
        .eq("team_id", teamId)
        .gte("recorded_at", thirtyDaysAgo),

      // Blessures actives
      supabase
        .from("injuries")
        .select("player_id, injury_type, start_date, severity, body_part")
        .eq("team_id", teamId)
        .is("end_date", null),

      // Match stats agrégés (buts, passes décisives)
      supabase
        .from("match_stats")
        .select("goals, assists, player_id")
        .eq("team_id", teamId)
        .gte("created_at", thirtyDaysAgo),
    ]);

  const matches = matchesRes.data ?? [];
  const attendances = attendancesRes.data ?? [];
  const rpeEntries = rpeRes.data ?? [];
  const injuries = injuriesRes.data ?? [];
  const matchStats = matchStatsRes.data ?? [];

  // Calcul des métriques synthétiques pour le prompt
  const totalMatches = matches.length;
  const wins = matches.filter((m) => m.match_result === "win").length;
  const losses = matches.filter((m) => m.match_result === "loss").length;
  const draws = matches.filter((m) => m.match_result === "draw").length;

  const totalAttendances = attendances.length;
  const presentCount = attendances.filter((a) => a.status === "present").length;
  const attendanceRate =
    totalAttendances > 0
      ? Math.round((presentCount / totalAttendances) * 100)
      : null;

  const avgRpe =
    rpeEntries.length > 0
      ? Math.round(
          (rpeEntries.reduce((sum, r) => sum + (r.rpe ?? 0), 0) /
            rpeEntries.length) *
            10
        ) / 10
      : null;

  const totalGoals = matchStats.reduce((sum, s) => sum + (s.goals ?? 0), 0);
  const totalAssists = matchStats.reduce(
    (sum, s) => sum + (s.assists ?? 0),
    0
  );

  const systemPrompt =
    "Tu es un assistant tactique de football amateur. Analyse ces données et fournis des insights courts et actionnables. " +
    "Réponds UNIQUEMENT avec un objet JSON valide correspondant exactement au schéma demandé, sans texte autour.";

  const userMessage = `Voici les données de l'équipe sur les 30 derniers jours :

**Résultats matchs (${totalMatches} derniers matchs complétés) :**
- Victoires : ${wins}, Défaites : ${losses}, Nuls : ${draws}
- Détail : ${matches.map((m) => `${m.event_date?.slice(0, 10)} vs ${m.opponent ?? "?"} → ${m.match_result ?? "?"} (${m.score_home ?? "?"}–${m.score_away ?? "?"})`).join(", ") || "Aucun match"}

**Assiduité (30 jours) :**
- Taux de présence : ${attendanceRate !== null ? `${attendanceRate}%` : "Données indisponibles"} (${presentCount}/${totalAttendances} présences enregistrées)

**Charge d'entraînement — RPE moyen (30 jours) :**
- RPE moyen : ${avgRpe !== null ? `${avgRpe}/10` : "Données indisponibles"} (${rpeEntries.length} relevés)

**Blessures actives :**
- ${injuries.length > 0 ? `${injuries.length} joueur(s) blessé(s) : ${injuries.map((i) => `${i.injury_type ?? "blessure"} (${i.body_part ?? "?"}, sévérité ${i.severity ?? "?"}) depuis ${i.start_date?.slice(0, 10) ?? "?"}`).join("; ")}` : "Aucune blessure active"}

**Statistiques offensives (30 jours) :**
- Buts : ${totalGoals}, Passes décisives : ${totalAssists}

Génère un objet JSON strictement conforme à ce schéma :
{
  "alerts": [{"type": "warning"|"info"|"success", "title": "string (max 8 mots)", "description": "string (max 20 mots)"}],
  "trends": [{"label": "string (max 5 mots)", "direction": "up"|"down"|"stable", "detail": "string (max 15 mots)"}],
  "suggestions": ["string (phrase courte et actionnable)"]
}

Contraintes : maximum 4 alertes, 4 tendances, 4 suggestions. Sois factuel et précis sur les données fournies.`;

  // Si l'IA n'est pas configurée, on court-circuite directement vers le moteur de règles
  if (!isAIConfigured()) {
    return buildRulesBasedInsights({
      matches,
      attendances,
      rpeEntries,
      injuries,
      totalGoals,
      totalAssists,
      wins,
      losses,
      draws,
      attendanceRate,
      avgRpe,
    });
  }

  try {
    const raw = await callAI(systemPrompt, userMessage, {
      responseFormat: "json",
      temperature: 0.3,
      maxTokens: 1500,
    });

    const parsed = JSON.parse(raw) as Partial<CoachInsightsData>;

    // Validation souple : s'assurer que les tableaux sont bien des tableaux
    return {
      alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
      trends: Array.isArray(parsed.trends) ? parsed.trends : [],
      suggestions: Array.isArray(parsed.suggestions)
        ? parsed.suggestions
        : [],
      isRulesBased: false,
    };
  } catch (err) {
    // Dégradation gracieuse — l'IA a échoué → fallback règles
    console.warn("[coach-insights] Génération IA échouée, fallback règles :", err);
    return buildRulesBasedInsights({
      matches,
      attendances,
      rpeEntries,
      injuries,
      totalGoals,
      totalAssists,
      wins,
      losses,
      draws,
      attendanceRate,
      avgRpe,
    });
  }
}

// ---------------------------------------------------------------------------
// Moteur de règles — fallback sans IA
// ---------------------------------------------------------------------------

interface RulesInput {
  matches: { match_result?: string | null; event_date?: string | null; opponent?: string | null }[];
  attendances: { status: string }[];
  rpeEntries: { rpe: number; recorded_at?: string | null }[];
  injuries: { injury_type?: string | null }[];
  totalGoals: number;
  totalAssists: number;
  wins: number;
  losses: number;
  draws: number;
  attendanceRate: number | null;
  avgRpe: number | null;
}

function buildRulesBasedInsights(input: RulesInput): CoachInsightsData {
  const alerts: InsightAlert[] = [];
  const trends: InsightTrend[] = [];
  const suggestions: string[] = [];

  const { matches, wins, losses, draws, attendanceRate, avgRpe, injuries, totalGoals, totalAssists } = input;
  const totalMatches = matches.length;

  // --- Streak victoires consécutives ---
  let streak = 0;
  for (const m of matches) {
    if (m.match_result === "win") streak++;
    else break;
  }
  if (streak >= 3) {
    alerts.push({
      type: "success",
      title: `${streak} victoires consécutives`,
      description: `L'équipe est en grande forme — profitez de cette dynamique positive.`,
    });
  } else if (streak === 2) {
    alerts.push({
      type: "success",
      title: "2 victoires d'affilée",
      description: "Bonne dynamique, restez concentrés pour enchaîner.",
    });
  }

  // --- Série noire ---
  let losStreak = 0;
  for (const m of matches) {
    if (m.match_result === "loss") losStreak++;
    else break;
  }
  if (losStreak >= 3) {
    alerts.push({
      type: "warning",
      title: `${losStreak} défaites consécutives`,
      description: "Analysez les schémas tactiques récents pour inverser la tendance.",
    });
    suggestions.push("Organisez une séance vidéo sur les derniers matchs pour identifier les axes d'amélioration.");
  }

  // --- Bilan global ---
  if (totalMatches > 0) {
    const winRate = Math.round((wins / totalMatches) * 100);
    trends.push({
      label: "Bilan sur 30 jours",
      direction: winRate >= 60 ? "up" : winRate >= 40 ? "stable" : "down",
      detail: `${wins}V ${draws}N ${losses}D — ${winRate}% de victoires`,
    });
  }

  // --- Assiduité ---
  if (attendanceRate !== null) {
    if (attendanceRate < 65) {
      alerts.push({
        type: "warning",
        title: `Assiduité faible (${attendanceRate}%)`,
        description: "Le taux de présence aux entraînements est en dessous des 65% recommandés.",
      });
      suggestions.push("Identifiez les joueurs absents à répétition et prenez contact avec eux.");
    } else if (attendanceRate >= 85) {
      alerts.push({
        type: "success",
        title: `Excellente assiduité (${attendanceRate}%)`,
        description: "Le groupe est très régulier — un atout pour la cohésion d'équipe.",
      });
    }
    trends.push({
      label: "Assiduité entraînements",
      direction: attendanceRate >= 75 ? "up" : attendanceRate >= 55 ? "stable" : "down",
      detail: `${attendanceRate}% de présence sur 30 jours`,
    });
  }

  // --- RPE (charge d'entraînement) ---
  if (avgRpe !== null) {
    if (avgRpe > 7.5) {
      alerts.push({
        type: "warning",
        title: `Charge élevée (RPE ${avgRpe}/10)`,
        description: "La fatigue perçue est haute — envisagez une séance de récupération active.",
      });
      suggestions.push("Intégrez une séance de récupération active ou réduisez l'intensité cette semaine.");
    } else if (avgRpe < 4) {
      alerts.push({
        type: "info",
        title: `Charge faible (RPE ${avgRpe}/10)`,
        description: "L'effort perçu est bas — les joueurs pourraient supporter une intensité accrue.",
      });
    }
    trends.push({
      label: "Charge d'entraînement",
      direction: avgRpe > 7 ? "up" : avgRpe < 4 ? "down" : "stable",
      detail: `RPE moyen ${avgRpe}/10`,
    });
  }

  // --- Blessures ---
  if (injuries.length >= 3) {
    alerts.push({
      type: "warning",
      title: `${injuries.length} joueurs blessés`,
      description: "Plusieurs absences simultanées — adaptez les rotations en conséquence.",
    });
    suggestions.push("Anticipez les rotations en identifiant des profils polyvalents au sein du groupe.");
  } else if (injuries.length === 0 && totalMatches > 0) {
    alerts.push({
      type: "success",
      title: "Aucune blessure active",
      description: "Le groupe est au complet — une chance à exploiter.",
    });
  }

  // --- Statistiques offensives ---
  if (totalMatches > 0) {
    const gpg = totalGoals / totalMatches;
    trends.push({
      label: "Efficacité offensive",
      direction: gpg >= 2 ? "up" : gpg >= 1 ? "stable" : "down",
      detail: `${totalGoals} buts, ${totalAssists} passes déc. (${gpg.toFixed(1)} buts/match)`,
    });
    if (gpg < 1 && totalMatches >= 3) {
      suggestions.push("Travaillez les situations de finition en entraînement pour améliorer l'efficacité offensive.");
    }
  }

  // Suggestion générique si trop peu de données
  if (suggestions.length === 0 && totalMatches === 0) {
    suggestions.push("Ajoutez vos premiers matchs pour commencer à suivre les tendances de l'équipe.");
  }

  return { alerts, trends, suggestions, isRulesBased: true };
}
