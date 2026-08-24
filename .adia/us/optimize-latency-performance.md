# Context US — optimize-latency-performance

## Summary
Optimiser au maximum les temps de latence et d'attente de l'application Benchrs (PWA Next.js 16 / React 19 / Supabase). L'application doit être la plus fluide possible sans modifier les fonctionnalités.

## Modules impacted
- **lib-auth** — AuthProvider waterfall blocking
- **lib-team** — TeamProvider cascading queries
- **lib-queryCache** — In-memory cache, no persistence, aggressive TTL
- **components-dashboard** — 7+ widgets each fetching independently
- **components-layout** — Sidebar + BottomNav both rendered always, `<img>` tags
- **components-stats** — Synchronous recharts imports (~150KB gzip)
- **components-training** — Synchronous recharts import
- **app-dashboard** — 54/54 pages "use client", no server components, monolithic files

## Fragments to load
- `fragments/lib-auth.md`
- `fragments/lib-team.md`
- `fragments/lib-queryCache.md`
- `fragments/components-dashboard.md`
- `fragments/components-layout.md`
- `fragments/components-stats.md`
- `fragments/app-dashboard.md`

## Impacted files — Detailed Performance Analysis

---

### ZONE 1 — Provider waterfall (CRITICAL, ~2-4s latency on initial load)

#### 1.1 AuthProvider blocking cascade
- **File**: `src/lib/auth.tsx`
- **Lines**: 43-63 (init function)
- **Pattern**: Sequential `getSession()` → `fetchProfile()`. `loading` starts `true` (L:31), children don't render until BOTH complete.
- **Problem**: `fetchProfile` (L:35-40) uses `SELECT *` on profiles table — fetches all columns when only `first_name`, `last_name`, `avatar_url`, `role` are needed.
- **Impact**: ~300-600ms blocked (2 round-trips to Supabase)
- **Correction**:
  1. Use `Promise.all([getSession(), ...])` — impossible here since `fetchProfile` needs `userId` from session
  2. At minimum: replace `.select("*")` with `.select("id, first_name, last_name, avatar_url, role, is_active, team_id, birth_date")` — reduces payload ~40%
  3. Cache session + profile in `sessionStorage` for instant restore on return visits, fetch in background to refresh
  4. Set `loading = false` immediately if a cached session exists, then revalidate

#### 1.2 TeamProvider cascading queries
- **File**: `src/lib/team.tsx`
- **Lines**: 68-183 (loadTeams function)
- **Pattern**: Waits for `authLoading` to be false (L:186) THEN runs 2-4 sequential Supabase queries:
  1. L:71-74: `team_members` with join on `teams` + `clubs` (1st query)
  2. L:111-117: `club_members` + `clubs` by created_by (2 queries in Promise.all)
  3. L:134-137: `teams` by `club_id` IF user has club memberships (conditional 4th query)
- **Problem**: This ONLY runs AFTER AuthProvider completes. Total cascade: Auth(600ms) → Team(400-800ms) → UI renders
- **Impact**: ~400-800ms added ON TOP of AuthProvider
- **Correction**:
  1. Merge auth + team loading into a single parallel operation (or start team loading optimistically with cached userId)
  2. Cache teams in `localStorage` → show stale data immediately, refresh in background
  3. `switchTeam()` (L:197-208) currently calls `loadTeams()` which re-fetches EVERYTHING — should just update local state since teams are already loaded

#### 1.3 TeamGuard blocks rendering
- **File**: `src/components/team-guard.tsx`
- **Lines**: 17-23
- **Pattern**: Returns a full-screen "Chargement..." text while `loading === true`
- **Impact**: The ENTIRE dashboard tree is blocked until both Auth + Team providers finish. User sees empty screen for 1-2s.
- **Correction**: Show the shell (sidebar, topbar) immediately with skeleton states; only guard the page content

---

### ZONE 2 — Dashboard widget waterfall (HIGH, ~500-1500ms after providers)

