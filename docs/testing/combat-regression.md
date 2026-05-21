# Phase 3 Combat Regression

Gate scenario for `P3-COM-012` and roll-up issue [`P3-EPIC-COMBAT`](https://github.com/anry88/New-Universe/issues/342).

## Coverage

- `backend/tests/e2e/combat-regression.test.ts` exercises the integrated path: Weapons research setup, Military Shipyard construction, light combat ship production, fuel loading, ship combat, orbital bombing, Command Center wipe, and colonization re-check after hostile structures are gone.
- `backend/src/features/combat/*.test.ts` covers the deterministic combat engine: ship-vs-ship targeting, elapsed-time idempotency, bomber priority, shield absorption/recharge, rocket-carrier missile limits, and abstract Weapons V payload rules.
- `backend/src/features/ships/refuel.test.ts` covers routed refuel transfer behavior, including idle/docked validation, target tank capacity before launch and at arrival, separate refueler reserve loading from owned planet stockpiles, source balance rollback, concurrent transfer serialization so a refueler cannot be overdrawn, and refueler replenish orders.
- `tools/balance-sim` mirrors combat economy inputs for durability bands, bomber time-to-destroy, fuel/refuel capacity ranges, advanced Common Pool materials, and atomic-reactor energy recipes.

## Local Verification

Run the focused backend gate from `backend/`:

```bash
npx vitest run src/features/ships/refuel.test.ts src/db/seed/audit.test.ts src/features/combat/durability.test.ts src/features/combat/engine.test.ts src/features/combat/missiles.test.ts src/features/combat/nuclear.test.ts src/features/combat/shields.test.ts src/features/combat/tick-combat.test.ts tests/e2e/combat-regression.test.ts
```

Run the full repository CI mirror from the repo root before closing the roll-up PR:

```bash
./scripts/ci-verify.sh
```

The closing epic PR must also carry the `run-e2e` label or attach `RUN_PLAYWRIGHT_E2E=1 ./scripts/ci-verify.sh` evidence.

## Migration / Database Reset Guidance

The combat schema migrations add nullable columns or `NOT NULL` columns with safe defaults:

- `0033_orange_jasper_sitwell.sql` adds HP/max HP/combat stat columns with defaults for existing building and ship rows.
- `0034_aspiring_tattoo.sql` adds fuel-capacity and Jump Fuel columns with defaults; `0038_wet_leech.sql` adds the separate refueler support reserve columns and sets the default Jump Fuel tank scale to 50-unit jumps.
- `0035_woozy_mongoose.sql` and `0036_hard_punisher.sql` add nullable combat timestamp columns.

For a normal local or staging database, use `npm run db:migrate` followed by `npm run db:seed`; a database drop is not required for the combat epic. Drop/recreate is only a convenience for disposable local fixtures when a developer wants a clean test world, not a migration requirement.
