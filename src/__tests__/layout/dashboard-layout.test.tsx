/**
 * Test de non-régression — DashboardLayout
 *
 * Objectif : protéger la structure HTML du layout dashboard contre des
 * régressions lors de modifications techniques (ex: suppression de
 * `export const dynamic = "force-dynamic"`).
 *
 * Ce qui est testé :
 *   - Cas nominal : le layout rend ses children sans crash
 *   - Structure : présence des zones clés (sidebar, topbar, main, bottomnav)
 *
 * Ce qui n'est PAS testé :
 *   - Le rendu interne de Sidebar, TopBar, BottomNav (testés séparément)
 *   - Le comportement des providers (AuthProvider, TeamProvider, TeamGuard)
 *   - Le rendu visuel pixel-perfect
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { useIsMobile } from "@/hooks/useIsMobile";

// ─── Mocks des providers / composants lourds ────────────────────────────────

// Mock de useIsMobile : valeur contrôlée par test via mockReturnValue.
// Défaut à false (desktop) pour les tests qui ne spécifient pas de contexte mobile.
vi.mock("@/hooks/useIsMobile", () => ({
  useIsMobile: vi.fn(() => false),
}));

vi.mock("@/lib/auth", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "auth-provider" }, children),
}));

vi.mock("@/lib/team", () => ({
  TeamProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "team-provider" }, children),
}));

vi.mock("@/components/team-guard", () => ({
  TeamGuard: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "team-guard" }, children),
}));

vi.mock("@/components/layout/Sidebar", () => ({
  default: () => React.createElement("nav", { "data-testid": "sidebar" }),
}));

vi.mock("@/components/layout/TopBar", () => ({
  default: () => React.createElement("header", { "data-testid": "topbar" }),
}));

vi.mock("@/components/layout/BottomNav", () => ({
  default: () => React.createElement("nav", { "data-testid": "bottomnav" }),
}));

vi.mock("@/components/PushNotificationInit", () => ({
  PushNotificationInit: () => null,
}));

vi.mock("@/components/onboarding/UniversalOnboarding", () => ({
  UniversalOnboarding: () => null,
}));

vi.mock("@/components/CityRequiredGuard", () => ({
  CityRequiredGuard: () => null,
}));

// ─── Import SUT (après les mocks) ───────────────────────────────────────────
import DashboardLayout from "@/app/(dashboard)/layout";

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("DashboardLayout — non-régression structure", () => {
  beforeEach(() => {
    // Reset des mocks entre les tests, puis remet le défaut desktop
    vi.clearAllMocks();
    vi.mocked(useIsMobile).mockReturnValue(false);
  });

  it("rend ses children sans crash (cas nominal)", () => {
    render(
      <DashboardLayout>
        <p data-testid="child-content">Contenu de la page</p>
      </DashboardLayout>
    );

    expect(screen.getByTestId("child-content")).toBeInTheDocument();
    expect(screen.getByTestId("child-content")).toHaveTextContent(
      "Contenu de la page"
    );
  });

  it("encapsule les children dans les providers attendus", () => {
    render(
      <DashboardLayout>
        <span data-testid="child">enfant</span>
      </DashboardLayout>
    );

    // Vérifie la chaîne de providers (AuthProvider > TeamProvider > TeamGuard)
    expect(screen.getByTestId("auth-provider")).toBeInTheDocument();
    expect(screen.getByTestId("team-provider")).toBeInTheDocument();
    expect(screen.getByTestId("team-guard")).toBeInTheDocument();
  });

  it("rend la Sidebar sur desktop (useIsMobile=false)", () => {
    // useIsMobile=false par défaut (desktop) — Sidebar montée, BottomNav absente
    vi.mocked(useIsMobile).mockReturnValue(false);

    render(
      <DashboardLayout>
        <span>page</span>
      </DashboardLayout>
    );

    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.queryByTestId("bottomnav")).not.toBeInTheDocument();
  });

  it("rend la TopBar", () => {
    render(
      <DashboardLayout>
        <span>page</span>
      </DashboardLayout>
    );

    expect(screen.getByTestId("topbar")).toBeInTheDocument();
  });

  it("rend la BottomNav sur mobile (useIsMobile=true)", () => {
    // Override : mobile — BottomNav montée, Sidebar absente
    vi.mocked(useIsMobile).mockReturnValue(true);

    render(
      <DashboardLayout>
        <span>page</span>
      </DashboardLayout>
    );

    expect(screen.getByTestId("bottomnav")).toBeInTheDocument();
    expect(screen.queryByTestId("sidebar")).not.toBeInTheDocument();
  });

  it("rend un élément <main> contenant les children", () => {
    render(
      <DashboardLayout>
        <article data-testid="page-article">article</article>
      </DashboardLayout>
    );

    const main = document.querySelector("main");
    expect(main).toBeInTheDocument();
    // Les children doivent se trouver dans le main (via le div page-container)
    expect(main).toContainElement(screen.getByTestId("page-article"));
  });

  it("la structure flex du shell est préservée (conteneur h-screen + overflow-hidden)", () => {
    render(
      <DashboardLayout>
        <span>content</span>
      </DashboardLayout>
    );

    // Le conteneur principal du shell doit avoir les classes CSS critiques
    const shellContainer = document.querySelector(
      ".flex.h-screen.overflow-hidden"
    );
    expect(shellContainer).toBeInTheDocument();
  });
});
