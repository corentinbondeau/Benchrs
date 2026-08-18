# Architecture technique

## Vue d'ensemble

Benchrs est une application **Next.js 16** utilisant l'App Router avec **Supabase** comme backend (PostgreSQL + Auth + Realtime + Storage). L'application est deployee sur **Vercel** et utilise **Ollama (IA locale)** pour la generation de contenu.

```
┌─────────────────────────────────────────────────────────┐
│                     Client (Browser)                     │
│  Next.js App Router (React 19, TypeScript, Tailwind v4) │
│  ┌──────────┐ ┌───────────┐ ┌─────────────────────────┐ │
│  │ (auth)   │ │(dashboard)│ │ Pages publiques          │ │
│  │ login    │ │ 40+ pages │ │ /c/[slug], /live/[id]    │ │
│  │ register │ │ useAuth() │ │ (anonyme)                │ │
│  └──────────┘ │ useTeam() │ └─────────────────────────┘ │
│               └───────────┘                              │
└────────────────────┬────────────────────────────────────┘
                     │ Supabase Client (browser)
                     │ API Routes (fetch)
                     ▼
┌─────────────────────────────────────────────────────────┐
│                    Next.js Server                        │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ API Routes (src/app/api/) — 59 endpoints            │ │
│  │ getAuthUser() → JWT verification                    │ │
│  │ Supabase Admin Client (service role key)            │ │
│  │ Ollama (generation IA locale)                        │ │
│  │ @react-pdf/renderer (exports PDF)                   │ │
│  │ web-push + nodemailer (notifications)               │ │
│  └─────────────────────────────────────────────────────┘ │
└────────────────────┬────────────────────────────────────┘
                     │ Supabase Client (server/admin)
                     ▼
┌─────────────────────────────────────────────────────────┐
│                      Supabase                            │
│  ┌──────────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐ │
│  │ PostgreSQL   │ │ Auth     │ │Realtime│ │ Storage  │ │
│  │ 60+ tables   │ │ JWT      │ │WebSocket│ │ Fichiers │ │
│  │ 100+ RLS     │ │ Cookies  │ │ Chat   │ │ Galerie  │ │
│  │ 76 migrations│ │          │ │ Live   │ │          │ │
│  └──────────────┘ └──────────┘ └────────┘ └──────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Flux d'authentification

```
1. Login (email/password)
   └─→ Supabase Auth (signInWithPassword)
       └─→ JWT token stocke en cookie (httpOnly)

2. Chaque requete API :
   └─→ getAuthUser(req) extrait le JWT du cookie
       └─→ Verification via Supabase
           └─→ Retourne { id, email } ou 401

3. Requetes Supabase cote client :
   └─→ createBrowserClient() utilise le cookie automatiquement
       └─→ RLS policies appliquees via auth.uid()
```

### Trois niveaux d'authentification

| Fonction | Usage | Retour |
|----------|-------|--------|
| `getAuthUser(req)` | Auth simple | `{ id, email }` ou `null` |
| `getAuthUserDetailed(req)` | Auth + raison de rejet | `{ user, reason? }` |
| `rateLimit(key, limit, window)` | Protection anti-abus | `true/false` |

## Organisation des routes

### Groupes de pages

| Groupe | Path | Layout | Auth |
|--------|------|--------|------|
| `(auth)` | `/login`, `/register`, `/join`, ... | Layout minimal | Non |
| `(dashboard)` | `/`, `/calendar`, `/stats`, ... | Sidebar + TopBar | Oui |
| Pages publiques | `/c/[slug]`, `/live/[eventId]` | Aucun | Non |

### Pattern des pages dashboard

Toutes les pages dashboard suivent le meme pattern (voir `club/terrains/page.tsx`) :

```typescript
"use client";

import { useAuth } from "@/lib/auth-context";
import { useTeam } from "@/lib/team-context";

