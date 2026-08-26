/**
 * Tests TDD — onboarding.ts (Phase RED)
 *
 * Feature cible : onboarding présenté à TOUS les utilisateurs après connexion
 * (overlay), avec :
 *   - un jeu d'étapes commun + des étapes spécifiques au rôle effectif,
 *   - un flag `profiles.onboarding_completed_at` (NULL = à faire, renseigné
 *     aussi bien à la complétion qu'au skip),
 *   - un rôle effectif résolu depuis `team_members.role` en priorité, avec
 *     repli sur `profiles.role`, et cas particulier "comite" pour un membre
 *     de club sans équipe.
 *
 * Règles métier couvertes :
 *   - resolveOnboardingRole : team_members.role prime toujours sur
 *     profiles.role (corrige le bug actuel où seul le profil parent existe).
 *   - hasClubMembership => "comite" uniquement si aucun rôle d'équipe ni de
 *     profil n'est disponible.
 *   - Défaut ultime : "player" (cohérent avec profiles.role DEFAULT 'player').
 *   - getOnboardingSteps : étapes communes (welcome, identity, notifications,
 *     done) toujours présentes ; étapes spécifiques strictement réservées au
 *     rôle concerné (player_profile, link_child, coach_tools).
 *   - isOnboardingNeeded : NULL => true ; date renseignée => false ;
 *     profil absent (null/undefined) => false, pour éviter un flash de
 *     l'overlay pendant le chargement initial du profil.
 *   - getMissingIdentityFields : détecte les champs manquants (null OU chaîne
 *     vide) parmi first_name, last_name, date_of_birth, phone, dans l'ordre
 *     de définition du schéma.
 */

import { describe, it, expect } from "vitest";

// Module non-existant : les tests doivent échouer ici (RED)
import {
  resolveOnboardingRole,
  getOnboardingSteps,
  isOnboardingNeeded,
  getMissingIdentityFields,
} from "@/lib/onboarding";

describe("resolveOnboardingRole", () => {
  // ==== CAS 1 — team_members.role prime quand présent ====
  it("retourne le rôle équipe quand teamRole est renseigné", () => {
    const role = resolveOnboardingRole({
      teamRole: "owner",
      profileRole: null,
      hasClubMembership: false,
    });
    expect(role).toBe("owner");
  });

  // ==== CAS 2 — repli sur profiles.role si teamRole absent ====
  it("se replie sur profileRole quand teamRole est null", () => {
    const role = resolveOnboardingRole({
      teamRole: null,
      profileRole: "parent",
      hasClubMembership: false,
    });
    expect(role).toBe("parent");
  });

  // ==== CAS 3 — membre de club sans équipe => comite ====
  it("résout 'comite' pour un membre de club sans équipe ni rôle profil", () => {
    const role = resolveOnboardingRole({
      teamRole: null,
      profileRole: null,
      hasClubMembership: true,
    });
    expect(role).toBe("comite");
  });

  // ==== CAS 4 — défaut ultime : player ====
  it("retombe sur 'player' par défaut quand aucune information n'est disponible", () => {
    const role = resolveOnboardingRole({
      teamRole: null,
      profileRole: null,
      hasClubMembership: false,
    });
    expect(role).toBe("player");
  });

  // ==== CAS 5 — teamRole prime même si profileRole diffère (corrige le bug actuel) ====
  it("privilégie teamRole sur profileRole même en cas de désaccord entre les deux sources", () => {
    const role = resolveOnboardingRole({
      teamRole: "player",
      profileRole: "parent",
      hasClubMembership: false,
    });
    expect(role).toBe("player");
  });
});

describe("getOnboardingSteps", () => {
  // ==== CAS 6 — étapes spécifiques au joueur ====
  it("inclut player_profile pour le rôle player, sans link_child ni coach_tools", () => {
    const steps = getOnboardingSteps("player");
    expect(steps).toContain("player_profile");
    expect(steps).not.toContain("link_child");
    expect(steps).not.toContain("coach_tools");
  });

  // ==== CAS 7 — étapes spécifiques au parent ====
  it("inclut link_child pour le rôle parent, sans player_profile", () => {
    const steps = getOnboardingSteps("parent");
    expect(steps).toContain("link_child");
    expect(steps).not.toContain("player_profile");
  });

  // ==== CAS 8 — étapes spécifiques coach/owner ====
  it("inclut coach_tools pour coach et owner, sans player_profile", () => {
    const coachSteps = getOnboardingSteps("coach");
    const ownerSteps = getOnboardingSteps("owner");
    expect(coachSteps).toContain("coach_tools");
    expect(ownerSteps).toContain("coach_tools");
    expect(coachSteps).not.toContain("player_profile");
    expect(ownerSteps).not.toContain("player_profile");
  });

  // ==== CAS 9 — comite : uniquement les étapes communes ====
  it("ne propose que les étapes communes pour le rôle comite", () => {
    const steps = getOnboardingSteps("comite");
    expect(steps).toEqual(["welcome", "identity", "notifications", "done"]);
  });

  // ==== CAS 10 — invariants communs à tous les rôles ====
  it("commence par welcome, finit par done, et contient toujours identity/notifications", () => {
    const roles: Array<"player" | "parent" | "coach" | "owner" | "comite"> = [
      "player",
      "parent",
      "coach",
      "owner",
      "comite",
    ];
    for (const role of roles) {
      const steps = getOnboardingSteps(role);
      expect(steps[0]).toBe("welcome");
      expect(steps[steps.length - 1]).toBe("done");
      expect(steps).toContain("identity");
      expect(steps).toContain("notifications");
    }
  });
});

describe("isOnboardingNeeded", () => {
  // ==== CAS 11 — flag NULL => onboarding à faire ====
  it("retourne true quand onboarding_completed_at est null", () => {
    expect(isOnboardingNeeded({ onboarding_completed_at: null })).toBe(true);
  });

  // ==== CAS 12 — flag renseigné => onboarding déjà traité ====
  it("retourne false quand onboarding_completed_at est renseigné", () => {
    expect(
      isOnboardingNeeded({ onboarding_completed_at: "2026-01-01T00:00:00Z" })
    ).toBe(false);
  });

  // ==== CAS 13 — profil non chargé => ne pas afficher (évite le flash) ====
  it("retourne false quand le profil est null ou undefined (chargement en cours)", () => {
    expect(isOnboardingNeeded(null)).toBe(false);
    expect(isOnboardingNeeded(undefined)).toBe(false);
  });
});

describe("getMissingIdentityFields", () => {
  // ==== CAS 14 — profil complet ====
  it("retourne un tableau vide quand tous les champs sont renseignés", () => {
    const missing = getMissingIdentityFields({
      first_name: "Jean",
      last_name: "Dupont",
      date_of_birth: "2000-01-01",
      phone: "0600000000",
    });
    expect(missing).toEqual([]);
  });

  // ==== CAS 15 — champs null détectés dans l'ordre du schéma ====
  it("détecte date_of_birth et phone manquants, dans l'ordre du schéma", () => {
    const missing = getMissingIdentityFields({
      first_name: "Jean",
      last_name: "Dupont",
      date_of_birth: null,
      phone: null,
    });
    expect(missing).toEqual(["date_of_birth", "phone"]);
  });

  // ==== CAS 16 — chaînes vides traitées comme manquantes ====
  it("traite les chaînes vides comme des champs manquants", () => {
    const missing = getMissingIdentityFields({
      first_name: "",
      last_name: "Dupont",
      date_of_birth: "2000-01-01",
      phone: "",
    });
    expect(missing).toEqual(["first_name", "phone"]);
  });
});
