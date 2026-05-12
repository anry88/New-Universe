# `backend/src/features/resources` directory

Resource features own lazy inventory accrual, atomic stockpile transactions, diamond purchases, ice/water conversion, and explicit production orders for processor buildings.

## Files

- **`accrual.ts`** — exports `computeCurrentResources(planetId, tx?)`, a read-only lazy accrual helper. It derives current per-planet amounts from `planet_resources.amount`, `regenRate`, and `lastUpdateAt`, caps by seeded storage plus research effects, and returns rows shaped for `/me` and resource inventory views.
- **`convert.ts`** — exports `convertResources`, `buyResourceWithDiamonds`, and `quoteResourceWithDiamonds`. Conversion validates settled ownership plus a powered `cryo_factory`; diamond purchases use resource tier pricing and then credit `planet_resources`.
- **`wallet.ts`** — exports `grantDiamondsToUserByUsername({ username, amount })` to perform admin wallet operations with username lookup and transactional diamond balance updates.
- **`production.ts`** — exports `ProductionService`, `productionService`, and `ProductionOperationError`. It lists recipes from `@shared/config/productionRecipes`, previews input/output/duration/storage blocks, starts orders by spending inputs immediately, and completes due `production_orders` by granting stored outputs.
- **`routes.ts`** — registers resource HTTP endpoints under `/resources`: `POST /convert`, `POST /buy-with-diamonds`, `POST /buy-with-diamonds/quote`, `GET /planets/:id`, plus production endpoints `GET /production/recipes`, `POST /production/preview`, `POST /production/start`, `GET /production/orders`, and `POST /production/sync/:planetId`.
- **`transactions.ts`** — exports `spendResources` and `gainResources`, the row-locking primitives for atomic inventory changes. Callers can pass an outer Drizzle transaction so multi-step domain flows commit or roll back together.
- **`*.test.ts`** — Vitest coverage for accrual math, conversion/diamond purchase behavior, transaction atomicity, and production-order previews/start/completion.

## Adding a resource flow

1. Keep balance constants in shared config or backend config instead of route handlers.
2. Validate planet ownership through `features/colonies/ownership.ts` before spending or granting inventory.
3. Use `spendResources` / `gainResources` for every stockpile mutation so `lastUpdateAt` and row locks stay consistent.
4. If the frontend needs the payload shape, add or update a contract in `shared/types/` and document it in `shared/README.md`.
5. Add focused integration tests that prove both successful and rollback paths.

## Verification

```bash
npm test -- src/features/resources/accrual.test.ts src/features/resources/convert.test.ts src/features/resources/transactions.test.ts src/features/resources/production.test.ts
```
