import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tutorial } from '../../components/Tutorial';
import { useMe } from '../../hooks/useMe';
import { apiFetch } from '../../lib/api';

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

  useEffect(() => {
    onEnter?.();
  }, [onEnter]);

  const tutorialStep = meData?.tutorialStep ?? 0;
  const completed = Boolean(meData?.tutorialCompletedAt);

  const steps = useMemo(
    () => [
      { id: 0, title: 'Welcome', done: true },
      { id: 1, title: 'Build first mine', done: tutorialStep >= 1 },
      { id: 2, title: 'Build storage', done: tutorialStep >= 2 },
      { id: 3, title: 'Build scout', done: tutorialStep >= 3 },
      { id: 4, title: 'Send first expedition', done: tutorialStep >= 4 },
    ],
    [tutorialStep],
  );
  const currentHint = completed
    ? 'Tutorial completed. Rewards were delivered at each milestone.'
    : `Current objective: ${steps.find((step) => !step.done)?.title ?? 'Welcome'}`;

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
