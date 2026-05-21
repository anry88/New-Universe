import 'fastify';
import { TelegramInitData, TelegramUser } from '../lib/telegram.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: TelegramUser;
    telegramInitData?: TelegramInitData;
    userId?: string;
  }
}
