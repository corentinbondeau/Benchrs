import { createClient } from "@/lib/supabase/server";
import { renderPage, navCard, pageHeader, bottomNav } from "@/lib/legacy/html";
import { getLegacyContext } from "@/lib/legacy/session";
import { legacyNavForRole } from "@/lib/legacy/nav";

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
  let role: "owner" | "coach" | "player" | "parent" | null = null;
  let teamId: string | null = null;

  try {
    const supabase = await createClient();
    const ctx = await getLegacyContext(supabase);
    if (ctx) {
      isLoggedIn = true;
      role = ctx.role;
      teamId = ctx.teamId;
    }
  } catch {
    isLoggedIn = false;
  }

  let hiddenKeys: string[] = [];
  if (isLoggedIn && teamId) {
    try {
      const supabase = await createClient();
      const { data } = await supabase
        .from("team_tab_visibility")
        .select("tab_key")
        .eq("team_id", teamId)
        .eq("visible", false);
      hiddenKeys = ((data ?? []) as Array<{ tab_key: string }>).map((r) => r.tab_key);
    } catch {
      hiddenKeys = [];
    }
  }

  const cards = isLoggedIn
    ? legacyNavForRole(role, { hiddenKeys }).map((item) =>
        navCard({
          href: item.href,
          label: item.label,
          sublabel: item.sublabel,
          icon: item.icon,
          tint: item.tint,
          iconColor: item.iconColor,
        })
      ).join("\n")
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

  const body = `${pageHeader({ title: "Accueil", subtitle: "Bonjour" })}
<div class="nav-grid">
${cards}
</div>`;

  const html = renderPage({
    title: "Benchrs - Accueil",
    body,
    bottomNavHtml: isLoggedIn ? bottomNav(role, "home") : "",
  });

  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
