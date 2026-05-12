import { TelegramUpdate } from '../../lib/telegram.js';
import { env } from '../../lib/env.js';
import { handleAddDiamondCommand, handleStartCommand, isAddDiamondCommand } from './commands.js';
import { logger } from '../../lib/logger.js';

export async function handleTelegramUpdate(update: TelegramUpdate) {
  const message = update.message;
  
  if (!message || !message.text) {
    return;
  }

  const text = message.text;
  const chatId = message.chat.id;
  const [rawCommand, ...args] = text.trim().split(/\s+/);
  const command = rawCommand.split('@')[0].toLowerCase();

  if (command === '/start') {
    logger.info({ chatId }, 'Handling /start command');
    await handleStartCommand(chatId);
    return;
  }

  if (isAddDiamondCommand(command)) {
    logger.info({ chatId, command }, 'Handling admin add_diamond command');
    await handleAddDiamondCommand(chatId, args, message.from, {
      adminTelegramIds: env.ADMIN_TELEGRAM_IDS,
      locale: message.from?.language_code?.toLowerCase().startsWith('ru') ? 'ru' : 'en',
    });
    return;
  }
}
