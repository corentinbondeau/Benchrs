import { createClient } from "@/lib/supabase/server";
import { renderPage, navCard } from "@/lib/legacy/html";

/**
 * Page menu legacy (`/legacy`) — HTML brut, zéro React, zéro bundle Next.js.
 * Destinée aux navigateurs/OS anciens ne supportant pas le runtime moderne
 * (voir `src/lib/legacy/ua.ts` pour la détection UA, branchée sur `proxy.ts`).
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

  const cards = isLoggedIn
    ? navCard({
        href: "/legacy/attendance",
        label: "Présences",
        sublabel: "Répondre aux convocations",
        icon: "✓",
        tint: "#EFF6FF",
        iconColor: "#2563EB",
      })
    : [
        navCard({
          href: "/legacy/login",
          label: "Connexion",
          sublabel: "Accéder à mon compte",
          icon: "→",
          tint: "#EFF6FF",
          iconColor: "#2563EB",
        }),
        navCard({
          href: "/legacy/register",
          label: "Inscription",
          sublabel: "Créer un compte",
          icon: "+",
          tint: "#ECFDF5",
          iconColor: "#16A34A",
        }),
        navCard({
          href: "/legacy/attendance",
          label: "Présences",
          sublabel: "Répondre aux convocations",
          icon: "✓",
          tint: "#FFFBEB",
          iconColor: "#B45309",
        }),
      ].join("\n");

  const body = `<h1>Bonjour</h1>
<p class="help-text">Version simplifiée, compatible avec votre appareil.</p>
<div class="nav-grid">
${cards}
</div>`;

  const html = renderPage({ title: "Benchrs - Accueil", body });

  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
