/* eslint-disable */
// Additional screens: build dialog, expeditions, galaxy map, tech tree, fleet.
// Reuses art.jsx (planet/building SVGs) and screens.jsx primitives (TopBar, BottomNav, Stars).

// ============================================================
// BUILD DIALOG — modal over the planet screen
// ============================================================
const BUILD_OPTIONS = [
  { id: 'mine',         req: 'Command Center L1', cost: { Fe: 60, Si: 20 },     time: '4m', recommended: true },
  { id: 'drill',        req: 'Mine L2',           cost: { Fe: 220, Cu: 80 },    time: '14m' },
  { id: 'smelter',      req: 'Mine L1',           cost: { Fe: 140, CH4: 30 },   time: '8m' },
  { id: 'solar_plant',  req: 'Command Center L1', cost: { Si: 80, Cu: 20 },     time: '6m' },
  { id: 'storage',      req: '—',                 cost: { Fe: 40, Si: 30 },     time: '3m' },
  { id: 'lab',          req: 'Command Center L2', cost: { Si: 200, Fe: 80 },    time: '18m', locked: true },
  { id: 'spaceport',    req: 'Command Center L2', cost: { Fe: 400, Ti: 60 },    time: '32m', locked: true },
  { id: 'shipyard',     req: 'Spaceport L1',      cost: { Fe: 600, Ti: 200 },   time: '1h 10m', locked: true },
  { id: 'cryo_factory', req: 'Lab L1',            cost: { Mg: 120, Hg: 80 },    time: '24m', locked: true },
];

const BuildOptionRow = ({ opt }) => {
  const def = BUILDING_BY_TYPE[opt.id];
  const Ic = def.Icon;
  const cost = Object.entries(opt.cost).map(([k,v]) => `${v} ${k}`).join('  ·  ');
  return (
    <button className={"bopt " + (opt.locked ? "locked" : "")}>
      <div className="bopt-icon"><Ic size={28} tone={opt.locked ? '#545E78' : '#5BD7FF'} /></div>
      <div className="bopt-body">
        <div className="bopt-row">
          <div className="bopt-name">{def.label}</div>
          {opt.recommended && <span className="bopt-rec">RECOMMENDED</span>}
          {opt.locked && <span className="bopt-locked">LOCKED · {opt.req}</span>}
        </div>
        <div className="bopt-meta">
          <span className="bopt-cost">{cost}</span>
          <span className="bopt-time">▲ {opt.time}</span>
        </div>
      </div>
      <svg width="14" height="14" viewBox="0 0 14 14" stroke={opt.locked ? '#545E78' : '#5BD7FF'} strokeWidth="1.6" fill="none">
        <path d="M5 3 L9 7 L5 11" />
      </svg>
    </button>
  );
};

