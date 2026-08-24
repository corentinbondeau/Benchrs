/**
 * Test anti-régression : aucun fichier source n'importe html-to-image statiquement
 *
 * html-to-image n'est utilisé que dans des handlers de clic (exportImage).
 * L'import statique top-level force le chargement de la lib au rendu initial,
 * alourdissant le bundle de ~120KB à chaque page incluant ces composants.
 *
 * Ce test garantit que l'import est dynamique (`await import("html-to-image")`),
 * c'est-à-dire chargé uniquement au moment où l'utilisateur clique.
 *
 * Fichiers concernés :
 *   - src/components/match/MatchPoster.tsx
 *   - src/components/stats/PlayerPaniniCard.tsx
 *
 * Si ce test échoue après un changement, c'est qu'un import statique a été
 * réintroduit. Remplacer par : const { toPng } = await import("html-to-image");
 */

import * as fs from "fs";
import * as path from "path";

// ─── Patterns d'import statique à interdire ───────────────────────────────────
//
// On cible UNIQUEMENT les imports top-level (statiques), PAS les imports dynamiques.
// Un import dynamique `await import("html-to-image")` est explicitement autorisé.
//
// Stratégie de détection :
//   1. Détecter `import ... from "html-to-image"` (ESM statique)
//   2. Détecter `require("html-to-image")` (CJS statique)
//   3. Exclure les lignes contenant `await import(` (dynamique légitime)

const STATIC_IMPORT_PATTERNS = [
  /^import\s+.*from\s+["']html-to-image["']/m,
  /^(?!.*await\s+import).*require\s*\(\s*["']html-to-image["']\s*\)/m,
];

// ─── Scanner récursif de fichiers sources ─────────────────────────────────────

function collectSourceFiles(dir: string, extensions: string[]): string[] {
  const results: string[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Ignorer node_modules et les dossiers de tests eux-mêmes
      if (entry.name === "node_modules" || entry.name === "__tests__") {
        continue;
      }
      results.push(...collectSourceFiles(fullPath, extensions));
    } else if (entry.isFile() && extensions.includes(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }

  return results;
}

// ─── Suite de tests ───────────────────────────────────────────────────────────

describe("Import dynamique — html-to-image", () => {
  const srcDir = path.resolve(__dirname, "../../");
  const sourceExtensions = [".ts", ".tsx", ".js", ".jsx"];

  let sourceFiles: string[];

  beforeAll(() => {
    sourceFiles = collectSourceFiles(srcDir, sourceExtensions);
  });

  it("aucun fichier source ne doit importer html-to-image statiquement (top-level)", () => {
    const violations: string[] = [];

    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, "utf-8");

      for (const pattern of STATIC_IMPORT_PATTERNS) {
        if (pattern.test(content)) {
          const relativePath = path.relative(srcDir, filePath);
          // Retrouver la ligne exacte pour le message d'erreur
          const matchingLine = content
            .split("\n")
            .find((line) => /import\s+.*from\s+["']html-to-image["']|require\s*\(\s*["']html-to-image["']/.test(line));
          violations.push(
            `  → ${relativePath}` + (matchingLine ? ` (ligne : \`${matchingLine.trim()}\`)` : ""),
          );
          break; // Un seul signalement par fichier suffit
        }
      }
    }

    expect(
      violations,
      [
        "html-to-image est importé statiquement dans des fichiers sources.",
        "Remplacer par un import dynamique dans le handler de clic :",
        "  const { toPng } = await import(\"html-to-image\");",
        "Fichiers en violation :",
        ...violations,
      ].join("\n"),
    ).toHaveLength(0);
  });

  it("les imports dynamiques await import(\"html-to-image\") sont explicitement autorisés (sanity check)", () => {
    // Ce test documente que les imports dynamiques sont le pattern cible.
    // Il vérifie qu'on ne flag pas à tort un fichier utilisant la forme dynamique.
    const fakeDynamicContent = `
      async function exportImage() {
        const { toPng } = await import("html-to-image");
        return toPng(el);
      }
    `;

    const isDynamic = STATIC_IMPORT_PATTERNS.some((p) => p.test(fakeDynamicContent));
    expect(isDynamic, "Un import dynamique await import() ne doit pas être considéré comme statique").toBe(false);
  });

  it("doit avoir scanné au moins un fichier source (sanity check)", () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });
});
