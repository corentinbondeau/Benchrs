/**
 * Templating HTML brut ultra-compatible (zéro React, zéro bundle Next.js).
 *
 * Utilisé par la page `/legacy` pour servir un document HTML5 minimal,
 * compatible vieux Safari/Android sans JS moderne. Toute donnée utilisateur
 * doit être échappée via `escapeHtml` avant insertion dans le HTML.
 */

/**
 * Échappe les 5 caractères HTML sensibles (& < > " ').
 * Coercition sûre : null/undefined -> "", autres non-string -> String(s).
 * Ne throw jamais.
 */
export function escapeHtml(s: unknown): string {
  let str: string;
  if (s === null || s === undefined) {
    str = "";
  } else {
    try {
      str = String(s);
    } catch {
      str = "";
    }
  }

  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface RenderPageOptions {
  title: string;
  body: string;
  layout?: "auth" | "app";
  subtitle?: string;
  footer?: { text: string; linkHref: string; linkLabel: string };
}

const INLINE_STYLE = `
    body {
      margin: 0;
      padding: 0;
      background-color: #f6f8fb;
      color: #111827;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, Helvetica, sans-serif;
    }
    .page {
      max-width: 480px;
      margin: 0 auto;
      padding: 16px;
      box-sizing: border-box;
    }
    .container {
      max-width: 480px;
      margin: 0 auto;
      padding: 16px;
      background-color: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 14px;
      box-shadow: 0 2px 6px rgba(17, 24, 39, 0.08);
      box-sizing: border-box;
    }
    h1 {
      font-size: 20px;
      color: #111827;
      margin-top: 0;
    }
    a {
      color: #2563eb;
    }
    label {
      display: block;
      margin-top: 12px;
      margin-bottom: 4px;
      font-weight: bold;
      color: #111827;
    }
    input,
    select {
      width: 100%;
      padding: 10px;
      font-size: 16px;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      color: #111827;
      background-color: #ffffff;
      box-sizing: border-box;
    }
    .help-text {
      color: #6b7280;
      font-size: 13px;
      margin-top: 4px;
    }
    button {
      margin-top: 16px;
      padding: 12px 16px;
      background-color: #2563eb;
      color: #ffffff;
      border: none;
      border-radius: 14px;
      font-size: 16px;
      width: 100%;
      box-sizing: border-box;
    }
    button.btn-secondary {
      background-color: #ffffff;
      color: #111827;
      border: 1px solid #e5e7eb;
    }
    button[value="present"] {
      background-color: #16a34a;
    }
    button[value="absent"] {
      background-color: #dc2626;
    }
    button[value="late"] {
      background-color: #f59e0b;
    }
    .error {
      color: #dc2626;
      background-color: #fef2f2;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 8px 12px;
    }
    .confirmation {
      color: #16a34a;
      background-color: #f3f4f6;
      border-radius: 8px;
      padding: 8px 12px;
    }
    .auth-page {
      background-color: #0b1220;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      box-sizing: border-box;
    }
    .auth-card {
      background-color: #ffffff;
      border-radius: 12px;
      box-shadow: 0 0 0 1px rgba(17, 24, 39, 0.1);
      max-width: 448px;
      width: 100%;
      box-sizing: border-box;
    }
    .auth-card-body {
      padding: 24px;
      box-sizing: border-box;
    }
    .auth-logo {
      display: block;
      margin: 0 auto 8px auto;
    }
    .auth-title {
      font-size: 24px;
      font-weight: 600;
      color: #111827;
      text-align: center;
      margin: 0 0 4px 0;
    }
    .auth-subtitle {
      font-size: 14px;
      color: #6b7280;
      text-align: center;
      margin: 0 0 16px 0;
    }
    .auth-card-footer {
      background-color: rgba(243, 244, 246, 0.5);
      border-top: 1px solid #e5e7eb;
      border-bottom-left-radius: 12px;
      border-bottom-right-radius: 12px;
      padding: 16px;
      font-size: 14px;
      text-align: center;
      color: #111827;
      box-sizing: border-box;
    }
    .auth-card-footer a {
      color: #2563eb;
      font-weight: 600;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
    }
    .topbar {
      background-color: #0b1220;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .topbar-inner {
      display: block;
      max-width: 480px;
      margin: 0 auto;
      padding: 0 16px;
      height: 48px;
      line-height: 48px;
      box-sizing: border-box;
    }
    .topbar-inner img {
      vertical-align: middle;
      border-radius: 8px;
      margin-right: 10px;
    }
    .topbar-inner span {
      vertical-align: middle;
      font-size: 14px;
      font-weight: 700;
      color: #ffffff;
    }
    .nav-grid {
      margin-top: 16px;
    }
    .nav-card {
      display: block;
      background-color: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 12px;
      text-decoration: none;
      box-sizing: border-box;
    }
    .nav-icon {
      display: inline-block;
      width: 36px;
      height: 36px;
      line-height: 36px;
      text-align: center;
      border-radius: 8px;
      font-size: 18px;
      margin-bottom: 12px;
    }
    .nav-card .nav-title {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
      color: #111827;
    }
    .nav-card .nav-sub {
      margin: 2px 0 0 0;
      font-size: 12px;
      color: #6b7280;
    }
    .hero-card {
      background-color: #0b1220;
      color: #ffffff;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 16px;
      box-sizing: border-box;
    }
    .hero-card .hero-label {
      margin: 0 0 6px 0;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: rgba(255, 255, 255, 0.4);
    }
    .hero-card .hero-title {
      margin: 0 0 6px 0;
      font-size: 18px;
      font-weight: 700;
      color: #ffffff;
    }
    .hero-card .hero-details {
      margin: 0;
      font-size: 13px;
      color: rgba(255, 255, 255, 0.55);
    }
    .event-card {
      background-color: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
      box-sizing: border-box;
    }
    .event-card .event-title {
      margin: 0;
      font-size: 14px;
      font-weight: 500;
      color: #111827;
    }
    .event-card .event-date {
      margin: 2px 0 0 0;
      font-size: 12px;
      color: #6b7280;
    }
    .event-card .event-head {
      display: block;
      margin-bottom: 8px;
    }
    .event-card .event-badge {
      float: right;
    }
  `;

/**
 * Génère un document HTML5 complet, ultra-compatible (pas de dépendance
 * externe, pas de script). `title` est échappé automatiquement.
 * `layout: "auth"` produit un fond navy plein avec carte blanche centrée
 * (logo, titre, sous-titre optionnel, pied de carte optionnel). Par défaut
 * (ou `layout: "app"`), le layout historique avec bandeau est inchangé.
 */
export function renderPage({
  title,
  body,
  layout = "app",
  subtitle,
  footer,
}: RenderPageOptions): string {
  const safeTitle = escapeHtml(title);

  let innerBody: string;

  if (layout === "auth") {
    const subtitleBlock = subtitle
      ? `<p class="auth-subtitle">${escapeHtml(subtitle)}</p>`
      : "";

    const footerBlock = footer
      ? `<div class="auth-card-footer">${escapeHtml(footer.text)} <a href="${escapeHtml(footer.linkHref)}">${escapeHtml(footer.linkLabel)}</a></div>`
      : "";

    innerBody = `<div class="auth-page">
<div class="auth-card">
<div class="auth-card-body">
<img src="/favicon.png" width="48" height="48" class="auth-logo" alt="Benchrs">
<h1 class="auth-title">${safeTitle}</h1>
${subtitleBlock}
${body}
</div>
${footerBlock}
</div>
</div>`;
  } else {
    innerBody = `<div class="topbar"><div class="topbar-inner"><img src="/favicon-32.png" width="28" height="28" alt="Benchrs"><span>Benchrs</span></div></div>
<div class="page">
${body}
</div>`;
  }

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<style>${INLINE_STYLE}</style>
</head>
<body>
${innerBody}
</body>
</html>`;
}

/**
 * Rend un badge "pilule" pour un statut de présence (couleurs de charte).
 */
export function badge(status: "present" | "absent" | "late" | "pending"): string {
  const map: Record<typeof status, { bg: string; color: string; label: string }> = {
    present: { bg: "#DCFCE7", color: "#15803D", label: "Présent" },
    absent: { bg: "#FEE2E2", color: "#B91C1C", label: "Absent" },
    late: { bg: "#FEF3C7", color: "#B45309", label: "En retard" },
    pending: { bg: "#F3F4F6", color: "#374151", label: "En attente" },
  };

  const { bg, color, label } = map[status];

  return `<span class="badge" style="background-color:${bg};color:${color};">${label}</span>`;
}

/**
 * Rend un badge "pilule" pour un type d'événement (Match / Entraînement).
 */
export function eventTypeBadge(type: "match" | "training"): string {
  const map: Record<"match" | "training", { bg: string; color: string; label: string }> = {
    match: { bg: "#DBEAFE", color: "#1D4ED8", label: "Match" },
    training: { bg: "#DCFCE7", color: "#15803D", label: "Entraînement" },
  };

  const { bg, color, label } = map[type];

  return `<span class="badge" style="background-color:${bg};color:${color};">${label}</span>`;
}

export interface NavCardOptions {
  href: string;
  label: string;
  sublabel: string;
  icon: string;
  tint: string;
  iconColor: string;
}

/**
 * Carte de navigation (menu `/legacy`) : lien-carte blanc avec pastille
 * d'icône teintée, libellé et sous-libellé. Style aligné sur les cartes du
 * dashboard moderne (rounded 12px, bordure #e5e7eb, pastille 36px).
 */
export function navCard({ href, label, sublabel, icon, tint, iconColor }: NavCardOptions): string {
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);
  const safeSub = escapeHtml(sublabel);
  const safeIcon = escapeHtml(icon);
  const safeTint = escapeHtml(tint);
  const safeIconColor = escapeHtml(iconColor);

  return `<a class="nav-card" href="${safeHref}">
<span class="nav-icon" style="background-color:${safeTint};color:${safeIconColor};">${safeIcon}</span>
<p class="nav-title">${safeLabel}</p>
<p class="nav-sub">${safeSub}</p>
</a>`;
}

export interface HeroCardOptions {
  label: string;
  title: string;
  details: string;
}

/**
 * Carte "hero" navy du prochain événement (en-tête de la page présences),
 * inspirée de la NextEventCard moderne.
 */
export function heroCard({ label, title, details }: HeroCardOptions): string {
  return `<div class="hero-card">
<p class="hero-label">${escapeHtml(label)}</p>
<p class="hero-title">${escapeHtml(title)}</p>
<p class="hero-details">${escapeHtml(details)}</p>
</div>`;
}

export interface EventCardOptions {
  title: string;
  date: string;
  status: "present" | "absent" | "late" | "pending";
  attendanceId?: string;
  withActions?: boolean;
}

/**
 * Carte de convocation : titre de l'événement + date + badge de statut.
 * Si `withActions`, affiche les 3 boutons de réponse pleins pleine largeur
 * (Présent / Absent / En retard) dans un formulaire POST natif.
 */
export function eventCard({ title, date, status, attendanceId, withActions }: EventCardOptions): string {
  const head = `<div class="event-head">${badge(status)}<p class="event-title">${escapeHtml(title)}</p><p class="event-date">${escapeHtml(date)}</p></div>`;

  const actions = withActions
    ? `<form method="POST" action="/legacy/attendance">
<input type="hidden" name="attendanceId" value="${escapeHtml(attendanceId)}">
<button type="submit" name="status" value="present">Présent</button>
<button type="submit" name="status" value="absent">Absent</button>
<button type="submit" name="status" value="late">En retard</button>
</form>`
    : "";

  return `<div class="event-card">
${head}
${actions}
</div>`;
}

/**
 * Formate une date (ISO ou parseable) en français lisible
 * (ex. "mardi 25 août"). Retourne "" si la date est absente/invalide.
 * Utilise Intl (dispo côté serveur Node) — aucun JS client requis.
 */
export function formatDateFr(input: unknown): string {
  if (input === null || input === undefined || input === "") return "";
  const d = new Date(input as string | number);
  if (isNaN(d.getTime())) return "";
  try {
    return d.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } catch {
    return "";
  }
}

export interface FieldOptions {
  name: string;
  label: string;
  type: string;
  value?: unknown;
}

/**
 * Rend un champ de formulaire (<label> + <input>). La valeur repopulée est
 * échappée. Les champs `password` ne sont jamais repopulés (sécurité).
 */
export function field({ name, label, type, value }: FieldOptions): string {
  const safeName = escapeHtml(name);
  const safeLabel = escapeHtml(label);
  const safeType = escapeHtml(type);
  const safeValue = type === "password" ? "" : escapeHtml(value);

  return `<label for="${safeName}">${safeLabel}</label>
<input id="${safeName}" name="${safeName}" type="${safeType}" value="${safeValue}">`;
}
