/**
 * Tests TDD — fetchSeasonData (RED)
 *
 * Règle métier corrigée : `attendancePct` (assiduité, "mostPresent") ne doit
 * se calculer QUE sur la présence aux ENTRAÎNEMENTS (`events.type='training'`).
 * Bug ACTUEL (inverse) : `attendancePct` est calculé à partir de `matchIds`.
 *
 * "présent" = status === "present" || status === "late"
 *
 * ---------------------------------------------------------------------------
 * CONTRAT imposé à @dev :
 *
 *   1. Récupérer les entraînements de la saison :
 *      supabase.from("events").select(...).eq("team_id", teamId)
 *              .eq("type", "training")
 *              .gte("event_date", startISO).lte("event_date", endISO)
 *      → trainingIds = training.map(e => e.id)
 *
 *   2. Requête ATTENDANCES DÉDIÉE à l'assiduité, séparée de celle des matchs :
 *      supabase.from("attendances").select("event_id, user_id, status")
 *              .in("event_id", trainingIds)
 *      → present/total par joueur = agg.present / agg.total (renommer si besoin
 *        `convoked` en "convocations d'entraînement" pour `mostPresent`)
 *
 *   3. NE PAS toucher aux requêtes match_stats / match_ratings / motm_votes,
 *      qui doivent continuer à utiliser `matchIds` (non-régression : buts,
 *      passes, notes, MOTM restent liés aux matchs).
 *
 * Le mock ci-dessous filtre génériquement `attendances` par la liste d'ids
 * passée à `.in("event_id", ids)`, quel que soit le nombre de requêtes émises
 * sur cette table (une pour les matchs, une pour les trainings) — il est donc
 * tolérant à l'ordre/au nombre d'appels tant que chaque requête passe la
 * bonne liste d'ids.
 * ---------------------------------------------------------------------------
 */

import { describe, it, expect, vi } from "vitest";

// `seasonReport.ts` est un module 100% serveur (`import "server-only"`).
// Le package `server-only` lève une erreur dès qu'il est chargé hors d'un
// runtime "Server Component" (ex: environnement jsdom de test) — on le
// neutralise ici, ce qui est le mock standard recommandé par Next.js pour
// tester ce genre de module en isolation.
vi.mock("server-only", () => ({}));

import { fetchSeasonData } from "@/lib/seasonReport";

type Call = [string, unknown[]];

interface EventFixture {
  id: string;
  type: "match" | "training";
  event_date: string;
  opponent?: string | null;
  score_us?: number | null;
  score_them?: number | null;
  match_result?: "win" | "loss" | "draw" | null;
}

interface AttendanceFixture {
  event_id: string;
  user_id: string;
  status: string;
}

interface MatchStatFixture {
  event_id: string;
  player_id: string;
  goals: number;
  assists?: number;
  yellow_cards?: number;
  red_cards?: number;
  minutes_played?: number;
}

interface ProfileFixture {
  id: string;
  first_name: string;
  last_name: string;
  position: string | null;
}

function makeChain(resolve: (calls: Call[]) => { data: unknown; error: null }) {
  const calls: Call[] = [];
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "in", "gte", "lte", "lt", "order", "maybeSingle"];
  for (const m of methods) {
    chain[m] = (...args: unknown[]) => {
      calls.push([m, args]);
      return chain;
    };
  }
  chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => {
    try {
      return Promise.resolve(resolve(calls)).then(onFulfilled, onRejected);
    } catch (e) {
      if (onRejected) return Promise.resolve(onRejected(e));
      throw e;
    }
  };
  return chain;
}

function hasEqCall(calls: Call[], key: string, value: unknown) {
  return calls.some(([m, args]) => m === "eq" && args[0] === key && args[1] === value);
}

function inArgFor(calls: Call[], key: string): unknown[] | undefined {
  const call = calls.find(([m, args]) => m === "in" && args[0] === key);
  return call ? (call[1][1] as unknown[]) : undefined;
}

