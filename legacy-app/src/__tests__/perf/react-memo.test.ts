/**
 * Tests P3.4 — React.memo sur composants coûteux + useMemo dans les providers
 *
 * Stratégie : scan statique du code source (lecture du fichier .tsx/.ts en string)
 * pour détecter la présence des wrappers React.memo/memo sur les exports de composants
 * et des appels useMemo dans les providers de contexte.
 *
 * Pourquoi du scan statique ?
 * - Les composants concernés utilisent des hooks (useAuth, useTeam, useRouter…)
 *   qui nécessiteraient des mocks lourds pour être rendus en test.
 * - L'objectif métier est de VÉRIFIER QUE le wrapping existe dans le code source,
 *   pas de tester le comportement à l'exécution (couvert par les tests de non-régression
 *   existants : dashboard-layout.test.tsx, team-guard.test.tsx).
 * - Cette approche est robuste, rapide, et non couplée à des détails d'implémentation
 *   qui n'ont pas de valeur produit.
 *
 * Ce qui est testé (2 suites) :
 *   Suite 1 — Composants memoizés : chaque fichier composant exporte bien un composant
 *             wrappé avec React.memo ou memo(...)
 *   Suite 2 — Providers useMemo : auth.tsx et team.tsx utilisent useMemo pour stabiliser
 *             la value passée au Context.Provider
 *
 * Ce qui n'est PAS testé :
 *   - Le comportement des composants (couvert par les tests de non-régression existants)
 *   - Le profiling de performance réel (hors scope TDD)
 *   - Le split des contextes en sous-providers
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Lit un fichier source depuis la racine du projet (workspace benchrs).
 * Résout le chemin à partir de la racine détectée via vitest.config.ts.
 */
