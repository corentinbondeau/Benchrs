/**
 * Tests P3.3 — Navigation conditionnelle Sidebar / BottomNav
 *
 * Objectif : garantir que seul le composant nav pertinent est MONTÉ (pas juste
 * caché via CSS), éliminant ainsi le doublon de hooks/subscriptions.
 *
 * Stratégie en deux axes :
 *
 *   Axe 1 — Source-scan (fs)
 *     Vérifie que le code source n'utilise plus les classes Tailwind CSS de
 *     visibilité conditionnelle (`hidden lg:flex`, `lg:hidden`) pour masquer
 *     les composants nav. Ces classes signalent que les DEUX composants sont
 *     montés simultanément.
 *     Vérifie également qu'un hook/mécanisme conditionnel (`useIsMobile` ou
 *     équivalent) existe dans la base de code.
 *
 *   Axe 2 — Intégration DOM
 *     Monte le DashboardLayout avec `useIsMobile` mocké à `true` (mobile) ou
 *     `false` (desktop) et vérifie que seul le composant nav attendu est rendu
 *     dans le DOM (l'autre étant absent = non monté du tout).
 *
 * Phase Red : ces tests DOIVENT ÉCHOUER tant que @dev n'a pas implémenté :
 *   - Un hook `useIsMobile()` (ou mécanisme équivalent)
 *   - La suppression des classes `hidden lg:flex` / `lg:hidden` des composants
 *   - Le montage conditionnel dans DashboardLayout
 *
 * Ce qui n'est PAS testé :
 *   - Le contenu interne de Sidebar ou BottomNav (testés séparément)
 *   - Le déclenchement du resize window (instable en jsdom)
 *   - Les animations de transition entre les deux navs
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { render, screen } from "@testing-library/react";
import React from "react";
import { useIsMobile } from "@/hooks/useIsMobile";

// ─── Chemins des fichiers source ciblés ──────────────────────────────────────

const SRC_DIR = path.resolve(__dirname, "../../");
const LAYOUT_FILE = path.resolve(__dirname, "../../app/(dashboard)/layout.tsx");
const SIDEBAR_FILE = path.resolve(__dirname, "../../components/layout/Sidebar.tsx");
const BOTTOM_NAV_FILE = path.resolve(__dirname, "../../components/layout/BottomNav.tsx");

// ─── Helpers source-scan ─────────────────────────────────────────────────────

function readSource(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

/**
 * Cherche une classe Tailwind CSS de visibilité conditionnelle qui indique
 * que le composant est monté mais masqué via CSS (pattern à bannir).
 * On ignore les lignes de commentaires.
 */
function findCssHiddenPatterns(
  content: string,
  filename: string
): string[] {
  const violations: string[] = [];
  const lines = content.split("\n");
  // Classes Tailwind qui signalent un masquage CSS au lieu d'un démontage React
  const CSS_HIDDEN_PATTERNS = [
    /hidden\s+lg:flex/,   // Sidebar : cachée sur mobile via CSS
    /lg:hidden/,          // BottomNav : cachée sur desktop via CSS
    /hidden\s+lg:block/,  // variante possible
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    // Ignorer les commentaires purs
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

    for (const pattern of CSS_HIDDEN_PATTERNS) {
      if (pattern.test(line)) {
        violations.push(`  [${filename}:${i + 1}] ${line.trim()}`);
      }
    }
  }

  return violations;
}

/**
 * Vérifie que le fichier source importe ou référence un mécanisme conditionnel
 * de détection mobile (hook useIsMobile ou window.matchMedia ou next/dynamic conditionnel).
 */
