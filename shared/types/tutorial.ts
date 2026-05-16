export interface TutorialState {
  tutorialStep: number;
  tutorialCompletedAt: string | null;
  tutorialRewardsClaimed: number;
}

export type TutorialSyncResponse = TutorialState;

export interface TutorialClaimRequest {
  stepId: number;
}

export interface TutorialClaimResponse extends TutorialState {
  diamonds: number;
  rewardDiamonds: number;
  rewardGranted: boolean;
  claimedStepId: number;
}