const BuildDialog = ({ planetBiome = 'green', slotIndex = 5 }) => {
  const accent = BIOME_META[planetBiome].accent;
  return (
    <div className="screen" style={{ '--accent': accent }}>
      <div className="screen-bg">
        <Stars density={50} seed={11} />
        <div className="screen-bg-grad" />
      </div>
      <TopBar resources={SAMPLE_RESOURCES} />
      <div className="screen-scroll" style={{ filter: 'brightness(0.5) saturate(0.7)' }}>
        <div style={{ height: 200 }} />
      </div>
      <div className="bd-sheet">
        <div className="bd-handle" />
        <div className="bd-head">
          <div className="bd-tag">SLOT 06 · KESTRA PRIME</div>
          <div className="bd-title">Choose installation</div>
          <div className="bd-sub">9 types available · filtered by biome bonuses</div>
        </div>
        <div className="bd-list">
          {BUILD_OPTIONS.map(o => <BuildOptionRow key={o.id} opt={o} />)}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// EXPEDITIONS SCREEN
// ============================================================
const EXPEDITIONS = [
  { id: 'e1', kind: 'scout',    ship: 'SCOUT-04 «Halcyon»',    target: 'Sector 12·05·-3 · unknown', etaSec: 482,  pct: 64, status: 'in_flight' },
  { id: 'e2', kind: 'cargo',    ship: 'CARGO-LIGHT-02',         target: 'Tor Volcanis ▸ Kestra',     etaSec: 142,  pct: 88, status: 'returning' },
  { id: 'e3', kind: 'colonize', ship: 'COLONIZER «Anvil»',     target: 'Sirin VII',                  etaSec: 1840, pct: 22, status: 'in_flight' },
  { id: 'e4', kind: 'jump',     ship: 'JUMP-PRIME',             target: 'Sector 14·00·+1',            etaSec: 0,    pct: 100, status: 'arrived' },
];

const ExpKindIcon = ({ kind }) => {
  const c = '#5BD7FF';
  switch (kind) {
    case 'scout':    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6"><circle cx="11" cy="11" r="6"/><path d="M15.5 15.5 L20 20"/></svg>;
    case 'cargo':    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6"><rect x="3" y="6" width="18" height="12" rx="1"/><path d="M3 12 H21"/><path d="M9 6 V18"/></svg>;
    case 'colonize': return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6"><path d="M12 3 L17 13 L12 16 L7 13 Z"/><path d="M7 13 L4 19 L20 19 L17 13"/></svg>;
    case 'jump':     return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6"><path d="M4 12 H20"/><path d="M14 6 L20 12 L14 18"/><circle cx="6" cy="12" r="2"/></svg>;
  }
};

const ExpRow = ({ e }) => {
  const m = Math.floor(e.etaSec / 60), s = e.etaSec % 60;
  const eta = e.status === 'arrived' ? 'ARRIVED' : `${m}m ${s.toString().padStart(2,'0')}s`;
  return (
    <div className={"exp-row exp-" + e.status}>
      <div className="exp-kind">
        <ExpKindIcon kind={e.kind} />
        <span className="exp-kind-l">{e.kind.toUpperCase()}</span>
      </div>
      <div className="exp-body">
        <div className="exp-ship">{e.ship}</div>
        <div className="exp-target">▸ {e.target}</div>
        <div className="exp-bar"><div className="exp-fill" style={{ width: e.pct + '%' }} /></div>
      </div>
      <div className="exp-eta">
        <div className="exp-eta-v">{eta}</div>
        <div className="exp-eta-l">{e.status === 'returning' ? 'returning' : e.status === 'arrived' ? 'tap to claim' : 'eta'}</div>
      </div>
    </div>
  );
};

const ExpeditionsScreen = () => (
  <div className="screen" style={{ '--accent': '#5BD7FF' }}>
    <div className="screen-bg">
      <Stars density={70} seed={42} />
      <div className="screen-bg-grad" />
      <div className="screen-bg-vignette" />
    </div>
    <TopBar resources={SAMPLE_RESOURCES} />
    <div className="screen-scroll">
      <div className="page-head">
        <div>
          <div className="page-tag">FLEET OPERATIONS</div>
          <div className="page-title">Expeditions</div>
        </div>
        <button className="cta">+ Dispatch</button>
      </div>
      <div className="exp-stats">
        <div className="exp-stat"><div className="es-v">3</div><div className="es-l">IN FLIGHT</div></div>
        <div className="exp-stat"><div className="es-v">1</div><div className="es-l">ARRIVED</div></div>
        <div className="exp-stat"><div className="es-v">9</div><div className="es-l">SLOTS FREE</div></div>
        <div className="exp-stat"><div className="es-v" style={{ color: '#F4B84A' }}>2</div><div className="es-l">DISCOVERED</div></div>
      </div>
      <div className="exp-section">
        <div className="section-head">
          <div className="section-title">ACTIVE</div>
          <div className="section-count">{EXPEDITIONS.length}</div>
        </div>
        <div className="exp-list">
          {EXPEDITIONS.map(e => <ExpRow key={e.id} e={e} />)}
        </div>
      </div>
      <div style={{ height: 80 }} />
    </div>
    <BottomNav active="ships" />
  </div>
);

// ============================================================
// GALAXY MAP SCREEN
// ============================================================
const SECTORS = [
  // grid of star systems with biome of primary planet
  { x: 14, y: 22, biome: 'rocky',     id: 'S-12·05',  owner: 'enemy' },
  { x: 28, y: 18, biome: 'ice',       id: 'S-12·06' },
  { x: 42, y: 26, biome: 'ocean',     id: 'S-12·07' },
  { x: 58, y: 18, biome: 'gas_giant', id: 'S-13·07' },
  { x: 72, y: 28, biome: 'green',     id: 'S-13·08',  owner: 'home', home: true },
  { x: 86, y: 20, biome: 'volcanic',  id: 'S-13·09' },
  { x: 18, y: 42, biome: 'green',     id: 'S-12·08' },
  { x: 36, y: 50, biome: 'rocky',     id: 'S-12·09',  owner: 'ally' },
  { x: 50, y: 44, biome: 'volcanic',  id: 'S-13·05' },
  { x: 64, y: 52, biome: 'ice',       id: 'S-13·06' },
  { x: 80, y: 48, biome: 'ocean',     id: 'S-13·10' },
  { x: 22, y: 70, biome: 'gas_giant', id: 'S-12·10' },
  { x: 42, y: 76, biome: 'anomaly',   id: 'S-12·11', anomaly: true },
  { x: 58, y: 68, biome: 'green',     id: 'S-13·11' },
  { x: 76, y: 72, biome: 'rocky',     id: 'S-13·12' },
];

const GalaxyMapScreen = () => (
  <div className="screen" style={{ '--accent': '#5BD7FF' }}>
    <div className="screen-bg">
      <Stars density={120} seed={9} />
      <div className="screen-bg-grad" />
    </div>
    <TopBar resources={SAMPLE_RESOURCES} />
    <div className="screen-scroll">
      <div className="page-head">
        <div>
          <div className="page-tag">SECTOR 13·08 · 2.4 ly</div>
          <div className="page-title">Galaxy Map</div>
        </div>
        <div className="map-zoom">
          <button className="zoomb">−</button>
          <span className="zoom-l">1×</span>
          <button className="zoomb">+</button>
        </div>
      </div>

      <div className="map-frame">
        <svg className="map-grid" viewBox="0 0 100 100" preserveAspectRatio="none">
          {Array.from({length:9}).map((_,i)=> <line key={'h'+i} x1="0" y1={i*12.5} x2="100" y2={i*12.5} stroke="rgba(91,215,255,0.06)" strokeWidth="0.15" />)}
          {Array.from({length:9}).map((_,i)=> <line key={'v'+i} x1={i*12.5} y1="0" x2={i*12.5} y2="100" stroke="rgba(91,215,255,0.06)" strokeWidth="0.15" />)}
          {/* trade routes */}
          <path d="M72 28 L42 76" stroke="#5BD7FF" strokeWidth="0.25" strokeDasharray="0.8 1" opacity="0.6"/>
          <path d="M72 28 L36 50" stroke="#F4B84A" strokeWidth="0.25" strokeDasharray="0.8 1" opacity="0.6"/>
          <path d="M72 28 L86 20" stroke="#FF5A6E" strokeWidth="0.25" strokeDasharray="0.8 1" opacity="0.55"/>
          {/* sensor range */}
          <circle cx="72" cy="28" r="22" fill="rgba(91,215,255,0.05)" stroke="rgba(91,215,255,0.25)" strokeWidth="0.15" strokeDasharray="0.6 0.6"/>
        </svg>
        <div className="map-stars">
          {SECTORS.map(s => {
            const Pl = PLANET_BY_BIOME[s.biome];
            const ringClass = s.owner === 'home' ? 'home' : s.owner === 'ally' ? 'ally' : s.owner === 'enemy' ? 'enemy' : '';
            return (
              <div key={s.id} className={"map-node " + ringClass} style={{ left: s.x + '%', top: s.y + '%' }}>
                <div className="map-orb"><Pl size={28} /></div>
                <div className="map-id">{s.id}</div>
                {s.home && <div className="map-tag">HOME</div>}
                {s.anomaly && <div className="map-tag" style={{ background: 'rgba(224,176,255,0.15)', color: '#E0B0FF', borderColor: 'rgba(224,176,255,0.4)' }}>ANOMALY</div>}
                {s.owner === 'enemy' && <div className="map-tag" style={{ background: 'rgba(255,90,110,0.12)', color: '#FF5A6E', borderColor: 'rgba(255,90,110,0.4)' }}>HOSTILE</div>}
                {s.owner === 'ally' && <div className="map-tag" style={{ background: 'rgba(91,255,169,0.1)', color: '#5BFFA9', borderColor: 'rgba(91,255,169,0.35)' }}>ALLY</div>}
              </div>
            );
          })}
        </div>
        <div className="map-legend">
          <div className="legend-row"><span className="dot home"/>Home</div>
          <div className="legend-row"><span className="dot ally"/>Allied</div>
          <div className="legend-row"><span className="dot enemy"/>Hostile</div>
          <div className="legend-row"><span className="dot neut"/>Neutral</div>
        </div>
      </div>

      <div className="map-info">
        <div className="map-info-tag">SELECTED ▸ S-13·08 · KESTRA SYSTEM</div>
        <div className="map-info-name">Home System 907b</div>
        <div className="map-info-row"><span>Owner</span><b style={{ color: '#5BFFA9' }}>You</b></div>
        <div className="map-info-row"><span>Planets</span><b>5 · 1 colonized</b></div>
        <div className="map-info-row"><span>Sensor reach</span><b>22 ly</b></div>
        <div className="map-info-row"><span>Threat level</span><b style={{ color: '#5BFFA9' }}>NONE</b></div>
      </div>
      <div style={{ height: 80 }} />
    </div>
    <BottomNav active="map" />
  </div>
);

// ============================================================
// TECH TREE SCREEN
// ============================================================
const TECH = [
  { id: 'eco',  name: 'Economy',     pct: 60, lvl: 3, max: 5, color: '#5BFFA9' },
  { id: 'eng',  name: 'Engineering', pct: 40, lvl: 2, max: 5, color: '#5BD7FF' },
  { id: 'pro',  name: 'Propulsion',  pct: 80, lvl: 4, max: 5, color: '#F4B84A' },
  { id: 'mat',  name: 'Materials',   pct: 20, lvl: 1, max: 5, color: '#E0B0FF' },
  { id: 'sen',  name: 'Sensors',     pct: 0,  lvl: 0, max: 5, color: '#9BC6E0' },
  { id: 'wea',  name: 'Weapons',     pct: 0,  lvl: 0, max: 5, color: '#FF5A6E' },
  { id: 'def',  name: 'Defense',     pct: 0,  lvl: 0, max: 5, color: '#C7A582' },
];

const TechBranch = ({ b }) => (
  <div className="tech-row">
    <div className="tech-row-head">
      <div className="tech-name">
        <span className="tech-dot" style={{ background: b.color }} />
        {b.name}
      </div>
      <div className="tech-lvl">L{b.lvl} <span className="tech-max">/ {b.max}</span></div>
    </div>
    <div className="tech-nodes">
      {Array.from({length: b.max}).map((_,i) => (
        <div key={i} className={"tech-node " + (i < b.lvl ? "done" : i === b.lvl ? "active" : "")}
             style={i < b.lvl ? { background: b.color, borderColor: b.color } : i === b.lvl ? { borderColor: b.color, color: b.color } : {}}>
          {i+1}
        </div>
      ))}
    </div>
    <div className="tech-bar">
      <div className="tech-fill" style={{ width: b.pct + '%', background: b.color, boxShadow: `0 0 8px ${b.color}` }} />
    </div>
  </div>
);

const TechTreeScreen = () => (
  <div className="screen" style={{ '--accent': '#5BD7FF' }}>
    <div className="screen-bg">
      <Stars density={60} seed={5} />
      <div className="screen-bg-grad" />
    </div>
    <TopBar resources={SAMPLE_RESOURCES} />
    <div className="screen-scroll">
      <div className="page-head">
        <div>
          <div className="page-tag">RESEARCH · LAB L2</div>
          <div className="page-title">Tech Tree</div>
        </div>
        <div className="page-stat">
          <div className="ps-v">10</div>
          <div className="ps-l">/ 35 unlocked</div>
        </div>
      </div>

      <div className="tech-current">
        <div className="tech-current-row">
          <div className="tech-current-tag" style={{ color: '#F4B84A' }}>RESEARCHING</div>
          <div className="tech-current-eta">▲ 22m 14s</div>
        </div>
        <div className="tech-current-name">Propulsion · Level 4 — Jump Drives</div>
        <div className="qstrip-bar"><div className="qstrip-fill" style={{ width: '80%', background: '#F4B84A', boxShadow: '0 0 8px #F4B84A' }} /></div>
      </div>

      <div className="tech-section">
        <div className="section-head">
          <div className="section-title">BRANCHES</div>
          <div className="section-count">7 trees</div>
        </div>
        <div className="tech-list">
          {TECH.map(b => <TechBranch key={b.id} b={b} />)}
        </div>
      </div>
      <div style={{ height: 80 }} />
    </div>
    <BottomNav active="tech" />
  </div>
);

// ============================================================
// FLEET SCREEN
// ============================================================
const SHIPS = [
  { id: 's1', cls: 'SCOUT',         name: 'Halcyon',   loc: 'In flight ▸ Sector 12·05', hp: 100, fuel: 62, status: 'mission' },
  { id: 's2', cls: 'CARGO LIGHT',   name: 'Burdened',  loc: 'Returning ▸ Kestra Prime', hp: 100, fuel: 88, status: 'mission' },
  { id: 's3', cls: 'COLONIZER',     name: 'Anvil',     loc: 'In flight ▸ Sirin VII',    hp: 100, fuel: 18, status: 'mission' },
  { id: 's4', cls: 'JUMP SHIP',     name: 'Prime',     loc: 'Idle · Kestra Prime',      hp: 100, fuel: 100, status: 'idle' },
  { id: 's5', cls: 'SCOUT',         name: 'Quill',     loc: 'Idle · Kestra Prime',      hp: 78,  fuel: 40, status: 'idle' },
  { id: 's6', cls: 'RECON PROBE',   name: 'P-09',      loc: 'Building · Shipyard 38%',  hp: 0,   fuel: 0,  status: 'building' },
];

const ShipRow = ({ s }) => {
  const tone = s.status === 'idle' ? '#5BFFA9' : s.status === 'mission' ? '#5BD7FF' : '#F4B84A';
  return (
    <div className="ship-row">
      <div className="ship-cls" style={{ borderColor: tone, color: tone }}>{s.cls}</div>
      <div className="ship-body">
        <div className="ship-name">{s.name}</div>
        <div className="ship-loc">{s.loc}</div>
      </div>
      <div className="ship-stats">
        <div className="ship-stat"><span>HP</span><b>{s.hp}</b></div>
        <div className="ship-stat"><span>FUEL</span><b style={{ color: s.fuel < 30 ? '#FF5A6E' : 'inherit' }}>{s.fuel}</b></div>
      </div>
    </div>
  );
};

const FleetScreen = () => (
  <div className="screen" style={{ '--accent': '#5BD7FF' }}>
    <div className="screen-bg">
      <Stars density={60} seed={3} />
      <div className="screen-bg-grad" />
    </div>
    <TopBar resources={SAMPLE_RESOURCES} />
    <div className="screen-scroll">
      <div className="page-head">
        <div>
          <div className="page-tag">SHIPYARD · KESTRA</div>
          <div className="page-title">Fleet</div>
        </div>
        <button className="cta">+ Build</button>
      </div>
      <div className="exp-stats">
        <div className="exp-stat"><div className="es-v">6</div><div className="es-l">SHIPS</div></div>
        <div className="exp-stat"><div className="es-v">2</div><div className="es-l">IDLE</div></div>
        <div className="exp-stat"><div className="es-v">3</div><div className="es-l">MISSION</div></div>
        <div className="exp-stat"><div className="es-v" style={{ color: '#F4B84A' }}>1</div><div className="es-l">QUEUE</div></div>
      </div>
      <div className="exp-section">
        <div className="section-head"><div className="section-title">ROSTER</div><div className="section-count">6 vessels</div></div>
        <div className="ship-list">
          {SHIPS.map(s => <ShipRow key={s.id} s={s} />)}
        </div>
      </div>
      <div style={{ height: 80 }} />
    </div>
    <BottomNav active="ships" />
  </div>
);

Object.assign(window, {
  BuildDialog, ExpeditionsScreen, GalaxyMapScreen, TechTreeScreen, FleetScreen,
});
