# Guide fonctionnel

> Tour complet de toutes les fonctionnalites de Benchrs, organisees par module.

## 1. Authentification & Onboarding

| Page | Description |
|------|-------------|
| `/login` | Connexion par email/mot de passe |
| `/register` | Inscription avec role (coach, joueur, parent) |
| `/forgot-password` | Reinitialisation par email |
| `/create-team` | Creation d'un club + equipe (detection doublon FFF) |
| `/join` | Rejoindre une equipe via code d'invitation |
| `/link-child` | Lier un parent a ses enfants dans l'equipe |

**Roles** : Owner (createur), Coach, Joueur, Parent
**Onboarding parent** : Parcours guide pour lier ses enfants et configurer les notifications

---

## 2. Dashboard

Page d'accueil personnalisee selon le role :

| Widget | Coach | Joueur | Parent |
|--------|-------|--------|--------|
| Prochain evenement (compte a rebours) | Oui | Oui | Oui |
| Convocations en attente | Oui | — | — |
| Resume de la semaine | Oui | — | — |
| Resultats recents | Oui | Oui | Oui |
| Resume de saison (stats) | Oui | Oui | — |
| Fil d'actualite club | Oui | Oui | Oui |
| Stats rapides | — | Oui | — |
| Dashboard parent (enfants) | — | — | Oui |

---

## 3. Calendrier & Evenements

**Page :** `/calendar`

- Vue calendrier mensuelle avec tous les evenements (matchs, entrainements)
- Creation/edition d'evenements avec type, date, lieu, adversaire
- Recurrence pour les entrainements reguliers
- Export **ICS** (iCalendar) compatible Google Calendar, Apple Calendar
- Lieux favoris (`team_locations`) pour autocompletion
- Widget **meteo** integre (Open-Meteo API) pour les lieux d'evenements

---

## 4. Matchs

### Feuille de match (`/matches/[id]/feuille`)
- Composition d'equipe en drag-and-drop (tactique visuelle)
- Formation predefinie ou personnalisee
- Titulaires et remplacants

### Score live (`/live/[eventId]`)
- Suivi du match en temps reel (score, chrono, mi-temps)
- Partageable par **lien public** (token unique)
- Timeline des evenements (buts, cartons, remplacements)

### Notations joueurs
- Notations coach (0-10, demi-points)
- Notations entre joueurs (peer rating)
- Vote **Man of the Match** (MOTM)

### Disponibilites
- Les joueurs indiquent leur disponibilite (dispo, pas dispo, incertain)
- Le coach recoit un recap automatique

### Checklist match
- Liste de taches personnalisable avant le match
- Les joueurs cochent (accusent reception)