#### 2.1 Coach dashboard: 7 independent widgets, each with own fetch
- **File**: `src/app/(dashboard)/page.tsx`
- **Lines**: 62-116
- **Pattern**: `NextEventCard`, `PendingConvocations`, `CoachWeekOverview`, `QuickStats`, `RecentResults`, `NewsFeed`, `SeasonSummary` — each component independently calls `useQueryCache` which fires a Supabase fetch on mount.
- **Problem**: All 7 widgets fire on mount after providers resolve. No batching. No shared query. Total: 10-15 Supabase round-trips.
- **Impact**: ~500-1500ms of parallel-but-numerous queries, each waiting for JS to mount the component first
- **Correction**:
  1. Create a single `dashboardLoader` that fetches ALL widget data in one parallel `Promise.all()`, then passes down via props or a DashboardDataProvider
  2. Alternatively: convert dashboard to a Server Component that fetches data SSR

#### 2.2 CoachWeekOverview: 2-pass fetch (6 queries)
- **File**: `src/components/dashboard/CoachWeekOverview.tsx`
- **Lines**: 61-179
- **Pattern**: First pass (L:68-89): `events` + `injuries` + `challenge` in Promise.all. Second pass (L:95-116): `match_availability` + `session_rpe` + `challenge_submissions` in Promise.all (depends on first pass results).
- **Impact**: 2 sequential Promise.all rounds = 2 network round-trips minimum within a single widget
- **Correction**: Use a Supabase RPC/view to aggregate this data in a single query, or restructure to avoid the dependency between passes

#### 2.3 PendingConvocations: 4+ queries
- **File**: `src/components/dashboard/PendingConvocations.tsx`
- **Lines**: 44-76
- **Pattern**: Coach path: `attendances` + `profiles` + `parent_student` in Promise.all (L:49-65), THEN `profiles` for parents (L:72-75) — second round depends on first.
- **Impact**: 2 sequential rounds of queries
- **Correction**: Join attendances with profiles in a single Supabase query with `.select("*, profile:profiles(*)")`

#### 2.4 ParentDashboard: sequential chain of 4-5 queries
- **File**: `src/components/dashboard/ParentDashboard.tsx`
- **Lines**: 48-100
- **Pattern**: `parent_student` (L:60) → `profiles` (L:71) → `events` for training IDs (L:77) → then `Promise.all` of `nextEvent` + `attendances` + `convocations` (L:84-100). Each step depends on the previous.
- **Impact**: 4 sequential rounds, ~1-2s total
- **Correction**: Create a dedicated Supabase RPC or view for parent dashboard data

#### 2.5 PlayerDashboard: 2-pass fetch
- **File**: `src/components/dashboard/PlayerDashboard.tsx`
- **Lines**: 22-63
- **Pattern**: First fetches `events` for training IDs (L:26-31), THEN Promise.all of `attendances` + `match_stats` (L:33-47)
- **Impact**: 2 sequential rounds
- **Correction**: Same as above — batch or create a view

---

### ZONE 3 — Heavy synchronous imports (HIGH, ~200-400ms bundle parse time)

#### 3.1 recharts imported statically in 4 components
- **Files & Lines**:
  - `src/components/stats/PlayerProfile.tsx:30-42` — imports 12 recharts components
  - `src/components/stats/CoachStats.tsx:8-17` — imports 8 recharts components
  - `src/components/training/SessionRpe.tsx:10-18` — imports 7 recharts components
  - `src/app/(dashboard)/stats/compare/page.tsx:8-16` — imports 6 recharts components
- **Pattern**: Static top-level `import {...} from "recharts"` — library is ~150KB gzip, loaded in client bundle
- **Problem**: recharts is loaded even if user never visits stats/training pages, because Next.js may eagerly load routes
- **Impact**: ~150KB gzip added to the initial JS bundle; ~200-400ms parse time on mobile
- **Correction**:
  1. Wrap each recharts-dependent component in `next/dynamic(() => import(...), { ssr: false })` 
  2. Or create a `<ChartWrapper>` component that lazy-loads recharts only when needed

