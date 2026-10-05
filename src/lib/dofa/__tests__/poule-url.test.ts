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

describe("parsePouleUrl — plateforme Épreuves (epreuves.fff.fr)", () => {
  // Source de vérité : la réponse DOFA de l'URL testée ci-dessous renvoie
  // competition.cp_no = 452059, phase.number = 1, poule.stage_number = 1
  // (« U18 Régional 2 », ligue Hauts-de-France, saison 2026, POULE A).
  it("extrait le triplet depuis l'URL de Ligue obtenue sur epreuves.fff.fr", () => {
    const url =
      "https://epreuves.fff.fr/competition/engagement/452059-u18-regional-2/phase/1/1/saison";
    expect(parsePouleUrl(url)).toEqual({ cpNo: 452059, phase: 1, poule: 1 });
  });

  it("accepte le même chemin sans le slug après l'identifiant", () => {
    expect(
      parsePouleUrl("https://epreuves.fff.fr/competition/engagement/452059/phase/1/1/saison")
    ).toEqual({ cpNo: 452059, phase: 1, poule: 1 });
  });

  it("accepte une phase et une poule qui ne valent pas 1", () => {
    expect(
      parsePouleUrl("https://epreuves.fff.fr/competition/engagement/457587-u14-d3/phase/2/4/saison")
    ).toEqual({ cpNo: 457587, phase: 2, poule: 4 });
  });

  it("ignore les segments trailing (onglet, slash final, …)", () => {
    const variants = [
      "https://epreuves.fff.fr/competition/engagement/452059-u18-regional-2/phase/1/1/saison",
      "https://epreuves.fff.fr/competition/engagement/452059-u18-regional-2/phase/1/1/saison/",
      "https://epreuves.fff.fr/competition/engagement/452059-u18-regional-2/phase/1/1",
      "https://epreuves.fff.fr/competition/engagement/452059-u18-regional-2/phase/1/1/classement",
      "https://epreuves.fff.fr/competition/engagement/452059-u18-regional-2/phase/1/1/resultats",
    ];
    for (const url of variants) {
      expect(parsePouleUrl(url)).toEqual({ cpNo: 452059, phase: 1, poule: 1 });
    }
  });

  it("tolère une query string superflue et le slash initial du site", () => {
    expect(
      parsePouleUrl(
        "https://epreuves.fff.fr/competition/engagement/452059-u18-regional-2/phase/1/1/saison?foo=bar"
      )
    ).toEqual({ cpNo: 452059, phase: 1, poule: 1 });
  });

  it("accepte le chemin Épreuves sur un autre sous-domaine FFF de confiance", () => {
    // La règle reste « sous-domaine réel de fff.fr » : même forme de chemin.
    expect(
      parsePouleUrl("https://www.fff.fr/competition/engagement/452059-u18/phase/1/1/saison")
    ).toEqual({ cpNo: 452059, phase: 1, poule: 1 });
  });

  it("rejette une URL Épreuves sans la poule (page de compétition, pas de poule)", () => {
    expect(
      parsePouleUrl("https://epreuves.fff.fr/competition/engagement/452059-u18-regional-2/phase/1/saison")
    ).toBeNull();
  });

  it("rejette une URL Épreuves sans la phase", () => {
    expect(
      parsePouleUrl("https://epreuves.fff.fr/competition/engagement/452059-u18-regional-2")
    ).toBeNull();
  });

  it("rejette un identifiant ou une phase non numérique sur un chemin Épreuves", () => {
    expect(
      parsePouleUrl("https://epreuves.fff.fr/competition/engagement/abc-u18/phase/1/1/saison")
    ).toBeNull();
    expect(
      parsePouleUrl("https://epreuves.fff.fr/competition/engagement/452059-u18/phase/x/1/saison")
    ).toBeNull();
  });

  it("rejette un chemin Épreuves sur un domaine hors FFF (sécurité)", () => {
    expect(
      parsePouleUrl("https://evil.example.com/competition/engagement/452059-u18/phase/1/1/saison")
    ).toBeNull();
    expect(
      parsePouleUrl("https://epreuves.fff.fr.evil.com/competition/engagement/452059-u18/phase/1/1/saison")
    ).toBeNull();
    expect(
      parsePouleUrl("https://notfff.fr/competition/engagement/452059-u18/phase/1/1/saison")
    ).toBeNull();
    expect(
      parsePouleUrl("https://xfff.fr/competition/engagement/452059-u18/phase/1/1/saison")
    ).toBeNull();
    expect(
      parsePouleUrl("https://evil.example.com/competition/engagement/452059-u18/phase/1/1/saison?host=epreuves.fff.fr")
    ).toBeNull();
    expect(
      parsePouleUrl("https://epreuves.fff.fr@evil.com/competition/engagement/452059-u18/phase/1/1/saison")
    ).toBeNull();
  });

  it("accepte tout sous-domaine FFF réel (règle intentionnelle, delegation DNS FFF)", () => {
    // Les districts ont des sous-domaines imprévisibles (flandres, escaut,
    // notepreuves…) : la règle est « fff.fr ou *.fff.fr », pas une liste
    // blanche d'hôtes. Un attaquant ne peut pas obtenir un sous-domaine
    // *.fff.fr sans contrôler la délégation DNS de la FFF.
    expect(
      parsePouleUrl("https://notepreuves.fff.fr/competition/engagement/452059-u18/phase/1/1/saison")
    ).toEqual({ cpNo: 452059, phase: 1, poule: 1 });
  });

  it("ne confond pas un identifiant collé au slug avec un cp_no tronqué", () => {
    // `452059abc-u18` : le slug est bien ancré sur le tiret, l'identifiant
    // reste la suite de chiffres qui précède → 452059.
    expect(
      parsePouleUrl("https://epreuves.fff.fr/competition/engagement/452059abc-u18/phase/1/1/saison")
    ).toBeNull();
  });
});

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
