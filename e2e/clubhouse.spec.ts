/**
 * Tests E2E — Calendrier de réservation du Club House
 *
 * Phase RED : tous les tests échouent intentionnellement car
 * - la page `/club/clubhouse` n'existe pas encore (Tâche 2.1–2.4)
 * - le lien "Club House" n'est pas dans la Sidebar (Tâche 3)
 *
 * Stack : Next.js 16 + Supabase Auth (cookies) + Playwright
 *
 * Authentification : login programmatique via l'API Supabase REST
 * avant chaque test, en utilisant les variables d'env :
 *   E2E_COACH_EMAIL / E2E_COACH_PASSWORD
 *   NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

import { test, expect, type Page } from "@playwright/test";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const COACH_EMAIL = process.env.E2E_COACH_EMAIL ?? "";
const COACH_PASSWORD = process.env.E2E_COACH_PASSWORD ?? "";

/**
 * Effectue un login Supabase via l'API REST et injecte les cookies de session
 * dans le contexte Playwright. Cela évite de passer par la page de login UI.
 */
async function loginAsCoach(page: Page): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Variables d'env manquantes : NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY sont requises pour les tests E2E authentifiés."
    );
  }
  if (!COACH_EMAIL || !COACH_PASSWORD) {
    throw new Error(
      "Variables d'env manquantes : E2E_COACH_EMAIL et E2E_COACH_PASSWORD sont requises pour les tests E2E authentifiés."
    );
  }

  // Appel direct à l'API Auth Supabase pour obtenir les tokens
  const authResponse = await page.request.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      data: {
        email: COACH_EMAIL,
        password: COACH_PASSWORD,
      },
    }
  );

  if (!authResponse.ok()) {
    const body = await authResponse.text();
    throw new Error(`Login Supabase échoué (${authResponse.status()}): ${body}`);
  }

  const { access_token, refresh_token } = await authResponse.json();

  // Injecter les tokens Supabase dans le stockage de la page
  // (Supabase SSR utilise des cookies côté serveur et localStorage côté client)
  await page.goto("/");
  await page.evaluate(
    ({ url, key, accessToken, refreshToken }) => {
      const storageKey = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          access_token: accessToken,
          refresh_token: refreshToken,
          token_type: "bearer",
        })
      );
    },
    {
      url: SUPABASE_URL,
      key: SUPABASE_ANON_KEY,
      accessToken: access_token,
      refreshToken: refresh_token,
    }
  );

  // Recharger pour que Next.js prenne en compte la session
  await page.reload();
  await page.waitForLoadState("networkidle");
}

// ─── Données de test réutilisables ────────────────────────────────────────────

/** Date du jour au format YYYY-MM-DD pour les tests de réservation */
const TODAY = new Date().toISOString().split("T")[0];

/** Créneau de test sans risque de conflit avec des données existantes */
const TEST_RESERVATION = {
  title: "Réunion E2E Test",
  startTime: "22:00",
  endTime: "23:00",
} as const;

/** Créneau qui chevauchera le TEST_RESERVATION (même plage horaire) */
const CONFLICTING_RESERVATION = {
  title: "Réunion E2E Conflit",
  startTime: "22:15",
  endTime: "22:45",
} as const;

// ─── Tests ────────────────────────────────────────────────────────────────────

/**
 * Tâche 2.1 — Affichage de la page calendrier
 * Vérifie que la page `/club/clubhouse` se rend correctement pour un coach connecté,
 * que le calendrier est visible, et que les réservations du jour (ou le message
 * "aucune réservation") sont affichées.
 *
 * RED : échoue car la route `/club/clubhouse` n'existe pas (404 ou redirect).
 */
test("2.1 — la page /club/clubhouse s'affiche pour un coach connecté", async ({ page }) => {
  await loginAsCoach(page);

  await page.goto("/club/clubhouse");

  // La page doit répondre (pas de 404 ni de redirect vers /login)
  await expect(page).not.toHaveURL(/login/);
  await expect(page).toHaveURL(/\/club\/clubhouse/);

  // Le titre de la page doit être visible
  await expect(
    page.getByRole("heading", { name: /club house/i })
  ).toBeVisible();

  // Le composant calendrier doit être rendu
  // (react-day-picker génère un tableau avec role="grid")
  await expect(page.getByRole("grid")).toBeVisible();

  // La liste des réservations du jour ou le message "aucune réservation" doit être visible
  const hasReservations = await page.getByRole("listitem").count() > 0;
  const hasEmptyMessage = await page
    .getByText(/aucune réservation/i)
    .isVisible()
    .catch(() => false);

  expect(hasReservations || hasEmptyMessage).toBe(true);
});

