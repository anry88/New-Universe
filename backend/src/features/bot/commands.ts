import { sendTelegramMessage } from '../../lib/telegram.js';
import { env } from '../../lib/env.js';
import { logger } from '../../lib/logger.js';

export async function handleStartCommand(chatId: number) {
  const appUrl = env.PUBLIC_FRONTEND_URL || 'https://t.me/NewUniverseDevBot/app';
  
  if (!env.PUBLIC_FRONTEND_URL) {
    logger.warn('PUBLIC_FRONTEND_URL is not set, using placeholder for /start button');
  }

  await sendTelegramMessage(chatId, 'Добро пожаловать в New Universe! 🚀\n\nВаша космическая империя ждет вас.', {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: 'Открыть New Universe',
            web_app: {
              url: appUrl,
            },
          },
        ],
      ],
    },
  });
}
