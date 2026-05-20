import { FastifyInstance } from "fastify";
import {
  formatLaunchExpeditionErrorMessage,
  type ExpeditionJumpRequest,
  type LaunchExpeditionErrorDetails,
  type LaunchExpeditionRequest,
} from "@shared/types/expeditions.js";
import jwt from "jsonwebtoken";
import { env } from "../../lib/env.js";
import { launchExpedition } from "./launch.js";
import { jumpShip } from "./jump.js";
import { resolveRequestLocale } from "../../lib/i18n.js";
import { mutationRateLimit } from "../../lib/rate-limit.js";
import {
  boundedNumberSchema,
  nonEmptyStringSchema,
  nonNegativeNumberSchema,
  objectBodySchema,
  optionalNullableStringSchema,
  safeIntegerSchema,
  securityRouteConfig,
} from "../../lib/security.js";
import { trackBackendEvent } from "../../lib/analytics.js";

export async function expeditionsRoutes(app: FastifyInstance) {
  app.post("/jump", {
    config: securityRouteConfig(mutationRateLimit, 'body'),
    schema: {
      body: objectBodySchema(
        {
          shipId: nonEmptyStringSchema,
          mode: { type: 'string', enum: ['random'] },
          destinationSystemId: nonEmptyStringSchema,
          targetSector: {
            type: 'object',
            required: ['x', 'y', 'z'],
            properties: {
              x: safeIntegerSchema,
              y: safeIntegerSchema,
              z: safeIntegerSchema,
            },
            additionalProperties: false,
          },
        },
        ['shipId'],
      ),
    },
  }, async (request, reply) => {
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return reply.status(401).send({
        error: "Unauthorized",
        message: "Missing session token",
      });
    }

    let payload: { userId: string };
    try {
      payload = jwt.verify(token, env.JWT_SECRET) as { userId: string };
    } catch {
      return reply.status(401).send({
        error: "Unauthorized",
        message: "Invalid or expired session token",
      });
    }

    const body = (request.body ?? {}) as Partial<ExpeditionJumpRequest>;
    const { shipId } = body;

    if (!shipId) {
      const locale = resolveRequestLocale(request);
      return reply.status(400).send({
        error: formatLaunchExpeditionErrorMessage({ code: "expedition_ship_required" }, locale),
      });
    }

    const result = await jumpShip(payload.userId, body as ExpeditionJumpRequest);

    if (!result.success) {
      return reply.status(result.status).send({ error: result.error });
    }

    trackBackendEvent("expedition_jump_requested", {
      mode: body.mode ?? "random",
      jumpFuelRequired: result.jumpFuelRequired ?? null,
    }, { userId: payload.userId, requestId: request.id });
    return reply.send({
      targetSystem: result.targetSystem,
      arrivalPlanetId: result.arrivalPlanetId,
      targetPlanet: result.targetPlanet,
      ship: result.ship,
      destination: result.destination,
      queueItem: result.queueItem,
      jumpFuelRequired: result.jumpFuelRequired,
    });
  });

  app.post("/", {
    config: securityRouteConfig(mutationRateLimit, 'body'),
    schema: {
      body: objectBodySchema(
        {
          shipId: nonEmptyStringSchema,
          routeMode: { type: "string", enum: ["local", "jump_gate"] },
          targetX: boundedNumberSchema,
          targetY: boundedNumberSchema,
          targetZ: boundedNumberSchema,
          targetSystemX: boundedNumberSchema,
          targetSystemY: boundedNumberSchema,
          fuelLoaded: nonNegativeNumberSchema,
          jumpFuelLoaded: nonNegativeNumberSchema,
          cargoLoaded: nonNegativeNumberSchema,
          targetPlanetId: optionalNullableStringSchema,
          destinationSystemId: nonEmptyStringSchema,
        },
        ["shipId", "cargoLoaded"],
      ),
    },
  }, async (request, reply) => {
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return reply.status(401).send({
        error: "Unauthorized",
        message: "Missing session token",
      });
    }

    let payload: { userId: string };
    try {
      payload = jwt.verify(token, env.JWT_SECRET) as { userId: string };
    } catch {
      return reply.status(401).send({
        error: "Unauthorized",
        message: "Invalid or expired session token",
      });
    }

    const {
      shipId,
      routeMode,
      targetX,
      targetY,
      targetZ,
      targetSystemX,
      targetSystemY,
      fuelLoaded,
      jumpFuelLoaded,
      cargoLoaded,
      targetPlanetId,
      destinationSystemId,
    } = (request.body ?? {}) as Partial<LaunchExpeditionRequest>;

    if (!shipId) {
      const locale = resolveRequestLocale(request);
      return reply.status(400).send({
        error: formatLaunchExpeditionErrorMessage({ code: "expedition_ship_required" }, locale),
      });
    }

    if (
      cargoLoaded === undefined ||
      ((routeMode ?? "local") === "local" &&
        (targetX === undefined || targetY === undefined || targetZ === undefined)) ||
      ((routeMode ?? "local") === "jump_gate" && !destinationSystemId)
    ) {
      const locale = resolveRequestLocale(request);
      return reply.status(400).send({
        error:
          (routeMode ?? "local") === "jump_gate" && !destinationSystemId
            ? formatLaunchExpeditionErrorMessage({ code: "expedition_destination_required" }, locale)
            : formatLaunchExpeditionErrorMessage({ code: "expedition_invalid_numbers", routeMode: "local" }, locale),
      });
    }

    const result = await launchExpedition(payload.userId, {
      shipId,
      routeMode,
      targetX,
      targetY,
      targetZ,
      targetSystemX,
      targetSystemY,
      fuelLoaded,
      jumpFuelLoaded,
      cargoLoaded,
      targetPlanetId: targetPlanetId ?? undefined,
      destinationSystemId: destinationSystemId ?? undefined,
    });

    if (!result.success) {
      const locale = resolveRequestLocale(request);
      const details = result.code
        ? ({ code: result.code, ...(result.details ?? {}) } as LaunchExpeditionErrorDetails)
        : null;
      return reply.status(result.status).send({
        error: details ? formatLaunchExpeditionErrorMessage(details, locale) : result.error,
        code: result.code,
        details: result.details,
      });
    }

    const expeditionResult = (result.expedition?.result ?? {}) as {
      fuelRequired?: number;
      jumpFuelRequired?: number;
      routeMode?: string;
    };
    trackBackendEvent("expedition_launched", {
      routeMode: expeditionResult.routeMode ?? routeMode ?? "local",
      hasTargetPlanet: Boolean(targetPlanetId),
      fuelRequired: expeditionResult.fuelRequired ?? null,
      jumpFuelRequired: expeditionResult.jumpFuelRequired ?? null,
    }, { userId: payload.userId, requestId: request.id });
    return reply.send({
      expedition: result.expedition,
      ship: result.ship,
      queueItem: result.queueItem,
    });
  });
}
