import { test, expect } from "@playwright/test";

test("la page de connexion se rend", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveTitle(/Benchrs/);
  await expect(page.locator("text=Connexion")).toBeVisible();
});

test("la page hors-ligne affiche le message", async ({ page }) => {
  await page.goto("/offline");
  await expect(page.locator("text=Hors ligne")).toBeVisible();
});

test("le score live public gère un lien invalide", async ({ page }) => {
  await page.goto("/live/00000000-0000-0000-0000-000000000000?token=bad-token");
  await expect(page.locator("text=Lien invalide ou expiré")).toBeVisible({ timeout: 10000 });
});
