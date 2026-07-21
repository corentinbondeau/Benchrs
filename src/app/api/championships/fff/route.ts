import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface FFFTeam {
  team_name: string;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function parseStandingsTable(html: string): FFFTeam[] {
  const teams: FFFTeam[] = [];

  const tableMatch =
    html.match(/<table[^>]*class="[^"]*competition[^"]*"[^>]*>([\s\S]*?)<\/table>/i) ??
    html.match(/<table[^>]*class="[^"]*classement[^"]*"[^>]*>([\s\S]*?)<\/table>/i) ??
    html.match(/<table[^>]*class="[^"]*standing[^"]*"[^>]*>([\s\S]*?)<\/table>/i) ??
    html.match(/<table[^>]*>([\s\S]*?)<\/table>/gi)?.find((t) => /equipe|team|pts|classement/i.test(t));

  if (!tableMatch) return teams;

  const tableHtml = Array.isArray(tableMatch) ? tableMatch[1] || tableMatch[0] : tableMatch;
  const rows = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? [];

  for (const row of rows) {
    const cells = row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) ?? [];
    if (cells.length < 3) continue;

    const values = cells.map(stripTags);

    const hasHeader = values.some((v) =>
      /equipe|team|pts|classement|classe/i.test(v)
    );
    if (hasHeader) continue;

    const numericValues = values
      .map((v) => v.replace(/[+]/g, "").trim())
      .filter((v) => /^\d+$/.test(v))
      .map(Number);

    let teamName = "";
    for (const v of values) {
      const cleaned = v.replace(/^\d+\s*/, "").trim();
      if (
        cleaned.length > 1 &&
        !/^\d+$/.test(cleaned) &&
        !/^(J|V|N|D|BP|BC|Pts|G|P|Diff|F|Pr)$/i.test(cleaned)
      ) {
        teamName = cleaned;
        break;
      }
    }

    if (!teamName || numericValues.length === 0) continue;

    const hasDetailedStats = numericValues.length >= 6;

    const team: FFFTeam = {
      team_name: teamName,
      points: 0,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goals_for: 0,
      goals_against: 0,
    };

    if (hasDetailedStats) {
      const findCol = (headers: string[], label: RegExp): number => {
        const idx = headers.findIndex((h) => label.test(h));
        return idx >= 0 ? idx : -1;
      };

      const headerRow = rows.find((r) => {
        const cs = r.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) ?? [];
        return cs.some((c) => /pts|equipe|classement/i.test(stripTags(c)));
      });

      let headers: string[] = [];
      if (headerRow) {
        const hCells = headerRow.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) ?? [];
        headers = hCells.map(stripTags);
      }

      if (headers.length > 0) {
        const ptsIdx = findCol(headers, /^pts$/i);
        const jIdx = findCol(headers, /^j\.?$/i);
        const gIdx = findCol(headers, /^g\.?$/i);
        const nIdx = findCol(headers, /^n\.?$/i);
        const pIdx = findCol(headers, /^p\.?$/i);
        const bpIdx = findCol(headers, /^bp$/i);
        const bcIdx = findCol(headers, /^bc$/i);

        const numIdxs = values
          .map((v, i) => (/^\d+$/.test(v) ? i : -1))
          .filter((i) => i >= 0);

        if (ptsIdx >= 0 && numIdxs.length > 0) {
          const getNum = (col: number) => {
            if (col < 0) return 0;
            const vi = col - (headers.length - numIdxs.length);
            return vi >= 0 && vi < numIdxs.length ? numericValues[vi] : 0;
          };

          team.points = getNum(ptsIdx);
          team.played = getNum(jIdx);
          team.won = getNum(gIdx);
          team.drawn = getNum(nIdx);
          team.lost = getNum(pIdx);
          team.goals_for = getNum(bpIdx);
          team.goals_against = getNum(bcIdx);
        } else {
          fallbackDistribute(team, numericValues);
        }
      } else {
        fallbackDistribute(team, numericValues);
      }
    } else {
      team.points = numericValues[numericValues.length - 1] ?? 0;
      team.played = numericValues[numericValues.length - 2] ?? 0;
    }

    teams.push(team);
  }

  return teams;
}

function fallbackDistribute(team: FFFTeam, nums: number[]) {
  if (nums.length >= 8) {
    team.points = nums[0];
    team.played = nums[1];
    team.won = nums[2];
    team.drawn = nums[3];
    team.lost = nums[4];
    team.goals_for = nums[5];
    team.goals_against = nums[6];
  } else if (nums.length >= 6) {
    team.points = nums[0];
    team.played = nums[1];
    team.won = nums[2];
    team.drawn = nums[3];
    team.lost = nums[4];
    team.goals_for = nums[5];
  } else if (nums.length >= 2) {
    team.points = nums[nums.length - 1];
    team.played = nums[nums.length - 2];
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const { url, html: rawHtml, championship_id } = body as {
    url?: string;
    html?: string;
    championship_id?: string;
  };

  if (!url && !rawHtml) {
    return NextResponse.json(
      { error: "URL ou HTML requis" },
      { status: 400 }
    );
  }

  let html = rawHtml;

  if (!html && url) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
          "Accept-Encoding": "gzip, deflate, br",
          Referer: "https://www.fff.fr/",
          "sec-ch-ua":
            '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"macOS"',
          "sec-fetch-dest": "document",
          "sec-fetch-mode": "navigate",
          "sec-fetch-site": "same-origin",
        },
      });

      if (!res.ok) {
        return NextResponse.json(
          {
            error: `Impossible de recuperer la page FFF (HTTP ${res.status}). Le site FFF bloque parfois les requetes serveur. Essayez de copier-coller le HTML de la page.`,
          },
          { status: 502 }
        );
      }

      html = await res.text();
    } catch {
      return NextResponse.json(
        {
          error: "Erreur lors de la recuperation de la page FFF. Verifiez l'URL ou collez le HTML directement.",
        },
        { status: 502 }
      );
    }
  }

  if (!html) {
    return NextResponse.json(
      { error: "Aucun contenu HTML a analyser" },
      { status: 400 }
    );
  }

  const teams = parseStandingsTable(html);

  if (teams.length === 0) {
    return NextResponse.json(
      {
        error:
          "Aucun classement trouve dans le contenu. Verifiez que la page contient un tableau de classement.",
        teams: [],
      },
      { status: 422 }
    );
  }

  if (championship_id) {
    const supabase = createAdminClient();

    const { error: delError } = await supabase
      .from("championship_standings")
      .delete()
      .eq("championship_id", championship_id);

    if (delError) {
      return NextResponse.json(
        { error: `Erreur lors de la suppression: ${delError.message}` },
        { status: 500 }
      );
    }

    const rows = teams.map((t) => ({
      championship_id,
      home_team: t.team_name,
      away_team: "",
      home_score: t.points,
      away_score: 0,
      matchday_number: null,
    }));

    const { error: insertError } = await supabase
      .from("championship_standings")
      .insert(rows);

    if (insertError) {
      return NextResponse.json(
        { error: `Erreur lors de la sauvegarde: ${insertError.message}` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ teams });
}
