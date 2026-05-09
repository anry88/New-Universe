/* eslint-disable */
// Telegram mini-app planet-detail screen — primary direction: "Cosmic Atlas"
// Mock data + a single <PlanetScreen biome="..."> component.

const SAMPLE_RESOURCES = [
  { id: 'water',    label: 'H₂O', amount: 1240, cap: 2000, rate: 12 },
  { id: 'iron',     label: 'Fe',  amount: 880,  cap: 2000, rate: 8 },
  { id: 'silicon',  label: 'Si',  amount: 410,  cap: 1500, rate: 4 },
  { id: 'methane',  label: 'CH₄', amount: 92,   cap: 800,  rate: 2 },
  { id: 'tritium',  label: 'T₂',  amount: 0,    cap: 100,  rate: 0 },
];

const SAMPLE_PLANETS = [
  { id: 'p1', name: 'Kestra Prime',  biome: 'green',     size: 15, slots: 12, primary: true },
  { id: 'p2', name: 'Tor Volcanis',  biome: 'volcanic',  size: 13, slots: 10 },
  { id: 'p3', name: 'Sirin VII',     biome: 'ocean',     size: 14, slots: 11 },
  { id: 'p4', name: 'Halion Mass',   biome: 'gas_giant', size: 18, slots: 6 },
  { id: 'p5', name: 'Veil-3',        biome: 'ice',       size: 11, slots: 8 },
];

const SAMPLE_SLOTS = [
  { idx: 0, type: 'command_center', level: 3 },
  { idx: 1, type: 'storage',        level: 2 },
  { idx: 2, type: 'mine',           level: 2, building: true, etaSec: 142 },
  { idx: 3, type: 'solar_plant',    level: 1 },
  { idx: 4, type: 'lab',            level: 1 },
  { idx: 5, type: null }, // empty
  { idx: 6, type: null },
  { idx: 7, type: null },
  { idx: 8, type: null },
  { idx: 9, type: null },
  { idx: 10, type: null },
  { idx: 11, type: null },
];

// ---------- shared atoms ---------------------------------------------------

const Stars = ({ density = 80, seed = 1 }) => {
  // deterministic pseudo-random
  let s = seed;
  const rand = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const stars = Array.from({ length: density }, (_, i) => ({
    x: rand() * 100, y: rand() * 100,
    r: 0.3 + rand() * 1.2,
    o: 0.25 + rand() * 0.6,
  }));
  return (
    <svg className="stars" viewBox="0 0 100 100" preserveAspectRatio="none">
      {stars.map((st, i) => (
        <circle key={i} cx={st.x} cy={st.y} r={st.r} fill="#E8EDF5" opacity={st.o} />
      ))}
    </svg>
  );
};

const ResourceChip = ({ r }) => {
  const pct = Math.min(100, Math.round((r.amount / r.cap) * 100));
  const near = pct > 85;
  return (
    <div className="rchip">
      <div className="rchip-row">
        <span className="rchip-sym">{r.label}</span>
        <span className="rchip-amt">{r.amount.toLocaleString()}</span>
      </div>
      <div className="rchip-meta">
        <span className={"rchip-rate " + (r.rate > 0 ? "pos" : "zero")}>
          {r.rate > 0 ? `+${r.rate}/h` : '—'}
        </span>
        <div className="rchip-bar"><div className="rchip-bar-fill" style={{ width: pct + '%', background: near ? '#F4B84A' : '#5BD7FF' }} /></div>
      </div>
    </div>
  );
};

const formatEta = (sec) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
};

// ---------- Planet header (big planet portrait) ----------------------------

const PlanetPortrait = ({ biome, name, size, slots, slotsUsed }) => {
  const PlanetSvg = PLANET_BY_BIOME[biome];
  const meta = BIOME_META[biome];
  return (
    <div className="ph">
      <div className="ph-orbit">
        <div className="ph-glow" style={{ background: `radial-gradient(circle at 50% 50%, ${meta.accent}40 0%, transparent 60%)` }} />
        <div className="ph-planet"><PlanetSvg size={132} /></div>
      </div>
      <div className="ph-meta">
        <div className="ph-tag" style={{ color: meta.accent }}>
          <span className="dot" style={{ background: meta.accent }} />
          {meta.tag} · CLASS {biome === 'gas_giant' ? 'III' : biome === 'anomaly' ? 'X' : 'II'}
        </div>
        <div className="ph-name">{name}</div>
        <div className="ph-sub">
          <span>SIZE <b>{size}</b></span>
          <span className="sep">·</span>
          <span>SLOTS <b>{slotsUsed}/{slots}</b></span>
          <span className="sep">·</span>
          <span>{meta.label}</span>
        </div>
      </div>
    </div>
  );
};

// ---------- Building slot --------------------------------------------------

const BuildSlot = ({ slot, biomeAccent }) => {
  if (!slot.type) {
    return (
      <button className="slot empty">
        <div className="slot-plus">+</div>
        <div className="slot-empty-label">EMPTY</div>
      </button>
    );
  }
  const def = BUILDING_BY_TYPE[slot.type];
  const Icon = def.Icon;
  const tone = biomeAccent;
  return (
    <button className={"slot filled " + (slot.building ? "queued" : "")}>
      <div className="slot-icon"><Icon size={32} tone={tone} /></div>
      <div className="slot-name">{def.label}</div>
      <div className="slot-lvl">
        <span className="lvl-pill">L{slot.level}</span>
        <span className="lvl-cat">{def.cat.toUpperCase()}</span>
      </div>
      {slot.building && (
        <div className="slot-progress">
          <div className="slot-progress-bar"><div className="slot-progress-fill" style={{ width: '64%' }} /></div>
          <div className="slot-progress-eta">▲ {formatEta(slot.etaSec)}</div>
        </div>
      )}
    </button>
  );
};

