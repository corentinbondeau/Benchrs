# Benchrs - Vue d'ensemble du projet

## 📋 1. STRUCTURE GÉNÉRALE DU PROJET

### Framework & Technologies
- **Framework** : Next.js 16 (App Router)
- **Langage** : TypeScript 5
- **UI** : Tailwind CSS 4 + shadcn/ui
- **Base de données** : Supabase (PostgreSQL + Realtime)
- **Authentification** : NextAuth.js v5 (JWT)
- **Déploiement** : Vercel
- **Générateurs IA** : Mistral AI

### Architecture monorepo
```
/home/cb19/dev_perso/Benchrs/
├── src/
│   ├── app/                 # Pages Next.js (App Router)
│   ├── components/          # Composants React réutilisables
│   ├── lib/                 # Logique métier et utilitaires
│   └── types/               # Définitions TypeScript
├── supabase/
│   └── migrations/          # Migrations de la BD (77 fichiers)
├── public/                  # Fichiers statiques
└── e2e/                     # Tests e2e (Playwright)
```

### Dépôt Git
```
Git Remote: git@gitlab.tech.orange:botmanproject/agent-auto-dev/agent_developpeur.git
Localisation: /home/cb19/dev_perso/Benchrs/
```

---

## 🏆 2. ONGLET "CHAMPIONNAT"

### Localisation
```
Frontend: /home/cb19/dev_perso/Benchrs/src/app/(dashboard)/championship/page.tsx
API: /home/cb19/dev_perso/Benchrs/src/app/api/championships/
Types: /home/cb19/dev_perso/Benchrs/src/types/index.ts (interface Championship)
```

### Fonctionnalités principales
- **Créer un championnat** : Form avec name, season, level
- **Scraper les classements** : À partir de l'URL FFF (fédération)
  - Récupère : points, matchs joués, victoires, nuls, défaites, buts pour/contre
- **Importer le calendrier** : Scrape les matchs depuis FFF
- **Télécharger le PDF** : Export des standings

### Structure de données
```typescript
interface Championship {
  id: string;
  name: string;
  season: string;           // Ex: "2025-2026"
  level: string | null;
  teams: ChampionshipTeam[];
}

interface ChampionshipTeam {
  id: string;
  team_name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  points: number;
}
```

### Permissions
- ✅ **Coachs et Owner** : Créer, importer, télécharger
- 📖 **Joueurs et Parents** : Lecture seule

---

## 📝 3. ONGLET "FEUILLE DE MATCH"

### Localisation
```
Frontend: /home/cb19/dev_perso/Benchrs/src/app/(dashboard)/matches/[id]/feuille/page.tsx
Types: /home/cb19/dev_perso/Benchrs/src/types/index.ts (interface Formation, Event)
```

### Fonctionnalités principales
- **Éditer les officiels** : Árbitro, délégué
- **Gérer la composition** : Joueurs titulaires vs remplaçants
- **Positionnement sur le terrain** : Drag-and-drop formation (x, y)
- **Désigner le capitaine** : Captain ID
- **Vue formation visuelle** : Affiche le positionnement des joueurs
- **Sauvegarder** : Persiste les données de formation

### Structure de données
```typescript
interface LineupEntry {
  id: string;
  player_id: string;
  position_label: string | null;
  is_starter: boolean;
  profile?: {
    id: string;
    first_name: string;
    last_name: string;
    shirt_number: number | null;
    position: string | null;
  };
}

interface FormationData {
  positions: Array<{
    player_id: string;
    x: number;
    y: number;
    label: string;
  }>;
  captain_id?: string;
}
```

### Permissions
- ✅ **Coachs et Owner** : Édition complète
- 📖 **Joueurs** : Lecture seule

---

## 👥 4. ONGLET "RÉUNION PARENTS" (MEETINGS)

### Localisation
```
Frontend: /home/cb19/dev_perso/Benchrs/src/app/(dashboard)/meetings/page.tsx
API: /home/cb19/dev_perso/Benchrs/src/app/api/meetings/ (si existant)
Types: /home/cb19/dev_perso/Benchrs/src/types/index.ts (ParentMeeting, MeetingSignature)
Composant: /home/cb19/dev_perso/Benchrs/src/components/meetings/SignaturePad.tsx
```

