# Fragment — types
> Genere par @init_project le 2026-08-24
> Derniere mise a jour : 2026-08-24
> Module path : src/types/

## Responsabilite
Definitions TypeScript de tous les modeles du domaine. Fichier unique `index.ts` (923 lignes).

## Types principaux (par domaine)
- **Auth** : User, Profile, UserRole, TeamMemberRole
- **Teams** : Team, TeamMember, Club, ClubMembership
- **Events** : Event, EventType, EventStatus, Attendance, AttendanceStatus
- **Stats** : MatchStat, MatchResult, MatchLineup, MatchEventRecord
- **Training** : TrainingSession, Exercise, ExerciseSchematic, TrainingTemplate
- **Chat** : ChatChannel, ChatMessage, ChatMember
- **Notifications** : Notification, PushSubscription
- **Physical** : PlayerPhysicalTest, FitnessRating, SessionRpe, SessionFeedback
- **Finance** : Cotisation, TreasuryTransaction, TeamPot, PotContribution
- **Misc** : Album, GalleryMedia, Task, MotmVote, TrophyItem, Championship, etc.

## Points d'attention
- Fichier tres modifie (28 commits) — chaque nouvelle feature ajoute des types
- Les types correspondent aux tables Supabase (colonnes mirrored)
- Pas de generation automatique depuis le schema Supabase (types manuels)
