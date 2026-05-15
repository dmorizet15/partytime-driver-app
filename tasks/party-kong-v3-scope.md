# Party Kong v3 — Per-Level Scenes Scope

## Shape of the work

Four true stages mapped to classic Donkey Kong arcade, themed for PartyTime:

### L1 — Warehouse Floor (DK: Barrels / 25m)
- Layout: Existing DK zigzag, 5 platforms
- Mechanic: Walk + climb
- Win condition: Reach signed contract (top-right P4)
- Hazards: Rolling banquet tables

### L2 — Loading Dock (DK: Conveyors / 50m)
- Layout: 4 flat horizontal platforms, fewer ladders, 2 conveyor segments
- Mechanic: Belts push player horizontal velocity; walking against = slow, with = fast
- Win condition: Reach truck bay at top
- Hazards: Sliding pallets, swinging cargo straps

### L3 — Outdoor Tent Setup (DK: Elevators / 75m)
- Layout: Vertical tent-pole elevators between staggered small platforms
- Mechanic: Ride moving tent poles up; mistimed = fall
- Win condition: Reach Kong's perch on top tent
- Hazards: Stakes falling from above, wind gusts pushing player horizontally every ~8s

### L4 — Grand Ballroom (DK: Rivets / 100m)
- Layout: 4 wide flat platforms, no zigzag, no ladders
- Mechanic: Pull 4 chandelier chains (stand on each + hold up for ~1000ms)
- Win condition: All 4 chains pulled → chandeliers drop on Kong → game won
- Hazards: Kong throws faster, falling glass shards on partial chain pulls

## Session plan

- Session A: Foundation refactor. LevelConfig architecture. L1 byte-identical. Zero visible changes.
- Session B: L2 conveyor stage.
- Session C: L3 elevator stage.
- Session D: L4 chain-pull finale.

## Risks

1. L4 chain-pull feedback must be prominent — visible progress bar from anywhere on platform.
2. Conveyor + jump physics is the hardest edge case. Budget extra time Session B.
3. Foundation refactor must be 100% backward-compatible or all stages break.

## Status

- [x] Session A — Foundation refactor (shipped 2026-05-16)
- [ ] Session B — L2 conveyor stage
- [ ] Session C — L3 elevator stage
- [ ] Session D — L4 chain-pull finale
