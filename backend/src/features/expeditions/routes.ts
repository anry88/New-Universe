import { FastifyInstance } from "fastify";
import type {
  ExpeditionJumpRequest,
  LaunchExpeditionRequest,
} from "@shared/types/expeditions.js";
import jwt from "jsonwebtoken";
import { env } from "../../lib/env.js";
import { launchExpedition } from "./launch.js";
import { jumpShip } from "./jump.js";
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
      return reply.status(400).send({
        error: "shipId is required",
      });
    }

    const result = await jumpShip(payload.userId, body as ExpeditionJumpRequest);

    if (!result.success) {
      return reply.status(result.status).send({ error: result.error });
    }

    return reply.send({
      targetSystem: result.targetSystem,
      arrivalPlanetId: result.arrivalPlanetId,
      targetPlanet: result.targetPlanet,
      ship: result.ship,
      destination: result.destination,
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
          fuelLoaded: nonNegativeNumberSchema,
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
      fuelLoaded,
      cargoLoaded,
      targetPlanetId,
      destinationSystemId,
    } = (request.body ?? {}) as Partial<LaunchExpeditionRequest>;

    if (
      !shipId ||
      cargoLoaded === undefined ||
      ((routeMode ?? "local") === "local" &&
        (targetX === undefined || targetY === undefined || targetZ === undefined)) ||
      ((routeMode ?? "local") === "jump_gate" && !destinationSystemId)
    ) {
      return reply.status(400).send({
        error:
          (routeMode ?? "local") === "local"
            ? "shipId, targetX, targetY, targetZ, and cargoLoaded are required"
            : "shipId, destinationSystemId, and cargoLoaded are required",
      });
    }

    const result = await launchExpedition(payload.userId, {
      shipId,
      routeMode,
      targetX,
      targetY,
      targetZ,
      fuelLoaded,
      cargoLoaded,
      targetPlanetId: targetPlanetId ?? undefined,
      destinationSystemId: destinationSystemId ?? undefined,
    });

    if (!result.success) {
      return reply.status(result.status).send({ error: result.error });
    }

    return reply.send({
      expedition: result.expedition,
      ship: result.ship,
      queueItem: result.queueItem,
    });
  });
}
