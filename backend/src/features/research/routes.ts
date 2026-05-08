import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../../lib/env.js';
import { db } from '../../db/index.js';
import { researchProgress, buildings, planets, systems } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getResearchDef } from './data.js';
import { spendResources } from '../resources/transactions.js';

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

    // Check requirements: Research Lab
    const labReq = def.requirements.buildings?.find((b: { typeId: string; level: number }) => b.typeId === 'research_lab');
    if (labReq) {
      const lab = await db.query.buildings.findFirst({
        where: and(eq(buildings.planetId, planetId), eq(buildings.typeId, 'research_lab')),
      });
      if (!lab || lab.level < labReq.level) {
        return reply.status(400).send({ error: `Research Lab level ${labReq.level} required` });
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

    const completesAt = new Date(Date.now() + def.timeSec * 1000);

    // Upsert progress
    if (active) {
      await db.update(researchProgress)
        .set({ completesAt })
        .where(and(eq(researchProgress.userId, userId), eq(researchProgress.branch, branch)));
    } else {
      await db.insert(researchProgress)
        .values({ userId, branch, level: 0, completesAt });
    }

    return reply.send({ success: true, completesAt });
  });
}
