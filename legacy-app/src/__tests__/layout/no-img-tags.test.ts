/**
 * Tests anti-régression P2.1 — Migration next/image dans les composants layout
 *
 * Ces tests analysent le **code source** des fichiers (pas le rendu DOM),
 * car le mock de next/image dans setup.ts rend les <Image> comme des <img>
 * au rendu, ce qui rend les deux indiscernables via Testing Library.
 *
 * Règles vérifiées :
 *   1. Aucune balise <img HTML native dans src/components/layout/
 *   2. Les logos above-the-fold (TopBar mobile + Sidebar) utilisent la prop `priority`
 *
 * Phase Red : ces tests DOIVENT ÉCHOUER tant que la migration next/image
 * n'est pas effectuée par @dev.
 */

import * as fs from "fs";
import * as path from "path";

// ─── Chemin du dossier layout ────────────────────────────────────────────────

const LAYOUT_DIR = path.resolve(__dirname, "../../components/layout");

// ─── Fichiers ciblés par la migration ────────────────────────────────────────

const TARGET_FILES = ["TopBar.tsx", "Sidebar.tsx", "BottomNav.tsx"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readSource(filename: string): string {
  return fs.readFileSync(path.join(LAYOUT_DIR, filename), "utf-8");
}

/**
 * Détecte toutes les occurrences de <img dans un contenu source.
 * On cherche la balise HTML native — pas les occurrences dans des commentaires
 * ou des chaînes de documentation.
 *
 * On exclude les lignes qui sont des commentaires (//... ou *...) pour éviter
 * les faux positifs sur les commentaires eslint-disable.
 */
function findRawImgTags(content: string, filename: string): string[] {
  const violations: string[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    // Ignorer les lignes de commentaire pur
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

    // Détecter une balise <img (ouvrante, avec ou sans espace après)
    if (/<img[\s/>]/.test(line)) {
      violations.push(`  [${filename}:${i + 1}] ${line.trim()}`);
    }
  }

  return violations;
}

/**
 * Vérifie qu'un fichier importe bien `Image` depuis `next/image`.
 */
function hasNextImageImport(content: string): boolean {
  return /import\s+Image\s+from\s+["']next\/image["']/.test(content) ||
    /import\s+\{[^}]*\bImage\b[^}]*\}\s+from\s+["']next\/image["']/.test(content);
}

/**
 * Vérifie que les usages du logo principal (/logo.svg) utilisent la prop `priority`.
 *
 * On cherche les blocs JSX <Image src="/logo.svg" ... priority ... />
 * ou <Image ... priority ... src="/logo.svg" ... />.
 *
 * La vérification est faite sur un contexte de ±3 lignes autour de la balise logo.
 */
function findLogosWithoutPriority(content: string, filename: string): string[] {
  const violations: string[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Cherche une balise Image (composant next/image) avec src="/logo.svg"
    if (!/<Image/.test(line) || !/"\/logo\.svg"/.test(line)) continue;

    // Récupère le bloc JSX complet (jusqu'à /> ou une ligne vide, max 8 lignes)
    const block = lines.slice(i, i + 8).join("\n");

    if (!block.includes("priority")) {
      violations.push(
        `  [${filename}:${i + 1}] <Image src="/logo.svg"> sans prop \`priority\` (logo above-the-fold)`
      );
    }
  }

  return violations;
}

// ─── Suite 1 : Interdiction des balises <img HTML natives ────────────────────

describe("Layout — aucune balise <img> HTML native", () => {
  it.each(TARGET_FILES)(
    "%s ne doit contenir aucune balise <img> — utiliser <Image> de next/image",
    (filename) => {
      const content = readSource(filename);
      const violations = findRawImgTags(content, filename);

      expect(
        violations,
        [
          `Le composant ${filename} contient encore des balises <img> HTML natives.`,
          "Remplacer par <Image> importé depuis 'next/image' pour optimiser le LCP.",
          "Violations détectées :",
          ...violations,
        ].join("\n")
      ).toHaveLength(0);
    }
  );

  it.each(TARGET_FILES)(
    "%s doit importer Image depuis next/image",
    (filename) => {
      const content = readSource(filename);

      expect(
        hasNextImageImport(content),
        `${filename} n'importe pas \`Image\` depuis 'next/image'. ` +
        `Ajouter : import Image from 'next/image'`
      ).toBe(true);
    }
  );
});

// ─── Suite 2 : Logos above-the-fold avec prop priority ───────────────────────

describe("Layout — logos above-the-fold avec prop priority", () => {
  /**
   * TopBar affiche le logo /logo.svg en mobile (above-the-fold, LCP critique).
   * Le composant <Image> correspondant doit avoir la prop `priority`.
   */
  it("TopBar.tsx — le logo /logo.svg mobile doit avoir la prop priority", () => {
    const content = readSource("TopBar.tsx");
    const violations = findLogosWithoutPriority(content, "TopBar.tsx");

    expect(
      violations,
      [
        "TopBar.tsx : le logo principal (/logo.svg) est above-the-fold sur mobile.",
        "Sans `priority`, Next.js le charge en lazy — ce qui dégrade le LCP.",
        "Ajouter la prop `priority` sur le <Image src=\"/logo.svg\"> concerné.",
        ...violations,
      ].join("\n")
    ).toHaveLength(0);
  });

  /**
   * Sidebar affiche le logo /logo.svg en en-tête (always visible, above-the-fold desktop).
   * Le composant <Image> correspondant doit avoir la prop `priority`.
   */
  it("Sidebar.tsx — le logo /logo.svg doit avoir la prop priority", () => {
    const content = readSource("Sidebar.tsx");
    const violations = findLogosWithoutPriority(content, "Sidebar.tsx");

    expect(
      violations,
      [
        "Sidebar.tsx : le logo principal (/logo.svg) est above-the-fold sur desktop.",
        "Sans `priority`, Next.js le charge en lazy — ce qui dégrade le LCP.",
        "Ajouter la prop `priority` sur le <Image src=\"/logo.svg\"> concerné.",
        ...violations,
      ].join("\n")
    ).toHaveLength(0);
  });

  /**
   * BottomNav (Sheet) affiche aussi /logo.svg dans le drawer mobile.
   * Il est above-the-fold seulement après ouverture — `priority` n'est pas requis ici.
   * On vérifie uniquement que si un <Image src="/logo.svg"> est présent, il compile.
   * (Pas de contrainte priority sur ce logo.)
   */
  it("BottomNav.tsx — sanity check : le fichier source est lisible et non vide", () => {
    const content = readSource("BottomNav.tsx");
    expect(content.length).toBeGreaterThan(100);
  });
});

// ─── Sanity checks ───────────────────────────────────────────────────────────

describe("Sanity — fichiers layout présents et non vides", () => {
  it.each(TARGET_FILES)("%s existe dans src/components/layout/", (filename) => {
    const fullPath = path.join(LAYOUT_DIR, filename);
    expect(fs.existsSync(fullPath), `Fichier manquant : ${fullPath}`).toBe(true);
  });

  it.each(TARGET_FILES)("%s contient du code TSX (plus de 50 lignes)", (filename) => {
    const content = readSource(filename);
    const lineCount = content.split("\n").length;
    expect(lineCount, `${filename} semble vide ou tronqué (${lineCount} lignes)`).toBeGreaterThan(50);
  });
});
