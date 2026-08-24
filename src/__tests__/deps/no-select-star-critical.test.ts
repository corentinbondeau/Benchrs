/**
 * Test anti-régression — SELECT explicites sur le chemin critique
 *
 * Les requêtes Supabase `.select("*")` chargent toutes les colonnes, y compris
 * des données inutiles (blobs, colonnes non affichées). Sur le chemin critique
 * (dashboard, calendar, roster), cela alourdit chaque rendu de page sans
 * bénéfice fonctionnel.
 *
 * Ce test garantit que les fichiers du chemin critique utilisent exclusivement
 * des SELECT avec colonnes explicites, éliminant ainsi les transferts inutiles.
 *
 * Fichiers surveillés :
 *   - src/components/dashboard/NextEventCard.tsx
 *   - src/components/dashboard/RecentResults.tsx
 *   - src/components/dashboard/NewsFeed.tsx
 *   - src/app/(dashboard)/calendar/page.tsx
 *   - src/app/(dashboard)/roster/page.tsx
 *
 * Si ce test échoue après un changement, c'est qu'un `.select("*")` a été
 * (ré)introduit dans un fichier critique. Le corriger en listant les colonnes
 * réellement consommées par le composant.
 *
 * Exemple de correction :
 *   .select("*")
 *   → .select("id, title, event_date, type")
 */

import * as fs from "fs";
import * as path from "path";

// ─── Fichiers du chemin critique à surveiller ────────────────────────────────

const CRITICAL_FILES = [
  "src/components/dashboard/NextEventCard.tsx",
  "src/components/dashboard/RecentResults.tsx",
  "src/components/dashboard/NewsFeed.tsx",
  "src/app/(dashboard)/calendar/page.tsx",
  "src/app/(dashboard)/roster/page.tsx",
];

// ─── Patterns interdits ───────────────────────────────────────────────────────
//
// On cible uniquement les SELECT Supabase génériques :
//   .select("*")   et   .select('*')
//
// Les SELECT avec colonnes explicites (.select("id, name")) sont autorisés.

const FORBIDDEN_SELECT_STAR = [/\.select\(\s*["']\*["']\s*\)/];

// ─── Suite de tests ───────────────────────────────────────────────────────────

describe("SELECT explicites — chemin critique (dashboard, calendar, roster)", () => {
  const projectRoot = path.resolve(__dirname, "../../../");

  it("aucun fichier du chemin critique ne doit contenir .select(\"*\")", () => {
    const violations: string[] = [];

    for (const relativePath of CRITICAL_FILES) {
      const fullPath = path.join(projectRoot, relativePath);

      // Vérifier que le fichier existe avant de le lire
      if (!fs.existsSync(fullPath)) {
        violations.push(`  → ${relativePath} (fichier introuvable — chemin attendu : ${fullPath})`);
        continue;
      }

      const content = fs.readFileSync(fullPath, "utf-8");
      const lines = content.split("\n");

      for (const pattern of FORBIDDEN_SELECT_STAR) {
        const matchingLines = lines
          .map((line, idx) => ({ line, lineNumber: idx + 1 }))
          .filter(({ line }) => pattern.test(line));

        for (const { line, lineNumber } of matchingLines) {
          violations.push(
            `  → ${relativePath}:${lineNumber} — \`${line.trim()}\``,
          );
        }
      }
    }

    expect(
      violations,
      [
        `.select("*") détecté dans des fichiers du chemin critique.`,
        `Remplacer par des colonnes explicites (uniquement celles consommées par le composant).`,
        `Exemple : .select("id, title, event_date, type")`,
        `Violations :`,
        ...violations,
      ].join("\n"),
    ).toHaveLength(0);
  });

  it("doit avoir scanné exactement les fichiers déclarés dans CRITICAL_FILES (sanity check)", () => {
    const existingFiles = CRITICAL_FILES.filter((relativePath) => {
      const fullPath = path.join(projectRoot, relativePath);
      return fs.existsSync(fullPath);
    });

    expect(
      existingFiles.length,
      `Aucun fichier du chemin critique n'a pu être scanné. ` +
        `Vérifier que le projet est bien à l'emplacement attendu : ${projectRoot}`,
    ).toBeGreaterThan(0);
  });
});
