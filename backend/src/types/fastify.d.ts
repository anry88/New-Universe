import 'fastify';
import { TelegramUser } from '../lib/telegram.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: TelegramUser;
  }
}
