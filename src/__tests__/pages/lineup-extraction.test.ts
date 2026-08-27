/**
 * Test structurel léger — Extraction de LineupEditor (LOT 6)
 *
 * Objectif : garantir que `LineupEditor` a bien été extrait de
 * `FeuilletMatchTab.tsx` en un composant réutilisable, sans tester son rendu
 * (drag & drop HTML5 natif + Supabase + contextes ⇒ mocking lourd, hors périmètre).
 *
 * Périmètre volontairement minimal (2 assertions) :
 *  1. `LineupEditor.tsx` existe et exporte `LineupEditor`.
 *  2. `FeuilletMatchTab.tsx` fait moins de 150 lignes (wrapper mince) et importe
 *     `LineupEditor`.
 *
 * Phase Red : DOIT ÉCHOUER tant que l'extraction n'est pas réalisée.
 */

import * as fs from "fs";
import * as path from "path";

// ─── Chemins stables ─────────────────────────────────────────────────────────

const SRC_DIR = path.resolve(__dirname, "../../");
const LINEUP_EDITOR = path.resolve(
  SRC_DIR,
  "components/lineup/LineupEditor.tsx",
);
const FEUILLET_MATCH_TAB = path.resolve(
  SRC_DIR,
  "app/(dashboard)/tactics/FeuilletMatchTab.tsx",
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function countLines(filePath: string): number {
  const content = fs.readFileSync(filePath, "utf-8");
  return content.split("\n").length;
}

function readSource(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe("LineupEditor — extraction depuis FeuilletMatchTab.tsx (LOT 6)", () => {
  it("LineupEditor.tsx existe et exporte LineupEditor", () => {
    expect(
      fs.existsSync(LINEUP_EDITOR),
      `Fichier introuvable : ${LINEUP_EDITOR}\n` +
        "LineupEditor doit être extrait dans src/components/lineup/LineupEditor.tsx.",
    ).toBe(true);

    const source = readSource(LINEUP_EDITOR);
    const exportsLineupEditor =
      /export\s+(default\s+)?function\s+LineupEditor\b/.test(source) ||
      /export\s+const\s+LineupEditor\b/.test(source) ||
      /export\s*\{[^}]*\bLineupEditor\b[^}]*\}/.test(source);
    expect(
      exportsLineupEditor,
      "LineupEditor.tsx doit exporter un composant nommé `LineupEditor`.",
    ).toBe(true);
  });

  it("FeuilletMatchTab.tsx est un wrapper mince (< 150 lignes) important LineupEditor", () => {
    expect(
      fs.existsSync(FEUILLET_MATCH_TAB),
      `Fichier introuvable : ${FEUILLET_MATCH_TAB}`,
    ).toBe(true);

    const loc = countLines(FEUILLET_MATCH_TAB);
    expect(
      loc,
      [
        `FeuilletMatchTab.tsx fait ${loc} lignes — dépasse la limite de 150 LOC.`,
        "Le corps de l'éditeur doit être déplacé vers LineupEditor.tsx,",
        "FeuilletMatchTab.tsx ne doit rester qu'un wrapper mince.",
      ].join("\n"),
    ).toBeLessThan(150);

    const source = readSource(FEUILLET_MATCH_TAB);
    const importsLineupEditor =
      /import\s+.*\bLineupEditor\b.*from\s+["'][^"']*lineup\/LineupEditor["']/.test(
        source,
      );
    expect(
      importsLineupEditor,
      "FeuilletMatchTab.tsx doit importer `LineupEditor` depuis components/lineup/LineupEditor.",
    ).toBe(true);
  });
});
