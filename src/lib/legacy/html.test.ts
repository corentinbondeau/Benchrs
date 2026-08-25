import { describe, expect, it } from "vitest";
import { escapeHtml, field, renderPage } from "./html";
// `badge` n'existe pas encore : import dynamique dans le describe dédié pour
// que seule cette suite soit rouge tant que le helper n'est pas livré,
// sans faire planter l'import de tout le fichier de tests.

/**
 * Tests du templating HTML brut ultra-compatible (`src/lib/legacy/html.ts`).
 *
 * Contexte / risque : ce module génère du HTML servi directement au navigateur
 * (Route Handlers, zéro React). Toute donnée utilisateur (title, valeurs de
 * formulaire repopulées après erreur, etc.) DOIT être échappée avant
 * insertion — sinon XSS trivial. C'est le cœur de la qualité "renforcée"
 * de cette US.
 *
 * Garde-fou anti-régression bloquant : la page produite ne doit JAMAIS
 * référencer le bundle Next.js (`_next/`), les styles globaux React
 * (`globals.css`) ni charger de script externe — c'est la raison d'être
 * de la page `/legacy` (compatibilité vieux iOS/Android sans JS moderne).
 *
 * Hors-scope explicite : moteur de template générique, i18n, minification.
 */

describe("escapeHtml", () => {
  it("échappe les 5 caractères HTML sensibles (cas nominal)", () => {
    expect(escapeHtml(`& < > " '`)).toBe("&amp; &lt; &gt; &quot; &#39;");
  });

  it("ne laisse passer aucune balise <script> active sur une charge d'injection", () => {
    const payload = `'"><script>alert(1)</script>`;
    const out = escapeHtml(payload);

    // Aucune balise <script> active dans la sortie : les chevrons doivent
    // être échappés, pas seulement "présents ailleurs".
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("</script>");
    expect(out).not.toMatch(/<[a-z]/i);
    // Le contenu échappé doit néanmoins conserver la trace textuelle du payload
    // (pour debug), sous forme neutralisée.
    expect(out).toContain("&lt;script&gt;");
  });

  it("ne throw jamais sur des entrées non-string : number", () => {
    expect(() => escapeHtml(42)).not.toThrow();
    expect(escapeHtml(42)).toBe("42");
  });

  it("ne throw jamais sur des entrées non-string : null/undefined → chaîne vide", () => {
    expect(() => escapeHtml(null)).not.toThrow();
    expect(() => escapeHtml(undefined)).not.toThrow();
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });

  it("ne throw jamais sur un objet quelconque (coercition sûre)", () => {
    const weird = { toString: () => "<b>x</b>" };
    expect(() => escapeHtml(weird)).not.toThrow();
    expect(escapeHtml(weird)).toBe("&lt;b&gt;x&lt;/b&gt;");
  });
});

