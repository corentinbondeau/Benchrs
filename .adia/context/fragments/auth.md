# Fragment — auth
> Genere par @init_project le 2026-08-24
> Derniere mise a jour : 2026-08-24
> Module path : src/app/api/auth/ + src/app/(auth)/

## Responsabilite
Authentification Supabase : inscription, connexion, join equipe/club, liaison parent-enfant, reset password.

## Fichiers cles
| Fichier | Role |
|---------|------|
| api/auth/register/route.ts | POST — creation compte + profil + team_member |
| api/auth/join-team/route.ts | POST — rejoindre une equipe via invite code |
| api/auth/join-club/route.ts | POST — rejoindre un club en tant que comite |
| api/auth/create-team/route.ts | POST — creer une equipe (+ club si necessaire) |
| api/auth/link-child/route.ts | POST — lier un parent a un enfant |
| api/auth/forgot-password/route.ts | POST — envoi email reset (nodemailer SMTP) |
| (auth)/login/page.tsx | Page de connexion |
| (auth)/register/page.tsx | Page d'inscription |

## Patterns
- Supabase Auth (email/password) — pas de OAuth
- Admin client pour les operations serveur (bypass RLS)
- Roles : owner, coach, player, parent (TeamMemberRole)
- Clubs : president, comite (ClubMembership)
- Invite codes pour rejoindre equipes/clubs

## Points d'attention
- Le reset password utilise SMTP (nodemailer) directement, pas Supabase Auth reset
- Pas de verification email a l'inscription
