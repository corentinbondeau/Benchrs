/**
 * Tests P4.1 — Prefetch des routes fréquentes via next/link
 *
 * Objectif : garantir que les composants de navigation (Sidebar, BottomNav)
 * utilisent systématiquement le composant `<Link>` de Next.js pour les routes
 * principales, et NON des alternatives qui désactivent le prefetch intégré :
 *   - balises `<a>` HTML natives (pas de prefetch)
 *   - `<button onClick={router.push(...)}>` (pas de prefetch)
 *
 * En Next.js 13+, `<Link>` fait du prefetch automatiquement par défaut :
 * il n'est pas nécessaire d'ajouter `prefetch={true}` explicitement.
 * L'important est que les routes soient wrappées dans un `<Link>`.
 *
 * Stratégie : source-scan (analyse statique du code source avec fs)
 * On analyse le code source plutôt que le rendu DOM car :
 *   1. Les mocks Next.js dans setup.ts rendent les <Link> similaires à <a>
 *   2. L'analyse statique détecte l'intention de code, pas un comportement runtime
 *
 * Routes principales vérifiées :
 *   - / (dashboard / accueil)
 *   - /calendar (agenda)
 *   - /roster (équipe)
 *   - /stats (performance)
 *   - /chat (messages)
 *
 * Ce qui n'est PAS testé :
 *   - Les routes secondaires (menu "Plus") — elles utilisent aussi <Link>
 *   - La valeur de la prop `prefetch` (Next.js la gère automatiquement)
 *   - Le comportement au runtime (hors scope scan statique)
 */

import * as fs from "fs";
import * as path from "path";

// ─── Chemins des fichiers layout ciblés ──────────────────────────────────────

const LAYOUT_DIR = path.resolve(__dirname, "../../components/layout");
const SIDEBAR_FILE = path.join(LAYOUT_DIR, "Sidebar.tsx");
const BOTTOM_NAV_FILE = path.join(LAYOUT_DIR, "BottomNav.tsx");

// ─── Routes principales attendues dans la navigation ─────────────────────────

