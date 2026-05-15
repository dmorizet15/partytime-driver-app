# Party Kong v3 — True Per-Level Scenes (scope)

**Status:** Not started. Drafted 2026-05-16.

**Goal:** Replace Party Kong's reskin-only level system (same DK zigzag, four backdrops) with four genuinely different stages, modeled on the four classic Donkey Kong arcade boards, themed for PartyTime.

---

## Current state (as of 2026-05-16)

After v1 (May 15, commit `5d919f9`) + v2 (May 16, commit `81b49e9`), Party Kong has:

- One module-level `PLATFORMS` array (5 platforms in DK zigzag)
- One module-level `LADDERS` array (4 ladders)
- One module-level `WIN_X = 265` (right side of P4)
- One module-level `PLAYER_START_X / Y`
- One fixed Tent Kong position (top-left P4)
- Per-level variation only in: `bg` (visual theme), `throwIntervalStart`/`Min` (Kong throw speed), `hasDollies` (chair stack dollies present)

The "four levels" are visually different and slightly mechanically different (dollies from L2, faster Kong each level) but climbing path is identical across all four.

---

## The four stages — themed mapping

| Stage | DK '81 analogue | Layout shape | Core mechanic | Win condition | Hazard types |
|---|---|---|---|---|---|
| **L1 Warehouse Floor** | Barrels (25m) | Existing 5-platform zigzag | Climb ladders, dodge rolls | Reach signed contract (top-right P4) | Rolling banquet tables (current) |
| **L2 Loading Dock** | Conveyors (50m) | 4 flat platforms, fewer ladders, 2 conveyor segments | Conveyor belts push ±horizontal vx; walking with belt = fast, against = slow | Reach an open truck bay at the top | Sliding pallets along belts, swinging cargo straps |
| **L3 Outdoor Tent Setup** | Elevators (75m) | Staggered small platforms with vertical "tent-pole" elevators between them | Ride moving tent poles up; mistimed jump = fall through to a lower platform | Reach Kong's perch on the top tent | Stakes falling from offscreen-top, periodic wind gusts that push horizontally |
| **L4 Grand Ballroom** | Rivets (100m) | 4 flat platforms wide, no ladders (chains in place), no Kong-throw zigzag | Pull 4 chandelier chains by holding ↑ on each (~1000ms with progress bar). All 4 pulled → chandeliers drop on Kong → win | All 4 chains pulled → multi-stage win sequence | Faster Kong throws + glass shards spawning during chain pulls |

---

## Phased plan

### Session A — Foundation refactor (~2–3 hours, no user-visible change)

**Goal:** Move geometry + hazards behind a per-level config without changing how L1 plays.

**Touches:**
- Promote `PLATFORMS`, `LADDERS`, `WIN_X`, player spawn, Kong position → fields on `LevelConfig`
- Generalize `RollingTable[]` + `ChairDolly[]` into one `Hazard[]` with a discriminated-union `type`:
  - `'rolling_table'` (current behavior)
  - `'dolly'` (current behavior)
  - `'conveyor_pallet'` (Session B)
  - `'wind_gust'` (Session C)
  - `'falling_stake'` (Session C)
  - `'glass_shard'` (Session D)
- Generalize win check to a `winCondition(state): boolean` function in `LevelConfig`
- L1 still produces a byte-identical play experience

**Risk:** This is the highest-risk session because a bug here breaks all four stages simultaneously. Plan a careful build-and-play loop before moving on.

**Ships:** Functionally identical game. Safe to push to prod as a regression-only checkpoint.

---

### Session B — L2 conveyor stage (~3 hours)

**Goal:** L2 plays differently from L1.

**Touches:**
- New `PLATFORMS_L2` (4 flat platforms, no slopes)
- New `LADDERS_L2` (fewer ladders; some platforms are reached only via conveyor)
- New platform attribute `conveyor?: { dir: -1 | 1; speed: number }` — applied at the platform level
- Player physics: when on a platform with `conveyor`, add `conveyor.dir * conveyor.speed` to `p.vx` each frame
- New `Hazard` type `'conveyor_pallet'` — rectangular sliding pallet that travels at conveyor speed; rectangular silhouette (vs round tables)
- New win condition: reach a designated "open truck bay" rect on the top platform
- Visual: animated conveyor strip drawn on top of platform tiles (cycling chevrons or rolling drum slats)

**Risk:** Conveyor + jump physics is a classic edge case. Budget time for: jumping off a conveyor preserves the conveyor vx (or not? design choice). Walking onto a conveyor while jumping. Conveyor at the edge of a platform.

