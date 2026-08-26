/**
 * Fichier de setup Vitest — chargé avant chaque suite de tests
 *
 * 1. Étend les matchers Vitest avec @testing-library/jest-dom
 * 2. Mock next/image → <img> simple (pas de traitement d'image en test)
 * 3. Mock next/navigation → stubs contrôlables pour useRouter, usePathname, useSearchParams
 */

// ─── 1. Matchers jest-dom ────────────────────────────────────────────────────
import "@testing-library/jest-dom/vitest";

// ─── 4. Cache queryCache — Reset entre les tests ─────────────────────────────
// Nécessaire pour éviter que le cache de useDashboardData persiste entre les tests
// (ce qui causerait des faux loading:false dans les tests qui s'attendent à loading:true)
import { beforeEach as _beforeEach } from "vitest";
import { clearQueryCache } from "@/lib/queryCache";

_beforeEach(() => {
  clearQueryCache();
});

// ─── 2. Mock next/image ──────────────────────────────────────────────────────
import { vi } from "vitest";
import React from "react";

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean }) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    const { fill: _fill, priority: _priority, ...rest } = props;
    return React.createElement("img", rest);
  },
}));

// ─── 3. Mock next/navigation ─────────────────────────────────────────────────
const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockBack = vi.fn();
const mockForward = vi.fn();
const mockRefresh = vi.fn();
const mockPrefetch = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    forward: mockForward,
    refresh: mockRefresh,
    prefetch: mockPrefetch,
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));
