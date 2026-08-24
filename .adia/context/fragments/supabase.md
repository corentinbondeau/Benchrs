# Fragment — supabase
> Genere par @init_project le 2026-08-24
> Derniere mise a jour : 2026-08-24
> Module path : src/lib/supabase/

## Responsabilite
Factory de clients Supabase pour les 3 contextes : navigateur (client), SSR (server), et admin (service role).

## Fichiers cles
| Fichier | Role |
|---------|------|
| client.ts | Browser client (anon key) + getSessionAccessToken |
| server.ts | SSR client (cookies, anon key) |
| admin.ts | Admin client (service_role key, bypass RLS) |

## Variables d'environnement requises
- `NEXT_PUBLIC_SUPABASE_URL` — URL du projet Supabase (public)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Cle anonyme (public)
- `SUPABASE_SERVICE_ROLE_KEY` — Cle service role (server-side only, secret)

## Points d'attention
- `createAdminClient` log un warning si la cle est invalide/placeholder mais ne throw pas
- Le admin client desactive `autoRefreshToken` et `persistSession` (serverless)
- **Toutes les API routes** utilisent `createAdminClient` (pas le server client SSR)
- Le server client SSR n'est utilise que pour les Server Components (pages)
- 74 migrations SQL dans `supabase/migrations/` — schema complet depuis `000_full_schema.sql`
