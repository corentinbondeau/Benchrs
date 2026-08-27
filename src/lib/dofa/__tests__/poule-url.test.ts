/**
 * Tests — parsePouleUrl (src/lib/dofa/poule-url.ts)
 *
 * Contrat visé :
 *   parsePouleUrl(input: string): { cpNo: number; phase: number; poule: number } | null
 *
 * Contexte (point A1 du plan, résolu) : les URLs de poule du site district
 * ont la forme observée sur flandres.fff.fr :
 *   https://flandres.fff.fr/competitions?tab=ranking&id=457587&phase=1&poule=4&type=ch
 * `id` = cp_no, `tab` et `type` n'influent pas sur l'extraction.
 *
 * ⚠️ Le test de sécurité (rejet des domaines hors *.fff.fr, y compris les
 * tentatives de contournement) est le plus important de ce fichier : l'URL
 * vient de la saisie utilisateur.
 *
 * Phase "Red" attendue : parsePouleUrl n'existe pas encore (module absent)
 * → TOUS les tests doivent échouer (erreur d'import ou fonction manquante).
 * Aucun code de production n'a été écrit par cet agent.
 */

import { describe, it, expect } from "vitest";
import { parsePouleUrl } from "@/lib/dofa/poule-url";

describe("parsePouleUrl — nominal", () => {
  const urls = [
    "https://flandres.fff.fr/competitions?tab=ranking&id=457587&phase=1&poule=4&type=ch",
    "https://flandres.fff.fr/competitions?tab=resultat&id=457587&phase=1&poule=4&type=ch",
    "https://flandres.fff.fr/competitions?tab=agenda&id=457587&phase=1&poule=4&type=ch",
    "https://flandres.fff.fr/competitions?tab=calendar&id=457587&phase=1&poule=4&type=ch",
  ];

  it.each(urls)("extrait le triplet correct depuis %s, quel que soit le `tab`", (url) => {
    expect(parsePouleUrl(url)).toEqual({ cpNo: 457587, phase: 1, poule: 4 });
  });

  it("fonctionne sur un autre district (sous-domaine différent, ex. escaut.fff.fr)", () => {
    const url = "https://escaut.fff.fr/competitions?tab=ranking&id=123456&phase=2&poule=7&type=ch";
    expect(parsePouleUrl(url)).toEqual({ cpNo: 123456, phase: 2, poule: 7 });
  });

  it("fonctionne aussi pour une coupe (type=cp), le type n'influe pas sur le triplet", () => {
    const url = "https://flandres.fff.fr/competitions?tab=ranking&id=457587&phase=1&poule=4&type=cp";
    expect(parsePouleUrl(url)).toEqual({ cpNo: 457587, phase: 1, poule: 4 });
  });
});

describe("parsePouleUrl — sécurité : rejet des domaines hors *.fff.fr", () => {
  it("rejette un domaine complètement différent", () => {
    expect(
      parsePouleUrl("https://evil.example.com/competitions?id=1&phase=1&poule=1")
    ).toBeNull();
  });

  it("rejette une tentative de contournement par sous-domaine trompeur (fff.fr.evil.com)", () => {
    expect(
      parsePouleUrl("https://fff.fr.evil.com/competitions?id=457587&phase=1&poule=4")
    ).toBeNull();
  });

  it("rejette un domaine ressemblant mais distinct (notfff.fr)", () => {
    expect(
      parsePouleUrl("https://notfff.fr/competitions?id=457587&phase=1&poule=4")
    ).toBeNull();
  });

  it("rejette un domaine qui contient fff.fr en préfixe sans être un sous-domaine réel (xfff.fr)", () => {
    expect(
      parsePouleUrl("https://xfff.fr/competitions?id=457587&phase=1&poule=4")
    ).toBeNull();
  });

  it("rejette une tentative avec fff.fr en query string sur un autre domaine", () => {
    expect(
      parsePouleUrl("https://evil.example.com/competitions?host=flandres.fff.fr&id=457587&phase=1&poule=4")
    ).toBeNull();
  });

  it("rejette un userinfo trompeur (flandres.fff.fr@evil.com)", () => {
    expect(
      parsePouleUrl("https://flandres.fff.fr@evil.com/competitions?id=457587&phase=1&poule=4")
    ).toBeNull();
  });
});

describe("parsePouleUrl — erreurs métier (jamais d'exception)", () => {
  it("retourne null pour une URL sans les paramètres attendus", () => {
    expect(parsePouleUrl("https://flandres.fff.fr/competitions?tab=ranking")).toBeNull();
  });

  it("retourne null si un seul des 3 paramètres manque (poule absente)", () => {
    expect(
      parsePouleUrl("https://flandres.fff.fr/competitions?id=457587&phase=1")
    ).toBeNull();
  });

  it("retourne null si les paramètres ne sont pas numériques", () => {
    expect(
      parsePouleUrl("https://flandres.fff.fr/competitions?id=abc&phase=1&poule=4")
    ).toBeNull();
  });

  it("retourne null pour une chaîne vide", () => {
    expect(parsePouleUrl("")).toBeNull();
  });

  it("retourne null pour une chaîne non-URL quelconque", () => {
    expect(parsePouleUrl("n'importe quoi")).toBeNull();
  });

  it("retourne null (sans lever d'exception) pour null", () => {
    // @ts-expect-error test volontaire d'une entrée hors du type déclaré
    expect(() => parsePouleUrl(null)).not.toThrow();
    // @ts-expect-error test volontaire d'une entrée hors du type déclaré
    expect(parsePouleUrl(null)).toBeNull();
  });

  it("retourne null (sans lever d'exception) pour undefined", () => {
    // @ts-expect-error test volontaire d'une entrée hors du type déclaré
    expect(() => parsePouleUrl(undefined)).not.toThrow();
    // @ts-expect-error test volontaire d'une entrée hors du type déclaré
    expect(parsePouleUrl(undefined)).toBeNull();
  });
});

describe("parsePouleUrl — cas limite : saisie manuelle du triplet", () => {
  it("accepte le triplet saisi à la main sous la forme '457587/1/4'", () => {
    expect(parsePouleUrl("457587/1/4")).toEqual({ cpNo: 457587, phase: 1, poule: 4 });
  });

  it("retourne null pour un triplet manuel mal formé (segment manquant)", () => {
    expect(parsePouleUrl("457587/1")).toBeNull();
  });

  it("retourne null pour un triplet manuel avec un segment non numérique", () => {
    expect(parsePouleUrl("457587/a/4")).toBeNull();
  });
});
