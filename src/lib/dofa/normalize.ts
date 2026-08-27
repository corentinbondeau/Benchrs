/**
 * normalizeDofaCollection() — absorbe l'hétérogénéité des réponses de
 * l'API DOFA (cause n°3 du diagnostic) :
 *   - /…/resultat, /…/calendrier, /…/matchs        → tableau nu `[{...}]`
 *   - /…/classement_journees, /…/poule_journees    → enveloppe Hydra
 *     `{ "hydra:member": [...], "hydra:totalItems": N }`
 *
 * Fonction pure : ne lève jamais d'exception, quel que soit l'input. La
 * classification des erreurs réseau (panne, 403 Akamai, etc.) reste de la
 * responsabilité du client fetch — pas de ce helper.
 */
export function normalizeDofaCollection(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }

  if (data && typeof data === "object") {
    const member = (data as Record<string, unknown>)["hydra:member"];
    if (Array.isArray(member)) {
      return member;
    }
  }

  return [];
}
