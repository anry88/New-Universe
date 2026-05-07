import { FastifyInstance } from 'fastify';
import { telegramAuthMiddleware } from '../../middleware/telegram-auth.js';
import { authService } from './service.js';

export async function authRoutes(app: FastifyInstance) {
  app.post(
    '/telegram',
    { preHandler: [telegramAuthMiddleware] },
    async (request, reply) => {
      const { user, token } = await authService.loginWithTelegram(request.user!);

      const cookieOptions = [
        `session=${token}`,
        'HttpOnly',
        'Path=/',
        'SameSite=Strict',
        `Max-Age=${30 * 24 * 60 * 60}`,
      ];
      
      if (process.env.NODE_ENV === 'production') {
        cookieOptions.push('Secure');
      }

      return reply
        .header('Set-Cookie', cookieOptions.join('; '))
        .send({ user, token });
    }
  );
}
