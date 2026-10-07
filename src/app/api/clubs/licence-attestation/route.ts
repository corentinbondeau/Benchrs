import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, unauthorized, forbidden } from "@/lib/api-auth";
import { rateLimit } from "@/lib/rateLimit";
import { renderLicenceAttestationPdf } from "@/lib/export/licenceAttestationPdf";
import { fffCategoryFromBirthDate } from "@/lib/vmaNorms";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized("unauthorized");

  if (!rateLimit(`club-attestation:${user.id}`, { limit: 20, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const clubId = body?.clubId as string | undefined;
  const playerId = body?.playerId as string | undefined;
  const season = body?.season as string | undefined;
  if (!clubId || !playerId || !season || !/^\d{4}-\d{4}$/.test(season)) {
    return NextResponse.json({ error: "clubId, playerId et saison requis" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: membership } = await supabase
    .from("club_members")
    .select("id")
    .eq("club_id", clubId)
    .eq("user_id", user.id)
    .eq("role", "comite")
    .maybeSingle();
  if (!membership) return forbidden();

  try {
    const [{ data: club }, { data: teams }, { data: player }, { data: playerMembership }, { data: licence }] =
      await Promise.all([
        supabase.from("clubs").select("id, name, fff_number").eq("id", clubId).maybeSingle(),
        supabase.from("teams").select("id, name").eq("club_id", clubId),
        supabase
          .from("profiles")
          .select("id, first_name, last_name, date_of_birth, licence_number")
          .eq("id", playerId)
          .maybeSingle(),
        (async () => {
          const { data: teamsTmp } = await supabase
            .from("teams")
            .select("id")
            .eq("club_id", clubId);
          const ids = ((teamsTmp || []) as { id: string }[]).map((t) => t.id);
          if (ids.length === 0) return { data: null };
          return supabase
            .from("team_members")
            .select("team_id")
            .in("team_id", ids)
            .eq("user_id", playerId)
            .eq("role", "player")
            .maybeSingle();
        })(),
        supabase
          .from("licences")
          .select("status, player_id")
          .eq("season", season)
          .eq("player_id", playerId)
          .maybeSingle(),
      ]);
    if (!club) return NextResponse.json({ error: "Club introuvable" }, { status: 404 });
    if (!player) return NextResponse.json({ error: "Joueur introuvable" }, { status: 404 });
    if (!licence) {
      return NextResponse.json({ error: "Aucune licence pour ce joueur cette saison" }, { status: 404 });
    }
    const playerTeamId = (playerMembership as { team_id: string } | null)?.team_id;
    const teamName =
      ((teams || []) as { id: string; name: string }[]).find((t) => t.id === playerTeamId)?.name ||
      "Équipe";

    const pdfBuffer = await renderLicenceAttestationPdf({
      clubName: (club as { name: string }).name,
      clubFffNumber: (club as { fff_number: string | null }).fff_number ?? null,
      teamName,
      season,
      lastName: player.last_name,
      firstName: player.first_name,
      birthDate: player.date_of_birth
        ? new Date(player.date_of_birth).toLocaleDateString("fr-FR")
        : null,
      category: fffCategoryFromBirthDate(player.date_of_birth),
      licenceNumber: player.licence_number ?? null,
      status: licence.status,
      issuedAt: new Date().toLocaleDateString("fr-FR"),
    });

    return NextResponse.json({
      pdf: `data:application/pdf;base64,${pdfBuffer.toString("base64")}`,
    });
  } catch (e) {
    console.error("[clubs/licence-attestation] échec:", e);
    return NextResponse.json(
      { error: "Erreur lors de la génération de l'attestation" },
      { status: 500 }
    );
  }
}