### Fonctionnalités principales
- **Créer une réunion parents** : Title, description, date, lieu
- **Ajouter un ordre du jour** : Items à discuter
- **Écrire le compte-rendu** : Ajouter des "minutes" (notes)
- **Signature numérique** : Signature Pad pour valider la présence
- **Notifier les parents** : Envoyer des notifications
- **Modifier le statut** : Update de la réunion

### Structure de données
```typescript
interface ParentMeeting {
  id: string;
  team_id: string;
  title: string;
  description: string | null;
  meeting_date: string | null;
  location: string | null;
  created_by: string | null;
  created_at: string;
}

interface MeetingSignature {
  id: string;
  meeting_id: string;
  team_id: string;
  user_id: string;
  signature_data: string | null;  // Canvas drawing
  signed_at: string;
}
```

### Permissions
- ✅ **Coachs et Owner** : Créer, éditer, modifier minutes
- 📖 **Parents** : Voir les réunions, signer

---

## 💰 5. ONGLET "CAGNOTTE"

### Localisation
```
Frontend: /home/cb19/dev_perso/Benchrs/src/app/(dashboard)/cagnotte/page.tsx
API: /home/cb19/dev_perso/Benchrs/src/app/api/treasury/ (cohérent avec "treasury")
Types: /home/cb19/dev_perso/Benchrs/src/types/index.ts (TeamPot, PotContribution)
```

### Fonctionnalités principales
- **Créer une cagnotte** : Title, description, objectif (€)
- **Ajouter des contributions** : Amount, donneur, méthode (cash/bank/app)
- **Ajouter un message** : Note du contributeur
- **Supprimer une cagnotte** : Admin seulement
- **Suivi du total** : Calcul automatique
- **Notifications** : Alerter les contributeurs

### Structure de données
```typescript
interface TeamPot {
  id: string;
  team_id: string;
  title: string;
  description: string | null;
  goal_amount: number | null;
  created_by: string | null;
  created_at: string;
}

interface PotContribution {
  id: string;
  pot_id: string;
  team_id: string;
  contributor_name: string | null;
  amount: number;
  method: "cash" | "bank" | "app";
  message: string | null;
  created_at: string;
}
```

### Permissions
- ✅ **Coachs et Owner** : Créer/supprimer pots, valider contributions
- 📝 **Joueurs et Parents** : Ajouter des contributions

---

## 🤖 6. GÉNÉRATEURS IA

### Aperçu
Trois générateurs IA utilisent **Mistral API** pour générer du contenu :

### A. GÉNÉRATEUR D'ANNONCES

**Localisation**
```
API Route: /home/cb19/dev_perso/Benchrs/src/app/api/announcements/generate/route.ts
AI Logic: /home/cb19/dev_perso/Benchrs/src/lib/announcements/ai-generator.ts
Frontend: Intégré dans l'éditeur d'annonces
```

**Types de génération**
- **Convocation** : Annonce pour un événement (match/entraînement)
- **Info** : Annonce générale à l'équipe

**Paramètres**
```typescript
type AnnouncementType = "convocation" | "info";
type AnnouncementAudience = "joueurs" | "parents";
type AnnouncementTone = "motivant" | "sobre" | "chaleureux";

interface AnnouncementContext {
  type: AnnouncementType;
  audience: AnnouncementAudience;    // Cible du message
  tone: AnnouncementTone;             // Style
  event: AnnouncementEventContext | null;  // Contexte événement
  topic: string;                      // Sujet si info
  points: string[];                   // Points à inclure
    // Disponibles: "horaire", "equipement", "reponse", "covoiturage", "lieu"
}
```

**Flux**
1. Coach sélectionne type/audience/ton
2. Optionnel : sélectionne un événement pour convocation
3. Ajoute des points spécifiques
4. API appelle Mistral → génère texte français prêt à envoyer

**Authentification**
- ✅ Coachs et Owner uniquement (checked via `isTeamCoach`)

---

### B. GÉNÉRATEUR DE DÉFIS HEBDOMADAIRES

