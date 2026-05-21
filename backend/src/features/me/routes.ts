import { FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { env } from "../../lib/env.js";
import { db } from "../../db/index.js";
import {
  users,
  systems,
  discoveredPlanets,
  colonies,
  planets,
  planetResources,
  richness,
  resources as resourceDefinitions,
  ships,
  expeditions,
  productionOrders,
  researchProgress,
} from "../../db/schema.js";
import { and, asc, eq, inArray, ne, or } from "drizzle-orm";
import { syncTutorialProgress } from "../tutorial/service.js";
import { homeSystemShortTag } from "@shared/format/homeSystemNaming.js";
import { queueDuePlayerStateSync } from "./online-sync.js";
import {
  createResearchEffectsRequestCache,
  getResearchEffectsForUser,
} from "../research/effects.js";
import {
  computeCurrentResourcesFromSnapshot,
  type PlanetResourceRecord,
} from "../resources/accrual.js";
import {
  deriveBuildingQueueStartedAt,
  deriveResearchStartedAt,
  deriveShipQueueStartedAt,
} from "../timers.js";
import { getResearchDef } from "../research/data.js";
import { rushPricingMeta } from "../../lib/diamonds.js";
import { sendLocalizedError } from "../../lib/i18n.js";
import {
  isSupportedLocale,
  type UpdatePreferredLocaleRequest,
  type UpdatePreferredLocaleResponse,
} from "@shared/types/locale.js";
import {
  NOTIFICATION_CATEGORIES,
  normalizeNotificationPreferences,
  type NotificationPreferences,
} from "@shared/types/notifications.js";
import {
  ENERGY_RESOURCE_ID,
  resolvePlanetEnergyStateFromSnapshot,
  type EnergyResourceRow,
  type PlanetEnergyInput,
} from "../resources/energy.js";
import { mutationRateLimit } from "../../lib/rate-limit.js";
import { objectBodySchema, securityRouteConfig } from "../../lib/security.js";
import { startPlayerActivitySession } from "../../lib/metrics.js";
import {
  COLONIZATION_RULES,
  maxColoniesForLogisticsLevel,
} from "../../config/colonization-rules.js";
import { loadExpansionColonies } from "../colonies/colonization-rules.js";
import { SHIP_STATUS_DESTROYED } from "@shared/types/combat.js";
import type { StartOnlineSessionResponse } from "@shared/types/activity.js";

type UserRow = typeof users.$inferSelect;
type UpdatePreferencesRequestBody = Partial<UpdatePreferredLocaleRequest> | null;

function normalizedOrbitIndex(planet: { orbitIndex?: number | null }): number {
  return typeof planet.orbitIndex === "number" && planet.orbitIndex >= 1
    ? Math.floor(planet.orbitIndex)
    : Number.MAX_SAFE_INTEGER;
}

function hasReadyCommandCenter(planet: {
  buildings?: Array<{ typeId: string; queueAction?: string | null }>;
}): boolean {
  return (planet.buildings ?? []).some(
    (building) =>
      building.typeId === "command_center" && building.queueAction !== "build",
  );
}

function comparePlayerPlanets(a: any, b: any): number {
  const capitalDelta =
    Number(hasReadyCommandCenter(b)) - Number(hasReadyCommandCenter(a));
  if (capitalDelta !== 0) return capitalDelta;

  const orbitDelta = normalizedOrbitIndex(a) - normalizedOrbitIndex(b);
  if (orbitDelta !== 0) return orbitDelta;

  return String(a.id).localeCompare(String(b.id));
}

function readBearerToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;
  return authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
}

async function loadSessionUser(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<UserRow | null> {
  const token = readBearerToken(request);

  if (!token) {
    sendLocalizedError(reply, request, 401, "missingSessionToken");
    return null;
  }

  let payload: { userId: string };
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as { userId: string };
  } catch {
    sendLocalizedError(reply, request, 401, "invalidSessionToken");
    return null;
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.userId),
  });

  if (!user) {
    sendLocalizedError(reply, request, 401, "userNotFound");
    return null;
  }

  return user;
}