describe("renderPage", () => {
  it("produit un document HTML5 valide avec head/meta viewport/body", () => {
    const html = renderPage({ title: "Connexion", body: "<p>contenu</p>" });

    expect(html).toMatch(/^<!DOCTYPE html>/i);
    expect(html).toMatch(/<html[^>]*lang="[a-z-]+"/i);
    expect(html).toContain("<head>");
    expect(html).toMatch(/<meta[^>]*name="viewport"/i);
    expect(html).toContain("<body>");
    expect(html).toContain("<p>contenu</p>");
  });

  it("échappe le title (anti-XSS) et n'injecte aucune balise depuis un title malveillant", () => {
    const html = renderPage({
      title: `</title><script>alert('xss')</script>`,
      body: "<p>ok</p>",
    });

    expect(html).not.toContain("<script>alert('xss')</script>");
    expect(html).toContain("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
  });

  it("contient un bloc <style> inline (CSS vanilla embarqué)", () => {
    const html = renderPage({ title: "Titre", body: "<p>x</p>" });
    expect(html).toMatch(/<style>[\s\S]*<\/style>/);
  });

  it("garde-fou bloquant : aucune référence à _next/ dans la sortie", () => {
    const html = renderPage({ title: "Titre", body: "<p>x</p>" });
    expect(html).not.toContain("_next/");
  });

  it("garde-fou bloquant : aucune référence à globals.css dans la sortie", () => {
    const html = renderPage({ title: "Titre", body: "<p>x</p>" });
    expect(html).not.toContain("globals.css");
  });

  it("garde-fou bloquant : aucun <script src=...> externe dans la sortie", () => {
    const html = renderPage({ title: "Titre", body: "<p>x</p>" });
    expect(html).not.toMatch(/<script[^>]+src=/i);
  });
});

describe("renderPage — charte graphique Benchrs (RED tant que html.ts n'applique pas le thème)", () => {
  /**
   * Contexte : l'utilisateur demande que la page legacy respecte la charte
   * graphique de l'app (couleurs de marque, typo système, logo, rayons),
   * SANS régresser les contraintes de compatibilité vieux iOS (zéro Next,
   * zéro font externe, zéro script externe — voir garde-fous existants
   * plus haut, qui doivent rester verts).
   *
   * Les valeurs hex sont vérifiées en minuscule pour rester robuste face à
   * la casse ; on ne vérifie pas l'ordre des règles CSS, uniquement la
   * présence des tokens de charte dans le <style> (ou l'attribut style).
   */

  function html() {
    return renderPage({ title: "Connexion", body: "<p>contenu</p>" });
  }

  it("applique la couleur primary de la charte (#2563EB) dans le CSS embarqué", () => {
    expect(html().toLowerCase()).toContain("#2563eb");
  });

  it("applique le fond de page clair de la charte (#F6F8FB)", () => {
    expect(html().toLowerCase()).toContain("#f6f8fb");
  });

  it("applique la couleur de texte/foreground de la charte (#111827)", () => {
    expect(html().toLowerCase()).toContain("#111827");
  });

  it("utilise au moins une couleur d'accent de marque (navy #0B1220 ou gold #F4C430)", () => {
    const out = html().toLowerCase();
    const hasNavy = out.includes("#0b1220");
    const hasGold = out.includes("#f4c430");
    expect(hasNavy || hasGold).toBe(true);
  });

  it("utilise la font-stack système (pas Geist/next-font, pas de Google Fonts externe)", () => {
    const out = html();

    expect(out).toContain("-apple-system");
    expect(out).toContain("BlinkMacSystemFont");
    expect(out).not.toMatch(/geist/i);
    expect(out).not.toMatch(/next\/font/i);
    expect(out.toLowerCase()).not.toContain("fonts.googleapis");
  });

  it("affiche le logo de marque via un <img> PNG (pas de .svg)", () => {
    const out = html();

    expect(out).toMatch(/<img[^>]+src="\/favicon(-32)?\.png"/i);
    expect(out).not.toMatch(/<img[^>]+src="[^"]*\.svg"/i);
  });

  it("applique un rayon de bordure cohérent avec la charte (8px, 10px ou 14px)", () => {
    const out = html();
    expect(out).toMatch(/border-radius:\s*(8|10|14)px/i);
  });

  it("réutilise la bordure claire de la charte (#E5E7EB) pour les cartes/inputs", () => {
    expect(html().toLowerCase()).toContain("#e5e7eb");
  });

  it("garde-fou (non-régression) : toujours aucun <link> de font externe malgré le thème", () => {
    const out = html();
    expect(out).not.toMatch(/<link[^>]+fonts\.googleapis/i);
    expect(out).not.toMatch(/<link[^>]+rel="stylesheet"[^>]*fonts/i);
  });
});

describe("field (helper de champ de formulaire)", () => {
  it("échappe la valeur repopulée après une erreur de formulaire (email)", () => {
    const malicious = `"><script>alert(1)</script>`;
    const html = field({
      name: "email",
      label: "Email",
      type: "email",
      value: malicious,
    });

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    // La valeur échappée doit être injectée dans un attribut value="...".
    expect(html).toMatch(/value="[^"]*&quot;&gt;&lt;script/);
  });

  it("ne repopule jamais un champ password (sécurité : mot de passe vide après erreur)", () => {
    const html = field({
      name: "password",
      label: "Mot de passe",
      type: "password",
      value: "secret123",
    });

    expect(html).not.toContain("secret123");
    expect(html).toMatch(/value=""/);
  });
});

