import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tutorial } from '../../components/Tutorial';
import { useMe } from '../../hooks/useMe';
import { apiFetch } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import {
  isTutorialRewardClaimed,
  type TutorialStepId,
} from '@shared/config/tutorialRewards';
import type { TutorialClaimResponse } from '@shared/types/tutorial';

interface OnboardingPageProps {
  onSkip: () => void;
  /** Returning to Home without skipping — clears forced full-screen gate. */
  onContinueToGame: () => void;
  /** Opening /onboarding resets overlay-dismiss flag (lifted from App). */
  onEnter?: () => void;
}

export function OnboardingPage({ onSkip, onContinueToGame, onEnter }: OnboardingPageProps) {
  const navigate = useNavigate();
  const { data: meData, refetch } = useMe();
  const { t } = useI18n();
  const [claimingStepId, setClaimingStepId] = useState<TutorialStepId | null>(null);

  useEffect(() => {
    onEnter?.();
  }, [onEnter]);

  const tutorialStep = meData?.tutorialStep ?? 0;
  const tutorialRewardsClaimed = meData?.tutorialRewardsClaimed ?? 0;
  const completed = Boolean(meData?.tutorialCompletedAt);

  const steps = useMemo(
    () => [
      {
        id: 0 as const,
        title: t('tutorial.welcome'),
        done: true,
        rewardClaimed: isTutorialRewardClaimed(tutorialRewardsClaimed, 0),
      },
      {
        id: 1 as const,
        title: t('tutorial.firstMine'),
        done: tutorialStep >= 1,
        rewardClaimed: isTutorialRewardClaimed(tutorialRewardsClaimed, 1),
      },
      {
        id: 2 as const,
        title: t('tutorial.storage'),
        done: tutorialStep >= 2,
        rewardClaimed: isTutorialRewardClaimed(tutorialRewardsClaimed, 2),
      },
      {
        id: 3 as const,
        title: t('tutorial.scout'),
        done: tutorialStep >= 3,
        rewardClaimed: isTutorialRewardClaimed(tutorialRewardsClaimed, 3),
      },
      {
        id: 4 as const,
        title: t('tutorial.expedition'),
        done: tutorialStep >= 4,
        rewardClaimed: isTutorialRewardClaimed(tutorialRewardsClaimed, 4),
      },
    ],
    [tutorialRewardsClaimed, tutorialStep, t],
  );
  const claimableStep = steps.find((step) => step.done && !step.rewardClaimed);
  const nextIncompleteStep = steps.find((step) => !step.done);
  const currentHint = completed
    ? t('tutorial.completedHint')
    : claimableStep
      ? t('tutorial.claimObjective', { objective: claimableStep.title })
      : t('tutorial.currentObjective', { objective: nextIncompleteStep?.title ?? t('tutorial.expedition') });

  const closeTutorial = () => {
    navigate('/');
  };

  useEffect(() => {
    const sync = () =>
      apiFetch('/tutorial/sync', { method: 'POST' })
        .then(() => refetch())
        .catch(() => undefined);

    void sync();
    const timer = window.setInterval(sync, 7000);
    return () => window.clearInterval(timer);
  }, [refetch]);

  const claimReward = async (stepId: TutorialStepId) => {
    setClaimingStepId(stepId);
    try {
      await apiFetch<TutorialClaimResponse>('/tutorial/claim', {
        method: 'POST',
        body: JSON.stringify({ stepId }),
      });
      await refetch();
    } finally {
      setClaimingStepId(null);
    }
  };

  return (
    <Tutorial
      steps={steps}
      completed={completed}
      currentHint={currentHint}
      claimingStepId={claimingStepId}
      onClaimReward={(stepId) => {
        void claimReward(stepId);
      }}
      onSkip={() => {
        onSkip();
        navigate('/');
      }}
      onContinue={() => {
        onContinueToGame();
        navigate('/');
      }}
      onClose={closeTutorial}
    />
  );
}
