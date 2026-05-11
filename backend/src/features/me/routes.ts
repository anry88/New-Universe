import { FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";
import { env } from "../../lib/env.js";
import { db } from "../../db/index.js";
import {
  users,
  systems,
  discoveredPlanets,
  planets,
  ships,
  expeditions,
  researchProgress,
} from "../../db/schema.js";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { syncTutorialProgress } from "../tutorial/service.js";
import { homeSystemShortTag } from "@shared/format/homeSystemNaming.js";
import { syncDuePlayerState } from "./online-sync.js";
import { getResearchEffectsForUser } from "../research/effects.js";
import {
  deriveBuildingQueueStartedAt,
  deriveResearchStartedAt,
  deriveShipQueueStartedAt,
} from "../timers.js";
import { getResearchDef } from "../research/data.js";
import { rushPricingMeta } from "../../lib/diamonds.js";

export async function meRoutes(app: FastifyInstance) {
  app.get("/", async (request, reply) => {
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

    try {
      const user = await db.query.users.findFirst({
        where: eq(users.id, payload.userId),
      });

      if (!user) {
        return reply.status(401).send({
          error: "Unauthorized",
          message: "User not found",
        });
      }

      await syncDuePlayerState(user.id);

      const [buildingTypeRows, shipTypeRows, researchEffects] = await Promise.all([
        db.query.buildingTypes.findMany(),
        db.query.shipTypes.findMany(),
        getResearchEffectsForUser(user.id, db),
      ]);
      const buildingTypeMap = new Map(buildingTypeRows.map((row) => [row.id, row]));
      const shipTypeMap = new Map(shipTypeRows.map((row) => [row.id, row]));
      const enrichPlanetTimers = (planet: any) => ({
        ...planet,
        buildings: (planet.buildings ?? []).map((building: any) => ({
          ...building,
          queueStartedAt: deriveBuildingQueueStartedAt(
            building,
            buildingTypeMap.get(building.typeId),
            researchEffects,
          ),
        })),
      });

      const discoveredPlanetIds = await db
        .select({ planetId: discoveredPlanets.planetId })
        .from(discoveredPlanets)
        .where(eq(discoveredPlanets.userId, user.id));
      const discoveredPlanetIdSet = new Set(
        discoveredPlanetIds.map((r) => r.planetId),
      );

      let homeSystem = await db.query.systems.findFirst({
        where: eq(systems.ownerId, user.id),
        with: {
          planets: {
            with: {
              buildings: true,
            },
            // Planet ids are random UUIDs, so the default query order is
            // effectively random. The frontend treats `planets[0]` as the
            // home/capital planet (e.g. for resource-bar context and the
            // research lab lookup), and any other planet would surface
            // wrong totals and break research gating. Planet names follow
            // the `<tag>-<orbit>` convention (capital is always `-1`),
            // so an ascending lexical order on `name` always puts the
            // capital first.
            orderBy: [asc(planets.name)],
          },
        },
      });

      if (homeSystem?.planets?.length) {
        homeSystem = {
          ...homeSystem,
          planets: homeSystem.planets.map((p) => {
            const isDiscovered = discoveredPlanetIdSet.has(p.id);
            if (isDiscovered) {
              return { ...enrichPlanetTimers(p), isDiscovered: true };
            }
            // Obfuscate undiscovered planet
            return {
              id: p.id,
              systemId: p.systemId,
              biome: "unknown",
              size: 0,
              slotCount: 0,
              name: "Unknown Planet",
              isDiscovered: false,
              buildings: [],
            };
          }),
        };
      }

      if (!homeSystem) {
        const discoveredPlanet = await db.query.discoveredPlanets.findFirst({
          where: eq(discoveredPlanets.userId, user.id),
        });

        if (discoveredPlanet) {
          const discoveredSystem = await db.query.planets.findFirst({
            where: eq(planets.id, discoveredPlanet.planetId),
            with: {
              system: {
                with: {
                  planets: {
                    with: {
                      buildings: true,
                    },
                  },
                },
              },
            },
          });
          homeSystem = discoveredSystem?.system;
        }
      }

      const userShips = await db.query.ships.findMany({
        where: eq(ships.ownerId, user.id),
      });
      const enrichedShips = userShips.map((ship) => ({
        ...ship,
        queueStartedAt: deriveShipQueueStartedAt(
          ship,
          shipTypeMap.get(ship.typeId),
        ),
      }));

      const userShipIds = enrichedShips.map((ship) => ship.id);
      const activeExpeditions = userShipIds.length
        ? await db.query.expeditions.findMany({
            where: and(
              inArray(expeditions.shipId, userShipIds),
              or(
                eq(expeditions.status, "in_flight"),
                eq(expeditions.status, "returning"),
              ),
            ),
          })
        : [];

      const userResearchRows = await db.query.researchProgress.findMany({
        where: eq(researchProgress.userId, user.id),
      });
      const userResearch = userResearchRows.map((row) => {
        const nextDef = row.completesAt
          ? getResearchDef(row.branch, row.level + 1)
          : undefined;
        return {
          ...row,
          startedAt: deriveResearchStartedAt(
            row.completesAt,
            nextDef?.timeSec,
          ),
        };
      });

      const tutorialProgress = await syncTutorialProgress(user.id);

      const { computeCurrentResources } =
        await import("../resources/accrual.js");
      const { colonies } = await import("../../db/schema.js");

      const userColonies = await db.query.colonies.findMany({
        where: and(eq(colonies.ownerId, user.id), eq(colonies.status, "active")),
        with: {
          planet: {
            with: {
              buildings: true,
            },
          },
        },
      });

      const colonyPlanetIds = new Set(userColonies.map((c) => c.planetId));
      const markPlanetSettlement = (planet: any) => {
        const planetWithTimers = enrichPlanetTimers(planet);
        const hasCommandCenter = (planetWithTimers.buildings ?? []).some(
          (building: any) =>
            building.typeId === "command_center" &&
            building.queueAction !== "build",
        );
        const isCapital =
          planet.systemId === homeSystem?.id &&
          homeSystem?.ownerId === user.id &&
          hasCommandCenter;
        return {
          ...planetWithTimers,
          isColonized: isCapital || colonyPlanetIds.has(planet.id),
        };
      };

      const homePlanets = (homeSystem?.planets || []).map(markPlanetSettlement);
      const homePlanetIds = new Set(homePlanets.map((planet: any) => planet.id));
      const colonyPlanets = userColonies
        .map((c) => markPlanetSettlement(c.planet))
        .filter((planet: any) => !homePlanetIds.has(planet.id));
      const allPlanets = [...homePlanets, ...colonyPlanets];

      const enrichedPlanets = await Promise.all(
        allPlanets.map(async (planet: any) => {
          if (planet.isDiscovered === false) {
            return planet;
          }
          const res = await computeCurrentResources(planet.id);
          return {
            ...planet,
            isDiscovered: true,
            resources: res.map((r) => ({
              ...r,
              amount: r.amount.toString(),
              regenRate: r.regenRate.toString(),
              storageCap: r.storageCap.toString(),
              lastUpdateAt: r.lastUpdateAt.toISOString(),
            })),
          };
        }),
      );

      const userObj = {
        ...user,
        tgId: user.tgId.toString(),
        tutorialStep: tutorialProgress.tutorialStepCompleted,
        tutorialCompletedAt: tutorialProgress.tutorialCompletedAt,
        homeSystem: homeSystem
          ? {
              ...homeSystem,
              shortTag: homeSystemShortTag(homeSystem.id),
              planets: enrichedPlanets.filter(
                (p) => p.systemId === homeSystem?.id,
              ),
            }
          : undefined,
        planets: enrichedPlanets.filter((p) => p.isDiscovered !== false),
        ships: enrichedShips,
        expeditions: activeExpeditions,
        research: userResearch,
        rushPricing: rushPricingMeta(),
      };

      return reply.send({ user: userObj });
    } catch (err) {
      request.log.error(err, "Error fetching player state");
      return reply.status(500).send({
        error: "Internal Server Error",
        message: "Failed to fetch player state",
      });
    }
  });
}
