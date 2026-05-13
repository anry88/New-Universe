# `backend/src/features/jump-gate` directory

Jump Gate state lives here. The feature models the player's private Home System gate as its own gameplay surface, separate from building slots and planets.

## Files

- **`routes.ts`** — `jumpGateRoutes(app)` registers `GET /jump-gate/state`, `POST /jump-gate/random-jump`, and `POST /jump-gate/destinations/:systemId/jump`. Requires JWT auth, returns the shared `JumpGateStateResponse` for state, and delegates random/known destination travel to `expeditions/jump.ts`, which reserves stored `jump_fuel` from the current planet.
- **`service.ts`** — exports `getJumpGateState(userId)`. It derives unlock from completed `jump_drive >= 1`, creates the player's private `jump_gates` persistence row when unlocked, resolves the outer-orbit home anchor, finalizes due calibration rows, reports random-jump availability, and lists discovered public destination systems only, including their registry `source` / `lastVisitedAt` plus safe per-body summaries that distinguish unknown, discovered, occupied, and owned-colony planets without exposing private Home Systems.
- **`service.test.ts`** — Vitest coverage for locked state, active-but-unfinished Jump Drive research, unlocked persistence creation, public known destination filtering, and due calibration finalization.

## Adding Jump Gate behavior

1. Keep unlock and state projection in `service.ts`; keep route handlers thin.
2. Store gate-specific timers or calibration targets in `jump_gates`, not in `buildings` or `planets`.
3. Never expose another player's Home Gate through sector presence or destination summaries.
4. Update [`shared/types/jump-gate.ts`](../../../../shared/types/jump-gate.ts), this README, and the parent feature README when adding API fields.