**Localisation**
```
API Route: /home/cb19/dev_perso/Benchrs/src/app/api/challenges/generate/route.ts
AI Logic: /home/cb19/dev_perso/Benchrs/src/lib/challenges/ai-generator.ts
Frontend: /home/cb19/dev_perso/Benchrs/src/app/(dashboard)/challenge/page.tsx
```

**Type de contenu généré**
```typescript
interface WeeklyChallenge {
  title: string;              // Max 5 mots, accrocheur
  description: string;        // 3 phrases, ~250 caractères
  difficulty: ChallengeDifficulty;
}

type ChallengeDifficulty = "facile" | "moyen" | "difficile";
```

**Exemple**
```json
{
  "title": "Le jongleur fou",
  "description": "Réussis 10 jonglages en 30 secondes. Valide avec une vidéo et gagne des points !",
  "difficulty": "moyen"
}
```

**Flux**
1. Coach sélectionne la difficulté
2. API appelle Mistral avec contexte
3. Mistral retourne JSON parsé
4. Défi stocké dans `weekly_challenges` (upsert par team_id + week_start)

**Authentification**
- ✅ Coachs et Owner uniquement

---

### C. GÉNÉRATEUR DE SÉANCES D'ENTRAÎNEMENT

**Localisation**
```
API Route: /home/cb19/dev_perso/Benchrs/src/app/api/trainings/generate/route.ts
AI Logic: /home/cb19/dev_perso/Benchrs/src/lib/training/ai-generator.ts (430 lignes)
Phases: /home/cb19/dev_perso/Benchrs/src/lib/training/phases.ts
PDF: /home/cb19/dev_perso/Benchrs/src/lib/training/pdf.tsx (29 KB)
Frontend: /home/cb19/dev_perso/Benchrs/src/app/(dashboard)/trainings/generate/page.tsx
```

**Paramètres d'entrée**
```typescript
interface TrainingRequest {
  phase: string;              // Phase tactique (voir phases.ts)
  objectives: string[];       // 1-3 objectifs
  playerCount?: number;       // Nombre de joueurs
  systeme?: string;          // "4-3-3" | "4-2-3-1" | "4-4-2" | "3-5-2" | "5-3-2"
  expertise: ExpertiseLevel;  // "BMF" | "BE" | "UEFA B" | "UEFA A"
  team_id: string;
}

type ExpertiseLevel = "BMF" | "BE" | "UEFA B" | "UEFA A";
```

**Output généré**
```typescript
interface AISession {
  title: string;                  // Nom de la séance
  phase: string;
  objective: string;              // Objectif général
  material: string;               // Équipement nécessaire
  totalDuration: number;          // 90 minutes
  sections: FicheSection[];        // 4 sections
  conseilsCoach: string[];        // Tips pour le coach
}

interface FicheSection {
  name: string;
  duration: number;               // Durée en minutes
  items: FicheBlock[];           // Exercices/jeux
  variants: string[];            // Variantes possibles
  schematic: Schematic | null;   // Schéma du terrain
  animation?: string;            // Animation type
}

type SchematicType = "pitch" | "zones" | "grid" | "circle" | "corridor" | "line" | "none";
```

**Niveaux de compétence coach**
- **BMF** : Jeunes/école de foot - simple, ludique
- **BE** : Amateurs/jeunes compétiteurs - structuré, progressif
- **UEFA B** : Haut niveau - détail méthodologique, principes avancés
- **UEFA A** : Très haut niveau - exigence élevée, concepts modernes

**Flux**
1. Coach sélectionne : phase, objectifs, nombre joueurs, système, expertise
2. Frontend appelle `/api/trainings/generate`
3. API construit prompt Mistral avec persona coach + règles
4. Mistral retourne JSON avec 4 sections de 90 min
5. `renderSessionPdf` génère un PDF lisible
6. Frontend affiche et permet téléchargement

**Authentification**
- ✅ Membres de l'équipe seulement (isTeamMember)

---

## 🔐 7. SYSTÈME DE PERMISSIONS/RÔLES

### Architecture d'authentification
```
/home/cb19/dev_perso/Benchrs/src/lib/auth.tsx          # Context Auth (client)
/home/cb19/dev_perso/Benchrs/src/lib/api-auth.ts       # Auth check (server/API)
```

