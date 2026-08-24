# Fragment — club
> Genere par @init_project le 2026-08-24
> Derniere mise a jour : 2026-08-24
> Module path : src/app/(dashboard)/club/ + src/app/api/clubs/

## Responsabilite
Espace club multi-equipes : vue d'ensemble des equipes, gestion comite/president, identite FFF, codes d'invitation.

## Fichiers cles
| Fichier | Role |
|---------|------|
| (dashboard)/club/page.tsx | Page dashboard club |
| api/clubs/lookup/route.ts | GET — recherche club par numero FFF |
| api/clubs/lookup-public/route.ts | GET — recherche publique (pas d'auth) |
| api/clubs/identity/route.ts | POST — mise a jour identite FFF |
| api/clubs/invite-code/route.ts | POST — genere code invitation |
| api/clubs/members/route.ts | GET — liste membres du club |
| lib/clubs.ts | normalizeFffNumber, normalizeClubName |

## Points d'attention
- Un club peut avoir plusieurs equipes
- Roles club : president, comite (distincts des roles equipe)
- Identite FFF : numero d'affiliation unique (anti-doublons)
