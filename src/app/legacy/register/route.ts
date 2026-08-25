import { renderPage, field, escapeHtml } from "@/lib/legacy/html";
import { registerUser } from "@/lib/auth/register";
import { rateLimit, AUTH_LIMIT, clientKey } from "@/lib/rateLimit";

/**
 * Page d'inscription legacy (`/legacy/register`) — HTML brut, zéro React,
 * zéro bundle Next.js. Form POST natif, réutilise la logique métier de
 * `registerUser` partagée avec la route JSON `/api/auth/register`.
 */

interface RegisterFormValues {
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  phone?: string;
}

function renderRegisterPage(options: {
  values?: RegisterFormValues;
  error?: string;
}): string {
  const { values = {}, error } = options;
  const { email, firstName, lastName, role, phone } = values;

  const errorBlock = error
    ? `<p class="error">${escapeHtml(error)}</p>`
    : "";

  const selectedPlayer = role === "parent" ? "" : "selected";
  const selectedParent = role === "parent" ? "selected" : "";

  const body = `${errorBlock}
  <form method="POST" action="/legacy/register">
    ${field({ name: "firstName", label: "Prénom", type: "text", value: firstName })}
    ${field({ name: "lastName", label: "Nom", type: "text", value: lastName })}
    ${field({ name: "email", label: "Email", type: "email", value: email })}
    ${field({ name: "phone", label: "Téléphone (optionnel)", type: "tel", value: phone })}
    ${field({ name: "password", label: "Mot de passe", type: "password" })}
    <label for="role">Rôle</label>
    <select id="role" name="role">
      <option value="player" ${selectedPlayer}>Joueur</option>
      <option value="parent" ${selectedParent}>Parent</option>
    </select>
    <button type="submit">S'inscrire</button>
  </form>`;

  return renderPage({
    title: "Créer un compte",
    body,
    layout: "auth",
    subtitle: "Rejoignez Benchrs en quelques clics",
    footer: {
      text: "Déjà un compte ?",
      linkHref: "/legacy/login",
      linkLabel: "Se connecter",
    },
  });
}

function htmlResponse(html: string, status: number): Response {
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function GET() {
  return htmlResponse(renderRegisterPage({}), 200);
}

export async function POST(request: Request) {
  let email = "";
  let password = "";
  let firstName = "";
  let lastName = "";
  let role = "";
  let phone = "";

  try {
    const formData = await request.formData();
    email = String(formData.get("email") ?? "");
    password = String(formData.get("password") ?? "");
    firstName = String(formData.get("firstName") ?? "");
    lastName = String(formData.get("lastName") ?? "");
    role = String(formData.get("role") ?? "");
    phone = String(formData.get("phone") ?? "");
  } catch {
    return htmlResponse(
      renderRegisterPage({ error: "Requête invalide, veuillez réessayer." }),
      400
    );
  }

  const values: RegisterFormValues = { email, firstName, lastName, role, phone };

  if (!rateLimit(`auth:register:${clientKey(request)}`, AUTH_LIMIT)) {
    return htmlResponse(
      renderRegisterPage({
        values,
        error: "Trop de tentatives, réessayez dans une minute.",
      }),
      429
    );
  }

  let result;
  try {
    result = await registerUser({
      email,
      password,
      firstName,
      lastName,
      role,
      phone,
    });
  } catch {
    return htmlResponse(
      renderRegisterPage({
        values,
        error: "Erreur interne du serveur, veuillez réessayer.",
      }),
      500
    );
  }

  if (!result.ok) {
    return htmlResponse(
      renderRegisterPage({ values, error: result.error ?? "Inscription invalide." }),
      result.status ?? 400
    );
  }

  return new Response(null, {
    status: 303,
    headers: { Location: "/legacy/login" },
  });
}
