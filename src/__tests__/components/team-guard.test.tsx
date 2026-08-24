/**
 * Tests — TeamGuard optimisé (skeleton contenu principal)
 *
 * Périmètre :
 *   - Nominal : quand loading=false + team existe, les children sont rendus
 *   - Loading : quand loading=true, un skeleton est affiché (pas "Chargement...")
 *   - No team : quand loading=false et aucune team, le composant retourne null (→ redirect)
 *
 * Phase "Red" attendue :
 *   - "loading montre un skeleton" DOIT ÉCHOUER (l'implémentation actuelle affiche "Chargement...")
 *   - "loading n'affiche pas 'Chargement...'" DOIT ÉCHOUER (même raison)
 *   - Cas nominaux DOIVENT PASSER (comportement existant préservé)
 *
 * Hors-scope :
 *   - Intégration avec le layout complet (sidebar, topbar)
 *   - Animation du skeleton
 *   - Rendu visuel pixel-perfect
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// ─── Types partiels pour le mock ─────────────────────────────────────────────

interface MockTeam {
  id: string;
  name: string;
}

interface MockTeamContext {
  teams: MockTeam[];
  clubMemberships: { club_id: string; role: string }[];
  loading: boolean;
  currentTeam: MockTeam | null;
}

// ─── Valeur mutable du mock useTeam ──────────────────────────────────────────
// Déclarée en dehors pour être mutée librement dans chaque test via beforeEach.

let mockTeamContext: MockTeamContext = {
  teams: [],
  clubMemberships: [],
  loading: false,
  currentTeam: null,
};

// ─── Mock @/lib/team ──────────────────────────────────────────────────────────
// useTeam() retourne la valeur courante de mockTeamContext.
// Pas de TeamProvider nécessaire — on contrôle le contexte directement.

vi.mock("@/lib/team", () => ({
  useTeam: () => mockTeamContext,
}));

// ─── Import SUT (après les mocks) ─────────────────────────────────────────────
import { TeamGuard } from "@/components/team-guard";

// ─── Données de test ──────────────────────────────────────────────────────────

const MOCK_TEAM: MockTeam = { id: "team-1", name: "FC Test" };
const CHILD_TESTID = "protected-content";
const CHILD_TEXT = "Contenu protégé";

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Réinitialiser le contexte par défaut (état sain : chargé, team présente)
  mockTeamContext = {
    teams: [MOCK_TEAM],
    clubMemberships: [],
    loading: false,
    currentTeam: MOCK_TEAM,
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. CAS NOMINAL — loading=false, team présente
// ─────────────────────────────────────────────────────────────────────────────

describe("TeamGuard — cas nominal (team chargée)", () => {
  it("rend les children quand loading=false et une team existe", () => {
    mockTeamContext = {
      teams: [MOCK_TEAM],
      clubMemberships: [],
      loading: false,
      currentTeam: MOCK_TEAM,
    };

    render(
      <TeamGuard>
        <p data-testid={CHILD_TESTID}>{CHILD_TEXT}</p>
      </TeamGuard>
    );

    expect(screen.getByTestId(CHILD_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(CHILD_TESTID)).toHaveTextContent(CHILD_TEXT);
  });

  it("rend les children quand l'utilisateur a des clubMemberships (sans team directe)", () => {
    mockTeamContext = {
      teams: [],
      clubMemberships: [{ club_id: "club-1", role: "president" }],
      loading: false,
      currentTeam: null,
    };

    render(
      <TeamGuard>
        <p data-testid={CHILD_TESTID}>{CHILD_TEXT}</p>
      </TeamGuard>
    );

    // L'utilisateur avec clubMemberships doit accéder au contenu
    expect(screen.getByTestId(CHILD_TESTID)).toBeInTheDocument();
  });

  it("n'affiche pas de skeleton quand le chargement est terminé", () => {
    mockTeamContext = {
      teams: [MOCK_TEAM],
      clubMemberships: [],
      loading: false,
      currentTeam: MOCK_TEAM,
    };

    render(
      <TeamGuard>
        <p data-testid={CHILD_TESTID}>{CHILD_TEXT}</p>
      </TeamGuard>
    );

    // Aucun skeleton visible une fois chargé
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(document.querySelector("[data-testid='team-guard-skeleton']")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. ÉTAT LOADING — [RED] : ces tests DOIVENT ÉCHOUER
//    L'implémentation actuelle affiche "Chargement..." dans un div plein écran.
//    L'implémentation cible doit afficher un skeleton (pas de texte "Chargement...").
// ─────────────────────────────────────────────────────────────────────────────

describe("TeamGuard — état loading [RED : skeleton attendu]", () => {
  beforeEach(() => {
    mockTeamContext = {
      teams: [],
      clubMemberships: [],
      loading: true,
      currentTeam: null,
    };
  });

  it("[RED] affiche un élément skeleton pendant le chargement", () => {
    render(
      <TeamGuard>
        <p data-testid={CHILD_TESTID}>{CHILD_TEXT}</p>
      </TeamGuard>
    );

    // COMPORTEMENT ATTENDU APRÈS OPTIMISATION :
    // Un skeleton doit être présent (data-testid, role="status", ou classe CSS "skeleton")
    // Ce test ÉCHOUERA en phase Red : l'implémentation actuelle n'a pas de skeleton
    const skeleton =
      screen.queryByRole("status") ||
      document.querySelector("[data-testid='team-guard-skeleton']") ||
      document.querySelector(".skeleton") ||
      document.querySelector("[data-skeleton]") ||
      document.querySelector("[aria-label='Chargement du contenu']");

    expect(skeleton).not.toBeNull();
  });

  it("[RED] n'affiche pas le texte 'Chargement...' pendant le chargement", () => {
    render(
      <TeamGuard>
        <p data-testid={CHILD_TESTID}>{CHILD_TEXT}</p>
      </TeamGuard>
    );

    // COMPORTEMENT ATTENDU APRÈS OPTIMISATION :
    // "Chargement..." est l'ancien comportement (écran blanc) — le skeleton remplace ce texte.
    // Ce test ÉCHOUERA en phase Red : l'implémentation actuelle affiche bien ce texte.
    expect(screen.queryByText("Chargement...")).not.toBeInTheDocument();
  });

  it("[RED] n'affiche pas les children pendant le chargement (contenu protégé)", () => {
    render(
      <TeamGuard>
        <p data-testid={CHILD_TESTID}>{CHILD_TEXT}</p>
      </TeamGuard>
    );

    // Les children ne doivent PAS être rendus pendant le chargement —
    // c'est le comportement attendu et déjà correct dans l'implémentation actuelle.
    // Ce test documente et protège ce contrat en phase Green.
    // Note : passera en Red car l'implémentation actuelle cache bien les children pendant loading.
    expect(screen.queryByTestId(CHILD_TESTID)).not.toBeInTheDocument();
  });

  it("[RED] le skeleton ne couvre pas tout l'écran (pas de h-screen isolé)", () => {
    render(
      <TeamGuard>
        <p data-testid={CHILD_TESTID}>{CHILD_TEXT}</p>
      </TeamGuard>
    );

    // COMPORTEMENT ATTENDU APRÈS OPTIMISATION :
    // Le skeleton doit être dans le flux normal du contenu (pas h-screen, pas flex isolé).
    // L'implémentation actuelle a : <div className="flex items-center justify-center h-screen">
    // Ce test ÉCHOUERA en phase Red car h-screen est présent dans l'implémentation actuelle.
    const fullScreenOverlay = document.querySelector(".h-screen");
    expect(fullScreenOverlay).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. PAS DE TEAM — loading terminé, aucune équipe
// ─────────────────────────────────────────────────────────────────────────────

describe("TeamGuard — pas de team (comportement existant préservé)", () => {
  it("retourne null quand loading=false et aucune team ni clubMembership", () => {
    mockTeamContext = {
      teams: [],
      clubMemberships: [],
      loading: false,
      currentTeam: null,
    };

    const { container } = render(
      <TeamGuard>
        <p data-testid={CHILD_TESTID}>{CHILD_TEXT}</p>
      </TeamGuard>
    );

    // Le composant retourne null — le container doit être vide
    expect(container).toBeEmptyDOMElement();
    // Les children ne sont pas rendus
    expect(screen.queryByTestId(CHILD_TESTID)).not.toBeInTheDocument();
  });

  it("ne rend pas les children quand teams et clubMemberships sont vides", () => {
    mockTeamContext = {
      teams: [],
      clubMemberships: [],
      loading: false,
      currentTeam: null,
    };

    render(
      <TeamGuard>
        <p data-testid={CHILD_TESTID}>{CHILD_TEXT}</p>
      </TeamGuard>
    );

    // Protège la règle : sans team → pas d'accès au contenu
    expect(screen.queryByTestId(CHILD_TESTID)).not.toBeInTheDocument();
    expect(screen.queryByText(CHILD_TEXT)).not.toBeInTheDocument();
  });
});