#### 3.2 framer-motion: dead dependency
- **File**: `package.json`
- **Pattern**: `"framer-motion": "^12.42.2"` in dependencies but ZERO imports in the codebase
- **Impact**: Not included in bundle (tree-shaking handles it) but wastes ~15MB disk in node_modules and slows `npm install`
- **Correction**: Remove from `package.json`

#### 3.3 html-to-image: statically imported
- **Files**:
  - `src/components/match/MatchPoster.tsx:4`
  - `src/components/stats/PlayerPaniniCard.tsx:4`
- **Pattern**: Static `import { toPng } from "html-to-image"` — loaded even if user doesn't generate a poster
- **Correction**: Use `const { toPng } = await import("html-to-image")` only in the click handler

---

### ZONE 4 — Images not optimized (MEDIUM, ~100-300ms per image)

#### 4.1 `<img>` instead of `next/image` — 23 occurrences
- **Files** (key ones):
  - `src/components/layout/TopBar.tsx:36,38,50,71` — team logos, user avatar
  - `src/components/layout/Sidebar.tsx:319,328,476` — app logo, team logo, user avatar
  - `src/components/layout/BottomNav.tsx:172,186` — app logo, team logo
  - `src/app/(auth)/login/page.tsx:55` — favicon
  - `src/app/(auth)/register/page.tsx:316,571` — favicon
  - `src/app/(dashboard)/carpooling/page.tsx:245,375` — avatars
  - `src/app/(dashboard)/gallery/page.tsx:651` — gallery lightbox
  - `src/app/(dashboard)/fin-saison/page.tsx:371` — photos
- **Problem**: Native `<img>` tags bypass Next.js image optimization: no lazy loading by default, no responsive sizes, no WebP conversion, no blur placeholder
- **Impact**: ~100-300ms per image load without optimization; mobile users download full-size images
- **Correction**: Replace with `<Image>` from `next/image`. Config already has `remotePatterns` for `*.supabase.co`.
- **Note**: The app logo (`/logo.svg`) and favicon (`/favicon.png`) are local static assets — can use `<Image>` with `priority` for above-the-fold.

---

### ZONE 5 — Cache strategy problems (MEDIUM, impacts navigation fluidity)

#### 5.1 useQueryCache: 30s TTL, in-memory only
- **File**: `src/lib/queryCache.ts`
- **Lines**: 10-14
- **Pattern**: `const cache = new Map<string, CacheEntry<unknown>>()` — lost on any page navigation. `DEFAULT_TTL = 30_000` (30 seconds).
- **Problem**:
  - Navigate away → come back: ALL data is re-fetched (cache was in-memory, lost when component unmounted)
  - 30s TTL is too aggressive for data that rarely changes (team info, profiles, completed match results)
  - No `stale-while-revalidate`: either shows cached data OR loading spinner, never both
  - Failed fetches are NOT cached (L:114-115) — errors trigger immediate retry loops
- **Impact**: Every navigation within the app triggers full data refetch, defeating the purpose of the cache
- **Correction**:
  1. Add `sessionStorage`/`localStorage` persistence layer to survive navigations
  2. Implement stale-while-revalidate: show stale data immediately, update in background
  3. Use differentiated TTLs: 5min for profiles/teams, 1min for events, 30s for realtime data
  4. Cache errors with a short TTL (5s) to prevent retry storms

---

### ZONE 6 — `SELECT *` everywhere (MEDIUM, cumulative ~200-500ms)

#### 6.1 95 occurrences of `.select("*")` across the codebase
- **Key files** (worst impact on critical path):
  - `src/lib/auth.tsx:37` — profile fetch on EVERY auth check
  - `src/components/dashboard/NextEventCard.tsx:19` — next event
  - `src/components/dashboard/RecentResults.tsx:20` — 10 recent matches
  - `src/components/dashboard/PendingConvocations.tsx:58,74` — attendances + profiles
  - `src/components/dashboard/ParentDashboard.tsx:73,87` — profiles + events
  - `src/components/dashboard/NewsFeed.tsx:21` — events
  - `src/app/(dashboard)/calendar/page.tsx:170` — calendar events
  - `src/app/(dashboard)/roster/page.tsx:49` — team members
  - `src/app/(dashboard)/tactics/page.tsx:132,137` — multiple tables
