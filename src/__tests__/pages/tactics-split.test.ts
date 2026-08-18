/**
 * Tests de non-régression — Split de tactics/page.tsx (P3.2)
 *
 * Objectif : garantir que le fichier monolithique (1809 LOC) a bien été découpé
 * en composants dynamiques lazy-loadés, sans régression sur la structure attendue.
 *
 * Ces tests vérifient des propriétés statiques du code source (structure fichier,
 * présence d'imports, LOC) — aucun rendu DOM requis.
 *
 * Phase Red : DOIVENT ÉCHOUER tant que le split n'est pas réalisé.
 */

import * as fs from "fs";
import * as path from "path";

// ─── Chemins stables ─────────────────────────────────────────────────────────

const SRC_DIR = path.resolve(__dirname, "../../");
const TACTICS_PAGE = path.resolve(
  SRC_DIR,
  "app/(dashboard)/tactics/page.tsx",
);

// Sous-composants attendus après le split
const EXPECTED_SUBCOMPONENTS = [
  path.resolve(SRC_DIR, "app/(dashboard)/tactics/SeanceTab.tsx"),
  path.resolve(SRC_DIR, "app/(dashboard)/tactics/FeuilletMatchTab.tsx"),
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function countLines(filePath: string): number {
  const content = fs.readFileSync(filePath, "utf-8");
  return content.split("\n").length;
}

function readSource(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe("tactics/page.tsx — split en composants dynamiques (P3.2)", () => {
  // Sanity : le fichier principal doit exister (invariant, ne doit jamais casser)
  it("le fichier principal tactics/page.tsx existe", () => {
    expect(
      fs.existsSync(TACTICS_PAGE),
      `Fichier introuvable : ${TACTICS_PAGE}`,
    ).toBe(true);
  });

  // ── LOC Check ────────────────────────────────────────────────────────────────
  describe("LOC Check — le fichier principal doit être allégé", () => {
    it("tactics/page.tsx doit faire strictement moins de 300 lignes après split", () => {
      const loc = countLines(TACTICS_PAGE);
      expect(
        loc,
        [
          `tactics/page.tsx fait ${loc} lignes — dépasse la limite de 300 LOC.`,
          "Le fichier monolithique doit être découpé en composants extraits.",
          "Attendu : < 300 LOC (orchestrateur léger + imports dynamiques).",
        ].join("\n"),
      ).toBeLessThan(300);
    });
  });

  // ── Lazy / Dynamic Check ─────────────────────────────────────────────────────
  describe("Lazy Check — next/dynamic doit être utilisé dans le fichier principal", () => {
    it("tactics/page.tsx doit importer 'next/dynamic'", () => {
      const source = readSource(TACTICS_PAGE);
      const hasDynamic = /import\s+dynamic\s+from\s+["']next\/dynamic["']/.test(source);
      expect(
        hasDynamic,
        [
          "tactics/page.tsx n'importe pas 'next/dynamic'.",
          "Le split doit utiliser next/dynamic() pour charger les sous-onglets en lazy.",
          "Exemple attendu : import dynamic from 'next/dynamic'",
        ].join("\n"),
      ).toBe(true);
    });

    it("tactics/page.tsx doit appeler dynamic() au moins une fois", () => {
      const source = readSource(TACTICS_PAGE);
      const dynamicCallCount = (source.match(/dynamic\s*\(/g) || []).length;
      expect(
        dynamicCallCount,
        [
          `tactics/page.tsx contient ${dynamicCallCount} appel(s) à dynamic().`,
          "Au moins 2 sous-composants (SéanceTab, FeuilletMatchTab) doivent être lazy-loadés.",
          "Attendu : dynamic() appelé ≥ 2 fois.",
        ].join("\n"),
      ).toBeGreaterThanOrEqual(2);
    });
  });

  // ── Structure — Sous-composants extraits ─────────────────────────────────────
  describe("Structure — les sous-composants extraits doivent exister", () => {
    it("SeanceTab.tsx doit exister en tant que fichier autonome", () => {
      const filePath = EXPECTED_SUBCOMPONENTS[0];
      expect(
        fs.existsSync(filePath),
        [
          `Fichier manquant : ${filePath}`,
          "SéanceTab doit être extrait de tactics/page.tsx dans son propre fichier.",
        ].join("\n"),
      ).toBe(true);
    });

    it("FeuilletMatchTab.tsx doit exister en tant que fichier autonome", () => {
      const filePath = EXPECTED_SUBCOMPONENTS[1];
      expect(
        fs.existsSync(filePath),
        [
          `Fichier manquant : ${filePath}`,
          "FeuilletMatchTab doit être extrait de tactics/page.tsx dans son propre fichier.",
        ].join("\n"),
      ).toBe(true);
    });

    it("SeanceTab.tsx doit exporter un composant par défaut", () => {
      const filePath = EXPECTED_SUBCOMPONENTS[0];
      // Si le fichier n'existe pas, on skip proprement pour ne pas masquer le test précédent
      if (!fs.existsSync(filePath)) {
        expect(fs.existsSync(filePath), `${filePath} introuvable — test dépendant du précédent`).toBe(true);
        return;
      }
      const source = readSource(filePath);
      const hasDefaultExport = /export\s+default\s+function\s+\w+|export\s+\{\s*\w+\s+as\s+default\s*\}/.test(source);
      expect(
        hasDefaultExport,
        "SeanceTab.tsx doit exporter un composant par défaut pour être utilisable avec next/dynamic.",
      ).toBe(true);
    });

    it("FeuilletMatchTab.tsx doit exporter un composant par défaut", () => {
      const filePath = EXPECTED_SUBCOMPONENTS[1];
      if (!fs.existsSync(filePath)) {
        expect(fs.existsSync(filePath), `${filePath} introuvable — test dépendant du précédent`).toBe(true);
        return;
      }
      const source = readSource(filePath);
      const hasDefaultExport = /export\s+default\s+function\s+\w+|export\s+\{\s*\w+\s+as\s+default\s*\}/.test(source);
      expect(
        hasDefaultExport,
        "FeuilletMatchTab.tsx doit exporter un composant par défaut pour être utilisable avec next/dynamic.",
      ).toBe(true);
    });
  });

  // ── Anti-régression : les fonctions extraites ne doivent plus être inline ──
  describe("Anti-régression — les sous-composants ne sont plus définis inline dans page.tsx", () => {
    it("SéanceTab ne doit plus être définie directement dans tactics/page.tsx", () => {
      const source = readSource(TACTICS_PAGE);
      // Après split, la définition inline `function SéanceTab()` ne doit plus apparaître
      const hasInlineDefinition = /^function\s+S[ée]anceTab\s*\(/m.test(source);
      expect(
        hasInlineDefinition,
        [
          "La fonction SéanceTab est encore définie inline dans tactics/page.tsx.",
          "Elle doit être extraite dans SeanceTab.tsx et importée dynamiquement.",
        ].join("\n"),
      ).toBe(false);
    });

    it("FeuilletMatchTab ne doit plus être définie directement dans tactics/page.tsx", () => {
      const source = readSource(TACTICS_PAGE);
      const hasInlineDefinition = /^function\s+FeuilletMatchTab\s*\(/m.test(source);
      expect(
        hasInlineDefinition,
        [
          "La fonction FeuilletMatchTab est encore définie inline dans tactics/page.tsx.",
          "Elle doit être extraite dans FeuilletMatchTab.tsx et importée dynamiquement.",
        ].join("\n"),
      ).toBe(false);
    });
  });
});
