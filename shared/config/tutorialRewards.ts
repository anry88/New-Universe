/**
 * Tutorial step rewards — single source for backend grants and UI copy.
 * Totals with completion bonus: +200 iron and +100 water vs starting cargo (see service tests).
 */
export type TutorialResourceGrant = { resourceId: string; amount: number };

/** Granted when the player first reaches tutorial sync step `step` (1…4). */
export const TUTORIAL_STEP_RESOURCE_GRANTS: Record<number, TutorialResourceGrant[]> = {
  1: [
    { resourceId: 'iron', amount: 10 },
    { resourceId: 'water', amount: 15 },
  ],
  2: [
    { resourceId: 'iron', amount: 15 },
    { resourceId: 'water', amount: 15 },
  ],
  3: [
    { resourceId: 'iron', amount: 15 },
    { resourceId: 'water', amount: 15 },
  ],
  4: [
    { resourceId: 'iron', amount: 15 },
    { resourceId: 'water', amount: 15 },
  ],
};

/** Final payout when expedition exists (step 4) and tutorial is marked complete. */
export const TUTORIAL_COMPLETION_RESOURCE_GRANTS: TutorialResourceGrant[] = [
  { resourceId: 'iron', amount: 145 },
  { resourceId: 'water', amount: 40 },
];

/** Human-readable reward lines for Cosmic onboarding UI (English). */
export const TUTORIAL_STEP_REWARD_SUMMARY_EN: Record<number, string> = {
  1: '+10 Iron, +15 Water when your first mine finishes syncing',
  2: '+15 Iron, +15 Water when storage is built',
  3: '+15 Iron, +15 Water when your scout is ready',
  4: '+15 Iron, +15 Water when an expedition is launched',
};

export const TUTORIAL_COMPLETION_REWARD_SUMMARY_EN =
  '+145 Iron, +40 Water when the tutorial arc completes (expedition active)';

export const TUTORIAL_STEP_REWARD_SUMMARY_RU: Record<number, string> = {
  1: '+10 железа, +15 воды после синхронизации первой шахты',
  2: '+15 железа, +15 воды после постройки склада',
  3: '+15 железа, +15 воды, когда разведчик будет готов',
  4: '+15 железа, +15 воды после запуска экспедиции',
};

export const TUTORIAL_COMPLETION_REWARD_SUMMARY_RU =
  '+145 железа, +40 воды после завершения обучающей цепочки (экспедиция активна)';
