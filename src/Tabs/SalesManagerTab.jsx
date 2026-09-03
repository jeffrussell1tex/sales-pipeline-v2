import React, { useState, useMemo } from 'react';
import { audienceLabel, sortNotes } from '../utils/coachingNotes';
import { useApp } from '../AppContext';
import { dbFetch } from '../utils/storage';
import { isoLocal, todayLocal } from '../utils/dateLocal';
import { currentQuarter } from '../utils/quarters';
import { fiscalRange } from '../utils/reportPeriod';
import { userQuotaFor, closeDayInRange } from '../utils/pipelineReport';
import { forecastCallOf, withForecastCall, bestCaseOf } from '../utils/forecastCall';

// ── V1 Design tokens ──────────────────────────────────────────
const T = {
    bg:           '#f0ece4',
    surface:      '#fbf8f3',
    surface2:     '#f5efe3',
    border:       '#e6ddd0',
    borderStrong: '#d4c8b4',
    ink:          '#2a2622',
    inkMid:       '#5a544c',
    inkMuted:     '#8a8378',
    gold:         '#c8b99a',
    goldInk:      '#7a6a48',
    danger:       '#9c3a2e',
    warn:         '#b87333',
    ok:           '#4d6b3d',
    info:         '#3a5a7a',
    sans:         '"Plus Jakarta Sans", system-ui, sans-serif',
    serif:        'Georgia, serif',
    r:            3,
};

const fmtV = v => { const n = parseFloat(v)||0; return n >= 1e6 ? '$'+(n/1e6).toFixed(1)+'M' : n >= 1e3 ? '$'+Math.round(n/1e3)+'K' : '$'+n.toLocaleString(); };

const avatarBg = name => {
    const p = ['#9c6b4a','#7a5a3c','#5a6e5a','#6b5a7a','#8a5a5a','#5a7a8a','#7a6b5a','#4a6b5a'];
    let h = 0; for (let i = 0; i < (name||'').length; i++) h = (h*31 + (name||'').charCodeAt(i))|0;
    return p[Math.abs(h) % p.length];
};

const Avatar = ({ name, size=28 }) => {
    const initials = (name||'').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
    return (
        <div style={{ width:size, height:size, borderRadius:'50%', background:avatarBg(name), color:'#fef4e6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*0.33, fontWeight:700, flexShrink:0 }}>
            {initials}
        </div>
    );
};

// ── Per-rep stats computation ─────────────────────────────────
// `period` is the current fiscal quarter from currentQuarter(): { q, from, to }.
// Closed and quota are QUARTER-TO-DATE — the deals won inside it by close day
// (closeDayInRange, §0.75) against that quarter's figure (userQuotaFor: a
// quarterly plan's own number, else annual ÷ 4). They used to be every Closed
// Won deal the rep ever had against the ANNUAL quota, under a header that names
// a quarter (state §0.80; Jeff's call). wonOpps stays all-time: the Team tab's
// win rate reads it.
function buildRepStats(rep, opportunities, activities, tasks, period) {
    const today    = new Date();
    const todayStr = isoLocal(today);

    const allRepOpps  = (opportunities||[]).filter(o => o.salesRep === rep.name || o.assignedTo === rep.name);
    const activeOpps  = allRepOpps.filter(o => !['Closed Won','Closed Lost'].includes(o.stage));
    const wonOpps     = allRepOpps.filter(o => o.stage === 'Closed Won');
    const wonInQ      = wonOpps.filter(o => closeDayInRange(o, period.from, period.to));

    const closedArr   = wonInQ.reduce((s,o) => s+(parseFloat(o.arr)||0), 0);
    const pipelineArr = activeOpps.reduce((s,o) => s+(parseFloat(o.arr)||0), 0);

    // Quota — this quarter's
    const quota     = userQuotaFor(rep, `Q${period.q}`);
    const attainPct = quota > 0 ? Math.round((closedArr / quota) * 100) : null;

    // Commit and Best case — the rep's forecast call for THIS quarter, from
    // profile.forecastCalls keyed by quarter (state §0.84). `rep.commit` was a
    // key users.mjs never stored, so the ledger's Commit was 0 on every refresh,
    // and one number per rep could never reset when the quarter turned. Best
    // case falls back to 60% of open pipeline, flagged as an estimate for the cell.
    const call     = forecastCallOf(rep, period.key);
    const commit   = call.commit ?? 0;
    const best     = bestCaseOf(rep, period.key, pipelineArr);
    const bestCase = best.value;
    const bestCaseEstimated = best.estimated;

    // Activity recency
    const repActs     = (activities||[]).filter(a => a.salesRep === rep.name || a.author === rep.name);
    const lastActDate = [...repActs].sort((a,b) => (b.date||'').localeCompare(a.date||''))[0]?.date || null;
    const daysSinceAct = lastActDate ? Math.floor((today - new Date(lastActDate+'T12:00:00'))/86400000) : null;

    // Activity last 7d
    const act7d = repActs.filter(a => a.date && Math.floor((today - new Date(a.date+'T12:00:00'))/86400000) <= 7).length;

    // Stuck deals (no stage change in 14+ days)
    const stuck = activeOpps.filter(o => {
        if (!o.stageChangedDate) return false;
        return Math.floor((today - new Date(o.stageChangedDate+'T12:00:00'))/86400000) >= 14;
    }).length;

    // Overdue tasks
    const repTasks   = (tasks||[]).filter(t => t.assignedTo === rep.name);
    const overdueCnt = repTasks.filter(t => !t.completed && t.status !== 'Completed' && t.dueDate && new Date(t.dueDate+'T12:00:00') < today).length;

    // Health score
    let score = 100;
    if (daysSinceAct === null) score -= 30; else if (daysSinceAct >= 21) score -= 30; else if (daysSinceAct >= 14) score -= 20; else if (daysSinceAct >= 7) score -= 10;
    score -= Math.min(25, stuck * 8);
    score -= Math.min(20, overdueCnt * 5);
    if (attainPct === null) score -= 10; else if (attainPct < 25) score -= 25; else if (attainPct < 50) score -= 15; else if (attainPct < 75) score -= 5;
    score = Math.max(0, Math.round(score));

    const healthColor = score >= 65 ? T.ok : score >= 40 ? T.warn : T.danger;
    const healthLabel = score >= 65 ? (attainPct >= 100 ? 'STRONG +' : 'ON TRACK →') : score >= 40 ? 'WOBBLY ~' : 'AT RISK ↓';

    // Trend (positive = improving)
    const trend = attainPct !== null && attainPct >= 80 ? 'up' : attainPct !== null && attainPct < 40 ? 'down' : 'flat';

    return { rep, quota, closedArr, commit, bestCase, bestCaseEstimated, pipelineArr, attainPct, score, healthColor, healthLabel, trend, daysSinceAct, act7d, stuck, overdueCnt, wonOpps, wonInQ, activeOpps };
}

// ── QuotaRepCard (unchanged from original) ────────────────────
function QuotaRepCard({ u, quotaMode, quarters, inputSt, updateRepField, compactInput }) {
    const [localAnnual, setLocalAnnual] = React.useState(u.annualQuota != null ? String(u.annualQuota) : '');
    const [localQ, setLocalQ] = React.useState(() => {
        const out = {};
        ['q1','q2','q3','q4'].forEach(q => { out[q] = u[q+'Quota'] != null ? String(u[q+'Quota']) : ''; });
        return out;
    });
    React.useEffect(() => { setLocalAnnual(u.annualQuota != null ? String(u.annualQuota) : ''); }, [u.annualQuota]);
    React.useEffect(() => { setLocalQ(prev => { const out={...prev}; ['q1','q2','q3','q4'].forEach(q => { out[q]=u[q+'Quota'] != null ? String(u[q+'Quota']) : ''; }); return out; }); }, [u.q1Quota,u.q2Quota,u.q3Quota,u.q4Quota]);
    const commitAnnual = v => { const n=parseFloat(v); if(!isNaN(n)&&n>=0) updateRepField(u.id,'annualQuota',n); };
    const commitQ = (qKey,v) => { const n=parseFloat(v); if(!isNaN(n)&&n>=0) updateRepField(u.id,qKey+'Quota',n); };
    if (compactInput) {
        if (quotaMode === 'annual') return (
            <input type="number" value={localAnnual} placeholder="0" onChange={e=>setLocalAnnual(e.target.value)} onBlur={e=>commitAnnual(e.target.value)} onFocus={e=>e.target.style.borderColor=T.info} style={inputSt} />
        );
        return (
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
                {[['Q1','Q2'],['Q3','Q4']].map((pair,pi) => (
                    <div key={pi} style={{display:'flex',gap:4}}>
                        {pair.map(q => { const qk=q.toLowerCase(); return (
                            <div key={q} style={{display:'flex',flexDirection:'column',gap:1}}>
                                <div style={{fontSize:8,fontWeight:700,color:T.inkMuted,textTransform:'uppercase'}}>{q}</div>
                                <input type="number" value={localQ[qk]||''} placeholder="0" onChange={e=>setLocalQ(p=>({...p,[qk]:e.target.value}))} onBlur={e=>commitQ(qk,e.target.value)} onFocus={e=>e.target.style.borderColor=T.info} style={inputSt} />
                            </div>
                        );})}
                    </div>
                ))}
            </div>
        );
    }
    return null;
}

// A forecast-call cell (Commit / Best case): click to type, blur or Enter to
// save, Escape to keep the old value. `estimated` renders the fallback muted
// and in italics with an "est." tag, so a figure the rep never called is not
// read as one they did (state §0.84). Module scope: defined inside the tab it
// would remount on every render and lose the input mid-edit.
function CallCell({ value, estimated, editing, onEdit, onCancel, onSave, color }) {
    const skip = React.useRef(false);
    if (editing) return (
        <input type="number" min="0" defaultValue={estimated ? '' : value} placeholder={estimated ? String(Math.round(value)) : '0'}
            autoFocus
            onBlur={e => { if (skip.current) { skip.current = false; onCancel(); return; } onSave(e.target.value); }}
            onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { skip.current = true; e.target.blur(); } }}
            style={{ width:80, padding:'3px 6px', border:`1.5px dashed ${T.goldInk}`, borderRadius:T.r, fontSize:12, fontFamily:T.sans, background:T.surface2, color:T.ink, textAlign:'right', outline:'none' }} />
    );
    return (
        <span onClick={onEdit} title={estimated ? 'Estimated at 60% of open pipeline — click to set a figure' : 'Click to change; blank clears it'}
            style={{ fontSize:13, fontWeight:600, color: estimated ? T.inkMuted : color, fontStyle: estimated ? 'italic' : 'normal', cursor:'text', display:'inline-block', border:`1px dashed ${T.gold}`, padding:'2px 6px', borderRadius:2 }}>
            {fmtV(value)}{estimated ? ' est.' : ''}
        </span>
    );
}

