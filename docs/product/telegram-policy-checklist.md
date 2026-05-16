# Telegram Stars Policy Checklist

This checklist maps the New Universe P4-MON-001 implementation to Telegram Stars payment requirements and launch safety checks.

Reference: https://core.telegram.org/bots/payments-stars

## Bot API Requirements

| Requirement | Status | Implementation |
| --- | --- | --- |
| Use Telegram Stars currency | Done | Invoices use `currency: "XTR"` from `shared/config/monetization.ts`. |
| Do not use a third-party provider token for Stars | Done | `createInvoiceLink` sends `provider_token: ""`. |
| Validate pre-checkout before accepting payment | Done | `answerStarsPreCheckout()` verifies payload, user, buyer id, currency, and amount. |
| Deliver value only after successful payment | Done | Diamonds are credited from `successful_payment`, or from Telegram transaction history after the Mini App reports a paid checkout; invoice creation never credits value. |
| Keep payment delivery idempotent | Done | `star_payments.telegram_payment_charge_id` has a unique index and duplicate updates do not credit twice. |
| Support Stars refunds | Done | `/paysupport` starts the support flow and admin `/refund` calls `refundStarPayment`. |
| Avoid leaking payment data | Done | Logs and analytics avoid raw invoice payloads, charge ids, Telegram ids, auth data, and user-generated chat text. |

## Player Flow Checks

- The shop displays only the configured 100, 500, 2,500, 5,000, and 10,000 diamond packs.
- The player cannot submit a custom Stars amount or custom diamond amount.
- The backend rejects an invoice request for an unknown pack.
- Telegram pre-checkout rejects stale or tampered payloads.
- The successful-payment handler rejects amount/currency mismatches and user mismatches.
- After Telegram returns `paid`, the shop calls checkout confirmation and displays delivered/pending/failed delivery status with the updated diamond balance when available.
- The player can start refund support with `/paysupport`.
- The player can provide follow-up information through `/answer`.

## Admin Flow Checks

- `ADMIN_TELEGRAM_IDS` remains the admin actor allowlist for sensitive bot commands.
- `ADMIN_TELEGRAM_CHAT_IDS` defines support destinations for refund requests; multiple chat ids are comma-separated.
- If `ADMIN_TELEGRAM_CHAT_IDS` is empty, refund requests fall back to `ADMIN_TELEGRAM_IDS` direct-message destinations.
- Admin confirmation is required for every refund:
  - `/refund <requestId>` approves and executes the Telegram Stars refund.
  - `/reject <requestId> <reason>` closes without refund.
  - `/ask <requestId> <question>` moves the request back to the player.
- Admin command text is accepted only from configured admin chat context or allowlisted admin user ids.

## Economy And Abuse Checks

- Purchased diamonds are added in one transaction after the payment row is created.
- Refunded diamonds are subtracted in the same transaction that marks the payment and support request resolved.
- Duplicate open support requests for the same payment are rejected.
- If `/paysupport` recovers a missed Stars delivery first, it reports the recovered credit and does not create a refund request in the same command call.
- Refunded payments are excluded from `/paysupport` lists.
- Refund failure from Telegram is recorded as `refund_failed` without locally marking the payment refunded.
- Stars pack telemetry uses the shared analytics sanitizer and safe properties only.

## Launch Preconditions

Before enabling real Stars sales in production:

- Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_SECRET`, `PUBLIC_FRONTEND_URL`, and `TELEGRAM_APP_URL`.
- Set `ADMIN_TELEGRAM_IDS` and at least one reachable `ADMIN_TELEGRAM_CHAT_IDS` destination.
- Configure the Telegram webhook secret to match `TELEGRAM_BOT_SECRET`.
- Run database migrations so `star_payments` and `star_payment_support_requests` exist.
- Complete a manual test purchase and refund with a Telegram test account or a controlled private production account.
- Confirm support admins can receive requests and issue `/refund`, `/reject`, and `/ask`.
