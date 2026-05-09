import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tutorial } from '../../components/Tutorial';
import { useMe } from '../../hooks/useMe';
import { apiFetch } from '../../lib/api';

interface OnboardingPageProps {
  onSkip: () => void;
}

export function OnboardingPage({ onSkip }: OnboardingPageProps) {
  const navigate = useNavigate();
  const { data: meData, refetch } = useMe();

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
    [tutorialStep]
  );

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
      onSkip={() => {
        onSkip();
        navigate('/');
      }}
      onClose={closeTutorial}
    />
  );
}
