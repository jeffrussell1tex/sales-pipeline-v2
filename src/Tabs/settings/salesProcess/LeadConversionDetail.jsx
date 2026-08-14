// settings/salesProcess/LeadConversionDetail.jsx
import React, { useState } from 'react';
import { putSettings } from '../shared/saveSettings.js';
import { T, eb } from '../shared/tokens.js';
import { CSectionCard } from '../shared/form.jsx';
import { LIcon } from '../shared/ui.jsx';
import { CategoryDetailChrome } from '../shared/CategoryDetailChrome.jsx';

const DEFAULT_LEAD_CONV_BENCHMARKS = [
    { source: 'Referral / Partner',  good: 30, avg: 15, poor: 15 },
    { source: 'Inbound',             good: 20, avg: 10, poor: 10 },
    { source: 'Trade Show',          good: 15, avg:  8, poor:  8 },
    { source: 'LinkedIn / Social',   good: 10, avg:  5, poor:  5 },
    { source: 'Cold Outreach',       good:  5, avg:  2, poor:  2 },
    { source: 'Webinar',             good: 15, avg:  8, poor:  8 },
    { source: 'Partner Referral',    good: 30, avg: 15, poor: 15 },
    { source: 'Website',             good: 20, avg: 10, poor: 10 },
    // Blended / fallback — used for any source not listed above
    { source: '_default',            good: 20, avg: 10, poor: 10 },
];

