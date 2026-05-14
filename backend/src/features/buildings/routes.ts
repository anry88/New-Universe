import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../../lib/env.js';
import { buildingService } from './service.js';
import { BuildingOperationError } from './building-operation-error.js';
import {
  BuildRequest,
  type BuildBlockedReason,
  UpgradeRequest,
  ChangeExtractorResourceRequest,
  DemolishRequest,
  RushBuildRequest,
} from '@shared/types/buildings.js';
import { formatBuildBlockedMessage } from '@shared/types/building-eligibility.js';
import { formatInsufficientResourceMessage } from '@shared/types/entity-labels.js';
import { rushDiamondCost, rushPricingMeta, rushRemainingSeconds } from '../../lib/diamonds.js';

import { db } from '../../db/index.js';
import { buildings, buildingTypes, colonies, planets, systems } from '../../db/schema.js';
import { and, eq, isNotNull, or } from 'drizzle-orm';
import { getResearchEffectsForUser } from '../research/effects.js';
import { deriveBuildingQueueStartedAt } from '../timers.js';
import { resolveRequestLocale } from '../../lib/i18n.js';
import { mutationRateLimit } from '../../lib/rate-limit.js';
import {
  nonEmptyStringSchema,
  objectBodySchema,
  optionalNullableStringSchema,
  paramsSchema,
  securityRouteConfig,
  safeIntegerSchema,
} from '../../lib/security.js';

function formatGenericBuildingError(message: string | undefined, locale: 'en' | 'ru'): string {
  switch (message) {
    case 'Planet not found or no active command center':
      return locale === 'ru'
        ? 'Планета не является активным поселением.'
        : 'Planet is not an active settlement.';
    case 'Invalid slot index':
      return locale === 'ru' ? 'Выбранная ячейка недоступна.' : 'Selected slot is not available.';
    case 'Slot already occupied':
      return locale === 'ru' ? 'Выбранная ячейка уже занята.' : 'Selected slot is already occupied.';
    case 'Building type not found':
      return locale === 'ru' ? 'Такое здание не найдено.' : 'Building type not found.';
    case 'Build queue is full (max 1 building at a time)':
      return locale === 'ru'
        ? 'Очередь строительства заполнена: одновременно доступно одно здание.'
        : 'Build queue is full: one building can be queued at a time.';
    case 'Selected resource is required':
      return locale === 'ru'
        ? 'Выберите месторождение для добывающей постройки.'
        : 'Select a deposit for this extraction building.';
    case 'Building not found or not owned by user':
      return locale === 'ru' ? 'Здание не найдено среди ваших поселений.' : 'Building not found in your settlements.';
    case 'Building is currently in queue':
    case 'Building already in queue':
      return locale === 'ru' ? 'Здание уже находится в очереди.' : 'Building is already in the queue.';
    case 'Building does not support resource switching':
      return locale === 'ru'
        ? 'Это здание не поддерживает смену месторождения.'
        : 'This building does not support deposit switching.';
    case 'Building cannot switch resources right now':
      return locale === 'ru'
        ? 'Сейчас нельзя сменить месторождение для этого здания.'
        : 'This building cannot switch deposits right now.';
    default:
      return message ?? (locale === 'ru' ? 'Некорректный запрос' : 'Bad request');
  }
}

function formatBuildingOperationError(err: BuildingOperationError, locale: 'en' | 'ru'): string {
  if (err.code === 'insufficient_resource') {
    const resourceId = typeof err.details?.resourceId === 'string' ? err.details.resourceId : 'resource';
    return formatInsufficientResourceMessage(resourceId, locale);
  }

  if (err.code.startsWith('building_blocked_')) {
    return formatBuildBlockedMessage(
      { code: err.code, details: err.details } as BuildBlockedReason,
      locale,
    );
  }

  return formatGenericBuildingError(err.message, locale);
}

