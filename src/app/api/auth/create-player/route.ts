import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, isTeamCoach, isTeamMember } from "@/lib/api-auth";
import crypto from "crypto";

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await req.json();
  const { teamId, firstName, lastName, dateOfBirth, position, shirtNumber, email } = body;

  if (!teamId || typeof teamId !== "string") {
    return NextResponse.json({ error: "teamId requis" }, { status: 400 });
  }
  if (!firstName || typeof firstName !== "string" || firstName.trim().length === 0) {
    return NextResponse.json({ error: "Prénom requis" }, { status: 400 });
  }
  if (!lastName || typeof lastName !== "string" || lastName.trim().length === 0) {
    return NextResponse.json({ error: "Nom requis" }, { status: 400 });
  }

  // Vérifier que l'appelant est coach/owner OU parent de l'équipe
  const isCoach = await isTeamCoach(user.id, teamId);
  const isMember = await isTeamMember(user.id, teamId);
  if (!isCoach && !isMember) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  // Vérifier le rôle de l'appelant dans l'équipe
  const supabase = createAdminClient();
  const { data: callerMember } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", user.id)
    .maybeSingle();

  const callerRole = (callerMember as { role: string } | null)?.role;
  if (!callerRole || !["owner", "coach", "parent"].includes(callerRole)) {
    return NextResponse.json({ error: "Seuls les coachs et parents peuvent ajouter un joueur" }, { status: 403 });
  }

  // Valider l'email si fourni
  const hasRealEmail = typeof email === "string" && email.trim().length > 0 && email.includes("@");
  if (typeof email === "string" && email.trim().length > 0 && !email.includes("@")) {
    return NextResponse.json({ error: "Adresse email invalide" }, { status: 400 });
  }

  // Créer le compte auth — avec l'email de l'enfant ou un email de service
  const accountEmail = hasRealEmail ? email.trim() : `joueur-${crypto.randomUUID().slice(0, 8)}@benchrs.app`;
  const accountPassword = crypto.randomUUID(); // mot de passe aléatoire

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: accountEmail,
    password: accountPassword,
    email_confirm: true,
  });

  if (authError?.message?.includes("already been registered")) {
    return NextResponse.json({ error: "Cette adresse email est déjà utilisée" }, { status: 409 });
  }

  if (authError || !authData.user) {
    return NextResponse.json({ error: "Erreur lors de la création du compte" }, { status: 500 });
  }

  const playerId = authData.user.id;

  // Créer le profil
  const { error: profileError } = await supabase.from("profiles").insert({
    id: playerId,
    role: "player",
    first_name: firstName.trim(),
    last_name: lastName.trim(),
    date_of_birth: dateOfBirth || null,
    position: position || null,
    shirt_number: shirtNumber ? parseInt(shirtNumber, 10) || null : null,
    is_active: true,
    team_id: teamId,
  });

  if (profileError) {
    // Rollback : supprimer le user auth
    await supabase.auth.admin.deleteUser(playerId);
    return NextResponse.json({ error: "Erreur lors de la création du profil" }, { status: 500 });
  }

  // Ajouter comme membre de l'équipe
  const { error: memberError } = await supabase.from("team_members").insert({
    team_id: teamId,
    user_id: playerId,
    role: "player",
  });

  if (memberError) {
    return NextResponse.json({ error: "Erreur lors de l'ajout à l'équipe" }, { status: 500 });
  }

  // Si l'appelant est un parent, lier automatiquement
  if (callerRole === "parent") {
    await supabase.from("parent_student").upsert({
      parent_id: user.id,
      student_id: playerId,
      team_id: teamId,
    }, { onConflict: "parent_id,student_id" });
  }

  return NextResponse.json({
    player: { id: playerId, firstName: firstName.trim(), lastName: lastName.trim() },
    message: "Joueur créé avec succès",
  });
}