const PRIMARY_ROUTES = ["/", "/calendar", "/roster", "/stats", "/chat"] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readSource(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

/**
 * Vérifie qu'un fichier importe `Link` depuis `next/link`.
 */
function hasNextLinkImport(content: string): boolean {
  return /import\s+Link\s+from\s+["']next\/link["']/.test(content);
}

/**
 * Pour une route donnée, retourne toutes les occurrences de balises <a>
 * (HTML native) pointant vers cette route — ce qui indiquerait l'absence
 * de prefetch Next.js.
 *
 * On cherche : href="<route>" ou href='<route>' dans des balises <a.
 * On ignore les lignes de commentaires.
 */
function findRawAnchorForRoute(
  content: string,
  route: string,
  filename: string
): string[] {
  const violations: string[] = [];
  const lines = content.split("\n");

  // Pattern : une balise <a ... href="<route>" ou ouverture <a suivi de href sur la même ligne
  // On échappe le "/" pour le regex
  const escapedRoute = route.replace(/\//g, "\\/");
  const anchorWithHref = new RegExp(`<a[^>]*href=["']${escapedRoute}["']`);
  const hrefWithRoute = new RegExp(`href=["']${escapedRoute}["']`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    // Ignorer les lignes de commentaire pur
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

    // Détecter une balise <a native (pas <Link, pas <AnyComponent)
    // On recherche spécifiquement la combinaison <a ... href="<route>"
    if (anchorWithHref.test(line)) {
      violations.push(
        `  [${path.basename(filename)}:${i + 1}] Balise <a> native pour "${route}" : ${line.trim()}`
      );
    }

    // Cas split sur plusieurs lignes : <a\n  href="<route>"
    // On détecte si une ligne contient href="<route>" sans être précédée de <Link
    // en regardant si la balise ouvrante dans les 3 lignes précédentes est <a
    if (hrefWithRoute.test(line) && !/<Link/.test(line)) {
      const context = lines.slice(Math.max(0, i - 3), i + 1).join("\n");
      // Cherche un <a ouvert dans le contexte récent (pas <Link, pas <Component)
      if (/<a[\s>]/.test(context) && !/<Link/.test(context)) {
        violations.push(
          `  [${path.basename(filename)}:${i + 1}] href="${route}" dans une balise <a> native : ${line.trim()}`
        );
      }
    }
  }

  return violations;
}

/**
 * Pour une route donnée, détecte les patterns `router.push("<route>")` utilisés
 * dans des handlers onClick — ce qui bypasserait le prefetch de Next.js Link.
 *
 * On ignore les lignes de commentaires.
 */
function findRouterPushForRoute(
  content: string,
  route: string,
  filename: string
): string[] {
  const violations: string[] = [];
  const lines = content.split("\n");

  const escapedRoute = route.replace(/\//g, "\\/");
  // Matche : router.push("/route") ou router.push('/route')
  const routerPushPattern = new RegExp(`router\\.push\\(["']${escapedRoute}["']\\)`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

    if (routerPushPattern.test(line)) {
      violations.push(
        `  [${path.basename(filename)}:${i + 1}] router.push("${route}") détecté — ` +
        `utiliser <Link href="${route}"> pour bénéficier du prefetch : ${line.trim()}`
      );
    }
  }

  return violations;
}

/**
 * Vérifie que chaque route principale est référencée dans le source.
 * Les routes peuvent être :
 *   - en href littéral : href="/calendar"
 *   - en valeur de tableau de config : href: "/calendar"
 *   - en prop dynamique : href={item.href} (avec la route définie dans le tableau)
 *
 * On recherche la route comme chaîne littérale dans le source, peu importe
 * le contexte syntaxique (prop JSX ou propriété d'objet).
 */
function findRoutesPresent(content: string, routes: readonly string[]): string[] {
  return routes.filter((route) => {
    // Cherche la route comme chaîne littérale entre guillemets (simple ou double)
    // dans n'importe quel contexte du fichier source
    const escaped = route.replace(/\//g, "\\/");
    const pattern = new RegExp(`["']${escaped}["']`);
    return pattern.test(content);
  });
}

// ─── Suite 1 : Import de `Link` depuis `next/link` ───────────────────────────

describe("Layout — import de Link depuis next/link", () => {
  it("Sidebar.tsx doit importer Link depuis next/link", () => {
    const content = readSource(SIDEBAR_FILE);

    expect(
      hasNextLinkImport(content),
      "Sidebar.tsx n'importe pas `Link` depuis 'next/link'. " +
        "Ajouter : import Link from 'next/link'"
    ).toBe(true);
  });

  it("BottomNav.tsx doit importer Link depuis next/link", () => {
    const content = readSource(BOTTOM_NAV_FILE);

    expect(
      hasNextLinkImport(content),
      "BottomNav.tsx n'importe pas `Link` depuis 'next/link'. " +
        "Ajouter : import Link from 'next/link'"
    ).toBe(true);
  });
});

// ─── Suite 2 : Aucune balise <a> native pour les routes principales ───────────

describe("Sidebar — aucune balise <a> native pour les routes principales", () => {
  it.each(PRIMARY_ROUTES)(
    'Sidebar.tsx — route "%s" ne doit pas utiliser une balise <a> HTML native',
    (route) => {
      const content = readSource(SIDEBAR_FILE);
      const violations = findRawAnchorForRoute(content, route, SIDEBAR_FILE);

      expect(
        violations,
        [
          `Sidebar.tsx utilise une balise <a> native pour "${route}".`,
          "Une balise <a> native désactive le prefetch automatique de Next.js.",
          "Utiliser <Link href=\"" + route + '"> pour bénéficier du prefetch.',
          "Violations détectées :",
          ...violations,
        ].join("\n")
      ).toHaveLength(0);
    }
  );
});

describe("BottomNav — aucune balise <a> native pour les routes principales", () => {
  it.each(PRIMARY_ROUTES)(
    'BottomNav.tsx — route "%s" ne doit pas utiliser une balise <a> HTML native',
    (route) => {
      const content = readSource(BOTTOM_NAV_FILE);
      const violations = findRawAnchorForRoute(content, route, BOTTOM_NAV_FILE);

      expect(
        violations,
        [
          `BottomNav.tsx utilise une balise <a> native pour "${route}".`,
          "Une balise <a> native désactive le prefetch automatique de Next.js.",
          "Utiliser <Link href=\"" + route + '"> pour bénéficier du prefetch.',
          "Violations détectées :",
          ...violations,
        ].join("\n")
      ).toHaveLength(0);
    }
  );
});

// ─── Suite 3 : Aucun router.push() pour les routes principales ────────────────

describe("Sidebar — aucun router.push() pour les routes principales", () => {
  it.each(PRIMARY_ROUTES)(
    'Sidebar.tsx — route "%s" ne doit pas utiliser router.push()',
    (route) => {
      const content = readSource(SIDEBAR_FILE);
      const violations = findRouterPushForRoute(content, route, SIDEBAR_FILE);

      expect(
        violations,
        [
          `Sidebar.tsx utilise router.push("${route}") pour naviguer.`,
          "router.push() ne déclenche pas le prefetch de Next.js.",
          "Utiliser <Link href=\"" + route + '"> à la place.',
          "Violations détectées :",
          ...violations,
        ].join("\n")
      ).toHaveLength(0);
    }
  );
});

describe("BottomNav — aucun router.push() pour les routes principales", () => {
  it.each(PRIMARY_ROUTES)(
    'BottomNav.tsx — route "%s" ne doit pas utiliser router.push()',
    (route) => {
      const content = readSource(BOTTOM_NAV_FILE);
      const violations = findRouterPushForRoute(content, route, BOTTOM_NAV_FILE);

      expect(
        violations,
        [
          `BottomNav.tsx utilise router.push("${route}") pour naviguer.`,
          "router.push() ne déclenche pas le prefetch de Next.js.",
          "Utiliser <Link href=\"" + route + '"> à la place.',
          "Violations détectées :",
          ...violations,
        ].join("\n")
      ).toHaveLength(0);
    }
  );
});

// ─── Suite 4 : Présence des routes principales dans les composants ────────────

describe("Sidebar — présence des routes principales via <Link>", () => {
  it("Sidebar.tsx doit référencer les 5 routes principales via href", () => {
    const content = readSource(SIDEBAR_FILE);
    const routesPresent = findRoutesPresent(content, PRIMARY_ROUTES);

    expect(
      routesPresent,
      "Sidebar.tsx ne contient pas toutes les routes principales. " +
        `Manquantes : ${PRIMARY_ROUTES.filter((r) => !routesPresent.includes(r)).join(", ")}. ` +
        "Chaque route doit être accessible via un <Link href='...'>"
    ).toHaveLength(PRIMARY_ROUTES.length);
  });
});

describe("BottomNav — présence des routes principales via <Link>", () => {
  it(
    "BottomNav.tsx doit référencer au moins les routes de navigation primaire",
    () => {
      const content = readSource(BOTTOM_NAV_FILE);

      // BottomNav affiche 5 routes en mode normal (/, /calendar, /roster, /stats, /chat)
      // et 4 routes en mode comité (/club, /calendar, /roster, /stats).
      // On vérifie que les routes communes aux deux modes sont toujours présentes.
      const COMMON_ROUTES = ["/calendar", "/roster", "/stats"] as const;
      const routesPresent = findRoutesPresent(content, COMMON_ROUTES);

      expect(
        routesPresent,
        "BottomNav.tsx ne contient pas les routes communes de navigation. " +
          `Manquantes : ${COMMON_ROUTES.filter((r) => !routesPresent.includes(r)).join(", ")}. ` +
          "Ces routes doivent être accessibles via un <Link href='...'>"
      ).toHaveLength(COMMON_ROUTES.length);
    }
  );

  it("BottomNav.tsx doit référencer / (accueil) via href en mode normal", () => {
    const content = readSource(BOTTOM_NAV_FILE);

    // La route "/" est présente dans les items du mode normal (en prop d'objet ou href JSX)
    // On cherche la chaîne littérale "/" entre guillemets, peu importe le contexte syntaxique
    const hasHomeRoute = findRoutesPresent(content, ["/"]).length > 0;

    expect(
      hasHomeRoute,
      'BottomNav.tsx ne contient pas la route "/" (accueil). ' +
        "La route principale doit être définie et accessible via <Link>"
    ).toBe(true);
  });

  it("BottomNav.tsx doit référencer /chat (messages) via href en mode normal", () => {
    const content = readSource(BOTTOM_NAV_FILE);

    const hasChatRoute = findRoutesPresent(content, ["/chat"]).length > 0;

    expect(
      hasChatRoute,
      'BottomNav.tsx ne contient pas la route "/chat" (messages). ' +
        "La route doit être définie et accessible via <Link>"
    ).toBe(true);
  });
});
