/**
 * bookmarklet.ts — LOT 8 (bookmarklet d'import DOFA depuis le navigateur du coach)
 *
 * ⚠️ CORRECTION AU PLAN (prime sur TODO_import_championnat.md) : le
 * bookmarklet ne POST PAS vers `/api/championships/dofa/ingest` et n'ouvre
 * AUCUN CORS côté Benchrs. Il ouvre un onglet Benchrs (route COURTE `/b/r`,
 * qui rend la même page que `/championship/bookmarklet/receive` — cette
 * dernière reste accessible pour compatibilité et lisibilité de l'URL) et
 * transmet les données par `postMessage`, avec vérification stricte de
 * l'origine des deux côtés.
 *
 * ⚠️ CORRECTIF TAILLE (post-lot 8) : la route `/championship/bookmarklet/
 * receive` pesait à elle seule ~30 caractères bruts (bien plus une fois
 * encodée dans le favori, chaque `/` coûtant 3 caractères en `%2F`). Avec
 * une origine Benchrs longue (préversion Vercel), le favori dépassait la
 * limite de 2000 caractères SANS LE MOINDRE SIGNAL. La route `/b/r` (rendant
 * la même page que `/championship/bookmarklet/receive`) libère la marge
 * nécessaire. `buildBookmarkletSource` lève désormais explicitement
 * `BookmarkletTooLargeError` si la limite est malgré tout dépassée — voir
 * plus bas.
 *
 * Ce module ne contient QUE des fonctions pures (aucune I/O). Le texte
 * généré par `buildBookmarkletSource` s'exécute, lui, dans le contexte du
 * navigateur du coach sur le site du district (flandres.fff.fr, etc.) — un
 * environnement JS hors de notre contrôle. Contraintes du code généré :
 *   - MOINS DE 2000 CARACTÈRES une fois encodé (limite pratique d'un favori
 *     navigateur) → noms courts, aucun commentaire, aucun espace superflu ;
 *   - aucune syntaxe ES2017+ à risque (`?.`, `??`) ;
 *   - toutes les valeurs injectées (origine, triplet) passent par
 *     `JSON.stringify` → jamais d'évasion de guillemet/parenthèse possible.
 *
 * 🔒 ANTI-RÉGRESSION CAPITALE : un échec réseau (après épuisement des
 * reprises) produit `{ status: "error" }`, JAMAIS `{ matches: [] }`. C'est
 * exactement le défaut qui a rendu la panne DOFA invisible pendant des mois
 * côté serveur (cause n°4 du chantier) : il ne doit pas réapparaître côté
 * client.
 */

import type { DofaPouleRef, DofaRawMatch, DofaTeamRef, DofaTerrain } from "./types";

export interface BookmarkletConfig {
  triplet: DofaPouleRef;
  benchrsOrigin: string;
}

export type BookmarkletFetchError = { kind: "network" | "cors" };

/** Nombre de reprises autorisées après l'échec initial (attempt 1 et 2). */
const MAX_RETRY_ATTEMPTS = 2;

/**
 * Limite pratique de taille d'un favori navigateur (`javascript:...`). Au
 * delà, le favori devient inutilisable (tronqué ou refusé selon le
 * navigateur) — SANS le moindre signal pour le coach qui l'installe quand
 * même. `buildBookmarkletSource` doit donc ÉCHOUER EXPLICITEMENT (exception)
 * plutôt que de retourner silencieusement une chaîne au-delà de cette
 * limite : cf. `BookmarkletTooLargeError` ci-dessous.
 */
export const MAX_BOOKMARKLET_LENGTH = 2000;

/**
 * Levée par `buildBookmarkletSource` quand la chaîne produite atteint ou
 * dépasse `MAX_BOOKMARKLET_LENGTH`. Porte la taille obtenue et la limite
 * pour un message d'erreur exploitable (log, UI de la page de
 * distribution).
 */
