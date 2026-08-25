import { createClient } from "@/lib/supabase/server";
import { renderPage } from "@/lib/legacy/html";

/**
 * Page menu legacy (`/legacy`) — HTML brut, zéro React, zéro bundle Next.js.
 * Destinée aux navigateurs/OS anciens ne supportant pas le runtime moderne
 * (voir `src/lib/legacy/ua.ts` pour la détection UA, branchée sur `proxy.ts`
 * à l'étape 7).
 */
export async function GET() {
  // Défensif : la page legacy doit rester consultable (menu visiteur) même
  // si la session Supabase n'a pas pu être résolue (config manquante,
  // Supabase indisponible, cookie invalide...).
  let isLoggedIn = false;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    isLoggedIn = !!user;
  } catch {
    isLoggedIn = false;
  }

  const body = isLoggedIn
    ? `<div class="container" style="text-align:center;">
  <img src="/favicon.png" width="48" height="48" alt="Benchrs" style="display:block;margin:0 auto 8px auto;">
  <h1>Benchrs</h1>
  <nav>
    <ul style="list-style:none;padding:0;">
      <li><a href="/legacy/attendance">Mes présences</a></li>
    </ul>
  </nav>
</div>`
    : `<div class="container" style="text-align:center;">
  <img src="/favicon.png" width="48" height="48" alt="Benchrs" style="display:block;margin:0 auto 8px auto;">
  <h1>Benchrs</h1>
  <nav>
    <ul style="list-style:none;padding:0;">
      <li><a href="/legacy/login">Connexion</a></li>
      <li><a href="/legacy/register">Inscription</a></li>
      <li><a href="/legacy/attendance">Mes présences</a></li>
    </ul>
  </nav>
</div>`;

  const html = renderPage({ title: "Benchrs - Menu", body });

  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
