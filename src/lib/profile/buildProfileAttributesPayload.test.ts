import { describe, it, expect } from "vitest";
import { buildProfileAttributesPayload } from "./buildProfileAttributesPayload";
import { POSITIONS } from "../positions";

// Contrat : buildProfileAttributesPayload(input) construit le payload d'`update`
// Supabase sur `profiles`, à partir des champs saisis par le coach dans l'édition
// inline de PlayerProfile.tsx (pied fort / poste principal / postes secondaires).
//
// Signature attendue :
//   type BuildProfileAttributesInput = {
//     preferredFoot?: string | null;
//     position?: string | null;
//     secondaryPositions?: (string | null | undefined)[] | null;
//   };
//   type ProfileAttributesPayload = {
//     preferred_foot: "Droit" | "Gauche" | "Ambidextre" | null;
//     secondary_positions: string[];
//   };
//   function buildProfileAttributesPayload(
//     input: BuildProfileAttributesInput
//   ): ProfileAttributesPayload;
//
// ⚠️ Aucune clé `role` ne doit JAMAIS figurer dans le payload retourné : le trigger
// SQL `prevent_self_role_change` (072_security_fixes.sql:49-66) lève une exception
// sur tout update contenant `role`, y compris pour un coach.

const [GK, DC, LD, LG] = POSITIONS;

describe("buildProfileAttributesPayload", () => {
  // --- Cas 1 : normalisation de preferred_foot vide ---
  it("normalise preferred_foot '' en null (jamais en chaîne vide)", () => {
    const payload = buildProfileAttributesPayload({
      preferredFoot: "",
      position: null,
      secondaryPositions: [],
    });
    expect(payload.preferred_foot).toBeNull();
  });

  // --- Cas 2 : whitelist stricte des valeurs de pied fort ---
  it("accepte exactement 'Droit' | 'Gauche' | 'Ambidextre'", () => {
    for (const valid of ["Droit", "Gauche", "Ambidextre"] as const) {
      const payload = buildProfileAttributesPayload({
        preferredFoot: valid,
        position: null,
        secondaryPositions: [],
      });
      expect(payload.preferred_foot, `valeur valide '${valid}' doit être conservée`).toBe(valid);
    }
  });

  it("ramène à null toute valeur de preferred_foot hors whitelist (aucun CHECK SQL en base)", () => {
    const payload = buildProfileAttributesPayload({
      preferredFoot: "droit", // casse incorrecte, non listée dans settings/page.tsx:377-387
      position: null,
      secondaryPositions: [],
    });
    expect(payload.preferred_foot).toBeNull();
  });

  // --- Cas 3 : secondary_positions filtrées, dédupliquées, sans la position principale ---
  it("ne garde que des libellés valides de POSITIONS, dédupliqués", () => {
    const payload = buildProfileAttributesPayload({
      preferredFoot: null,
      position: GK,
      secondaryPositions: [DC, DC, LD, "Poste inexistant"],
    });
    expect(payload.secondary_positions.sort()).toEqual([DC, LD].sort());
  });

  it("exclut la position principale des postes secondaires même si elle est fournie en doublon", () => {
    const payload = buildProfileAttributesPayload({
      preferredFoot: null,
      position: DC,
      secondaryPositions: [DC, LG],
    });
    expect(payload.secondary_positions).toEqual([LG]);
  });

  // --- Cas 4 : jamais null pour secondary_positions (colonne NOT NULL DEFAULT '{}') ---
  it("produit [] (jamais null) quand aucun poste secondaire n'est fourni", () => {
    const payload = buildProfileAttributesPayload({
      preferredFoot: null,
      position: GK,
      secondaryPositions: [],
    });
    expect(payload.secondary_positions).toEqual([]);
  });

  it("produit [] (jamais null) quand secondaryPositions est null/undefined", () => {
    const payloadNull = buildProfileAttributesPayload({
      preferredFoot: null,
      position: GK,
      secondaryPositions: null,
    });
    const payloadUndefined = buildProfileAttributesPayload({
      preferredFoot: null,
      position: GK,
    });
    expect(payloadNull.secondary_positions).toEqual([]);
    expect(payloadUndefined.secondary_positions).toEqual([]);
  });

  // --- Cas 5 : verrou anti-trigger, le plus important du lot ---
  it("ne contient JAMAIS la clé 'role', même si l'appelant tente de l'injecter", () => {
    const payload = buildProfileAttributesPayload({
      preferredFoot: "Droit",
      position: GK,
      secondaryPositions: [DC],
      // @ts-expect-error tentative volontaire d'injection non prévue par le contrat
      role: "coach",
    });
    expect(
      Object.prototype.hasOwnProperty.call(payload, "role"),
      "le payload d'update ne doit jamais porter la clé 'role' (trigger prevent_self_role_change)"
    ).toBe(false);
  });

  // --- Robustesse : entrées null/undefined sur chaque champ ---
  it("ne plante pas si tous les champs sont null/undefined", () => {
    expect(() =>
      buildProfileAttributesPayload({
        preferredFoot: undefined,
        position: undefined,
        secondaryPositions: undefined,
      })
    ).not.toThrow();

    const payload = buildProfileAttributesPayload({
      preferredFoot: null,
      position: null,
      secondaryPositions: null,
    });
    expect(payload.preferred_foot).toBeNull();
    expect(payload.secondary_positions).toEqual([]);
  });

  it("filtre silencieusement les valeurs null/undefined à l'intérieur du tableau de postes secondaires", () => {
    const payload = buildProfileAttributesPayload({
      preferredFoot: null,
      position: null,
      secondaryPositions: [DC, null, undefined, LD],
    });
    expect(payload.secondary_positions.sort()).toEqual([DC, LD].sort());
  });
});