export class BookmarkletTooLargeError extends Error {
  constructor(public readonly length: number, public readonly limit: number) {
    super(`Bookmarklet trop volumineux : ${length} caractères (limite ${limit}).`);
    this.name = "BookmarkletTooLargeError";
  }
}

/**
 * Décide si une nouvelle tentative doit être faite après un échec réseau/CORS.
 * Le filtrage Akamai est intermittent (`ERR_FAILED 200 (OK)` sans en-tête
 * CORS) : au moins 2 reprises espacées sont accordées, puis abandon
 * EXPLICITE (retour `false`, jamais une valeur ambiguë).
 */
export function shouldRetry(attempt: number, _error: BookmarkletFetchError): boolean {
  return attempt <= MAX_RETRY_ATTEMPTS;
}

/**
 * Liste ORDONNÉE des endpoints à appeler côté navigateur du coach, sur la
 * base `/api/compets/{cp_no}/phases/{phase}/poules/{poule}/...` (même base
 * que `src/lib/dofa/client.ts`, réutilisée sans modification).
 *
 * ⚠️ ÉCART VOLONTAIRE avec le code réellement généré par
 * `buildBookmarkletSource` : cette fonction décrit les 3 endpoints
 * DISPONIBLES côté API DOFA (son propre test verrouille ces 3 entrées),
 * mais le bookmarklet généré n'en appelle que 2 (`resultat`, `calendrier`).
 * `classement_journees` est délibérément exclu de l'exécution réelle : ce
 * classement officiel est vide (`hydra:totalItems: 0`) sur l'ensemble des
 * poules testées en ce début de saison, et la décision A du plan prévoit
 * qu'il soit calculé côté serveur à partir des résultats (`computeStandings`,
 * lot 3) plutôt que récupéré ici. L'appeler depuis le bookmarklet ne
 * produirait donc que : une requête réseau supplémentaire, un risque de
 * blocage Akamai en plus, et des données jetées à la réception. Ne pas
 * synchroniser ce décalage avec un simple retrait de l'entrée ici : cette
 * liste sert aussi de documentation des endpoints DOFA disponibles.
 */
export function planFetches(
  triplet: DofaPouleRef
): Array<{ kind: "resultat" | "calendrier" | "classement_journees"; url: string }> {
  const base = `https://api-dofa.fff.fr/api/compets/${triplet.cp_no}/phases/${triplet.phase}/poules/${triplet.poule}`;
  return [
    { kind: "resultat", url: `${base}/resultat` },
    { kind: "calendrier", url: `${base}/calendrier` },
    { kind: "classement_journees", url: `${base}/classement_journees` },
  ];
}

function slimTeam(team: DofaTeamRef | undefined): { club: { cl_no: number }; number: number; short_name: string } {
  if (!team) return { club: { cl_no: 0 }, number: 0, short_name: "" };
  return {
    club: { cl_no: team.club.cl_no },
    number: team.number,
    short_name: team.short_name,
  };
}

function slimTerrain(
  terrain: DofaTerrain | null | undefined
): { name: string | null; address: string | null; zip_code: string | null; city: string | null } | null {
  if (!terrain) return null;
  return {
    name: terrain.name ?? null,
    address: terrain.address ?? null,
    zip_code: terrain.zip_code ?? null,
    city: terrain.city ?? null,
  };
}

/**
 * Transforme des matchs bruts DOFA en format allégé (~720 octets/match),
 * conservant SUR CHAQUE MATCH `competition.cp_no`, `phase.number`,
 * `poule.stage_number` (contrôle anti-injection de poule côté serveur, cf.
 * `ingest-validation.ts`). Le triplet appliqué est celui déclaré par
 * l'appelant (`triplet`), jamais une valeur lue dans le brut : garantit la
 * cohérence même si la source a été altérée.
 */
