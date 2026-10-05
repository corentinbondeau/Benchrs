/**
 * Code d'invitation : résolution et persistance du code qui Allows de rejoindre
 * une équipe (lien `/join?code=...` → /login ou /register → /join).
 *
 * POURQUOI PERSISTER ? À l'ouverture du lien, l'utilisateur peut être envoyé
 * vers /login ou /register (par `?next=`), ou renvoyé au dashboard par un
 * contrôle de membership. À chaque détour, le code disparaît de l'URL : sans
 * mémorisation, /join réaffiche un champ vide et l'utilisateur doit le
 * ressaisir. Le code est donc conservé en localStorage (il ne s'agit pas d'un
 * secret : il est déjà affiché dans les réglages de l'équipe) puis effacé dès
 * la rejointe réussie.
 *
 * L'expiration évite qu'un vieux lien pré-remplisse indéfiniment le formulaire
 * ouvert depuis le menu « Rejoindre » (sans code).
 */

const PENDING_INVITE_KEY = "pendingInviteCode";

/** 24 h : couvre le parcours d'inscription/validation d'une invitation. */
const PENDING_INVITE_TTL_MS = 24 * 60 * 60 * 1000;

type PendingInvite = { code?: string; ts?: number };

/** Relit le code mémorisé. Vide si absent, expiré ou illisible. */
export function readPendingInvite(now: number = Date.now()): string {
  try {
    const raw = window.localStorage.getItem(PENDING_INVITE_KEY);
    if (!raw) return "";
    const { code, ts } = JSON.parse(raw) as PendingInvite;
    if (!code || !ts || now - ts > PENDING_INVITE_TTL_MS) {
      clearPendingInvite();
      return "";
    }
    return code;
  } catch {
    // JSON corrompu ou localStorage indisponible (navigation privée)
    return "";
  }
}

/** Mémorise le code pour les redirects à venir. */
export function savePendingInvite(code: string, now: number = Date.now()): void {
  if (!code) return;
  try {
    window.localStorage.setItem(
      PENDING_INVITE_KEY,
      JSON.stringify({ code, ts: now })
    );
  } catch {
    /* stockage indisponible (navigation privée) */
  }
}

/** Oubli le code (rejointe réussie). */
export function clearPendingInvite(): void {
  try {
    window.localStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    /* stockage indisponible (navigation privée) */
  }
}

/** Code à utiliser à l'ouverture de la page : celui du lien s'il y en a un,
 *  sinon celui mémorisé lors d'un détour précédent. */
export function resolveInviteCode(urlCode: string | null | undefined): string {
  return urlCode || readPendingInvite();
}

/** Extrait le code d'un paramètre interne `next` (ex. `/join?code=abc`).
 *  `useSearchParams` renvoie `next` déjà décodé, mais la forme encodée
 *  (`%2Fjoin%3Fcode%3Dabc`) est acceptée également : la traversée auth peut
 *  réencoder la valeur. */
export function extractInviteCode(next: string | null | undefined): string {
  if (!next) return "";
  const pattern = /[?&]code=([^&#]+)/;
  let match = next.match(pattern);
  if (!match) {
    try {
      match = decodeURIComponent(next).match(pattern);
    } catch {
      return "";
    }
  }
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}
