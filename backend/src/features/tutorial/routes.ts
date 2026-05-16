import { FastifyInstance } from 'fastify';
import { env } from '../../lib/env.js';
import { claimTutorialReward, syncTutorialProgress } from './service.js';
import { mutationRateLimit } from '../../lib/rate-limit.js';
import { objectBodySchema, requireSessionUserId, securityRouteConfig } from '../../lib/security.js';
import { isTutorialStepId, TUTORIAL_FINAL_STEP } from '@shared/config/tutorialRewards.js';
import { trackBackendEvent } from '../../lib/analytics.js';
import type {
  TutorialClaimRequest,
  TutorialClaimResponse,
  TutorialSyncResponse,
} from '@shared/types/tutorial.js';

function serializeProgress(progress: Awaited<ReturnType<typeof syncTutorialProgress>>): TutorialSyncResponse {
  return {
    tutorialStep: progress.tutorialStepCompleted,
    tutorialCompletedAt: progress.tutorialCompletedAt?.toISOString() ?? null,
    tutorialRewardsClaimed: progress.tutorialRewardsClaimed,
  };
}

export async function tutorialRoutes(app: FastifyInstance) {
  /** Syncs milestone detection without granting rewards; claims are handled by `POST /claim`. */
  app.post('/sync', {
    config: securityRouteConfig(mutationRateLimit, 'session-no-body'),
  }, async (request, reply) => {
    const userId = await requireSessionUserId(request, reply, env.JWT_SECRET);
    if (!userId) return;

    const progress = await syncTutorialProgress(userId);
    trackBackendEvent('tutorial_synced', {
      tutorialStep: progress.tutorialStepCompleted,
      tutorialCompleted: Boolean(progress.tutorialCompletedAt),
      claimedRewardCount: progress.tutorialRewardsClaimed.toString(2).replace(/0/g, '').length,
    }, { userId, requestId: request.id });
    return reply.send(serializeProgress(progress));
  });

  app.post('/claim', {
    config: securityRouteConfig(mutationRateLimit, 'body'),
    schema: {
      body: objectBodySchema(
        {
          stepId: {
            type: 'integer',
            minimum: 0,
            maximum: TUTORIAL_FINAL_STEP,
          },
        },
        ['stepId'],
      ),
    },
  }, async (request, reply) => {
    const userId = await requireSessionUserId(request, reply, env.JWT_SECRET);
    if (!userId) return;

    const body = request.body as Partial<TutorialClaimRequest> | null;
    const stepId = body?.stepId;
    if (typeof stepId !== 'number' || !isTutorialStepId(stepId)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid tutorial reward step',
      });
    }

    try {
      const result = await claimTutorialReward(userId, stepId);
      trackBackendEvent('tutorial_reward_claimed', {
        stepId,
        rewardGranted: result.rewardGranted,
        rewardDiamonds: result.rewardDiamonds,
        tutorialCompleted: Boolean(result.tutorialCompletedAt),
      }, { userId, requestId: request.id });
      return reply.send({
        ...serializeProgress(result),
        diamonds: result.diamonds,
        rewardDiamonds: result.rewardDiamonds,
        rewardGranted: result.rewardGranted,
        claimedStepId: result.claimedStepId,
      } satisfies TutorialClaimResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to claim tutorial reward';
      if (message.includes('not complete')) {
        return reply.status(409).send({
          error: 'Conflict',
          message,
        });
      }
      throw error;
    }
  });
}
