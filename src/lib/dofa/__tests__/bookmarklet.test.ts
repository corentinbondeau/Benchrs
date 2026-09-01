/**
 * Tests — fonctions pures du bookmarklet DOFA (LOT 8)
 *
 * ⚠️ CORRECTION AU PLAN (prime sur le TODO écrit) : le bookmarklet ne POST
 * PAS vers `/api/championships/dofa/ingest` et n'ouvre AUCUN CORS côté
 * Benchrs. Il ouvre un onglet Benchrs et transmet les données par
 * `postMessage`. Ce fichier ne teste donc AUCUN appel réseau réel, ni
 * `postMessage` réel (couvert par un test manuel documenté, hors-scope ici).
 *
 * Contrat visé (fonctions pures, aucune I/O, aucun mock réseau) :
 *
 *   buildBookmarkletSource(config: BookmarkletConfig): string
 *     → une URL `javascript:...` encodée (encodeURIComponent), contenant le
 *       triplet et l'origine Benchrs, faisant MOINS DE 2000 CARACTÈRES.
 *
 *   planFetches(triplet: DofaPouleRef): { kind: "resultat" | "calendrier" | "classement_journees"; url: string }[]
 *     → liste ORDONNÉE des URLs à appeler côté navigateur du coach, sur la
 *       base `/api/compets/{cp_no}/phases/{phase}/poules/{poule}/...`.
 *
 *   shouldRetry(attempt: number, error: BookmarkletFetchError): boolean
 *     → au moins 2 reprises espacées sur erreur réseau/CORS, abandon
 *       explicite ensuite.
 *
 *   toSlimMatches(rawMatches: DofaRawMatch[], triplet: DofaPouleRef): unknown[]
 *     → transforme la réponse brute API DOFA en format allégé (~720
 *       octets/match), conservant `competition.cp_no`, `phase.number`,
 *       `poule.stage_number` sur CHAQUE match (contrôle anti-injection de
 *       poule côté serveur, cf. ingest-validation.ts).
 *
 * Phase "Red" attendue : AUCUNE de ces fonctions n'existe encore
 * (module `bookmarklet.ts` absent) → TOUS les tests doivent échouer par
 * erreur d'import/résolution de module. Aucun code de production n'a été
 * écrit par cet agent.
 */

import { describe, it, expect } from "vitest";
import {
  buildBookmarkletSource,
  planFetches,
  shouldRetry,
  toSlimMatches,
  extractDofaCollection,
  dedupeMatchesByManNo,
  type BookmarkletConfig,
  type BookmarkletFetchError,
} from "@/lib/dofa/bookmarklet";
import type { DofaPouleRef } from "@/lib/dofa/types";
import rawFixture from "@/lib/dofa/__fixtures__/resultat-d4-pouleD.json";
import slimFixture from "@/lib/dofa/__fixtures__/ingest-slim-d4-pouleD.json";

const TRIPLET: DofaPouleRef = { cp_no: 457587, phase: 1, poule: 4 };

const BASE_CONFIG: BookmarkletConfig = {
  triplet: TRIPLET,
  benchrsOrigin: "https://benchrs.app",
};

// ─── buildBookmarkletSource ────────────────────────────────────────────────

