import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../../lib/env.js';
import { db } from '../../db/index.js';
import { researchProgress, buildings, planets, systems } from '../../db/schema.js';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { getResearchDef } from './data.js';
import { spendResources } from '../resources/transactions.js';
import { rushActiveResearch } from './rush.js';
import type { RushResearchRequest } from '@shared/types/research.js';

export async function researchRoutes(app: FastifyInstance) {
  app.post('/start', async (request, reply) => {
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    let userId: string;
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as { userId: string };
      userId = payload.userId;
    } catch {
      return reply.status(401).send({ error: 'Invalid token' });
    }

    const { branch, planetId } = request.body as { branch?: string; planetId?: string };

    if (!branch || !planetId) {
      return reply.status(400).send({ error: 'branch and planetId are required' });
    }

    // Verify planet belongs to user
    const planet = await db.query.planets.findFirst({ where: eq(planets.id, planetId) });
    if (!planet) return reply.status(404).send({ error: 'Planet not found' });
    const system = await db.query.systems.findFirst({ where: eq(systems.id, planet.systemId) });
    if (!system || system.ownerId !== userId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    // Check if research already in progress
    const active = await db.query.researchProgress.findFirst({
        where: and(eq(researchProgress.userId, userId), eq(researchProgress.branch, branch))
    });
    
    if (active?.completesAt && active.completesAt > new Date()) {
        return reply.status(400).send({ error: 'Research already in progress' });
    }

    const nextLevel = (active?.level || 0) + 1;
    const def = getResearchDef(branch, nextLevel);

    if (!def) {
      return reply.status(404).send({ error: 'Research level not found' });
    }

    // Check requirements: Research Lab.
    //
    // The lab is `maxGlobal: 1` — at most one across the player's empire —
    // so the lab is not necessarily on the same planet the request comes
    // from. We look up any *completed* lab on any of the user's planets
    // and use its level. Two important details:
    //
    //   * `queueAction IS NOT NULL` excludes labs that are still being
    //     built or upgraded (the building row exists with `level=N` while
    //     queued, which used to falsely satisfy this gate).
    //   * If the player has somehow ended up with two lab rows (e.g.
    //     migration artefacts), we use the highest-level one.
    const labReq = def.requirements.buildings?.find(
      (b: { typeId: string; level: number }) => b.typeId === 'lab',
    );
    if (labReq) {
      const labs = await db
        .select({ level: buildings.level })
        .from(buildings)
        .innerJoin(planets, eq(planets.id, buildings.planetId))
        .innerJoin(systems, eq(systems.id, planets.systemId))
        .where(
          and(
            eq(systems.ownerId, userId),
            eq(buildings.typeId, 'lab'),
            isNull(buildings.queueAction),
          ),
        )
        .orderBy(desc(buildings.level))
        .limit(1);
      const labLevel = labs[0]?.level ?? 0;
      if (labLevel < labReq.level) {
        return reply
          .status(400)
          .send({ error: `Research Lab level ${labReq.level} required` });
      }
    }

    // Check requirements: Prerequisite Research
    if (def.requirements.research) {
      for (const req of def.requirements.research) {
        const reqProgress = await db.query.researchProgress.findFirst({
          where: and(eq(researchProgress.userId, userId), eq(researchProgress.branch, req.branch)),
        });
        if (!reqProgress || reqProgress.level < req.level) {
          return reply.status(400).send({ error: `Prerequisite research ${req.branch} level ${req.level} required` });
        }
      }
    }

    // Spend resources
    const costs = Object.entries(def.cost).map(([id, amount]) => ({ resourceId: id, amount: amount as number }));
    const spendResult = await spendResources(planetId, costs);
    if (!spendResult.success) {
      return reply.status(400).send({ error: spendResult.error });
    }

    const startedAt = new Date();
    const completesAt = new Date(startedAt.getTime() + def.timeSec * 1000);

    // Upsert progress
    if (active) {
      await db.update(researchProgress)
        .set({ completesAt })
        .where(and(eq(researchProgress.userId, userId), eq(researchProgress.branch, branch)));
    } else {
      await db.insert(researchProgress)
        .values({ userId, branch, level: 0, completesAt });
    }

    return reply.send({ success: true, completesAt, startedAt });
  });

  app.post('/rush', async (request, reply) => {
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    let userId: string;
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as { userId: string };
      userId = payload.userId;
    } catch {
      return reply.status(401).send({ error: 'Invalid token' });
    }

    const { branch } = request.body as RushResearchRequest;
    if (!branch || typeof branch !== 'string') {
      return reply.status(400).send({ error: 'branch is required' });
    }

    try {
      const result = await rushActiveResearch(userId, branch);
      return reply.send(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Bad Request';
      return reply.status(400).send({ error: message });
    }
  });
}
