/**
 * Tests — Wrappers recharts lazy-loaded (next/dynamic)
 *
 * Contexte :
 *   recharts (~150KB gzip) est importé statiquement dans 4 fichiers.
 *   On crée des wrappers lazy via next/dynamic dans src/components/charts/.
 *   Ces tests protègent la migration : zéro import direct "recharts" dans
 *   les fichiers concernés, et existence des wrappers attendus.
 *
 * Phase "Red" :
 *   - Les tests de structure DOIVENT ÉCHOUER (les fichiers wrapper n'existent pas).
 *   - Les tests d'import DOIVENT ÉCHOUER (les sources importent encore "recharts").
 *
 * Hors-scope :
 *   - Rendu visuel des graphiques (périmètre Playwright/E2E)
 *   - Comportement interne de recharts
 *   - Tests unitaires des composants parents (PlayerProfile, CoachStats, etc.)
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ─── Constantes ──────────────────────────────────────────────────────────────

const SRC = path.resolve(__dirname, "../../");

/** Fichiers sources qui doivent être migrés (relatifs à src/) */
const MIGRATED_FILES = [
  "components/stats/PlayerProfile.tsx",
  "components/stats/CoachStats.tsx",
  "components/training/SessionRpe.tsx",
  "app/(dashboard)/stats/compare/page.tsx",
] as const;

/** Wrappers attendus dans src/components/charts/ */
const EXPECTED_WRAPPERS = [
  "components/charts/LineChart.tsx",
  "components/charts/BarChart.tsx",
  "components/charts/RadarChart.tsx",
  "components/charts/index.ts",
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readSource(relativePath: string): string {
  const fullPath = path.join(SRC, relativePath);
  return fs.readFileSync(fullPath, "utf-8");
}

function wrapperExists(relativePath: string): boolean {
  return fs.existsSync(path.join(SRC, relativePath));
}

/**
 * Détecte un import statique depuis "recharts".
 * Matche : import { Foo } from "recharts"
 * Ne matche PAS : // import ... from "recharts" (commenté)
 */
function hasDirectRechartsImport(source: string): boolean {
  // Ligne non-commentée contenant from "recharts" ou from 'recharts'
  const lines = source.split("\n");
  return lines.some((line) => {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return false;
    return /from\s+['"]recharts['"]/.test(line);
  });
}

/**
 * Vérifie qu'un fichier importe depuis @/components/charts
 */
function hasChartsWrapperImport(source: string): boolean {
  return /@\/components\/charts/.test(source);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. STRUCTURE — Les wrappers lazy existent [RED : fichiers absents]
// ─────────────────────────────────────────────────────────────────────────────

describe("Structure — wrappers lazy-loaded dans src/components/charts/", () => {
  it.each(EXPECTED_WRAPPERS)(
    "[RED] le fichier wrapper existe : %s",
    (wrapperPath) => {
      const exists = wrapperExists(wrapperPath);
      expect(exists, `Wrapper manquant : src/${wrapperPath}`).toBe(true);
    }
  );

  it("[RED] le dossier src/components/charts/ existe", () => {
    const chartsDir = path.join(SRC, "components/charts");
    expect(
      fs.existsSync(chartsDir),
      "Le dossier src/components/charts/ doit être créé"
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. CONTENU DES WRAPPERS — exports attendus [RED : fichiers absents]
// ─────────────────────────────────────────────────────────────────────────────

describe("Contenu — les wrappers réexportent les composants recharts via next/dynamic", () => {
  it("[RED] LineChart.tsx utilise next/dynamic et réexporte LineChart", () => {
    expect(
      wrapperExists("components/charts/LineChart.tsx"),
      "Créer src/components/charts/LineChart.tsx"
    ).toBe(true);

    const source = readSource("components/charts/LineChart.tsx");
    expect(source, "LineChart.tsx doit utiliser next/dynamic").toMatch(/dynamic/);
    expect(source, "LineChart.tsx doit réexporter LineChart").toMatch(
      /LineChart/
    );
  });

  it("[RED] BarChart.tsx utilise next/dynamic et réexporte BarChart", () => {
    expect(
      wrapperExists("components/charts/BarChart.tsx"),
      "Créer src/components/charts/BarChart.tsx"
    ).toBe(true);

    const source = readSource("components/charts/BarChart.tsx");
    expect(source, "BarChart.tsx doit utiliser next/dynamic").toMatch(/dynamic/);
    expect(source, "BarChart.tsx doit réexporter BarChart").toMatch(/BarChart/);
  });

  it("[RED] RadarChart.tsx utilise next/dynamic et réexporte RadarChart", () => {
    expect(
      wrapperExists("components/charts/RadarChart.tsx"),
      "Créer src/components/charts/RadarChart.tsx"
    ).toBe(true);

    const source = readSource("components/charts/RadarChart.tsx");
    expect(source, "RadarChart.tsx doit utiliser next/dynamic").toMatch(
      /dynamic/
    );
    expect(source, "RadarChart.tsx doit réexporter RadarChart").toMatch(
      /RadarChart/
    );
  });

  it("[RED] index.ts réexporte tous les wrappers (barrel export)", () => {
    expect(
      wrapperExists("components/charts/index.ts"),
      "Créer src/components/charts/index.ts"
    ).toBe(true);

    const source = readSource("components/charts/index.ts");
    // Doit réexporter les 3 wrappers
    expect(source, "index.ts doit réexporter LineChart").toMatch(/LineChart/);
    expect(source, "index.ts doit réexporter BarChart").toMatch(/BarChart/);
    expect(source, "index.ts doit réexporter RadarChart").toMatch(/RadarChart/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. NOMINAL — Plus d'import direct "recharts" dans les fichiers sources [RED]
// ─────────────────────────────────────────────────────────────────────────────

describe('Nominal — les fichiers sources n\'importent plus depuis "recharts"', () => {
  it.each(MIGRATED_FILES)(
    '[RED] %s : aucun import direct from "recharts"',
    (filePath) => {
      const source = readSource(filePath);
      const hasDirect = hasDirectRechartsImport(source);
      expect(
        hasDirect,
        `${filePath} contient encore un import direct depuis "recharts". Migrer vers @/components/charts/`
      ).toBe(false);
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. ANTI-RÉGRESSION — Les fichiers sources importent depuis @/components/charts
// ─────────────────────────────────────────────────────────────────────────────

describe("Anti-régression — les fichiers sources importent depuis @/components/charts/", () => {
  it.each(MIGRATED_FILES)(
    "[RED] %s : contient un import depuis @/components/charts/",
    (filePath) => {
      const source = readSource(filePath);
      const hasWrapper = hasChartsWrapperImport(source);
      expect(
        hasWrapper,
        `${filePath} doit importer ses composants recharts depuis @/components/charts/`
      ).toBe(true);
    }
  );
});
