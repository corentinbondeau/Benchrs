/**
 * Tests de non-régression — Suspense boundaries (P4.2)
 *
 * Périmètre :
 *   1. Dashboard  : src/app/(dashboard)/page.tsx doit utiliser <Suspense avec un fallback non-null
 *   2. Calendar   : src/app/(dashboard)/calendar/page.tsx doit utiliser <Suspense avec un fallback non-null
 *
 * Phase "Red" attendue (avant l'implémentation) :
 *   - Les deux pages n'utilisent actuellement PAS de <Suspense
 *   - Tous les tests doivent ÉCHOUER en phase Red
 *
 * Convention : tests purement statiques (lecture de fichiers + analyse du source),
 * sans rendu DOM. Cohérent avec les tests P3.1 (settings-team-split.test.ts).
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ─── Chemins de référence ──────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, "../../..");
const DASHBOARD_ROOT = path.join(REPO_ROOT, "src/app/(dashboard)");

const DASHBOARD_PAGE = path.join(DASHBOARD_ROOT, "page.tsx");
const CALENDAR_PAGE = path.join(DASHBOARD_ROOT, "calendar/page.tsx");

/** Lit un fichier source et échoue explicitement s'il n'existe pas. */
function readPage(filePath: string): string {
  expect(
    fs.existsSync(filePath),
    `Le fichier source doit exister : ${filePath}`
  ).toBe(true);
  return fs.readFileSync(filePath, "utf-8");
}

/**
 * Vérifie qu'une chaîne source contient au moins N occurrences de <Suspense.
 * Accepte les deux graphies JSX : <Suspense et <React.Suspense.
 */
function countSuspenseUsages(source: string): number {
  return (source.match(/<(React\.)?Suspense[\s>]/g) || []).length;
}

/**
 * Vérifie qu'au moins un des <Suspense présents a un fallback différent de null.
 *
 * Pattern recherché (exemples valides) :
 *   fallback={<DashboardSkeleton />}
 *   fallback={<Skeleton />}
 *   fallback={<div>...</div>}
 *
 * Pattern invalide :
 *   fallback={null}
 *
 * On cherche un `fallback=` suivi d'une valeur JSX non-null sur la même ligne
 * OU un `fallback=` sans `null` dans les 3 lignes suivantes.
 */
