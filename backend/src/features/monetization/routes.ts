import { FastifyInstance, type FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import type {
  ConfirmStarsCheckoutRequest,
  ConfirmStarsCheckoutResponse,
  CreateStarsInvoiceRequest,
  CreateStarsInvoiceResponse,
  StarsDiamondPacksResponse,
} from '@shared/types/monetization.js';
import { env } from '../../lib/env.js';
import { mutationRateLimit } from '../../lib/rate-limit.js';
import { trackBackendEvent } from '../../lib/analytics.js';
import { resolveRequestLocale } from '../../lib/i18n.js';
import {
  nonEmptyStringSchema,
  objectBodySchema,
  securityRouteConfig,
} from '../../lib/security.js';
import {
  confirmStarsCheckoutForUser,
  createStarsInvoiceLinkForUser,
  listStarsDiamondPacks,
} from './service.js';

function readUserIdFromRequest(request: FastifyRequest): { userId?: string; error?: { status: number; body: Record<string, string> } } {
  const authHeader = request.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return {
      error: {
        status: 401,
        body: { error: 'Unauthorized', message: 'Missing session token' },
      },
    };
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { userId: string };
    return { userId: payload.userId };
  } catch {
    return {
      error: {
        status: 401,
        body: { error: 'Unauthorized', message: 'Invalid or expired session token' },
      },
    };
  }
}

export async function monetizationRoutes(app: FastifyInstance) {
  app.get('/stars/packs', async (request, reply) => {
    const auth = readUserIdFromRequest(request);
    if (auth.error) return reply.status(auth.error.status).send(auth.error.body);

    return reply.send({
      packs: listStarsDiamondPacks(),
    } satisfies StarsDiamondPacksResponse);
  });

  app.post('/stars/invoice', {
    config: securityRouteConfig(mutationRateLimit, 'body'),
    schema: {
      body: objectBodySchema({ packId: nonEmptyStringSchema }, ['packId']),
    },
  }, async (request, reply) => {
    const auth = readUserIdFromRequest(request);
    if (auth.error) return reply.status(auth.error.status).send(auth.error.body);

    const body = request.body as Partial<CreateStarsInvoiceRequest> | null;
    if (!body?.packId) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'packId is required',
      });
    }

    try {
      const result = await createStarsInvoiceLinkForUser({
        userId: auth.userId!,
        packId: body.packId,
        locale: resolveRequestLocale(request),
      });

      trackBackendEvent('stars_checkout_started', {
        packDiamonds: result.pack.diamonds,
        priceStars: result.pack.priceStars,
      }, {
        userId: auth.userId,
        requestId: request.id,
      });

      return reply.send({
        invoiceUrl: result.invoiceUrl,
        pack: result.pack,
        checkoutId: result.checkoutId,
      } satisfies CreateStarsInvoiceResponse);
    } catch (error) {
      request.log.warn({ err: error, packId: body.packId }, 'Failed to create Stars invoice');
      return reply.status(400).send({
        error: 'Bad Request',
        message: error instanceof Error ? error.message : 'Failed to create Stars invoice.',
      });
    }
  });

  app.post('/stars/checkout-result', {
    config: securityRouteConfig(mutationRateLimit, 'body'),
    schema: {
      body: objectBodySchema({
        packId: nonEmptyStringSchema,
        checkoutId: nonEmptyStringSchema,
      }, ['packId', 'checkoutId']),
    },
  }, async (request, reply) => {
    const auth = readUserIdFromRequest(request);
    if (auth.error) return reply.status(auth.error.status).send(auth.error.body);

    const body = request.body as Partial<ConfirmStarsCheckoutRequest> | null;
    if (!body?.packId || !body.checkoutId) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'packId and checkoutId are required',
      });
    }

    try {
      const result = await confirmStarsCheckoutForUser({
        userId: auth.userId!,
        packId: body.packId,
        checkoutId: body.checkoutId,
      });

      return reply.send(result satisfies ConfirmStarsCheckoutResponse);
    } catch (error) {
      request.log.warn({ err: error, packId: body.packId }, 'Failed to confirm Stars checkout');
      return reply.status(400).send({
        error: 'Bad Request',
        message: error instanceof Error ? error.message : 'Failed to confirm Stars checkout.',
      });
    }
  });
}