function makeSupabase(opts: {
  events: EventFixture[];
  attendances: AttendanceFixture[];
  matchStats?: MatchStatFixture[];
  profiles?: ProfileFixture[];
}) {
  const matchStats = opts.matchStats ?? [];
  const profiles = opts.profiles ?? [];

  return {
    from: (table: string) => {
      if (table === "teams") {
        return makeChain(() => ({ data: { name: "Team Test" }, error: null }));
      }
      if (table === "events") {
        return makeChain((calls) => {
          const wantTraining = hasEqCall(calls, "type", "training");
          const wantMatch = hasEqCall(calls, "type", "match");
          const filtered = opts.events.filter((e) =>
            wantTraining ? e.type === "training" : wantMatch ? e.type === "match" : true
          );
          return { data: filtered, error: null };
        });
      }
      if (table === "attendances") {
        return makeChain((calls) => {
          const ids = inArgFor(calls, "event_id") ?? [];
          const filtered = opts.attendances.filter((a) => ids.includes(a.event_id));
          return { data: filtered, error: null };
        });
      }
      if (table === "match_stats") {
        return makeChain((calls) => {
          const ids = inArgFor(calls, "event_id") ?? [];
          const filtered = matchStats.filter((s) => ids.includes(s.event_id));
          return { data: filtered, error: null };
        });
      }
      if (table === "match_ratings" || table === "motm_votes") {
        return makeChain(() => ({ data: [], error: null }));
      }
      if (table === "profiles") {
        return makeChain((calls) => {
          const ids = inArgFor(calls, "id") ?? [];
          const filtered = profiles.filter((p) => ids.includes(p.id));
          return { data: filtered, error: null };
        });
      }
      return makeChain(() => ({ data: [], error: null }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const SEASON = "2024-2025";

function player(id: string, first = "Jean", last = "Dupont"): ProfileFixture {
  return { id, first_name: first, last_name: last, position: "MIL" };
}

describe("fetchSeasonData — assiduité training-only", () => {
  it("présent à tous les trainings + absent à tous les matchs => attendancePct = 100 (pas 0)", async () => {
    const supabase = makeSupabase({
      events: [
        { id: "tr-1", type: "training", event_date: "2024-09-01T18:00:00Z" },
        { id: "tr-2", type: "training", event_date: "2024-09-08T18:00:00Z" },
        { id: "m-1", type: "match", event_date: "2024-09-14T14:00:00Z" },
        { id: "m-2", type: "match", event_date: "2024-09-21T14:00:00Z" },
      ],
      attendances: [
        { event_id: "tr-1", user_id: "p-1", status: "present" },
        { event_id: "tr-2", user_id: "p-1", status: "late" },
        { event_id: "m-1", user_id: "p-1", status: "absent" },
        { event_id: "m-2", user_id: "p-1", status: "absent" },
      ],
      profiles: [player("p-1")],
    });

    const result = await fetchSeasonData(supabase, "team-1", SEASON);
    const p1 = result.players.find((p) => p.playerId === "p-1");

    expect(p1?.attendancePct).toBe(100);
  });

  it("absent à tous les trainings + présent à tous les matchs => attendancePct = 0 (pas 100)", async () => {
    const supabase = makeSupabase({
      events: [
        { id: "tr-1", type: "training", event_date: "2024-09-01T18:00:00Z" },
        { id: "tr-2", type: "training", event_date: "2024-09-08T18:00:00Z" },
        { id: "m-1", type: "match", event_date: "2024-09-14T14:00:00Z" },
        { id: "m-2", type: "match", event_date: "2024-09-21T14:00:00Z" },
      ],
      attendances: [
        { event_id: "tr-1", user_id: "p-1", status: "absent" },
        { event_id: "tr-2", user_id: "p-1", status: "absent" },
        { event_id: "m-1", user_id: "p-1", status: "present" },
        { event_id: "m-2", user_id: "p-1", status: "present" },
      ],
      profiles: [player("p-1")],
    });

    const result = await fetchSeasonData(supabase, "team-1", SEASON);
    const p1 = result.players.find((p) => p.playerId === "p-1");

    expect(p1?.attendancePct).toBe(0);
  });

  it("non-régression : les buts restent calculés sur les matchs, indépendamment de l'assiduité", async () => {
    const supabase = makeSupabase({
      events: [
        { id: "tr-1", type: "training", event_date: "2024-09-01T18:00:00Z" },
        { id: "m-1", type: "match", event_date: "2024-09-14T14:00:00Z", score_us: 2, score_them: 1, match_result: "win" },
        { id: "m-2", type: "match", event_date: "2024-09-21T14:00:00Z", score_us: 1, score_them: 1, match_result: "draw" },
      ],
      attendances: [
        { event_id: "tr-1", user_id: "p-1", status: "absent" },
        { event_id: "m-1", user_id: "p-1", status: "present" },
        { event_id: "m-2", user_id: "p-1", status: "present" },
      ],
      matchStats: [
        { event_id: "m-1", player_id: "p-1", goals: 2 },
        { event_id: "m-2", player_id: "p-1", goals: 1 },
      ],
      profiles: [player("p-1")],
    });

    const result = await fetchSeasonData(supabase, "team-1", SEASON);
    const p1 = result.players.find((p) => p.playerId === "p-1");

    // Non-régression : les stats de match ne doivent pas être affectées par la correction training-only.
    expect(p1?.goals).toBe(3);
    // Bug ciblé : l'assiduité doit venir du training (absent) et non des matchs (présent aux 2).
    expect(p1?.attendancePct).toBe(0);
  });
});