// ════════════════════════════════════════════════════════
// FORECAST TAB
// ════════════════════════════════════════════════════════
// `period` is the current fiscal quarter (currentQuarter): the calls are keyed
// by its `key` and the export is named by it (state §0.84).
function ForecastTab({ card, cardHdr, eyebrow, repStats, teamAttain, teamBest, teamClosed, teamCommit, teamPipe, teamQuota, updateRepField, period, exportToCSV, exportingCSV, showCoachingNote }) {
    const [editing, setEditing] = useState(null);   // { id, field: 'commit' | 'bestCase' }

    // The tab's one export: the ledger as CSV, one row per rep plus the team
    // total. The header's dead "Export" button was removed in §0.80 and nothing
    // in the tab called exportToCSV (handoff item 19).
    const exportLedger = () => exportToCSV(`forecast-${period.key}.csv`,
        ['Rep', 'Team', 'Territory', 'Quarter', 'Quota', 'Closed', 'Commit', 'Best case', 'Best case basis', 'Open pipeline', 'Attainment %', 'Health', 'Days since activity', 'Stuck deals', 'Overdue tasks'],
        [
            ...repStats.map(rs => [rs.rep.name, rs.rep.team || '', rs.rep.territory || '', period.label, rs.quota, rs.closedArr, rs.commit, Math.round(rs.bestCase),
                rs.bestCaseEstimated ? 'estimate (60% of open pipeline)' : 'rep call', rs.pipelineArr, rs.attainPct ?? '', rs.healthLabel, rs.daysSinceAct ?? '', rs.stuck, rs.overdueCnt]),
            ['Team total', '', '', period.label, teamQuota, teamClosed, teamCommit, Math.round(teamBest), '', teamPipe, teamAttain ?? '', '', '', '', ''],
        ],
        'forecast');

    // Stacked bar widths
    const barTotal = Math.max(teamQuota, teamPipe);
    const closedW  = barTotal > 0 ? (teamClosed/barTotal)*100 : 0;
    const commitW  = barTotal > 0 ? (teamCommit/barTotal)*100 : 0;
    const bestW    = barTotal > 0 ? (teamBest/barTotal)*100 : 0;
    const pipeW    = barTotal > 0 ? (teamPipe/barTotal)*100 : 0;
    const quotaW   = barTotal > 0 ? (teamQuota/barTotal)*100 : 0;

    return (
        <>
        {/* ── Roll-up strip — matches design: bar on left, divider, commit call on right ── */}
        <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+1, padding:'18px 20px', marginBottom:16, display:'flex', gap:28, alignItems:'center' }}>
            <div style={{ flex:1 }}>
                <div style={{ fontSize:10, letterSpacing:1, textTransform:'uppercase', color:T.inkMuted, fontWeight:700, fontFamily:T.sans }}>Team to quota</div>
                <div style={{ display:'flex', alignItems:'baseline', gap:10, marginTop:4 }}>
                    <span style={{ fontSize:28, fontWeight:700, color:T.ink, fontFamily:T.sans }}>{fmtV(teamClosed)}</span>
                    <span style={{ fontSize:13, color:T.inkMid, fontFamily:T.sans }}>of {fmtV(teamQuota)}</span>
                    <span style={{ fontSize:12, fontWeight:600, color:teamAttain>=100?T.ok:T.inkMid, fontFamily:T.sans }}>{teamAttain !== null ? teamAttain+'%' : '—'}</span>
                </div>

                {/* Stacked bar — matches V1 design: flat, no borderRadius, segment order per spec */}
                <div style={{ position:'relative', height:8, background:T.surface2, overflow:'visible', marginTop:10, marginBottom:8, border:`1px solid ${T.border}` }}>
                    <div style={{ position:'absolute', inset:0, width:Math.min(pipeW,100)+'%', background:T.border }} />
                    <div style={{ position:'absolute', inset:0, width:Math.min(bestW,100)+'%', background:T.gold }} />
                    <div style={{ position:'absolute', inset:0, width:Math.min(commitW,100)+'%', background:T.goldInk }} />
                    <div style={{ position:'absolute', inset:0, width:Math.min(closedW,100)+'%', background:T.ok }} />
                    <div style={{ position:'absolute', left:quotaW+'%', top:-3, bottom:-3, width:2, background:T.ink, zIndex:3 }} />
                </div>

                {/* Legend */}
                <div style={{ display:'flex', gap:16, fontSize:11, color:T.inkMid, fontFamily:T.sans }}>
                    <span style={{ display:'flex', alignItems:'center', gap:5 }}><div style={{ width:8, height:8, background:T.ok }}/> Closed {fmtV(teamClosed)}</span>
                    <span style={{ display:'flex', alignItems:'center', gap:5 }}><div style={{ width:8, height:8, background:T.goldInk }}/> Commit {fmtV(teamCommit)}</span>
                    <span style={{ display:'flex', alignItems:'center', gap:5 }}><div style={{ width:8, height:8, background:T.gold }}/> Best-case {fmtV(teamBest)}</span>
                    <span style={{ display:'flex', alignItems:'center', gap:5 }}><div style={{ width:8, height:8, border:`1px solid ${T.border}` }}/> Open pipeline {fmtV(teamPipe)}</span>
                </div>
            </div>

            {/* Vertical divider */}
            <div style={{ width:1, height:60, background:T.border, flexShrink:0 }} />

            {/* Commit call */}
            <div style={{ flexShrink:0 }}>
                <div style={{ fontSize:10, letterSpacing:1, textTransform:'uppercase', color:T.inkMuted, fontWeight:700, fontFamily:T.sans }}>Commit call</div>
                <div style={{ fontSize:22, fontWeight:700, color:T.ink, marginTop:4, fontFamily:T.sans }}>{fmtV(teamCommit)}</div>
                {teamQuota > 0 && (
                    <div style={{ fontSize:11, fontWeight:600, color:teamCommit >= teamQuota ? T.ok : T.warn, fontFamily:T.sans }}>
                        {teamCommit >= teamQuota ? 'Above quota' : 'Under quota by ' + fmtV(teamQuota - teamCommit)}
                    </div>
                )}
            </div>
        </div>

        {/* ── Ledger table ── */}
        <div style={card}>
            <div style={cardHdr}>
                <div>
                    <div style={eyebrow}>Forecast ledger · {period.label}</div>
                    <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>Click a Commit or Best case figure to set this quarter's call. Best case in italics is an estimate — 60% of open pipeline.</div>
                </div>
                <button onClick={exportLedger} disabled={!!exportingCSV}
                    style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 11px', background:'transparent', border:`1px solid ${T.border}`, color:T.inkMid, fontSize:11, borderRadius:T.r, cursor: exportingCSV ? 'not-allowed' : 'pointer', fontFamily:T.sans, opacity: exportingCSV ? 0.5 : 1 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    {exportingCSV === 'forecast' ? 'Exporting…' : 'Export CSV'}
                </button>
            </div>
            {/* Column headers */}
            <div style={{ display:'grid', gridTemplateColumns:'200px 90px 100px 100px 100px 100px 90px 60px 80px', alignItems:'center', padding:'8px 16px', background:T.surface2, borderBottom:`1px solid ${T.border}`, fontSize:9, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.6, fontFamily:T.sans }}>
                <div>Rep</div><div style={{textAlign:'right'}}>Quota</div><div style={{textAlign:'right'}}>Closed</div>
                <div style={{textAlign:'right'}}>Commit</div><div style={{textAlign:'right'}}>Best case</div>
                <div style={{textAlign:'right'}}>Pipeline</div><div style={{textAlign:'right'}}>Attain</div>
                <div style={{textAlign:'center'}}>Health</div><div style={{textAlign:'center'}}>Action</div>
            </div>

            {/* Rep rows */}
            {repStats.map((rs, i) => {
                return (
                    <div key={rs.rep.id} style={{ display:'grid', gridTemplateColumns:'200px 90px 100px 100px 100px 100px 90px 60px 80px', alignItems:'center', padding:'12px 16px', borderBottom:`1px solid ${T.border}`, background: i%2===0 ? T.surface : T.bg, fontFamily:T.sans, transition:'background 80ms' }}
                        onMouseEnter={e => e.currentTarget.style.background=T.surface2}
                        onMouseLeave={e => e.currentTarget.style.background=i%2===0 ? T.surface : T.bg}>

                        {/* Rep name */}
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <Avatar name={rs.rep.name} size={30} />
                            <div>
                                <div style={{ fontSize:13, fontWeight:600, color:T.ink }}>{rs.rep.name}</div>
                                <div style={{ fontSize:10.5, color:T.inkMuted }}>{rs.rep.territory || rs.rep.team || (rs.rep.userType === 'User' ? 'AE' : rs.rep.userType) }</div>
                            </div>
                        </div>

                        {/* Quota */}
                        <div style={{ textAlign:'right', fontSize:12.5, color:T.inkMid, fontFamily:'ui-monospace,Menlo,monospace' }}>{fmtV(rs.quota)}</div>

                        {/* Closed */}
                        <div style={{ textAlign:'right', fontSize:13, color:T.ink, fontWeight:600, fontFamily:'ui-monospace,Menlo,monospace' }}>{fmtV(rs.closedArr)}</div>

                        {/* Commit and Best case — this quarter's call, saved per quarter in
                            profile.forecastCalls through the users PUT (state §0.84); click to
                            set, blank to clear. Best case unset shows the 60% estimate. */}
                        <div style={{ textAlign:'right' }}>
                            <CallCell value={rs.commit} estimated={false} color={T.goldInk}
                                editing={editing?.id === rs.rep.id && editing.field === 'commit'}
                                onEdit={() => setEditing({ id: rs.rep.id, field: 'commit' })}
                                onCancel={() => setEditing(null)}
                                onSave={v => { updateRepField(rs.rep.id, 'forecastCalls', withForecastCall(rs.rep, period.key, { commit: v })); setEditing(null); }} />
                        </div>
                        <div style={{ textAlign:'right' }}>
                            <CallCell value={rs.bestCase} estimated={rs.bestCaseEstimated} color={T.inkMid}
                                editing={editing?.id === rs.rep.id && editing.field === 'bestCase'}
                                onEdit={() => setEditing({ id: rs.rep.id, field: 'bestCase' })}
                                onCancel={() => setEditing(null)}
                                onSave={v => { updateRepField(rs.rep.id, 'forecastCalls', withForecastCall(rs.rep, period.key, { bestCase: v })); setEditing(null); }} />
                        </div>

                        {/* Pipeline */}
                        <div style={{ textAlign:'right', fontSize:12.5, color:T.inkMid, fontFamily:'ui-monospace,Menlo,monospace' }}>{fmtV(rs.pipelineArr)}</div>

                        {/* Attain % + mini bar */}
                        <div style={{ textAlign:'right' }}>
                            <div style={{ fontSize:13, fontWeight:700, color:rs.attainPct>=100 ? T.ok : rs.attainPct>=70 ? T.ink : rs.attainPct>=40 ? T.warn : T.danger }}>
                                {rs.attainPct !== null ? rs.attainPct+'%' : '—'}
                            </div>
                            <div style={{ height:3, background:T.border, marginTop:2, position:'relative' }}>
                                <div style={{ position:'absolute', left:0, top:0, bottom:0, width:Math.min(rs.attainPct||0,100)+'%', background:rs.attainPct>=100?T.ok:rs.attainPct>=70?T.goldInk:T.danger }} />
                            </div>
                        </div>

                        {/* Health dot + trend arrow */}
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:4 }}>
                            <div style={{ width:7, height:7, borderRadius:'50%', background:rs.healthColor, flexShrink:0 }} />
                            <span style={{ fontSize:11, color:rs.trend==='up' ? T.ok : rs.trend==='down' ? T.danger : T.inkMuted, fontWeight:700 }}>
                                {rs.trend==='up' ? '↑' : rs.trend==='down' ? '↓' : '—'}
                            </span>
                        </div>

                        {/* Coach action */}
                        <div style={{ textAlign:'center' }}>
                            <button onClick={() => showCoachingNote({ recipientIds: [rs.rep.id] })} title={`Coaching note to ${rs.rep.name}`}
                                style={{ fontSize:11, color:T.goldInk, background:'none', border:'none', cursor:'pointer', fontFamily:T.sans, fontWeight:600 }}>Coach →</button>
                        </div>
                    </div>
                );
            })}

            {/* Team total row */}
            <div style={{ display:'grid', gridTemplateColumns:'200px 90px 100px 100px 100px 100px 90px 60px 80px', alignItems:'center', padding:'12px 16px', background:T.surface2, borderTop:`2px solid ${T.ink}`, fontFamily:T.sans }}>
                <div style={{ fontSize:12, fontWeight:700, color:T.ink, textTransform:'uppercase', letterSpacing:0.5 }}>Team Total</div>
                <div style={{ textAlign:'right', fontSize:13, fontWeight:700, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace' }}>{fmtV(teamQuota)}</div>
                <div style={{ textAlign:'right', fontSize:13, fontWeight:700, color:T.ok, fontFamily:'ui-monospace,Menlo,monospace' }}>{fmtV(teamClosed)}</div>
                <div style={{ textAlign:'right', fontSize:13, fontWeight:700, color:T.goldInk, fontFamily:'ui-monospace,Menlo,monospace' }}>{fmtV(teamCommit)}</div>
                <div style={{ textAlign:'right', fontSize:13, fontWeight:600, color:T.inkMid, fontFamily:'ui-monospace,Menlo,monospace' }}>{fmtV(teamBest)}</div>
                <div style={{ textAlign:'right', fontSize:13, fontWeight:600, color:T.inkMid, fontFamily:'ui-monospace,Menlo,monospace' }}>{fmtV(teamPipe)}</div>
                <div style={{ textAlign:'right', fontSize:13, fontWeight:700, color:teamAttain>=100?T.ok:T.inkMid }}>{teamAttain !== null ? teamAttain+'%' : '—'}</div>
                <div /><div />
            </div>
        </div>
        </>
    );
}

