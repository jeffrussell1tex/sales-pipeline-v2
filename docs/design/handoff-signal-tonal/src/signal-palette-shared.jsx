// Signal palettes — three strategies for making events, trends and
// "look here" moments legible inside the existing warm-stone system.
//
// The specimens below are written ONCE and parameterized by a palette object,
// so every look renders identical content and the only variable is color.
// That makes the comparison honest.
//
// Diagnosis of today's palette: danger #9c3a2e, warn #b87333, ok #4d6b3d are
// all warm and all low-chroma. They sit politely on #f0ece4 stone and never
// carry. There is no cool anywhere, and no reserved attention color.

const SIGNAL_LOOKS = [
  {
    id: 'pigment',
    name: 'Deep Pigment',
    thesis: 'Same hue families, more pigment — plus one cool counterweight.',
    mechanism: 'Density',
    aa: 'All signals ≥ 5.5:1 · AA', aaPass: true,
    note: 'Keeps every existing hue relationship intact and simply pushes chroma and depth until the signals carry against warm stone. The one genuinely new element is a slate-indigo: in an all-warm palette a single cool hue is the largest legibility gain available, and it gives informational signals somewhere to live that is not "another shade of brown." Most conservative of the three, and the easiest to approve. Depth is set with headroom rather than to the bare minimum — an earlier draft sat 0.01 above the 4.5 floor, close enough that any later tint-alpha tweak would silently drop it under.',
    rise: '#345c27', riseTint: 'rgba(52,92,39,0.13)',
    fall: '#8f2f22', fallTint: 'rgba(143,47,34,0.12)',
    attend: '#7f4712', attendTint: 'rgba(127,71,18,0.14)',
    crit: '#7d2418', critTint: 'rgba(125,36,24,0.14)',
    info: '#2f4a6b', infoTint: 'rgba(47,74,107,0.12)',
    focus: '#7f4712', focusTint: 'rgba(127,71,18,0.16)', focusFg: '#fbf8f3',
    neutral: '#5a544c', neutralTint: 'rgba(90,84,76,0.10)',
    swatches: [
      ['Rise', '#345c27'], ['Fall', '#8f2f22'], ['Attend', '#7f4712'],
      ['Critical', '#7d2418'], ['Info · new cool', '#2f4a6b'], ['Neutral', '#5a544c'],
    ],
  },
  {
    id: 'scarcity',
    name: 'Reserved Signal',
    thesis: 'Everything stays muted except one electric hue, spent sparingly.',
    mechanism: 'Scarcity',
    aa: 'All signals ≥ 5:1 · AA', aaPass: true,
    note: 'Status stays deliberately quiet — status is ambient information you read when you go looking for it — while a single high-chroma cobalt is reserved *exclusively* for attention and interaction, never for status. Because it is the only saturated thing on screen it wins attention absolutely; the discipline is that spending it twice on one screen halves its value. Note that "quiet" here is achieved by depth, not by washing out: every status tone is darker than today’s so it can stay low-chroma and still clear the floor. Two earlier drafts got this wrong — the first reused today’s mid-tones wholesale (2.83–3.58:1), the second deepened attend and neutral but left rise at #4d6b3d, where the "On track" pill measured 4.38:1 under a badge claiming the whole set was clear.',
    rise: '#345c27', riseTint: 'rgba(52,92,39,0.12)',
    fall: '#8f2f22', fallTint: 'rgba(143,47,34,0.10)',
    attend: '#7f4712', attendTint: 'rgba(127,71,18,0.12)',
    crit: '#8f2f22', critTint: 'rgba(143,47,34,0.12)',
    info: '#5a544c', infoTint: 'rgba(90,84,76,0.10)',
    focus: '#1668d8', focusTint: 'rgba(22,104,216,0.10)', focusFg: '#ffffff',
    neutral: '#5a544c', neutralTint: 'rgba(90,84,76,0.10)',
    swatches: [
      ['Rise', '#345c27'], ['Fall', '#8f2f22'], ['Attend', '#7f4712'],
      ['Critical', '#8f2f22'], ['Neutral', '#5a544c'], ['FOCUS · reserved', '#1668d8'],
    ],
  },
  {
    id: 'tonal',
    name: 'Tonal & Form',
    thesis: 'No new intensity. Three-step ramps, and shape carries the signal.',
    mechanism: 'Form',
    aa: 'All signals ≥ 7:1 · AAA', aaPass: true,
    note: 'Adds no chroma at all. Each semantic gets a tint / base / deep ramp, and the actual signalling work is handed to form: filled versus outlined, a colored spine on the row, a dot that fills as severity climbs, an area fill under the trend line. Signals stay unmistakable while the screen stays as quiet as it is now — the most restrained option, and the one that scales best when a screen has forty rows rather than four. The attend ramp bottoms out at #5f3a10 rather than a mid-umber specifically so the tinted table-flag text clears 7:1 — an earlier draft used #7a4a14, which measured 5.9:1 there and quietly broke the AAA claim even though the solid pills were fine.',
    rise: '#2f4a24', riseTint: 'rgba(107,138,86,0.16)',
    fall: '#6b1f16', fallTint: 'rgba(156,58,46,0.14)',
    attend: '#5f3a10', attendTint: 'rgba(184,115,51,0.16)',
    crit: '#4a1109', critTint: 'rgba(122,36,24,0.16)',
    info: '#2b3a44', infoTint: 'rgba(58,74,88,0.12)',
    focus: '#26221c', focusTint: 'rgba(38,34,28,0.08)', focusFg: '#f5efe3',
    neutral: '#3a352e', neutralTint: 'rgba(58,53,46,0.08)',
    ramps: [
      ['Rise', ['rgba(107,138,86,0.16)', '#6b8a56', '#2f4a24']],
      ['Fall', ['rgba(156,58,46,0.14)', '#9c3a2e', '#6b1f16']],
      ['Attend', ['rgba(184,115,51,0.16)', '#b87333', '#5f3a10']],
      ['Neutral', ['rgba(58,53,46,0.08)', '#8a8378', '#3a352e']],
    ],
    swatches: [
      ['Rise deep', '#2f4a24'], ['Fall deep', '#6b1f16'], ['Attend deep', '#5f3a10'],
      ['Critical deep', '#4a1109'], ['Info deep', '#2b3a44'], ['Emphasis', '#3a352e'],
    ],
  },
];

