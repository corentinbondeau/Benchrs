#!/usr/bin/env node
// Garde-fou de parité entre l'app principale (src/) et le fork legacy (legacy-app/src/).
//
// Usage CLI :
//   node scripts/check-legacy-parity.mjs
//
// Depuis le commit amont "merge: corrections UX du legacy-app (lots 1 et 2)",
// legacy-app/ n'est plus un miroir parfait de src/ : le fork a volontairement
// divergé sur l'UI (error boundaries propres au fork, corrections
// d'accessibilité, pagination, pause des timers). Continuer à comparer
// l'intégralité de src/ écraserait ce travail à chaque "npm run sync:legacy"
// et rendrait la CI rouge en permanence.
//
// La parité ne porte donc plus que sur la LOGIQUE MÉTIER PARTAGÉE, seule
// partie que le fork doit rester tenu de répliquer à l'identique. Tout le
// reste (pages, composants UI hors lineup, hooks, tests) est laissé libre.
//
// Compare récursivement, pour chacune des racines de PARITY_SCOPE, les deux
// arborescences (par hash de contenu) et échoue (exit 1) si une dérive hors
// allowlist est détectée dans ce périmètre. Utiliser "npm run sync:legacy"
// pour resynchroniser le fork après une modification de src/.
//
// Ce module expose aussi une fonction pure `checkLegacyParity` testable
// unitairement (voir src/__tests__/legacy/parity.test.ts).

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Périmètre de la parité src/ <-> legacy-app/src/.
 *
 * Restreint depuis le lot de corrections UX du fork : seule la logique
 * métier partagée (lib, types, composants de composition d'équipe) doit
 * rester strictement identique entre les deux arborescences. Le reste de
 * l'UI (app/**, composants hors lineup, hooks, tests) est une variante
 * assumée du fork et n'est plus comparé.
 */
export const PARITY_SCOPE = ["lib", "types", "components/lineup"];

/**
 * Allowlist des écarts intentionnels entre src/ et legacy-app/src/, à
 * l'intérieur du périmètre défini par PARITY_SCOPE.
 * Chemins relatifs à la racine des deux répertoires comparés.
 */
export const DEFAULT_ALLOWLIST = ["lib/legacyUserAgent.ts", "lib/legacyUserAgent.test.ts"];

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
 * Détermine si un chemin relatif (séparateur "/") est dans le périmètre de parité.
 * @param {string} relPath
 * @param {string[]} scope
 */
function isInScope(relPath, scope) {
  return scope.some((root) => root === "." || relPath === root || relPath.startsWith(`${root}/`));
}

/**
 * Compare récursivement mainDir et legacyDir, restreint au périmètre `scope`.
 * @param {{ mainDir: string, legacyDir: string, allowlist?: string[], scope?: string[] }} params
 * @returns {{ ok: boolean, drift: Array<{ type: "ONLY_IN_MAIN"|"ONLY_IN_LEGACY"|"CONTENT_DIFF", path: string }> }}
 */
export function checkLegacyParity({
  mainDir,
  legacyDir,
  allowlist = DEFAULT_ALLOWLIST,
  scope = PARITY_SCOPE,
}) {
  const allowSet = new Set(allowlist);

  const mainFiles = new Set(listFilesRecursive(mainDir));
  const legacyFiles = new Set(listFilesRecursive(legacyDir));

  const allPaths = Array.from(new Set([...mainFiles, ...legacyFiles]))
    .filter((relPath) => isInScope(relPath, scope))
    .sort();

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
    console.log(
      `✅ Parité OK : src/ et legacy-app/src/ sont synchronisés (hors allowlist) sur le périmètre restreint (${PARITY_SCOPE.join(", ")}).`
    );
    process.exit(0);
  }

  console.error(
    `❌ Dérive détectée entre src/ et legacy-app/src/ (périmètre : ${PARITY_SCOPE.join(", ")}) :\n`
  );

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
    'Résolution : lancer "npm run sync:legacy" pour resynchroniser le fork sur le périmètre ' +
      `logique métier (${PARITY_SCOPE.join(", ")}), ou déclarer l'écart dans l'allowlist ` +
      "(scripts/check-legacy-parity.mjs) s'il est intentionnel. " +
      "Le reste de l'UI (app/**, composants hors lineup) est une divergence volontaire du fork, non surveillée."
  );

  process.exit(1);
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isDirectRun) {
  runCli();
}
