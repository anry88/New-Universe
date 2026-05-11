import {
  TUTORIAL_COMPLETION_REWARD_SUMMARY_EN,
  TUTORIAL_COMPLETION_REWARD_SUMMARY_RU,
  TUTORIAL_STEP_REWARD_SUMMARY_EN,
  TUTORIAL_STEP_REWARD_SUMMARY_RU,
} from '@shared/config/tutorialRewards';
import { useI18n } from '../lib/i18n';

type TutorialStep = {
  id: number;
  title: string;
  done: boolean;
};

interface TutorialProps {
  steps: TutorialStep[];
  onSkip: () => void;
  /** Close overlay and return to play (does not skip tutorial). */
  onContinue: () => void;
  /** After tutorial is fully completed on the server. */
  onClose: () => void;
  completed: boolean;
  currentHint: string;
}

export function Tutorial({
  steps,
  onSkip,
  onContinue,
  onClose,
  completed,
  currentHint,
}: TutorialProps) {
  const { locale, t } = useI18n();
  const stepRewards =
    locale === 'ru' ? TUTORIAL_STEP_REWARD_SUMMARY_RU : TUTORIAL_STEP_REWARD_SUMMARY_EN;
  const completionReward =
    locale === 'ru' ? TUTORIAL_COMPLETION_REWARD_SUMMARY_RU : TUTORIAL_COMPLETION_REWARD_SUMMARY_EN;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 text-white">
      <div className="mx-auto flex h-full max-w-2xl flex-col gap-4 p-6">
        <div className="self-start rounded-lg border border-cyan-400/50 bg-slate-900/90 px-4 py-2 text-sm text-cyan-100 shadow-[0_0_20px_rgba(56,189,248,0.2)]">
          {currentHint}
        </div>
        <div className="rounded-xl border border-cyan-500/40 bg-slate-900/80 p-4">
          <h1 className="text-xl font-bold">{t('tutorial.title')}</h1>
          <p className="mt-2 text-sm text-slate-300">
            {completed
              ? t('tutorial.completed', { reward: completionReward })
              : t('tutorial.progress')}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/70 p-4">
          <ul className="space-y-3">
            {steps.map((step, index) => (
              <li
                key={step.id}
                className="flex flex-col gap-1 rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm">
                    <span className="mr-2 text-cyan-300">{index + 1}.</span>
                    <span>{step.title}</span>
                  </div>
                  <span className={step.done ? 'text-emerald-300' : 'text-slate-400'}>
                    {step.done ? t('common.done') : t('common.pending')}
                  </span>
                </div>
                {step.id >= 1 && step.id <= 4 && (
                  <p className="text-xs leading-snug text-slate-400">
                    {t('tutorial.reward', { reward: stepRewards[step.id] ?? '—' })}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-slate-700 pt-3 text-xs text-slate-500">
            {t('tutorial.completionBonus', { reward: completionReward })}
          </p>
        </div>

        <div className="flex justify-end gap-3">
          {!completed && (
            <button
              type="button"
              onClick={onSkip}
              className="rounded-lg border border-slate-500 px-4 py-2 text-sm hover:bg-slate-800"
            >
              {t('tutorial.skip')}
            </button>
          )}
          <button
            type="button"
            onClick={completed ? onClose : onContinue}
            className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
          >
            {completed ? t('common.backToGame') : t('common.continue')}
          </button>
        </div>
      </div>
    </div>
  );
}
