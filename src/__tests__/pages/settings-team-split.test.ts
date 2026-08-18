/**
 * Tests de non-régression — Split de settings/team/page.tsx
 *
 * Périmètre (P3.1) :
 *   1. LOC check   : le fichier principal doit faire < 300 LOC après le split
 *   2. Lazy check  : next/dynamic doit être utilisé dans le fichier principal
 *   3. Structure   : les sous-composants extraits doivent exister dans des fichiers séparés
 *
 * Phase "Red" attendue (avant le split) :
 *   - LOC check ÉCHOUE   : le fichier fait actuellement 2014 LOC
 *   - Lazy check ÉCHOUE  : next/dynamic n'est pas encore utilisé
 *   - Structure ÉCHOUE   : les fichiers de sous-composants n'existent pas encore
 *
 * Convention : tests purement statiques (lecture de fichiers + analyse du source),
 * sans rendu DOM. Pas de mock Supabase/auth nécessaire.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ─── Chemins de référence ──────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, "../../..");
const SETTINGS_DIR = path.join(REPO_ROOT, "src/app/(dashboard)/settings/team");
const MAIN_PAGE = path.join(SETTINGS_DIR, "page.tsx");

/**
 * Sections identifiées dans le fichier monolithique (commentaires JSX repérés au moment
 * de la rédaction des tests) — chaque section doit devenir un sous-composant.
 *
 * Convention de nommage attendue après split :
 *   - fichier dans src/app/(dashboard)/settings/team/  (co-location avec page.tsx)
 *   - OU dans src/components/settings/team/
 *
 * On accepte les deux emplacements.
 */
const EXPECTED_SUBCOMPONENTS: { name: string; candidates: string[] }[] = [
  {
    name: "TeamInfoSection",
    candidates: [
      path.join(SETTINGS_DIR, "TeamInfoSection.tsx"),
      path.join(REPO_ROOT, "src/components/settings/team/TeamInfoSection.tsx"),
    ],
  },
  {
    name: "ColorsSection",
    candidates: [
      path.join(SETTINGS_DIR, "ColorsSection.tsx"),
      path.join(REPO_ROOT, "src/components/settings/team/ColorsSection.tsx"),
    ],
  },
  {
    name: "LogoBannerSection",
    candidates: [
      path.join(SETTINGS_DIR, "LogoBannerSection.tsx"),
      path.join(REPO_ROOT, "src/components/settings/team/LogoBannerSection.tsx"),
    ],
  },
  {
    name: "MembersSection",
    candidates: [
      path.join(SETTINGS_DIR, "MembersSection.tsx"),
      path.join(REPO_ROOT, "src/components/settings/team/MembersSection.tsx"),
    ],
  },
  {
    name: "DangerZoneSection",
    candidates: [
      path.join(SETTINGS_DIR, "DangerZoneSection.tsx"),
      path.join(REPO_ROOT, "src/components/settings/team/DangerZoneSection.tsx"),
    ],
  },
];

/** Lit le contenu du fichier principal (échoue si le fichier n'existe pas). */
function readMainPage(): string {
  expect(fs.existsSync(MAIN_PAGE), `Le fichier ${MAIN_PAGE} doit exister`).toBe(true);
  return fs.readFileSync(MAIN_PAGE, "utf-8");
}

/** Compte les lignes non-vides d'une chaîne. */
function countLines(content: string): number {
  return content.split("\n").length;
}

// ─── Suite 1 : LOC check ──────────────────────────────────────────────────────

describe("LOC check — page.tsx après split", () => {
  it("le fichier principal doit faire moins de 300 lignes", () => {
    const content = readMainPage();
    const loc = countLines(content);

    expect(
      loc,
      `page.tsx fait ${loc} lignes — doit être < 300 après extraction des sous-composants`
    ).toBeLessThan(300);
  });

  it("la majeure partie de la logique métier doit être déléguée aux sous-composants (< 50 useState)", () => {
    const content = readMainPage();
    const useStateOccurrences = (content.match(/useState/g) || []).length;

    expect(
      useStateOccurrences,
      `page.tsx déclare encore ${useStateOccurrences} useState — après split la plupart doivent être dans les sous-composants (attendu < 5)`
    ).toBeLessThan(5);
  });
});