/**
 * ============================================================================
 * CONTRAT CIBLE — variante "auth" de renderPage (RED tant que @design n'a pas
 * implémenté la refonte T2/T3 du TODO_legacy_ui_polish.md)
 * ============================================================================
 *
 * Ces tests figent le contrat OBSERVABLE minimal que `renderPage` doit
 * satisfaire pour les pages auth (login/register), sans imposer les détails
 * internes de génération (structure exacte des divs, ordre des règles CSS...).
 * Signature suggérée (libre pour @design tant que le contrat ci-dessous est
 * respecté) :
 *
 *   renderPage({
 *     title: string;
 *     body: string;
 *     layout?: "auth" | "app";      // défaut "app" (comportement actuel inchangé)
 *     subtitle?: string;            // sous-titre optionnel, affiché seulement si fourni
 *     footer?: {                    // pied de carte optionnel, affiché seulement si fourni
 *       text: string;
 *       linkHref: string;
 *       linkLabel: string;
 *     };
 *   })
 *
 * Contrat markup (sous-chaînes/attributs vérifiés, noms de classes proposés
 * pour éviter toute collision avec le CSS `app` existant : `.auth-page`,
 * `.auth-card`, `.auth-logo`, `.auth-subtitle`, `.auth-card-footer`) :
 *   - layout "auth" => une règle CSS (ou style inline) applique
 *     `background-color:#0b1220` sur `.auth-page` (fond plein, PAS seulement
 *     le bandeau `.brand-header` déjà existant en layout "app").
 *   - un logo `<img src="/favicon.png" width="48" height="48" class="auth-logo">`
 *     est présent, centré dans la carte (pas de `.svg`).
 *   - `title` reste rendu (échappé) comme titre de la carte.
 *   - `subtitle` fourni => `<p class="auth-subtitle">{subtitle échappé}</p>` ;
 *     absent => aucune trace de la classe dans le HTML.
 *   - `footer` fourni => bloc `.auth-card-footer` contenant le texte échappé
 *     et un lien `<a href="{linkHref}">{linkLabel}</a>` (échappés) ; absent
 *     => aucune trace de `.auth-card-footer`.
 *   - layout par défaut ("app", ou omis) => AUCUNE trace de `.auth-page`,
 *     `.auth-card` ou `.auth-logo` (non-régression du layout `app` existant).
 */
