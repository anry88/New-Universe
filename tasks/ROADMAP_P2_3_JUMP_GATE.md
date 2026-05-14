# Phase 2.3 — Jump Gate and Common Pool routing

This document records the planning scope for roll-up task `P2.3-500`. Phase 2.3 inserts the missing gameplay layer between the protected Home System and Phase 3 multiplayer presence: a private Jump Gate, repeatable random jumps into Common Pool, a known-destination registry, and route modes for scout, colonizer, and cargo missions.

## Why This Is A Separate Epic

No existing epic cleanly owns this work:

- `P1-182` implemented the first backend jump endpoint, but it is too direct: the client picks a sector and the server moves the old Jump Ship immediately. The current catalog uses `recon_probe` as a one-use discovery hull instead.
- `EPIC-P2-COL` owns colony creation and cargo basics, but not navigation into Common Pool.
- `EPIC-P3-MAP` owns multiplayer presence after entities are already in Common Pool.

`EPIC-P2.3-JUMP-GATE` should therefore sit after P2.2 building/economy fixes and before deeper Phase 3 multiplayer work.

## Product Decisions

- Use **Jump Gate** as a private object anchored outside the player's Home System.
- Unlock it after completed `jump_drive` level 1.
- Use **random jump** as the exploration action. Avoid one-time opening-jump wording in UI or task copy; the action is repeatable.
- Random jump is server-authoritative: the client does not submit arbitrary sector coordinates.
- A random jump opens a common-system destination; planets inside that system are still revealed by explicit visibility/scout rules.
- Known destinations include opened systems and systems containing the player's colonies.
- Scout/recon, colonizer, and cargo flows route through the same gate/destination model instead of using parallel endpoint logic.

## Child Tasks

| Task | Size | Scope |
|---|---:|---|
| `P2.3-501` | M | Jump Gate data model and unlock state |
| `P2.3-502` | L | Random jump service and known destination registry |
| `P2.3-503` | M | Common-system discovery contracts for Jump Gate destinations |
| `P2.3-504` | L | Jump Gate expedition routing for scouts and colonizers |
| `P2.3-505` | L | Jump Gate cargo routing between home and common colonies |
| `P2.3-506` | M | Jump fuel economy and balance integration |
| `P2.3-507` | L | Jump Gate frontend surface and destination UX |
| `P2.3-508` | L | Jump Gate end-to-end regression scenario |

## Completion Gate

`P2.3-500` can close only when:

- All child tasks `P2.3-501` through `P2.3-508` are complete or explicitly replaced.
- The legacy `/expeditions/jump` path no longer bypasses Jump Gate rules.
- Random jump, known-destination jump, colonization through gate, and cargo through gate are tested.
- Foreign Home Systems remain invisible and unreachable through all new APIs.
- The closing PR carries `run-e2e`, because this epic changes primary navigation and mission launch flows.

## Verification

Run from the repository root:

```bash
jq -r '.tasks[].id | select(test("^P2\\.3-5"))' tasks/tasks.json
cd backend && npx vitest run tests/e2e/jump-gate-regression.test.ts
./scripts/ci-verify.sh
```

For the closing roll-up PR, also run or confirm the browser gate:

```bash
RUN_PLAYWRIGHT_E2E=1 ./scripts/ci-verify.sh
```

If Playwright cannot run locally, add the `run-e2e` label to the PR and treat GitHub Actions as the authoritative browser result.

## P2.3-508 regression evidence

Automated backend evidence lives in [`backend/tests/e2e/jump-gate-regression.test.ts`](../backend/tests/e2e/jump-gate-regression.test.ts) and is documented in [`docs/testing/jump-gate-regression.md`](../docs/testing/jump-gate-regression.md).

The scenario covers:

- Jump Drive I unlock and `/jump-gate/random-jump`.
- Saved known-destination repeat jump through `/jump-gate/destinations/:systemId/jump`.
- Common Pool scout discovery through `/expeditions` with `routeMode: "jump_gate"`.
- Colonizer arrival through `processExpeditions`, including single colony and command-center creation.
- Cargo delivery through `/cargo/transfer` with `routeMode: "jump_gate"` and repeated cargo worker execution.
- Foreign Home System filtering in `/jump-gate/state`, `/multiplayer/systems`, and `/multiplayer/sectors/:sx/:sy/:sz/presence`.

Known residual risks before closing `P2.3-500`:

- Browser navigation/mobile viewport coverage is manual or `run-e2e` only; default CI intentionally remains backend/unit focused.
- The e2e uses DB fast-forwarding for timers and one generated Common Pool destination rather than exhaustive procedural-sector sampling.
- Production Telegram bot/webhook configuration remains covered by launch-readiness checks, not this regression.
