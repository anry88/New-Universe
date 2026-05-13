import { FastifyInstance } from "fastify";
import type { ExpeditionJumpRequest } from "@shared/types/expeditions.js";
import jwt from "jsonwebtoken";
import { env } from "../../lib/env.js";
import { launchExpedition } from "./launch.js";
import { jumpShip } from "./jump.js";

export async function expeditionsRoutes(app: FastifyInstance) {
  app.post("/jump", async (request, reply) => {
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
    });
  });

  app.post("/", async (request, reply) => {
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
      targetX,
      targetY,
      targetZ,
      fuelLoaded,
      cargoLoaded,
      targetPlanetId,
    } = request.body as {
      shipId?: string;
      targetX?: number;
      targetY?: number;
      targetZ?: number;
      fuelLoaded?: number;
      cargoLoaded?: number;
      targetPlanetId?: string | null;
    };

    if (
      !shipId ||
      targetX === undefined ||
      targetY === undefined ||
      targetZ === undefined ||
      cargoLoaded === undefined
    ) {
      return reply.status(400).send({
        error:
          "shipId, targetX, targetY, targetZ, and cargoLoaded are required",
      });
    }

    const result = await launchExpedition(payload.userId, {
      shipId,
      targetX,
      targetY,
      targetZ,
      fuelLoaded,
      cargoLoaded,
      targetPlanetId: targetPlanetId ?? undefined,
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