### Agenda match
- Programme horaire du jour de match (rendez-vous, echauffement, coup d'envoi)

### Compte-rendu
- Generation automatique par **IA Ollama (locale)** ou saisie manuelle
- Sauvegarde en base (JSONB)

### Annonce/Convocation
- Generation par IA : ton (motivant, formel, decontracte), audience (joueurs, parents, tous)

---

## 5. Entrainements

### Fiche de seance (`/trainings/[id]`)
- Exercices structures avec duree, description, schema tactique
- Visibilite : coach seul ou equipe entiere
- Lien avec les cycles de saison

### Generateur IA (`/trainings/generate`)
- Input : phase de saison, objectifs, nombre de joueurs, systeme de jeu, expertise
- Output : fiche d'entrainement complete + **PDF telecharger**
- Modele : Ollama (configurable via `AI_MODEL`, defaut `llama3.1:8b`)

### Bibliotheque d'exercices
- Exercices reutilisables par type (echauffement, technique, tactique, physique, jeu)
- Schema visuel en JSONB

### Templates
- Sauvegarder une seance comme template reutilisable

### RPE (Rate of Perceived Exertion)
- Apres chaque seance, les joueurs evaluent la charge (1-10) et la duree
- Suivi de la charge d'entrainement dans le temps

### Feedback de seance
- Note, intensite, moral, commentaire par joueur

### Educators
- Attribution des roles de coach par exercice dans la seance

---

## 6. Preparation physique

**Page :** `/physical`

- **Tests VMA/VMI** : historique des tests de vitesse maximale aerobique
- **Documents** : fiches de preparation physique (PDF uploadables)
- **Suivi baisse de forme** (`/stats/drop`) : detection des joueurs en baisse
- Normes VMA par categorie d'age

**Page :** `/physical/tests`
- Interface de saisie des tests VMA/VMI avec graphiques d'evolution

---

## 7. Communication

### Chat (`/chat`)
- Messagerie **temps reel** (Supabase Realtime)
- Canaux par defaut : general, parents, coachs
- Canaux prives par joueur (coach ↔ parents du joueur)
- Indicateur de messages non lus

### Notifications (`/notifications`)
- 21 types de notifications (convocations, rappels, resultats, etc.)
- Push notifications (Web Push API)
- Preferences par type et par equipe
- Cron quotidien : rappels veille, digest, alertes echeances, felicitations

### Annonces
- Generation par IA avec ton et audience personnalisables

### Newsletter
- Generation mensuelle par IA a partir des stats du mois

### Sondages (`/polls`)
- Creation de sondages avec options multiples
- Vote unique par utilisateur

---

## 8. Club

### Gestion du comite (`/club`)
- Membres du comite (president, comite)
- Code d'invitation specifique au comite
- Numero FFF (Federation Francaise de Football)
- Aliases de nom du club

### Page publique (`/c/[slug]`)
- Vitrine du club activable par le comite
- Description, email de contact, telephone
- Liste des equipes
- Formulaire de **demande d'essai** (trial request)

### Terrains (`/club/terrains`)
- Gestion des terrains du club (nom, lieu)
- Planning de reservation par jour/heure/equipe

### Club House (`/club/clubhouse`)
- Calendrier de reservation du club house
- Vue par jour avec creneaux
- Detection des conflits (contrainte SQL EXCLUDE)
- Accessible aux coachs et au comite

### Transferts (`/club/mutations`)
- Demande de transfert d'un joueur entre equipes du meme club
- Workflow : pending → approved/rejected

### Fil d'actualite (`/club/feed`)
- Publications du club (texte + media)
- Visible par toutes les equipes du club

### Journal d'activite
- Log automatique des actions (activity_logs)

---

## 9. Administration

### Cotisations (`/admin/cotisations`)
- Suivi des cotisations par joueur et par saison
- Montant attendu, montant paye, statut
- Historique des paiements
- **Relance automatique** (notification au joueur + parents)

### Tresorerie (`/admin/treasury`)
- Revenus et depenses par categorie
- Date et label de chaque transaction

### Licences et certificats (`/admin/deadlines`)
- Date d'expiration des licences joueurs
- Date d'expiration des certificats medicaux
- Alertes automatiques (cron) a l'approche de l'echeance

### Inventaire materiel (`/material`)
- Gestion du stock (maillots, ballons, trousses, medical)
- Prets de materiel aux joueurs avec suivi retour

### Effectif (`/roster`)
- Vue complete de l'equipe avec export **PDF**
- Infos joueurs (position, numero, pied fort, taille, poids)

### Gestion des joueurs (`/admin/players`)
- Informations medicales (allergies, contacts urgence)
- Numero de licence
- Positions secondaires

---

## 10. Statistiques & Analyses

### Stats generales (`/stats`)
- Classement des buteurs, passeurs
- Taux de presence par joueur
- Temps de jeu par joueur
- Equite de temps de jeu (alerte si desequilibre)

### Stats joueur (`/stats/[playerId]`)
- Carte "Panini" du joueur avec stats cles
- Historique des performances match par match
- Badges et recompenses
- Evolution des notations
- Objectifs personnels et progression

### Comparaison (`/stats/compare`)
- Comparer deux joueurs sur les metriques cles

### Mes stats (`/stats/my`)
- Vue personnelle pour le joueur (ses propres stats)

### Carnet joueur
- Notes du coach par match (performance, points a ameliorer)

### Leaderboard
- Classement interne de l'equipe

---

## 11. Galerie & Medias

**Page :** `/gallery`

- Upload de photos et videos (Supabase Storage)
- Organisation par albums
- Association aux evenements
- Suppression (coach ou uploader)

---

## 12. Saison

### Cycles de saison (`/season`)
- Planification par periodes (5 types : desequilibrer/finir, conserver/progresser, s'opposer, recuperer, athletisation)
- Attribution des evenements aux cycles

### Bilan de saison
- Generation par IA a partir des stats globales
- Export PDF

### Plan de saison
- Generation par IA : planification macro-cycle
- Cache pour eviter la regeneration

### Bilans trimestriels (`/stats/[playerId]`)
- Evaluation individuelle par joueur (IA ou manuel)
- Notification au joueur/parents
- 4 trimestres par saison

### Storybook de saison
- Recit narratif genere par IA + export PDF
- Resume le parcours de l'equipe sur la saison

### Voeux de fin de saison
- Message personnalise par joueur genere par IA

### Duplication de saison
- Copier les evenements de la saison precedente (+1 an)

---

## 13. Divers

### Cagnotte (`/cagnotte`)
- Cagnottes d'equipe avec objectif de montant
- Contributions suivies par montant et methode de paiement

### Trophees (`/trophies`)
- Attribution de trophees aux joueurs
- Lies aux evenements

### Defis hebdomadaires (`/challenge`)
- Defi genere par IA chaque semaine (3 niveaux de difficulte)
- Les joueurs soumettent une video/photo comme preuve
- Validation par le coach

### Tactiques (`/tactics`)
- Editeur de formations en drag-and-drop
- Sauvegarde de schemas tactiques

### Covoiturage (`/carpooling`)
- Conducteurs proposent des places
- Passagers reservent
- Lie aux evenements

### Presences (`/attendance`)
- Vue globale des presences par evenement
- Taux de presence par joueur

### Reunions parents (`/meetings`)
- Planification avec agenda
- Signature numerique des participants
- Compte-rendu

### Adversaires (`/adversaires`)
- Base de donnees des adversaires

### Championnats (`/championship`)
- Classements avec import FFF/DOFA
- Calendrier et resultats

### Tournois (`/tournament`)
- Gestion de tournois (matchs multiples, planning)

### Playlist Locker Room
- Les joueurs ajoutent des liens musicaux avant les matchs/entrainements
- Lie aux evenements

### Equipement / parametre
- Settings equipe (`/settings/team`) : couleurs, logo, banniere
- Settings perso (`/settings`) : profil, mot de passe
- Visibilite des onglets par equipe (tab_visibility)
