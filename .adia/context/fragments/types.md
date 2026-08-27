# Fragment — types
> Genere par @init_project le 2026-08-24
> Derniere mise a jour : 2026-08-27 (fiche-joueur-composition)
> Module path : src/types/

## Responsabilite
Definitions TypeScript de tous les modeles du domaine. Fichier unique `index.ts` (923 lignes).

## Types principaux (par domaine)
- **Auth** : User, Profile, UserRole, TeamMemberRole
- **Teams** : Team, TeamMember, Club, ClubMembership
- **Events** : Event, EventType, EventStatus, Attendance, AttendanceStatus
- **Stats** : MatchStat, MatchResult, MatchLineup, MatchEventRecord
- **Tactique** : Formation, FormationData, PlayerPosition
- **Training** : TrainingSession, Exercise, ExerciseSchematic, TrainingTemplate
- **Chat** : ChatChannel, ChatMessage, ChatMember
- **Notifications** : Notification, PushSubscription
- **Physical** : PlayerPhysicalTest, FitnessRating, SessionRpe, SessionFeedback
- **Finance** : Cotisation, TreasuryTransaction, TeamPot, PotContribution
- **Misc** : Album, GalleryMedia, Task, MotmVote, TrophyItem, Championship, etc.

## FormationData unifie (2026-08-27, fiche-joueur-composition)
`FormationData` etait redeclare localement a 2 endroits avec des formes divergentes. Les **2 redeclarations locales ont ete supprimees** : `src/types/index.ts` est la source de verite unique.

```ts
export interface FormationData {
  positions: PlayerPosition[];
  bench?: (string | null)[];   // AJOUTE — ids joueurs du banc (slots R1..R5), null = place vide
  captain_id?: string | null;  // AJOUTE
}
```
- `bench` et `captain_id` sont **optionnels** : les enregistrements `formations.formation_data` anterieurs restent valides (retro-compatibilite).
- Consomme par `toMatchLineupRows` (`src/lib/lineup/toMatchLineups.ts`) et `LineupEditor`.
- Toute nouvelle cle doit rester optionnelle tant que les donnees existantes ne sont pas migrees.

## Points d'attention
- Fichier tres modifie (30 commits) — chaque nouvelle feature ajoute des types
- Les types correspondent aux tables Supabase (colonnes mirrored)
- Pas de generation automatique depuis le schema Supabase (types manuels)