// ── Sparkline ────────────────────────────────────────────────────
// Data viz, not decoration: an area+line trend at metric scale.
const Spark = ({ data, color, fill, w = 96, h = 30, area }) => {
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const pt = (v, i) => [ (i / (data.length - 1)) * w, h - 2 - ((v - min) / span) * (h - 4) ];
  const pts = data.map(pt);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block', overflow: 'visible' }}>
      {area && <path d={`${line} L${w} ${h} L0 ${h} Z`} fill={fill} stroke="none"/>}
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.4" fill={color}/>
    </svg>
  );
};

const Arrow = ({ dir, color, size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
    strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    {dir === 'up' ? <path d="M12 19V5M6 11l6-6 6 6"/> : <path d="M12 5v14M6 13l6 6 6-6"/>}
  </svg>
);

// ── Specimen 1 · Trends ──────────────────────────────────────────
const TRENDS = [
  { label: 'Contract value', value: '$376K', delta: '+12.4%', dir: 'up',
    series: [58, 61, 59, 66, 70, 74, 79, 86] },
  { label: 'First-visit fix rate', value: '82%', delta: '+3.1 pts', dir: 'up',
    series: [70, 72, 71, 75, 74, 78, 80, 82] },
  { label: 'Avg. response time', value: '4.2 hrs', delta: '−0.8 hrs', dir: 'down', good: true,
    series: [7.1, 6.8, 6.9, 6.0, 5.4, 5.1, 4.6, 4.2] },
  { label: 'Renewal rate', value: '88%', delta: '−4.2 pts', dir: 'down',
    series: [96, 95, 95, 93, 92, 90, 89, 88] },
];

const TrendRow = ({ p, tonal }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
    {TRENDS.map((t) => {
      // "good" inverts the read: a falling response time is a win.
      const positive = t.dir === 'up' ? !t.label.startsWith('Renewal') : !!t.good;
      const c = positive ? p.rise : p.fall;
      const tint = positive ? p.riseTint : p.fallTint;
      return (
        <div key={t.label} style={{ padding: '13px 14px', background: TOKENS.surface,
          border: `1px solid ${TOKENS.border}`, borderRadius: TOKENS.radiusMd,
          borderLeft: tonal ? `3px solid ${c}` : `1px solid ${TOKENS.border}` }}>
          <div style={{ ...eyebrowStyle(), fontSize: 9 }}>{t.label}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 5 }}>
            <span style={{ fontSize: 21, fontWeight: 700, color: TOKENS.ink, lineHeight: 1,
              fontVariantNumeric: 'tabular-nums' }}>{t.value}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 9 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11.5,
              fontWeight: 700, color: c, background: tonal ? 'transparent' : tint,
              padding: tonal ? 0 : '2px 7px', borderRadius: 999, fontVariantNumeric: 'tabular-nums' }}>
              <Arrow dir={t.dir} color={c} size={11}/>{t.delta}
            </span>
            <Spark data={t.series} color={c} fill={tint} area={tonal} w={78} h={26}/>
          </div>
        </div>
      );
    })}
  </div>
);

