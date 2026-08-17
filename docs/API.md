# Documentation API

> 59 endpoints organises en 18 categories. Toutes les routes sont sous `/api/`.

## Authentification

Trois modes d'authentification :

| Mode | Header/Cookie | Endpoints |
|------|---------------|-----------|
| **Cookie JWT** | Cookie Supabase (automatique) | Majorite des endpoints |
| **Bearer token** | `Authorization: Bearer <CRON_SECRET>` | `/api/notifications/cron` |
| **Token query param** | `?token=xxx` | `/api/live/[eventId]`, `/api/calendar/ics` |
| **Aucune** | — | `/api/auth/register`, `/api/auth/forgot-password`, `/api/clubs/lookup-public` |

---

## 1. Auth (6 endpoints)

### `POST /api/auth/register`
Inscription d'un nouvel utilisateur.
- **Auth :** Aucune (rate-limited)
- **Body :** `{ email, password, firstName, lastName, role?, phone? }`
- **Reponse :** `{ user, message }` — 200, 400, 429, 500

### `POST /api/auth/forgot-password`
Envoie un email de reinitialisation de mot de passe.
- **Auth :** Aucune (rate-limited)
- **Body :** `{ email }`
- **Reponse :** `{ message: "Email envoye." }` — 200, 400, 429, 500

### `POST /api/auth/create-team`
Cree un club + equipe + ajoute l'utilisateur comme owner.
- **Auth :** `getAuthUser` (rate-limited)
- **Body :** `{ clubName, teamName, fffNumber }`
- **Reponse :** `{ team, club, clubName, inviteCode, message }` — 200, 400, 401, 409, 429

### `POST /api/auth/join-team`
Rejoint une equipe via code d'invitation.
- **Auth :** `getAuthUser` (rate-limited)
- **Body :** `{ inviteCode, role? }` — Roles: player, parent, coach
- **Reponse :** `{ team, message }` — 200, 400, 401, 404, 429

### `POST /api/auth/join-club`
Rejoint le comite d'un club.
- **Auth :** `getAuthUser` (rate-limited)
- **Body :** `{ clubId, inviteCode }`
- **Reponse :** `{ club, message }` — 200, 400, 401, 403, 404, 429

### `POST /api/auth/link-child`
Lie un parent a un ou plusieurs joueurs.
- **Auth :** `getAuthUser` (rate-limited)
- **Body :** `{ studentIds: string[], teamId }`
- **Reponse :** `{ ok, linked }` — 200, 400, 401, 403, 429

---

## 2. Account (3 endpoints)

### `POST /api/account/delete`
Suppression definitive du compte (CASCADE sur toutes les donnees).
- **Auth :** `getAuthUserDetailed`
- **Body :** `{ confirm: "SUPPRIMER" }`
- **Reponse :** `{ ok }` — 200, 400, 401

### `GET /api/account/export`
Export RGPD de toutes les donnees personnelles (26 tables).
- **Auth :** `getAuthUserDetailed`
- **Reponse :** `{ exportedAt, user, data: { profiles[], team_members[], ... } }` — 200, 401

### `POST /api/account/onboarding-done`
Marque l'onboarding parent comme termine.
- **Auth :** `getAuthUser`
- **Reponse :** `{ success }` — 200, 401

---

## 3. Teams (3 endpoints)

### `POST /api/teams/delete`
Suppression complete d'une equipe (24 tables purgees).
- **Auth :** `getAuthUser` + role `owner`
- **Body :** `{ teamId }`
- **Reponse :** `{ success }` — 200, 400, 401, 403

### `POST /api/teams/transfer-ownership`
Transfere la propriete de l'equipe (ancien owner devient coach).
- **Auth :** `getAuthUser` + role `owner`
- **Body :** `{ teamId, newOwnerId }`
- **Reponse :** `{ success }` — 200, 400, 401, 403, 404

### `POST /api/team/leave`
Quitter une equipe (interdit pour le owner).
- **Auth :** `getAuthUser` + membre
- **Body :** `{ teamId }`
- **Reponse :** `{ success }` — 200, 400, 401, 403

---

## 4. Clubs (9 endpoints)

