import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { estimateRushDiamondCost, type RushPricing } from '@shared/types/diamonds';
import type { ResearchProgress } from '@shared/types/research';
import { useRushResearch } from '../hooks/useResearch';
import { useI18n } from '../lib/i18n';
import { getActiveResearch } from '../lib/research-queue';
import { formatTimerDuration, timerSnapshot } from '../lib/timers';
import { TECH_TREE_DATA } from '../lib/tech-tree';
import { QueueStrip } from './cosmic/atoms';

interface ResearchQueueProps {
  research: ResearchProgress[] | undefined;
  rushPricing: RushPricing | null;
  diamondBalance: number;
}

export function ResearchQueue({ research, rushPricing, diamondBalance }: ResearchQueueProps) {
  const [now, setNow] = useState(Date.now());
  const rushResearch = useRushResearch();
  const queryClient = useQueryClient();
  const { locale, t } = useI18n();

  const activeResearch = useMemo(() => getActiveResearch(research, now), [research, now]);
  const activeDef = activeResearch ? TECH_TREE_DATA.find((entry) => entry.branch === activeResearch.branch && entry.level === activeResearch.level + 1) : undefined;

  useEffect(() => {
    if (!activeResearch?.completesAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [activeResearch?.completesAt]);

  useEffect(() => {
    if (!activeResearch?.completesAt) return;
    const remainingMs = new Date(activeResearch.completesAt).getTime() - now;
    if (remainingMs <= 0) {
      queryClient.invalidateQueries({ queryKey: ['me'] });
    }
  }, [activeResearch?.completesAt, now, queryClient]);

  if (!activeResearch || !activeDef) return null;

  const snapshot = timerSnapshot({
    completesAt: activeResearch.completesAt,
    startedAt: activeResearch.startedAt,
    totalDurationSec: activeDef.timeSec,
    nowMs: now,
  });
  const rushCost = rushPricing != null ? estimateRushDiamondCost(snapshot.remainingSec, rushPricing.diamondsPerMinute, rushPricing.maxPerAction) : 0;
  const title = t('research.queueTitle', {
    name: activeDef.name[locale],
    level: activeDef.level,
  });
  const subtitle = t('research.queueBlocksStarts', {
    time: formatTimerDuration(snapshot.remainingSec),
  });

  return (
    <QueueStrip
      title={title}
      subtitle={subtitle}
      etaSec={snapshot.remainingSec}
      progressPct={snapshot.progressPct}
      rushCost={rushCost}
      diamondBalance={diamondBalance}
      rushBusy={rushResearch.isPending}
      rushLabel={t('research.rush')}
      rushTitle={t('research.rushTitle', { cost: rushCost })}
      notEnoughRushTitle={t('research.notEnoughDiamonds')}
      onRush={() => rushResearch.mutate(activeResearch.branch)}
    />
  );
}