// ---------- Planet rail (horizontal scroll of system planets) -------------

const PlanetRail = ({ planets, current, onSelect }) => (
  <div className="rail">
    {planets.map(p => {
      const Pl = PLANET_BY_BIOME[p.biome];
      const active = p.id === current;
      return (
        <button key={p.id} className={"rail-item " + (active ? "active" : "")} onClick={() => onSelect && onSelect(p.id)}>
          <div className="rail-orb"><Pl size={42} /></div>
          <div className="rail-name">{p.name.split(' ')[0]}</div>
          <div className="rail-tag">{BIOME_META[p.biome].label}</div>
        </button>
      );
    })}
  </div>
);

// ---------- Top bar (resources) -------------------------------------------

const TopBar = ({ resources }) => (
  <div className="topbar">
    <div className="topbar-resources">
      {resources.map(r => <ResourceChip key={r.id} r={r} />)}
    </div>
  </div>
);

// ---------- Bottom nav -----------------------------------------------------

const NAV = [
  { id: 'planets',  label: 'Planets', icon: 'planet' },
  { id: 'ships',    label: 'Fleet',   icon: 'ship' },
  { id: 'map',      label: 'Galaxy',  icon: 'map' },
  { id: 'tech',     label: 'Tech',    icon: 'tech' },
  { id: 'profile',  label: 'You',     icon: 'user' },
];

const NavIcon = ({ kind, active }) => {
  const c = active ? '#E8EDF5' : '#6C7894';
  switch (kind) {
    case 'planet': return (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6"><circle cx="12" cy="12" r="6" /><ellipse cx="12" cy="12" rx="11" ry="3.5" transform="rotate(-20 12 12)" /></svg>);
    case 'ship':   return (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6"><path d="M12 3 L15 14 L12 17 L9 14 Z"/><path d="M9 14 L5 16 L9 19"/><path d="M15 14 L19 16 L15 19"/></svg>);
    case 'map':    return (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6"><circle cx="12" cy="12" r="9"/><path d="M3 12 H21"/><path d="M12 3 Q16 12 12 21"/><path d="M12 3 Q8 12 12 21"/></svg>);
    case 'tech':   return (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6"><circle cx="12" cy="12" r="3"/><path d="M12 4 V8"/><path d="M12 16 V20"/><path d="M4 12 H8"/><path d="M16 12 H20"/><path d="M6.3 6.3 L9 9"/><path d="M15 15 L17.7 17.7"/><path d="M17.7 6.3 L15 9"/><path d="M9 15 L6.3 17.7"/></svg>);
    case 'user':   return (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6"><circle cx="12" cy="9" r="3.5"/><path d="M5 21 Q5 14 12 14 Q19 14 19 21"/></svg>);
  }
};

const BottomNav = ({ active = 'planets' }) => (
  <nav className="bnav">
    {NAV.map(n => (
      <button key={n.id} className={"bnav-item " + (n.id === active ? "active" : "")}>
        <NavIcon kind={n.icon} active={n.id === active} />
        <span className="bnav-label">{n.label}</span>
        {n.id === active && <span className="bnav-mark" />}
      </button>
    ))}
  </nav>
);

// ---------- Build queue strip ---------------------------------------------

const QueueStrip = () => (
  <div className="qstrip">
    <div className="qstrip-icon">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5BD7FF" strokeWidth="1.8">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7 V12 L15 14" />
      </svg>
    </div>
    <div className="qstrip-body">
      <div className="qstrip-title">Mine · Lv.2 in progress</div>
      <div className="qstrip-bar"><div className="qstrip-fill" style={{ width: '64%' }} /></div>
    </div>
    <div className="qstrip-eta">2m 22s</div>
  </div>
);

// ---------- Whole screen ---------------------------------------------------

const PlanetScreen = ({ biome = 'green', planetId = 'p1', planets = SAMPLE_PLANETS }) => {
  const planet = planets.find(p => p.id === planetId) || planets[0];
  const accent = BIOME_META[planet.biome].accent;
  const used = SAMPLE_SLOTS.filter(s => s.type).length;
  return (
    <div className="screen" style={{ '--accent': accent }}>
      <div className="screen-bg">
        <Stars density={70} seed={planet.id.charCodeAt(1) || 7} />
        <div className="screen-bg-grad" />
        <div className="screen-bg-vignette" />
      </div>
      <TopBar resources={SAMPLE_RESOURCES} />

      <div className="screen-scroll">
        <PlanetPortrait biome={planet.biome} name={planet.name} size={planet.size} slots={planet.slots} slotsUsed={used} />

        <div className="rail-wrap">
          <div className="rail-label">HOME SYSTEM · 907b-1</div>
          <PlanetRail planets={planets} current={planet.id} />
        </div>

        <div className="slots-section">
          <div className="section-head">
            <div className="section-title">INSTALLATIONS</div>
            <div className="section-count">{used}/{planet.slots} slots</div>
          </div>
          <div className="slots-grid">
            {SAMPLE_SLOTS.slice(0, planet.slots).map(s => (
              <BuildSlot key={s.idx} slot={s} biomeAccent={accent} />
            ))}
          </div>
        </div>
        <div style={{ height: 70 }} />
      </div>

      <QueueStrip />
      <BottomNav active="planets" />
    </div>
  );
};

Object.assign(window, {
  SAMPLE_RESOURCES, SAMPLE_PLANETS, SAMPLE_SLOTS,
  Stars, ResourceChip, PlanetPortrait, BuildSlot, PlanetRail,
  TopBar, BottomNav, QueueStrip, PlanetScreen,
});
