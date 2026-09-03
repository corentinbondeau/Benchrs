// Placeholder pour les tests E2E Playwright
// Installation : npx playwright install
// Exécution : npx playwright test

import { test, expect } from "@playwright/test";

test("page d'accueil charge", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("text=Benchrs")).toBeVisible();
});
