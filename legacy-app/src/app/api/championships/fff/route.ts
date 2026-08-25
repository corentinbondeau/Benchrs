import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, unauthorized, forbidden, isTeamMember } from "@/lib/api-auth";

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

interface FFFMatch {
  matchday: number | null;
  date: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function isAllowedFffUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  const allowed =
    host === "fff.fr" ||
    host === "www.fff.fr" ||
    host.endsWith(".fff.fr") ||
    host === "media.fff.fr" ||
    host.endsWith(".media.fff.fr");
  return parsed.protocol === "https:" && allowed;
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

function parseCalendarTable(html: string): FFFMatch[] {
  const matches: FFFMatch[] = [];

  const tableMatch =
    html.match(/<table[^>]*class="[^"]*calendrier[^"]*"[^>]*>([\s\S]*?)<\/table>/i) ??
    html.match(/<table[^>]*class="[^"]*resultat[^"]*"[^>]*>([\s\S]*?)<\/table>/i) ??
    html.match(/<table[^>]*>([\s\S]*?)<\/table>/gi)?.find((t) => /calendrier|resultat|match/i.test(t));

  if (!tableMatch) return matches;

  const tableHtml = Array.isArray(tableMatch) ? tableMatch[1] || tableMatch[0] : tableMatch;
  const rows = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? [];

  let currentMatchday: number | null = null;
  const dateRegex = /\d{2}\/\d{2}\/\d{4}/;
  const scoreRegex = /(\d+)\s*[-–]\s*(\d+)/;

  for (const row of rows) {
    const cells = row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) ?? [];
    if (cells.length < 2) continue;

    const values = cells.map(stripTags);

    const hasHeader = values.some((v) =>
      /date|equipe|domicile|exterieur|score|journée|journee/i.test(v)
    );
    if (hasHeader) continue;

    const firstVal = values[0]?.trim() || "";
    const dateMatch = firstVal.match(dateRegex);

    if (dateMatch) {
      const match: FFFMatch = {
        matchday: currentMatchday,
        date: dateMatch[0],
        home_team: "",
        away_team: "",
        home_score: null,
        away_score: null,
      };

      let scoreFound = false;
      const textValues = values.filter((v) => {
        const cleaned = v.replace(/^\d{2}\/\d{2}\/\d{4}/, "").trim();
        if (cleaned && !/^\d+$/.test(cleaned)) return true;
        return false;
      });

      if (values.length >= 4) {
        const scoreCell = values.find((v) => scoreRegex.test(v));
        if (scoreCell) {
          const s = scoreCell.match(scoreRegex);
          if (s) {
            match.home_score = parseInt(s[1]);
            match.away_score = parseInt(s[2]);
            scoreFound = true;
          }
        }

        const nonDateNonScore = values.filter((v) => {
          const cleaned = v.replace(/^\d{2}\/\d{2}\/\d{4}/, "").trim();
          if (!cleaned || /^\d+[-–]\d+$/.test(cleaned) || /^\d+$/.test(cleaned)) return false;
          return true;
        });

        if (nonDateNonScore.length >= 2) {
          match.home_team = nonDateNonScore[0];
          match.away_team = nonDateNonScore[nonDateNonScore.length - 1];
        } else if (nonDateNonScore.length === 1) {
          match.home_team = nonDateNonScore[0];
        }
      }

      if (match.home_team || match.away_team) {
        matches.push(match);
      }
    } else if (/journ[eè]e/i.test(firstVal)) {
      const jd = firstVal.match(/(\d+)/);
      currentMatchday = jd ? parseInt(jd[1]) : null;
    }
  }

  return matches;
}

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const body = await req.json();
  const { url, html: rawHtml, championship_id, type = "all" } = body as {
    url?: string;
    html?: string;
    championship_id?: string;
    type?: "standings" | "calendar" | "all";
  };

  if (!url && !rawHtml) {
    return NextResponse.json(
      { error: "URL ou HTML requis" },
      { status: 400 }
    );
  }

  if (championship_id) {
    const supabaseCheck = createAdminClient();
    const { data: championship } = await supabaseCheck
      .from("championships")
      .select("id, team_id")
      .eq("id", championship_id)
      .maybeSingle();

    if (!championship || !(await isTeamMember(user.id, championship.team_id))) {
      return forbidden();
    }
  }

  // SSRF : n'autoriser que le domaine fff.fr en HTTPS (y compris après redirection)
  if (url) {
    if (!isAllowedFffUrl(url)) {
      return NextResponse.json(
        { error: "Seules les URL https://www.fff.fr sont autorisées" },
        { status: 400 }
      );
    }
  }

  let html = rawHtml;

  if (!html && url) {
    try {
      // Suivi manuel des redirections : chaque étape doit rester sur un domaine fff.fr.
      let currentUrl = url;
      let res: Response | null = null;
      for (let i = 0; i < 3; i++) {
        const candidate = await fetch(currentUrl, {
          redirect: "manual",
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
        res = candidate;
        if (![301, 302, 303, 307, 308].includes(res.status)) break;
        const location = res.headers.get("location");
        if (!location) break;
        currentUrl = new URL(location, currentUrl).toString();
        if (!isAllowedFffUrl(currentUrl)) {
          return NextResponse.json(
            { error: "Redirection hors domaine fff.fr refusée" },
            { status: 400 }
          );
        }
      }

      if (!res || !res.ok) {
        const status = res?.status ?? 0;
        return NextResponse.json(
          {
            error: `Impossible de recuperer la page FFF (HTTP ${status}). Le site FFF bloque parfois les requetes serveur. Essayez de copier-coller le HTML de la page.`,
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

  const result: { teams?: FFFTeam[]; matches?: FFFMatch[] } = {};

  if (type === "standings" || type === "all") {
    const teams = parseStandingsTable(html);
    result.teams = teams;
  }

  if (type === "calendar" || type === "all") {
    const matches = parseCalendarTable(html);
    result.matches = matches;
  }

  if ((type === "standings" || type === "all") && (!result.teams || result.teams.length === 0)) {
    return NextResponse.json(
      {
        ...result,
        error: "Aucun classement trouve dans le contenu. Verifiez que la page contient un tableau de classement.",
      },
      { status: 422 }
    );
  }

  if (championship_id && result.teams) {
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

    const rows: {
      championship_id: string;
      home_team: string;
      away_team: string;
      home_score: number;
      away_score: number;
      matchday_number: number | null;
    }[] = result.teams.map((t) => ({
      championship_id,
      home_team: t.team_name,
      away_team: "",
      home_score: t.points,
      away_score: 0,
      matchday_number: null,
    }));

    if (result.matches) {
      for (const m of result.matches) {
        rows.push({
          championship_id,
          home_team: m.home_team,
          away_team: m.away_team,
          home_score: m.home_score ?? 0,
          away_score: m.away_score ?? 0,
          matchday_number: m.matchday ?? null,
        });
      }
    }

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

  return NextResponse.json(result);
}
