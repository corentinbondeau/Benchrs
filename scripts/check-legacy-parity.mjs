#!/usr/bin/env node
// Garde-fou de parité entre l'app principale (src/) et le fork legacy (legacy-app/src/).
//
// Usage CLI :
//   node scripts/check-legacy-parity.mjs
//
// Compare récursivement les deux arborescences (par hash de contenu) et échoue
// (exit 1) si une dérive hors allowlist est détectée. Utiliser
// "npm run sync:legacy" pour resynchroniser le fork après une modification de src/.
//
// Ce module expose aussi une fonction pure `checkLegacyParity` testable
// unitairement (voir src/__tests__/legacy/parity.test.ts).

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Allowlist des écarts intentionnels entre src/ et legacy-app/src/.
 * Chemins relatifs à la racine des deux répertoires comparés.
 */
export const DEFAULT_ALLOWLIST = [
  "proxy.ts",
  "middleware.ts",
  "lib/legacyUserAgent.ts",
  "lib/legacyUserAgent.test.ts",
  "app/layout.tsx",
  "app/globals.css",
];

function hashFile(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

function listFilesRecursive(rootDir) {
  const result = [];

  function walk(currentDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        result.push(path.relative(rootDir, fullPath).split(path.sep).join("/"));
      }
    }
  }

  walk(rootDir);
  return result;
}

/**
 * Compare récursivement mainDir et legacyDir.
 * @param {{ mainDir: string, legacyDir: string, allowlist?: string[] }} params
 * @returns {{ ok: boolean, drift: Array<{ type: "ONLY_IN_MAIN"|"ONLY_IN_LEGACY"|"CONTENT_DIFF", path: string }> }}
 */
export function checkLegacyParity({ mainDir, legacyDir, allowlist = DEFAULT_ALLOWLIST }) {
  const allowSet = new Set(allowlist);

  const mainFiles = new Set(listFilesRecursive(mainDir));
  const legacyFiles = new Set(listFilesRecursive(legacyDir));

  const allPaths = Array.from(new Set([...mainFiles, ...legacyFiles])).sort();

  const drift = [];

  for (const relPath of allPaths) {
    if (allowSet.has(relPath)) continue;

    const inMain = mainFiles.has(relPath);
    const inLegacy = legacyFiles.has(relPath);

    if (inMain && !inLegacy) {
      drift.push({ type: "ONLY_IN_MAIN", path: relPath });
    } else if (!inMain && inLegacy) {
      drift.push({ type: "ONLY_IN_LEGACY", path: relPath });
    } else {
      const mainHash = hashFile(path.join(mainDir, relPath));
      const legacyHash = hashFile(path.join(legacyDir, relPath));
      if (mainHash !== legacyHash) {
        drift.push({ type: "CONTENT_DIFF", path: relPath });
      }
    }
  }

  return { ok: drift.length === 0, drift };
}

function runCli() {
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const mainDir = path.join(repoRoot, "src");
  const legacyDir = path.join(repoRoot, "legacy-app/src");

  const { ok, drift } = checkLegacyParity({ mainDir, legacyDir });

  if (ok) {
    console.log("✅ Parité OK : src/ et legacy-app/src/ sont synchronisés (hors allowlist).");
    process.exit(0);
  }

  console.error("❌ Dérive détectée entre src/ et legacy-app/src/ :\n");

  const groups = {
    ONLY_IN_MAIN: drift.filter((d) => d.type === "ONLY_IN_MAIN"),
    ONLY_IN_LEGACY: drift.filter((d) => d.type === "ONLY_IN_LEGACY"),
    CONTENT_DIFF: drift.filter((d) => d.type === "CONTENT_DIFF"),
  };

  for (const [type, items] of Object.entries(groups)) {
    if (items.length === 0) continue;
    console.error(`  ${type} (${items.length}) :`);
    for (const item of items) {
      console.error(`    - ${item.path}`);
    }
    console.error("");
  }

  console.error(
    'Résolution : lancer "npm run sync:legacy" pour resynchroniser le fork, ' +
      "ou déclarer l'écart dans l'allowlist (scripts/check-legacy-parity.mjs) s'il est intentionnel."
  );

  process.exit(1);
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isDirectRun) {
  runCli();
}
