# Context US — fix-presence-poll-count

## Résumé de l'US
Le widget de sondage de présence (disponibilités avant match) sur le dashboard coach affiche un ratio "X/Y" incorrect — le dénominateur (`total`) représente le nombre de **réponses** reçues au lieu du nombre **total de joueurs** de l'équipe. Par exemple "2/2 dispo" alors que l'équipe a 18 joueurs et que seuls 2 ont répondu.

## Cause racine identifiée

### Problème principal — `CoachWeekOverview.tsx` (lignes 118-125, 271)

La query `match_availability` retourne une ligne par **réponse** de joueur. Le code accumule `total` en incrémentant de 1 par ligne retournée :

```typescript
// CoachWeekOverview.tsx lignes 118-124
const availByEvent = new Map<string, { dispo: number; total: number }>();
for (const r of (availRows.data || []) as { event_id: string; availability: string }[]) {
  const a = availByEvent.get(r.event_id) ?? { dispo: 0, total: 0 };
  a.total += 1;        // ← total = nombre de RÉPONSES, PAS nombre de joueurs
  if (r.availability === "dispo") a.dispo += 1;
  availByEvent.set(r.event_id, a);
}
```

Puis ligne 271 :
```tsx
<span>{a.dispo}/{a.total} dispo</span>
```

**Résultat** : si 2 joueurs répondent "dispo" sur un effectif de 18, l'affichage montre "2/2 dispo" (ratio trompeur) au lieu de "2/18 dispo" ou "2 dispo (2 réponses sur 18)".

### Problème secondaire — `use-dashboard-data.ts` (lignes 235-242)

Même logique de comptage défectueuse dans le hook `fetchWeekOverview()` :

```typescript
// use-dashboard-data.ts lignes 235-241
const availByEvent = new Map<string, { dispo: number; total: number }>();
for (const r of availRows) {
  const a = availByEvent.get(r.event_id) ?? { dispo: 0, total: 0 };
  a.total += 1;        // ← même bug
  if (r.availability === "dispo") a.dispo += 1;
  availByEvent.set(r.event_id, a);
}
```

De plus, la query utilise `.maybeSingle()` (ligne 212) au lieu de récupérer un array, ce qui est incorrect pour une table qui retourne N lignes (une par joueur). Quand il y a 2+ réponses, `maybeSingle()` retourne une erreur Supabase (`PGRST116`), et la data est perdue.

### Composant correct à titre de référence — `MatchAvailabilityCard.tsx`

Le composant de la page de détail du match fait le calcul **correctement** (lignes 154-158) :

```typescript
const total = players.length;  // ← nombre TOTAL de joueurs de l'équipe
const dispo = players.filter((p) => responses[p.id] === "dispo").length;
const pasDispo = players.filter((p) => responses[p.id] === "pas_dispo").length;
const incertain = players.filter((p) => responses[p.id] === "incertain").length;
const answered = dispo + pasDispo + incertain;
```

Et l'affichage à la ligne 246 :
```tsx
{answered}/{total} joueur{answered > 1 ? "s" : ""} ont répondu
```

## Modules impactés
- **components-dashboard** — `CoachWeekOverview.tsx` (affichage du ratio)
- **hooks** — `use-dashboard-data.ts` (calcul des données + query `.maybeSingle()`)

## Fragments à charger
- `fragments/components-dashboard.md`
- `fragments/events-matches.md`

## Fichiers impactés
| Fichier | Justification |
|---------|---------------|
| `src/components/dashboard/CoachWeekOverview.tsx` (lignes 95-125, 252-277) | **BUG PRINCIPAL** — le calcul de `total` dans `availByEvent` et l'affichage `{a.dispo}/{a.total}` |
| `src/hooks/use-dashboard-data.ts` (lignes 205-242) | **BUG SECONDAIRE** — même logique de comptage + utilisation incorrecte de `.maybeSingle()` sur une query multi-lignes |
| `src/__tests__/hooks/use-dashboard-data.test.tsx` (ligne 73) | Le mock `availability: [{ eventId: "event-001", dispo: 14, total: 18 }]` utilise `total: 18` qui correspond au nombre de joueurs, pas au nombre de réponses — confirme que le mock est correct mais le code réel ne calcule pas `total` de la même façon |
| `src/lib/players.ts` | Pas à modifier, mais à utiliser — `countTeamActivePlayers(teamId)` ou `fetchTeamActivePlayers(teamId)` pour obtenir le vrai nombre de joueurs |

## Propagation (impact indirect)
- Le type `WeekOverview.availability` (`{ eventId: string; dispo: number; total: number }[]`) est défini dans `use-dashboard-data.ts` ET dans `CoachWeekOverview.tsx` — la sémantique de `total` doit être alignée partout
- Le test `use-dashboard-data.test.tsx` mock `total: 18` (nombre de joueurs) — les tests devront être vérifiés après le fix

## Zones chaudes
- `src/app/(dashboard)/matches/[id]/page.tsx` — 29 commits, hot zone, mais **pas impacté** par ce bug (utilise `MatchAvailabilityCard` qui est correct)

## Zones critiques
1. **Sémantique de `total`** : `CoachWeekOverview` et `use-dashboard-data` calculent `total = nombre de réponses`, mais le composant correct (`MatchAvailabilityCard`) utilise `total = nombre de joueurs`. Il faut aligner.
2. **`.maybeSingle()` dans `use-dashboard-data.ts`** (ligne 212) : Supabase `.maybeSingle()` retourne une erreur si la query a plus d'un résultat. C'est incorrect pour `match_availability` qui peut avoir N lignes. À remplacer par une query standard (sans `.maybeSingle()`).
3. **Performance** : Le fix nécessite un appel supplémentaire à `countTeamActivePlayers()` ou un count de `team_members` pour obtenir le total réel de joueurs. Il faut éviter un waterfall — l'appel doit être parallélisé avec les queries existantes.

## Approche de correction recommandée

### Pour `CoachWeekOverview.tsx`
1. Ajouter une query pour récupérer le nombre total de joueurs actifs (`countTeamActivePlayers(teamId)` ou count de `team_members`)
2. Remplacer `a.total` (nombre de réponses) par `totalPlayers` (nombre de joueurs)
3. Ajouter `answered` (nombre de réponses) pour un affichage plus informatif
4. Modifier l'affichage : `{a.dispo}/{totalPlayers} dispo ({answered} réponses)` ou `{a.dispo} dispo · {answered}/{totalPlayers} ont répondu`

### Pour `use-dashboard-data.ts`
1. Retirer `.maybeSingle()` de la query `match_availability` (ligne 212) — utiliser la query standard pour récupérer un array
2. Ajouter le count des joueurs actifs dans le `Promise.all` (paralléliser)
3. Recalculer `total` comme le nombre de joueurs, pas le nombre de réponses

## Skills pertinents
- `benchrs-test-runner` — pour exécuter les tests après le fix
- `benchrs-project-structure` — pour comprendre l'organisation des composants

## Dépendances externes
- **Supabase** — tables `match_availability`, `team_members`, `profiles`
- `src/lib/players.ts` — `fetchTeamActivePlayers()` / `countTeamActivePlayers()` existants
