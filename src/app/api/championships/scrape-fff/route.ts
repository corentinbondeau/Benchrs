import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "coach") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const body = await req.json();
  const { url, championship_id } = body;

  if (!url) {
    return NextResponse.json({ error: "URL requise" }, { status: 400 });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SportPlus/1.0)",
        Accept: "text/html",
      },
    });

    if (!response.ok) {
      return NextResponse.json({ error: `Erreur HTTP ${response.status}` }, { status: 500 });
    }

    const html = await response.text();

    const teamRows: { name: string; played: number; won: number; drawn: number; lost: number; goals_for: number; goals_against: number; points: number }[] = [];

    const tableRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let match;
    while ((match = tableRegex.exec(html)) !== null) {
      const row = match[1];
      const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      const cells: string[] = [];
      let cellMatch;
      while ((cellMatch = cellRegex.exec(row)) !== null) {
        cells.push(cellMatch[1].replace(/<[^>]+>/g, "").trim());
      }

      if (cells.length >= 8) {
        const name = cells[0];
        if (!name || name.match(/^\d+$/) || name.toLowerCase().includes("journée")) continue;

        const nums = cells.slice(1).map((c) => parseInt(c) || 0);
        if (nums.length >= 7) {
          teamRows.push({
            name,
            played: nums[0],
            won: nums[1],
            drawn: nums[2],
            lost: nums[3],
            goals_for: nums[4],
            goals_against: nums[5],
            points: nums[6],
          });
        }
      }
    }

    if (teamRows.length === 0) {
      return NextResponse.json(
        { error: "Aucun classement trouvé sur cette page. Vérifiez l'URL." },
        { status: 422 }
      );
    }

    const supabase = await createClient();

    if (championship_id) {
      for (const team of teamRows) {
        const { error } = await supabase
          .from("championship_teams")
          .upsert(
            {
              championship_id,
              team_name: team.name,
              played: team.played,
              won: team.won,
              drawn: team.drawn,
              lost: team.lost,
              goals_for: team.goals_for,
              goals_against: team.goals_against,
              points: team.points,
            },
            { onConflict: "championship_id,team_name" }
          );

        if (error) {
          console.error("Error upserting team:", error);
        }
      }
    }

    return NextResponse.json({
      success: true,
      imported: teamRows.length,
      teams: teamRows,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Erreur lors du scraping: ${String(err)}` },
      { status: 500 }
    );
  }
}