export function toSlimMatches(rawMatches: DofaRawMatch[], triplet: DofaPouleRef): unknown[] {
  return rawMatches.map((match) => ({
    ma_no: match.ma_no,
    competition: { cp_no: triplet.cp_no },
    phase: { number: triplet.phase },
    poule: { stage_number: triplet.poule },
    poule_journee: match.poule_journee ? { number: match.poule_journee.number } : null,
    home: slimTeam(match.home),
    away: slimTeam(match.away),
    terrain: slimTerrain(match.terrain),
    status: match.status ?? null,
    date: match.date,
    time: match.time ?? null,
    home_score: match.home_score ?? null,
    home_is_forfeit: match.home_is_forfeit,
    away_score: match.away_score ?? null,
    away_is_forfeit: match.away_is_forfeit,
    seems_postponed: match.seems_postponed,
  }));
}

/**
 * Construit le triplet à injecter dans le code généré à partir de
 * `config.triplet`, sans jamais faire confiance à sa forme réelle : seules
 * les 3 clés attendues sont lues, en valeurs numériques forcées. Une
 * éventuelle propriété `__proto__` (ou toute autre) portée par un objet
 * malformé n'est donc jamais recopiée dans le code généré.
 */
function safeTriplet(triplet: DofaPouleRef): { cp_no: number; phase: number; poule: number } {
  return {
    cp_no: Number(triplet.cp_no),
    phase: Number(triplet.phase),
    poule: Number(triplet.poule),
  };
}

/**
 * Sérialise `value` en littéral de chaîne JS **à guillemets simples**
 * (`'...'`) — jamais `"` — car `encodeURIComponent` n'échappe pas `'`
 * (caractère non réservé) alors qu'il échappe `"` en `%22` (3 caractères
 * pour 1) : décisif pour tenir sous la limite de 2000 caractères d'un
 * favori navigateur avec de nombreux littéraux de chaîne.
 *
 * Échappement volontairement STRICT : tout guillemet simple, antislash ou
 * caractère de contrôle de la valeur source est converti en séquence
 * `\uXXXX`, jamais recopié tel quel. Une valeur hostile (ex. contenant
 * `');alert(1);//`) ne peut donc jamais faire apparaître dans le texte
 * généré la séquence brute nécessaire à une évasion de guillemet.
 */
function jsStringLiteral(value: string): string {
  let out = "'";
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    const code = value.charCodeAt(i);
    if (ch === "'" || ch === '"' || ch === "\\" || code < 0x20) {
      out += "\\u" + code.toString(16).padStart(4, "0");
    } else {
      out += ch;
    }
  }
  out += "'";
  return out;
}

/**
 * Génère le code source du bookmarklet (`javascript:...`, encodé via
 * `encodeURIComponent`). Ce code, exécuté sur le site du district :
 *   1. appelle SEULEMENT 2 endpoints DOFA (résultat, calendrier — PAS
 *      `classement_journees`, cf. commentaire de `planFetches`) avec
 *      reprise (2 essais supplémentaires espacés, abandon explicite ensuite) ;
 *   2. allège les matchs (résultat + calendrier) ;
 *   3. ouvre un onglet Benchrs et attend une POIGNÉE DE MAIN avant d'y
 *      transmettre quoi que ce soit (voir ci-dessous) ;
 *   4. en cas d'échec réseau non résorbé, transmet `{ s: "error" }` —
 *      jamais une liste de matchs vide.
 *
 * 🔒 POIGNÉE DE MAIN (anti course onglet/réseau) : sans elle, le
 * bookmarklet pourrait `postMessage` le résultat AVANT que la page de
 * réception (`.../bookmarklet/receive`) ait installé son écouteur — message
 * perdu en silence, coach persuadé d'avoir importé alors que rien n'est
 * arrivé. Le protocole retenu :
 *   - la page de réception envoie `{ t: "bdr" }` à `window.opener` dès que
 *     SON PROPRE écouteur `message` est en place (voir
 *     `receive/page.tsx`) ;
 *   - le bookmarklet n'envoie `{ t: "bdi", p: ... }` qu'une fois ce signal
 *     reçu ET les données prêtes — quel que soit l'ordre d'arrivée des deux
 *     événements (`y` = signal reçu, `p` = payload calculé ; l'envoi a lieu
 *     dès que les deux sont vrais, peu importe lequel arrive en premier) ;
 *   - le message `{ t: "bdr" }` n'est accepté QUE si `event.origin` est
 *     strictement égal à `benchrsOrigin` (jamais une correspondance
 *     partielle) : le favori s'exécute sur le domaine du district, il ne
 *     doit pas réagir à un signal usurpé par un tiers ;
 *   - si le signal n'arrive JAMAIS (onglet fermé par le coach, popup
 *     bloquée après coup, page de réception qui ne charge pas), un
 *     `setTimeout` de 15s déclenche un `alert()` explicite — jamais un
 *     abandon muet.
 *
 * Échappement : l'origine et le triplet ne sont JAMAIS concaténés bruts
 * dans le texte généré — l'origine passe par `jsStringLiteral` (échappement
 * strict caractère par caractère) et le triplet par `safeTriplet` (valeurs
 * forcées en `Number`), de sorte qu'aucune évasion de guillemet/parenthèse
 * n'est possible, y compris avec une origine ou un triplet hostile.
 */
