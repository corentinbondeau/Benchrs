import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { defaultNotificationPrefs } from "@/lib/notificationTypes";
import { getAuthUser, unauthorized } from "@/lib/api-auth";
import { normalizeClubName, normalizeFffNumber } from "@/lib/clubs";
import { rateLimit, AUTH_LIMIT, clientKey } from "@/lib/rateLimit";

export async function POST(req: Request) {
  try {
    if (!rateLimit(`auth:create-team:${clientKey(req)}`, AUTH_LIMIT)) {
      return NextResponse.json(
        { error: "Trop de tentatives, réessayez dans une minute" },
        { status: 429 }
      );
    }
    const user = await getAuthUser(req);
    if (!user) return unauthorized();

    const { clubName, teamName, fffNumber, matchFormat, halfDuration } = await req.json();

    if (!clubName || !teamName) {
      return NextResponse.json(
        { error: "Champs obligatoires manquants" },
        { status: 400 }
      );
    }

    const clubNameStr = String(clubName).trim();
    const teamNameStr = String(teamName).trim();
    if (!clubNameStr || !teamNameStr || clubNameStr.length > 100 || teamNameStr.length > 100) {
      return NextResponse.json({ error: "Nom invalide" }, { status: 400 });
    }

    // Numéro d'affiliation FFF : obligatoire, 6 chiffres, identité canonique du club.
    const fff = normalizeFffNumber(String(fffNumber ?? ""));
    if (!fff) {
      return NextResponse.json(
        { error: "Numéro d'affiliation FFF invalide (6 chiffres requis)" },
        { status: 400 }
      );
    }

    const userId = user.id;
    const supabase = createAdminClient();

    // Un club = un numéro FFF : s'il existe déjà, on le réutilise (pas de doublon).
    let clubId: string;
    let clubDisplayName = clubNameStr;

    const { data: existingClub } = await supabase
      .from("clubs")
      .select("id, name")
      .eq("fff_number", fff)
      .maybeSingle();

    if (existingClub) {
      clubId = existingClub.id;
      clubDisplayName = existingClub.name;
    } else {
      const { data: newClub, error: clubError } = await supabase
        .from("clubs")
        .insert({
          name: clubNameStr,
          fff_number: fff,
          name_normalized: normalizeClubName(clubNameStr),
          created_by: userId,
          comite_invite_code: crypto
            .randomUUID()
            .replaceAll("-", "")
            .slice(0, 12),
        })
        .select()
        .single();

      if (clubError) {
        console.error("[create-team] club error:", clubError);
        // Course : un autre club a été créé avec le même numéro entre-temps
        if (clubError.code === "23505") {
          const { data: raceClub } = await supabase
            .from("clubs")
            .select("id, name")
            .eq("fff_number", fff)
            .maybeSingle();
          if (raceClub) {
            clubId = raceClub.id;
            clubDisplayName = raceClub.name;
          } else {
            return NextResponse.json({ error: clubError.message }, { status: 400 });
          }
        } else {
          return NextResponse.json({ error: clubError.message }, { status: 400 });
        }
      } else {
        clubId = newClub.id;
      }
    }

    // Create team
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .insert({ club_id: clubId, name: teamNameStr })
      .select()
      .single();

    if (teamError) {
      console.error("[create-team] team error:", teamError);
      if (teamError.code === "23505") {
        return NextResponse.json(
          { error: "Cette équipe existe déjà pour ce club" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: teamError.message }, { status: 400 });
    }

    // Add user as owner
    const { error: memberError } = await supabase
      .from("team_members")
      .insert({ team_id: team.id, user_id: userId, role: "owner" });

    if (memberError) {
      console.error("[create-team] member error:", memberError);
      return NextResponse.json({ error: memberError.message }, { status: 400 });
    }

    // Update user profile with team_id
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ team_id: team.id })
      .eq("id", userId);

    if (profileError) {
      console.error("[create-team] profile update error:", profileError);
    }

    // Créer les paramètres de match de l'équipe
    const matchFormatVal = typeof matchFormat === "number" && [5, 7, 8, 11].includes(matchFormat) ? matchFormat : 11;
    const halfDurationVal = typeof halfDuration === "number" && halfDuration >= 15 && halfDuration <= 45 ? halfDuration : 45;

    await supabase.from("team_settings").upsert({
      team_id: team.id,
      match_format: matchFormatVal,
      half_duration: halfDurationVal,
    }, { onConflict: "team_id" });

    // Create default chat channel (non-blocking)
    const { error: channelError } = await supabase.from("chat_channels").insert({
      name: "General",
      description: "Canal général de l'équipe",
      team_id: team.id,
    });

    if (channelError) {
      console.error("[create-team] chat channel error:", channelError);
    }

    // Notifications activées par défaut pour le créateur de l'équipe
    await supabase.from("notification_preferences").upsert(
      defaultNotificationPrefs(userId, team.id),
      { onConflict: "user_id,team_id,type" }
    );

    return NextResponse.json({
      team,
      club: { id: clubId },
      clubName: clubDisplayName,
      inviteCode: team.invite_code,
      message: "Équipe créée avec succès",
    });
  } catch (err) {
    console.error("[create-team] unexpected error:", err);
    return NextResponse.json(
      { error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }
}
