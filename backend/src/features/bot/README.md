# `backend/src/features/bot` directory

This feature module handles the Telegram Bot logic, including webhook processing and command handling.

## Files

- **`commands.ts`** — `handleStartCommand(chatId)` sends the welcome message with an inline button to launch the Mini App. It uses `env.PUBLIC_FRONTEND_URL` for the `web_app` button URL.
- **`webhook.ts`** — `handleTelegramUpdate(update)` is the dispatcher that parses incoming Telegram updates and routes them to the appropriate command handlers (e.g., `/start`).
- **`service.ts`** — `BotService` class and `botService` singleton. It provides the main entry point for processing updates, delegating to `handleTelegramUpdate`.

## Adding a new command

1. Implement the command logic in `commands.ts`.
2. Add a check for the command string in `webhook.ts#handleTelegramUpdate`.
3. If the command requires database access or complex logic, consider adding a dedicated service method.
