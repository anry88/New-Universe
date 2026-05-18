/**
 * Tutorial rewards — single source for backend grants.
 * Each of the five onboarding steps is claimed manually and grants diamonds.
 */
export const TUTORIAL_STEP_IDS = [0, 1, 2, 3, 4] as const;
export type TutorialStepId = (typeof TUTORIAL_STEP_IDS)[number];

export const TUTORIAL_FINAL_STEP: TutorialStepId = 4;
export const TUTORIAL_REWARD_DIAMONDS = 100;

export function tutorialRewardBit(stepId: TutorialStepId): number {
  return 1 << stepId;
}

export const TUTORIAL_ALL_REWARDS_CLAIMED_MASK = TUTORIAL_STEP_IDS.reduce<number>(
  (mask, stepId) => mask | tutorialRewardBit(stepId),
  0,
);

export function isTutorialStepId(stepId: number): stepId is TutorialStepId {
  return TUTORIAL_STEP_IDS.includes(stepId as TutorialStepId);
}

export function isTutorialRewardClaimed(mask: number, stepId: TutorialStepId): boolean {
  return (mask & tutorialRewardBit(stepId)) !== 0;
}

export function areAllTutorialRewardsClaimed(mask: number): boolean {
  return (mask & TUTORIAL_ALL_REWARDS_CLAIMED_MASK) === TUTORIAL_ALL_REWARDS_CLAIMED_MASK;
}
