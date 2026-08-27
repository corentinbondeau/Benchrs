import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { checkLegacyParity } from "../../../scripts/check-legacy-parity.mjs";

const REPO_ROOT = path.resolve(__dirname, "../../..");

/**
 * Garde-fou de parité src/ <-> legacy-app/src/.
 * Ce test est LE filet anti-régression : si une future US modifie src/
 * sans resynchroniser le fork, il doit casser.
 */
describe("checkLegacyParity", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function makeTmpDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-parity-"));
    tmpDirs.push(dir);
    return dir;
  }

  it("nominal critique : le repo actuel est conforme (src/ <-> legacy-app/src/ synchronisés hors allowlist)", () => {
    const result = checkLegacyParity({
      mainDir: path.join(REPO_ROOT, "src"),
      legacyDir: path.join(REPO_ROOT, "legacy-app/src"),
    });

    expect(
      result.ok,
      `Dérive détectée entre src/ et legacy-app/src/ (hors allowlist). ` +
        `Ce garde-fou doit rester vert : si un fichier a été modifié dans src/, ` +
        `il faut lancer "npm run sync:legacy" ou déclarer l'écart dans l'allowlist.\n` +
        `Fichiers en dérive : ${JSON.stringify(result.drift, null, 2)}`
    ).toBe(true);
    expect(result.drift).toEqual([]);
  });

  it("détecte les 3 types de dérive (ONLY_IN_MAIN, ONLY_IN_LEGACY, CONTENT_DIFF) et retourne ok: false", () => {
    const mainDir = makeTmpDir();
    const legacyDir = makeTmpDir();

    // Fichier identique des deux côtés : ne doit pas apparaître dans le rapport
    fs.writeFileSync(path.join(mainDir, "shared.ts"), "export const shared = 1;\n");
    fs.writeFileSync(path.join(legacyDir, "shared.ts"), "export const shared = 1;\n");

    // ONLY_IN_MAIN
    fs.writeFileSync(path.join(mainDir, "only-main.ts"), "export const onlyMain = true;\n");

    // ONLY_IN_LEGACY
    fs.writeFileSync(path.join(legacyDir, "only-legacy.ts"), "export const onlyLegacy = true;\n");

    // CONTENT_DIFF
    fs.writeFileSync(path.join(mainDir, "diverged.ts"), "export const value = 1;\n");
    fs.writeFileSync(path.join(legacyDir, "diverged.ts"), "export const value = 2;\n");

    const result = checkLegacyParity({ mainDir, legacyDir });

    expect(result.ok).toBe(false);

    const byPath = (p: string) => result.drift.find((d) => d.path === p);

    expect(
      byPath("only-main.ts"),
      `Attendu un drift ONLY_IN_MAIN pour only-main.ts, reçu : ${JSON.stringify(result.drift)}`
    ).toEqual({ type: "ONLY_IN_MAIN", path: "only-main.ts" });

    expect(
      byPath("only-legacy.ts"),
      `Attendu un drift ONLY_IN_LEGACY pour only-legacy.ts, reçu : ${JSON.stringify(result.drift)}`
    ).toEqual({ type: "ONLY_IN_LEGACY", path: "only-legacy.ts" });

    expect(
      byPath("diverged.ts"),
      `Attendu un drift CONTENT_DIFF pour diverged.ts, reçu : ${JSON.stringify(result.drift)}`
    ).toEqual({ type: "CONTENT_DIFF", path: "diverged.ts" });

    expect(byPath("shared.ts")).toBeUndefined();
  });

  it("respecte l'allowlist passée en paramètre : un écart déclaré ne remonte pas dans drift", () => {
    const mainDir = makeTmpDir();
    const legacyDir = makeTmpDir();

    fs.writeFileSync(path.join(mainDir, "allowed-diff.ts"), "export const v = 1;\n");
    fs.writeFileSync(path.join(legacyDir, "allowed-diff.ts"), "export const v = 2;\n");

    const result = checkLegacyParity({
      mainDir,
      legacyDir,
      allowlist: ["allowed-diff.ts"],
    });

    expect(
      result.ok,
      `L'écart "allowed-diff.ts" est déclaré dans l'allowlist, il ne doit pas faire échouer la parité. ` +
        `Drift reçu : ${JSON.stringify(result.drift)}`
    ).toBe(true);
    expect(result.drift).toEqual([]);
  });
});
