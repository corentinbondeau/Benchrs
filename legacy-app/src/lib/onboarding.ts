/**
 * onboarding.ts — Logique pure de l'onboarding universel.
 *
 * Aucun import Supabase/React ici : ce module ne fait que résoudre le rôle
 * effectif, calculer les étapes à afficher, déterminer si l'onboarding est
 * nécessaire, et détecter les champs d'identité manquants.
 */

export type OnboardingRole = "player" | "parent" | "coach" | "owner" | "comite";

export type OnboardingStep =
  | "welcome"
  | "install_app"
  | "identity"
  | "player_profile"
  | "link_child"
  | "convocations"
  | "session_feedback"
  | "carpooling"
  | "coach_tools"
  | "coach_performance"
  | "coach_admin"
  | "notifications"
  | "done";

export interface ResolveOnboardingRoleParams {
  teamRole: string | null;
  profileRole: string | null;
  hasClubMembership: boolean;
}

/**
 * Résout le rôle effectif pour l'onboarding :
 *   1. `team_members.role` prime toujours (corrige le bug où seul le rôle
 *      profil parent était pris en compte).
 *   2. Repli sur `profiles.role`.
 *   3. "comite" si l'utilisateur est membre d'un club sans équipe ni rôle
 *      profil.
 *   4. Défaut ultime : "player" (cohérent avec profiles.role DEFAULT
 *      'player').
 */
export function resolveOnboardingRole({
  teamRole,
  profileRole,
  hasClubMembership,
}: ResolveOnboardingRoleParams): OnboardingRole {
  if (teamRole) return teamRole as OnboardingRole;
  if (profileRole) return profileRole as OnboardingRole;
  if (hasClubMembership) return "comite";
  return "player";
}

const COMMON_STEPS_BEFORE: OnboardingStep[] = ["welcome", "install_app", "identity"];
const COMMON_STEPS_AFTER: OnboardingStep[] = ["notifications", "done"];

/**
 * Retourne la liste ordonnée des étapes d'onboarding pour un rôle donné.
 * Les étapes communes (welcome, install_app, identity, notifications, done)
 * sont toujours présentes ; les étapes spécifiques (player_profile,
 * link_child, convocations, session_feedback, carpooling, coach_tools,
 * coach_performance, coach_admin) sont strictement réservées au rôle
 * concerné.
 */
export function getOnboardingSteps(role: OnboardingRole): OnboardingStep[] {
  const specific: OnboardingStep[] = [];

  switch (role) {
    case "player":
      specific.push("player_profile", "convocations", "session_feedback");
      break;
    case "parent":
      specific.push(
        "link_child",
        "convocations",
        "session_feedback",
        "carpooling"
      );
      break;
    case "coach":
    case "owner":
      specific.push("coach_tools", "coach_performance", "coach_admin");
      break;
    case "comite":
      break;
  }

  return [...COMMON_STEPS_BEFORE, ...specific, ...COMMON_STEPS_AFTER];
}

export interface OnboardingProfileLike {
  onboarding_completed_at?: string | null;
}

/**
 * Détermine si l'onboarding doit être affiché :
 *   - NULL => true (à faire)
 *   - date renseignée => false
 *   - profil absent (null/undefined, chargement en cours) => false, pour
 *     éviter un flash de l'overlay.
 */
export function isOnboardingNeeded(
  profile: OnboardingProfileLike | null | undefined
): boolean {
  if (!profile) return false;
  return profile.onboarding_completed_at === null || profile.onboarding_completed_at === undefined;
}

export interface IdentityFields {
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  phone: string | null;
}

const IDENTITY_FIELD_ORDER: Array<keyof IdentityFields> = [
  "first_name",
  "last_name",
  "date_of_birth",
  "phone",
];

/**
 * Détecte les champs manquants (null OU chaîne vide) parmi first_name,
 * last_name, date_of_birth, phone, dans l'ordre de définition du schéma.
 */
export function getMissingIdentityFields(
  fields: IdentityFields
): Array<keyof IdentityFields> {
  return IDENTITY_FIELD_ORDER.filter((key) => {
    const value = fields[key];
    return value === null || value === undefined || value === "";
  });
}
