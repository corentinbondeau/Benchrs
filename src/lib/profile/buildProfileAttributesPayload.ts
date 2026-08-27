import { POSITIONS } from "../positions";

export type BuildProfileAttributesInput = {
  preferredFoot?: string | null;
  position?: string | null;
  secondaryPositions?: (string | null | undefined)[] | null;
};

export type ProfileAttributesPayload = {
  preferred_foot: "Droit" | "Gauche" | "Ambidextre" | null;
  secondary_positions: string[];
};

const VALID_FEET = new Set(["Droit", "Gauche", "Ambidextre"]);

function normalizePreferredFoot(
  value: string | null | undefined
): "Droit" | "Gauche" | "Ambidextre" | null {
  if (!value) return null;
  return VALID_FEET.has(value)
    ? (value as "Droit" | "Gauche" | "Ambidextre")
    : null;
}

function normalizeSecondaryPositions(
  values: (string | null | undefined)[] | null | undefined,
  mainPosition: string | null | undefined
): string[] {
  if (!values) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value) continue;
    if (!POSITIONS.includes(value as (typeof POSITIONS)[number])) continue;
    if (value === mainPosition) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

// Fonction pure : construit le payload d'`update` Supabase sur `profiles`.
// ⛔ La clé `role` ne doit JAMAIS être présente dans le payload retourné : le
// trigger SQL `prevent_self_role_change` lève une exception sur tout update
// contenant `role`, y compris pour un coach (072_security_fixes.sql:49-66).
export function buildProfileAttributesPayload(
  input: BuildProfileAttributesInput
): ProfileAttributesPayload {
  return {
    preferred_foot: normalizePreferredFoot(input.preferredFoot),
    secondary_positions: normalizeSecondaryPositions(
      input.secondaryPositions,
      input.position
    ),
  };
}
