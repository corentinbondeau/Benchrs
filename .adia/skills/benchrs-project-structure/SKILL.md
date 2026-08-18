---
name: benchrs-project-structure
description: Structure du projet Benchrs (Next.js 16 + Supabase)
generated_by: init_project
generated_at: 2026-08-18
project: benchrs
---

## Objectif
Naviguer rapidement dans la structure du projet Benchrs.

## Structure
```
src/
├── app/
│   ├── (auth)/         # Auth pages (login, register, join, create-team)
│   ├── (dashboard)/    # 32 dashboard pages (ALL "use client")
│   │   ├── layout.tsx  # AuthProvider → TeamProvider → TeamGuard → Shell
│   │   ├── page.tsx    # Dashboard home (role-based widgets)
│   │   ├── calendar/   matches/ trainings/ chat/ roster/ stats/
│   │   ├── tactics/    settings/ physical/ challenge/ season/
│   │   └── club/       gallery/ championship/ tournament/ ...
│   ├── api/            # 50+ Route Handlers (auth, notif, AI, exports)
│   ├── c/[slug]/       # Public club page
│   ├── live/[eventId]/ # Public live match tracker
│   └── layout.tsx      # Root layout (ThemeProvider, Toaster, InstallPrompt)
├── components/
│   ├── dashboard/      # 9 dashboard widgets (useQueryCache)
│   ├── layout/         # Sidebar, TopBar, BottomNav
│   ├── match/          # Ratings, MVP, reports, poster
│   ├── training/       # SessionFiche, ExerciseSchematic, RPE
│   ├── stats/          # PlayerProfile, CoachStats, PersonalGoals
│   ├── ui/             # 20 shadcn/ui primitives
│   └── ...             # EventDetail, LiveMatchTracker, etc.
├── lib/
│   ├── supabase/       # client.ts (browser), server.ts, admin.ts
│   ├── auth.tsx        # AuthProvider (useAuth)
│   ├── team.tsx        # TeamProvider (useTeam)
│   ├── queryCache.ts   # useQueryCache (30s TTL in-memory)
│   ├── api-client.ts   # authFetch (Bearer token)
│   ├── api-auth.ts     # Server-side auth helpers
│   ├── training/       # AI generator, PDF, phases
│   └── ...             # players, chat, clubs, push, etc.
└── types/index.ts      # ALL types (923 lines)
```

## Conventions
- Path alias: `@/*` → `./src/*`
- Pages: `"use client"` + data in `useEffect` via `createClient().from()`
- Coach-gating: `userRole === "coach" || userRole === "owner"`
- API routes: `getAuthUser(request)` + team scoping
