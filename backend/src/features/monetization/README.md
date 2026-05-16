# `backend/src/features/monetization` directory

Telegram Stars monetization for diamond packs.

## Files

- **`service.ts`** — shared Stars payment logic: diamond pack listing, Mini App invoice-link creation, Telegram `pre_checkout_query` validation, idempotent `successful_payment` delivery, `/paysupport` support request storage, admin refund/reject/ask operations, Bot API refund calls, `ADMIN_TELEGRAM_CHAT_IDS` destination resolution, and refund diamond reversal.
- **`routes.ts`** — authenticated Mini App HTTP surface mounted at `/monetization`: `GET /stars/packs` and `POST /stars/invoice`.
- **`monetization.test.ts`** — focused coverage for pack math, invoice creation, idempotent successful-payment crediting, support request creation, and admin refund reversal.
