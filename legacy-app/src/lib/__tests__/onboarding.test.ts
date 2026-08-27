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
  // ==== CAS 6 — séquence exacte pour le rôle player ====
  it("retourne la séquence exacte d'étapes pour le rôle player", () => {
    const steps = getOnboardingSteps("player");
    expect(steps).toEqual([
      "welcome",
      "install_app",
      "identity",
      "player_profile",
      "convocations",
      "session_feedback",
      "notifications",
      "done",
    ]);
  });

  // ==== CAS 7 — séquence exacte pour le rôle parent ====
  it("retourne la séquence exacte d'étapes pour le rôle parent", () => {
    const steps = getOnboardingSteps("parent");
    expect(steps).toEqual([
      "welcome",
      "install_app",
      "identity",
      "link_child",
      "convocations",
      "session_feedback",
      "carpooling",
      "notifications",
      "done",
    ]);
  });

  // ==== CAS 8 — séquence exacte pour coach et owner ====
  it("retourne la séquence exacte d'étapes pour coach et owner", () => {
    const expected = [
      "welcome",
      "install_app",
      "identity",
      "coach_tools",
      "coach_performance",
      "coach_admin",
      "notifications",
      "done",
    ];
    expect(getOnboardingSteps("coach")).toEqual(expected);
    expect(getOnboardingSteps("owner")).toEqual(expected);
  });

  // ==== CAS 9 — séquence exacte pour le rôle comite ====
  it("retourne la séquence exacte d'étapes pour le rôle comite", () => {
    const steps = getOnboardingSteps("comite");
    expect(steps).toEqual([
      "welcome",
      "install_app",
      "identity",
      "notifications",
      "done",
    ]);
  });

  // ==== CAS 10 — invariants communs à tous les rôles ====
  it("commence par welcome, finit par done, et contient toujours identity/install_app/notifications", () => {
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
      expect(steps).toContain("install_app");
      expect(steps).toContain("notifications");
    }
  });

  // ==== CAS 10bis — étanchéité : un joueur ne voit aucune étape hors de son périmètre ====
  it("n'expose jamais d'étape coach_* ni link_child ni carpooling pour le rôle player", () => {
    const steps = getOnboardingSteps("player");
    expect(steps).not.toContain("coach_tools");
    expect(steps).not.toContain("coach_performance");
    expect(steps).not.toContain("coach_admin");
    expect(steps).not.toContain("link_child");
    expect(steps).not.toContain("carpooling");
  });

  // ==== CAS 10ter — étanchéité : un parent ne voit ni player_profile ni étape coach_* ====
  it("n'expose jamais player_profile ni d'étape coach_* pour le rôle parent", () => {
    const steps = getOnboardingSteps("parent");
    expect(steps).not.toContain("player_profile");
    expect(steps).not.toContain("coach_tools");
    expect(steps).not.toContain("coach_performance");
    expect(steps).not.toContain("coach_admin");
  });

  // ==== CAS 10quater — étanchéité : un coach ne voit pas les étapes réservées player/parent ====
  it("n'expose jamais player_profile, convocations, session_feedback, link_child ni carpooling pour le rôle coach", () => {
    const steps = getOnboardingSteps("coach");
    expect(steps).not.toContain("player_profile");
    expect(steps).not.toContain("convocations");
    expect(steps).not.toContain("session_feedback");
    expect(steps).not.toContain("link_child");
    expect(steps).not.toContain("carpooling");
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