- **Problem**: `SELECT *` fetches all columns including large text/JSON fields (notes, descriptions, settings) that aren't rendered. Over 95 queries, this adds significant payload.
- **Impact**: Each `SELECT *` transfers ~30-100% more data than needed; cumulative: ~200-500ms of unnecessary network transfer
- **Correction**: Replace with explicit column lists: `.select("id, title, event_date, type, status, opponent, score_us, score_them")` etc.

---

### ZONE 7 — Monolithic page files (MEDIUM, impacts code-splitting)

#### 7.1 Giant page components prevent effective code-splitting
- **Files & LOC**:
  - `src/app/(dashboard)/settings/team/page.tsx` — **2014 LOC** (invites, colors, ICS, committee, all in one)
  - `src/app/(dashboard)/tactics/page.tsx` — **1809 LOC** (formation builder + AI generation + exercises)
  - `src/app/(dashboard)/championship/page.tsx` — **1231 LOC** (DOFA integration)
  - `src/app/(dashboard)/matches/[id]/page.tsx` — **1252 LOC** (attendance, ratings, MVP, report, live tracker)
  - `src/components/stats/PlayerProfile.tsx` — **1171 LOC** (charts, stats, profile, all in one)
  - `src/components/LiveMatchTracker.tsx` — **1079 LOC** (realtime match tracking)
- **Problem**: All code is in a single "use client" file — no way for Next.js to code-split sub-features. User loads ALL 2014 lines of settings/team even if they only want to change team color.
- **Impact**: Larger JS bundle per route; longer parse time on mobile
- **Correction**: Split into sub-components using `next/dynamic` for tab content / dialog content. E.g., `settings/team` → `TeamInvites` + `TeamColors` + `TeamICS` + `TeamCommittee`, each lazy-loaded.

---

### ZONE 8 — Layout & navigation inefficiencies (LOW-MEDIUM)

#### 8.1 Sidebar + BottomNav always rendered
- **File**: `src/app/(dashboard)/layout.tsx:24,32`
- **Pattern**: Both `<Sidebar />` and `<BottomNav />` are always in the DOM (Sidebar hidden on mobile via CSS `hidden lg:flex`, BottomNav hidden on desktop via CSS `lg:hidden`)
- **Problem**: Both components (549 LOC + 429 LOC) mount, run hooks (`useChatUnread`, `useTeam`, `useAuth`), and maintain state even when invisible. `useChatUnread` starts a realtime Supabase subscription in BOTH.
- **Impact**: 2x hooks, 2x subscriptions, 2x re-renders on context changes
- **Correction**: Use `next/dynamic` with `ssr: false` + a viewport-aware hook to mount only the relevant nav component

#### 8.2 `force-dynamic` prevents any caching
- **File**: `src/app/(dashboard)/layout.tsx:10`
- **Pattern**: `export const dynamic = "force-dynamic"` — forces every page to be server-rendered on every request
- **Problem**: Even the layout shell (HTML structure, CSS) is re-rendered every time — no static optimization possible
- **Correction**: Remove `force-dynamic`. Since auth is handled client-side via AuthProvider, the layout itself has no server data dependencies. The layout can be statically generated.

#### 8.3 No `React.memo` anywhere
- **Pattern**: Zero `React.memo` usage in the entire `src/components/` directory
- **Problem**: Context changes (auth, team) trigger re-renders that cascade through ALL children. Every `useAuth()` or `useTeam()` consumer re-renders when ANY value in those contexts changes, even unrelated values.
- **Correction**: 
  1. Split context values: separate `AuthProvider` into `AuthUserProvider` (user object) and `AuthLoadingProvider` (loading boolean)
  2. Wrap expensive child components in `React.memo`
  3. Use `useSyncExternalStore` or split useTeam into finer selectors

---

### ZONE 9 — Missing optimizations (LOW)

