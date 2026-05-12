# `backend/src/features/bot` directory

This feature module handles the Telegram Bot logic, including webhook processing and command handling.

## Files

- **`commands.ts`** — `handleStartCommand(chatId)` sends the welcome message with an inline button to launch the Mini App using `env.PUBLIC_FRONTEND_URL`; `handleAddDiamondCommand(chatId, args, actor, options)` is the admin `/add_diamond` handler (with aliases), validates `env.ADMIN_TELEGRAM_IDS`, updates the target user’s wallet via `features/resources/wallet.ts`, logs success plus each rejection reason (`unauthorized`, `invalid_syntax`, `invalid_amount`, `user_not_found`), and returns localized success/error text.
- **`webhook.ts`** — `handleTelegramUpdate(update)` is the dispatcher that parses incoming Telegram updates and routes them to the appropriate command handlers (`/start`, `/add_diamond` aliases). It ignores non-text updates safely and logs unsupported slash commands for webhook diagnostics.
- **`service.ts`** — `BotService` class and `botService` singleton. It provides the main entry point for processing updates, delegating to `handleTelegramUpdate`.

## Adding a new command

1. Implement the command logic in `commands.ts`.
2. Add a check for the command string in `webhook.ts#handleTelegramUpdate`.
3. If the command requires database access or complex logic, consider adding a dedicated service method.