function hasConditionalMountingMechanism(content: string): boolean {
  return (
    /useIsMobile/.test(content) ||
    /useMediaQuery/.test(content) ||
    /useBreakpoint/.test(content) ||
    /matchMedia/.test(content) ||
    // next/dynamic utilisé pour conditionner le montage
    /dynamic\(.*(?:Sidebar|BottomNav)/.test(content)
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AXE 1 — Source-scan : suppression des classes CSS de masquage
// ═══════════════════════════════════════════════════════════════════════════════

describe("P3.3 — Source-scan : pas de masquage CSS pour les composants nav", () => {
  /**
   * Sidebar ne doit plus utiliser `hidden lg:flex` pour se cacher sur mobile.
   * Elle doit être conditionnellement MONTÉE (pas juste cachée).
   *
   * Avant (à éliminer) :
   *   <aside className="hidden lg:flex lg:w-[260px]...">
   *
   * Après (attendu) :
   *   Composant monté/démonté selon useIsMobile()
   */
  it("Sidebar.tsx — n'utilise plus 'hidden lg:flex' pour se masquer sur mobile", () => {
    const content = readSource(SIDEBAR_FILE);
    const violations = findCssHiddenPatterns(content, "Sidebar.tsx");

    expect(
      violations,
      [
        "Sidebar.tsx utilise encore des classes CSS Tailwind pour se masquer ('hidden lg:flex').",
        "Le composant est monté mais invisible sur mobile → doublon de hooks/subscriptions.",
        "Corriger : monter conditionnellement via useIsMobile() dans le layout.",
        "Violations détectées :",
        ...violations,
      ].join("\n")
    ).toHaveLength(0);
  });

  /**
   * BottomNav ne doit plus utiliser `lg:hidden` pour se cacher sur desktop.
   * Elle doit être conditionnellement MONTÉE (pas juste cachée).
   *
   * Avant (à éliminer) :
   *   <nav className="fixed bottom-0 ... lg:hidden">
   *
   * Après (attendu) :
   *   Composant monté/démonté selon useIsMobile()
   */
  it("BottomNav.tsx — n'utilise plus 'lg:hidden' pour se masquer sur desktop", () => {
    const content = readSource(BOTTOM_NAV_FILE);
    const violations = findCssHiddenPatterns(content, "BottomNav.tsx");

    expect(
      violations,
      [
        "BottomNav.tsx utilise encore 'lg:hidden' pour se masquer sur desktop.",
        "Le composant est monté mais invisible sur desktop → doublon de hooks (useChatUnread x2).",
        "Corriger : monter conditionnellement via useIsMobile() dans le layout.",
        "Violations détectées :",
        ...violations,
      ].join("\n")
    ).toHaveLength(0);
  });

  /**
   * Le layout ne doit pas non plus appliquer ces classes CSS sur les wrappers
   * de Sidebar/BottomNav (pattern alternatif qui contournerait les tests ci-dessus).
   */
  it("layout.tsx — ne wrappe pas Sidebar/BottomNav avec des classes CSS de masquage", () => {
    const content = readSource(LAYOUT_FILE);
    const violations = findCssHiddenPatterns(content, "layout.tsx");

    expect(
      violations,
      [
        "layout.tsx utilise des classes CSS Tailwind pour masquer Sidebar ou BottomNav.",
        "Ces classes indiquent que les DEUX composants sont montés simultanément.",
        "Corriger : utiliser un mécanisme de montage conditionnel (useIsMobile).",
        "Violations détectées :",
        ...violations,
      ].join("\n")
    ).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AXE 2 — Source-scan : existence d'un mécanisme conditionnel
// ═══════════════════════════════════════════════════════════════════════════════

describe("P3.3 — Source-scan : mécanisme de montage conditionnel", () => {
  /**
   * Le layout doit utiliser un hook ou un mécanisme qui conditionne le montage
   * de Sidebar vs BottomNav (ex: useIsMobile(), useMediaQuery, matchMedia,
   * ou next/dynamic conditionnel).
   *
   * Sans ce mécanisme, les deux composants sont toujours montés.
   */
  it("layout.tsx — utilise un mécanisme conditionnel pour choisir entre Sidebar et BottomNav", () => {
    const content = readSource(LAYOUT_FILE);
    const hasMechanism = hasConditionalMountingMechanism(content);

    expect(
      hasMechanism,
      [
        "layout.tsx ne contient pas de mécanisme conditionnel pour choisir entre Sidebar et BottomNav.",
        "Attendu : un hook useIsMobile() / useMediaQuery() / useBreakpoint()",
        "         ou next/dynamic conditionnel basé sur le viewport.",
        "Sans ce mécanisme, les deux composants sont montés simultanément",
        "→ doublon de hooks useChatUnread + subscriptions Supabase.",
      ].join("\n")
    ).toBe(true);
  });

  /**
   * Le hook useIsMobile (ou équivalent) doit exister quelque part dans src/.
   * Il peut être dans src/hooks/, src/lib/, ou défini inline dans le layout.
   */
  it("un hook useIsMobile (ou équivalent) existe dans le code source", () => {
    // Cherche dans les répertoires les plus probables
    const HOOK_SEARCH_DIRS = [
      path.resolve(SRC_DIR, "hooks"),
      path.resolve(SRC_DIR, "lib"),
    ];

    // Pattern à rechercher dans les fichiers source
    const HOOK_PATTERNS = [
      /export\s+(?:function|const)\s+useIsMobile/,
      /export\s+(?:function|const)\s+useMediaQuery/,
      /export\s+(?:function|const)\s+useBreakpoint/,
    ];

    let hookFound = false;
    const checkedFiles: string[] = [];

    for (const dir of HOOK_SEARCH_DIRS) {
      if (!fs.existsSync(dir)) continue;

      const files = fs.readdirSync(dir).filter((f) =>
        f.endsWith(".ts") || f.endsWith(".tsx")
      );

      for (const file of files) {
        const filePath = path.join(dir, file);
        const content = readSource(filePath);
        checkedFiles.push(file);

        if (HOOK_PATTERNS.some((pattern) => pattern.test(content))) {
          hookFound = true;
          break;
        }
      }

      if (hookFound) break;
    }

    // Vérifie aussi dans le layout lui-même (hook inline)
    if (!hookFound) {
      const layoutContent = readSource(LAYOUT_FILE);
      if (HOOK_PATTERNS.some((p) => p.test(layoutContent))) {
        hookFound = true;
      }
    }

    expect(
      hookFound,
      [
        "Aucun hook useIsMobile / useMediaQuery / useBreakpoint trouvé dans :",
        "  - src/hooks/",
        "  - src/lib/",
        "  - layout.tsx (inline)",
        `Fichiers inspectés : ${checkedFiles.join(", ") || "(aucun)"}`,
        "Créer ce hook pour conditionner le montage de Sidebar vs BottomNav.",
      ].join("\n")
    ).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AXE 3 — Intégration DOM : montage conditionnel selon useIsMobile
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Ces tests montent le layout avec useIsMobile mocké et vérifient que seul
 * le composant nav attendu est présent dans le DOM.
 *
 * Les providers et composants lourds sont mockés pour isoler le comportement
 * du layout (identique au pattern de dashboard-layout.test.tsx).
 */

// ─── Mock unique de useIsMobile (valeur contrôlée par test via mockReturnValue) ─
// Un seul vi.mock() au niveau fichier est requis — Vitest hoise tous les vi.mock()
// au sommet du fichier. Plusieurs vi.mock() pour le même module se résolvent à la
// dernière factory déclarée (hoisting), ce qui rendrait les mocks par test impossibles.
// Chaque test override la valeur via : vi.mocked(useIsMobile).mockReturnValue(...)
vi.mock("@/hooks/useIsMobile", () => ({
  useIsMobile: vi.fn(() => false), // défaut desktop
}));

// Mocks des providers / composants lourds (identique à dashboard-layout.test.tsx)
vi.mock("@/lib/auth", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "auth-provider" }, children),
  useAuth: () => ({ user: null, loading: false, signOut: vi.fn() }),
}));

vi.mock("@/lib/team", () => ({
  TeamProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "team-provider" }, children),
  useTeam: () => ({
    currentTeam: null,
    teams: [],
    switchTeam: vi.fn(),
    userRole: null,
    clubMemberships: [],
    loading: false,
  }),
}));

vi.mock("@/components/team-guard", () => ({
  TeamGuard: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "team-guard" }, children),
}));

vi.mock("@/components/layout/Sidebar", () => ({
  default: () => React.createElement("nav", { "data-testid": "sidebar" }),
}));

vi.mock("@/components/layout/TopBar", () => ({
  default: () => React.createElement("header", { "data-testid": "topbar" }),
}));

vi.mock("@/components/layout/BottomNav", () => ({
  default: () => React.createElement("nav", { "data-testid": "bottomnav" }),
}));

vi.mock("@/components/PushNotificationInit", () => ({
  PushNotificationInit: () => null,
}));

vi.mock("@/components/onboarding/UniversalOnboarding", () => ({
  UniversalOnboarding: () => null,
}));

describe("P3.3 — Intégration DOM : montage conditionnel des navs selon useIsMobile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Sur DESKTOP (useIsMobile = false) :
   *   - Sidebar DOIT être montée (présente dans le DOM)
   *   - BottomNav NE DOIT PAS être montée (absente du DOM)
   *
   * Ce test échoue tant que le layout monte les deux composants simultanément.
   */
  it("desktop (useIsMobile=false) — seule la Sidebar est montée, BottomNav est absente du DOM", async () => {
    // Override : desktop (useIsMobile = false)
    vi.mocked(useIsMobile).mockReturnValue(false);

    const { default: DashboardLayout } = await import(
      "@/app/(dashboard)/layout"
    );

    render(
      <DashboardLayout>
        <span data-testid="page-content">contenu</span>
      </DashboardLayout>
    );

    // La Sidebar DOIT être présente (composant desktop)
    expect(
      screen.getByTestId("sidebar"),
      "Sur desktop, la Sidebar doit être montée dans le DOM"
    ).toBeInTheDocument();

    // BottomNav NE DOIT PAS être présente (composant mobile — ne doit pas être monté)
    expect(
      screen.queryByTestId("bottomnav"),
      "Sur desktop, BottomNav ne doit PAS être montée dans le DOM " +
      "(pas juste cachée — réellement absente pour éviter le doublon de hooks)"
    ).not.toBeInTheDocument();
  });

  /**
   * Sur MOBILE (useIsMobile = true) :
   *   - BottomNav DOIT être montée (présente dans le DOM)
   *   - Sidebar NE DOIT PAS être montée (absente du DOM)
   *
   * Ce test échoue tant que le layout monte les deux composants simultanément.
   */
  it("mobile (useIsMobile=true) — seule la BottomNav est montée, Sidebar est absente du DOM", async () => {
    // Override : mobile (useIsMobile = true)
    vi.mocked(useIsMobile).mockReturnValue(true);

    const { default: DashboardLayout } = await import(
      "@/app/(dashboard)/layout"
    );

    render(
      <DashboardLayout>
        <span data-testid="page-content">contenu</span>
      </DashboardLayout>
    );

    // BottomNav DOIT être présente (composant mobile)
    expect(
      screen.getByTestId("bottomnav"),
      "Sur mobile, BottomNav doit être montée dans le DOM"
    ).toBeInTheDocument();

    // Sidebar NE DOIT PAS être présente (composant desktop — ne doit pas être monté)
    expect(
      screen.queryByTestId("sidebar"),
      "Sur mobile, la Sidebar ne doit PAS être montée dans le DOM " +
      "(pas juste cachée — réellement absente pour éviter le doublon de hooks)"
    ).not.toBeInTheDocument();
  });

  /**
   * Dans les deux cas (mobile et desktop), le reste du layout doit rester intact :
   *   - TopBar toujours présente
   *   - children toujours rendus
   *   - providers enchaînés correctement
   *
   * Ce test protège les invariants du layout contre une régression liée à
   * l'introduction du montage conditionnel.
   */
  it("invariants du layout préservés : TopBar + children toujours rendus quelle que soit la valeur de useIsMobile", async () => {
    // Desktop pour ce test (valeur par défaut du mock)
    vi.mocked(useIsMobile).mockReturnValue(false);

    const { default: DashboardLayout } = await import(
      "@/app/(dashboard)/layout"
    );

    render(
      <DashboardLayout>
        <article data-testid="page-article">article de page</article>
      </DashboardLayout>
    );

    // TopBar toujours visible (pas conditionnelle)
    expect(
      screen.getByTestId("topbar"),
      "La TopBar doit toujours être présente, quelle que soit la valeur de useIsMobile"
    ).toBeInTheDocument();

    // Children toujours rendus
    expect(
      screen.getByTestId("page-article"),
      "Les children du layout doivent toujours être rendus"
    ).toBeInTheDocument();

    // Providers toujours enchaînés
    expect(screen.getByTestId("auth-provider")).toBeInTheDocument();
    expect(screen.getByTestId("team-provider")).toBeInTheDocument();
    expect(screen.getByTestId("team-guard")).toBeInTheDocument();
  });
});
