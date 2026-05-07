import { TelegramUpdate } from '../../lib/telegram.js';
import { handleStartCommand } from './commands.js';
import { logger } from '../../lib/logger.js';

export async function handleTelegramUpdate(update: TelegramUpdate) {
  const message = update.message;
  
  if (!message || !message.text) {
    return;
  }

  const text = message.text;
  const chatId = message.chat.id;

  if (text.startsWith('/start')) {
    logger.info({ chatId }, 'Handling /start command');
    await handleStartCommand(chatId);
  }
}
