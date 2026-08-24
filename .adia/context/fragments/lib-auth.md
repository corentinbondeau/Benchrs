# Fragment — lib-auth
> Genere par @init_project le 2026-08-24
> Derniere mise a jour : 2026-08-24
> Module path : src/lib/ (auth, team, api-auth, api-client)

## Responsabilite
Contextes React (AuthProvider, TeamProvider) pour l'etat global d'auth et d'equipe. Helpers API pour valider l'auth sur les routes serveur.

## Fichiers cles
| Fichier | Role |
|---------|------|
| auth.tsx | AuthProvider context — user, session, loading, signOut |
| team.tsx | TeamProvider context — currentTeam, teams, userRole, switchTeam |
| api-auth.ts | Server-side auth helpers — getAuthUser, isTeamMember, getTeamRole, isTeamCoach |
| api-client.ts | authFetch — wrapper fetch avec Bearer token auto |

## Patterns
- AuthProvider ecoute `onAuthStateChange` de Supabase + fetch le profil
- TeamProvider charge les equipes de l'utilisateur via `team_members` join `teams`
- Toutes les API routes utilisent `getAuthUser(req)` ou `getAuthUserDetailed(req)` pour valider le JWT
- `authFetch` recupere le token via `getSessionAccessToken()` et l'ajoute en header Authorization

## Points d'attention
- `getAuthUser` extrait le token du header Authorization (pas de cookie)
- Le client envoie le token via `authFetch` (pas de middleware Next.js auth)
- Team switching persiste dans localStorage (`sportplus:teamId`)
