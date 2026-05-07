import { TelegramUpdate } from '../../lib/telegram.js';
import { handleTelegramUpdate } from './webhook.js';

export class BotService {
  async processUpdate(update: TelegramUpdate) {
    await handleTelegramUpdate(update);
  }
}

export const botService = new BotService();