export async function buildingsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (request, reply) => {
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing session token',
      });
    }

    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as { userId: string };
      (request as any).userId = payload.userId;
    } catch {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired session token',
      });
    }
  });

  app.get('/types', async () => {
    return buildingService.getBuildingTypes();
  });

  app.post('/build', {
    config: securityRouteConfig(mutationRateLimit, 'body'),
    schema: {
      body: objectBodySchema(
        {
          planetId: nonEmptyStringSchema,
          typeId: nonEmptyStringSchema,
          slotIndex: { ...safeIntegerSchema, minimum: 0, maximum: 256 },
          selectedResourceId: optionalNullableStringSchema,
        },
        ['planetId', 'typeId', 'slotIndex'],
      ),
    },
  }, async (request, reply) => {
    const { planetId, typeId, slotIndex, selectedResourceId } = request.body as BuildRequest;
    const userId = (request as any).userId;

    try {
      const result = await buildingService.build(userId, planetId, typeId, slotIndex, selectedResourceId);
      return result;
    } catch (err: unknown) {
      const locale = resolveRequestLocale(request);
      if (err instanceof BuildingOperationError) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: formatBuildingOperationError(err, locale),
          code: err.code,
          details: err.details,
        });
      }
      const e = err as { message?: string };
      return reply.status(400).send({
        error: 'Bad Request',
        message: formatGenericBuildingError(e.message, locale),
      });
    }
  });

  app.post('/upgrade', {
    config: securityRouteConfig(mutationRateLimit, 'body'),
    schema: {
      body: objectBodySchema({ buildingId: nonEmptyStringSchema }, ['buildingId']),
    },
  }, async (request, reply) => {
    const { buildingId } = request.body as UpgradeRequest;
    const userId = (request as any).userId;

    try {
      const result = await buildingService.upgrade(userId, buildingId);
      return result;
    } catch (err: unknown) {
      const locale = resolveRequestLocale(request);
      if (err instanceof BuildingOperationError) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: formatBuildingOperationError(err, locale),
          code: err.code,
          details: err.details,
        });
      }
      const e = err as { message?: string };
      return reply.status(400).send({
        error: 'Bad Request',
        message: formatGenericBuildingError(e.message, locale),
      });
    }
  });

  app.post('/resource', {
    config: securityRouteConfig(mutationRateLimit, 'body'),
    schema: {
      body: objectBodySchema(
        {
          buildingId: nonEmptyStringSchema,
          selectedResourceId: nonEmptyStringSchema,
        },
        ['buildingId', 'selectedResourceId'],
      ),
    },
  }, async (request, reply) => {
    const { buildingId, selectedResourceId } = request.body as ChangeExtractorResourceRequest;
    const userId = (request as any).userId;

    if (!buildingId || !selectedResourceId) {
      const locale = resolveRequestLocale(request);
      return reply.status(400).send({
        error: 'Bad Request',
        message: locale === 'ru'
          ? 'Выберите здание и месторождение.'
          : 'Select a building and a deposit.',
      });
    }

    try {
      return await buildingService.changeExtractorResource(userId, buildingId, selectedResourceId);
    } catch (err: unknown) {
      const locale = resolveRequestLocale(request);
      if (err instanceof BuildingOperationError) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: formatBuildingOperationError(err, locale),
          code: err.code,
          details: err.details,
        });
      }
      const e = err as { message?: string };
      return reply.status(400).send({
        error: 'Bad Request',
        message: formatGenericBuildingError(e.message, locale),
      });
    }
  });

  app.post('/demolish', {
    config: securityRouteConfig(mutationRateLimit, 'body'),
    schema: {
      body: objectBodySchema({ buildingId: nonEmptyStringSchema }, ['buildingId']),
    },
  }, async (request, reply) => {
    const { buildingId } = request.body as DemolishRequest;
    const userId = (request as any).userId;

    try {
      const result = await buildingService.demolish(userId, buildingId);
      return result;
    } catch (err: any) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: err.message,
      });
    }
  });

  app.post('/sync/:planetId', {
    config: securityRouteConfig(mutationRateLimit, 'params'),
    schema: {
      params: paramsSchema({ planetId: nonEmptyStringSchema }, ['planetId']),
    },
  }, async (request, reply) => {
    const { planetId } = request.params as { planetId: string };
    const userId = (request as any).userId;

    try {
      await buildingService.syncPlanetBuildings(userId, planetId);
      return { success: true };
    } catch (err: any) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: err.message,
      });
    }
  });

  app.get('/queue', async (request) => {
    const userId = (request as any).userId as string;
    const researchEffects = await getResearchEffectsForUser(userId, db);

    const rows = await db
      .select({
        id: buildings.id,
        planetId: buildings.planetId,
        buildingTypeId: buildings.typeId,
        level: buildings.level,
        queueAction: buildings.queueAction,
        queueCompletesAt: buildings.queueCompletesAt,
        baseTimeSec: buildingTypes.baseTimeSec,
      })
      .from(buildings)
      .innerJoin(buildingTypes, eq(buildingTypes.id, buildings.typeId))
      .innerJoin(planets, eq(planets.id, buildings.planetId))
      .innerJoin(systems, eq(systems.id, planets.systemId))
      .leftJoin(colonies, eq(colonies.planetId, planets.id))
      .where(
        and(
          or(eq(systems.ownerId, userId), eq(colonies.ownerId, userId)),
          isNotNull(buildings.queueAction),
          isNotNull(buildings.queueCompletesAt),
        ),
      );

    const sorted = rows
      .map((row) => ({
        ...row,
        queueAction: row.queueAction as 'build' | 'upgrade' | 'destroy',
        queueCompletesAt: row.queueCompletesAt!.toISOString(),
        queueStartedAt: deriveBuildingQueueStartedAt(
          row,
          { baseTimeSec: row.baseTimeSec },
          researchEffects,
        ),
        rushCost: rushDiamondCost(rushRemainingSeconds(row.queueCompletesAt!)),
      }))
      .sort(
        (a, b) =>
          new Date(a.queueCompletesAt).getTime() - new Date(b.queueCompletesAt).getTime(),
      );

    return {
      queue: sorted,
      rushPricing: rushPricingMeta(),
    };
  });

  app.post('/rush', {
    config: securityRouteConfig(mutationRateLimit, 'body'),
    schema: {
      body: objectBodySchema({ buildingId: nonEmptyStringSchema }, ['buildingId']),
    },
  }, async (request, reply) => {
    const { buildingId } = request.body as RushBuildRequest;
    const userId = (request as any).userId as string;

    if (!buildingId || typeof buildingId !== 'string') {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'buildingId is required',
      });
    }

    try {
      return await buildingService.rushQueuedBuilding(userId, buildingId);
    } catch (err: unknown) {
      if (err instanceof BuildingOperationError) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: err.message,
          code: err.code,
          details: err.details,
        });
      }
      const e = err as { message?: string };
      return reply.status(400).send({
        error: 'Bad Request',
        message: e.message ?? 'Bad Request',
      });
    }
  });
}