/**
 * Tâche 2.2 — Création d'une réservation
 * Vérifie que le dialog de création s'ouvre, que le formulaire peut être rempli
 * (titre, date, heure début/fin), que la soumission crée la réservation, qu'elle
 * apparaît dans la liste, et qu'un toast de confirmation est affiché.
 *
 * RED : échoue car le dialog de création n'existe pas encore.
 */
test("2.2 — créer une réservation depuis le dialog de création", async ({ page }) => {
  await loginAsCoach(page);

  await page.goto("/club/clubhouse");
  await expect(page).toHaveURL(/\/club\/clubhouse/);

  // Le bouton de création doit être visible pour un coach
  const createButton = page.getByRole("button", { name: /nouvelle réservation/i });
  await expect(createButton).toBeVisible();
  await createButton.click();

  // Le dialog de création doit s'ouvrir
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // Remplir le champ titre
  const titleInput = dialog.getByLabel(/titre/i);
  await expect(titleInput).toBeVisible();
  await titleInput.fill(TEST_RESERVATION.title);

  // Remplir l'heure de début
  const startTimeInput = dialog.getByLabel(/heure.*début|début/i);
  await expect(startTimeInput).toBeVisible();
  await startTimeInput.fill(TEST_RESERVATION.startTime);

  // Remplir l'heure de fin
  const endTimeInput = dialog.getByLabel(/heure.*fin|fin/i);
  await expect(endTimeInput).toBeVisible();
  await endTimeInput.fill(TEST_RESERVATION.endTime);

  // Soumettre le formulaire
  const submitButton = dialog.getByRole("button", { name: /créer|ajouter|enregistrer/i });
  await expect(submitButton).toBeEnabled();
  await submitButton.click();

  // Le dialog doit se fermer après la création
  await expect(dialog).not.toBeVisible();

  // Un toast de confirmation doit apparaître
  await expect(
    page.getByText(/réservation créée/i)
  ).toBeVisible();

  // La réservation doit apparaître dans la liste
  await expect(
    page.getByText(TEST_RESERVATION.title)
  ).toBeVisible();
});

/**
 * Tâche 2.3 — Suppression d'une réservation
 * Crée d'abord une réservation (via le dialog), puis la supprime en cliquant sur
 * le bouton de suppression et en confirmant, puis vérifie qu'elle disparaît de la liste.
 *
 * RED : échoue car le bouton de suppression n'existe pas encore.
 */
test("2.3 — supprimer une réservation existante", async ({ page }) => {
  await loginAsCoach(page);

  await page.goto("/club/clubhouse");
  await expect(page).toHaveURL(/\/club\/clubhouse/);

  // ── Étape 1 : créer une réservation à supprimer ──
  const createButton = page.getByRole("button", { name: /nouvelle réservation/i });
  await expect(createButton).toBeVisible();
  await createButton.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByLabel(/titre/i).fill("Réservation à supprimer E2E");
  await dialog.getByLabel(/heure.*début|début/i).fill("21:00");
  await dialog.getByLabel(/heure.*fin|fin/i).fill("21:30");

  await dialog.getByRole("button", { name: /créer|ajouter|enregistrer/i }).click();
  await expect(dialog).not.toBeVisible();

  // Attendre que la réservation apparaisse dans la liste
  const reservationItem = page.getByText("Réservation à supprimer E2E");
  await expect(reservationItem).toBeVisible();

  // ── Étape 2 : déclencher la suppression ──
  // Le bouton de suppression (Trash2) doit être accessible sur la réservation
  // On cherche le bouton de suppression proche du texte de la réservation
  const deleteButton = page
    .locator(`[title*="supprimer" i], [aria-label*="supprimer" i]`)
    .first();
  await expect(deleteButton).toBeVisible();
  await deleteButton.click();

  // ── Étape 3 : confirmer la suppression dans le dialog de confirmation ──
  const confirmDialog = page.getByRole("dialog");
  await expect(confirmDialog).toBeVisible();

  const confirmButton = confirmDialog.getByRole("button", {
    name: /confirmer|supprimer|oui/i,
  });
  await expect(confirmButton).toBeVisible();
  await confirmButton.click();

  // ── Étape 4 : vérifier que la réservation a disparu ──
  await expect(confirmDialog).not.toBeVisible();

  // Toast de confirmation
  await expect(page.getByText(/réservation supprimée/i)).toBeVisible();

  // La réservation ne doit plus être dans la liste
  await expect(page.getByText("Réservation à supprimer E2E")).not.toBeVisible();
});