export const LeadConvBenchmarks = ({ settings, setSettings }) => {
    const saved = settings?.leadConvBenchmarks || null;
    const [rows, setRows] = useState(() =>
        saved ? JSON.parse(JSON.stringify(saved)) : JSON.parse(JSON.stringify(DEFAULT_LEAD_CONV_BENCHMARKS))
    );
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [saved2, setSaved2] = useState(false);
    const [newSource, setNewSource] = useState('');

    const update = (i, field, val) => {
        setRows(prev => prev.map((r, ri) => ri === i ? { ...r, [field]: val } : r));
    };

    const addRow = () => {
        const src = newSource.trim();
        if (!src) return;
        if (rows.some(r => r.source.toLowerCase() === src.toLowerCase())) return;
        setRows(prev => [...prev, { source: src, good: 20, avg: 10, poor: 10 }]);
        setNewSource('');
    };

    const removeRow = (i) => {
        setRows(prev => prev.filter((_, ri) => ri !== i));
    };

    const handleSave = async () => {
        setSaving(true);
        // Send ONLY the key this panel owns. It used to PUT the entire settings
        // object, so every unrelated key was rewritten from this component's
        // possibly-stale copy — a lost update for anything changed elsewhere since
        // load. settings.mjs merges on 'key' in data, so a narrow patch is correct.
        let snapshot;
        setSettings(prev => { snapshot = prev; return { ...prev, leadConvBenchmarks: rows }; });
        setSaveError('');
        try {
            await putSettings({ leadConvBenchmarks: rows });
            setSaved2(true);
            setTimeout(() => setSaved2(false), 2000);
        } catch (e) {
            console.error('Failed to save lead conv benchmarks', e);
        } finally {
            setSaving(false);
        }
    };

    const defaultRow = rows.find(r => r.source === '_default');
    const sourceRows = rows.filter(r => r.source !== '_default');

    const inputSt = { width: 54, padding: '4px 6px', fontSize: 12, border: `1px solid ${T.border}`, borderRadius: T.r, background: T.bg, color: T.ink, fontFamily: T.sans, textAlign: 'right' };
    const pctLabel = (v) => v + '%';

    return (
        <div>
            {/* saveError lives here, in the component that owns the write.
                LeadConversionDetail renders the chrome but has no save state. */}
            {saveError && (
                <div style={{ padding:'10px 14px', marginBottom:14, background:'rgba(156,58,46,0.08)',
                    border:`1px solid ${T.danger}`, borderRadius:T.r, color:T.danger, fontSize:12.5 }}>
                    {saveError}
                </div>
            )}
            <div style={{ fontSize: 13, color: T.inkMid, marginBottom: 16, lineHeight: 1.55, fontFamily: T.sans }}>
                These thresholds drive the colour coding in <strong>Reports → Leads → Source ROI</strong>.
                Each source shows <span style={{ color: T.ok, fontWeight: 700 }}>green</span> when conversion rate ≥ Good,{' '}
                <span style={{ color: T.warn, fontWeight: 700 }}>amber</span> when ≥ Poor threshold, and{' '}
                <span style={{ color: T.danger, fontWeight: 700 }}>red</span> below Poor.
                The <em>All other sources</em> row is the fallback for any source not listed.
            </div>

            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 32px', gap: 10, padding: '6px 0', borderBottom: `1px solid ${T.border}`, marginBottom: 4 }}>
                {['Source', 'Good ≥', 'Avg ≥', 'Poor <', ''].map((h, i) => (
                    <div key={i} style={{ ...eb(T.inkMuted), textAlign: i === 0 ? 'left' : 'right' }}>{h}</div>
                ))}
            </div>

            {/* Source rows */}
            {sourceRows.map((r, i) => (
                <div key={r.source} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 32px', gap: 10, padding: '9px 0', borderBottom: `1px solid ${T.surface2}`, alignItems: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: T.ink, fontFamily: T.sans }}>{r.source}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                        <input type="number" min="0" max="100" value={r.good}
                            onChange={e => update(rows.indexOf(r), 'good', Math.max(0, Math.min(100, parseInt(e.target.value)||0)))}
                            style={{ ...inputSt, color: T.ok }}/>
                        <span style={{ fontSize: 11, color: T.inkMuted }}>%</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                        <input type="number" min="0" max="100" value={r.avg}
                            onChange={e => update(rows.indexOf(r), 'avg', Math.max(0, Math.min(100, parseInt(e.target.value)||0)))}
                            style={{ ...inputSt, color: T.warn }}/>
                        <span style={{ fontSize: 11, color: T.inkMuted }}>%</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                        <input type="number" min="0" max="100" value={r.poor}
                            onChange={e => update(rows.indexOf(r), 'poor', Math.max(0, Math.min(100, parseInt(e.target.value)||0)))}
                            style={{ ...inputSt, color: T.danger }}/>
                        <span style={{ fontSize: 11, color: T.inkMuted }}>%</span>
                    </div>
                    <button onClick={() => removeRow(rows.indexOf(r))}
                        style={{ background: 'none', border: 'none', color: T.inkMuted, fontSize: 16, cursor: 'pointer', padding: 0, lineHeight: 1, fontFamily: T.sans }}>×</button>
                </div>
            ))}

            {/* Default fallback row — always shown, source name not editable */}
            {defaultRow && (
                <>
                    <div style={{ padding: '8px 0 4px', fontSize: 11, color: T.inkMuted, fontWeight: 600, letterSpacing: 0.4, fontFamily: T.sans }}>
                        FALLBACK — ALL OTHER SOURCES
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 32px', gap: 10, padding: '9px 0', borderBottom: `1px solid ${T.border}`, alignItems: 'center', background: T.surface2, borderRadius: T.r, paddingLeft: 8, paddingRight: 8 }}>
                        <div style={{ fontSize: 13, fontStyle: 'italic', color: T.inkMid, fontFamily: T.sans }}>All other sources</div>
                        {['good','avg','poor'].map((field, fi) => (
                            <div key={field} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                                <input type="number" min="0" max="100" value={defaultRow[field]}
                                    onChange={e => update(rows.indexOf(defaultRow), field, Math.max(0, Math.min(100, parseInt(e.target.value)||0)))}
                                    style={{ ...inputSt, color: [T.ok, T.warn, T.danger][fi] }}/>
                                <span style={{ fontSize: 11, color: T.inkMuted }}>%</span>
                            </div>
                        ))}
                        <div/>
                    </div>
                </>
            )}

            {/* Add new source row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
                <input
                    value={newSource}
                    onChange={e => setNewSource(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addRow()}
                    placeholder="Add a source (e.g. Conference)…"
                    style={{ flex: 1, padding: '7px 10px', fontSize: 12.5, border: `1px dashed ${T.borderStrong}`, borderRadius: T.r, background: T.bg, color: T.ink, fontFamily: T.sans, outline: 'none' }}
                />
                <button onClick={addRow}
                    style={{ padding: '7px 14px', fontSize: 12, fontWeight: 600, background: 'transparent', color: T.inkMid, border: `1px solid ${T.border}`, borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans, whiteSpace: 'nowrap' }}>
                    + Add source
                </button>
            </div>

            {/* Legend */}
            <div style={{ marginTop: 16, padding: '10px 14px', background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 11.5, color: T.inkMid, lineHeight: 1.6, fontFamily: T.sans }}>
                <strong style={{ color: T.ink }}>How thresholds work:</strong>{' '}
                Conv rate ≥ Good → <span style={{ color: T.ok, fontWeight: 700 }}>green</span> ·{' '}
                ≥ Avg → <span style={{ color: T.warn, fontWeight: 700 }}>amber</span> ·{' '}
                &lt; Poor → <span style={{ color: T.danger, fontWeight: 700 }}>red</span> ·{' '}
                0% (no conversions) → muted grey
            </div>

            {/* Save */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
                {saved2 && <span style={{ fontSize: 12, color: T.ok, fontWeight: 600, fontFamily: T.sans }}>✓ Saved</span>}
                <button onClick={() => setRows(JSON.parse(JSON.stringify(DEFAULT_LEAD_CONV_BENCHMARKS)))}
                    style={{ padding: '7px 14px', fontSize: 12, fontWeight: 600, background: 'transparent', color: T.inkMid, border: `1px solid ${T.border}`, borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans }}>
                    Reset to defaults
                </button>
                <button onClick={handleSave} disabled={saving}
                    style={{ padding: '7px 16px', fontSize: 12, fontWeight: 600, background: saving ? T.borderStrong : T.ink, color: T.surface, border: 'none', borderRadius: T.r, cursor: saving ? 'default' : 'pointer', fontFamily: T.sans }}>
                    {saving ? 'Saving…' : 'Save benchmarks'}
                </button>
            </div>
        </div>
    );
};

export const LeadConversionDetail = ({ settings, setSettings, onBack }) => {
    return (
        <CategoryDetailChrome
            crumb="Lead conversion benchmarks" title="Lead conversion benchmarks"
            subtitle="Good / average / poor conversion rate targets by lead source"
            statusDetail="8 sources configured"
            updatedBy="Admin" updatedAt="today"
            onBack={onBack} dirty={false}
            rightActions={<></>}
        >
            <div style={{ display:'grid', gridTemplateColumns:'1fr 380px', gap:20 }}>
                <div>
                    <CSectionCard title="Conversion targets" description="Set lead→opportunity conversion thresholds per source. Reps see colored badges on lead queues; managers see variance in Sales Manager dashboards.">
                        <LeadConvBenchmarks settings={settings} setSettings={setSettings}/>
                    </CSectionCard>
                </div>
                <div>
                    <div style={{ position:'sticky', top:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+4, overflow:'hidden' }}>
                        <div style={{ padding:'14px 16px', background:'#2a2622', color:'#fbf8f3' }}>
                            <div style={{ fontSize:10, fontWeight:700, color:T.gold, letterSpacing:0.8, textTransform:'uppercase', marginBottom:5, fontFamily:T.sans }}>Where these show up</div>
                            <div style={{ fontSize:13, color:'#fbf8f3', lineHeight:1.5, fontFamily:T.sans }}>Benchmarks drive the colored state on 3 surfaces.</div>
                        </div>
                        {[
                            { n:'Leads queue',               d:'Source column colors by target' },
                            { n:'Sales Manager · Sources',   d:'Variance vs good target' },
                            { n:'Lead scoring rules',        d:'Auto-route off-target sources' },
                        ].map((item,idx) => (
                            <div key={idx} style={{ padding:'11px 12px', borderBottom: idx<2 ? `1px solid ${T.border}` : 'none', display:'flex', gap:10, alignItems:'flex-start' }}>
                                <LIcon name="link" size={13} color={T.goldInk} style={{ marginTop:2, flexShrink:0 }}/>
                                <div>
                                    <div style={{ fontSize:12.5, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{item.n}</div>
                                    <div style={{ fontSize:11, color:T.inkMuted, marginTop:2, fontFamily:T.sans }}>{item.d}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </CategoryDetailChrome>
    );
};