// ════════════════════════════════════════════════════════
// ADMINISTRATION TAB (unchanged logic, V1 tokens)
// ════════════════════════════════════════════════════════
// `fyRange` is the current fiscal year { from, to }: the board's quota column is
// the ANNUAL figure, so its bar is fiscal-year-to-date won by close day — not
// every deal ever (state §0.80).
function AdminTab({ card, cardHdr, currentUser, eyebrow, fyRange, getRepTotal, isAdmin, opportunities, quarters, quotaMode, saveState, setActiveTab, setAllQuotaMode, setSaveState, setSettings, setSpiffClaims, settings, showConfirm, spiffClaims, updateRepField, visibleReps }) {
    const unassignedReps = isAdmin ? visibleReps.filter(u => !u.territory?.trim()) : [];
    const visibleTerritories = [...new Set(visibleReps.filter(u=>u.territory?.trim()).map(u=>u.territory.trim()))].sort();
    const terrFilter = settings.__qbTerrFilter || 'all';
    const setTerrFilter = v => setSettings(prev => ({...prev, __qbTerrFilter:v}));
    const filteredReps = isAdmin && terrFilter !== 'all' ? visibleReps.filter(u=>u.territory?.trim()===terrFilter) : visibleReps;
    const renderTerritories = isAdmin && terrFilter === 'all' ? visibleTerritories : (terrFilter !== 'all' ? [terrFilter] : [...new Set(visibleReps.filter(u=>u.territory).map(u=>u.territory.trim()))].sort());
    const filteredTotal = filteredReps.reduce((s,u)=>s+getRepTotal(u),0);
    const terrColors = ['#9c6b4a','#4a6b5a','#3a5a7a','#7a6a48','#9c3a2e'];
    const terrColorMap = {}; visibleTerritories.forEach((t,i) => { terrColorMap[t] = terrColors[i%terrColors.length]; });
    const smCard2 = { ...card };

    // Incentive config lives in settings.extra and is Admin-only server-side
    // (settings PUT is requireRole(['Admin'])). This tab also renders for
    // Managers, so gate the mutating controls rather than let them edit
    // something that can only ever come back 403.
    const canEditIncentives = isAdmin;

    // dbFetch returns a Response and does NOT throw on 4xx/5xx.
    // Claim status writes used .catch(console.error) then updated state
    // unconditionally. dbFetch resolves for ANY response (guide 18b1), so a 403
    // never reached the catch and the row flipped to Approved regardless.
    const updateClaimStatus = async (claim, status) => {
        const u = { ...claim, status, approvedAt: new Date().toISOString(), approvedBy: currentUser };
        try {
            const res = await dbFetch('/.netlify/functions/spiff-claims', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(u),
            });
            if (!res.ok) {
                setSaveState({ status: 'error', msg: res.status === 403
                    ? 'Not saved \u2014 only Admins can approve or reject claims.'
                    : `Not saved \u2014 the server returned ${res.status}. The claim is unchanged.` });
                return;
            }
            setSpiffClaims(prev => prev.map(c => c.id === claim.id ? u : c));
            setSaveState({ status: 'saved', msg: '' });
        } catch (err) {
            console.error('[SalesManagerTab] claim ' + status, err);
            setSaveState({ status: 'error', msg: 'Not saved \u2014 network error. The claim is unchanged.' });
        }
    };

    const saveExtra = async (patch, label) => {
        setSaveState({ status: 'saving', msg: '' });
        try {
            const res = await dbFetch('/.netlify/functions/settings', {
                method: 'PUT', body: JSON.stringify(patch),
            });
            if (!res.ok) {
                setSaveState({ status: 'error', msg: res.status === 403
                    ? `Not saved — only Admins can change ${label}.`
                    : `Not saved — the server returned ${res.status}. Your ${label} changes are not stored.` });
                return false;
            }
            setSaveState({ status: 'saved', msg: '' });
            return true;
        } catch (err) {
            console.error('[SalesManagerTab] save ' + label, err);
            setSaveState({ status: 'error', msg: `Not saved — network error while saving ${label}.` });
            return false;
        }
    };

    const tierList  = (settings.quotaData || {}).commissionTiers || [];
    const spiffList = settings.spiffs || [];

    // Local-only update (typing); persist separately on blur.
    const applyTiers  = next => setSettings(prev => ({ ...prev, quotaData: { ...prev.quotaData, commissionTiers: next } }));
    const saveTiers   = next => saveExtra({ quotaData: { ...(settings.quotaData || {}), commissionTiers: next } }, 'commission tiers');
    const commitTiers = next => { applyTiers(next);  return saveTiers(next); };

    const applySpiffs  = next => setSettings(prev => ({ ...prev, spiffs: next }));
    const saveSpiffs   = next => saveExtra({ spiffs: next }, 'SPIFFs');
    const commitSpiffs = next => { applySpiffs(next); return saveSpiffs(next); };

    return (
        <>
        {/* Save status — a failed write must never look like a success */}
        {saveState.status !== 'idle' && (
            <div style={{
                padding:'8px 14px', marginBottom:12, borderRadius:T.r, fontFamily:T.sans,
                fontSize:11.5, fontWeight:600, display:'flex', alignItems:'center', gap:8,
                background: saveState.status === 'error' ? 'rgba(156,58,46,0.10)' : T.surface2,
                border: `1px solid ${saveState.status === 'error' ? T.danger : T.border}`,
                color: saveState.status === 'error' ? T.danger : T.inkMid,
            }}>
                <span>{saveState.status === 'saving' ? '…' : saveState.status === 'saved' ? '✓' : '⚠'}</span>
                <span>{saveState.status === 'saving' ? 'Saving…'
                     : saveState.status === 'saved' ? 'Changes saved'
                     : saveState.msg}</span>
                {saveState.status === 'error' && (
                    <button onClick={() => setSaveState({ status:'idle', msg:'' })}
                        style={{ marginLeft:'auto', background:'none', border:'none', color:T.danger, cursor:'pointer', fontSize:14 }}>×</button>
                )}
            </div>
        )}

        {!canEditIncentives && (
            <div style={{ padding:'8px 14px', marginBottom:12, borderRadius:T.r, background:T.surface2,
                border:`1px solid ${T.border}`, fontFamily:T.sans, fontSize:11.5, color:T.inkMid }}>
                Commission tiers and SPIFFs are read-only — only Admins can change them.
            </div>
        )}

        {/* Unassigned warning */}
        {unassignedReps.length > 0 && (
            <div style={{ background:'rgba(184,115,51,0.1)', border:`1.5px solid ${T.warn}`, borderRadius:T.r+1, padding:'12px 16px', marginBottom:16, display:'flex', alignItems:'center', gap:12, fontFamily:T.sans }}>
                <span style={{ fontSize:16 }}>⚠️</span>
                <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, color:T.warn, fontSize:12 }}>{unassignedReps.length} rep{unassignedReps.length>1?'s have':' has'} no territory: <strong>{unassignedReps.map(u=>u.name).join(', ')}</strong></div>
                    <div style={{ fontSize:11, color:T.inkMid, marginTop:2 }}>Assign via Settings → Team Builder.</div>
                </div>
                <button onClick={()=>setActiveTab('settings')} style={{ padding:'4px 10px', background:T.warn, color:'#fff', border:'none', borderRadius:T.r, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:T.sans }}>Go to Settings</button>
            </div>
        )}

        {/* Quota Board */}
        <div style={smCard2}>
            <div style={{ ...cardHdr, flexWrap:'wrap', gap:8 }}>
                <div>
                    <div style={eyebrow}>Assign Quotas</div>
                    <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>${filteredTotal.toLocaleString()} assigned</div>
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginLeft:'auto' }}>
                    {isAdmin && visibleTerritories.length > 1 && (
                        <div style={{ display:'flex', gap:4 }}>
                            {['all',...visibleTerritories].map(t => (
                                <button key={t} onClick={()=>setTerrFilter(t)} style={{ padding:'3px 9px', borderRadius:999, border:`1px solid ${terrFilter===t?T.ink:T.border}`, cursor:'pointer', fontFamily:T.sans, fontSize:10, fontWeight:600, background:terrFilter===t?T.ink:'transparent', color:terrFilter===t?T.surface:T.inkMid, transition:'all 120ms' }}>
                                    {t==='all'?'All':t}
                                </button>
                            ))}
                        </div>
                    )}
                    <div style={{ display:'flex', background:T.surface2, borderRadius:T.r, padding:2, gap:2 }}>
                        {['annual','quarterly'].map(t => (
                            <button key={t} onClick={()=>setAllQuotaMode(t)} style={{ padding:'3px 9px', borderRadius:T.r-1, border:'none', cursor:'pointer', fontFamily:T.sans, fontSize:10, fontWeight:700, background:quotaMode===t?T.surface:'transparent', color:quotaMode===t?T.ink:T.inkMid, boxShadow:quotaMode===t?'0 1px 3px rgba(0,0,0,0.08)':'none' }}>
                                {t==='annual'?'Annual':'Quarterly'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Column headers */}
            <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', padding:'6px 16px', background:T.surface2, borderBottom:`1px solid ${T.border}`, fontSize:9, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.6, fontFamily:T.sans }}>
                <div>Rep</div><div>{quotaMode==='annual'?'Annual Quota':'Total Quota'}</div><div>FY attainment</div>
            </div>

            {visibleReps.length === 0 ? (
                <div style={{ padding:'2.5rem', textAlign:'center', color:T.inkMuted, fontSize:12, fontFamily:T.sans }}>No reps configured yet.</div>
            ) : (
                <>
                {renderTerritories.map(terr => {
                    const terrReps = filteredReps.filter(u=>u.territory?.trim()===terr);
                    if (!terrReps.length) return null;
                    const dotColor = terrColorMap[terr] || T.inkMuted;
                    const terrTotal = terrReps.reduce((s,u)=>s+getRepTotal(u),0);
                    return (
                        <div key={terr}>
                            {isAdmin && terrFilter==='all' && (
                                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'5px 16px', background:dotColor+'18', borderBottom:`1px solid ${dotColor}33`, fontFamily:T.sans }}>
                                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                        <div style={{ width:3, height:14, borderRadius:1, background:dotColor }} />
                                        <span style={{ fontSize:9, fontWeight:800, color:dotColor, textTransform:'uppercase', letterSpacing:0.8 }}>{terr}</span>
                                    </div>
                                    <span style={{ fontSize:9, color:dotColor }}>{terrReps.length} rep{terrReps.length!==1?'s':''} · ${terrTotal.toLocaleString()}</span>
                                </div>
                            )}
                            {terrReps.map((u,ui) => {
                                const rWon = (opportunities||[]).filter(o=>o.stage==='Closed Won'&&(o.salesRep===u.name||o.assignedTo===u.name)&&closeDayInRange(o, fyRange.from, fyRange.to)).reduce((s,o)=>s+(parseFloat(o.arr)||0),0);
                                const quota = getRepTotal(u);
                                const attain = quota>0 ? Math.min((rWon/quota)*100,100) : 0;
                                const aColor = attain>=100?T.ok:attain>=75?T.warn:attain>=40?T.info:T.inkMuted;
                                const initials = (u.name||'').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
                                return (
                                    <div key={u.id} style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', padding:'10px 16px', borderBottom:`1px solid ${T.border}`, alignItems:'center', fontFamily:T.sans }}
                                        onMouseEnter={e=>e.currentTarget.style.background=T.surface2}
                                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                            <div style={{ width:28, height:28, borderRadius:'50%', background:dotColor+'44', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, color:dotColor, flexShrink:0 }}>{initials}</div>
                                            <div>
                                                <div style={{ fontSize:12, fontWeight:600, color:T.ink }}>{u.name}</div>
                                                <div style={{ fontSize:10, color:T.inkMuted }}>{u.team||u.territory||'—'}</div>
                                            </div>
                                        </div>
                                        <div>
                                            <QuotaRepCard u={u} quotaMode={quotaMode} quarters={quarters} inputSt={{ padding:'4px 8px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:'0.8125rem', fontFamily:T.sans, background:T.surface2, color:T.ink, width:110, outline:'none' }} updateRepField={updateRepField} compactInput />
                                        </div>
                                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                            <div style={{ flex:1, height:5, background:T.surface2, borderRadius:T.r }}>
                                                <div style={{ height:'100%', width:attain+'%', background:aColor, borderRadius:T.r }} />
                                            </div>
                                            <span style={{ fontSize:11, fontWeight:700, color:aColor, minWidth:36, textAlign:'right' }}>{quota>0?attain.toFixed(1)+'%':'—'}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}
                {/* Unassigned reps */}
                {isAdmin && filteredReps.filter(u=>!u.territory?.trim()).map((u,ui,arr) => {
                    const rWon=(opportunities||[]).filter(o=>o.stage==='Closed Won'&&(o.salesRep===u.name||o.assignedTo===u.name)&&closeDayInRange(o, fyRange.from, fyRange.to)).reduce((s,o)=>s+(parseFloat(o.arr)||0),0);
                    const quota=getRepTotal(u), attain=quota>0?Math.min((rWon/quota)*100,100):0;
                    const aColor=attain>=100?T.ok:attain>=75?T.warn:T.inkMuted;
                    const initials=(u.name||'').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
                    return (
                        <div key={u.id} style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', padding:'10px 16px', borderBottom:`1px solid ${T.border}`, alignItems:'center', fontFamily:T.sans }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                <div style={{ width:28, height:28, borderRadius:'50%', background:T.surface2, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, color:T.inkMuted }}>{initials}</div>
                                <div><div style={{ fontSize:12, fontWeight:600, color:T.ink }}>{u.name}</div><div style={{ fontSize:10, color:T.inkMuted }}>No territory</div></div>
                            </div>
                            <QuotaRepCard u={u} quotaMode={quotaMode} quarters={quarters} inputSt={{ padding:'4px 8px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:'0.8125rem', fontFamily:T.sans, background:T.surface2, color:T.ink, width:110, outline:'none' }} updateRepField={updateRepField} compactInput />
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                <div style={{ flex:1, height:5, background:T.surface2, borderRadius:T.r }}><div style={{ height:'100%', width:attain+'%', background:aColor, borderRadius:T.r }} /></div>
                                <span style={{ fontSize:11, fontWeight:700, color:aColor, minWidth:36, textAlign:'right' }}>{quota>0?attain.toFixed(1)+'%':'—'}</span>
                            </div>
                        </div>
                    );
                })}
                {/* Total */}
                {filteredReps.length > 0 && (
                    <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', padding:'10px 16px', background:T.surface2, borderTop:`2px solid ${T.border}`, fontFamily:T.sans }}>
                        <div style={{ fontSize:9, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.5 }}>Total Assigned</div>
                        <div style={{ fontSize:13, fontWeight:700, color:T.ink }}>${filteredTotal.toLocaleString()}</div>
                        <div />
                    </div>
                )}
                </>
            )}
        </div>

        {/* Commission Plan + Preview (preserved from original) */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            <div style={smCard2}>
                <div style={cardHdr}>
                    <div>
                        <div style={eyebrow}>Commission Plan</div>
                        <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>Tiered rates applied to all reps based on quota attainment %</div>
                    </div>
                </div>
                <div style={{ padding:'16px 20px' }}>
                    {tierList.map((tier,idx) => (
                        <div key={idx} style={{ display:'flex', gap:8, marginBottom:8, alignItems:'center', padding:'8px 10px', background:T.surface2, borderRadius:T.r, border:`1px solid ${T.border}` }}>
                            {['minPercent','maxPercent','rate'].map((field,fi) => (
                                <input key={fi} type="number" value={field==='maxPercent'&&tier.maxPercent>=999?'':tier[field]} placeholder={field==='maxPercent'?'∞':field==='rate'?'%':'%'}
                                    disabled={!canEditIncentives}
                                    onChange={e => { const t=[...tierList]; t[idx]={...t[idx],[field]:parseFloat(e.target.value)||(field==='maxPercent'?999:0)}; applyTiers(t); }}
                                    style={{ width:55, padding:'3px 6px', border:`1.5px solid ${T.border}`, borderRadius:T.r, fontSize:11, textAlign:'center', fontFamily:T.sans, background:T.surface, outline:'none', color:T.ink }}
                                    onFocus={e=>e.target.style.borderColor=T.info}
                                    onBlur={e=>{ e.target.style.borderColor=T.border; if (canEditIncentives) saveTiers(tierList); }} />
                            ))}
                            <span style={{ fontSize:10, color:T.inkMuted, fontWeight:600 }}>% rate</span>
                            {canEditIncentives && tierList.length>1 && (
                                <button onClick={()=>commitTiers(tierList.filter((_,i)=>i!==idx))} style={{ background:'none', border:'none', color:T.danger, cursor:'pointer', fontSize:14, padding:'0', marginLeft:'auto' }}>×</button>
                            )}
                        </div>
                    ))}
                    {canEditIncentives && <button onClick={()=>commitTiers([...tierList,{minPercent:0,maxPercent:999,rate:0}])}
                        style={{ marginTop:4, background:T.surface2, border:`1.5px dashed ${T.border}`, borderRadius:T.r, padding:'6px 12px', cursor:'pointer', fontSize:11, fontWeight:700, color:T.inkMid, fontFamily:T.sans, width:'100%' }}>
                        + Add Tier
                    </button>}
                </div>
            </div>

            {/* SPIFF Board */}
            <div style={smCard2}>
                <div style={{ ...cardHdr }}>
                    <div>
                        <div style={eyebrow}>SPIFF Board</div>
                        <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>One-time incentive bonuses</div>
                    </div>
                    {canEditIncentives && <button onClick={()=>commitSpiffs([...spiffList,{id:'spiff_'+Date.now(),name:'',amount:'',type:'flat',condition:'',active:true}])}
                        style={{ padding:'4px 10px', background:T.ink, color:T.surface, border:'none', borderRadius:T.r, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:T.sans }}>+ Add SPIFF</button>}
                </div>
                <div style={{ padding:'12px 16px' }}>
                    {spiffList.length === 0
                        ? <div style={{ textAlign:'center', padding:'1.5rem', color:T.inkMuted, fontSize:11, fontFamily:T.sans }}>No SPIFFs defined yet.</div>
                        : spiffList.map((spiff,si) => (
                            <div key={spiff.id} style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:T.r, padding:'8px 10px', marginBottom:8 }}>
                                <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
                                    <input type="text" value={spiff.name} placeholder="SPIFF name"
                                        disabled={!canEditIncentives}
                                        onChange={e=>applySpiffs(spiffList.map((s,i)=>i===si?{...s,name:e.target.value}:s))}
                                        style={{ flex:2, minWidth:140, padding:'4px 8px', border:`1.5px solid ${T.border}`, borderRadius:T.r, fontSize:11, fontFamily:T.sans, background:T.surface, outline:'none', color:T.ink }}
                                        onFocus={e=>e.target.style.borderColor=T.info}
                                        onBlur={e=>{ e.target.style.borderColor=T.border; if (canEditIncentives) saveSpiffs(spiffList); }} />
                                    <select value={spiff.type} disabled={!canEditIncentives}
                                        onChange={e=>commitSpiffs(spiffList.map((s,i)=>i===si?{...s,type:e.target.value}:s))}
                                        style={{ padding:'4px 6px', border:`1.5px solid ${T.border}`, borderRadius:T.r, fontSize:11, fontFamily:T.sans, background:T.surface, cursor:'pointer', outline:'none', color:T.ink }}>
                                        <option value="flat">Flat $</option><option value="pct">% Revenue</option><option value="multiplier">Multiplier</option>
                                    </select>
                                    <input type="number" value={spiff.amount} placeholder="0"
                                        disabled={!canEditIncentives}
                                        onChange={e=>applySpiffs(spiffList.map((s,i)=>i===si?{...s,amount:e.target.value}:s))}
                                        style={{ width:70, padding:'4px 6px', border:`1.5px solid ${T.border}`, borderRadius:T.r, fontSize:11, fontFamily:T.sans, background:T.surface, textAlign:'right', outline:'none', color:T.ink }}
                                        onFocus={e=>e.target.style.borderColor=T.info}
                                        onBlur={e=>{ e.target.style.borderColor=T.border; if (canEditIncentives) saveSpiffs(spiffList); }} />
                                    <label style={{ display:'flex', alignItems:'center', gap:3, cursor:'pointer' }}>
                                        <input type="checkbox" checked={!!spiff.active} disabled={!canEditIncentives}
                                            onChange={e=>commitSpiffs(spiffList.map((s,i)=>i===si?{...s,active:e.target.checked}:s))} />
                                        <span style={{ fontSize:10, color:T.inkMid, fontFamily:T.sans }}>Active</span>
                                    </label>
                                    {canEditIncentives && <button onClick={()=>showConfirm(`Remove SPIFF "${spiff.name||'this SPIFF'}"?`,()=>commitSpiffs(spiffList.filter((_,i)=>i!==si)))}
                                        style={{ background:'none', border:'none', color:T.danger, cursor:'pointer', fontSize:14, marginLeft:'auto' }}>×</button>}
                                </div>
                                {/* Description — stored on `condition`, which the claim modal already renders */}
                                <input type="text" value={spiff.condition||''} placeholder="Description (shown to reps)"
                                    disabled={!canEditIncentives}
                                    onChange={e=>applySpiffs(spiffList.map((s,i)=>i===si?{...s,condition:e.target.value}:s))}
                                    style={{ width:'100%', marginTop:6, padding:'4px 8px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:11, fontFamily:T.sans, background:T.surface, outline:'none', color:T.inkMid, boxSizing:'border-box' }}
                                    onFocus={e=>e.target.style.borderColor=T.info}
                                    onBlur={e=>{ e.target.style.borderColor=T.border; if (canEditIncentives) saveSpiffs(spiffList); }} />
                            </div>
                        ))
                    }
                </div>
            </div>
        </div>

        {/* SPIFF Claims */}
        <div style={smCard2}>
            <div style={cardHdr}>
                <div>
                    <div style={eyebrow}>SPIFF Claims</div>
                    <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>Review and approve claims submitted by reps</div>
                </div>
                <div style={{ display:'flex', gap:4 }}>
                    {['all','pending','approved','rejected','paid'].map(s => (
                        <button key={s} onClick={()=>setSettings(prev=>({...prev,_spiffClaimFilter:s}))}
                            style={{ padding:'2px 8px', borderRadius:999, border:'none', cursor:'pointer', fontSize:9, fontWeight:700, fontFamily:T.sans,
                                background:(settings._spiffClaimFilter||'pending')===s?T.ink:T.surface2,
                                color:(settings._spiffClaimFilter||'pending')===s?T.surface:T.inkMid }}>
                            {s.charAt(0).toUpperCase()+s.slice(1)}
                        </button>
                    ))}
                </div>
            </div>
            <div style={{ padding:'12px 16px' }}>
                {(() => {
                    const filter = settings._spiffClaimFilter||'pending';
                    const filtered = spiffClaims.filter(c=>filter==='all'||c.status===filter).sort((a,b)=>new Date(b.claimedAt)-new Date(a.claimedAt));
                    if (!filtered.length) return <div style={{ textAlign:'center', padding:'1.5rem', color:T.inkMuted, fontSize:11, background:T.surface2, borderRadius:T.r, fontFamily:T.sans }}>No {filter==='all'?'':filter} claims.</div>;
                    return filtered.map((claim,ci) => (
                        <div key={claim.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:ci<filtered.length-1?`1px solid ${T.border}`:'none', flexWrap:'wrap', fontFamily:T.sans }}>
                            <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontWeight:600, fontSize:12, color:T.ink }}>{claim.spiffName}</div>
                                <div style={{ fontSize:10, color:T.inkMuted }}>{claim.repName} · {claim.opportunityName} · {new Date(claim.claimedAt).toLocaleDateString()}</div>
                            </div>
                            <div style={{ fontWeight:700, color:claim.spiffType==='multiplier'?T.info:T.ok, fontSize:13 }}>
                                {claim.spiffType==='multiplier'?`${claim.multiplier}×`:`$${claim.amount.toLocaleString()}`}
                            </div>
                            <span style={{ fontSize:9, padding:'2px 7px', borderRadius:999, fontWeight:700,
                                background:claim.status==='approved'?T.ok+'22':claim.status==='rejected'?T.danger+'22':claim.status==='paid'?T.info+'22':T.warn+'22',
                                color:claim.status==='approved'?T.ok:claim.status==='rejected'?T.danger:claim.status==='paid'?T.info:T.warn }}>
                                {claim.status.toUpperCase()}
                            </span>
                            {claim.status==='pending' && (
                                <div style={{ display:'flex', gap:4 }}>
                                    <button onClick={()=>updateClaimStatus(claim,'approved')}
                                        style={{ padding:'2px 8px', background:T.ok, color:'#fff', border:'none', borderRadius:T.r, fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:T.sans }}>✓ Approve</button>
                                    <button onClick={()=>updateClaimStatus(claim,'rejected')}
                                        style={{ padding:'2px 8px', background:T.danger, color:'#fff', border:'none', borderRadius:T.r, fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:T.sans }}>✕ Reject</button>
                                </div>
                            )}
                        </div>
                    ));
                })()}
            </div>
        </div>
        </>
    );
}

// ════════════════════════════════════════════════════════════
export default function SalesManagerTab() {
    const {
        settings, setSettings,
        opportunities, activities, tasks,
        currentUser, userRole,
        getQuarter, getQuarterLabel,
        exportToCSV, exportingCSV, showConfirm, softDelete, setUndoToast,
        coachingNotes, showCoachingNote, deleteCoachingNote, currentUserId,
        activeTab, setActiveTab, setViewingRep,
        setEditingTask, setTaskRailId, setTaskRailMode,
        spiffClaims, setSpiffClaims,
        isMobile,
    } = useApp();

    const isAdmin   = userRole === 'Admin';
    const isManager = userRole === 'Manager';
    const [subTab, setSubTab] = useState(() => localStorage.getItem('tab:salesmgr:subTab') || 'forecast');

    if (!isAdmin && !isManager) return null;

    const setSubTabPersist = t => { setSubTab(t); localStorage.setItem('tab:salesmgr:subTab', t); };

    // ── Common data ───────────────────────────────────────────
    const allUsers      = (settings.users||[]).filter(u => u.name && u.userType !== 'ReadOnly');
    const currentUserObj = allUsers.find(u => u.name === currentUser);
    const allReps       = allUsers.filter(u => u.userType === 'User');
    const visibleReps   = isAdmin ? allReps : allReps.filter(u =>
        (currentUserObj?.teamId && u.teamId === currentUserObj?.teamId) ||
        (currentUserObj?.team   && u.team   === currentUserObj?.team)
    );

    // Quarter info — the org's FISCAL quarter from quarters.js, the helper Home
    // and every report already use. This block built a CALENDAR quarter from
    // now.getMonth() and never read settings.fiscalYearStart, so with an October
    // fiscal start the header read "Q3 2026 · 4 weeks remaining" on the day Home
    // read "Q4 · Week 10" (state §0.80). Default 10 is the App.jsx / HomeTab /
    // ReportsTab convention. weeksLeft counts today and is never 0 — the
    // Gap-to-Quota tile divides by it.
    const fiscalStart = parseInt(settings?.fiscalYearStart) || 10;
    const curQ      = currentQuarter(fiscalStart);
    const weeksLeft = curQ.weeksLeft;
    const qLabel    = curQ.label;
    const fyRange   = fiscalRange(curQ.fiscalYear, 'FY', fiscalStart);

    const repStats = useMemo(() =>
        visibleReps.map(rep => buildRepStats(rep, opportunities, activities, tasks, curQ)),
        // curQ is a fresh object every render; its key names the quarter.
        [visibleReps, opportunities, activities, tasks, curQ.key]   // eslint-disable-line react-hooks/exhaustive-deps
    );

    const quarters    = ['Q1','Q2','Q3','Q4'];
    const quotaMode   = allUsers.find(u => u.quotaType)?.quotaType || 'annual';
    const getRepTotal = u => quotaMode === 'annual' ? (u.annualQuota||0) : (u.q1Quota||0)+(u.q2Quota||0)+(u.q3Quota||0)+(u.q4Quota||0);
    // Lifted out of AdminTab: updateRepField and setAllQuotaMode live here but the
    // status banner renders in AdminTab, so the state has to sit above both.
    // Declared above saveUser, which closes over it.
    const [saveState, setSaveState] = useState({ status: 'idle', msg: '' });

    // These PUTs used to live INSIDE the setSettings updater. A state reducer must
    // be pure: React invokes it twice under StrictMode, so every quota edit fired
    // two writes. Moved out, and the response is now checked.
    const saveUser = async (user, label) => {
        try {
            const res = await dbFetch('/.netlify/functions/users', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(user),
            });
            if (!res.ok) {
                setSaveState({ status: 'error', msg: res.status === 403
                    ? `Not saved \u2014 only Admins can change ${label}.`
                    : `Not saved \u2014 the server returned ${res.status}. Your ${label} changes are not stored.` });
                return false;
            }
            return true;
        } catch (err) {
            console.error('[SalesManagerTab] save ' + label, err);
            setSaveState({ status: 'error', msg: `Not saved \u2014 network error while saving ${label}.` });
            return false;
        }
    };

    const updateRepField = (userId, field, value) => {
        let updatedUser = null;
        setSettings(prev => {
            const updatedUsers = (prev.users||[]).map(u => u.id === userId ? {...u,[field]:value} : u);
            updatedUser = updatedUsers.find(u => u.id === userId);
            return {...prev, users:updatedUsers};
        });
        if (updatedUser) saveUser(updatedUser, 'quota');
    };
    const setAllQuotaMode = mode => {
        let toSave = [];
        setSettings(prev => {
            const updatedUsers = (prev.users||[]).map(u => u.userType !== 'ReadOnly' ? {...u, quotaType:mode} : u);
            toSave = updatedUsers.filter(u => u.userType !== 'ReadOnly');
            return {...prev, users:updatedUsers};
        });
        // Sequential, not a forEach of un-awaited promises: this can be every rep in
        // the org, and one report of the first failure beats N unhandled rejections.
        (async () => {
            for (const u of toSave) {
                if (!await saveUser(u, 'quota mode')) return;   // saveUser has already surfaced it
            }
        })();
    };

    // "Schedule 1:1" on the Today tab (state §0.84): a new task in the rail,
    // assigned to the caller, typed Meeting when the org's task types include it.
    const scheduleOneOnOne = (rep) => {
        const types = settings.taskTypes || ['Call', 'Meeting', 'Email', 'Demo', 'Follow-up'];
        setEditingTask({ title: `1:1 with ${rep.name}`, type: types.includes('Meeting') ? 'Meeting' : '', assignedTo: currentUser, priority: 'High' });
        setTaskRailId('new');
        setTaskRailMode('new');
    };

    // Team totals
    const teamQuota   = repStats.reduce((s,r) => s+r.quota, 0);
    const teamClosed  = repStats.reduce((s,r) => s+r.closedArr, 0);
    const teamCommit  = repStats.reduce((s,r) => s+r.commit, 0);
    const teamBest    = repStats.reduce((s,r) => s+r.bestCase, 0);
    const teamPipe    = repStats.reduce((s,r) => s+r.pipelineArr, 0);
    const teamAttain  = teamQuota > 0 ? Math.round((teamClosed/teamQuota)*100) : null;

    // Card style
    const card = { background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+1, overflow:'hidden', marginBottom:16 };
    const cardHdr = { padding:'12px 16px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' };
    const eyebrow = { fontSize:10, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.8, fontFamily:T.sans };
    const inputSt = { padding:'4px 8px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:'0.8125rem', fontFamily:T.sans, background:T.surface2, color:T.ink, width:100, outline:'none' };

    // ── SUB-TAB HEADER ────────────────────────────────────────
    const SubTabs = () => (
        <div style={{ display:'flex', alignItems:'center', borderBottom:`1px solid ${T.border}`, marginBottom:16 }}>
            {[
                { id:'audit',      label:'Today'          },
                { id:'forecast',   label:'Forecast'       },
                { id:'team',       label:'Team'           },
                { id:'admin',      label:'Administration' },
            ].map(t => {
                const active = subTab === t.id;
                return (
                    <button key={t.id} onClick={() => setSubTabPersist(t.id)} style={{
                        padding:'8px 16px', border:'none',
                        borderBottom: active ? `2px solid ${T.ink}` : '2px solid transparent',
                        background:'transparent', color: active ? T.ink : T.inkMuted,
                        fontSize:12, fontWeight: active ? 600 : 400,
                        cursor:'pointer', fontFamily:T.sans, transition:'color 120ms, border-color 120ms',
                        whiteSpace:'nowrap', marginBottom:-1,
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.color = T.inkMid; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.color = T.inkMuted; }}>
                        {t.label}
                    </button>
                );
            })}
        </div>
    );

    // ════════════════════════════════════════════════════════
    // TEAM TAB
    // ════════════════════════════════════════════════════════
    const TeamTab = () => {
        const onTrack = repStats.filter(r => r.score >= 65).length;
        const wobbly  = repStats.filter(r => r.score >= 40 && r.score < 65).length;
        const atRisk  = repStats.filter(r => r.score < 40).length;

        // Coaching notes come from their own table (state §0.82), already filtered
        // by the server to what this caller may see. The one-time import of the old
        // settings-blob notes ran on dev and prod on 3 Sep 2026 and is gone (§0.83).
        const recentNotes = sortNotes(coachingNotes).slice(0, 8);
        const roster      = settings.users || [];
        const teams       = settings.teams || [];

        return (
            <>
            {/* Summary bar */}
            <div style={{ display:'flex', alignItems:'center', gap:20, padding:'10px 0', marginBottom:12, fontFamily:T.sans }}>
                <div style={{ fontSize:13, color:T.inkMid }}>
                    Commit to date <strong style={{ color:T.ink }}>{fmtV(teamCommit)}</strong> of {fmtV(teamQuota)} · {teamAttain}%
                </div>
                <div style={{ display:'flex', gap:12, fontSize:12 }}>
                    {onTrack>0 && <span style={{ color:T.ok, fontWeight:600 }}>{onTrack} on track</span>}
                    {wobbly>0  && <span style={{ color:T.warn, fontWeight:600 }}>{wobbly} wobbly</span>}
                    {atRisk>0  && <span style={{ color:T.danger, fontWeight:600 }}>{atRisk} at risk</span>}
                </div>
                <div style={{ marginLeft:'auto' }}>
                    <button style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 11px', background:'transparent', border:`1px solid ${T.border}`, color:T.inkMid, fontSize:11, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}
                        onClick={showCoachingNote}>
                        + Add coaching note
                    </button>
                </div>
            </div>

            {/* Rep cards grid */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
                {repStats.map(rs => (
                    <div key={rs.rep.id} style={{ background:T.surface, border:`1px solid ${T.border}`, borderLeft:`3px solid ${rs.healthColor}`, borderRadius:`0 ${T.r+1}px ${T.r+1}px 0`, overflow:'hidden', fontFamily:T.sans }}>
                        {/* Card header */}
                        <div style={{ padding:'12px 14px', borderBottom:`1px solid ${T.border}` }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                <Avatar name={rs.rep.name} size={30} />
                                <div style={{ flex:1, minWidth:0 }}>
                                    <div style={{ fontSize:13, fontWeight:600, color:T.ink }}>{rs.rep.name}</div>
                                    <div style={{ fontSize:10, color:T.inkMuted }}>{rs.rep.territory ? 'AE · '+rs.rep.territory : rs.rep.team || 'AE'}</div>
                                </div>
                                <span style={{ fontSize:9, fontWeight:700, color:rs.healthColor, letterSpacing:0.5 }}>{rs.healthLabel}</span>
                            </div>

                            {/* Attainment bar */}
                            <div style={{ marginTop:10 }}>
                                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:10, color:T.inkMuted }}>
                                    <span>Attainment</span>
                                    <span style={{ fontWeight:700, color:rs.healthColor }}>{rs.attainPct !== null ? rs.attainPct+'%' : '—'}</span>
                                </div>
                                <div style={{ height:4, background:T.border, borderRadius:2 }}>
                                    <div style={{ height:'100%', width:Math.min(rs.attainPct||0,100)+'%', background:rs.healthColor, borderRadius:2, transition:'width 0.4s' }} />
                                </div>
                            </div>

                            {/* Closed / Commit / Quota */}
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:4, marginTop:10 }}>
                                {[
                                    { v:fmtV(rs.closedArr), l:'closed' },
                                    { v:fmtV(rs.commit),    l:'commit' },
                                    { v:fmtV(rs.quota),     l:'quota'  },
                                ].map(({v,l}) => (
                                    <div key={l}>
                                        <div style={{ fontSize:12, fontWeight:600, color:T.ink }}>{v}</div>
                                        <div style={{ fontSize:9, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.5 }}>{l}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Stats row */}
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:0 }}>
                            {[
                                { v:fmtV(rs.pipelineArr), l:'Pipeline'     },
                                { v:rs.act7d,              l:'Activity 7D'  },
                                { v:rs.stuck,              l:'Stuck',
                                  color:rs.stuck>0?T.danger:undefined       },
                            ].map(({v,l,color}) => (
                                <div key={l} style={{ padding:'8px 14px', borderRight:`1px solid ${T.border}` }}>
                                    <div style={{ fontSize:12, fontWeight:600, color:color||T.ink }}>{v}</div>
                                    <div style={{ fontSize:9, color:T.inkMuted }}>{l}</div>
                                </div>
                            ))}
                        </div>

                        {/* Buttons */}
                        <div style={{ display:'flex', gap:8, padding:'8px 14px', borderTop:`1px solid ${T.border}` }}>
                            {/* Coach → the note dialog addressed to this rep; Pipeline → the Pipeline
                                tab viewing as them (the Viewing bar's rep slicer) — state §0.84 */}
                            <button onClick={() => showCoachingNote({ recipientIds: [rs.rep.id] })} style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'4px 10px', background:'transparent', border:`1px solid ${T.border}`, color:T.inkMid, fontSize:11, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
                                Coach
                            </button>
                            <button onClick={() => { setViewingRep(rs.rep.name); setActiveTab('pipeline'); }} style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'4px 10px', background:'transparent', border:`1px solid ${T.border}`, color:T.inkMid, fontSize:11, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                                Pipeline
                            </button>
                            <span style={{ marginLeft:'auto', fontSize:10, color:T.inkMuted, alignSelf:'center' }}>{rs.activeOpps.length} open</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Coaching Red Flags ─────────────────────────────────────
                Computed from repStats (buildRepStats) which uses live
                opportunities and activities scoped to visibleReps.
                Benchmarks: win rate < 45%, last activity > 7d, stuck deals > 14d.
            ────────────────────────────────────────────────────────────── */}
            {(() => {
                const WB = 45, AB = 7, SD = 14;
                const FC = {
                    danger:  { bg:'rgba(156,58,46,0.08)',  border:'rgba(156,58,46,0.3)',  text:T.danger, dot:T.danger },
                    warning: { bg:'rgba(184,115,51,0.10)', border:T.gold,                 text:T.warn,   dot:T.warn   },
                    info:    { bg:'rgba(58,90,122,0.08)',  border:T.borderStrong,         text:T.info,   dot:T.info   },
                };

                const flagged = repStats.map(rs => {
                    const fl = [];
                    const rWon  = rs.wonOpps;
                    const rLost = (opportunities||[]).filter(o => (o.salesRep===rs.rep.name||o.assignedTo===rs.rep.name) && o.stage==='Closed Lost');
                    const cl    = rWon.length + rLost.length;
                    const wr    = cl > 0 ? Math.round(rWon.length / cl * 100) : null;

                    if (wr !== null && wr < WB && cl >= 3)
                        fl.push({ t:'warning', s:`${wr}% win rate vs ${WB}% benchmark (${cl} closed deals)` });

                    if (rs.daysSinceAct !== null && rs.daysSinceAct >= AB * 2)
                        fl.push({ t:'danger',  s:`${rs.daysSinceAct}d since last activity — above ${AB}d ideal` });
                    else if (rs.daysSinceAct !== null && rs.daysSinceAct >= AB)
                        fl.push({ t:'warning', s:`${rs.daysSinceAct}d since last activity (ideal is ${AB}d)` });
                    else if (rs.daysSinceAct === null)
                        fl.push({ t:'warning', s:'No activities logged in this period' });

                    if (rs.stuck > 0)
                        fl.push({ t:'danger',  s:`${rs.stuck} deal${rs.stuck>1?'s':''} stuck in stage 14+ days` });

                    if (rs.activeOpps.length === 0 && rWon.length === 0)
                        fl.push({ t:'info',    s:'No open or closed deals in this period' });

                    return fl.length > 0 ? { name:rs.rep.name, fl } : null;
                }).filter(Boolean);

                return (
                    <div style={{ ...card }}>
                        <div style={{ ...cardHdr }}>
                            <span style={{ fontSize:14, fontFamily:T.serif, fontStyle:'italic', fontWeight:300, color:T.ink }}>
                                🚩 Coaching red flags
                            </span>
                            <span style={{ fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>
                                {flagged.length} rep{flagged.length!==1?'s':''} flagged
                            </span>
                        </div>
                        <div style={{ padding:'8px 16px 12px' }}>
                            {flagged.length === 0 ? (
                                <div style={{ fontSize:13, color:T.ok, fontWeight:600, padding:'8px 0' }}>
                                    No coaching concerns detected — team is healthy ✓
                                </div>
                            ) : (
                                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                                    {flagged.map(({ name, fl }) => (
                                        <div key={name} style={{ border:`1px solid ${T.border}`, borderRadius:T.r+1, overflow:'hidden' }}>
                                            <div style={{ padding:'7px 14px', background:T.surface2, borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', gap:8 }}>
                                                <Avatar name={name} size={20} />
                                                <span style={{ fontSize:13, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{name}</span>
                                                <span style={{ fontSize:11, color:T.inkMuted, fontFamily:T.sans, marginLeft:4 }}>{fl.length} flag{fl.length>1?'s':''}</span>
                                            </div>
                                            <div style={{ padding:'8px 14px', display:'flex', flexDirection:'column', gap:5 }}>
                                                {fl.map((f, fi) => {
                                                    const c = FC[f.t] || FC.info;
                                                    return (
                                                        <div key={fi} style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'6px 10px', background:c.bg, border:`0.5px solid ${c.border}`, borderRadius:T.r }}>
                                                            <div style={{ width:7, height:7, borderRadius:'50%', background:c.dot, flexShrink:0, marginTop:4 }} />
                                                            <div style={{ fontSize:12, color:c.text, lineHeight:1.5, fontFamily:T.sans }}>{f.s}</div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })()}

            {saveState.status === 'error' && (
                <div style={{ padding:'8px 12px', marginBottom:12, background:'rgba(156,58,46,0.08)', border:`1px solid rgba(156,58,46,0.3)`, borderRadius:T.r, fontSize:12, color:T.danger, fontFamily:T.sans }}>{saveState.msg}</div>
            )}
            {/* Recent coaching — the coaching_notes table, server-filtered (state §0.82). The
                inert "See all →" button is gone; the header states what the list is. */}
            {recentNotes.length > 0 && (
                <div style={card}>
                    <div style={{ ...cardHdr }}>
                        <span style={{ fontSize:14, fontFamily:T.serif, fontStyle:'italic', fontWeight:300, color:T.ink }}>Recent coaching</span>
                        <span style={{ fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>{coachingNotes.length} note{coachingNotes.length !== 1 ? 's' : ''} you can see</span>
                    </div>
                    <div style={{ padding:'8px 0' }}>
                        {recentNotes.map((n,i) => {
                            const who = audienceLabel(n, roster, teams);
                            return (
                            <div key={n.id} style={{ display:'flex', gap:12, padding:'10px 16px', borderBottom:i<recentNotes.length-1?`1px solid ${T.border}`:'none' }}>
                                <Avatar name={who} size={26} />
                                <div style={{ flex:1, minWidth:0 }}>
                                    <div style={{ fontSize:12, fontWeight:600, color:T.ink }}>{who}</div>
                                    <div style={{ fontSize:11, color:T.inkMuted, marginTop:1 }}>
                                        {n.date ? new Date(n.date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : ''}
                                        {n.authorName ? ` · ${n.authorName}` : ''}{n.legacy ? ' · imported' : ''}
                                    </div>
                                    <div style={{ fontSize:12, color:T.inkMid, marginTop:4, fontStyle:'italic' }}>"{n.text}"</div>
                                </div>
                                {(isAdmin || n.authorId === currentUserId) && (
                                    <button title="Delete this note"
                                        onClick={() => showConfirm('Delete this coaching note? The people it was addressed to will no longer see it.', async () => {
                                            const r = await deleteCoachingNote(n.id);
                                            if (!r.ok) setSaveState({ status: 'error', msg: `Not deleted — ${r.error}` });
                                        }, true)}
                                        style={{ background:'none', border:'none', color:T.inkMuted, cursor:'pointer', fontSize:15, lineHeight:1, alignSelf:'flex-start', fontFamily:T.sans }}>×</button>
                                )}
                            </div>
                            );
                        })}
                    </div>
                </div>
            )}
            </>
        );
    };

    // ════════════════════════════════════════════════════════
    // PIPELINE AUDIT (Morning Brief)
    // ════════════════════════════════════════════════════════
    const AuditTab = () => {
        const firstName = (currentUser||'').split(' ')[0];
        const today     = new Date();
        const hour      = today.getHours();
        const greeting  = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
        const dayName   = today.toLocaleDateString('en-US',{weekday:'long'});
        const dateFmt   = today.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}).toUpperCase();

        // Reps trending down (score < 40)
        const needsCoaching = repStats.filter(r => r.score < 40);

        // Stuck deals (14+ days no stage change)
        const stuckDeals = (opportunities||[])
            .filter(o => !['Closed Won','Closed Lost'].includes(o.stage) && o.stageChangedDate)
            .map(o => {
                const days = Math.floor((today - new Date(o.stageChangedDate+'T12:00:00'))/86400000);
                return { ...o, daysSince:days };
            })
            .filter(o => o.daysSince >= 14)
            .sort((a,b) => b.daysSince - a.daysSince)
            .slice(0, 8);

        const gapToQuota  = teamQuota - teamCommit;
        const repsAtRisk  = repStats.filter(r => r.score < 40).length;

        return (
            <>
            {/* Morning Brief header */}
            <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:1, textTransform:'uppercase', fontFamily:T.sans, marginBottom:4 }}>
                    {dayName} · {dateFmt} · Morning Brief
                </div>
                <div style={{ fontSize:24, fontFamily:T.serif, fontStyle:'italic', fontWeight:300, color:T.ink, lineHeight:1.2, marginBottom:4 }}>
                    {greeting}, {firstName}.{' '}
                    <span style={{ color:T.inkMid }}>Here's what needs you today.</span>
                </div>
            </div>

            {/* 4 KPI tiles */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
                {[
                    { label:'Team Commit',   value:fmtV(teamCommit),  sub:`of ${fmtV(teamQuota)} quota`,    color:T.ink  },
                    { label:'Gap to Quota',  value:fmtV(gapToQuota),  sub:`${weeksLeft} weeks · ${fmtV(Math.max(gapToQuota/weeksLeft,0))}/wk needed`, color:gapToQuota>0?T.danger:T.ok },
                    { label:'Reps at Risk',  value:repsAtRisk,         sub:repsAtRisk>0?repStats.filter(r=>r.score<40).map(r=>r.rep.name.split(' ')[0]).join(', '):'All reps on track', color:repsAtRisk>0?T.danger:T.ok },
                    { label:'Stuck Deals',   value:stuckDeals.length,  sub:stuckDeals.length>0?`${fmtV(stuckDeals.reduce((s,o)=>s+(parseFloat(o.arr)||0),0))} at stake`:'Pipeline flowing well', color:stuckDeals.length>0?T.warn:T.ok },
                ].map(({label,value,sub,color}) => (
                    <div key={label} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+1, padding:'12px 14px', fontFamily:T.sans }}>
                        <div style={{ fontSize:9, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.8, marginBottom:4 }}>{label}</div>
                        <div style={{ fontSize:22, fontWeight:700, color }}>{value}</div>
                        <div style={{ fontSize:10, color:T.inkMuted, marginTop:3 }}>{sub}</div>
                    </div>
                ))}
            </div>

            {/* Two-column body */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                {/* LEFT column */}
                <div>
                    {/* Needs coaching today */}
                    <div style={{ ...card }}>
                        <div style={{ ...cardHdr }}>
                            <div>
                                <div style={eyebrow}>Needs Coaching Today</div>
                                {needsCoaching.length > 0
                                    ? <div style={{ fontSize:15, fontFamily:T.serif, fontStyle:'italic', fontWeight:300, color:T.ink, marginTop:2 }}>{needsCoaching.length === 1 ? 'One rep trending down' : `${needsCoaching.length} reps trending down`}</div>
                                    : <div style={{ fontSize:13, color:T.ok, fontWeight:600, marginTop:2 }}>All reps on track ✓</div>
                                }
                            </div>
                        </div>
                        {needsCoaching.length === 0 ? (
                            <div style={{ padding:'20px 16px', fontSize:12, color:T.inkMuted, fontFamily:T.sans }}>No reps need attention today.</div>
                        ) : needsCoaching.map(rs => (
                            <div key={rs.rep.id} style={{ padding:'12px 16px', borderBottom:`1px solid ${T.border}` }}>
                                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                                    <Avatar name={rs.rep.name} size={26} />
                                    <div>
                                        <div style={{ fontSize:12, fontWeight:600, color:T.ink }}>{rs.rep.name}</div>
                                        <div style={{ fontSize:10, color:T.danger }}>
                                            {rs.attainPct}% to quota · {rs.stuck} stuck deals · {rs.act7d} activities this week
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display:'flex', gap:6 }}>
                                    {/* Three real destinations (state §0.84): the coaching dialog addressed to
                                        this rep, a new 1:1 task in the rail, the Pipeline tab viewing as them. */}
                                    {[
                                        { l:'Open coaching',  fn: () => showCoachingNote({ recipientIds: [rs.rep.id] }) },
                                        { l:'Schedule 1:1',   fn: () => scheduleOneOnOne(rs.rep) },
                                        { l:'Their pipeline', fn: () => { setViewingRep(rs.rep.name); setActiveTab('pipeline'); } },
                                    ].map(({l,fn}) => (
                                        <button key={l} onClick={fn} style={{ fontSize:10, padding:'3px 8px', background:'transparent', border:`1px solid ${T.border}`, color:T.inkMid, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>{l}</button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Stuck deals */}
                    <div style={card}>
                        <div style={{ ...cardHdr }}>
                            <div>
                                <div style={eyebrow}>Stuck Deals</div>
                                <div style={{ fontSize:13, color:T.ink, fontWeight:600, marginTop:2 }}>{stuckDeals.length} {stuckDeals.length===1?'opportunity':'opportunities'} aging in stage</div>
                            </div>
                        </div>
                        {stuckDeals.length === 0 ? (
                            <div style={{ padding:'20px 16px', fontSize:12, color:T.inkMuted, fontFamily:T.sans }}>No stuck deals.</div>
                        ) : stuckDeals.map((o,i) => (
                            <div key={o.id} style={{ display:'grid', gridTemplateColumns:'1fr 80px 30px 60px', alignItems:'center', gap:8, padding:'9px 16px', borderBottom:i<stuckDeals.length-1?`1px solid ${T.border}`:'none', fontFamily:T.sans }}>
                                <div>
                                    <div style={{ fontSize:12, fontWeight:600, color:T.ink, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{o.opportunityName || o.account}</div>
                                    <div style={{ fontSize:10, color:T.inkMuted }}>{o.salesRep}</div>
                                </div>
                                <div style={{ fontSize:11, color:T.inkMuted }}>{o.stage}</div>
                                <div style={{ fontSize:11, fontWeight:600, color:T.warn }}>{o.daysSince}d</div>
                                <div style={{ fontSize:11, fontWeight:600, color:T.ink, textAlign:'right' }}>{fmtV(o.arr)}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* RIGHT column */}
                <div>
                    {/* Forecast Rhythm */}
                    <div style={card}>
                        <div style={{ ...cardHdr }}>
                            <div>
                                <div style={eyebrow}>Forecast Rhythm</div>
                                <div style={{ fontSize:13, fontFamily:T.serif, fontStyle:'italic', fontWeight:300, color:T.ink, marginTop:2 }}>Team at a glance</div>
                            </div>
                        </div>
                        <div style={{ padding:'8px 0' }}>
                            {repStats.map((rs,i) => (
                                <div key={rs.rep.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 16px', borderBottom:i<repStats.length-1?`1px solid ${T.border}`:'none', fontFamily:T.sans }}>
                                    <div style={{ width:8, height:8, borderRadius:'50%', background:rs.healthColor, flexShrink:0 }} />
                                    <div style={{ flex:1, fontSize:12, color:T.ink }}>{rs.rep.name}</div>
                                    <div style={{ flex:2, height:4, background:T.border, borderRadius:2 }}>
                                        <div style={{ height:'100%', width:Math.min(rs.attainPct||0,100)+'%', background:rs.healthColor, borderRadius:2 }} />
                                    </div>
                                    <div style={{ fontSize:11, fontWeight:600, color:rs.healthColor, minWidth:32, textAlign:'right' }}>{rs.attainPct !== null ? rs.attainPct+'%' : '—'}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Wins to celebrate */}
                    <div style={card}>
                        <div style={{ ...cardHdr }}>
                            <div>
                                <div style={eyebrow}>Wins to Celebrate</div>
                                <div style={{ fontSize:13, fontFamily:T.serif, fontStyle:'italic', fontWeight:300, color:T.ink, marginTop:2 }}>Team bright spots</div>
                            </div>
                        </div>
                        <div style={{ padding:'8px 0' }}>
                            {repStats.filter(r => r.score >= 65).slice(0,3).map((rs,i) => (
                                <div key={rs.rep.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderBottom:i<Math.min(repStats.filter(r=>r.score>=65).length,3)-1?`1px solid ${T.border}`:'none', fontFamily:T.sans }}>
                                    <Avatar name={rs.rep.name} size={28} />
                                    <div>
                                        <div style={{ fontSize:12, fontWeight:600, color:T.ink }}>{rs.rep.name}</div>
                                        <div style={{ fontSize:10, color:T.inkMuted }}>
                                            {fmtV(rs.closedArr)} closed · {rs.act7d} activities · trending up
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {repStats.filter(r => r.score >= 65).length === 0 && (
                                <div style={{ padding:'16px', fontSize:12, color:T.inkMuted, fontFamily:T.sans }}>Keep pushing — wins coming soon.</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            </>
        );
    };

    return (
        <div className="tab-page" style={{ fontFamily:T.sans }}>
            {/* Header */}
            <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', paddingBottom:12 }}>
                <div>
                    <div style={{ fontSize:28, fontFamily:T.serif, fontStyle:'italic', fontWeight:300, letterSpacing:-0.8, color:T.ink, lineHeight:1, marginBottom:5 }}>Sales Manager</div>
                    <div style={{ fontSize:12, color:T.inkMuted }}>Team forecast · {qLabel} · {weeksLeft} weeks remaining</div>
                </div>
            </div>

            <SubTabs />

            {subTab === 'forecast' && <ForecastTab
                card={card} cardHdr={cardHdr} eyebrow={eyebrow} repStats={repStats} updateRepField={updateRepField}
                period={curQ} exportToCSV={exportToCSV} exportingCSV={exportingCSV} showCoachingNote={showCoachingNote}
                teamQuota={teamQuota} teamClosed={teamClosed} teamCommit={teamCommit}
                teamBest={teamBest} teamPipe={teamPipe} teamAttain={teamAttain} />}
            {subTab === 'team'     && <TeamTab />}
            {subTab === 'audit'    && <AuditTab />}
            {subTab === 'admin'    && <AdminTab
                card={card} cardHdr={cardHdr} eyebrow={eyebrow}
                settings={settings} setSettings={setSettings}
                opportunities={opportunities} currentUser={currentUser} isAdmin={isAdmin}
                visibleReps={visibleReps} quarters={quarters} quotaMode={quotaMode} fyRange={fyRange}
                getRepTotal={getRepTotal} updateRepField={updateRepField}
                saveState={saveState} setSaveState={setSaveState}
                setAllQuotaMode={setAllQuotaMode} setActiveTab={setActiveTab}
                showConfirm={showConfirm} spiffClaims={spiffClaims} setSpiffClaims={setSpiffClaims} />}
        </div>
    );
}
