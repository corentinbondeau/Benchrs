# Tests

## Strategie

Benchrs utilise **Playwright** pour les tests End-to-End (E2E). Il n'y a pas de tests unitaires — toute la validation passe par des tests d'integration navigateur.

### Pourquoi E2E uniquement ?

- L'application est principalement **client-side** ("use client") avec des queries Supabase directes
- Les regles metier sont appliquees par les **policies RLS** (testees via le comportement UI)
- Les tests E2E couvrent le flux complet : rendu → interaction → requete Supabase → resultat

## Configuration Playwright

Fichier : `playwright.config.ts`

| Option | Valeur |
|--------|--------|
| Test directory | `./e2e` |
| Base URL | `http://127.0.0.1:3000` |
| Parallelisme | Fully parallel |
| Retries | 2 en CI, 0 en local |
| Workers | 2 en CI |
| Trace | On first retry |
| Web Server | `npm run build && npm run start` (port 3000) |
| Timeout | 4 min (build lent) |

### Projets (navigateurs)

| Projet | Device | Viewport |
|--------|--------|----------|
| `chromium` | Desktop Chrome | 1280x720 |
| `mobile-chromium` | Pixel 5 | 393x851 |

## Fichiers de tests existants

### `e2e/public.spec.ts` (3 tests)

Tests sur les pages publiques (sans authentification) :

1. Page d'accueil `/login` — se charge correctement
2. Page d'inscription `/register` — formulaire accessible
3. Navigation entre login et register

### `e2e/clubhouse.spec.ts` (5 tests)

Tests sur la feature de reservation du club house (avec authentification) :

1. **Affichage** — La page `/club/clubhouse` se charge, calendrier visible, reservations listees
2. **Creation** — Dialog de creation, formulaire (titre, heures), soumission, toast confirmation
3. **Suppression** — Bouton suppression, dialog de confirmation, disparition de la liste
4. **Conflit de creneaux** — Tentative de double reservation, message d'erreur visible
5. **Sidebar** — Lien "Club House" visible et cliquable dans la navigation

## Ecrire un test

### Structure d'un fichier de test

```typescript
import { test, expect } from "@playwright/test";

test.describe("Ma feature", () => {
  // Authentification avant chaque test
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page);
  });

  test("devrait afficher la page", async ({ page }) => {
    await page.goto("/ma-page");
    await expect(page.getByRole("heading", { name: /titre/i })).toBeVisible();
  });

  test("devrait creer un element", async ({ page }) => {
    await page.goto("/ma-page");
    await page.getByRole("button", { name: /nouveau/i }).click();
    await page.getByLabel(/nom/i).fill("Mon element");
    await page.getByRole("button", { name: /creer/i }).click();
    await expect(page.getByText("Element cree")).toBeVisible();
  });
});
```

### Authentification programmatique

Les tests qui necessitent un utilisateur connecte utilisent un login via l'API Supabase REST :

```typescript
async function loginAsCoach(page: Page) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const res = await page.request.post(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      headers: { apikey: supabaseKey, "Content-Type": "application/json" },
      data: {
        email: process.env.E2E_COACH_EMAIL,
        password: process.env.E2E_COACH_PASSWORD,
      },
    }
  );
  const { access_token, refresh_token } = await res.json();

  // Injecter les tokens dans le storage du navigateur
  await page.goto("/");
  await page.evaluate(
    ({ url, key, access, refresh }) => {
      const storageKey = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
      localStorage.setItem(storageKey, JSON.stringify({
        access_token: access,
        refresh_token: refresh,
      }));
    },
    { url: supabaseUrl, key: supabaseKey, access: access_token, refresh: refresh_token }
  );
  await page.reload();
}
```

### Variables d'environnement pour les tests

| Variable | Description |
|----------|-------------|
| `E2E_COACH_EMAIL` | Email d'un compte coach de test |
| `E2E_COACH_PASSWORD` | Mot de passe du compte coach |
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cle anonyme Supabase |

## Bonnes pratiques

### Locators (selecteurs)

Privilegier les **locators semantiques** Playwright :

```typescript
// Bien
page.getByRole("button", { name: /creer/i });
page.getByLabel(/titre/i);
page.getByText(/reservation creee/i);

// A eviter
page.locator(".btn-primary");
page.locator('[data-testid="create-btn"]');
page.locator("div > span:nth-child(2)");
```

### Attentes (assertions)

Utiliser les **assertions auto-retrying** de Playwright :

```typescript
// Bien — attend automatiquement
await expect(page.getByText("Succes")).toBeVisible();
await expect(page.getByRole("list")).toContainText("Mon element");

// A eviter — fragile
await page.waitForTimeout(2000);
await page.waitForSelector(".success-message");
```

### Un test = un comportement metier

```typescript
// Bien — teste un comportement observable
test("devrait afficher un message d'erreur si le creneau est deja reserve", ...);

// A eviter — teste l'implementation
test("devrait appeler supabase.insert avec les bons parametres", ...);
```

## Lancer les tests

```bash
# Tous les tests
npx playwright test

# Un fichier specifique
npx playwright test e2e/clubhouse.spec.ts

# Un test specifique
npx playwright test -g "devrait afficher la page"

# Mode UI (debug visuel)
npx playwright test --ui

# Avec rapport HTML
npx playwright test --reporter=html
npx playwright show-report

# Desktop seulement (pas de mobile)
npx playwright test --project=chromium

# Mode debug (step by step)
npx playwright test --debug
```

## CI/CD

Les tests E2E sont executes automatiquement dans GitHub Actions sur chaque push/PR :

1. Build de l'application (`npm run build`)
2. Installation de Chromium (`npx playwright install chromium`)
3. Execution des tests
4. En cas d'echec : rapport uploade en artifact (7 jours)

Le rapport HTML est telecharger depuis l'onglet "Artifacts" du job GitHub Actions.