### Types de rôles
```typescript
// Rôle utilisateur global
type UserRole = "coach" | "player" | "parent";

// Rôle au sein d'une équipe (plus granulaire)
type TeamMemberRole = "owner" | "coach" | "player" | "parent";
```

### Tables de base de données
```sql
-- Authentification Supabase (auth.users) + profils étendus
profiles {
  id: UUID (PK),
  role: UserRole,
  first_name, last_name,
  email_notifications,
  position, shirt_number,
  vma, vmi,
  licence_expires_at, medical_cert_expires_at,
  ...
}

-- Structure multi-équipe
clubs {
  id: UUID (PK),
  name: TEXT,
  logo_url: TEXT,
  created_by: UUID FK -> auth.users
}

teams {
  id: UUID (PK),
  club_id: UUID FK -> clubs,
  name: TEXT,
  invite_code: TEXT UNIQUE,
  ...
}

team_members {
  id: UUID (PK),
  team_id: UUID FK -> teams,
  user_id: UUID FK -> auth.users,
  role: TeamMemberRole ENUM,     ← CLEF : détermine les permissions
  UNIQUE(team_id, user_id)
}
```

### Fonctions d'authentification API

```typescript
// /home/cb19/dev_perso/Benchrs/src/lib/api-auth.ts

getAuthUser(req)
  → Extrait Bearer token du header Authorization
  → Retourne User Supabase ou null

getAuthUserDetailed(req)
  → Comme getAuthUser + détails d'erreur

getTeamRole(userId, teamId)
  → Récupère le rôle teamMemberRole
  → Retourne "owner" | "coach" | "player" | "parent" | null

isTeamCoach(userId, teamId)
  → Retourne true si role === "owner" || role === "coach"

isTeamMember(userId, teamId)
  → Retourne true si user existe dans team_members

getUserTeamIds(userId)
  → Retourne tous les team_id auquel l'user appartient
```

### Vérifications typiques dans les routes API

```typescript
// Exemple 1 : Coachs seulement
if (!(await isTeamCoach(user.id, teamId))) {
  return forbidden();  // 403
}

// Exemple 2 : Membres de l'équipe
if (!(await isTeamMember(user.id, teamId))) {
  return forbidden();
}

// Exemple 3 : Pas d'auth
if (!user) {
  return unauthorized(reason);  // 401
}
```

### Permissions par rôle (sur les pages)

```typescript
// Pattern utilisé partout dans le code
const { currentTeam, userRole } = useTeam();
const isCoach = userRole === "coach" || userRole === "owner";

// Affichage conditionnel
{isCoach && <AdminPanel />}
{(userRole === "player" || userRole === "parent") && <ViewOnlySection />}
```

### RLS (Row Level Security) - Supabase

Chaque table a une politique RLS :
```sql
-- Les utilisateurs ne voient que les données de leurs équipes
USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
```

---

## 📊 8. CONFIGURATION DES ONGLETS VISIBLES

### Fichier de configuration
```
/home/cb19/dev_perso/Benchrs/src/lib/tabs.ts
```

### Onglets disponibles
```typescript
const NAV_TABS = [
  { key: "stats", label: "Statistiques", href: "/stats" },
  { key: "physical", label: "Prépa physique", href: "/physical" },
  { key: "medical", label: "Infirmerie", href: "/medical" },
  { key: "carpooling", label: "Covoiturage", href: "/carpooling" },
  { key: "tasks", label: "Tâches", href: "/tasks" },
  { key: "polls", label: "Sondages", href: "/polls" },
  { key: "tactics", label: "Tactique", href: "/tactics" },
  { key: "season", label: "Plan de saison", href: "/season" },
  { key: "challenge", label: "Défi de la semaine", href: "/challenge" },
  { key: "gallery", label: "Galerie", href: "/gallery" },
  { key: "trophies", label: "Trophées", href: "/trophies" },
  { key: "championship", label: "Championnat", href: "/championship" },    ← PRÉSENT
  { key: "material", label: "Matériel", href: "/material" },
  { key: "adversaires", label: "Adversaires", href: "/adversaires" },
  { key: "compare", label: "Comparer", href: "/stats/compare" },
];
```

