# Quality — Benchrs
> Genere par @init_project le 2026-08-24 — Projet Benchrs
> Derniere mise a jour : 2026-08-24

## Linting
- **ESLint** : eslint-config-next (core-web-vitals + typescript)
- Config : `eslint.config.mjs` (flat config)
- Commande : `npm run lint` (= `eslint`)
- Ignores : `.next/`, `out/`, `build/`, `next-env.d.ts`

## Formatting
- Pas de Prettier configure
- Pas de `.editorconfig`

## TypeScript
- `strict: true`
- Typecheck CI : `npx tsc --noEmit`

## Pre-commit hooks
- **Aucun** (pas de Husky, pas de lint-staged, pas de .pre-commit-config.yaml)

## Couverture de code
- **Non configuree** (ni Istanbul, ni c8, ni coverage dans Playwright)

## SonarQube
- **Non configure**

## Securite
- CSP configuree dans `next.config.ts` (restrictive)
- Headers securite : X-Content-Type-Options, X-Frame-Options, HSTS
- Permissions-Policy : geolocation=(), microphone=(), payment=()
- Rate limiting custom (`rateLimit.ts`) sur les endpoints sensibles
- Auth Supabase (JWT Bearer tokens) sur toutes les API routes
- RLS Supabase (74 migrations de durcissement)
- **Point de vigilance** : cles VAPID en dur dans le code (`webpush.ts`, `push.ts`)
