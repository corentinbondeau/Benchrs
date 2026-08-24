# History — Benchrs
> Genere par @init_project le 2026-08-24 — Projet Benchrs
> Derniere mise a jour : 2026-08-24

| US_KEY | Date | Resume | Modules impactes |
|--------|------|--------|-----------------|
| fix-auto-convocations | 2026-08-24 | Bug convocations auto : file bloquée (notifs sans souscription jamais marquées delivered), timeout cron probable (895 lignes séquentielles), convocations "auto" en fait planifiées manuellement | notifications, lib-notifications, events-matches |
| fix-auto-convocations (done) | 2026-08-24 | Extraction deliver-notifications + auto-convocations, architecture "delivery first", Vitest + 14 tests unitaires, suppression traces Ingress | notifications, lib-notifications, deliver-notifications, auto-convocations |
| fix-presence-poll-count | 2026-08-24 | Bug sondage présence match : le dénominateur du ratio dispo affiche le nombre de réponses au lieu du total de joueurs (ex: "2/2" au lieu de "2/18") + .maybeSingle() incorrect sur query multi-lignes | components-dashboard (CoachWeekOverview), hooks (use-dashboard-data) |