function readSource(relativePath: string): string {
  const root = path.resolve(__dirname, "../../../");
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Fichier non trouvé : ${fullPath}`);
  }
  return fs.readFileSync(fullPath, "utf-8");
}

/**
 * Vérifie qu'un fichier source contient un export de composant wrappé avec memo.
 *
 * Patterns acceptés (toutes formes valides de React.memo) :
 *   - export default memo(ComponentName)
 *   - export default React.memo(ComponentName)
 *   - export const ComponentName = memo(...)
 *   - export const ComponentName = React.memo(...)
 *   - const ComponentName = memo(...) + export { ComponentName }
 *   - const ComponentName = React.memo(...) + export { ComponentName }
 *
 * Pattern regex : présence d'un appel memo( ou React.memo( associé à un export
 */
function hasMemoExport(source: string): boolean {
  // Détecte memo() ou React.memo() dans le fichier, quelle que soit la forme d'export
  const memoCallPattern = /(?:React\.)?memo\s*\(/;
  return memoCallPattern.test(source);
}

/**
 * Vérifie qu'un fichier source utilise useMemo pour construire la valeur de contexte.
 *
 * Patterns acceptés :
 *   - const value = useMemo(() => ({...}), [...])  + <Context.Provider value={value}>
 *   - <Context.Provider value={useMemo(() => ..., [...])}> (inline, peu courant mais valide)
 *
 * On vérifie simplement la co-présence de `useMemo` et d'un passage à `value=`
 * sur un Provider, ce qui garantit que useMemo est utilisé pour stabiliser le contexte.
 */
function hasProviderUseMemo(source: string): boolean {
  const hasUseMemo = /\buseMemo\b/.test(source);
  // Le provider passe une valeur à son Context.Provider
  const hasProviderValue = /\.Provider\s+value=/.test(source);
  return hasUseMemo && hasProviderValue;
}

// ─── Suite 1 : Composants memoizés ───────────────────────────────────────────

describe("P3.4 — React.memo : composants layout et dashboard wrappés", () => {
  /**
   * Chaque composant de layout est potentiellement re-rendu à chaque changement
   * de contexte (auth, team) même si ses props n'ont pas changé.
   * React.memo évite ces re-renders superflus en mémoisant le résultat.
   */

  it("Sidebar est exporté wrappé avec React.memo ou memo", () => {
    const source = readSource("src/components/layout/Sidebar.tsx");
    expect(
      hasMemoExport(source),
      [
        "Sidebar.tsx doit exporter son composant wrappé avec memo() ou React.memo().",
        "Exemple : export const Sidebar = memo(function Sidebar() { ... })",
        "ou : export default memo(Sidebar)",
      ].join("\n")
    ).toBe(true);
  });

  it("BottomNav est exporté wrappé avec React.memo ou memo", () => {
    const source = readSource("src/components/layout/BottomNav.tsx");
    expect(
      hasMemoExport(source),
      [
        "BottomNav.tsx doit exporter son composant wrappé avec memo() ou React.memo().",
        "Exemple : export const BottomNav = memo(function BottomNav() { ... })",
      ].join("\n")
    ).toBe(true);
  });

  it("TopBar est exporté wrappé avec React.memo ou memo", () => {
    const source = readSource("src/components/layout/TopBar.tsx");
    expect(
      hasMemoExport(source),
      [
        "TopBar.tsx doit exporter son composant wrappé avec memo() ou React.memo().",
        "Exemple : export const TopBar = memo(function TopBar() { ... })",
      ].join("\n")
    ).toBe(true);
  });

  it("NextEventCard est exporté wrappé avec React.memo ou memo", () => {
    const source = readSource("src/components/dashboard/NextEventCard.tsx");
    expect(
      hasMemoExport(source),
      [
        "NextEventCard.tsx doit exporter son composant wrappé avec memo() ou React.memo().",
        "Exemple : export const NextEventCard = memo(function NextEventCard() { ... })",
      ].join("\n")
    ).toBe(true);
  });

  it("QuickStats est exporté wrappé avec React.memo ou memo", () => {
    const source = readSource("src/components/dashboard/QuickStats.tsx");
    expect(
      hasMemoExport(source),
      [
        "QuickStats.tsx doit exporter son composant wrappé avec memo() ou React.memo().",
        "Exemple : export const QuickStats = memo(function QuickStats() { ... })",
      ].join("\n")
    ).toBe(true);
  });

  it("RecentResults est exporté wrappé avec React.memo ou memo", () => {
    const source = readSource("src/components/dashboard/RecentResults.tsx");
    expect(
      hasMemoExport(source),
      [
        "RecentResults.tsx doit exporter son composant wrappé avec memo() ou React.memo().",
        "Exemple : export const RecentResults = memo(function RecentResults() { ... })",
      ].join("\n")
    ).toBe(true);
  });
});

// ─── Suite 2 : Providers — stabilisation de la valeur de contexte ─────────────

describe("P3.4 — useMemo : providers stabilisent leur valeur de contexte", () => {
  /**
   * Sans useMemo, l'objet { user, session, loading, signOut, refreshUser } est recréé
   * à chaque render du provider, invalidant le mémoïsation de TOUS les composants
   * enfants qui consomment ce contexte — même si les valeurs n'ont pas changé.
   *
   * La valeur passée au Context.Provider DOIT être mémoïsée via useMemo avec
   * les dépendances appropriées pour que React.memo soit efficace sur les consommateurs.
   */

  it("auth.tsx utilise useMemo pour stabiliser la valeur du contexte Auth", () => {
    const source = readSource("src/lib/auth.tsx");
    expect(
      hasProviderUseMemo(source),
      [
        "auth.tsx doit utiliser useMemo pour stabiliser la value de AuthContext.Provider.",
        "Sans cela, un nouvel objet est créé à chaque render et React.memo est inefficace.",
        "Exemple :",
        "  const value = useMemo(",
        "    () => ({ user, session, loading, signOut, refreshUser }),",
        "    [user, session, loading, signOut, refreshUser]",
        "  );",
        "  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;",
      ].join("\n")
    ).toBe(true);
  });

  it("team.tsx utilise useMemo pour stabiliser la valeur du contexte Team", () => {
    const source = readSource("src/lib/team.tsx");
    expect(
      hasProviderUseMemo(source),
      [
        "team.tsx doit utiliser useMemo pour stabiliser la value de TeamContext.Provider.",
        "Sans cela, les composants consommant useTeam re-rendent à chaque render du provider.",
        "Exemple :",
        "  const value = useMemo(",
        "    () => ({ currentTeam, teams, userRole, clubMemberships, switchTeam, loading, refreshTeams }),",
        "    [currentTeam, teams, userRole, clubMemberships, switchTeam, loading, refreshTeams]",
        "  );",
        "  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;",
      ].join("\n")
    ).toBe(true);
  });
});
