# Fragment — trainings
> Genere par @init_project le 2026-08-24
> Derniere mise a jour : 2026-08-24
> Module path : src/app/(dashboard)/trainings/ + src/lib/training/

## Responsabilite
Entrainements : fiches de seance (manuelles ou generees par IA Mistral), exercices, schemas tactiques, templates, export PDF.

## Fichiers cles
| Fichier | Role |
|---------|------|
| (dashboard)/trainings/[id]/page.tsx | Page detail entrainement |
| api/trainings/generate/route.ts | POST — generation fiche IA |
| api/trainings/pdf/route.ts | GET — export PDF de la fiche |
| lib/training/ai-generator.ts | Prompt Mistral + parsing reponse |
| lib/training/pdf.tsx | React-PDF rendering |
| lib/training/exercises.ts | DRILL_TYPES constants |
| lib/training/phases.ts | Phases tactiques |
| components/training/SessionFiche.tsx | Composant fiche de seance |

## Points d'attention
- Les fiches IA utilisent Mistral (MISTRAL_API_KEY requis)
- Les schemas d'exercice sont un format custom (ExerciseSchematic dans types)
- Visibilite : "coach" (prive) ou "team" (visible par les joueurs)