### `GET /api/clubs/lookup`
Recherche d'un club par numero FFF (authentifie).
- **Auth :** `getAuthUser`
- **Query :** `?fffNumber=123456`
- **Reponse :** `{ club: { id, name } | null }` — 200, 401

### `GET /api/clubs/lookup-public`
Recherche publique d'un club par numero FFF.
- **Auth :** Aucune
- **Query :** `?fffNumber=123456`
- **Reponse :** `{ club: { id, name } | null }` — 200

### `POST /api/clubs/identity`
Definit le numero FFF d'un club (detecte doublons).
- **Auth :** `getAuthUserDetailed` + president/createur
- **Body :** `{ clubId, fffNumber }`
- **Reponse :** `{ ok, fff_number }` — 200, 400, 401, 403, 404, 409

### `POST /api/clubs/invite-code`
Genere/regenere le code d'invitation comite.
- **Auth :** `getAuthUserDetailed` + president
- **Body :** `{ clubId, regenerate? }`
- **Reponse :** `{ inviteCode }` — 200, 400, 401, 403

### `POST /api/clubs/members`
Ajoute un membre au comite par email.
- **Auth :** `getAuthUserDetailed` + president
- **Body :** `{ clubId, email, role? }`
- **Reponse :** `{ ok }` — 200, 400, 401, 403, 404

### `DELETE /api/clubs/members`
Retire un membre du comite.
- **Auth :** `getAuthUserDetailed` + president
- **Body :** `{ clubId, userId }`
- **Reponse :** `{ ok }` — 200, 400, 401, 403

### `PATCH /api/clubs/members`
Change le role d'un membre du comite.
- **Auth :** `getAuthUserDetailed` + president
- **Body :** `{ clubId, userId, role }`
- **Reponse :** `{ ok }` — 200, 400, 401, 403

### `POST /api/clubs/aliases`
Ajoute un alias de nom au club.
- **Auth :** `getAuthUserDetailed` + president
- **Body :** `{ clubId, alias }`
- **Reponse :** `{ ok }` — 200, 400, 401, 403, 409

### `DELETE /api/clubs/aliases`
Supprime un alias de nom du club.
- **Auth :** `getAuthUserDetailed` + president
- **Body :** `{ clubId, alias }`
- **Reponse :** `{ ok }` — 200, 400, 401, 403

---

## 5. Matches & Live (5 endpoints)

### `GET /api/live/[eventId]`
Donnees live d'un match (score, chrono) via token public.
- **Auth :** Aucune (token en query)
- **Query :** `?token=xxx`
- **Reponse :** `{ id, teamName, title, opponent, scoreUs, scoreThem, status, ... }` — 200, 400, 404

### `POST /api/matches/live-token`
Genere un token de partage pour le score live.
- **Auth :** `getAuthUserDetailed` + owner/coach
- **Body :** `{ eventId, regenerate? }`
- **Reponse :** `{ liveToken }` — 200, 400, 401, 403, 404

### `POST /api/matches/report`
Genere un compte-rendu de match (IA Mistral ou manuel).
- **Auth :** `getAuthUserDetailed` + coach
- **Body :** `{ eventId, mode?: "ai"|"manual", report?: {...} }`
- **Reponse :** `{ ok, report, source }` — 200, 400, 401, 403, 404

### `GET /api/matches/report`
Recupere le compte-rendu d'un match.
- **Auth :** `getAuthUserDetailed` + membre
- **Query :** `?eventId=xxx`
- **Reponse :** `{ report, source, created_at, updated_at }` — 200, 400, 401, 403, 404

### `POST /api/matches/availability/notify`
Envoie des notifications de disponibilite.
- **Auth :** `getAuthUserDetailed` + coach
- **Body :** `{ eventId, teamId }`
- **Reponse :** `{ ok, recipients, sent }` — 200, 400, 401, 403, 404

---

## 6. Trainings (2 endpoints)

### `POST /api/trainings/generate`
Genere une seance d'entrainement par IA + PDF.
- **Auth :** `getAuthUser` + membre equipe
- **Body :** `{ team_id, phase, objectives: string[], playerCount?, systeme?, expertise? }`
- **Reponse :** `{ session, pdf: base64 }` — 200, 400, 401, 403

