/**
 * Tutorial rewards — single source for backend grants and UI copy.
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

/** Human-readable reward lines for Cosmic onboarding UI (English). */
export const TUTORIAL_STEP_REWARD_SUMMARY_EN: Record<TutorialStepId, string> = {
  0: '+100 Diamonds after opening the tutorial',
  1: '+100 Diamonds after your first mine is built',
  2: '+100 Diamonds after storage is built',
  3: '+100 Diamonds after your scout is ready',
  4: '+100 Diamonds after you send the scout',
};

export const TUTORIAL_STEP_REWARD_SUMMARY_RU: Record<TutorialStepId, string> = {
  0: '+100 алмазов после открытия обучения',
  1: '+100 алмазов после постройки первой шахты',
  2: '+100 алмазов после постройки склада',
  3: '+100 алмазов, когда разведчик будет готов',
  4: '+100 алмазов после отправки разведчика',
};
