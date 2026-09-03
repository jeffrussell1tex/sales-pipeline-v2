// settings/quoting/EditBrandModal.jsx
// Edit brand editor — opens from the "Edit brand" button on Quote templates & branding.
// Ported from the design handoff; brand is workspace-scoped (settings.quoteBrand) and
// applies to every quote template. Live quote-document preview re-renders as you edit.
import React from 'react';
import { T } from '../shared/tokens.js';
import { dbWrite } from '../../../utils/storage';
import { useApp } from '../../../AppContext';

const SERIF = 'Georgia, "Tiempos", serif';
const eyebrow = (color) => ({ fontSize: 11, fontWeight: 600, color: color || T.inkMuted, letterSpacing: 0.8, textTransform: 'uppercase' });

export const BRAND_PRESET = {
  logoMark:    '◐',
  companyName: 'Accelerep',
  primary:     '#6b2a22',
  accent:      '#b87333',
  ink:         '#1a1612',
  paper:       '#fbf8f3',
  displayFont: 'Editorial',
  bodyFont:    'Söhne',
  contactLine: 'sales@accelerep.com · accelerep.com · +1 (415) 555-0140',
};

// Curated palettes — brand edits should stay on-brand, so we offer tasteful
// presets rather than a raw spectrum (the dot still opens a full picker).
const COLOR_PRESETS = {
  primary: ['#6b2a22', '#2f4a36', '#26354d', '#2a2622', '#1f5a5a', '#4a2a44'],
  accent:  ['#b87333', '#c8a978', '#7a8b5a', '#6a7a8a', '#a8584a', '#9c7a3a'],
  ink:     ['#1a1612', '#2a2622', '#222831', '#2b2422'],
  paper:   ['#fbf8f3', '#ffffff', '#f6f1e8', '#f4f0ea'],
};

// Font name → real rendering, so the preview shows a genuine difference.
const FONT_RENDER = {
  'Editorial':  { family: 'Georgia, "Tiempos", serif', style: 'italic' },
  'Tiempos':    { family: 'Georgia, "Tiempos", serif', style: 'normal' },
  'Canela':     { family: '"Plus Jakarta Sans", system-ui, sans-serif', style: 'normal', weight: 300 },
  'Söhne':      { family: '"Plus Jakarta Sans", system-ui, sans-serif', style: 'normal' },
  'Söhne Kräftig': { family: '"Plus Jakarta Sans", system-ui, sans-serif', style: 'normal', weight: 700 },
  'System':     { family: 'system-ui, sans-serif', style: 'normal' },
};
const DISPLAY_FONTS = ['Editorial', 'Tiempos', 'Canela', 'Söhne Kräftig'];
const BODY_FONTS    = ['Söhne', 'Plus Jakarta Sans', 'System'];
const fontOf = (name) => FONT_RENDER[name] || FONT_RENDER['Söhne'];

