# Contribuer a Benchrs

## Workflow Git

1. Creer une branche depuis `main` : `git checkout -b feature/ma-feature`
2. Developper et committer avec des messages conventionnels
3. Pousser et ouvrir une Pull Request
4. CI (typecheck + lint + E2E) doit etre au vert
5. Review et merge

## Conventions de commit

Le projet utilise les [Conventional Commits](https://www.conventionalcommits.org/) :

```
feat(scope): description       # Nouvelle fonctionnalite
fix(scope): description        # Correction de bug
design(scope): description     # Changements UI/UX
docs: description              # Documentation
refactor(scope): description   # Refactoring sans changement fonctionnel
test: description              # Ajout/modification de tests
chore: description             # Maintenance, dependances
```

## Structure du projet

```
src/
  app/
    (auth)/              # Pages authentification (login, register, ...)
    (dashboard)/         # Pages dashboard (40+ pages)
    api/                 # Routes API (59 endpoints)
    c/[slug]/            # Page publique du club
    live/[eventId]/      # Score live
  components/
    ui/                  # Composants shadcn/ui (21 composants)
    layout/              # TopBar, Sidebar, BottomNav
    dashboard/           # Widgets tableau de bord
    match/               # Composants match
    training/            # Composants entrainement
    stats/               # Composants statistiques
    event/               # Composants evenement
    ...
  lib/
    supabase/            # Clients Supabase (client, server, admin)
    training/            # Generateurs IA + PDF entrainement
    season/              # Generateurs IA saison
    challenges/          # Generateur IA defis
    announcements/       # Generateur IA annonces
    ...
  types/
    index.ts             # 60+ interfaces TypeScript
supabase/
  migrations/            # 76 migrations SQL
e2e/                     # Tests Playwright
public/                  # Assets statiques, manifest PWA
kubernetes/              # Chart Helm + values par env
```

## Base de donnees

Les modifications de schema passent par les **migrations Supabase** dans `supabase/migrations/`.

### Creer une migration

1. Trouver le prochain numero : `ls supabase/migrations/ | tail -1`
2. Creer le fichier : `supabase/migrations/NNN_description.sql`
3. Chaque table doit avoir :
   - RLS active : `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
   - Policies SELECT/INSERT/UPDATE/DELETE adaptees
   - `GRANT SELECT, INSERT, UPDATE, DELETE ON ... TO authenticated`

### Pattern RLS standard

```sql
-- Lecture : membres de l'equipe (+ comite club)
CREATE POLICY "Team members can view" ON public.ma_table
  FOR SELECT USING (team_id IN (SELECT public.user_visible_team_ids()));

-- Ecriture : coachs uniquement
CREATE POLICY "Coaches can manage" ON public.ma_table
  FOR ALL USING (public.is_team_coach(team_id));
```

## Tests

```bash
# Lancer tous les tests E2E
npx playwright test

# Un fichier specifique
npx playwright test e2e/clubhouse.spec.ts

# Mode UI (debug visuel)
npx playwright test --ui

# Avec rapport HTML
npx playwright test --reporter=html
```

## Style de code

- **TypeScript strict** — `strict: true` dans tsconfig, pas de `any`
- **Tailwind CSS v4** — Classes utilitaires, pas de CSS custom
- **shadcn/ui** — Utiliser les composants existants (`src/components/ui/`)
- **Pages "use client"** — Les pages dashboard sont client-side
- **Pattern de page** — Suivre le modele de `src/app/(dashboard)/club/terrains/page.tsx`
- **Types** — Ajouter les interfaces dans `src/types/index.ts` (en fin de fichier)
- **API routes** — Utiliser `getAuthUser()` ou `getAuthUserDetailed()` pour l'auth

## Parité legacy-app (fork Next 14)

`legacy-app/` est un fork downgradé (Next 14 / React 18 / Tailwind 3) de l'app
principale (`src/`), maintenu pour compatibilité avec les vieux navigateurs.
Depuis les corrections UX du fork (error boundaries propres, accessibilité,
pagination, pause des timers), `legacy-app/` n'est plus un miroir intégral de
`src/` : l'UI y diverge **volontairement**. La parité ne porte donc plus que
sur la **logique métier partagée**, seule partie qui doit rester strictement
identique entre les deux arborescences.

Périmètre exact surveillé (voir `PARITY_SCOPE` dans
`scripts/check-legacy-parity.mjs`) :
- `src/lib/**`
- `src/types/**`
- `src/components/lineup/**`

Tout le reste (`src/app/**`, les composants hors `lineup`, les hooks, les
tests) est laissé libre : le fork peut y diverger sans que la CI ne le
signale.

Toute modification de `src/lib`, `src/types` ou `src/components/lineup` doit
être suivie de `npm run sync:legacy` pour répercuter le changement dans
`legacy-app/src/`. La commande `npm run check:legacy-parity` est **bloquante
en CI** : elle compare récursivement ces trois racines entre `src/` et
`legacy-app/src/` et échoue si un écart hors allowlist est détecté. Allowlist
actuelle (voir `scripts/check-legacy-parity.mjs`) :
`lib/legacyUserAgent.ts`/`.test.ts` (spécifiques à l'app principale).


## Checklist PR

- [ ] TypeScript compile sans erreur (`npx tsc --noEmit`)
- [ ] ESLint passe (`npm run lint`)
- [ ] Tests E2E passent (`npx playwright test`)
- [ ] Migration SQL incluse si modification de schema
- [ ] Types TypeScript mis a jour si nouvelle table/colonne
- [ ] RLS policies ajoutees si nouvelle table