#### 9.1 No prefetching
- **Pattern**: No `<Link prefetch>`, no `router.prefetch()` anywhere
- **Impact**: Every navigation triggers a full page load from scratch
- **Correction**: Add `prefetch` on frequently navigated routes (dashboard → matches, trainings)

#### 9.2 No Suspense boundaries
- **Pattern**: Zero `<Suspense>` usage in the entire app
- **Impact**: No streaming SSR, no progressive rendering
- **Correction**: Wrap data-dependent sections in `<Suspense>` with skeleton fallbacks

---

## Propagation (indirect impact)
- Modifying **lib-auth** affects every authenticated page (AuthProvider wraps dashboard layout)
- Modifying **lib-team** affects every dashboard feature (TeamProvider wraps dashboard layout)
- Modifying **lib-queryCache** affects 9+ dashboard widgets and every page using it
- Modifying **components-layout** changes the app shell for all pages
- Any change to the provider cascade impacts ALL 54 pages

## Hot Zones (impacted files that are also hot-zones)
| File | Commits (30d) | Risk |
|------|--------------|------|
| `src/app/(dashboard)/tactics/page.tsx` | 47 | Highest: most modified + 1809 LOC monolith |
| `src/app/(dashboard)/calendar/page.tsx` | 46 | High: frequently modified + SELECT * |
| `src/components/layout/Sidebar.tsx` | 45 | High: frequently modified + dual rendering |
| `src/components/layout/BottomNav.tsx` | 37 | High: same dual rendering issue |
| `src/app/(dashboard)/matches/[id]/page.tsx` | 35 | High: 1252 LOC monolith |
| `src/components/stats/PlayerProfile.tsx` | 27 | High: 1171 LOC + synchronous recharts |

## Critical Zones
1. **Provider cascade is the #1 bottleneck**: Auth(600ms) → Team(800ms) → Widgets(1000ms) = ~2.4s minimum before content
2. **Zero Server Components**: the entire app pays the cost of JS download + parse + hydrate before any data fetch starts
3. **95x SELECT * queries**: each transferring 30-100% more data than needed
4. **No memoization**: context changes cause full tree re-renders
5. **recharts bundle**: 150KB gzip loaded eagerly even if user never visits stats pages

## Relevant Skills
- `benchrs-performance-audit` — detailed audit procedure and optimization axes
- `benchrs-project-structure` — project structure reference
- `benchrs-code-coverage` — test coverage context

## External Dependencies
- **Supabase** — PostgreSQL backend, all data flows through it (key optimization target for query reduction)
- **recharts** — charting library (~150KB gzip), candidate for lazy loading
- **framer-motion** — dead dependency, never imported, should be removed
- **html-to-image** — used in 2 components, should be dynamically imported
- **@react-pdf/renderer** — server-side only (API routes), OK as-is

## Priority Matrix

| Priority | Zone | Impact | Effort | Quick Win? |
|----------|------|--------|--------|------------|
| P0 | Provider cascade (Zone 1) | -1.5s latency | Medium | No |
| P0 | Remove force-dynamic (Zone 8.2) | Layout caching | Low | Yes |
| P0 | Remove framer-motion (Zone 3.2) | npm install speed | Low | Yes |
| P1 | Dashboard data batching (Zone 2) | -0.5-1s latency | Medium | No |
| P1 | Lazy-load recharts (Zone 3.1) | -150KB bundle | Low | Yes |
| P1 | Dynamic import html-to-image (Zone 3.3) | -15KB bundle | Low | Yes |
| P2 | Replace `<img>` with next/image (Zone 4) | Better LCP | Medium | Partial |
| P2 | QueryCache persistence (Zone 5) | Navigation fluidity | Medium | No |
| P2 | SELECT * → explicit columns (Zone 6) | -200-500ms cumulative | High | Partial |
| P3 | Split monolithic pages (Zone 7) | Code-splitting | High | No |
| P3 | Conditional nav rendering (Zone 8.1) | -2x hooks/subscriptions | Medium | No |
| P3 | React.memo / context splitting (Zone 8.3) | Fewer re-renders | High | No |
| P4 | Prefetching + Suspense (Zone 9) | Progressive UX | Medium | No |