// ── Specimen 2 · Events needing attention ───────────────────────
const EVENTS = [
  { sev: 'crit',   title: 'SLA breach · Apex Logistics', meta: 'Premium · 2-hour response · 41 min over', act: 'Dispatch now' },
  { sev: 'attend', title: 'Contract lapsing · Harbor Point Dental', meta: 'Basic · renews in 9 days', act: 'Start renewal' },
  { sev: 'attend', title: '3 PM visits overdue · Coastline Apartments', meta: 'Preferred · oldest 22 days', act: 'Schedule' },
  { sev: 'info',   title: 'Greenfield Schools added 4 assets', meta: 'Premium · 58 assets total', act: 'Review' },
];

const EventList = ({ p, look }) => (
  <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: TOKENS.radiusLg,
    overflow: 'hidden', background: TOKENS.surface }}>
    {EVENTS.map((e, i) => {
      const c = e.sev === 'crit' ? p.crit : e.sev === 'attend' ? p.attend : p.info;
      const tint = e.sev === 'crit' ? p.critTint : e.sev === 'attend' ? p.attendTint : p.infoTint;
      const isFocus = i === 0; // the one "look here" row
      return (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 15px',
          borderBottom: i < EVENTS.length - 1 ? `1px solid ${TOKENS.border}` : 'none',
          background: look === 'tonal' && isFocus ? tint : 'transparent',
          boxShadow: look === 'tonal' ? `inset 3px 0 0 ${c}` : 'none' }}>
          {/* severity indicator — form differs per look */}
          {look === 'tonal' ? (
            <span style={{ display: 'flex', gap: 2.5, flexShrink: 0 }}>
              {[0, 1, 2].map(n => (
                <span key={n} style={{ width: 5, height: 5, borderRadius: '50%',
                  background: n <= (e.sev === 'crit' ? 2 : e.sev === 'attend' ? 1 : 0) ? c : TOKENS.border }}/>
              ))}
            </span>
          ) : (
            <span style={{ width: 26, height: 26, borderRadius: '50%', background: tint, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: c }}/>
            </span>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: TOKENS.ink, whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</div>
            <div style={{ fontSize: 11, color: TOKENS.inkMuted, marginTop: 2 }}>{e.meta}</div>
          </div>
          {/* the action — this is where "look here" is spent */}
          <button style={{ padding: '5px 11px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
            borderRadius: TOKENS.radiusSm, whiteSpace: 'nowrap', fontFamily: 'inherit',
            color: isFocus ? p.focusFg : c,
            background: isFocus ? p.focus : 'transparent',
            border: isFocus ? 'none' : `1px solid ${c}55` }}>{e.act}</button>
        </div>
      );
    })}
  </div>
);

