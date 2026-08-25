/**
 * Templating HTML brut ultra-compatible (zéro React, zéro bundle Next.js).
 *
 * Utilisé par la page `/legacy` pour servir un document HTML5 minimal,
 * compatible vieux Safari/Android sans JS moderne. Toute donnée utilisateur
 * doit être échappée via `escapeHtml` avant insertion dans le HTML.
 */

import { legacyNavForRole, type LegacyRole } from "./nav";

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
  bottomNavHtml?: string;
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
    .page.has-bottom-nav {
      padding-bottom: 72px;
    }
    .container {
      max-width: 480px;
      margin: 0 auto;
      padding: 16px;
      background-color: #ffffff;
      border-radius: 12px;
      box-shadow: 0 0 0 1px rgba(17, 24, 39, 0.1);
      box-sizing: border-box;
    }
    input:focus,
    select:focus {
      outline: 2px solid #2563eb;
      outline-offset: 0;
      border-color: #2563eb;
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
      color: #15803d;
      background-color: #ecfdf5;
      border: 1px solid #d1fae5;
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
    .event-card.ec-match {
      border-left: 3px solid #2563eb;
    }
    .event-card.ec-training {
      border-left: 3px solid #9ca3af;
    }
    .avatar {
      display: inline-block;
      width: 36px;
      height: 36px;
      line-height: 36px;
      text-align: center;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 700;
      margin-right: 10px;
      vertical-align: middle;
    }
    .avatar-row {
      display: block;
    }
    .avatar-row .avatar-text {
      display: inline-block;
      vertical-align: middle;
    }
    .page-header {
      display: block;
      margin-bottom: 16px;
    }
    .page-header .page-title {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      color: #111827;
    }
    .page-header .page-subtitle {
      margin: 4px 0 0 0;
      font-size: 14px;
      color: #6b7280;
    }
    .page-header .page-action {
      display: inline-block;
      margin-top: 12px;
      padding: 8px 14px;
      background-color: #2563eb;
      color: #ffffff;
      border-radius: 14px;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
    }
    .empty-state {
      text-align: center;
      padding: 40px 16px;
      box-sizing: border-box;
    }
    .empty-state .empty-icon {
      display: inline-block;
      width: 48px;
      height: 48px;
      line-height: 48px;
      text-align: center;
      border-radius: 12px;
      background-color: #f3f4f6;
      font-size: 22px;
      margin-bottom: 12px;
    }
    .empty-state .empty-title {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #111827;
    }
    .empty-state .empty-desc {
      margin: 6px auto 0 auto;
      max-width: 280px;
      font-size: 14px;
      color: #6b7280;
    }
    .bottom-nav {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: #0b1220;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      padding-bottom: env(safe-area-inset-bottom, 0px);
      z-index: 50;
      display: table;
      width: 100%;
      table-layout: fixed;
    }
    .bottom-nav a.bn-item {
      display: table-cell;
      text-align: center;
      padding: 8px 2px;
      text-decoration: none;
      color: rgba(255, 255, 255, 0.35);
      vertical-align: middle;
      position: relative;
    }
    .bottom-nav a.bn-item .bn-icon {
      display: block;
      font-size: 18px;
      line-height: 20px;
    }
    .bottom-nav a.bn-item .bn-label {
      display: block;
      font-size: 10px;
      margin-top: 2px;
    }
    .bottom-nav a.bn-item.active {
      color: #ffffff;
    }
    .bottom-nav a.bn-item.active .bn-bar {
      position: absolute;
      top: 0;
      left: 25%;
      right: 25%;
      height: 2px;
      border-radius: 2px;
      background-color: #2563eb;
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
  bottomNavHtml,
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
    const nav = bottomNavHtml ?? "";
    const pageClass = nav ? "page has-bottom-nav" : "page";
    innerBody = `<div class="topbar"><div class="topbar-inner"><img src="/favicon-32.png" width="28" height="28" alt="Benchrs"><span>Benchrs</span></div></div>
<div class="${pageClass}">
${body}
</div>
${nav}`;
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

// Emoji d'onglet pour la bottom-nav (miroir des icônes de nav.ts).
const NAV_ICONS: Record<string, string> = {
  home: "🏠",
  calendar: "📅",
  roster: "👥",
  stats: "📊",
  attendance: "✓",
  medical: "＋",
};

/**
 * Barre de navigation persistante (fixed bottom) — miroir de la BottomNav
 * moderne. Items filtrés par rôle via `legacyNavForRole`. L'onglet dont la
 * `key` vaut `activeKey` est mis en évidence (texte blanc + barre bleue).
 * Retourne "" si `role` est null (utilisateur non connecté).
 */
export function bottomNav(role: LegacyRole, activeKey: string): string {
  const items = legacyNavForRole(role);
  if (items.length === 0) return "";

  const cells = items
    .map((item) => {
      const isActive = item.key === activeKey;
      const icon = NAV_ICONS[item.key] ?? item.icon ?? "•";
      const bar = isActive ? `<span class="bn-bar"></span>` : "";
      return `<a class="bn-item${isActive ? " active" : ""}" href="${escapeHtml(item.href)}">${bar}<span class="bn-icon">${escapeHtml(icon)}</span><span class="bn-label">${escapeHtml(item.label)}</span></a>`;
    })
    .join("");

  return `<nav class="bottom-nav">${cells}</nav>`;
}

export interface PageHeaderOptions {
  title: string;
  subtitle?: string;
  actionHref?: string;
  actionLabel?: string;
}

/**
 * En-tête de page standard : titre (24px/700) + sous-titre gris optionnel +
 * bouton d'action bleu optionnel. Reproduit le pattern des pages modernes.
 */
export function pageHeader({ title, subtitle, actionHref, actionLabel }: PageHeaderOptions): string {
  const subtitleBlock = subtitle
    ? `<p class="page-subtitle">${escapeHtml(subtitle)}</p>`
    : "";
  const actionBlock =
    actionHref && actionLabel
      ? `<a class="page-action" href="${escapeHtml(actionHref)}">${escapeHtml(actionLabel)}</a>`
      : "";

  return `<div class="page-header">
<h1 class="page-title">${escapeHtml(title)}</h1>
${subtitleBlock}
${actionBlock}
</div>`;
}

export interface EmptyStateOptions {
  icon: string;
  title: string;
  description?: string;
}

/**
 * État vide centré : pastille grise avec icône + titre + description.
 * Reproduit le composant EmptyState moderne.
 */
export function emptyState({ icon, title, description }: EmptyStateOptions): string {
  const descBlock = description
    ? `<p class="empty-desc">${escapeHtml(description)}</p>`
    : "";

  return `<div class="empty-state">
<span class="empty-icon">${escapeHtml(icon)}</span>
<p class="empty-title">${escapeHtml(title)}</p>
${descBlock}
</div>`;
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
