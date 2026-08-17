# Résumé Technique - Import DOFA

## Architecture

### Flow utilisateur
```
User clique "Import auto FFF"
    ↓
Dialog s'ouvre avec 2 options de recherche
    ↓
Option A: Recherche par nom (autocomplete)
  - Requête API quand user tape
  - Affichage des suggestions
  - Sélection d'un club
    ↓
Option B: Recherche par numéro FFF
  - Validation du format (1-6 chiffres)
  - Requête API au clic du bouton "Chercher"
    ↓
Affichage des équipes du club
    ↓
User sélectionne une équipe
    ↓
Clic "Importer" → Création du championnat + Import des données DOFA
```

## Composants impliqués

### Frontend (`src/app/(dashboard)/championship/page.tsx`)
- **Dialog**: Composant UI pour la sélection club/équipe
- **States**:
  - `clubSearch`: Terme recherché
  - `clubSuggestions`: Liste de suggestions (autocomplete)
  - `foundTeams`: Équipes trouvées
  - `selectedClub`: Club sélectionné
  - `selectedTeam`: Équipe sélectionnée
  - `searching`: État de chargement
  - `searchError`: Message d'erreur
  - `teamsLoading`: Chargement des équipes

### Backend (`src/app/api/championships/dofa/route.ts`)
- **Endpoint**: `POST /api/championships/dofa`
- **Paramètres**:
  - `fffNumber`: Numéro FFF du club (optionnel)
  - `clubName`: Nom du club (optionnel)
  - `type`: "all" | "calendar" | "results" | "equipes"
- **Réponse**:
  ```typescript
  {
    equipes: { eqNo: string; libelle: string }[]
    matches?: ScrapedMatch[]
    standings?: ChampionshipTeam[]
  }
  ```

## API DOFA

### Endpoint utilisé
```
POST /api/championships/dofa
Content-Type: application/json

{
  "fffNumber": "525816",        // Numéro FFF du club
  "clubName": "Monaco",          // OU nom du club
  "type": "all"                  // calendar, results, equipes, ou all
}
```

### Formats de réponse acceptés
L'API gère plusieurs formats grâce à la détection flexible:
- `{ equipes: [...] }` ✓
- `{ data: [...] }` ✓
- `[...]` (tableau direct) ✓

### Champs d'équipe acceptés
- `eqNo`, `id`, `numEq` → Team ID
- `libelle`, `name`, `equipe` → Team name

## Fonctions principales

### `handleClubNameChange(value: string)`
- **Déclencheur**: Quand l'utilisateur tape dans le champ de recherche par nom
- **Comportement**:
  - Appel API si valeur >= 2 caractères
  - Récupère et affiche les suggestions
  - Gère les erreurs silencieusement
  - Ré-initialise les états appropriés

### `handleSelectClubFromSuggestions(club)`
- **Déclencheur**: Clic sur une suggestion
- **Comportement**:
  - Marque le club comme sélectionné
  - Appelle `handleSearchTeamsForClub()` automatiquement
  - Affiche le message de confirmation

### `handleSearchTeamsForClub(club)`
- **Déclencheur**: Après sélection d'un club
- **Comportement**:
  - Récupère les équipes du club
  - Affiche les résultats
  - Auto-sélectionne si une seule équipe
  - Gère les erreurs avec affichage détaillé

### `handleSearchClub()`
- **Déclencheur**: Clic du bouton "Chercher" (recherche par numéro FFF)
- **Comportement**:
  - Valide le format (1-6 chiffres)
  - Appel API avec le numéro FFF
  - Affichage des équipes
  - Gestion d'erreurs spécifique par code HTTP

### `handleImportTeam()`
- **Déclencheur**: Clic "Importer"
- **Comportement**:
  - Crée un championnat
  - Importe les données DOFA (matchs, classement)
  - Redirection vers la page du championnat

## Gestion des erreurs

### Erreurs Input
| Erreur | Code | Message |
|--------|------|---------|
| Vide | - | "Entrez un numéro FFF valide (6 chiffres)" |
| Avec lettres | - | "Numéro FFF invalide. Entrez 1 à 6 chiffres" |