### `POST /api/trainings/pdf`
Rend un PDF a partir d'une seance.
- **Auth :** `getAuthUser`
- **Body :** `{ session, source?: "ai"|"manual" }`
- **Reponse :** `{ pdf: base64 }` — 200, 400, 401

---

## 7. Challenges (1 endpoint)

### `POST /api/challenges/generate`
Genere le defi de la semaine par IA.
- **Auth :** `getAuthUserDetailed` + coach
- **Body :** `{ teamId, weekStart: "YYYY-MM-DD", difficulty?: "facile"|"moyen"|"difficile" }`
- **Reponse :** `{ challenge }` — 200, 400, 401, 403

---

## 8. Championships (5 endpoints)

### `GET /api/championships`
Liste les championnats d'une equipe avec standings.
- **Auth :** `getAuthUser` + membre
- **Query :** `?team_id=xxx`
- **Reponse :** `[{ ...championship, teams: [...standings] }]` — 200, 401, 403

### `POST /api/championships`
Cree un nouveau championnat.
- **Auth :** `getAuthUser` + coach
- **Body :** `{ team_id, name, season?, level? }`

### `POST /api/championships/standings`
Ajoute un resultat a un championnat.
- **Auth :** `getAuthUser` + coach
- **Body :** `{ championship_id, home_team, away_team, home_score, away_score, matchday_number? }`

### `POST /api/championships/fff`
Scrape le classement depuis le site FFF.
- **Auth :** `getAuthUser` + membre
- **Body :** `{ url?, html?, championship_id?, type?: "standings"|"calendar"|"all" }`

### `POST /api/championships/dofa`
Recupere calendrier/resultats depuis l'API DOFA de la FFF.
- **Auth :** `getAuthUser` + membre
- **Body :** `{ teamId?, fffNumber?, clubName?, type?: "calendar"|"results"|"all"|"equipes" }`

---

## 9. Season (8 endpoints)

### `POST /api/season/report` — Generer le bilan de saison (IA ou manuel)
### `GET /api/season/report` — Recuperer le bilan de saison
### `POST /api/season/report/pdf` — Generer un PDF du bilan
### `POST /api/season/plan` — Generer un plan de saison par IA
### `GET /api/season/plan` — Recuperer le plan de saison
### `POST /api/season/copy` — Dupliquer les evenements de la saison precedente
### `POST /api/season/greetings` — Generer des voeux personnalises par joueur
### `POST /api/season/storybook` — Generer un storybook de saison + PDF

---

## 10. Reports (2 endpoints)

### `POST /api/reports/quarterly` — Generer les bilans trimestriels
### `GET /api/reports/quarterly` — Recuperer les bilans trimestriels

---

## 11. Notifications (4 endpoints)

### `POST /api/notifications/send`
Envoie des notifications (21 types supportes).
- **Auth :** `getAuthUserDetailed` + coach (sauf "message")
- **Body :** `{ user_ids[], title, body, type?, team_id, url? }`
- **Types :** convocation, message, rappel, physical, match_retour, match_report, terrain_impraticable, reunion, cagnotte, recuperation, newsletter, suspension, match_checklist, tournament, on_est_parti, match_live, voeux

### `POST /api/notifications/subscribe` — Enregistrer un abonnement push
### `DELETE /api/notifications/subscribe` — Supprimer un abonnement push
### `GET /api/notifications/cron` — CRON : rappels, digest, alertes (Bearer token)

---

## 12-18. Autres endpoints

### Chat
- `POST /api/chat/player-channel` — Creer/recuperer un canal de discussion prive

### Announcements
- `POST /api/announcements/generate` — Generer une annonce par IA

### Newsletter
- `POST /api/newsletter` — Generer une newsletter mensuelle par IA

### Calendar
- `GET /api/calendar/url` — Generer les URLs du calendrier ICS
- `GET /api/calendar/ics` — Servir le fichier ICS (public via token)

### Gallery & Albums
- `POST /api/gallery/set-album` — Assigner un media a un album
- `POST /api/gallery/delete` — Supprimer des medias
- `POST /api/albums/delete` — Supprimer un album
- `POST /api/storage/gallery-bucket` — Creer le bucket gallery

### Export
- `POST /api/export/roster` — Generer un PDF de l'effectif

### Treasury
- `POST /api/treasury/relance` — Envoyer une relance de cotisation
