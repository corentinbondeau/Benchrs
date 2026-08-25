import { createClient } from "@/lib/supabase/server";
import { renderPage, field, escapeHtml } from "@/lib/legacy/html";

/**
 * Page de connexion legacy (`/legacy/login`) — HTML brut, zéro React, zéro
 * bundle Next.js. Form POST natif, compatible vieux navigateurs sans JS.
 */

function renderLoginPage(options: {
  email?: string;
  error?: string;
}): string {
  const { email, error } = options;

  const errorBlock = error
    ? `<p class="error">${escapeHtml(error)}</p>`
    : "";

  const body = `${errorBlock}
  <form method="POST" action="/legacy/login">
    ${field({ name: "email", label: "Email", type: "email", value: email })}
    ${field({ name: "password", label: "Mot de passe", type: "password" })}
    <button type="submit">Se connecter</button>
  </form>
  <p><a href="/legacy">Retour</a></p>`;

  return renderPage({
    title: "Connexion",
    body,
    layout: "auth",
    subtitle: "Connectez-vous à votre compte Benchrs",
    footer: {
      text: "Pas encore de compte ?",
      linkHref: "/legacy/register",
      linkLabel: "Créer un compte",
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
  return htmlResponse(renderLoginPage({}), 200);
}

export async function POST(request: Request) {
  let email = "";
  let password = "";

  try {
    const formData = await request.formData();
    email = String(formData.get("email") ?? "");
    password = String(formData.get("password") ?? "");
  } catch {
    return htmlResponse(
      renderLoginPage({ error: "Requête invalide, veuillez réessayer." }),
      400
    );
  }

  if (!email || !password) {
    return htmlResponse(
      renderLoginPage({
        email,
        error: "Email et mot de passe sont requis.",
      }),
      400
    );
  }

  let authFailed = false;
  try {
    const supabase = await createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    authFailed = !!authError;
  } catch {
    // Config Supabase manquante ou service indisponible : ne jamais crasher
    // le serveur, on retombe sur le re-render du form avec erreur.
    authFailed = true;
  }

  if (authFailed) {
    return htmlResponse(
      renderLoginPage({
        email,
        error: "Email ou mot de passe incorrect.",
      }),
      401
    );
  }

  // createClient() écrit déjà les cookies de session via cookies() (next/headers),
  // qui persiste sur la réponse d'un Route Handler. Il suffit de rediriger.
  return new Response(null, {
    status: 303,
    headers: { Location: "/legacy" },
  });
}
