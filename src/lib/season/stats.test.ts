/**
 * Tests TDD — buildSeasonStatsContext (RED)
 *
 * Règle métier corrigée : l'ASSIDUITÉ (`attendanceRate`) ne doit se calculer
 * QUE sur la présence aux ENTRAÎNEMENTS (`events.type = 'training'`).
 * Les matchs (`events.type = 'match'`) ne doivent JAMAIS entrer dans ce calcul.
 *
 * "présent" = status === "present" || status === "late"
 *
 * ---------------------------------------------------------------------------
 * CONTRAT imposé à @dev pour que ce mock résolve correctement (pattern déjà
 * utilisé 5x dans le repo — cf TODO) :
 *
 *   1. Récupérer les entraînements de l'équipe (et du range mensuel) :
 *      supabase.from("events").select(...).eq("team_id", teamId)
 *              .eq("type", "training")
 *              .gte("event_date", ...).lt("event_date", ...)
 *      → en extraire `trainingIds = training.map(e => e.id)`
 *
 *   2. Filtrer les attendances sur ces ids :
 *      supabase.from("attendances").select("status, event_id" /* ou équivalent *\/)
 *              .eq("team_id", teamId)
 *              .in("status", [...])
 *              .in("event_id", trainingIds)
 *
 * Le mock ci-dessous est un faux client Supabase "thenable" générique : il
 * enregistre chaque maillon de chaîne (.eq/.in/.gte/.lt/...) puis résout la
 * requête quand elle est awaited, en inspectant les appels enregistrés.
 * Il est tolérant à l'ORDRE des filtres mais requiert la stratégie en 2
 * requêtes (events type=training → trainingIds → attendances.in("event_id", ids)),
 * qui est la stratégie déjà en place partout ailleurs dans le repo.
 * ---------------------------------------------------------------------------
 */

import { describe, it, expect } from "vitest";
import { buildSeasonStatsContext } from "@/lib/season/stats";

type Call = [string, unknown[]];

interface EventFixture {
  id: string;
  type: "match" | "training";
  status?: string;
  event_date?: string;
}

interface AttendanceFixture {
  event_id: string;
  status: string;
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
  // Rend la chaîne "thenable" comme un vrai query builder Supabase
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
  teamName?: string;
  events: EventFixture[];
  attendances: AttendanceFixture[];
}) {
  const teamName = opts.teamName ?? "Team Test";

  return {
    from: (table: string) => {
      if (table === "teams") {
        return makeChain(() => ({ data: { name: teamName }, error: null }));
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
          const trainingIds = inArgFor(calls, "event_id");
          const filtered =
            trainingIds !== undefined
              ? opts.attendances.filter((a) => trainingIds.includes(a.event_id))
              : opts.attendances;
          return { data: filtered.map((a) => ({ status: a.status })), error: null };
        });
      }
      if (table === "match_stats") {
        return makeChain(() => ({ data: [], error: null }));
      }
      if (table === "team_members") {
        return makeChain(() => ({ data: [], error: null }));
      }
      if (table === "gallery_media") {
        return makeChain(() => ({ data: [], error: null }));
      }
      return makeChain(() => ({ data: [], error: null }));
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("buildSeasonStatsContext — assiduité training-only", () => {
  it("ne compte PAS les présences aux matchs : absent à tous les trainings + présent à tous les matchs => attendanceRate = 0", async () => {
    const supabase = makeSupabase({
      events: [
        { id: "tr-1", type: "training" },
        { id: "tr-2", type: "training" },
        { id: "m-1", type: "match" },
        { id: "m-2", type: "match" },
      ],
      attendances: [
        { event_id: "tr-1", status: "absent" },
        { event_id: "tr-2", status: "absent" },
        { event_id: "m-1", status: "present" },
        { event_id: "m-2", status: "present" },
      ],
    });

    const ctx = await buildSeasonStatsContext(supabase, "team-1", null);

    expect(ctx.attendanceRate).toBe(0);
  });

  it("présent à tous les trainings + absent à tous les matchs => attendanceRate = 100 (pas 50)", async () => {
    const supabase = makeSupabase({
      events: [
        { id: "tr-1", type: "training" },
        { id: "tr-2", type: "training" },
        { id: "m-1", type: "match" },
        { id: "m-2", type: "match" },
      ],
      attendances: [
        { event_id: "tr-1", status: "present" },
        { event_id: "tr-2", status: "late" },
        { event_id: "m-1", status: "absent" },
        { event_id: "m-2", status: "absent" },
      ],
    });

    const ctx = await buildSeasonStatsContext(supabase, "team-1", null);

    expect(ctx.attendanceRate).toBe(100);
  });

  it("aucun entraînement sur la période => attendanceRate = null (pas de division par un total incluant des matchs)", async () => {
    const supabase = makeSupabase({
      events: [
        { id: "m-1", type: "match" },
        { id: "m-2", type: "match" },
      ],
      attendances: [
        { event_id: "m-1", status: "present" },
        { event_id: "m-2", status: "present" },
      ],
    });

    const ctx = await buildSeasonStatsContext(supabase, "team-1", null);

    expect(ctx.attendanceRate).toBeNull();
  });
});
