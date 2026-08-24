# Fragment — calendar
> Genere par @init_project le 2026-08-24
> Derniere mise a jour : 2026-08-24
> Module path : src/app/(dashboard)/calendar/ + src/lib/calendar/

## Responsabilite
Calendrier des events (matchs + entrainements) avec export ICS et sync webcal.

## Fichiers cles
| Fichier | Role |
|---------|------|
| (dashboard)/calendar/page.tsx | Page calendrier (28 commits — hot zone) |
| api/calendar/ics/route.ts | GET — export ICS du calendrier |
| api/calendar/url/route.ts | GET — URL webcal pour sync externe |
| lib/calendar/ics.ts | Helpers ICS (escapeIcsText, toIcsDate, buildIcsCalendar) |

## Points d'attention
- Le calendrier est une des pages les plus modifiees (28 commits)
- Sync ICS via cron Vercel `/api/sporteasy/ical-cron` a 6h UTC
