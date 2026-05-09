# `backend/src/features/market` directory

Market domain contracts used by the NPC market and future player market.

## Files

- **`types.ts`** — typed DTOs and enums for market offers/orders plus explicit order-status transition map (`MARKET_ORDER_STATUS_TRANSITIONS`) and guard helper (`canTransitionMarketOrderStatus`).
- **`types.test.ts`** — Vitest coverage validating legal and illegal order-state transitions so status flow remains explicit and deterministic.
- **`pricing.ts`** — deterministic NPC broker quote model with resource/tier baselines, spread, stock-pressure adjustment, and anti-arbitrage helper.
- **`pricing.test.ts`** — Vitest coverage for deterministic baselines, tier effects, stock-pressure edges, and buy/sell no-arbitrage guarantees.
- **`orders.ts`** — market-order application layer for `P2-MKT-003`: lists deterministic NPC offers, validates ownership/price/capacity, reserves resources atomically when creating orders, and supports cancel with reservation rollback. Inserts `planet_id` and `delivery_ready_at` (buy orders use `env.MARKET_NPC_DELIVERY_SECONDS`, sell orders use “now” for the worker).
- **`fulfillment.ts`** — `P2-MKT-004` settlement: `fulfillNpcMarketOrder` locks an `open` NPC order, applies `gainResources` in the same database transaction, writes `market_order_fills`, and closes the order. Buy flows clamp delivery to `default_storage_cap`, refund unused reserved iron, and may mark `failed` if no headroom. `processNpcMarketFulfillment` scans due orders.
- **`fulfillment.test.ts`** — Vitest coverage for sell/buy settlement, idempotent retries, and no double-crediting.
- **`orders.test.ts`** — integration tests for `GET /market/offers`, order creation, insufficient-funds rejection, and cancel refund behavior.

## Notes

HTTP handlers are mounted from `backend/src/routes/market.ts`; this package contains the market business logic used by those routes.
