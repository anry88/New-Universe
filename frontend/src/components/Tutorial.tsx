type TutorialStep = {
  id: number;
  title: string;
  done: boolean;
};

interface TutorialProps {
  steps: TutorialStep[];
  onSkip: () => void;
  onClose: () => void;
  completed: boolean;
}

export function Tutorial({ steps, onSkip, onClose, completed }: TutorialProps) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 text-white">
      <div className="mx-auto flex h-full max-w-2xl flex-col gap-4 p-6">
        <div className="rounded-xl border border-cyan-500/40 bg-slate-900/80 p-4">
          <h1 className="text-xl font-bold">Onboarding tutorial</h1>
          <p className="mt-2 text-sm text-slate-300">
            {completed
              ? 'Tutorial completed. Reward: +200 Fe and +100 H2O.'
              : 'Complete the first 5 actions to unlock the starter reward.'}
          </p>
        </div>

        <div className="flex-1 rounded-xl border border-slate-700 bg-slate-900/70 p-4">
          <ul className="space-y-3">
            {steps.map((step, index) => (
              <li
                key={step.id}
                className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2"
              >
                <div className="text-sm">
                  <span className="mr-2 text-cyan-300">{index + 1}.</span>
                  <span>{step.title}</span>
                </div>
                <span className={step.done ? 'text-emerald-300' : 'text-slate-400'}>
                  {step.done ? 'Done' : 'Pending'}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex justify-end gap-3">
          {!completed && (
            <button
              type="button"
              onClick={onSkip}
              className="rounded-lg border border-slate-500 px-4 py-2 text-sm hover:bg-slate-800"
            >
              Skip for now
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
          >
            {completed ? 'Back to game' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
