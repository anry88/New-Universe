import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tutorial } from '../../components/Tutorial';
import { useMe } from '../../hooks/useMe';
import { apiFetch } from '../../lib/api';
import { useI18n } from '../../lib/i18n';

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

  useEffect(() => {
    onEnter?.();
  }, [onEnter]);

  const tutorialStep = meData?.tutorialStep ?? 0;
  const completed = Boolean(meData?.tutorialCompletedAt);

  const steps = useMemo(
    () => [
      { id: 0, title: t('tutorial.welcome'), done: true },
      { id: 1, title: t('tutorial.firstMine'), done: tutorialStep >= 1 },
      { id: 2, title: t('tutorial.storage'), done: tutorialStep >= 2 },
      { id: 3, title: t('tutorial.scout'), done: tutorialStep >= 3 },
      { id: 4, title: t('tutorial.expedition'), done: tutorialStep >= 4 },
    ],
    [tutorialStep, t],
  );
  const currentHint = completed
    ? t('tutorial.completedHint')
    : t('tutorial.currentObjective', { objective: steps.find((step) => !step.done)?.title ?? t('tutorial.welcome') });

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

  return (
    <Tutorial
      steps={steps}
      completed={completed}
      currentHint={currentHint}
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
