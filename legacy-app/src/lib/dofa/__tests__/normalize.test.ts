/**
 * Tests — normalizeDofaCollection() (src/lib/dofa/normalize.ts)
 *
 * Contexte (cause n°3 du diagnostic) :
 *   L'API DOFA renvoie deux formes de réponse selon l'endpoint :
 *     - /…/resultat, /…/calendrier, /…/matchs → tableau nu `[{...}]`
 *     - /…/classement_journees, /…/poule_journees → enveloppe Hydra
 *       `{ "hydra:member": [...], "hydra:totalItems": N }`
 *   normalizeDofaCollection() absorbe cette hétérogénéité et renvoie
 *   toujours un tableau, sans jamais lever d'exception (la classification
 *   des erreurs réseau reste la responsabilité du client fetch, pas de ce
 *   helper pur).
 *
 * Phase "Red" attendue : le module src/lib/dofa/normalize.ts n'existe pas
 * encore → tous les tests doivent échouer à l'import.
 *
 * Hors-scope explicite (cf. TODO lot 1) :
 *   - pas de validation du contenu des éléments du tableau (cf. lot 2,
 *     parse-matches.test.ts) ;
 *   - pas de test réseau (la fonction est pure, aucun fetch).
 */

import { describe, it, expect } from "vitest";
import { normalizeDofaCollection } from "@/lib/dofa/normalize";

describe("normalizeDofaCollection", () => {
  describe("nominal — tableau nu (endpoints resultat/calendrier/matchs)", () => {
    it("retourne un tableau nu tel quel", () => {
      const input = [{ ma_no: 1 }, { ma_no: 2 }];
      expect(normalizeDofaCollection(input)).toEqual(input);
    });

    it("retourne un tableau nu vide tel quel", () => {
      expect(normalizeDofaCollection([])).toEqual([]);
    });
  });

  describe("nominal — enveloppe Hydra (endpoints classement_journees/poule_journees)", () => {
    it("extrait le contenu de hydra:member", () => {
      const members = [{ id: 1 }, { id: 2 }];
      const input = { "hydra:member": members, "hydra:totalItems": 2 };
      expect(normalizeDofaCollection(input)).toEqual(members);
    });

    it("cas limite réel — enveloppe Hydra vide (saison non commencée, hydra:totalItems: 0) → []", () => {
      const input = { "hydra:member": [], "hydra:totalItems": 0 };
      expect(normalizeDofaCollection(input)).toEqual([]);
    });
  });

  describe("erreur métier significative — entrées inattendues ne doivent JAMAIS lever d'exception", () => {
    it.each([
      ["null", null],
      ["undefined", undefined],
      ["objet vide", {}],
      ["objet inattendu sans hydra:member", { foo: "bar" }],
      ["chaîne", "not an array"],
      ["nombre", 42],
      ["booléen", true],
    ])("entrée %s → tableau vide, sans throw", (_label, input) => {
      expect(() => normalizeDofaCollection(input)).not.toThrow();
      expect(normalizeDofaCollection(input)).toEqual([]);
    });

    it("hydra:member absent d'un objet enveloppe malformée → tableau vide sans throw", () => {
      const input = { "hydra:totalItems": 3 };
      expect(() => normalizeDofaCollection(input)).not.toThrow();
      expect(normalizeDofaCollection(input)).toEqual([]);
    });

    it("hydra:member n'est pas un tableau (contrat violé côté serveur) → tableau vide sans throw", () => {
      const input = { "hydra:member": "oops" };
      expect(() => normalizeDofaCollection(input)).not.toThrow();
      expect(normalizeDofaCollection(input)).toEqual([]);
    });
  });
});
