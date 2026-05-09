# `backend/src/features/market` directory

Market domain contracts used by the NPC market and future player market.

## Files

- **`types.ts`** — typed DTOs and enums for market offers/orders plus explicit order-status transition map (`MARKET_ORDER_STATUS_TRANSITIONS`) and guard helper (`canTransitionMarketOrderStatus`).
- **`types.test.ts`** — Vitest coverage validating legal and illegal order-state transitions so status flow remains explicit and deterministic.

## Notes

This package is intentionally route-less for now. `P2-MKT-001` focuses on schema + shared backend market contracts; API handlers will be added in follow-up market tasks.
