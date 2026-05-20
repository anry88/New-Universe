import { FastifyInstance } from 'fastify';
import { telegramAuthMiddleware } from '../../middleware/telegram-auth.js';
import { authService } from './service.js';
import { authRateLimit } from '../../lib/rate-limit.js';
import { securityRouteConfig } from '../../lib/security.js';
import { env } from '../../lib/env.js';
import { analyticsNumberBand, trackBackendEvent } from '../../lib/analytics.js';

export async function authRoutes(app: FastifyInstance) {
  app.post(
    '/telegram',
    {
      config: securityRouteConfig(authRateLimit, 'telegram-init-data'),
      preHandler: [telegramAuthMiddleware],
    },
    async (request, reply) => {
      const { user, token } = await authService.loginWithTelegram(request.user!);
      trackBackendEvent('session_authenticated', {
        locale: user.preferredLocale,
        tutorialCompleted: Boolean(user.tutorialCompletedAt),
        diamondsBalanceBand: analyticsNumberBand(user.diamonds, 500),
      }, { userId: user.id, requestId: request.id });

      const cookieOptions = [
        `session=${token}`,
        'HttpOnly',
        'Path=/',
        'SameSite=Strict',
        `Max-Age=${30 * 24 * 60 * 60}`,
      ];
      
      if (env.NODE_ENV === 'production') {
        cookieOptions.push('Secure');
      }

      return reply
        .header('Set-Cookie', cookieOptions.join('; '))
        .send({ user, token });
    }
  );
}