### Système de masquage par coach
```typescript
// Hook pour charger les onglets cachés
useHiddenTabs(teamId)
  → Récupère table team_tab_visibility
  → Retourne Set<string> des clés masquées

// Table BD
team_tab_visibility {
  id: UUID (PK),
  team_id: UUID FK,
  tab_key: TEXT,      // Ex: "championship", "cagnotte"
  visible: BOOLEAN,   // true = visible, false = caché
}
```

---

## 📡 9. ENDPOINTS API CLÉS

### Championnat
```
POST   /api/championships              # Créer
GET    /api/championships?team_id=X    # Lister
POST   /api/championships/fff          # Scraper FFF
GET    /api/championships/standings    # Standings détaillés
```

### Feuille de match
```
GET    /api/matches/[id]               # Détails match
GET    /api/formations?event_id=X      # Formation du match
POST   /api/formations                 # Sauvegarder formation
```

### Annonces (IA)
```
POST   /api/announcements/generate     # Générer une annonce
POST   /api/announcements              # Créer/sauvegarder
```

### Défis (IA)
```
POST   /api/challenges/generate        # Générer défi hebdo
```

### Entraînements (IA)
```
POST   /api/trainings/generate         # Générer séance PDF
```

### Réunions parents
```
POST   /api/meetings                   # Créer réunion
GET    /api/meetings?team_id=X         # Lister réunions
POST   /api/meetings/[id]/signatures   # Ajouter signature
```

### Cagnotte
```
POST   /api/treasury                   # Créer pot
GET    /api/treasury?team_id=X         # Lister pots
POST   /api/treasury/[id]/contributions # Ajouter contribution
```

---

## 🗄️ 10. STRUCTURE BASE DE DONNÉES CLÉS

### Migrations principales
```
/home/cb19/dev_perso/Benchrs/supabase/migrations/
├── 000_full_schema.sql              # Schéma initial
├── 004_multi_team.sql               # Support multi-équipe (clubs, teams, team_members)
├── 005_rls_team_scoped.sql          # Row Level Security
├── 006_team_colors.sql              # Couleurs équipes
├── 011_albums.sql                   # Galerie photos
├── 016_cotisations_payment_history.sql  # Cotisations
├── 017_vma_physical_prep.sql        # Prépa physique
├── 025_match_realtime.sql           # Realtime matchs
├── 035_training_sessions_fiche.sql  # Fiches d'entraînement
├── 058_team_branding.sql            # Branding équipe
├── 061_team_tab_visibility.sql      # Masquage onglets
├── 063_enrichment_feed_notebook.sql # Feed/notebook
└── ... (77 fichiers total)
```

---

## 🔍 11. POINTS CLÉS À RETENIR

### Pour ajouter une nouvelle fonctionnalité :

1. **Page UI** : `/src/app/(dashboard)/[feature]/page.tsx`
2. **API Route** : `/src/app/api/[feature]/route.ts`
3. **Logique métier** : `/src/lib/[feature]/...`
4. **Types** : Ajouter dans `/src/types/index.ts`
5. **Auth check** : Utiliser `getAuthUser` + `isTeamCoach` ou `isTeamMember`
6. **BD** : Créer migration dans `/supabase/migrations/NNN_feature.sql`
7. **Onglet** : Ajouter dans `/lib/tabs.ts` si navigable
8. **RLS** : Configurer dans la migration

### Pour générer avec IA :

1. Paramètres en POST `/api/[feature]/generate`
2. Appeler Mistral API avec `process.env.MISTRAL_API_KEY`
3. Parser la réponse (attention aux formats JSON)
4. Retourner le contenu généré au frontend
5. Frontend gère l'affichage/téléchargement

---

## 🚀 12. DÉMARRAGE RAPIDE

```bash
# Cloner (déjà fait)
cd /home/cb19/dev_perso/Benchrs

# Installation
npm install

# Variables d'env
cp .env.example .env.local
# Configurer: MISTRAL_API_KEY, Supabase credentials, NextAuth secret

# Lancer en dev
npm run dev   # http://localhost:3000

# Build & prod
npm run build
npm start

# Tests e2e
npx playwright test
```

---

**Dernière mise à jour** : 12 Août 2026
