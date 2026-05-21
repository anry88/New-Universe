# `backend/src/features/bot` directory

This feature module handles the Telegram Bot logic, including webhook processing and command handling.

## Files

- **`commands.ts`** — `handleStartCommand(chatId, actor, startParameter)` clears `users.telegram_notifications_blocked_at` for the sender, stores a sanitized `/start <code>` registration source only when that Telegram actor does not already have a user row, and sends the welcome message with an inline button to launch the Mini App using `env.PUBLIC_FRONTEND_URL`; `handleAddDiamondCommand(chatId, args, actor, options)` is the admin `/add_diamond` handler (with aliases), validates `env.ADMIN_TELEGRAM_IDS`, updates the target user’s wallet via `features/resources/wallet.ts`, logs success plus each rejection reason (`unauthorized`, `invalid_syntax`, `invalid_amount`, `user_not_found`), and returns localized success/error text. It also handles the Stars support flow: `/paysupport` reconciles missed invoice payments from Telegram transaction history before listing/referring refundable payments, reports recovered deliveries explicitly without creating a refund request in the same command, `/answer` sends player follow-up details, and admin `/refund`, `/reject`, `/ask` commands resolve requests through `features/monetization/service.ts`.
- **`webhook.ts`** — `handleTelegramUpdate(update)` is the dispatcher that handles Stars `pre_checkout_query`, idempotent `successful_payment` delivery, and text commands (`/start`, `/add_diamond`, `/paysupport`, `/answer`, `/refund`, `/reject`, `/ask`). It passes the first `/start` argument into registration-source capture, ignores unsupported non-text updates safely, and logs unsupported slash commands for webhook diagnostics.
- **`service.ts`** — `BotService` class and `botService` singleton. It provides the main entry point for processing updates, delegating to `handleTelegramUpdate`.

## Adding a new command

1. Implement the command logic in `commands.ts`.
2. Add a check for the command string in `webhook.ts#handleTelegramUpdate`.
3. If the command requires database access or complex logic, consider adding a dedicated service method.