export function buildBookmarkletSource(config: BookmarkletConfig): string {
  const origin = String(config.benchrsOrigin);
  const triplet = safeTriplet(config.triplet);
  const originLiteral = jsStringLiteral(origin);
  const tripletLiteral =
    "{cp_no:" + triplet.cp_no + ",phase:" + triplet.phase + ",poule:" + triplet.poule + "}";

  const body =
    "(function(){" +
    "var o=" + originLiteral + ",c=" + tripletLiteral + "," +
    "b='https://api-dofa.fff.fr/api/compets/'+c.cp_no+'/phases/'+c.phase+'/poules/'+c.poule+'/'," +
    "tt=t=>t?{club:{cl_no:t.club.cl_no},number:t.number,short_name:t.short_name}:{club:{cl_no:0},number:0,short_name:''}," +
    "tr=t=>t?{name:t.name||null,address:t.address||null,zip_code:t.zip_code||null,city:t.city||null}:null," +
    "sl=m=>({ma_no:m.ma_no,competition:{cp_no:c.cp_no},phase:{number:c.phase},poule:{stage_number:c.poule},poule_journee:m.poule_journee?{number:m.poule_journee.number}:null,home:tt(m.home),away:tt(m.away),terrain:tr(m.terrain),status:m.status||null,date:m.date,time:m.time||null,home_score:m.home_score,home_is_forfeit:m.home_is_forfeit,away_score:m.away_score,away_is_forfeit:m.away_is_forfeit,seems_postponed:m.seems_postponed})," +
    "gt=(u,i,cb)=>fetch(u).then(r=>r.ok?r.json():Promise.reject()).then(d=>cb(0,d)).catch(e=>i<2?setTimeout(()=>gt(u,i+1,cb),600*i):cb(1,0))," +
    "a=[],x=0,n=0,y=0,p=null," +
    "w=open(o+'/b/r');" +
    "if(!w){alert('Popup bloquee');return;}" +
    "var s=()=>w.postMessage({t:'bdi',p:p},o);" +
    "addEventListener('message',e=>{if(e.origin===o&&e.data&&e.data.t==='bdr'){y=1;if(p)s();}});" +
    "setTimeout(()=>{if(!y)alert('Onglet ferme');},15000);" +
    "['resultat','calendrier'].forEach(k=>gt(b+k,1,(e,d)=>{n++;if(e)x++;else (Array.isArray(d)?d:[]).forEach(m=>a.push(sl(m)));if(n===2){p=x>0?{s:'error'}:{s:'ok',m:a};if(y)s();}}));" +
    "})();";

  const result = "javascript:" + encodeURIComponent(body);
  if (result.length >= MAX_BOOKMARKLET_LENGTH) {
    throw new BookmarkletTooLargeError(result.length, MAX_BOOKMARKLET_LENGTH);
  }
  return result;
}