function hasMeaningfulFallback(source: string): boolean {
  // Sépare les occurrences de Suspense et vérifie le fallback au niveau token
  const lines = source.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Ligne contient une ouverture Suspense
    if (!/<(React\.)?Suspense[\s>]/.test(line)) continue;

    // Cherche le fallback dans une fenêtre de 10 lignes (Suspense peut être multi-lignes)
    const window = lines.slice(i, i + 10).join("\n");

    // Le fallback est présent
    if (!window.includes("fallback=")) continue;

    // Le fallback vaut explicitement null → pas acceptable
    if (/fallback=\{null\}/.test(window)) continue;

    // Le fallback est une expression JSX (composant, élément, fragment) → acceptable
    if (/fallback=\{</.test(window) || /fallback=\(</.test(window)) {
      return true;
    }

    // Le fallback est une variable (ex: fallback={skeleton}) → aussi acceptable
    if (/fallback=\{[a-zA-Z]/.test(window)) {
      return true;
    }
  }

  return false;
}

/**
 * Vérifie qu'un import de Suspense est présent.
 * Cas valides :
 *   import React from "react"           (Suspense via React.Suspense)
 *   import { Suspense } from "react"
 *   import React, { Suspense } from "react"
 */
function hasSuspenseImport(source: string): boolean {
  // Import nommé de Suspense
  if (/import\s+.*\bSuspense\b.*from\s+['"]react['"]/.test(source)) {
    return true;
  }
  // Import default de React (donne accès à React.Suspense)
  if (/import\s+React\b.*from\s+['"]react['"]/.test(source)) {
    return true;
  }
  return false;
}

// ─── Suite 1 : Dashboard page.tsx ─────────────────────────────────────────────

describe("Suspense boundaries — Dashboard (page.tsx)", () => {
  it("le fichier dashboard page.tsx doit exister", () => {
    expect(
      fs.existsSync(DASHBOARD_PAGE),
      `Fichier introuvable : ${DASHBOARD_PAGE}`
    ).toBe(true);
  });

  it("doit importer Suspense depuis react", () => {
    const source = readPage(DASHBOARD_PAGE);
    expect(
      hasSuspenseImport(source),
      [
        "src/app/(dashboard)/page.tsx doit importer Suspense depuis 'react'.",
        "Exemples valides :",
        "  import React from 'react'",
        "  import { Suspense } from 'react'",
      ].join("\n")
    ).toBe(true);
  });

  it("doit contenir au moins une balise <Suspense dans le JSX", () => {
    const source = readPage(DASHBOARD_PAGE);
    const count = countSuspenseUsages(source);
    expect(
      count,
      [
        `src/app/(dashboard)/page.tsx ne contient aucune utilisation de <Suspense>.`,
        `Trouvé : ${count} occurrence(s).`,
        "Action attendue (@dev) : envelopper les widgets data-dependent dans <Suspense fallback={<Skeleton />}>.",
      ].join("\n")
    ).toBeGreaterThanOrEqual(1);
  });

  it("chaque <Suspense doit avoir un fallback non-null (skeleton ou loader)", () => {
    const source = readPage(DASHBOARD_PAGE);
    expect(
      hasMeaningfulFallback(source),
      [
        "src/app/(dashboard)/page.tsx : le <Suspense> présent n'a pas de fallback valide.",
        "Le fallback ne peut pas être null — il doit afficher un skeleton ou un loader.",
        "Exemple attendu : fallback={<DashboardSkeleton />}",
      ].join("\n")
    ).toBe(true);
  });
});

// ─── Suite 2 : Calendar page.tsx ─────────────────────────────────────────────

describe("Suspense boundaries — Calendar (calendar/page.tsx)", () => {
  it("le fichier calendar/page.tsx doit exister", () => {
    expect(
      fs.existsSync(CALENDAR_PAGE),
      `Fichier introuvable : ${CALENDAR_PAGE}`
    ).toBe(true);
  });

  it("doit importer Suspense depuis react", () => {
    const source = readPage(CALENDAR_PAGE);
    expect(
      hasSuspenseImport(source),
      [
        "src/app/(dashboard)/calendar/page.tsx doit importer Suspense depuis 'react'.",
        "Exemples valides :",
        "  import React from 'react'",
        "  import { Suspense } from 'react'",
      ].join("\n")
    ).toBe(true);
  });

  it("doit contenir au moins une balise <Suspense dans le JSX", () => {
    const source = readPage(CALENDAR_PAGE);
    const count = countSuspenseUsages(source);
    expect(
      count,
      [
        `src/app/(dashboard)/calendar/page.tsx ne contient aucune utilisation de <Suspense>.`,
        `Trouvé : ${count} occurrence(s).`,
        "Action attendue (@dev) : envelopper les sections data-dependent dans <Suspense fallback={<CalendarSkeleton />}>.",
      ].join("\n")
    ).toBeGreaterThanOrEqual(1);
  });

  it("chaque <Suspense doit avoir un fallback non-null (skeleton ou loader)", () => {
    const source = readPage(CALENDAR_PAGE);
    expect(
      hasMeaningfulFallback(source),
      [
        "src/app/(dashboard)/calendar/page.tsx : le <Suspense> présent n'a pas de fallback valide.",
        "Le fallback ne peut pas être null — il doit afficher un skeleton ou un loader.",
        "Exemple attendu : fallback={<CalendarSkeleton />}",
      ].join("\n")
    ).toBe(true);
  });
});

// ─── Suite 3 : Garde-fou — fallback={null} interdit ──────────────────────────

describe("Garde-fou — fallback={null} interdit dans les deux pages", () => {
  it("dashboard page.tsx ne doit pas utiliser fallback={null}", () => {
    const source = readPage(DASHBOARD_PAGE);
    const hasNullFallback = /fallback=\{null\}/.test(source);
    expect(
      hasNullFallback,
      [
        "src/app/(dashboard)/page.tsx utilise fallback={null} sur un <Suspense>.",
        "Un fallback null rend le Suspense invisible pour l'utilisateur — utiliser un skeleton.",
      ].join("\n")
    ).toBe(false);
  });

  it("calendar page.tsx ne doit pas utiliser fallback={null}", () => {
    const source = readPage(CALENDAR_PAGE);
    const hasNullFallback = /fallback=\{null\}/.test(source);
    expect(
      hasNullFallback,
      [
        "src/app/(dashboard)/calendar/page.tsx utilise fallback={null} sur un <Suspense>.",
        "Un fallback null rend le Suspense invisible pour l'utilisateur — utiliser un skeleton.",
      ].join("\n")
    ).toBe(false);
  });
});
