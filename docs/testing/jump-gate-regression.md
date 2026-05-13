# Jump Gate regression suite

Gate scenario for Phase 2.3 roll-up task `P2.3-500` and implementation task `P2.3-508`.

The automated backend scenario covers the whole server-authoritative Jump Gate loop:

| Step | Evidence |
|---|---|
| Unlock | Inserts completed `jump_drive` level 1 and confirms `/jump-gate/random-jump` is accepted. |
| Random jump | Calls `POST /jump-gate/random-jump`, spends stored `jump_fuel`, and creates a `random_jump` known destination. |
| Known destination | Calls `POST /jump-gate/destinations/:systemId/jump` against the saved destination and checks the visit timestamp is refreshed. |
| Common discovery | Sends a scout through `/expeditions` with `routeMode: "jump_gate"`, fast-forwards the worker, and verifies one `discovered_planets` row. |
| Colonization | Sends a colonizer through the gate, fast-forwards `processExpeditions`, and verifies exactly one colony and one command center. |
| Cargo | Sends `/cargo/transfer` with `routeMode: "jump_gate"`, runs the cargo worker twice, and verifies target cargo increases exactly once. |
| Home privacy | Inserts a stale discovered foreign Home System and verifies it is absent from `/jump-gate/state`, `/multiplayer/systems`, and `/multiplayer/sectors/:sx/:sy/:sz/presence`. |

## Local execution

Focused backend e2e:

```bash
cd backend
npx vitest run tests/e2e/jump-gate-regression.test.ts
```

All backend e2e:

```bash
cd backend
npm run test:e2e
```

Default CI mirror from the repository root:

```bash
./scripts/ci-verify.sh
```

`./scripts/ci-verify.sh` keeps Playwright disabled by default. For the Phase 2.3 roll-up PR only, run or confirm the browser gate:

```bash
RUN_PLAYWRIGHT_E2E=1 ./scripts/ci-verify.sh
```

## Manual Telegram Mini App smoke

Use a mobile viewport in the Telegram Mini App or browser devtools, preferably 390x844 or 393x852.

1. Log in as a seeded/test player with Jump Drive I completed and stored `jump_fuel` on the capital.
2. Open the Jump Gate surface from the game navigation and confirm the gate is unlocked, the random jump action is visible, and locked/cooldown copy fits the mobile viewport.
3. Execute a random jump and confirm the new Common Pool destination appears without exposing planet details that have not been scouted.
4. Launch a scout to a destination planet, wait or fast-forward locally, and confirm the destination body changes from unknown to discovered.
5. Launch a colonizer to the discovered common planet and confirm the new colony appears in Colonies/System Map without showing any foreign Home System markers.
6. Send cargo from Home to the common colony with Jump Gate route mode and confirm the preview shows ordinary fuel plus Jump Fuel, then confirm one delivery after arrival.
7. Refresh/reopen the Mini App and confirm cargo, colony, and discovery counts do not duplicate.

## Known residual risks before P2.3 roll-up closure

- The backend scenario uses DB fast-forwarding instead of wall-clock timers, so the roll-up PR still needs the `run-e2e` browser smoke gate for navigation and viewport regressions.
- The scenario checks one generated Common Pool destination; it does not exhaustively sample every procedural sector layout.
- Telegram production auth, BotFather configuration, and external tunnel/webhook setup remain outside this regression and should be covered by launch-readiness checks.
