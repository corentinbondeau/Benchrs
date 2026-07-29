<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Sportplus — Agent Memory

## Objective
Build a mobile-first football team management app (Sportplus) with Supabase backend.

## Important Details
- Roster page links player cards to `/stats/[playerId]` (shows PlayerProfile component)
- Convocations: coach attendance status editing uses DropdownMenu with DropdownMenuItem (not controlled Select) to avoid base-ui controlled component bug; optimistic update with setEvents + fetchData for sync
- Chat page had duplicate views on desktop — fixed by wrapping mobile section in `md:hidden`
- Tactics: "Phase" select replaces free-text title (5 fixed options); not required; objectives are phase-specific checkbox multi-select (max 2) using `PHASE_OBJECTIVES` constant; objectives stored as array via `selectedObjectives` state
- FeuilletMatchTab completely rewritten: removed create/list/detail modes, shows only pitch with present players (attendances with status="present"), auto-arranged by position (goalkeeper/defender/midfielder/forward rows)
- `createClient()` called inline (no useMemo) — acceptable pattern

## Completed
- Roster: linked player cards to `/stats/[playerId]`
- Convocations: added updateAttendanceStatus with optimistic update + DropdownMenu (plain onClick items)
- Chat: hid mobile view on desktop with `md:hidden` wrapper
- Tactics: replaced title Input with Phase Select (5 options, optional)
- Tactics: replaced free-text objectives with phase-specific checkbox multi-select (max 2)
- FeuilletMatchTab: rewritten to show only pitch + present players from attendances for selected match
- Seed script `insert_ecc_u14.sql` created (14 players for ECC U14)
- Cleaned up unused types (`Formation`, `MatchLineup`) and `FORMATION_POSITIONS` constant from tactics page
- Fixed type error in FeuilletMatchTab Profile cast (`as unknown as Profile | null`)
