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
 */
export function cleanJson(text: string): string {
  const t = text.trim();
  const fenceMatch = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) return fenceMatch[1];
  const firstBrace = t.indexOf("{");
  const lastBrace = t.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) return t.slice(firstBrace, lastBrace + 1);
  return t;
}
