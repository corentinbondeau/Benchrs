# Fragment — lib-training
> Genere par @init_project le 2026-08-24
> Derniere mise a jour : 2026-08-24
> Module path : src/lib/training/

## Responsabilite
Generation IA de fiches d'entrainement, constantes de drill types/phases, export PDF.

## Fichiers cles
| Fichier | Role |
|---------|------|
| ai-generator.ts | generateSessionWithAI — prompt Mistral + parsing (370 lignes) |
| pdf.tsx | renderSessionPdf, renderManualSessionPdf — React-PDF |
| exercises.ts | DRILL_TYPES constant |
| phases.ts | TACTICAL_PHASES, TACTICAL_PHASE_NAMES |

## Points d'attention
- Le generateur IA accepte un contexte (systeme de jeu, niveau, effectif, cycle)
- Les exercices ont un schema visuel (ExerciseSchematic) type TacticalPad
- L'export PDF utilise @react-pdf/renderer (server-side)
