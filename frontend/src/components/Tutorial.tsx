import { type TutorialStepId, TUTORIAL_REWARD_DIAMONDS } from '@shared/config/tutorialRewards';
import { DiamondIcon } from './cosmic/DiamondIcon';
import { useI18n } from '../lib/i18n';

type TutorialStep = {
  id: TutorialStepId;
  title: string;
  done: boolean;
  rewardClaimed: boolean;
};

interface TutorialProps {
  steps: TutorialStep[];
  onSkip: () => void;
  /** Close overlay and return to play (does not skip tutorial). */
  onContinue: () => void;
  onClaimReward: (stepId: TutorialStepId) => void;
  /** After tutorial is fully completed on the server. */
  onClose: () => void;
  completed: boolean;
  currentHint: string;
  claimingStepId: TutorialStepId | null;
}

export function Tutorial({
  steps,
  onSkip,
  onContinue,
  onClaimReward,
  onClose,
  completed,
  currentHint,
  claimingStepId,
}: TutorialProps) {
  const { t } = useI18n();
  const claimedCount = steps.filter((step) => step.rewardClaimed).length;
  const totalReward = steps.length * TUTORIAL_REWARD_DIAMONDS;
  const earnedReward = claimedCount * TUTORIAL_REWARD_DIAMONDS;
  const progressPct = steps.length > 0 ? Math.round((claimedCount / steps.length) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/95 text-white backdrop-blur-sm">
      <div className="mx-auto flex min-h-full max-w-xl flex-col gap-3.5 p-5">
        <header className="overflow-hidden rounded-2xl border border-violet-400/30 bg-gradient-to-br from-violet-800/35 via-slate-900/85 to-slate-900/85 p-5 shadow-[0_12px_40px_rgba(2,6,23,0.55)]">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight">{t('tutorial.title')}</h1>
              <p className="mt-1.5 text-sm leading-snug text-slate-300">
                {completed ? t('tutorial.completed') : t('tutorial.progress')}
              </p>
            </div>
            <div className="flex flex-shrink-0 flex-col items-center gap-0.5 rounded-xl border border-violet-400/40 bg-violet-500/15 px-3 py-2">
              <DiamondIcon size={26} />
              <span className="font-mono text-sm font-bold text-violet-100">
                {earnedReward}/{totalReward}
              </span>
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-400 transition-[width] duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </header>

        {!completed && (
          <div className="flex items-center gap-2.5 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-sm text-cyan-100">
            <span className="text-base leading-none" aria-hidden>
              ◎
            </span>
            <span className="leading-snug">{currentHint}</span>
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          {steps.map((step, index) => {
            const claimable = step.done && !step.rewardClaimed;
            const claiming = claimingStepId === step.id;
            return (
              <div
                key={step.id}
                className={
                  'flex items-center gap-3 rounded-xl border p-3 transition-colors ' +
                  (claimable
                    ? 'border-violet-400/60 bg-gradient-to-br from-violet-700/30 to-slate-900/80'
                    : step.rewardClaimed
                      ? 'border-emerald-500/25 bg-slate-900/60'
                      : 'border-slate-700/70 bg-slate-900/60')
                }
              >
                <div
                  className={
                    'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ' +
                    (step.rewardClaimed
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : step.done
                        ? 'bg-violet-500/25 text-violet-200'
                        : 'bg-slate-800 text-slate-500')
                  }
                >
                  {step.done ? '✓' : index + 1}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold leading-tight">{step.title}</span>
                    <span
                      className={
                        'flex-shrink-0 whitespace-nowrap text-xs font-semibold ' +
                        (step.done ? 'text-emerald-300' : 'text-slate-500')
                      }
                    >
                      {step.done ? t('common.done') : t('common.pending')}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs text-slate-300">
                      <DiamondIcon size={14} />
                      <span className="font-mono font-semibold">{TUTORIAL_REWARD_DIAMONDS}</span>
                    </span>

                    {step.rewardClaimed ? (
                      <span className="flex-shrink-0 text-xs font-semibold text-emerald-300">
                        {t('tutorial.rewardClaimed')}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onClaimReward(step.id)}
                        disabled={!claimable || claiming}
                        className={
                          'flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ' +
                          (claimable
                            ? 'tutorial-claim-glow bg-gradient-to-r from-violet-400 to-fuchsia-400 text-slate-950'
                            : 'cursor-not-allowed border border-slate-700 text-slate-500')
                        }
                      >
                        {claimable && <DiamondIcon size={15} />}
                        {claiming
                          ? t('common.processing')
                          : claimable
                            ? t('tutorial.claimReward')
                            : t('tutorial.claimUnavailable')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-1 flex justify-end gap-3">
          {!completed && (
            <button
              type="button"
              onClick={onSkip}
              className="rounded-lg px-4 py-2 text-sm text-slate-400 transition hover:text-slate-200"
            >
              {t('tutorial.skip')}
            </button>
          )}
          <button
            type="button"
            onClick={completed ? onClose : onContinue}
            className="rounded-lg bg-gradient-to-r from-cyan-400 to-cyan-500 px-5 py-2 text-sm font-bold text-slate-950 transition hover:brightness-110"
          >
            {completed ? t('common.backToGame') : t('common.continue')}
          </button>
        </div>
      </div>
    </div>
  );
}
