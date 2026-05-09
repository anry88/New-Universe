# `backend/src/features/market` directory

Market domain contracts used by the NPC market and future player market.

## Files

- **`types.ts`** — typed DTOs and enums for market offers/orders plus explicit order-status transition map (`MARKET_ORDER_STATUS_TRANSITIONS`) and guard helper (`canTransitionMarketOrderStatus`).
- **`types.test.ts`** — Vitest coverage validating legal and illegal order-state transitions so status flow remains explicit and deterministic.
- **`pricing.ts`** — deterministic NPC broker quote model with resource/tier baselines, spread, stock-pressure adjustment, and anti-arbitrage helper.
- **`pricing.test.ts`** — Vitest coverage for deterministic baselines, tier effects, stock-pressure edges, and buy/sell no-arbitrage guarantees.
- **`orders.ts`** — market-order application layer for `P2-MKT-003`: lists deterministic NPC offers, validates ownership/price/capacity, reserves resources atomically when creating orders, and supports cancel with reservation rollback.
- **`orders.test.ts`** — integration tests for `GET /market/offers`, order creation, insufficient-funds rejection, and cancel refund behavior.

## Notes

HTTP handlers are mounted from `backend/src/routes/market.ts`; this package contains the market business logic used by those routes.
