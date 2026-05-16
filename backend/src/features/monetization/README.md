# `backend/src/features/monetization` directory

Telegram Stars monetization for diamond packs.

## Files

- **`service.ts`** — shared Stars payment logic: diamond pack listing, Mini App invoice-link creation with per-checkout payload ids, Telegram `pre_checkout_query` validation, idempotent `successful_payment` delivery, synchronous checkout confirmation/recovery from Telegram transaction history, current diamond-balance lookup for already-delivered checkout confirmations, transaction-history reconciliation for missed payments, `/paysupport` support request storage, admin refund/reject/ask operations, Bot API refund calls, `ADMIN_TELEGRAM_CHAT_IDS` destination resolution, and refund diamond reversal.
- **`routes.ts`** — authenticated Mini App HTTP surface mounted at `/monetization`: `GET /stars/packs`, `POST /stars/invoice`, and `POST /stars/checkout-result`.
- **`monetization.test.ts`** — focused coverage for pack math, invoice creation, idempotent successful-payment crediting, explicit checkout confirmation/recovery, missed-payment reconciliation, support request creation, and admin refund reversal.