// ── Specimen 3 · Status pills at rest ───────────────────────────
const StatusRow = ({ p, look }) => {
  const items = [
    ['Premium', p.info], ['On track', p.rise], ['At risk', p.attend],
    ['Breached', p.crit], ['No contract', p.neutral],
  ];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center' }}>
      {items.map(([label, c], i) => (
        <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '3px 9px', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4,
          textTransform: 'uppercase', borderRadius: look === 'tonal' ? 2 : 999,
          color: look === 'tonal' ? '#fbf8f3' : c,
          background: look === 'tonal' ? c : c + '1f',
          border: look === 'tonal' ? 'none' : `1px solid ${c}33` }}>{label}</span>
      ))}
      <span style={{ width: 1, height: 18, background: TOKENS.border, margin: '0 4px' }}/>
      {/* the reserved "look here" treatment, shown once */}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px',
        fontSize: 11, fontWeight: 700, borderRadius: 999, color: p.focusFg, background: p.focus }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.focusFg, opacity: 0.9 }}/>
        Needs you
      </span>
    </div>
  );
};

// ── Specimen 4 · A table with signals in place ──────────────────
const TABLE = [
  { name: 'Apex Logistics', tier: 'Premium', v: '$96K', d: '+8%', dir: 'up', sev: 'crit', note: 'SLA breach' },
  { name: 'Greenfield Schools', tier: 'Premium', v: '$152K', d: '+21%', dir: 'up', sev: null, note: '—' },
  { name: 'Coastline Apartments', tier: 'Preferred', v: '$31K', d: '−6%', dir: 'down', sev: 'attend', note: '3 overdue' },
  { name: 'Harbor Point Dental', tier: 'Basic', v: '$4.8K', d: '−14%', dir: 'down', sev: 'attend', note: 'Renews 9d' },
];

const SignalTable = ({ p, look }) => (
  <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: TOKENS.radiusLg,
    overflow: 'hidden', background: TOKENS.surface }}>
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.8fr 0.9fr 1fr', gap: 12,
      padding: '8px 15px', background: TOKENS.surface2, borderBottom: `1px solid ${TOKENS.border}` }}>
      {['Customer', 'Contract', 'Value', 'Trend', 'Flag'].map(h => (
        <div key={h} style={{ ...eyebrowStyle(), fontSize: 9 }}>{h}</div>
      ))}
    </div>
    {TABLE.map((r, i) => {
      const c = r.sev === 'crit' ? p.crit : r.sev === 'attend' ? p.attend : null;
      const tc = r.dir === 'up' ? p.rise : p.fall;
      return (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.8fr 0.9fr 1fr', gap: 12,
          padding: '10px 15px', alignItems: 'center',
          borderBottom: i < TABLE.length - 1 ? `1px solid ${TOKENS.border}` : 'none',
          background: c && look !== 'scarcity' ? (r.sev === 'crit' ? p.critTint : p.attendTint) : 'transparent',
          boxShadow: c && look === 'tonal' ? `inset 3px 0 0 ${c}` : 'none' }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: TOKENS.ink }}>{r.name}</div>
          <div style={{ fontSize: 11, color: TOKENS.inkMid }}>{r.tier}</div>
          <div style={{ fontSize: 12, color: TOKENS.ink, fontVariantNumeric: 'tabular-nums' }}>{r.v}</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11.5,
            fontWeight: 700, color: tc, fontVariantNumeric: 'tabular-nums' }}>
            <Arrow dir={r.dir} color={tc} size={10}/>{r.d}
          </div>
          <div>
            {c ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5,
                fontWeight: 700, color: look === 'scarcity' ? c : c,
                background: look === 'scarcity' ? (r.sev === 'crit' ? p.critTint : p.attendTint) : 'transparent',
                padding: look === 'scarcity' ? '2px 8px' : 0, borderRadius: 999 }}>
                {look !== 'scarcity' && <span style={{ width: 5, height: 5, borderRadius: '50%', background: c }}/>}
                {r.note}
              </span>
            ) : <span style={{ fontSize: 11, color: TOKENS.inkMuted }}>{r.note}</span>}
          </div>
        </div>
      );
    })}
  </div>
);

