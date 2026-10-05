/**
 * format.ts — affichage des horaires DOFA
 *
 * Les horaires importés sont des **instants** ISO (`kickoff`), stockés en
 * TIMESTAMPTZ : `"2026-09-06T13:00:00.000Z"` est bien 15h00 à Paris, ce
 * septembre-là (UTC+2). Toute lecture « à la découpe » de la chaîne
 * (`slice(11, 16)`) afficherait donc l'heure UTC au coach — un décalage de
 * 2 h en été, 1 h en hiver, et une date potentially fausse pour un match
 * tombant après minuit.
 *
 * La conversion passe par `Date` + les API `Intl`, qui appliquent le fuseau
 * du lecteur — exactement ce que fait le reste de l'application pour
 * `events.event_date` (calendrier, fiche match, notifications). C'est cette
 * cohérence qui compte : un match doit afficher la même heure partout.
 */

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * `"2026-09-06T13:00:00.000Z"` → `"06/09 à 15:00"` (heure locale du lecteur).
 *
 * Un coup d'envoi à minuit n'affiche pas d'heure (« 06/09 »), comme
 * auparavant : c'est le cas des matchs dont seule la date est connue.
 *
 * Renvoyé chaîne vide si l'horaire est absent ou illisible — l'appelant
 * n'affiche alors rien, jamais de « undefined » ni d'heure inventée.
 */
export function formatDofaKickoff(kickoff: string | null | undefined): string {
  if (!kickoff) return "";

  const date = new Date(kickoff);
  if (Number.isNaN(date.getTime())) return "";

  const label = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;

  const hours = date.getHours();
  const minutes = date.getMinutes();
  if (hours === 0 && minutes === 0) return label;

  return `${label} à ${pad(hours)}:${pad(minutes)}`;
}