/**
 * Tâche 2.4 — Gestion des conflits de créneaux
 * Crée une première réservation, tente de créer une deuxième sur le même créneau
 * (chevauchement), vérifie que le message d'erreur de conflit s'affiche, et que
 * la deuxième réservation n'est pas créée.
 *
 * RED : échoue car le message d'erreur de conflit n'est pas encore géré.
 */
test("2.4 — afficher une erreur lors d'un conflit de créneau", async ({ page }) => {
  await loginAsCoach(page);

  await page.goto("/club/clubhouse");
  await expect(page).toHaveURL(/\/club\/clubhouse/);

  // ── Étape 1 : créer la première réservation ──
  const createButton = page.getByRole("button", { name: /nouvelle réservation/i });
  await expect(createButton).toBeVisible();
  await createButton.click();

  let dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByLabel(/titre/i).fill(TEST_RESERVATION.title);
  await dialog.getByLabel(/heure.*début|début/i).fill(TEST_RESERVATION.startTime);
  await dialog.getByLabel(/heure.*fin|fin/i).fill(TEST_RESERVATION.endTime);

  await dialog.getByRole("button", { name: /créer|ajouter|enregistrer/i }).click();
  await expect(dialog).not.toBeVisible();

  // Vérifier que la première réservation est créée
  await expect(page.getByText(TEST_RESERVATION.title)).toBeVisible();

  // ── Étape 2 : tenter de créer une réservation chevauchante ──
  await createButton.click();

  dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByLabel(/titre/i).fill(CONFLICTING_RESERVATION.title);
  // Même créneau horaire → conflit attendu
  await dialog.getByLabel(/heure.*début|début/i).fill(CONFLICTING_RESERVATION.startTime);
  await dialog.getByLabel(/heure.*fin|fin/i).fill(CONFLICTING_RESERVATION.endTime);

  await dialog.getByRole("button", { name: /créer|ajouter|enregistrer/i }).click();

  // ── Étape 3 : vérifier le message d'erreur de conflit ──
  // Le dialog doit rester ouvert (l'utilisateur peut corriger son créneau)
  await expect(dialog).toBeVisible();

  // Le message d'erreur de conflit doit être affiché
  await expect(
    page.getByText(/creneau.*deja.*reserve|deja.*reserve|conflit/i)
  ).toBeVisible();

  // ── Étape 4 : vérifier que la deuxième réservation n'est pas créée ──
  // Fermer le dialog et vérifier que la réservation en conflit n'apparaît pas
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();

  await expect(page.getByText(CONFLICTING_RESERVATION.title)).not.toBeVisible();
});

/**
 * Tâche 3 — Lien "Club House" dans la Sidebar
 * Vérifie que le lien "Club House" apparaît dans la section "Club" de la Sidebar
 * pour un coach connecté, et que le clic navigue vers `/club/clubhouse`.
 *
 * RED : échoue car le lien n'est pas encore ajouté dans le tableau `clubItems`
 * de `src/components/layout/Sidebar.tsx`.
 */
test("3 — le lien Club House apparaît dans la sidebar pour un coach", async ({ page }) => {
  await loginAsCoach(page);

  // Aller sur une page du dashboard pour afficher la Sidebar
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // La Sidebar est visible en desktop (lg:flex)
  // Elle contient une section "Club" avec des liens clubItems
  const sidebar = page.locator("aside");
  await expect(sidebar).toBeVisible();

  // Le lien "Club House" doit être visible dans la section Club
  const clubhouseLink = sidebar.getByRole("link", { name: /club house/i });
  await expect(clubhouseLink).toBeVisible();

  // Le clic sur le lien doit naviguer vers /club/clubhouse
  await clubhouseLink.click();
  await expect(page).toHaveURL(/\/club\/clubhouse/);

  // La page doit se charger sans erreur
  await expect(page.getByRole("heading", { name: /club house/i })).toBeVisible();
});