// ────────────────────────────────────────────────────────────────
// Live quote-document preview (brand-driven). Mirrors MockQuoteDoc but
// honours the editable font choices so typography changes are visible.
// ────────────────────────────────────────────────────────────────
export const BrandPreviewDoc = ({ brand, scale = 1, sections = ['cover', 'lines', 'terms', 'signature'] }) => {
  const disp = fontOf(brand.displayFont);
  const body = fontOf(brand.bodyFont);
  const w = 380 * scale, h = 506 * scale;
  const dispStyle = { fontFamily: disp.family, fontStyle: disp.style, fontWeight: disp.weight || 700 };
  return (
    <div style={{
      width: w, height: h, background: brand.paper,
      border: `1px solid rgba(0,0,0,0.08)`, borderRadius: 4,
      boxShadow: '0 12px 30px rgba(0,0,0,0.16), 0 2px 0 rgba(0,0,0,0.04)',
      padding: 22 * scale, fontSize: 9 * scale, color: brand.ink,
      fontFamily: body.family, fontWeight: body.weight || 400,
      overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 11 * scale,
      transition: 'background 160ms ease, color 160ms ease',
    }}>
      {sections.includes('cover') && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 * scale }}>
            <span style={{ fontSize: 20 * scale, color: brand.primary, lineHeight: 1 }}>{brand.logoMark}</span>
            <b style={{ ...dispStyle, fontSize: 14 * scale }}>{brand.companyName}</b>
          </div>
          <div style={{ height: 1.5, background: brand.primary, opacity: 0.7 }}/>
          <div style={{
            fontSize: 7.5 * scale, fontWeight: 700, letterSpacing: 1.2,
            textTransform: 'uppercase', color: brand.accent,
          }}>QUOTE · Q-2845</div>
          <div style={{ ...dispStyle, fontSize: 20 * scale, lineHeight: 1.08 }}>
            Mountain View Capital
          </div>
          <div style={{ fontSize: 8 * scale, opacity: 0.55 }}>
            Prepared for Helena Choi · Q3 2024 · Valid 30 days
          </div>
        </>
      )}
      {sections.includes('summary') && (
        <div style={{ background: 'rgba(0,0,0,0.035)', padding: 9 * scale, borderRadius: 3, fontSize: 8 * scale, lineHeight: 1.5 }}>
          <div style={{ fontSize: 6.5 * scale, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: brand.accent, marginBottom: 3 }}>Summary</div>
          Three-year subscription with onboarding and 24/7 premium support, reflecting a CFO-approved annual incentive.
        </div>
      )}
      {sections.includes('lines') && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1.5px solid ${brand.primary}`, fontWeight: 700, fontSize: 7.5 * scale, letterSpacing: 0.5 }}>
            <span>ITEM</span><span>QTY</span><span>TOTAL</span>
          </div>
          {[
            ['Accelerep Core', '50', '$36,000'],
            ['Pipeline & Forecasting', '50', '$12,000'],
            ['Premium support', '1', '$4,800'],
            ['Onboarding — White-glove', '1', '$8,500'],
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4.5px 0', fontSize: 8 * scale, borderBottom: `1px solid rgba(0,0,0,0.06)` }}>
              <span>{r[0]}</span>
              <span style={{ opacity: 0.5 }}>{r[1]}</span>
              <span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{r[2]}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 7, fontSize: 9.5 * scale, fontWeight: 700 }}>
            <span>Total</span>
            <span style={{ ...dispStyle, color: brand.primary }}>$61,300</span>
          </div>
        </div>
      )}
      {sections.includes('terms') && (
        <div style={{ marginTop: 'auto', fontSize: 7 * scale, opacity: 0.65, lineHeight: 1.5 }}>
          <div style={{ fontSize: 6.5 * scale, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: brand.accent, marginBottom: 3 }}>Terms</div>
          Net-30 invoicing. Auto-renew with 60-day notice. Pricing locked for the term.
          <div style={{ marginTop: 7, color: brand.ink, opacity: 0.85 }}>{brand.contactLine}</div>
        </div>
      )}
      {sections.includes('signature') && (
        <div style={{
          marginTop: 4, padding: 9 * scale,
          border: `1px dashed ${brand.primary}`, borderRadius: 3,
          fontSize: 7.5 * scale, opacity: 0.8, display: 'flex', justifyContent: 'space-between',
        }}>
          <span>Signature ___________________</span>
          <span>Date ____________</span>
        </div>
      )}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────
// Control atoms
// ────────────────────────────────────────────────────────────────
const ControlGroup = ({ label, hint, children }) => (
  <div style={{ marginBottom: 22 }}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
      <div style={{ ...eyebrow(T.ink), fontSize: 10.5 }}>{label}</div>
      {hint && <div style={{ fontSize: 11, color: T.inkMuted }}>{hint}</div>}
    </div>
    {children}
  </div>
);

// A single color row — label, big editable swatch (opens native picker),
// hex field, and a curated preset palette.
const ColorControl = ({ label, value, presets, onChange }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 11.5, fontWeight: 600, color: T.inkMid, marginBottom: 6 }}>{label}</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {/* Big swatch = native picker trigger */}
      <label style={{
        position: 'relative', width: 34, height: 34, borderRadius: 3,
        background: value, border: `1px solid rgba(0,0,0,0.12)`, cursor: 'pointer',
        boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.4)', flexShrink: 0,
      }}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
          style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}/>
      </label>
      {/* Hex field */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, flex: 1,
        padding: '7px 10px', background: T.surface,
        border: `1px solid ${T.border}`, borderRadius: 3,
      }}>
        <span style={{ color: T.inkMuted, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }}>#</span>
        <input
          value={value.replace('#', '')}
          onChange={(e) => {
            const v = '#' + e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
            onChange(v);
          }}
          spellCheck={false}
          style={{
            flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
            fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, color: T.ink,
            textTransform: 'lowercase', padding: 0,
          }}
        />
      </div>
      {/* Preset palette */}
      <div style={{ display: 'flex', gap: 4 }}>
        {presets.map((p) => (
          <button key={p} onClick={() => onChange(p)} title={p} style={{
            width: 18, height: 18, borderRadius: 3, background: p, cursor: 'pointer',
            border: value.toLowerCase() === p.toLowerCase()
              ? `2px solid ${T.goldInk}` : `1px solid rgba(0,0,0,0.12)`,
            padding: 0,
          }}/>
        ))}
      </div>
    </div>
  </div>
);

// A select rendered as a segmented font picker so the typeface shows itself.
const FontPicker = ({ options, value, onChange, italicFirst }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
    {options.map((o) => {
      const f = fontOf(o);
      const active = o === value;
      return (
        <button key={o} onClick={() => onChange(o)} style={{
          padding: '7px 12px', borderRadius: 3, cursor: 'pointer',
          background: active ? T.ink : T.surface,
          color: active ? '#fbf8f3' : T.ink,
          border: `1px solid ${active ? T.ink : T.border}`,
          fontFamily: f.family, fontStyle: f.style, fontWeight: f.weight || 500,
          fontSize: 13,
        }}>{o}</button>
      );
    })}
  </div>
);

const TextField = ({ value, onChange, placeholder, mono }) => (
  <div style={{
    padding: '8px 10px', background: T.surface,
    border: `1px solid ${T.border}`, borderRadius: 3,
  }}>
    <input
      value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      style={{
        width: '100%', border: 'none', outline: 'none', background: 'transparent',
        fontSize: 13, color: T.ink, padding: 0,
        fontFamily: mono ? 'ui-monospace, Menlo, monospace' : 'inherit',
      }}
    />
  </div>
);

const FieldLabel = ({ children, hint }) => (
  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: T.inkMid, marginBottom: 6 }}>
    {children}
    {hint && <span style={{ fontWeight: 400, color: T.inkMuted, marginLeft: 6 }}>{hint}</span>}
  </label>
);

// ────────────────────────────────────────────────────────────────
// The modal
// ────────────────────────────────────────────────────────────────
export const EditBrandModal = ({ initial = BRAND_PRESET, onClose }) => {
  const [brand, setBrand] = React.useState(initial);
  const [previewSections, setPreviewSections] = React.useState(['cover', 'lines', 'terms', 'signature']);
  const set = (key, val) => setBrand((b) => ({ ...b, [key]: val }));
  const dirty = JSON.stringify(brand) !== JSON.stringify(initial);
  const { setSettings, showConfirm } = useApp();
  const close = () => { if (dirty) { showConfirm('Discard unsaved brand changes?', onClose, false); return; } onClose(); };
  const [saveError, setSaveError] = React.useState('');
  const handleSave = async () => {
    // The modal used to close unconditionally. PUT /settings is Admin-only since
    // SVR-2, so a non-admin's brand edit appeared to save, the modal closed, and
    // the change was gone on reload. Now it stays open and says why.
    let snapshot;
    if (setSettings) setSettings((s) => { snapshot = s; return { ...s, quoteBrand: brand }; });
    setSaveError('');
    const r = await dbWrite('/.netlify/functions/settings', { method: 'PUT', body: JSON.stringify({ quoteBrand: brand }) });
    if (!r.ok) {
      if (setSettings && snapshot) setSettings(snapshot);
      setSaveError(`Brand not saved — ${r.error}`);
      return;
    }
    onClose();
  };
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const LOGO_MARKS = ['◐', '●', '◆', '▲', '❖', '◈'];
  const SECTION_OPTS = [
    ['cover', 'Cover'], ['summary', 'Summary'], ['lines', 'Line items'],
    ['terms', 'Terms'], ['signature', 'Signature'],
  ];
  const toggleSection = (id) =>
    setPreviewSections((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: T.sans,
    }}>
      {/* Scrim */}
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(26,22,18,0.55)' }}/>

      {/* Dialog */}
      <div style={{
        position: 'relative', width: 1060, maxWidth: '94vw', height: 700, maxHeight: '92vh',
        background: T.bg, borderRadius: 6,
        boxShadow: '0 30px 80px rgba(0,0,0,0.4)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px', borderBottom: `1px solid ${T.border}`,
          background: T.surface, display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ ...eyebrow(T.inkMuted), fontSize: 10, marginBottom: 4 }}>Quote templates & branding</div>
            <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontWeight: 700, fontSize: 23, color: T.ink, lineHeight: 1.1 }}>
              Edit brand
            </div>
            <div style={{ fontSize: 12.5, color: T.inkMid, marginTop: 4 }}>
              Logo, colors and type apply to <b>all 4 quote templates</b>. The preview updates as you edit.
            </div>
          </div>
          <button onClick={close} style={{
            width: 32, height: 32, borderRadius: 3, flexShrink: 0,
            border: `1px solid ${T.border}`, background: T.surface, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 17, color: T.inkMid, lineHeight: 1,
          }}>×</button>
        </div>

        {/* Body: controls | preview */}
        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '460px 1fr' }}>
          {/* LEFT — controls (scrolls) */}
          <div style={{ overflow: 'auto', padding: '22px 24px', borderRight: `1px solid ${T.border}` }}>

            {/* Logo */}
            <ControlGroup label="Logo">
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 56, height: 56, background: brand.paper,
                  border: `1.5px solid ${brand.primary}`, borderRadius: 4,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 30, color: brand.primary, flexShrink: 0,
                }}>{brand.logoMark}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                    {LOGO_MARKS.map((m) => (
                      <button key={m} onClick={() => set('logoMark', m)} style={{
                        width: 30, height: 30, borderRadius: 3, cursor: 'pointer',
                        background: brand.logoMark === m ? 'rgba(200,185,154,0.30)' : T.surface,
                        border: `1px solid ${brand.logoMark === m ? T.goldInk : T.border}`,
                        fontSize: 15, color: T.ink, lineHeight: 1,
                      }}>{m}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button style={{
                      padding: '6px 12px', background: T.surface, color: T.ink,
                      border: `1px solid ${T.borderStrong}`, borderRadius: 3,
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}>Upload SVG…</button>
                    <span style={{ fontSize: 10.5, color: T.inkMuted }}>SVG or PNG · 240×80</span>
                  </div>
                </div>
              </div>
            </ControlGroup>

            {/* Brand colors */}
            <div style={{ paddingTop: 18, borderTop: `1px solid ${T.border}` }}>
              <ControlGroup label="Brand colors" hint="pick from presets or set a hex">
                <ColorControl label="Primary"   value={brand.primary} presets={COLOR_PRESETS.primary} onChange={(v) => set('primary', v)}/>
                <ColorControl label="Accent"    value={brand.accent}  presets={COLOR_PRESETS.accent}  onChange={(v) => set('accent', v)}/>
                <ColorControl label="Ink (text)" value={brand.ink}     presets={COLOR_PRESETS.ink}     onChange={(v) => set('ink', v)}/>
                <ColorControl label="Paper"     value={brand.paper}   presets={COLOR_PRESETS.paper}   onChange={(v) => set('paper', v)}/>
              </ControlGroup>
            </div>

            {/* Typography */}
            <div style={{ paddingTop: 18, borderTop: `1px solid ${T.border}` }}>
              <ControlGroup label="Typography">
                <div style={{ marginBottom: 14 }}>
                  <FieldLabel hint="headings, company & customer name">Display font</FieldLabel>
                  <FontPicker options={DISPLAY_FONTS} value={brand.displayFont} onChange={(v) => set('displayFont', v)}/>
                </div>
                <div>
                  <FieldLabel hint="body copy, tables">Body font</FieldLabel>
                  <FontPicker options={BODY_FONTS} value={brand.bodyFont} onChange={(v) => set('bodyFont', v)}/>
                </div>
              </ControlGroup>
            </div>

            {/* Company details */}
            <div style={{ paddingTop: 18, borderTop: `1px solid ${T.border}` }}>
              <ControlGroup label="Company details">
                <div style={{ marginBottom: 14 }}>
                  <FieldLabel>Company name</FieldLabel>
                  <TextField value={brand.companyName} onChange={(v) => set('companyName', v)} placeholder="Company name"/>
                </div>
                <div>
                  <FieldLabel hint="prints in the quote footer">Contact line</FieldLabel>
                  <TextField value={brand.contactLine} onChange={(v) => set('contactLine', v)} placeholder="email · website · phone"/>
                </div>
              </ControlGroup>
            </div>
          </div>

          {/* RIGHT — live preview */}
          <div style={{
            background: 'linear-gradient(180deg, #ece4d3 0%, #ddd1ba 100%)',
            position: 'relative', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'flex-start', padding: '52px 24px 24px', minHeight: 0, overflow: 'auto',
          }}>
            {/* Preview toolbar */}
            <div style={{
              position: 'absolute', top: 14, left: 16, right: 16,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ ...eyebrow(T.inkMid), fontSize: 9.5 }}>Live preview</span>
              <span style={{ flex: 1 }}/>
              {SECTION_OPTS.map(([id, label]) => {
                const on = previewSections.includes(id);
                return (
                  <button key={id} onClick={() => toggleSection(id)} style={{
                    padding: '3px 9px', borderRadius: 12, cursor: 'pointer',
                    fontSize: 10.5, fontWeight: 600,
                    background: on ? T.ink : 'rgba(255,255,255,0.45)',
                    color: on ? '#fbf8f3' : T.inkMid,
                    border: `1px solid ${on ? T.ink : 'rgba(0,0,0,0.08)'}`,
                  }}>{label}</button>
                );
              })}
            </div>

            <div style={{ marginTop: 0 }}>
              <BrandPreviewDoc brand={brand} scale={0.95} sections={previewSections}/>
            </div>

            <div style={{ position: 'absolute', bottom: 14, fontSize: 10.5, color: T.inkMid, opacity: 0.8 }}>
              Quote Q-2845 · sample data
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 24px', borderTop: `1px solid ${T.border}`,
          background: T.surface, display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <button onClick={() => setBrand(initial)} disabled={!dirty} style={{
            fontSize: 12, fontWeight: 600, cursor: dirty ? 'pointer' : 'default',
            color: dirty ? T.goldInk : T.inkMuted, background: 'transparent',
            border: 'none', padding: 0,
          }}>Reset to last saved</button>
          <span style={{ fontSize: 11.5, color: T.inkMuted }}>
            · Brand is shared across all templates
          </span>
          <span style={{ flex: 1 }}/>
          {dirty && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: T.goldInk }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.goldInk }}/>
              Unsaved changes
            </span>
          )}
          {saveError && (
            <span style={{ marginRight: 'auto', fontSize: 12, color: T.danger, fontWeight: 600 }}>
              {saveError}
            </span>
          )}
          <button onClick={close} style={{
            padding: '8px 16px', background: T.surface, color: T.ink,
            border: `1px solid ${T.borderStrong}`, borderRadius: 3,
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleSave} style={{
            padding: '8px 18px', background: T.ink, color: '#fbf8f3',
            border: 'none', borderRadius: 3,
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>Save brand</button>
        </div>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────
// Demo wrapper — Quote templates page behind, modal on top.