export default function MaPage() {
  const { user } = useAuth();
  const { currentTeam } = useTeam();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async (userId: string) => {
    const supabase = createBrowserClient();
    const { data } = await supabase
      .from("ma_table")
      .select("*")
      .eq("team_id", currentTeam?.id);
    setData(data || []);
    setLoading(false);
  }, [currentTeam]);

  useEffect(() => {
    if (user?.id) loadData(user.id);
  }, [user, loadData]);

  // ... render avec Dialog shadcn, Calendar, etc.
}
```

### Pattern des API routes

```typescript
import { getAuthUser, getAuthUserDetailed } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const auth = await getAuthUserDetailed(req);
  if (!auth.user) return Response.json({ error: auth.reason }, { status: 401 });

  const body = await req.json();
  const supabase = createAdminClient(); // bypass RLS

  // ... logique metier
  return Response.json({ ok: true });
}
```

## Clients Supabase

| Client | Fichier | Usage | RLS |
|--------|---------|-------|-----|
| **Browser** | `lib/supabase/client.ts` | Pages "use client" | Oui (via cookie JWT) |
| **Server** | `lib/supabase/server.ts` | Server Components, middleware | Oui (via cookie) |
| **Admin** | `lib/supabase/admin.ts` | API routes (service role key) | Non (bypass) |

**Regle :** Utiliser le client **Admin** uniquement dans les API routes pour les operations qui necessitent un bypass RLS (suppression en cascade, operations cross-team, etc.).

## Services IA (Ollama)

Tous les generateurs IA utilisent `callAI()` (via `src/lib/ai/`, modele configurable via `AI_MODEL`, defaut `llama3.1:8b`) et sont dans `src/lib/` :

| Generateur | Fichier | Fonction |
|------------|---------|----------|
| Fiches d'entrainement | `training/ai-generator.ts` | Genere exercices structures |
| Defis hebdomadaires | `challenges/ai-generator.ts` | Defi adapte au niveau |
| Annonces/convocations | `announcements/ai-generator.ts` | Textes personnalises |
| Bilans de saison | `season/ai-generator.ts` | Analyse statistique IA |
| Bilans trimestriels | API route directe | Evaluation par joueur |
| Newsletters | API route directe | Resume mensuel |
| Voeux de fin de saison | API route directe | Message personnalise par joueur |
| Storybooks | API route directe | Recit narratif de la saison |
| Plans de saison | API route directe | Planification macro |

## Notifications

Trois canaux de notification :

| Canal | Technologie | Declencheur |
|-------|-------------|-------------|
| **In-app** | Table `notifications` + Supabase Realtime | API `POST /api/notifications/send` |
| **Web Push** | `web-push` npm | Meme API route |
| **Email** | `nodemailer` (SMTP) | `POST /api/auth/forgot-password`, cron |
| **Cron** | Vercel Cron Jobs | Rappels veille, digest hebdo, alertes echeances |

### Types de notifications (21 types)

`convocation`, `message`, `rappel`, `physical`, `match_retour`, `match_report`, `terrain_impraticable`, `reunion`, `cagnotte`, `recuperation`, `newsletter`, `suspension`, `match_checklist`, `tournament`, `on_est_parti`, `match_live`, `voeux`, et plus.

## Securite

### Row Level Security (RLS)

100+ policies RLS sur toutes les tables. Patterns :

- **SELECT** : `team_id IN (SELECT user_visible_team_ids())` — inclut la visibilite comite
- **INSERT/UPDATE/DELETE** : `is_team_coach(team_id)` pour les tables gerees par les coachs
- **Self-managed** : `auth.uid() = user_id` pour les donnees personnelles

### Fonctions SQL utilitaires

| Fonction | Role |
|----------|------|
| `user_club_ids()` | IDs des clubs dont l'utilisateur est membre (comite) |
| `user_visible_team_ids()` | IDs des equipes visibles (equipe + equipes du meme club si comite) |
| `is_team_coach(team_id)` | Verifie si l'utilisateur est coach/owner de l'equipe |
| `is_team_owner(team_id)` | Verifie si l'utilisateur est owner de l'equipe |
| `is_club_president(club_id)` | Verifie si l'utilisateur est president du club |

### Headers de securite (next.config.ts)

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `HSTS` : max-age 2 ans, includeSubDomains, preload
- **CSP** stricte : connect-src limite a `*.supabase.co`, `api.open-meteo.com`, `nominatim.openstreetmap.org`

### Rate limiting

Les endpoints sensibles (auth, notifications) sont proteges par `rateLimit()` :

```typescript
const limited = await rateLimit(`register:${ip}`, 5, 60_000); // 5 req/min
if (limited) return Response.json({ error: "Too many requests" }, { status: 429 });
```

## PWA

- **Manifest** : `public/manifest.json` avec icones, theme_color, display standalone
- **Service Worker** : Cache des assets statiques, mode offline (`/offline`)
- **Install Prompt** : Composant `InstallPrompt` qui propose l'installation sur mobile