describe("renderPage — variante layout auth (RED : contrat à implémenter par @design)", () => {
  it("layout auth : applique un fond navy plein (#0b1220) via la classe .auth-page", () => {
    const html = renderPage({ title: "Connexion", body: "<p>x</p>", layout: "auth" });

    // On vérifie la présence d'une règle CSS ciblant .auth-page avec le navy,
    // pas juste la présence de la couleur ailleurs (déjà couverte par un
    // garde-fou plus haut sur le bandeau .brand-header).
    expect(html.toLowerCase()).toMatch(/\.auth-page\s*{[^}]*background-color:\s*#0b1220/);
  });

  it("layout auth : affiche le logo /favicon.png en 48x48 avec la classe .auth-logo", () => {
    const html = renderPage({ title: "Connexion", body: "<p>x</p>", layout: "auth" });

    expect(html).toMatch(
      /<img[^>]+src="\/favicon\.png"[^>]+width="48"[^>]+height="48"[^>]+class="auth-logo"/i
    );
    expect(html).not.toMatch(/<img[^>]+src="[^"]*\.svg"/i);
  });

  it("layout auth : rend le sous-titre optionnel échappé quand il est fourni", () => {
    const html = renderPage({
      title: "Connexion",
      body: "<p>x</p>",
      layout: "auth",
      subtitle: `Connectez-vous <script>`,
    });

    expect(html).toContain('<p class="auth-subtitle">');
    expect(html).toContain("Connectez-vous &lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("layout auth : n'affiche aucun sous-titre si non fourni", () => {
    const html = renderPage({ title: "Connexion", body: "<p>x</p>", layout: "auth" });
    expect(html).not.toContain('class="auth-subtitle"');
  });

  it("layout auth : rend le pied de carte avec lien croisé échappé quand fourni", () => {
    const html = renderPage({
      title: "Connexion",
      body: "<p>x</p>",
      layout: "auth",
      footer: {
        text: "Pas encore de compte ?",
        linkHref: "/legacy/register",
        linkLabel: `Créer un compte <script>`,
      },
    });

    expect(html).toContain('class="auth-card-footer"');
    expect(html).toContain("Pas encore de compte ?");
    expect(html).toContain('<a href="/legacy/register">');
    expect(html).toContain("Créer un compte &lt;script&gt;");
    expect(html).not.toContain("<script>alert");
  });

  it("layout auth : n'affiche aucun pied de carte si non fourni", () => {
    const html = renderPage({ title: "Connexion", body: "<p>x</p>", layout: "auth" });
    expect(html).not.toContain('class="auth-card-footer"');
  });

  it("layout par défaut (app, ou omis) : ne contient aucune trace du markup auth (non-régression)", () => {
    const withoutLayout = renderPage({ title: "Accueil", body: "<p>x</p>" });
    const explicitApp = renderPage({ title: "Accueil", body: "<p>x</p>", layout: "app" });

    for (const html of [withoutLayout, explicitApp]) {
      expect(html).not.toContain('class="auth-page"');
      expect(html).not.toContain('class="auth-card"');
      expect(html).not.toContain('class="auth-logo"');
    }
  });

  it("garde-fou (non-régression) : layout auth ne charge toujours aucun _next/, .svg ni <script", () => {
    const html = renderPage({
      title: "Connexion",
      body: "<p>x</p>",
      layout: "auth",
      subtitle: "Sous-titre",
      footer: { text: "t", linkHref: "/legacy/login", linkLabel: "Se connecter" },
    });

    expect(html).not.toContain("_next/");
    expect(html).not.toMatch(/<img[^>]+src="[^"]*\.svg"/i);
    expect(html).not.toMatch(/<script[^>]*>/i);
  });
});

/**
 * ============================================================================
 * CONTRAT CIBLE — helper `badge(status)` pour les statuts de présence (RED)
 * ============================================================================
 * Signature suggérée : `export function badge(status: "present" | "absent" |
 * "late" | "pending"): string`, retournant un élément "pilule" (span/div)
 * avec une classe distincte par statut et les couleurs de la charte :
 *   - present : fond #DCFCE7, texte #15803D
 *   - absent  : fond #FEE2E2, texte #B91C1C
 *   - late    : fond #FEF3C7, texte #B45309
 *   - pending : fond #F3F4F6, texte #374151
 * Le libellé affiché doit être un texte lisible distinct par statut (ex:
 * "Présent", "Absent", "En retard", "En attente" — la casse/accents exacts
 * sont laissés à l'implémentation, seule la distinction est vérifiée ici).
 *
 * Pourquoi tester au niveau unitaire plutôt qu'E2E : la fonction est pure et
 * déterministe (pas de dépendance réseau/session) — un test unitaire est plus
 * rapide et plus précis qu'un aller-retour E2E pour vérifier une simple
 * association statut -> couleur. Le rendu intégré (badge inséré dans la liste
 * de convocations de `/legacy/attendance`) reste, lui, du ressort de l'E2E.
 */
describe("badge (helper de statut de présence) — RED tant que non implémenté", () => {
  it("présent, absent, late et pending produisent des couleurs de fond distinctes", async () => {
    const mod = (await import("./html")) as unknown as {
      badge: (status: "present" | "absent" | "late" | "pending") => string;
    };

    const present = mod.badge("present");
    const absent = mod.badge("absent");
    const late = mod.badge("late");
    const pending = mod.badge("pending");

    expect(present.toLowerCase()).toContain("#dcfce7");
    expect(absent.toLowerCase()).toContain("#fee2e2");
    expect(late.toLowerCase()).toContain("#fef3c7");
    expect(pending.toLowerCase()).toContain("#f3f4f6");

    // Anti-régression : les 4 rendus doivent être distincts les uns des
    // autres (pas de couleur partagée par erreur de copier-coller).
    const all = [present, absent, late, pending];
    expect(new Set(all).size).toBe(4);
  });

  it("présent, absent et late produisent des libellés textuels distincts", async () => {
    const mod = (await import("./html")) as unknown as {
      badge: (status: "present" | "absent" | "late" | "pending") => string;
    };

    const present = mod.badge("present");
    const absent = mod.badge("absent");
    const late = mod.badge("late");

    const labels = new Set([present, absent, late]);
    expect(labels.size).toBe(3);
  });
});
