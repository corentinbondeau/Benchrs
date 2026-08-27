import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../../..");

interface CronEntry {
  path: string;
  schedule: string;
}

interface VercelConfig {
  crons?: CronEntry[];
}

function readVercelJson(relPath: string): VercelConfig {
  const fullPath = path.join(REPO_ROOT, relPath);
  const raw = fs.readFileSync(fullPath, "utf-8");
  return JSON.parse(raw) as VercelConfig;
}

/**
 * Convertit un path de cron Vercel (ex: "/api/sporteasy/ical-cron")
 * en chemin de fichier route.ts attendu sous l'apiDir donné.
 */
function cronPathToRouteFile(apiDir: string, cronPath: string): string {
  const relative = cronPath.replace(/^\/api\//, "");
  return path.join(REPO_ROOT, apiDir, relative, "route.ts");
}

const apps = [
  { label: "app principale", vercelJson: "vercel.json", apiDir: "src/app/api" },
  {
    label: "fork legacy",
    vercelJson: "legacy-app/vercel.json",
    apiDir: "legacy-app/src/app/api",
  },
];

describe.each(apps)(
  "cohérence crons vercel.json <-> routes ($label)",
  ({ label, vercelJson, apiDir }) => {
    it("chaque cron déclaré correspond à un route.ts existant", () => {
      const config = readVercelJson(vercelJson);
      const crons = config.crons ?? [];

      const orphans = crons
        .map((cron) => cron.path)
        .filter((cronPath) => !fs.existsSync(cronPathToRouteFile(apiDir, cronPath)));

      expect(
        orphans,
        `[${label}] Les crons suivants déclarés dans ${vercelJson} n'ont pas de route.ts ` +
          `correspondant sous ${apiDir}/ : ${JSON.stringify(orphans)}. ` +
          `Il faut soit créer la route, soit retirer l'entrée du cron.`
      ).toEqual([]);
    });
  }
);

describe("crons du fork legacy", () => {
  it("le fork ne déclare aucun cron, pour éviter la double exécution", () => {
    // Le fork legacy-app est déployé comme un projet Vercel distinct, mais pointe
    // sur LA MÊME base Supabase que l'app principale. Y déclarer les mêmes crons
    // les exécuterait deux fois par jour (doubles notifications, doubles relances).
    // Les crons sont donc portés uniquement par l'app principale.
    const legacyConfig = readVercelJson("legacy-app/vercel.json");
    const legacyCrons = legacyConfig.crons ?? [];

    expect(
      legacyCrons,
      `legacy-app/vercel.json ne doit déclarer aucun cron (les crons sont portés par ` +
        `l'app principale uniquement, sinon ils s'exécutent en double sur la même base). ` +
        `Trouvé : ${JSON.stringify(legacyCrons)}`
    ).toEqual([]);
  });
});
