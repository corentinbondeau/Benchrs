/**
 * Test anti-régression : aucun fichier source n'importe framer-motion
 *
 * framer-motion est listée dans package.json mais n'est pas utilisée.
 * Ce test garantit qu'aucun import ne réapparaît, évitant ~80KB de bundle superflu.
 *
 * Si ce test échoue après un changement, c'est que framer-motion a été réimporté :
 * soit supprimer l'import, soit supprimer ce test + retirer la dépendance du package.json.
 */

import * as fs from "fs";
import * as path from "path";

// ─── Patterns d'import à interdire ──────────────────────────────────────────

const FORBIDDEN_PATTERNS = [
  /import\s+.*from\s+["']framer-motion["']/,
  /require\s*\(\s*["']framer-motion["']\s*\)/,
];

// ─── Scanner récursif de fichiers sources ────────────────────────────────────

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

// ─── Suite de tests ──────────────────────────────────────────────────────────

describe("Dépendances mortes — framer-motion", () => {
  const srcDir = path.resolve(__dirname, "../../");
  const sourceExtensions = [".ts", ".tsx", ".js", ".jsx"];

  let sourceFiles: string[];

  beforeAll(() => {
    sourceFiles = collectSourceFiles(srcDir, sourceExtensions);
  });

  it("aucun fichier source ne doit importer framer-motion", () => {
    const violations: string[] = [];

    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, "utf-8");

      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(content)) {
          const relativePath = path.relative(srcDir, filePath);
          violations.push(`  → ${relativePath} (correspond à : ${pattern})`);
          break; // Un seul signalement par fichier suffit
        }
      }
    }

    expect(
      violations,
      [
        "framer-motion est importé dans des fichiers sources alors qu'il s'agit d'une dépendance morte.",
        "Supprimer les imports suivants OU retirer framer-motion du package.json :",
        ...violations,
      ].join("\n"),
    ).toHaveLength(0);
  });

  it("doit avoir scanné au moins un fichier source (sanity check)", () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });
});