export async function meRoutes(app: FastifyInstance) {
  app.post(
    "/session/start",
    {
      config: securityRouteConfig(mutationRateLimit, "session-no-body"),
    },
    async (request, reply) => {
      const user = await loadSessionUser(request, reply);
      if (!user) return;

      const startedAt = await startPlayerActivitySession(user.id);
      return reply.send({ startedAt } satisfies StartOnlineSessionResponse);
    },
  );

  app.get("/", async (request, reply) => {
    const user = await loadSessionUser(request, reply);
    if (!user) return;

    try {
      const researchEffectsCache = createResearchEffectsRequestCache();
      const [buildingTypeRows, shipTypeRows, researchEffects] = await Promise.all([
        db.query.buildingTypes.findMany(),
        db.query.shipTypes.findMany(),
        getResearchEffectsForUser(user.id, db, researchEffectsCache),
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
            // Planet ids are random UUIDs, so keep a stable physical order
            // from orbit metadata. User-visible names are mutable and must
            // never affect map or default-settlement ordering.
            orderBy: [asc(planets.orbitIndex), asc(planets.id)],
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
              orbitIndex: p.orbitIndex,
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
        where: and(
          eq(ships.ownerId, user.id),
          ne(ships.status, SHIP_STATUS_DESTROYED),
        ),
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
                eq(expeditions.status, "stationed"),
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
      const logisticsLevel =
        userResearchRows.find((row) => row.branch === "logistics")?.level ?? 0;
      const maxColonies = maxColoniesForLogisticsLevel(logisticsLevel);
      const expansionColonies = await loadExpansionColonies(user.id);
      const currentColonies = expansionColonies.length;
      const latestColonyFoundedAt =
        [...expansionColonies].sort(
          (a, b) => b.foundedAt.getTime() - a.foundedAt.getTime(),
        )[0]?.foundedAt ?? null;
      const cooldownRemainingSec = latestColonyFoundedAt
        ? Math.max(
            0,
            COLONIZATION_RULES.cooldownSec -
              Math.floor((Date.now() - latestColonyFoundedAt.getTime()) / 1000),
          )
        : 0;
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

      const homePlanets = (homeSystem?.planets || [])
        .map(markPlanetSettlement)
        .sort(comparePlayerPlanets);
      const homePlanetIds = new Set(homePlanets.map((planet: any) => planet.id));
      const colonyPlanets = userColonies
        .map((c) => markPlanetSettlement(c.planet))
        .filter((planet: any) => !homePlanetIds.has(planet.id));
      const allPlanets = [...homePlanets, ...colonyPlanets];
      const allPlanetIds = allPlanets
        .filter((planet: any) => planet.isDiscovered !== false)
        .map((planet: any) => planet.id);
      const snapshotNow = new Date();
      const [activeProductionRows, resourceRows, richnessRows] = allPlanetIds.length
        ? await Promise.all([
            db.query.productionOrders.findMany({
              where: and(
                inArray(productionOrders.planetId, allPlanetIds),
                inArray(productionOrders.status, ["queued", "paused"]),
              ),
            }),
            db
              .select({
                planetId: planetResources.planetId,
                resourceId: planetResources.resourceId,
                amount: planetResources.amount,
                regenRate: planetResources.regenRate,
                lastUpdateAt: planetResources.lastUpdateAt,
                storageCap: resourceDefinitions.defaultStorageCap,
              })
              .from(planetResources)
              .innerJoin(resourceDefinitions, eq(resourceDefinitions.id, planetResources.resourceId))
              .where(inArray(planetResources.planetId, allPlanetIds)),
            db.query.richness.findMany({
              where: inArray(richness.planetId, allPlanetIds),
            }),
          ])
        : [[], [], []] as [any[], PlanetResourceRecord[], any[]];
      const activeProductionByBuildingId = new Map<string, any[]>();
      const activeProductionByPlanetId = new Map<string, { buildingId: string | null; status: string }[]>();
      for (const order of activeProductionRows) {
        const planetOrders = activeProductionByPlanetId.get(order.planetId) ?? [];
        planetOrders.push({ buildingId: order.buildingId, status: order.status });
        activeProductionByPlanetId.set(order.planetId, planetOrders);

        if (!order.buildingId) continue;
        const mappedOrder = {
          id: order.id,
          userId: order.userId,
          planetId: order.planetId,
          buildingId: order.buildingId,
          recipeId: order.recipeId,
          quantity: Number(order.quantity),
          status: order.status,
          inputs: order.inputs,
          outputs: order.outputs,
          startedAt: order.startedAt.toISOString(),
          completesAt: order.completesAt.toISOString(),
          completedAt: order.completedAt?.toISOString() ?? null,
          pausedAt: order.pausedAt?.toISOString() ?? null,
        };
        const orders = activeProductionByBuildingId.get(order.buildingId) ?? [];
        orders.push(mappedOrder);
        activeProductionByBuildingId.set(order.buildingId, orders);
      }

      const resourceRowsByPlanetId = new Map<string, PlanetResourceRecord[]>();
      const energyRowsByPlanetId = new Map<string, EnergyResourceRow>();
      for (const row of resourceRows) {
        const rows = resourceRowsByPlanetId.get(row.planetId!) ?? [];
        rows.push(row);
        resourceRowsByPlanetId.set(row.planetId!, rows);
        if (row.resourceId === ENERGY_RESOURCE_ID) {
          energyRowsByPlanetId.set(row.planetId!, row as EnergyResourceRow);
        }
      }

      const richnessByPlanetId = new Map<string, Map<string, number>>();
      for (const row of richnessRows) {
        const planetRichness = richnessByPlanetId.get(row.planetId) ?? new Map<string, number>();
        planetRichness.set(row.resourceId, row.value);
        richnessByPlanetId.set(row.planetId, planetRichness);
      }

      const toEnergySnapshotPlanet = (planet: any): PlanetEnergyInput => ({
        id: planet.id,
        name: planet.name,
        biome: planet.biome,
        size: planet.size,
        orbitIndex: planet.orbitIndex,
        system: planet.system ?? null,
        buildings: (planet.buildings ?? []).map((building: any) => {
          const typeInfo = building.type ?? buildingTypeMap.get(building.typeId) ?? null;
          return {
            ...building,
            type: typeInfo
              ? {
                  id: typeInfo.id,
                  baseOutput: (typeInfo.baseOutput ?? {}) as Record<string, unknown>,
                  energyConsumption: Number(typeInfo.energyConsumption ?? 0),
                }
              : null,
          };
        }),
      });

      const enrichedPlanets = allPlanets.map((planet: any) => {
        if (planet.isDiscovered === false) {
          return planet;
        }
        const energyPlanet = toEnergySnapshotPlanet(planet);
        const energyState = resolvePlanetEnergyStateFromSnapshot(
          energyPlanet,
          energyRowsByPlanetId.get(planet.id) ?? null,
          {
            now: snapshotNow,
            effects: researchEffects,
            activeProductionOrders: activeProductionByPlanetId.get(planet.id) ?? [],
          },
        );
        const res = computeCurrentResourcesFromSnapshot({
          planet: energyPlanet,
          resourceRows: resourceRowsByPlanetId.get(planet.id) ?? [],
          energyState,
          researchEffects,
          now: snapshotNow,
        });
        const richnessByResourceId = richnessByPlanetId.get(planet.id) ?? new Map<string, number>();
        return {
          ...planet,
          isDiscovered: true,
          energy: {
            stored: energyState.stored,
            capacity: energyState.capacity,
            produced: energyState.produced,
            consumed: energyState.consumed,
            net: energyState.net,
            shortage: energyState.shortage,
          },
          buildings: (planet.buildings ?? []).map((building: any) => ({
            ...building,
            energy: energyState.buildingStates[building.id],
            production: activeProductionByBuildingId.has(building.id)
              ? { activeOrders: activeProductionByBuildingId.get(building.id) ?? [] }
              : undefined,
          })),
          resources: res.map((r) => ({
            ...r,
            amount: r.amount.toString(),
            regenRate: r.regenRate.toString(),
            richness: richnessByResourceId.get(r.resourceId) ?? 0,
            storageCap: r.storageCap.toString(),
            lastUpdateAt: r.lastUpdateAt.toISOString(),
          })),
        };
      });

      const userObj = {
        ...user,
        tgId: user.tgId.toString(),
        notificationPreferences: normalizeNotificationPreferences(
          user.notificationPreferences,
        ),
        tutorialStep: tutorialProgress.tutorialStepCompleted,
        tutorialCompletedAt: tutorialProgress.tutorialCompletedAt?.toISOString() ?? null,
        tutorialRewardsClaimed: tutorialProgress.tutorialRewardsClaimed,
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
        colonization: {
          currentColonies,
          maxColonies,
          logisticsLevel,
          maxColoniesBase: COLONIZATION_RULES.maxColoniesBase,
          maxColoniesPerLogisticsLevel:
            COLONIZATION_RULES.maxColoniesPerLogisticsLevel,
          cooldownSec: COLONIZATION_RULES.cooldownSec,
          cooldownRemainingSec,
        },
        rushPricing: rushPricingMeta(),
      };

      const response = reply.send({ user: userObj });
      queueDuePlayerStateSync(user.id, request.log);
      return response;
    } catch (err) {
      request.log.error(err, "Error fetching player state");
      return sendLocalizedError(reply, request, 500, "internalServerError", user.preferredLocale);
    }
  });

  app.patch("/preferences", {
    config: securityRouteConfig(mutationRateLimit, 'body'),
    schema: {
      body: objectBodySchema(
        {
          preferredLocale: { type: 'string', enum: ['en', 'ru'] },
          notificationPreferences: {
            type: 'object',
            properties: Object.fromEntries(
              NOTIFICATION_CATEGORIES.map((category) => [
                category,
                { type: 'boolean' },
              ]),
            ),
            additionalProperties: false,
          },
        },
        [],
      ),
    },
  }, async (request, reply) => {
    const user = await loadSessionUser(request, reply);
    if (!user) return;

    const body = request.body as UpdatePreferencesRequestBody;
    if (
      body?.preferredLocale !== undefined &&
      !isSupportedLocale(body.preferredLocale)
    ) {
      return sendLocalizedError(
        reply,
        request,
        400,
        "invalidPreferredLocale",
        user.preferredLocale,
      );
    }

    const preferredLocale = body?.preferredLocale ?? user.preferredLocale;
    const notificationPreferences: NotificationPreferences =
      body?.notificationPreferences
        ? normalizeNotificationPreferences({
            ...normalizeNotificationPreferences(user.notificationPreferences),
            ...body.notificationPreferences,
          })
        : normalizeNotificationPreferences(user.notificationPreferences);

    await db
      .update(users)
      .set({
        preferredLocale,
        notificationPreferences,
      })
      .where(eq(users.id, user.id));

    return reply.send({
      preferredLocale,
      notificationPreferences,
    } satisfies UpdatePreferredLocaleResponse);
  });
}
