import { ResourceBar } from '../components/ResourceBar';
import { PlanetView } from '../components/PlanetView';
import { BuildQueue } from '../components/BuildQueue';
import { Home, Ship, Map, Beaker, User } from 'lucide-react';

export function HomePage() {
  const tabs = [
    { id: 'planets', label: 'Planets', icon: Home },
    { id: 'ships', label: 'Ships', icon: Ship },
    { id: 'map', label: 'Map', icon: Map },
    { id: 'tech', label: 'Tech', icon: Beaker },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-white">
      <ResourceBar />
      
      <div className="flex-1 overflow-hidden">
        <PlanetView />
      </div>

      <BuildQueue />

      <nav className="bg-slate-800/95 backdrop-blur-sm border-t border-slate-700 px-2 py-3">
        <div className="flex justify-around max-w-2xl mx-auto">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                className="flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors hover:bg-slate-700/50"
                onClick={() => alert(`Navigate to ${tab.label}`)}
              >
                <Icon className="w-5 h-5 text-slate-400" />
                <span className="text-xs text-slate-400">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
