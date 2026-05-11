# Phase 2.1 — Gameplay fixes rollup gate

This document records the closure evidence for roll-up task `P2.1-400` / GitHub issue [#200](https://github.com/anry88/New-Universe/issues/200). Phase 2.1 is the post-P1/P1.1 gameplay correction pass: tutorial, localization, home-system discovery, resource production, building rules, premium rush, shell navigation, research scale, and realtime completion.

## Dependency and child status

Dependency `P1.1-300` is closed in GitHub issue [#151](https://github.com/anry88/New-Universe/issues/151).

As of 2026-05-11, all tracked Phase 2.1 child issues are closed:

| Task | GitHub issue | Scope |
|---|---:|---|
| `P2.1-401` | [#201](https://github.com/anry88/New-Universe/issues/201) | Tutorial steps, rewards, Continue behavior, ResourceBar layout |
| `P2.1-402` | [#202](https://github.com/anry88/New-Universe/issues/202) | EN/RU localization, profile language switch, Telegram language default |
| `P2.1-403` | [#203](https://github.com/anry88/New-Universe/issues/203) | Player system and planet naming |
| `P2.1-404` | [#204](https://github.com/anry88/New-Universe/issues/204) | Home-system biomes, starter slots, locked planets |
| `P2.1-405` | [#205](https://github.com/anry88/New-Universe/issues/205) | System-map fog and revealed areas |
| `P2.1-406` | [#206](https://github.com/anry88/New-Universe/issues/206) | Resource production chains including steel |
| `P2.1-407` | [#207](https://github.com/anry88/New-Universe/issues/207) | Online building completion and notifications |
| `P2.1-408` | [#208](https://github.com/anry88/New-Universe/issues/208) | Building demolition and 50% refund |
| `P2.1-409` | [#209](https://github.com/anry88/New-Universe/issues/209) | Building limits, prerequisites, blocked reasons |
| `P2.1-410` | [#210](https://github.com/anry88/New-Universe/issues/210) | Building duration curve and starter Command Center |
| `P2.1-411` | [#211](https://github.com/anry88/New-Universe/issues/211) | Planet-scoped building resource checks |
| `P2.1-412` | [#212](https://github.com/anry88/New-Universe/issues/212) | Building descriptions, outputs, storage and modifiers |
| `P2.1-413` | [#213](https://github.com/anry88/New-Universe/issues/213) | Per-planet ResourceBar and full resource list |
| `P2.1-414` | [#214](https://github.com/anry88/New-Universe/issues/214) | Diamonds balance and rush-build path |
| `P2.1-415` | [#215](https://github.com/anry88/New-Universe/issues/215) | Fixed bottom navigation and PlanetDetail queue placement |
| `P2.1-416` | [#216](https://github.com/anry88/New-Universe/issues/216) | Home vs Colonies routing and tab content |
| `P2.1-417` | [#217](https://github.com/anry88/New-Universe/issues/217) | 7 x 5 research tree scale and gated UX |
| `P2.1-418` | [#247](https://github.com/anry88/New-Universe/issues/247) | Realtime timers and online finalization for gameplay processes |

No Phase 2.1 child task is intentionally cancelled or replaced.

## Acceptance mapping

| `P2.1-400` criterion | Evidence |
|---|---|
| All child tasks `P2.1-401` through `P2.1-418` are complete or explicitly replaced | GitHub issues [#201](https://github.com/anry88/New-Universe/issues/201) through [#217](https://github.com/anry88/New-Universe/issues/217), plus [#247](https://github.com/anry88/New-Universe/issues/247), are closed. |
| Verification is documented with unit coverage and manual smoke coverage | The verification contract below records the automated commands and the manual smoke checklist that reviewers must preserve when closing the roll-up PR. |

## Automated verification

Run these from the repository root before closing `P2.1-400`:

```bash
jq -r '.tasks[].id | select(test("^P2\\.1-4"))' tasks/tasks.json
./scripts/ci-verify.sh
```

Expected `jq` coverage is exactly the roll-up plus 18 children: `P2.1-400` through `P2.1-418`.

`./scripts/ci-verify.sh` is the local mirror of the default GitHub `ci.yml` gate: backend lint/build/migrate/seed/tests and frontend lint/build/tests. It covers the unit and integration regressions introduced by the child tasks, including backend completion paths and frontend timer behavior.

Because `P2.1-400` is a gameplay roll-up epic, the closing PR should also carry the `run-e2e` label so `.github/workflows/e2e.yml` runs the Playwright browser smoke gate before merge.

### Roll-up branch verification

`task/P2.1-400-gameplay-rollup` verification on 2026-05-11:

| Command | Result |
|---|---|
| `jq empty tasks/tasks.json` | Pass |
| `jq -r '.tasks[].id \| select(test("^P2\\.1-4"))' tasks/tasks.json` | Pass; printed `P2.1-400` through `P2.1-418` |
| `./scripts/ci-verify.sh` | Pass; backend lint/build/migrate/seed/test and frontend lint/build/test completed successfully |

Observed non-blocking warnings during the local CI mirror: existing backend lint warnings in `backend/src/workers/tick-buildings.ts`, Redis `allkeys-lru` policy warnings from tests, and Vite deprecation/chunk-size warnings during frontend build.

## Manual smoke checklist

Use a new or reset local user where a "new user" is required.

| Area | Tasks | Smoke expectation |
|---|---|---|
| Tutorial | `P2.1-401` | Start a new user, advance at least two tutorial steps with Continue, confirm rewards land in inventory, skip/reopen works from Profile, and the tutorial launcher does not overlap ResourceBar. |
| Localization and naming | `P2.1-402`, `P2.1-403` | Switch EN/RU from Profile, reload, confirm persisted locale and localized system/planet display names; a `language_code=ru` login defaults to Russian on first user creation. |
| Home system and fog | `P2.1-404`, `P2.1-405` | New account starts on the green capital with usable slots; undiscovered home planets stay hidden/obfuscated until scout travel reveals them, then map names/sprites match the naming rules. |
| Economy and resources | `P2.1-406`, `P2.1-411`, `P2.1-413` | Steel and other progression resources can be produced without mandatory market use; building affordability uses the selected planet inventory; switching planets changes ResourceBar scope and the full list stays available. |
| Buildings | `P2.1-407`, `P2.1-408`, `P2.1-409`, `P2.1-410`, `P2.1-412` | Open PlanetDetail during a short build timer and confirm instant online finalization; demolish an upgraded building and confirm 50% refund; blocked duplicate Command Center/lab and prerequisite cases show reasons before submit; building descriptions expose outputs/storage/modifiers. |
| Premium rush | `P2.1-414` | A new user has the configured diamonds grant; rushing an eligible building spends diamonds server-side and completes the queued process. |
| Shell navigation | `P2.1-415`, `P2.1-416` | Bottom navigation remains fixed on short and long content; PlanetDetail queue sits above it without safe-area overlap; Home and Colonies tabs render distinct, correct content and active state. |
| Research | `P2.1-417` | Research screen shows seven branches with five tiers each; locked nodes explain requirements; cost/time growth matches the scaled catalog. |
| Realtime processes | `P2.1-418` | With the game open, short building, research, ship, expedition, and colonization timers complete on the UI without waiting for Telegram push; offline worker completion still sends notifications and remains idempotent. |
