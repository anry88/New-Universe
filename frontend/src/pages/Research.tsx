import { useState, useMemo } from 'react';
import { useMe } from '../hooks/useMe';
import { useStartResearch } from '../hooks/useResearch';
import { TechTreeNode } from '../components/TechTreeNode';
import { TECH_TREE_DATA, BRANCHES } from '../lib/tech-tree';
import { ResourceBar } from '../components/ResourceBar';
import { ChevronLeft, X, Beaker, Zap, Timer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ResearchDefinition } from '@shared/types/research';

export function ResearchPage() {
  const { data: meData } = useMe();
  const startResearch = useStartResearch();
  const navigate = useNavigate();
  const [selectedTech, setSelectedTech] = useState<ResearchDefinition | null>(null);

  const homePlanetId = meData?.homeSystem?.planets?.[0]?.id;
  const labLevel = meData?.homeSystem?.planets?.[0]?.buildings?.find(b => b.typeId === 'research_lab')?.level || 0;

  const handleStart = async () => {
    if (!selectedTech || !homePlanetId) return;
    try {
      await startResearch.mutateAsync({ branch: selectedTech.branch, planetId: homePlanetId });
      setSelectedTech(null);
    } catch (err) {
      console.error(err);
    }
  };

  const levels = [1, 2, 3, 4, 5];

  return (
    <div className="h-screen bg-slate-900 text-white flex flex-col overflow-hidden">
      <ResourceBar />

      <header className="p-4 flex items-center gap-4 bg-slate-800/50 backdrop-blur-md border-b border-white/5">
        <button onClick={() => navigate('/')} className="p-2 hover:bg-white/10 rounded-full transition-colors">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-xl font-bold">Research Laboratory</h1>
          <p className="text-xs text-slate-400 uppercase tracking-widest">Level {labLevel} Technology Lab</p>
        </div>
      </header>

      <main className="flex-1 overflow-x-auto overflow-y-auto p-6">
        <div className="min-w-max grid grid-cols-7 gap-8 mx-auto">
          {BRANCHES.map(branch => (
            <div key={branch.id} className="flex flex-col gap-6 items-center">
              <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">{branch.name.en}</h2>
              {levels.map(level => {
                const def = TECH_TREE_DATA.find(t => t.branch === branch.id && t.level === level);
                const progress = meData?.research?.find(p => p.branch === branch.id);
                const currentLevel = progress?.level || 0;
                
                // Simplified unlock logic: level 1 is always unlocked if previous level in branch is done
                const isUnlocked = currentLevel >= level - 1;

                return (
                  <TechTreeNode
                    key={`${branch.id}-${level}`}
                    branchId={branch.id}
                    level={level}
                    definition={def}
                    progress={progress}
                    isUnlocked={isUnlocked}
                    onClick={() => def && setSelectedTech(def)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </main>

      {/* Detail Dialog */}
      {selectedTech && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-800 border border-white/10 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom-8 duration-300">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div className="flex gap-4">
                  <div className="p-3 bg-blue-500/20 rounded-2xl">
                    <Beaker className="w-8 h-8 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">{selectedTech.name.en}</h3>
                    <p className="text-sm text-slate-400">Level {selectedTech.level}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedTech(null)} className="p-2 hover:bg-white/10 rounded-full">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              <p className="text-slate-300 text-sm mb-6 leading-relaxed">
                {selectedTech.description.en}
              </p>

              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-slate-900/50 p-4 rounded-2xl border border-white/5">
                  <p className="text-[10px] text-slate-500 uppercase font-bold mb-2 flex items-center gap-1">
                    <Zap className="w-3 h-3" /> Cost
                  </p>
                  <div className="space-y-1">
                    {Object.entries(selectedTech.cost).map(([res, amount]) => (
                      <div key={res} className="flex justify-between text-xs font-mono">
                        <span className="capitalize text-slate-400">{res}</span>
                        <span className="text-white">{amount.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-slate-900/50 p-4 rounded-2xl border border-white/5 flex flex-col justify-center">
                  <p className="text-[10px] text-slate-500 uppercase font-bold mb-1 flex items-center gap-1">
                    <Timer className="w-3 h-3" /> Time
                  </p>
                  <p className="text-xl font-mono text-white">{selectedTech.timeSec}s</p>
                </div>
              </div>

              <button
                onClick={handleStart}
                disabled={startResearch.isPending}
                className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-blue-900/20 active:scale-95"
              >
                {startResearch.isPending ? 'Starting...' : 'Initiate Research'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