// ── The look, assembled ──────────────────────────────────────────
const SwatchStrip = ({ p }) => (
  <div style={{ display: 'flex', gap: 7 }}>
    {p.swatches.map(([label, hex]) => (
      <div key={label} style={{ flex: 1 }}>
        <div style={{ height: 34, borderRadius: TOKENS.radiusSm, background: hex,
          border: hex === '#f5efe3' ? `1px solid ${TOKENS.border}` : 'none' }}/>
        <div style={{ fontSize: 9.5, fontWeight: 600, color: TOKENS.inkMid, marginTop: 5 }}>{label}</div>
        <div style={{ fontSize: 9, color: TOKENS.inkMuted, fontFamily: 'ui-monospace, monospace' }}>{hex}</div>
      </div>
    ))}
  </div>
);

const RampStrip = ({ p }) => (
  <div style={{ display: 'flex', gap: 12 }}>
    {p.ramps.map(([label, steps]) => (
      <div key={label} style={{ flex: 1 }}>
        <div style={{ display: 'flex', borderRadius: TOKENS.radiusSm, overflow: 'hidden', height: 26 }}>
          {steps.map((s, i) => <div key={i} style={{ flex: 1, background: s }}/>)}
        </div>
        <div style={{ fontSize: 9.5, fontWeight: 600, color: TOKENS.inkMid, marginTop: 5 }}>{label}</div>
        <div style={{ fontSize: 9, color: TOKENS.inkMuted }}>tint · base · deep</div>
      </div>
    ))}
  </div>
);

const Block = ({ label, children }) => (
  <div style={{ marginTop: 20 }}>
    <div style={{ ...eyebrowStyle(TOKENS.ink), fontSize: 9.5, marginBottom: 9 }}>{label}</div>
    {children}
  </div>
);

const SignalLook = ({ p }) => (
  <div style={{ width: '100%', height: '100%', background: TOKENS.bg, fontFamily: TOKENS.sans,
    padding: '22px 24px', overflow: 'hidden' }}>
    {/* thesis */}
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontSize: 22, fontFamily: TOKENS.serif, fontStyle: 'italic', color: TOKENS.ink, lineHeight: 1.1 }}>
            {p.name}
          </span>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
            color: TOKENS.goldInk, background: 'rgba(200,185,154,0.26)', padding: '2px 8px', borderRadius: 2 }}>
            {p.mechanism}
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: TOKENS.inkMid, marginTop: 5, lineHeight: 1.5 }}>{p.thesis}</div>
      </div>
      {/* Measured contrast of the smallest signal text against its own
          composited background. Stated up front because it decides which
          of these looks is actually shippable. */}
      {p.aa && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
          padding: '5px 10px', borderRadius: TOKENS.radiusSm, fontSize: 10.5, fontWeight: 700,
          color: p.aaPass ? '#2f4a24' : '#6b1f16',
          background: p.aaPass ? 'rgba(107,138,86,0.18)' : 'rgba(156,58,46,0.14)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%',
            background: p.aaPass ? '#2f4a24' : '#6b1f16' }}/>
          {p.aa}
        </div>
      )}
    </div>

    <Block label={p.ramps ? 'Ramps' : 'Signal colors'}>
      {p.ramps ? <RampStrip p={p}/> : <SwatchStrip p={p}/>}
    </Block>
    {p.ramps && <Block label="Deep steps"><SwatchStrip p={p}/></Block>}

    <Block label="Trends">      <TrendRow p={p} tonal={p.id === 'tonal'}/></Block>
    <Block label="Events">      <EventList p={p} look={p.id}/></Block>
    <Block label="Status at rest · and the reserved attention treatment">
      <StatusRow p={p} look={p.id}/>
    </Block>
    <Block label="In a table">  <SignalTable p={p} look={p.id}/></Block>

    <div style={{ marginTop: 20, paddingTop: 14, borderTop: `1px solid ${TOKENS.border}`,
      fontSize: 12, color: TOKENS.inkMid, lineHeight: 1.6 }}>{p.note}</div>
  </div>
);

Object.assign(window, { SIGNAL_LOOKS, SignalLook, Spark, Arrow, TrendRow, EventList, StatusRow, SignalTable });
