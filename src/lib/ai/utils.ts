/**
 * Utilitaires IA — normalisation des réponses texte du modèle
 */

/**
 * Nettoie la réponse brute d'un LLM pour en extraire le JSON.
 *
 * Cas gérés :
 *  1. Bloc markdown ```json … ``` ou ``` … ```
 *  2. JSON entouré de texte → extraction via indices de { et }
 *  3. JSON pur → retourné tel quel
 *  4. JSON tronqué (pas de } fermante) → erreur explicite
 */
export function cleanJson(text: string): string {
  const t = text.trim();
  if (!t) throw new Error("Réponse IA vide — aucun JSON à extraire");

  const fenceMatch = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) return fenceMatch[1];

  const firstBrace = t.indexOf("{");
  if (firstBrace < 0) throw new Error("Réponse IA invalide — aucun objet JSON détecté");

  const lastBrace = t.lastIndexOf("}");
  if (lastBrace <= firstBrace) {
    throw new Error(
      "Réponse IA tronquée — le JSON est incomplet (pas de } fermante). " +
      "Le modèle a probablement atteint la limite de tokens."
    );
  }

  return t.slice(firstBrace, lastBrace + 1);
}
