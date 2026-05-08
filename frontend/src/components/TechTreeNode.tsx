import { ResearchProgress, ResearchDefinition } from '@shared/types/research';
import { Beaker, Lock, CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';

interface TechTreeNodeProps {
  branchId: string;
  level: number;
  definition?: ResearchDefinition;
  progress?: ResearchProgress;
  isUnlocked: boolean;
  onClick: () => void;
}

export function TechTreeNode({ branchId, level, definition, progress, isUnlocked, onClick }: TechTreeNodeProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  
  const currentLevel = progress?.level || 0;
  const isCompleted = currentLevel >= level;
  const isResearching = progress?.completesAt && new Date(progress.completesAt) > new Date() && currentLevel === level - 1;

  useEffect(() => {
    if (!isResearching || !progress?.completesAt) return;

    const updateTimer = () => {
      const remaining = Math.max(0, new Date(progress.completesAt!).getTime() - Date.now());
      setTimeLeft(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isResearching, progress?.completesAt]);

  const progressPercent = isResearching && definition 
    ? Math.min(100, (1 - timeLeft / (definition.timeSec * 1000)) * 100) 
    : 0;

  return (
    <button
      onClick={onClick}
      disabled={!isUnlocked && !isCompleted}
      className={`relative p-3 rounded-2xl border-2 transition-all hover:scale-105 w-full aspect-square flex flex-col items-center justify-center gap-1 shadow-lg ${
        isCompleted
          ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-100'
          : isResearching
          ? 'bg-blue-600/20 border-blue-500 text-blue-100 ring-2 ring-blue-500/20'
          : isUnlocked
          ? 'bg-slate-800 border-slate-700 text-slate-200 hover:border-slate-500'
          : 'bg-slate-900/50 border-slate-800 text-slate-600 grayscale'
      }`}
    >
      {!isUnlocked && !isCompleted && <Lock className="w-3 h-3 absolute top-2 right-2 text-slate-700" />}
      {isCompleted && <CheckCircle2 className="w-4 h-4 absolute top-2 right-2 text-emerald-500" />}
      
      <div className={`p-2 rounded-xl ${isUnlocked ? 'bg-slate-700/50' : 'bg-slate-900/30'}`}>
        <Beaker className={`w-6 h-6 ${isUnlocked || isCompleted ? 'text-blue-400' : 'text-slate-700'}`} />
      </div>

      <div className="text-center mt-1">
        <p className="text-[9px] font-bold uppercase tracking-tight truncate w-20">
          {definition?.name?.en || branchId}
        </p>
        <p className="text-[10px] opacity-60 font-medium">Level {level}</p>
      </div>
      
      {isResearching && (
        <>
          <p className="text-[9px] font-mono mt-1 text-blue-300">
            {Math.floor(timeLeft / 1000)}s
          </p>
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-900/50 rounded-b-2xl overflow-hidden">
            <div 
              className="h-full bg-blue-500 transition-all duration-1000 ease-linear" 
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </>
      )}
    </button>
  );
}
