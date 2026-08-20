/**
 * Tests — Utilitaire cleanJson (src/lib/ai/utils.ts)
 *
 * Périmètre :
 *   1. JSON brut       : chaîne JSON pure retournée telle quelle
 *   2. Bloc markdown   : délimiteurs ```json … ``` retirés proprement
 *   3. Texte autour    : extraction du premier bloc JSON valide entouré de texte
 *   4. Réponse vide    : chaîne vide → chaîne vide (pas d'erreur)
 *   5. JSON imbriqué   : objets imbriqués correctement préservés
 *
 * Hors-scope :
 *   - Parsing du JSON (JSON.parse) — cleanJson est une normalisation de string
 *   - JSON malformé — comportement non contractualisé dans l'US
 *   - Tableaux JSON (arrays) — couverture JSON object uniquement
 *
 * Phase "Red" attendue :
 *   - TOUS les tests DOIVENT ÉCHOUER — src/lib/ai/utils.ts n'existe pas encore.
 */

import { describe, it, expect } from "vitest";

// ─── Import du SUT (module à créer) ──────────────────────────────────────────

import { cleanJson } from "@/lib/ai/utils";

// ─────────────────────────────────────────────────────────────────────────────
// 1. JSON BRUT — pas de transformation nécessaire
// ─────────────────────────────────────────────────────────────────────────────

describe("cleanJson — JSON brut", () => {
  it("retourne le JSON tel quel quand aucun wrapper n'est présent", () => {
    const input = '{"key": "val"}';
    expect(cleanJson(input)).toBe('{"key": "val"}');
  });

  it("préserve les espaces et la forme originale du JSON pur", () => {
    const input = '{ "a": 1, "b": "hello" }';
    expect(cleanJson(input)).toBe('{ "a": 1, "b": "hello" }');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. BLOC MARKDOWN — délimiteurs ```json … ``` retirés
// ─────────────────────────────────────────────────────────────────────────────

describe("cleanJson — bloc markdown", () => {
  it("retire les délimiteurs ```json et ``` autour d'un objet JSON", () => {
    const input = '```json\n{"key": "val"}\n```';
    expect(cleanJson(input)).toBe('{"key": "val"}');
  });

  it("retire les délimiteurs ``` sans spécification de langage", () => {
    const input = '```\n{"key": "val"}\n```';
    expect(cleanJson(input)).toBe('{"key": "val"}');
  });

  it("gère les espaces/retours à la ligne supplémentaires dans le bloc markdown", () => {
    const input = '```json\n\n{"key": "val"}\n\n```';
    // Le JSON extrait doit être trimé
    expect(cleanJson(input).trim()).toBe('{"key": "val"}');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. TEXTE AUTOUR — extraction du premier objet JSON
// ─────────────────────────────────────────────────────────────────────────────

describe("cleanJson — texte autour du JSON", () => {
  it("extrait le JSON quand du texte précède et suit l'objet", () => {
    const input = 'blabla {"key": "val"} suite';
    expect(cleanJson(input)).toBe('{"key": "val"}');
  });

  it("extrait le premier objet JSON quand le modèle ajoute un préambule", () => {
    const input = 'Voici le résultat : {"score": 42, "label": "ok"} — fin de réponse.';
    expect(cleanJson(input)).toBe('{"score": 42, "label": "ok"}');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. RÉPONSE VIDE OU TRONQUÉE — erreurs explicites
// ─────────────────────────────────────────────────────────────────────────────

describe("cleanJson — réponse vide ou tronquée", () => {
  it("lance une erreur pour une entrée vide", () => {
    expect(() => cleanJson("")).toThrow("Réponse IA vide");
  });

  it("lance une erreur pour une entrée composée uniquement d'espaces", () => {
    expect(() => cleanJson("   ")).toThrow("Réponse IA vide");
  });

  it("lance une erreur quand aucun objet JSON n'est détecté", () => {
    expect(() => cleanJson("pas de json ici")).toThrow("aucun objet JSON détecté");
  });

  it("lance une erreur quand le JSON est tronqué (pas de } fermante)", () => {
    expect(() => cleanJson('{"key": "val", "nested": {"a": 1')).toThrow("tronquée");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. JSON IMBRIQUÉ
// ─────────────────────────────────────────────────────────────────────────────

describe("cleanJson — JSON imbriqué", () => {
  it("préserve les objets imbriqués intégralement", () => {
    const input = '{"a": {"b": 1}}';
    expect(cleanJson(input)).toBe('{"a": {"b": 1}}');
  });

  it("extrait correctement un JSON imbriqué entouré de texte", () => {
    const input = 'Résultat : {"player": {"name": "Alice", "score": 99}} terminé.';
    expect(cleanJson(input)).toBe('{"player": {"name": "Alice", "score": 99}}');
  });

  it("gère les valeurs de tableau imbriquées dans un objet", () => {
    const input = '{"items": [1, 2, 3], "count": 3}';
    expect(cleanJson(input)).toBe('{"items": [1, 2, 3], "count": 3}');
  });
});