**Ships:** Two playable, visibly different stages (L1 + L2).

---

### Session C — L3 elevator stage (~3 hours)

**Goal:** L3 plays differently from L1 and L2.

**Touches:**
- New `PLATFORMS_L3` (4–5 small staggered platforms at varied heights)
- Replace ladders with "tent-pole elevators" — vertical moving objects that the player can stand on top of and ride up. New entity type or extension of `Hazard`.
- Elevator behavior: cycles between two y-values at constant speed; player on top gets carried; player adjacent gets blocked
- New `Hazard` type `'falling_stake'` — spawns at offscreen-top at random x (within platform-region columns), falls under gravity, despawns at floor
- New `Hazard` type `'wind_gust'` — periodic (every ~8s), all players on platforms get a horizontal nudge for ~1s with a visual streak overlay
- New win condition: reach Kong's perch (top platform)

**Risk:** Elevator boarding/dismounting feels janky if collision is sloppy. Plan a forgiving snap zone (player y within X of elevator top → ride). Wind gust must be telegraphed visually so it doesn't feel unfair.

**Ships:** Three stages.

---

### Session D — L4 rivet/chain-pull stage (~4 hours, most complex)

**Goal:** Finale board. Player wins the game.

**Touches:**
- New `PLATFORMS_L4` (4 wide flat platforms, no zigzag)
- No `LADDERS_L4` — climb is replaced by 4 chain-pull stations placed on alternating sides of the four platforms
- New entity: `ChainStation { x: number; platformIdx: number; pullProgress: 0..1; pulled: boolean }`
- Interaction: player stands within X of a chain station and holds ↑ → `pullProgress` advances at a fixed rate; reaches 1.0 → `pulled = true`; releasing ↑ early aborts (back to 0)
- UI: progress bar above the chain handle when pulling. Pulled chains visually replaced with a hanging-broken-chain silhouette.
- Win condition: all 4 chains pulled
- Win sequence: chandeliers drop in order (200ms apart), Kong's "TENT KONG" label flashes, "YOU WON" overlay
- New `Hazard` type `'glass_shard'` — spawns occasionally during chain pulls; rectangular fast-falling shard with collision

**Risk:** The chain-pull interaction needs to feel discoverable. Plan:
- Visible handle on each station (gold rope dangling from the ceiling)
- "HOLD ↑ TO PULL" hint when player is in range, similar to the existing ladder hint
- Progress bar visible during the pull
- Audio: distinct chain-pulling sfx (creak sweep)

**Ships:** All four stages. Full game.

---

## What's out of scope (would be a v4)

- Persisted level unlocks per user (Supabase row tracking cleared-levels)
- Stage-select on the start screen (today: forced L1→L4 sequence)
- Distinct chiptune music per stage (sfx engine supports it; the composition itself is a separate effort)
- Boss patterns — Kong's behavior stays roughly identical, just throws faster on later stages
- Local high-scores per stage (today only aggregate `game_scores` row)
- Per-stage achievement badges

---

## Estimating effort

Roughly: each new stage is 30–40% of a fresh game's worth of work. Total = ~2× the current Party Kong codebase.

Current `PartyKongGame.tsx`: ~1,750 lines (after v2).

After v3, expect ~3,200–3,500 lines, OR a split into multiple files (level-specific draw/physics modules + shared engine). Single-file works at ~3,500; beyond that, splitting becomes worth the indirection cost.

**Note:** If we split `PartyKongGame.tsx` into multiple files, do it in Session A as part of the foundation refactor — splitting later means revisiting all the per-level wiring.

---

## Pre-flight checklist before starting Session A

- [ ] Confirm the four-stage mapping above is the right product direction (vs. e.g., a stage editor, or a roguelike layout)
- [ ] Decide single-file vs. multi-file Party Kong (recommend: stay single-file unless line count crosses ~3,500)
- [ ] Decide if any v3 stage warrants its own Supabase table (probably no — `game_scores` already records aggregate score)
- [ ] Decide if Tent Kong's visual changes per stage (e.g., on L4 he wears a tuxedo, sits on a throne)

---

## File index (for future sessions)

- `src/components/arcade/PartyKongGame.tsx` — single component holding everything
- `src/app/training/arcade/party-kong/page.tsx` — auth gate
- `src/components/arcade/ArcadeHub.tsx` — tile entry (already live)
- `src/hooks/arcade/useGameScore.ts` — `game_type: 'party_kong'` (no change needed for v3)
- `src/hooks/arcade/useGameLeaderboard.ts` — shared leaderboard (no change needed for v3)

No new Supabase migrations expected.