// ─── Suite 2 : Lazy check ─────────────────────────────────────────────────────

describe("Lazy check — next/dynamic dans page.tsx", () => {
  it("next/dynamic doit être importé dans le fichier principal", () => {
    const content = readMainPage();
    const hasDynamicImport = content.includes("from \"next/dynamic\"") ||
      content.includes("from 'next/dynamic'");

    expect(
      hasDynamicImport,
      "page.tsx doit importer `dynamic` depuis `next/dynamic` pour le lazy-loading des sections"
    ).toBe(true);
  });

  it("au moins un appel à dynamic() doit être présent dans le fichier principal", () => {
    const content = readMainPage();
    const dynamicCallCount = (content.match(/dynamic\s*\(/g) || []).length;

    expect(
      dynamicCallCount,
      `page.tsx doit contenir au moins 1 appel à dynamic() — trouvé : ${dynamicCallCount}`
    ).toBeGreaterThanOrEqual(1);
  });

  it("les sous-composants doivent être chargés avec dynamic() (pas importés statiquement)", () => {
    const content = readMainPage();

    // Vérifie qu'aucun sous-composant attendu n'est importé de façon statique
    const staticImportPatterns = EXPECTED_SUBCOMPONENTS.map(({ name }) =>
      new RegExp(`import\\s+.*${name}.*from`, "g")
    );

    const staticImports = staticImportPatterns
      .filter((pattern) => pattern.test(content))
      .map((_, i) => EXPECTED_SUBCOMPONENTS[i].name);

    expect(
      staticImports,
      `Ces sous-composants sont importés statiquement alors qu'ils devraient l'être via dynamic() : ${staticImports.join(", ")}`
    ).toHaveLength(0);
  });
});

// ─── Suite 3 : Structure — sous-composants extraits ──────────────────────────

describe("Structure — fichiers de sous-composants extraits", () => {
  EXPECTED_SUBCOMPONENTS.forEach(({ name, candidates }) => {
    it(`le sous-composant "${name}" doit exister dans un fichier séparé`, () => {
      const exists = candidates.some((p) => fs.existsSync(p));

      expect(
        exists,
        [
          `Le sous-composant "${name}" n'a pas été extrait.`,
          `Cherché aux emplacements :`,
          ...candidates.map((p) => `  - ${p}`),
        ].join("\n")
      ).toBe(true);
    });
  });

  it("chaque sous-composant doit exporter un composant React par défaut", () => {
    const errors: string[] = [];

    EXPECTED_SUBCOMPONENTS.forEach(({ name, candidates }) => {
      const existingPath = candidates.find((p) => fs.existsSync(p));
      if (!existingPath) return; // déjà couvert par le test précédent

      const content = fs.readFileSync(existingPath, "utf-8");
      const hasDefaultExport =
        content.includes("export default function") ||
        content.includes("export default ") ||
        content.includes("export { default }");

      if (!hasDefaultExport) {
        errors.push(`"${name}" (${existingPath}) : export default manquant`);
      }
    });

    expect(
      errors,
      `Sous-composants sans export default :\n${errors.join("\n")}`
    ).toHaveLength(0);
  });

  it("les sous-composants doivent être dans le même répertoire que page.tsx OU dans src/components/settings/team/", () => {
    const allowedDirs = [
      SETTINGS_DIR,
      path.join(REPO_ROOT, "src/components/settings/team"),
    ];

    const misplaced: string[] = [];

    EXPECTED_SUBCOMPONENTS.forEach(({ name, candidates }) => {
      const existingPath = candidates.find((p) => fs.existsSync(p));
      if (!existingPath) return;

      const dir = path.dirname(existingPath);
      const isAllowed = allowedDirs.includes(dir);
      if (!isAllowed) {
        misplaced.push(`"${name}" est dans ${dir} (non autorisé)`);
      }
    });

    expect(
      misplaced,
      `Sous-composants mal placés :\n${misplaced.join("\n")}`
    ).toHaveLength(0);
  });
});
