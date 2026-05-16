# Monetization Readiness

This document is the P4-MON-001 launch-readiness record for Telegram Stars monetization. The implemented scope is limited to optional diamond packs sold through Telegram Stars inside the Telegram Mini App.

## Implemented Surface

- Mini App shop route: `/shop`.
- Backend API:
  - `GET /monetization/stars/packs`
  - `POST /monetization/stars/invoice`
- Telegram Bot webhook handling:
  - `pre_checkout_query` validation.
  - `successful_payment` delivery.
  - `/paysupport`, `/answer`, `/refund`, `/reject`, and `/ask` support commands.
- Storage:
  - `star_payments`
  - `star_payment_support_requests`

## Diamond Pack Ladder

The pack ladder follows the user-approved Stars counts. The base pack is 100 diamonds for 20 Stars, and each larger pack improves diamonds per Star by 10-25% versus the previous pack.

| Pack | Diamonds | Stars | Diamonds per Star | Value improvement |
| --- | ---: | ---: | ---: | ---: |
| Base | 100 | 20 | 5.00 | 0% |
| Medium | 500 | 85 | 5.88 | 18% |
| Large | 2,500 | 350 | 7.14 | 21% |
| XL | 5,000 | 600 | 8.33 | 17% |
| XXL | 10,000 | 1,000 | 10.00 | 20% |

The canonical source is `shared/config/monetization.ts`; frontend and backend both import that file so pack counts and prices cannot drift.

## Purchase Flow

1. The shop reads `GET /monetization/stars/packs`.
2. The player chooses a pack and the client calls `POST /monetization/stars/invoice`.
3. The backend creates a Telegram Stars invoice link with currency `XTR`, empty `provider_token`, and payload `pack=<packId>;user=<userId>`.
4. Telegram sends `pre_checkout_query`; the backend accepts only if:
   - payload parses to a known pack and existing user,
   - currency is `XTR`,
   - total amount equals the configured Stars price,
   - Telegram buyer id matches the stored user `tgId`.
5. Telegram sends `successful_payment`; the backend stores one `star_payments` row per `telegram_payment_charge_id` and credits diamonds exactly once.

## Refund Flow

Refunds are initiated by the player from Telegram chat:

1. `/paysupport` with no arguments lists refundable Stars purchases.
2. `/paysupport <paymentId> <reason>` creates a support request if the payment belongs to the player, is not refunded, and has no open request.
3. The backend sends the request to every chat from `ADMIN_TELEGRAM_CHAT_IDS`; when that variable is empty it falls back to `ADMIN_TELEGRAM_IDS` as direct-message destinations.
4. Admins can respond from an admin chat or as an allowlisted admin user:
   - `/refund <requestId>` calls Telegram Bot API `refundStarPayment`, marks the payment refunded, and subtracts delivered diamonds from the player balance.
   - `/reject <requestId> <reason>` closes the request without refund.
   - `/ask <requestId> <question>` asks the player for more details.
5. The player can answer with `/answer <requestId> <message>` or `/answer <message>` when there is one latest open info request.

Refund reversal can reduce the diamond balance below zero if the player already spent the purchased diamonds. This is intentional for launch readiness: it avoids preserving real-money value after a refund and makes the debt visible to later balance controls.

## Economy Guardrails

- Stars buy only account-wide diamonds, not exclusive ships, buildings, research tiers, combat damage, or hidden information.
- All diamond sinks remain server-authoritative. Existing resource purchases, building rush, ship rush, research rush, and tutorial grants continue to validate balance on the backend.
- Pack prices are fixed in shared config and are not accepted from the client.
- Pre-checkout validates amount, currency, pack id, user id, and Telegram buyer id before Telegram can finalize payment.
- Successful payment delivery is idempotent through a unique Telegram charge id.
- Refund requests are stored and deduplicated per payment while open.
- Admin refund confirmation is required before the backend calls Telegram `refundStarPayment`.
- Analytics events use only safe aggregate properties: pack diamonds, Stars price, and a reason code. No Telegram ids, payment charge ids, invoice payloads, chat text, or raw Bot API payloads enter analytics.

## Abuse Risks And Follow-ups

Known launch risks:

- A refunded player can have a negative diamond balance after spending the purchased pack.
- `/paysupport` is command-based and intentionally minimal; high-volume launch support should move to an admin dashboard.
- Admin chats must be configured correctly before enabling real Stars purchases in production.

Recommended follow-up tasks:

- Add an admin web view for support queues and audit history.
- Add refund SLA and escalation runbook entries for live ops.
- Add an economy policy for how negative diamond balances affect future purchases and rush actions.
- Add a manual production smoke checklist that uses Telegram test accounts before public release.