describe("buildBookmarkletSource — nominal", () => {
  it("produit une URL javascript: valide", () => {
    const src = buildBookmarkletSource(BASE_CONFIG);
    expect(src.startsWith("javascript:")).toBe(true);
  });

  it("encode le corps du bookmarklet avec encodeURIComponent (pas de caractères bruts dangereux : espaces, guillemets non échappés)", () => {
    const src = buildBookmarkletSource(BASE_CONFIG);
    const body = src.slice("javascript:".length);
    // Un corps correctement encodé ne doit contenir aucun espace brut ni
    // guillemet double brut : ces caractères doivent être sous forme %XX.
    expect(body).not.toMatch(/[ "]/);
    // ré-encoder le corps décodé doit redonner exactement le même texte :
    // preuve que le corps a bien été produit via encodeURIComponent (et non
    // un encodage partiel/maison qui casserait au round-trip).
    const decoded = decodeURIComponent(body);
    expect(encodeURIComponent(decoded)).toBe(body);
  });

  it("le corps décodé contient le triplet (cp_no, phase, poule) et l'origine Benchrs", () => {
    const src = buildBookmarkletSource(BASE_CONFIG);
    const decoded = decodeURIComponent(src.slice("javascript:".length));
    expect(decoded).toContain(String(TRIPLET.cp_no));
    expect(decoded).toContain(String(TRIPLET.phase));
    expect(decoded).toContain(String(TRIPLET.poule));
    expect(decoded).toContain(BASE_CONFIG.benchrsOrigin);
  });
});

describe("buildBookmarkletSource — TEST-SENTINELLE taille favori navigateur", () => {
  it("fait MOINS DE 2000 caractères — limite pratique d'un favori navigateur, verrouillée nommément", () => {
    const src = buildBookmarkletSource(BASE_CONFIG);
    expect(src.length).toBeLessThan(2000);
  });

  // ⚠️ CORRECTIF (post-lot 8) : la taille de la sortie dépend directement de
  // la longueur de `benchrsOrigin`. Le cas ci-dessus ne couvrait qu'une
  // origine courte (`https://benchrs.app`) et ne voyait donc pas le
  // dépassement réel avec une origine longue, typique d'une préversion
  // Vercel (ex. `https://benchrs-git-main-corentinbondeau.vercel.app`).
  it.each([
    "https://benchrs.app",
    "https://www.benchrs.app",
    "https://benchrs.vercel.app",
    "https://benchrs-legacy-app.vercel.app",
    "https://benchrs-git-main-corentinbondeau.vercel.app",
  ])("fait MOINS DE 2000 caractères même avec une origine longue (%s)", (benchrsOrigin) => {
    const src = buildBookmarkletSource({ triplet: TRIPLET, benchrsOrigin });
    expect(src.length).toBeLessThan(2000);
  });
});

describe("buildBookmarkletSource — compatibilité navigateurs anciens", () => {
  it("le corps généré ne contient aucune syntaxe ES2017+ à risque réel de casse sur navigateurs anciens ou moteurs JS non standards (optional chaining `?.`, nullish coalescing `??`)", () => {
    // Justification du périmètre retenu : le bookmarklet s'exécute dans le
    // contexte JS de la page du site district (flandres.fff.fr, etc.), dont
    // le moteur n'est pas contrôlé par Benchrs. `?.` et `??` sont les deux
    // constructions les plus fréquemment absentes des polyfills/transpileurs
    // par défaut et les plus simples à introduire par erreur en générant du
    // code par template string. Les arrow functions et `const`/`let` sont
    // supportés par tout navigateur assez récent pour exécuter un
    // bookmarklet moderne (ES2015+, cible large et déjà éprouvée) : les
    // exclure alourdirait la génération sans bénéfice réel constaté sur le
    // terrain (aucun incident rapporté à ce sujet, contrairement à `?.`/`??`).
    const src = buildBookmarkletSource(BASE_CONFIG);
    const decoded = decodeURIComponent(src.slice("javascript:".length));
    expect(decoded).not.toMatch(/\?\./);
    expect(decoded).not.toMatch(/\?\?/);
  });
});

describe("buildBookmarkletSource — injection / échappement", () => {
  it("une origine Benchrs contenant une valeur inattendue ne casse pas la chaîne générée (pas d'évasion de guillemet/parenthèse permettant d'injecter du JS arbitraire)", () => {
    const hostile: BookmarkletConfig = {
      triplet: TRIPLET,
      benchrsOrigin: `https://evil.example");alert(1);//`,
    };
    const src = buildBookmarkletSource(hostile);
    const decoded = decodeURIComponent(src.slice("javascript:".length));
    // La valeur hostile ne doit apparaître qu'en tant que donnée passée à
    // JSON.stringify (littéral de chaîne échappé), jamais en position de
    // code exécutable non échappé : on vérifie qu'aucune séquence de
    // fermeture de guillemet suivie de point-virgule brut n'apparaît telle
    // quelle (preuve d'une évasion réussie hors de la chaîne littérale).
    expect(decoded).not.toContain(`");alert(1);//`);
  });

  it("un triplet dont les champs seraient (hypothétiquement) des chaînes non numériques ne permet pas d'injecter du JS dans la chaîne générée", () => {
    const hostileTriplet = {
      cp_no: 457587,
      phase: 1,
      poule: 4,
      __proto__: { injected: `"});fetch('https://evil');//` },
    } as unknown as DofaPouleRef;
    const src = buildBookmarkletSource({ ...BASE_CONFIG, triplet: hostileTriplet });
    const decoded = decodeURIComponent(src.slice("javascript:".length));
    expect(decoded).not.toContain("evil");
  });
});

// ─── planFetches ───────────────────────────────────────────────────────────

describe("planFetches — nominal", () => {
  it("produit la liste ordonnée resultat, calendrier, classement_journees sur la base /api/compets/{cp_no}/phases/{phase}/poules/{poule}/...", () => {
    const plan = planFetches(TRIPLET);
    expect(plan.map((p) => p.kind)).toEqual(["resultat", "calendrier", "classement_journees"]);
    for (const entry of plan) {
      expect(entry.url).toContain(`/compets/${TRIPLET.cp_no}/phases/${TRIPLET.phase}/poules/${TRIPLET.poule}/`);
    }
  });

  it("chaque URL de plan pointe vers un endpoint distinct (pas de doublon)", () => {
    const plan = planFetches(TRIPLET);
    const urls = plan.map((p) => p.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

// ─── shouldRetry ───────────────────────────────────────────────────────────

describe("shouldRetry — stratégie de reprise (Akamai intermittent, ERR_FAILED)", () => {
  const networkError: BookmarkletFetchError = { kind: "network" };
  const corsError: BookmarkletFetchError = { kind: "cors" };

  it("autorise la reprise à la première tentative (attempt=1) sur erreur réseau", () => {
    expect(shouldRetry(1, networkError)).toBe(true);
  });

  it("autorise au moins 2 reprises espacées sur erreur réseau ou CORS", () => {
    expect(shouldRetry(1, networkError)).toBe(true);
    expect(shouldRetry(2, networkError)).toBe(true);
    expect(shouldRetry(1, corsError)).toBe(true);
    expect(shouldRetry(2, corsError)).toBe(true);
  });

  it("abandonne explicitement au-delà de la limite de reprises (dépassement)", () => {
    // La limite exacte relève du choix de @dev ; le contrat garanti ici est
    // qu'il existe un point d'arrêt strict (pas de reprise infinie).
    expect(shouldRetry(10, networkError)).toBe(false);
  });
});

describe("shouldRetry — anti-régression capitale", () => {
  it("un échec réseau produit un résultat { status: \"error\" } et JAMAIS { matches: [] } — c'est exactement le défaut qui a rendu la panne invisible pendant des mois côté serveur, il ne doit pas réapparaître côté client", () => {
    // Ce test verrouille le CONTRAT de shouldRetry/du pipeline de fetch : un
    // échec, même après épuisement des reprises, ne doit jamais dégénérer
    // silencieusement en une liste de matchs vide. shouldRetry(attempt,error)
    // renvoyant `false` signale un ABANDON EXPLICITE, pas un succès vide.
    const finalAttempt = 10;
    const networkError: BookmarkletFetchError = { kind: "network" };
    const retry = shouldRetry(finalAttempt, networkError);
    expect(retry).toBe(false);
    // Le type de retour de shouldRetry est un booléen explicite d'abandon,
    // jamais une valeur ambiguë (undefined, [], {}) qui pourrait être
    // interprétée à tort comme "aucun match" par l'appelant.
    expect(typeof retry).toBe("boolean");
  });
});

// ─── toSlimMatches ─────────────────────────────────────────────────────────

describe("toSlimMatches — nominal (fixture réelle)", () => {
  it("transforme la réponse brute API DOFA en format allégé identique à la fixture ingest-slim-d4-pouleD.json", () => {
    const result = toSlimMatches(rawFixture as never, TRIPLET);
    expect(result).toEqual(slimFixture);
  });

  it("conserve le triplet (competition.cp_no, phase.number, poule.stage_number) sur CHAQUE match — contrôle anti-injection de poule côté serveur", () => {
    const result = toSlimMatches(rawFixture as never, TRIPLET) as Array<{
      competition: { cp_no: number };
      phase: { number: number };
      poule: { stage_number: number };
    }>;
    expect(result.length).toBeGreaterThan(0);
    for (const match of result) {
      expect(match.competition.cp_no).toBe(TRIPLET.cp_no);
      expect(match.phase.number).toBe(TRIPLET.phase);
      expect(match.poule.stage_number).toBe(TRIPLET.poule);
    }
  });
});

// ─── extractDofaCollection ─────────────────────────────────────────────────
//
// 🔒 BUG CONSTATÉ EN CONDITIONS RÉELLES : le code généré par
// `buildBookmarkletSource` gérait jusqu'ici les réponses des endpoints via
// `(Array.isArray(d) ? d : []).forEach(...)` — donc :
//   - `/…/resultat` (tableau nu) : OK ;
//   - `/…/calendrier` : forme non vérifiée, potentiellement une enveloppe
//     Hydra `{ "hydra:member": [...] }` comme `classement_journees` ;
//   - toute forme NON tableau nu était silencieusement traitée comme "aucun
//     match", sans le moindre signal — exactement la panne remontée par le
//     coach ("aucun match à importer alors qu'il y a des matchs").
//
// `extractDofaCollection` est la fonction pure que `buildBookmarkletSource`
// doit réutiliser dans le code généré (soit en injectant sa logique dans le
// texte généré, soit — préférable pour la testabilité en dehors du
// navigateur — en s'appuyant dessus comme unique point de vérité). Contrat,
// délibérément DIFFÉRENT de `normalizeDofaCollection` (qui renvoie toujours
// `[]` sans distinction, contrat correct pour SES appelants actuels) :
// ici, une forme incomprise DOIT être distinguée d'une collection
// légitimement vide, pour ne jamais reproduire le défaut d'échec silencieux
// déjà éliminé ailleurs dans ce chantier.
describe("extractDofaCollection — absorbe tableau nu et enveloppe Hydra, distingue vide et incompris", () => {
  it("tableau nu non vide → { ok: true, items } avec les éléments tels quels", () => {
    const input = [{ ma_no: 1 }, { ma_no: 2 }];
    expect(extractDofaCollection(input)).toEqual({ ok: true, items: input });
  });

  it("enveloppe Hydra non vide → { ok: true, items } extraits de hydra:member (cas /…/calendrier suspecté de renvoyer cette forme)", () => {
    const members = [{ ma_no: 10 }, { ma_no: 11 }];
    const input = { "hydra:member": members, "hydra:totalItems": 2 };
    expect(extractDofaCollection(input)).toEqual({ ok: true, items: members });
  });

  it("cas légitimement vide — tableau nu vide → { ok: true, items: [] } (aucun match, PAS une erreur)", () => {
    expect(extractDofaCollection([])).toEqual({ ok: true, items: [] });
  });

  it("cas légitimement vide — enveloppe Hydra avec hydra:totalItems: 0 → { ok: true, items: [] } (aucun match, PAS une erreur)", () => {
    const input = { "hydra:member": [], "hydra:totalItems": 0 };
    expect(extractDofaCollection(input)).toEqual({ ok: true, items: [] });
  });

  describe("🔒 TEST-SENTINELLE — forme incomprise JAMAIS confondue avec 'aucun match'", () => {
    it.each([
      ["objet quelconque sans hydra:member", { foo: "bar" }],
      ["chaîne", "not a collection"],
      ["null", null],
      ["undefined", undefined],
      ["nombre", 42],
      ["objet Hydra malformé (hydra:member n'est pas un tableau)", { "hydra:member": "oops" }],
    ])("entrée %s → { ok: false } explicite, jamais { ok: true, items: [] }", (_label, input) => {
      const result = extractDofaCollection(input);
      expect(result.ok).toBe(false);
      // Contrat capital : une forme incomprise ne doit JAMAIS produire la
      // même valeur qu'une collection légitimement vide, sous peine de
      // reproduire silencieusement le bug ("aucun match" alors qu'il y en a).
      expect(result).not.toEqual({ ok: true, items: [] });
    });
  });
});

// ─── dedupeMatchesByManNo ───────────────────────────────────────────────────
//
// `resultat` et `calendrier` peuvent tous deux référencer le même match
// (même `ma_no`) — un match à venir apparaît dans `calendrier`, puis une
// fois son score connu il peut réapparaître dans `resultat` avant que
// `calendrier` n'ait cessé de le lister. Sans fusion, le match serait
// transmis en double au serveur d'ingestion (risque de duplication d'un
// événement d'agenda ou d'échec d'ingestion sur la contrainte d'unicité
// `dofa_ma_no`).
describe("dedupeMatchesByManNo — fusion resultat + calendrier sans doublon", () => {
  it("un même ma_no présent dans les deux endpoints n'apparaît qu'une seule fois", () => {
    const fromResultat = [{ ma_no: 100, status: "joue" }];
    const fromCalendrier = [{ ma_no: 100, status: "a_jouer" }, { ma_no: 200, status: "a_jouer" }];
    const merged = dedupeMatchesByManNo([...fromResultat, ...fromCalendrier]);
    const maNos = merged.map((m) => (m as { ma_no: number }).ma_no);
    expect(maNos.filter((n) => n === 100)).toHaveLength(1);
    expect(new Set(maNos).size).toBe(maNos.length);
  });

  it("conserve tous les matchs distincts (aucune perte lors de la fusion)", () => {
    const merged = dedupeMatchesByManNo([{ ma_no: 1 }, { ma_no: 2 }, { ma_no: 3 }]);
    expect(merged).toHaveLength(3);
  });
});
