# Fragment — season
> Genere par @init_project le 2026-08-24
> Derniere mise a jour : 2026-08-24
> Module path : src/lib/season/ + src/app/api/season/

## Responsabilite
Gestion de saison : statistiques aggregees, rapports IA (bilan, newsletter, storybook), voeux personnalises, copie de saison, plan de saison IA.

## Fichiers cles
| Fichier | Role |
|---------|------|
| lib/season/stats.ts | buildSeasonStatsContext — aggrege les stats d'une saison |
| lib/season/ai-generator.ts | Prompts Mistral pour newsletter, storybook, voeux |
| lib/seasonPlan.ts | generateSeasonPlan — plan de saison IA |
| lib/seasonReport.ts | fetchSeasonData — donnees pour le bilan |
| lib/seasonReportPdf.tsx | renderSeasonReportPdf — PDF du bilan |
| lib/quarterlyReport.ts | generateQuarterlyReports — bilans trimestriels IA |
| api/season/report/route.ts | POST — genere le rapport de saison |
| api/season/plan/route.ts | POST — genere le plan de saison |
| api/season/storybook/route.ts | POST — genere le storybook |
| api/season/greetings/route.ts | POST — genere les voeux |
| api/season/copy/route.ts | POST — copie les donnees de saison |

## Points d'attention
- Saison = annee scolaire (aout a juillet) : `currentSeasonLabel()` dans goals.ts
- Toutes les generations IA utilisent Mistral API
