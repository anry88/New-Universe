import React from 'react';
import { AlertTriangle, CheckCircle2, FlaskConical, Target, Timer, Coins } from 'lucide-react';
import { useI18n } from '../lib/i18n';

interface Requirement {
  label: string;
  met: boolean;
  current?: string | number;
  required: string | number;
  icon: React.ElementType;
}

interface ColonizationRequirementsProps {
  eligibility: {
    allowed: boolean;
    reason?: string;
    details?: {
      currentColonies: number;
      maxColonies: number;
      cooldownRemainingSec: number;
      requiredResearch: { branch: string; level: number };
      currentResearch: number;
      distance?: number;
    };
  };
  costs: Record<string, number>;
}

/**
 * Displays colonization constraints, costs, and current eligibility status.
 * Used in planet detail or system map founding flows.
 */
export const ColonizationRequirements: React.FC<ColonizationRequirementsProps> = ({
  eligibility,
  costs,
}) => {
  const { t } = useI18n();
  const { details } = eligibility;

  const requirements: Requirement[] = [
    {
      label: t('colonize.research'),
      met: (details?.currentResearch ?? 0) >= (details?.requiredResearch?.level ?? 0),
      current: details?.currentResearch ?? 0,
      required: details?.requiredResearch?.level ?? 0,
      icon: FlaskConical,
    },
    {
      label: t('colonize.colonyLimit'),
      met: (details?.currentColonies ?? 0) < (details?.maxColonies ?? 0),
      current: `${details?.currentColonies ?? 0}/${details?.maxColonies ?? 0}`,
      required: details?.maxColonies ?? 0,
      icon: Target,
    },
    {
      label: t('colonize.cooldown'),
      met: (details?.cooldownRemainingSec ?? 0) <= 0,
      current: details?.cooldownRemainingSec ? `${Math.ceil(details.cooldownRemainingSec / 60)}m` : t('common.ready'),
      required: t('common.ready'),
      icon: Timer,
    },
  ];

  return (
    <div className="space-y-4 p-4 rounded-xl bg-slate-900/50 border border-slate-800">
      <div className="flex items-center gap-2 mb-2">
        <Target className="w-5 h-5 text-blue-400" />
        <h3 className="font-display font-semibold text-sm">{t('colonize.requirements').toUpperCase()}</h3>
      </div>

      <div className="grid gap-3">
        {requirements.map((req, i) => (
          <div key={i} className="flex items-center justify-between group">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${req.met ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                <req.icon className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-medium text-slate-300">{req.label}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">
                  {req.current} / {req.required}
                </div>
              </div>
            </div>
            {req.met ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            )}
          </div>
        ))}
      </div>

      <div className="pt-4 border-t border-slate-800">
        <div className="flex items-center gap-2 mb-3">
          <Coins className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-semibold text-slate-300">{t('colonize.costs').toUpperCase()}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(costs).map(([id, amount]) => (
            <div key={id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-950/50 border border-slate-800/50">
              <span className="text-[10px] text-slate-400 uppercase font-mono">{id}</span>
              <span className="text-xs font-mono font-bold text-slate-200">{amount.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      {!eligibility.allowed && (
        <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex gap-3 items-start">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-200 leading-relaxed">
            {eligibility.reason || t('colonize.blocked')}
          </p>
        </div>
      )}
    </div>
  );
};
