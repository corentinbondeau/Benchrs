import { createAdminClient } from "@/lib/supabase/admin";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface RegisterInput {
  email: unknown;
  password: unknown;
  firstName: unknown;
  lastName: unknown;
  role: unknown;
  phone: unknown;
}

export interface RegisterResult {
  ok: boolean;
  error?: string;
  status?: number;
  user?: unknown;
}

/**
 * Logique métier partagée de création de compte (validation + création
 * auth user admin + insert profiles). Utilisée par la route JSON
 * `/api/auth/register` et par le handler HTML legacy `/legacy/register`.
 * Ne doit jamais dépendre du format de la requête (JSON vs form-urlencoded) :
 * les deux appelants sont responsables de parser leur payload en amont.
 */
export async function registerUser(input: RegisterInput): Promise<RegisterResult> {
  const { email, password, firstName, lastName, role, phone } = input;

  if (!email || !password || !firstName || !lastName) {
    return { ok: false, error: "Champs obligatoires manquants", status: 400 };
  }

  if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    return { ok: false, error: "Email invalide", status: 400 };
  }

  if (typeof password !== "string" || password.length < 8) {
    return {
      ok: false,
      error: "Le mot de passe doit contenir au moins 8 caractères",
      status: 400,
    };
  }

  if (
    typeof firstName !== "string" ||
    typeof lastName !== "string" ||
    !firstName.trim() ||
    !lastName.trim() ||
    firstName.trim().length > 100 ||
    lastName.trim().length > 100
  ) {
    return { ok: false, error: "Nom invalide", status: 400 };
  }

  if (phone && (typeof phone !== "string" || phone.length > 30)) {
    return { ok: false, error: "Téléphone invalide", status: 400 };
  }

  const supabase = createAdminClient();

  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
    });

  if (authError) {
    return { ok: false, error: authError.message, status: 400 };
  }

  // Le rôle est per-équipe : il est demandé à la rejoint d'une équipe,
  // pas à l'inscription. On garde un défaut "player" pour le profil.
  // Le rôle client est borné à player/parent — jamais coach/owner (per-team).
  const requestedRole = typeof role === "string" ? role : "";
  const profileRole: "player" | "parent" =
    requestedRole === "parent" ? "parent" : "player";

  const { error: profileError } = await supabase.from("profiles").insert({
    id: authData.user.id,
    role: profileRole,
    first_name: firstName.trim(),
    last_name: lastName.trim(),
    phone: phone || null,
    is_active: true,
  });

  if (profileError) {
    await supabase.auth.admin.deleteUser(authData.user.id);
    return { ok: false, error: profileError.message, status: 400 };
  }

  return { ok: true, user: authData.user };
}