### Erreurs API
| Code | Message |
|------|---------|
| 400 | "Numéro FFF non valide" |
| 404 | "Club non trouvé avec ce numéro FFF" |
| 502/503 | "Service FFF indisponible. Réessayez plus tard" |
| Format invalide | "Format de données non valide" |

### Erreurs Réseau
| Erreur | Message |
|--------|---------|
| TypeError | "Erreur de connexion. Vérifiez votre Internet" |
| SyntaxError | "Réponse invalide du serveur" |
| Exception | Message d'erreur spécifique |

## UI States

### État 1: Recherche par nom (défaut)
```
┌─────────────────────────────┐
│ Rechercher le club par nom  │
│ ┌─────────────────────────┐ │
│ │ Tapez le nom du club... │ │  ← Input
│ │ [Loading spinner]       │ │  ← Si searching
│ │ [Suggestions list]      │ │  ← Si suggestions
│ └─────────────────────────┘ │
│                             │
│ ─── Ou ───                  │
│                             │
│ Rechercher par numéro FFF   │
│ ┌─────────────┬──────────┐ │
│ │ 525816      │ Chercher │ │  ← Input + Button
│ │ [Error msg] │          │ │  ← Si erreur
│ └─────────────┴──────────┘ │
└─────────────────────────────┘
```

### État 2: Club sélectionné
```
┌─────────────────────────────┐
│ ✓ Club sélectionné          │
│ AS Monaco                   │  ← Green box
│ [Changer de club]           │  ← Button
│                             │
│ Sélectionner une équipe     │
│ ┌─────────────────────────┐ │
│ │ [Loading skeleton]      │ │  ← Si teamsLoading
│ │ [Error message]         │ │  ← Si erreur
│ │ ┌─────────────────────┐ │ │
│ │ │ AS Monaco (Ligue 1) │ │ │  ← Équipe
│ │ │ ID: 525816A         │ │ │
│ │ ├─────────────────────┤ │ │
│ │ │ AS Monaco B         │ │ │
│ │ │ ID: 525816B     ✓   │ │ │  ← Sélectionnée
│ │ └─────────────────────┘ │ │
│ └─────────────────────────┘ │
│                             │
│ [Annuler]  [Importer]       │
└─────────────────────────────┘
```

## Tests

Voir `DOFA_DEBUGGING.md` et `DOFA_USER_GUIDE.md` pour les procédures de test.

### Tests à effectuer quand l'API est disponible
- [ ] Autocomplete avec suggestions
- [ ] Recherche par numéro FFF
- [ ] Gestion d'erreurs (400, 404, 502, 503)
- [ ] Formats de réponse variés
- [ ] Équipes multiples
- [ ] Import du championnat
- [ ] Mise à jour du classement

## Données de test (Mode mock)

Voir `src/lib/dofa-mock-data.ts` pour les données de test en développement.

## Performance

- **Autocomplete**: Débounce recommandé si requis (actuellement: requête à chaque frappe)
- **Pagination**: Limitée à 10 suggestions max
- **Caching**: À implémenter si besoin

## Dépendances

- `next/navigation`: Redirection après import
- `react`: État et hooks
- `sonner`: Notifications toast
- `lucide-react`: Icônes (Loader2, Zap)
- `@/lib/api-client`: Requêtes authentifiées

## Fichiers impliqués

```
src/
├── app/
│   ├── (dashboard)/
│   │   └── championship/
│   │       └── page.tsx          ← UI principale
│   └── api/
│       └── championships/
│           └── dofa/
│               └── route.ts      ← Backend API
├── lib/
│   └── dofa-mock-data.ts         ← Données de test
├── DOFA_DEBUGGING.md             ← Guide de debug
├── DOFA_USER_GUIDE.md            ← Guide utilisateur
└── DOFA_TECHNICAL_SUMMARY.md     ← Ce fichier
```

## Git History

- `39adf07`: Autocomplete UI improvement
- `661c0be`: Error messages and UX improvements
- `892e8dd`: Testing and debugging guides
- `d3daa28`: User guide for coaches

## Prochaines améliorations possibles

- [ ] Débounce pour l'autocomplete
- [ ] Caching des recherches
- [ ] Import en arrière-plan avec notification
- [ ] Synchronisation automatique des données
- [ ] Support des imports multiples en parallèle
- [ ] Historique des imports avec dates
- [ ] Sélection de la saison avant import
