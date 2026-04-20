import React, { useState, useMemo } from 'react';
import { useApp } from '../AppContext';
import { dbFetch } from '../utils/storage';

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
function buildRepStats(rep, opportunities, activities, tasks) {
    const today    = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const allRepOpps  = (opportunities||[]).filter(o => o.salesRep === rep.name || o.assignedTo === rep.name);
    const activeOpps  = allRepOpps.filter(o => !['Closed Won','Closed Lost'].includes(o.stage));
    const wonOpps     = allRepOpps.filter(o => o.stage === 'Closed Won');

    const closedArr   = wonOpps.reduce((s,o) => s+(parseFloat(o.arr)||0), 0);
    const pipelineArr = activeOpps.reduce((s,o) => s+(parseFloat(o.arr)||0), 0);

    // Quota
    const quotaMode = rep.quotaType || 'annual';
    const quota     = quotaMode === 'annual'
        ? (rep.annualQuota || 0)
        : (rep.q1Quota||0)+(rep.q2Quota||0)+(rep.q3Quota||0)+(rep.q4Quota||0);
    const attainPct = quota > 0 ? Math.round((closedArr / quota) * 100) : null;

    // Commit — use rep.commit field (editable in Forecast tab)
    const commit   = parseFloat(rep.commit) || 0;
    const bestCase = parseFloat(rep.bestCase) || pipelineArr * 0.6;

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

    return { rep, quota, closedArr, commit, bestCase, pipelineArr, attainPct, score, healthColor, healthLabel, trend, daysSinceAct, act7d, stuck, overdueCnt, wonOpps, activeOpps };
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

// ════════════════════════════════════════════════════════════
export default function SalesManagerTab() {
    const {
        settings, setSettings,
        opportunities, activities, tasks,
        currentUser, userRole,
        getQuarter, getQuarterLabel,
        exportToCSV, showConfirm, softDelete, setUndoToast,
        activeTab, setActiveTab,
        spiffClaims, setSpiffClaims,
        isMobile,
    } = useApp();

    const isAdmin   = userRole === 'Admin';
    const isManager = userRole === 'Manager';
    const [subTab, setSubTab] = useState(() => localStorage.getItem('tab:salesmgr:subTab') || 'audit');

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

    const repStats = useMemo(() =>
        visibleReps.map(rep => buildRepStats(rep, opportunities, activities, tasks)),
        [visibleReps, opportunities, activities, tasks]
    );

    const quarters    = ['Q1','Q2','Q3','Q4'];
    const quotaMode   = allUsers.find(u => u.quotaType)?.quotaType || 'annual';
    const getRepTotal = u => quotaMode === 'annual' ? (u.annualQuota||0) : (u.q1Quota||0)+(u.q2Quota||0)+(u.q3Quota||0)+(u.q4Quota||0);
    const updateRepField = (userId, field, value) => {
        setSettings(prev => {
            const updatedUsers = (prev.users||[]).map(u => u.id === userId ? {...u,[field]:value} : u);
            const updatedUser  = updatedUsers.find(u => u.id === userId);
            if (updatedUser) dbFetch('/.netlify/functions/users',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(updatedUser)}).catch(console.error);
            return {...prev, users:updatedUsers};
        });
    };
    const setAllQuotaMode = mode => {
        setSettings(prev => {
            const updatedUsers = (prev.users||[]).map(u => u.userType !== 'ReadOnly' ? {...u, quotaType:mode} : u);
            updatedUsers.filter(u=>u.userType!=='ReadOnly').forEach(u => dbFetch('/.netlify/functions/users',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(u)}).catch(console.error));
            return {...prev, users:updatedUsers};
        });
    };

    // Team totals
    const teamQuota   = repStats.reduce((s,r) => s+r.quota, 0);
    const teamClosed  = repStats.reduce((s,r) => s+r.closedArr, 0);
    const teamCommit  = repStats.reduce((s,r) => s+r.commit, 0);
    const teamBest    = repStats.reduce((s,r) => s+r.bestCase, 0);
    const teamPipe    = repStats.reduce((s,r) => s+r.pipelineArr, 0);
    const teamAttain  = teamQuota > 0 ? Math.round((teamClosed/teamQuota)*100) : null;

    // Quarter info
    const now  = new Date();
    const qNum = Math.floor(now.getMonth()/3) + 1;
    const qEnd = new Date(now.getFullYear(), qNum*3, 0);
    const weeksLeft = Math.max(0, Math.ceil((qEnd - now)/(7*86400000)));
    const qLabel = `Q${qNum} ${now.getFullYear()}`;

    // Card style
    const card = { background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+1, overflow:'hidden', marginBottom:16 };
    const cardHdr = { padding:'12px 16px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' };
    const eyebrow = { fontSize:10, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.8, fontFamily:T.sans };
    const inputSt = { padding:'4px 8px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:'0.8125rem', fontFamily:T.sans, background:T.surface2, color:T.ink, width:100, outline:'none' };

    // ── SUB-TAB HEADER ────────────────────────────────────────
    const SubTabs = () => (
        <div style={{ display:'flex', alignItems:'center', borderBottom:`1px solid ${T.border}`, marginBottom:16 }}>
            {[
                { id:'audit',      label:'Overview'       },
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
                        cursor:'pointer', fontFamily:T.sans, transition:'all 120ms',
                        whiteSpace:'nowrap', marginBottom:-1,
                    }}>
                        {t.label}
                    </button>
                );
            })}
        </div>
    );

    // ════════════════════════════════════════════════════════
    // FORECAST TAB
    // ════════════════════════════════════════════════════════
    const ForecastTab = () => {
        const [editingCommit, setEditingCommit] = useState(null);

        // Stacked bar widths
        const barTotal = Math.max(teamQuota, teamPipe);
        const closedW  = barTotal > 0 ? (teamClosed/barTotal)*100 : 0;
        const commitW  = barTotal > 0 ? (teamCommit/barTotal)*100 : 0;
        const bestW    = barTotal > 0 ? (teamBest/barTotal)*100 : 0;
        const pipeW    = barTotal > 0 ? (teamPipe/barTotal)*100 : 0;
        const quotaW   = barTotal > 0 ? (teamQuota/barTotal)*100 : 0;

        return (
            <>
            {/* ── Team progress bar ── */}
            <div style={{ ...card, marginBottom:16 }}>
                <div style={{ padding:'16px 20px' }}>
                    <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:12 }}>
                        <div>
                            <div style={eyebrow}>Team to quota</div>
                            <div style={{ display:'flex', alignItems:'baseline', gap:8, marginTop:4 }}>
                                <span style={{ fontSize:28, fontWeight:700, color:T.ink, fontFamily:T.sans }}>{fmtV(teamClosed)}</span>
                                <span style={{ fontSize:13, color:T.inkMuted }}>of {fmtV(teamQuota)}</span>
                                <span style={{ fontSize:13, fontWeight:600, color:T.inkMid }}>{teamAttain !== null ? teamAttain+'%' : '—'}</span>
                            </div>
                        </div>
                        <div style={{ textAlign:'right' }}>
                            <div style={eyebrow}>Commit call</div>
                            <div style={{ fontSize:22, fontWeight:700, color:T.ink, marginTop:4 }}>{fmtV(teamCommit)}</div>
                            {teamQuota > 0 && teamCommit < teamQuota && (
                                <div style={{ fontSize:11, color:T.danger, fontWeight:600 }}>Under quota by {fmtV(teamQuota - teamCommit)}</div>
                            )}
                        </div>
                    </div>

                    {/* Stacked bar */}
                    <div style={{ position:'relative', height:10, borderRadius:T.r, background:T.surface2, overflow:'visible', marginBottom:6 }}>
                        {/* Quota marker */}
                        <div style={{ position:'absolute', left:quotaW+'%', top:-3, bottom:-3, width:2, background:T.ink, zIndex:3, borderRadius:1 }} />
                        {/* Pipeline (lightest) */}
                        <div style={{ position:'absolute', inset:0, width:Math.min(pipeW,100)+'%', background:T.border, borderRadius:T.r }} />
                        {/* Best case */}
                        <div style={{ position:'absolute', inset:0, width:Math.min(bestW,100)+'%', background:T.gold+'88', borderRadius:T.r }} />
                        {/* Commit */}
                        <div style={{ position:'absolute', inset:0, width:Math.min(commitW,100)+'%', background:T.gold, borderRadius:T.r }} />
                        {/* Closed */}
                        <div style={{ position:'absolute', inset:0, width:Math.min(closedW,100)+'%', background:T.ok, borderRadius:T.r }} />
                    </div>

                    {/* Legend */}
                    <div style={{ display:'flex', gap:16, fontSize:10, color:T.inkMuted, fontFamily:T.sans }}>
                        {[
                            { color:T.ok,         label:`Closed ${fmtV(teamClosed)}` },
                            { color:T.gold,        label:`Commit ${fmtV(teamCommit)}` },
                            { color:T.gold+'88',   label:`Best-case ${fmtV(teamBest)}` },
                            { color:T.border,      label:`Open pipeline ${fmtV(teamPipe)}` },
                        ].map(({ color, label }) => (
                            <div key={label} style={{ display:'flex', alignItems:'center', gap:4 }}>
                                <div style={{ width:8, height:8, borderRadius:2, background:color, flexShrink:0 }} />
                                {label}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Ledger table ── */}
            <div style={card}>
                {/* Column headers */}
                <div style={{ display:'grid', gridTemplateColumns:'180px 80px 80px 100px 90px 90px 70px 80px 70px', alignItems:'center', padding:'8px 16px', background:T.surface2, borderBottom:`1px solid ${T.border}`, fontSize:9, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.6, fontFamily:T.sans }}>
                    <div>Rep</div><div style={{textAlign:'right'}}>Quota</div><div style={{textAlign:'right'}}>Closed</div>
                    <div style={{textAlign:'right'}}>Commit</div><div style={{textAlign:'right'}}>Best Case</div>
                    <div style={{textAlign:'right'}}>Pipeline</div><div style={{textAlign:'center'}}>Attain</div>
                    <div style={{textAlign:'center'}}>Health</div><div style={{textAlign:'center'}}>Action</div>
                </div>

                {/* Rep rows */}
                {repStats.map((rs, i) => {
                    const isEditing = editingCommit === rs.rep.id;
                    return (
                        <div key={rs.rep.id} style={{ display:'grid', gridTemplateColumns:'180px 80px 80px 100px 90px 90px 70px 80px 70px', alignItems:'center', padding:'10px 16px', borderBottom:`1px solid ${T.border}`, background: i%2===0 ? T.surface : T.bg, fontFamily:T.sans, transition:'background 80ms' }}
                            onMouseEnter={e => e.currentTarget.style.background=T.surface2}
                            onMouseLeave={e => e.currentTarget.style.background=i%2===0 ? T.surface : T.bg}>

                            {/* Rep name */}
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                <Avatar name={rs.rep.name} size={26} />
                                <div>
                                    <div style={{ fontSize:12, fontWeight:600, color:T.ink }}>{rs.rep.name}</div>
                                    <div style={{ fontSize:10, color:T.inkMuted }}>{rs.rep.territory || rs.rep.team || 'AE'}</div>
                                </div>
                            </div>

                            {/* Quota */}
                            <div style={{ textAlign:'right', fontSize:12, fontWeight:600, color:T.ink }}>{fmtV(rs.quota)}</div>

                            {/* Closed */}
                            <div style={{ textAlign:'right', fontSize:12, color:T.ok, fontWeight:600 }}>{fmtV(rs.closedArr)}</div>

                            {/* Commit — editable, dashed gold border */}
                            <div style={{ textAlign:'right' }}>
                                {isEditing ? (
                                    <input type="number" defaultValue={rs.commit}
                                        autoFocus
                                        onBlur={e => { updateRepField(rs.rep.id,'commit',parseFloat(e.target.value)||0); setEditingCommit(null); }}
                                        onKeyDown={e => { if (e.key==='Enter'||e.key==='Escape') e.target.blur(); }}
                                        style={{ width:80, padding:'3px 6px', border:`1.5px dashed ${T.goldInk}`, borderRadius:T.r, fontSize:12, fontFamily:T.sans, background:T.surface2, color:T.ink, textAlign:'right', outline:'none' }} />
                                ) : (
                                    <span onClick={() => setEditingCommit(rs.rep.id)} style={{ fontSize:12, fontWeight:600, color:T.goldInk, cursor:'text', borderBottom:`1.5px dashed ${T.gold}`, paddingBottom:1 }}>
                                        {fmtV(rs.commit)}
                                    </span>
                                )}
                            </div>

                            {/* Best case */}
                            <div style={{ textAlign:'right', fontSize:12, color:T.inkMid }}>{fmtV(rs.bestCase)}</div>

                            {/* Pipeline */}
                            <div style={{ textAlign:'right', fontSize:12, color:T.inkMid }}>{fmtV(rs.pipelineArr)}</div>

                            {/* Attain % + mini bar */}
                            <div style={{ textAlign:'center' }}>
                                <div style={{ fontSize:12, fontWeight:700, color:rs.attainPct>=100 ? T.ok : rs.attainPct>=70 ? T.warn : T.danger }}>
                                    {rs.attainPct !== null ? rs.attainPct+'%' : '—'}
                                </div>
                                <div style={{ height:3, background:T.border, borderRadius:2, marginTop:3 }}>
                                    <div style={{ height:'100%', width:Math.min(rs.attainPct||0,100)+'%', background:rs.attainPct>=100?T.ok:rs.attainPct>=70?T.warn:T.danger, borderRadius:2 }} />
                                </div>
                            </div>

                            {/* Health dot + trend */}
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:4 }}>
                                <div style={{ width:8, height:8, borderRadius:'50%', background:rs.healthColor }} />
                                <span style={{ fontSize:10, color:rs.trend==='up' ? T.ok : rs.trend==='down' ? T.danger : T.inkMuted }}>
                                    {rs.trend==='up' ? '↑' : rs.trend==='down' ? '↓' : '–'}
                                </span>
                            </div>

                            {/* Coach action */}
                            <div style={{ textAlign:'center' }}>
                                <button style={{ fontSize:10, color:T.info, background:'none', border:'none', cursor:'pointer', fontFamily:T.sans, fontWeight:600 }}>Coach →</button>
                            </div>
                        </div>
                    );
                })}

                {/* Team total row */}
                <div style={{ display:'grid', gridTemplateColumns:'180px 80px 80px 100px 90px 90px 70px 80px 70px', alignItems:'center', padding:'10px 16px', background:T.surface2, borderTop:`2px solid ${T.border}`, fontFamily:T.sans }}>
                    <div style={{ fontSize:11, fontWeight:700, color:T.ink, textTransform:'uppercase', letterSpacing:0.5 }}>Team Total</div>
                    <div style={{ textAlign:'right', fontSize:12, fontWeight:700, color:T.ink }}>{fmtV(teamQuota)}</div>
                    <div style={{ textAlign:'right', fontSize:12, fontWeight:700, color:T.ok }}>{fmtV(teamClosed)}</div>
                    <div style={{ textAlign:'right', fontSize:12, fontWeight:700, color:T.goldInk }}>{fmtV(teamCommit)}</div>
                    <div style={{ textAlign:'right', fontSize:12, fontWeight:600, color:T.inkMid }}>{fmtV(teamBest)}</div>
                    <div style={{ textAlign:'right', fontSize:12, fontWeight:600, color:T.inkMid }}>{fmtV(teamPipe)}</div>
                    <div style={{ textAlign:'center', fontSize:12, fontWeight:700, color:teamAttain>=100?T.ok:T.inkMid }}>{teamAttain !== null ? teamAttain+'%' : '—'}</div>
                    <div /><div />
                </div>
            </div>
            </>
        );
    };

    // ════════════════════════════════════════════════════════
    // TEAM TAB
    // ════════════════════════════════════════════════════════
    const TeamTab = () => {
        const onTrack = repStats.filter(r => r.score >= 65).length;
        const wobbly  = repStats.filter(r => r.score >= 40 && r.score < 65).length;
        const atRisk  = repStats.filter(r => r.score < 40).length;

        // Recent coaching notes from settings
        const coachingNotes = (settings.coachingNotes || [])
            .sort((a,b) => (b.date||'').localeCompare(a.date||''))
            .slice(0, 5);

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
                        onClick={() => {
                            const note = prompt('Add coaching note (rep name: note text):');
                            if (note) {
                                const notes = [...(settings.coachingNotes||[]), { id:'cn_'+Date.now(), text:note, date:new Date().toISOString().split('T')[0], author:currentUser }];
                                setSettings(prev => ({...prev, coachingNotes:notes}));
                            }
                        }}>
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
                            <button style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'4px 10px', background:'transparent', border:`1px solid ${T.border}`, color:T.inkMid, fontSize:11, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
                                Coach
                            </button>
                            <button style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'4px 10px', background:'transparent', border:`1px solid ${T.border}`, color:T.inkMid, fontSize:11, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                                Pipeline
                            </button>
                            <span style={{ marginLeft:'auto', fontSize:10, color:T.inkMuted, alignSelf:'center' }}>{rs.activeOpps.length} open</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Recent coaching */}
            {coachingNotes.length > 0 && (
                <div style={card}>
                    <div style={{ ...cardHdr }}>
                        <span style={{ fontSize:14, fontFamily:T.serif, fontStyle:'italic', fontWeight:300, color:T.ink }}>Recent coaching</span>
                        <button style={{ fontSize:11, color:T.goldInk, background:'none', border:'none', cursor:'pointer', fontFamily:T.sans }}>See all →</button>
                    </div>
                    <div style={{ padding:'8px 0' }}>
                        {coachingNotes.map((n,i) => (
                            <div key={n.id||i} style={{ display:'flex', gap:12, padding:'10px 16px', borderBottom:i<coachingNotes.length-1?`1px solid ${T.border}`:'none' }}>
                                <Avatar name={n.rep || n.author || '?'} size={26} />
                                <div>
                                    <div style={{ fontSize:12, fontWeight:600, color:T.ink }}>{n.rep || n.author}</div>
                                    <div style={{ fontSize:11, color:T.inkMuted, marginTop:1 }}>{n.date ? new Date(n.date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : ''}</div>
                                    <div style={{ fontSize:12, color:T.inkMid, marginTop:4, fontStyle:'italic' }}>"{n.text}"</div>
                                </div>
                            </div>
                        ))}
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
                    Good morning, {firstName}.{' '}
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
                                    {[{l:'Open coaching'},{l:'Schedule 1:1'},{l:'Their pipeline'}].map(({l}) => (
                                        <button key={l} style={{ fontSize:10, padding:'3px 8px', background:'transparent', border:`1px solid ${T.border}`, color:T.inkMid, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>{l}</button>
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

    // ════════════════════════════════════════════════════════
    // ADMINISTRATION TAB (unchanged logic, V1 tokens)
    // ════════════════════════════════════════════════════════
    const AdminTab = () => {
        const unassignedReps = isAdmin ? visibleReps.filter(u => !u.territory?.trim()) : [];
        const visibleTerritories = [...new Set(visibleReps.filter(u=>u.territory?.trim()).map(u=>u.territory.trim()))].sort();
        const terrFilter = settings.__qbTerrFilter || 'all';
        const setTerrFilter = v => setSettings(prev => ({...prev, __qbTerrFilter:v}));
        const filteredReps = isAdmin && terrFilter !== 'all' ? visibleReps.filter(u=>u.territory?.trim()===terrFilter) : visibleReps;
        const renderTerritories = isAdmin && terrFilter === 'all' ? visibleTerritories : (terrFilter !== 'all' ? [terrFilter] : [...new Set(visibleReps.filter(u=>u.territory).map(u=>u.territory.trim()))].sort());
        const filteredTotal = filteredReps.reduce((s,u)=>s+getRepTotal(u),0);
        const terrColors = ['#9c6b4a','#4a6b5a','#3a5a7a','#7a6a48','#9c3a2e'];
        const terrColorMap = {}; visibleTerritories.forEach((t,i) => { terrColorMap[t] = terrColors[i%terrColors.length]; });
        const calcCommission = (revenue, quota) => {
            if (quota<=0||revenue<=0) return 0;
            let comm = 0;
            [...((settings.quotaData||{}).commissionTiers||[])].sort((a,b)=>a.minPercent-b.minPercent).forEach(tier => {
                const mn=(tier.minPercent/100)*quota, mx=tier.maxPercent>=999?Infinity:(tier.maxPercent/100)*quota;
                if (revenue>mn) comm+=(Math.min(revenue,mx)-mn)*(tier.rate/100);
            });
            return comm;
        };
        const smCard2 = { ...card };
        const inputStAdmin = { width:'100%', padding:'0.5rem 0.625rem', border:`1.5px solid ${T.border}`, borderRadius:T.r, fontSize:'0.9375rem', fontWeight:600, fontFamily:T.sans, background:T.surface2, outline:'none', textAlign:'right', boxSizing:'border-box', color:T.ink };

        return (
            <>
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
                    <div>Rep</div><div>{quotaMode==='annual'?'Annual Quota':'Total Quota'}</div><div>Attainment</div>
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
                                    const rWon = (opportunities||[]).filter(o=>o.stage==='Closed Won'&&(o.salesRep===u.name||o.assignedTo===u.name)).reduce((s,o)=>s+(parseFloat(o.arr)||0),0);
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
                        const rWon=(opportunities||[]).filter(o=>o.stage==='Closed Won'&&(o.salesRep===u.name||o.assignedTo===u.name)).reduce((s,o)=>s+(parseFloat(o.arr)||0),0);
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
                        {((settings.quotaData||{}).commissionTiers||[]).map((tier,idx) => (
                            <div key={idx} style={{ display:'flex', gap:8, marginBottom:8, alignItems:'center', padding:'8px 10px', background:T.surface2, borderRadius:T.r, border:`1px solid ${T.border}` }}>
                                {['minPercent','maxPercent','rate'].map((field,fi) => (
                                    <input key={fi} type="number" value={field==='maxPercent'&&tier.maxPercent>=999?'':tier[field]} placeholder={field==='maxPercent'?'∞':field==='rate'?'%':'%'}
                                        onChange={e => { const t=[...(settings.quotaData||{}).commissionTiers||[]]; t[idx]={...t[idx],[field]:parseFloat(e.target.value)||(field==='maxPercent'?999:0)}; setSettings(prev=>({...prev,quotaData:{...prev.quotaData,commissionTiers:t}})); }}
                                        style={{ width:55, padding:'3px 6px', border:`1.5px solid ${T.border}`, borderRadius:T.r, fontSize:11, textAlign:'center', fontFamily:T.sans, background:T.surface, outline:'none', color:T.ink }}
                                        onFocus={e=>e.target.style.borderColor=T.info} onBlur={e=>e.target.style.borderColor=T.border} />
                                ))}
                                <span style={{ fontSize:10, color:T.inkMuted, fontWeight:600 }}>% rate</span>
                                {((settings.quotaData||{}).commissionTiers||[]).length>1 && (
                                    <button onClick={()=>setSettings(prev=>({...prev,quotaData:{...prev.quotaData,commissionTiers:(prev.quotaData||{}).commissionTiers.filter((_,i)=>i!==idx)}}))} style={{ background:'none', border:'none', color:T.danger, cursor:'pointer', fontSize:14, padding:'0', marginLeft:'auto' }}>×</button>
                                )}
                            </div>
                        ))}
                        <button onClick={()=>setSettings(prev=>({...prev,quotaData:{...prev.quotaData,commissionTiers:[...((prev.quotaData||{}).commissionTiers||[]),{minPercent:0,maxPercent:999,rate:0}]}}))}
                            style={{ marginTop:4, background:T.surface2, border:`1.5px dashed ${T.border}`, borderRadius:T.r, padding:'6px 12px', cursor:'pointer', fontSize:11, fontWeight:700, color:T.inkMid, fontFamily:T.sans, width:'100%' }}>
                            + Add Tier
                        </button>
                    </div>
                </div>

                {/* SPIFF Board */}
                <div style={smCard2}>
                    <div style={{ ...cardHdr }}>
                        <div>
                            <div style={eyebrow}>SPIFF Board</div>
                            <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>One-time incentive bonuses</div>
                        </div>
                        <button onClick={()=>setSettings(prev=>({...prev,spiffs:[...(prev.spiffs||[]),{id:'spiff_'+Date.now(),name:'',amount:'',type:'flat',condition:'',active:true}]}))}
                            style={{ padding:'4px 10px', background:T.ink, color:T.surface, border:'none', borderRadius:T.r, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:T.sans }}>+ Add SPIFF</button>
                    </div>
                    <div style={{ padding:'12px 16px' }}>
                        {(settings.spiffs||[]).length === 0
                            ? <div style={{ textAlign:'center', padding:'1.5rem', color:T.inkMuted, fontSize:11, fontFamily:T.sans }}>No SPIFFs defined yet.</div>
                            : (settings.spiffs||[]).map((spiff,si) => (
                                <div key={spiff.id} style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:T.r, padding:'8px 10px', marginBottom:8 }}>
                                    <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
                                        <input type="text" value={spiff.name} placeholder="SPIFF name"
                                            onChange={e=>setSettings(prev=>({...prev,spiffs:(prev.spiffs||[]).map((s,i)=>i===si?{...s,name:e.target.value}:s)}))}
                                            style={{ flex:2, minWidth:140, padding:'4px 8px', border:`1.5px solid ${T.border}`, borderRadius:T.r, fontSize:11, fontFamily:T.sans, background:T.surface, outline:'none', color:T.ink }}
                                            onFocus={e=>e.target.style.borderColor=T.info} onBlur={e=>e.target.style.borderColor=T.border} />
                                        <select value={spiff.type} onChange={e=>setSettings(prev=>({...prev,spiffs:(prev.spiffs||[]).map((s,i)=>i===si?{...s,type:e.target.value}:s)}))}
                                            style={{ padding:'4px 6px', border:`1.5px solid ${T.border}`, borderRadius:T.r, fontSize:11, fontFamily:T.sans, background:T.surface, cursor:'pointer', outline:'none', color:T.ink }}>
                                            <option value="flat">Flat $</option><option value="pct">% ARR</option><option value="multiplier">Multiplier</option>
                                        </select>
                                        <input type="number" value={spiff.amount} placeholder="0"
                                            onChange={e=>setSettings(prev=>({...prev,spiffs:(prev.spiffs||[]).map((s,i)=>i===si?{...s,amount:e.target.value}:s)}))}
                                            style={{ width:70, padding:'4px 6px', border:`1.5px solid ${T.border}`, borderRadius:T.r, fontSize:11, fontFamily:T.sans, background:T.surface, textAlign:'right', outline:'none', color:T.ink }}
                                            onFocus={e=>e.target.style.borderColor=T.info} onBlur={e=>e.target.style.borderColor=T.border} />
                                        <label style={{ display:'flex', alignItems:'center', gap:3, cursor:'pointer' }}>
                                            <input type="checkbox" checked={!!spiff.active} onChange={e=>setSettings(prev=>({...prev,spiffs:(prev.spiffs||[]).map((s,i)=>i===si?{...s,active:e.target.checked}:s)}))} />
                                            <span style={{ fontSize:10, color:T.inkMid, fontFamily:T.sans }}>Active</span>
                                        </label>
                                        <button onClick={()=>showConfirm(`Remove SPIFF "${spiff.name||'this SPIFF'}"?`,()=>setSettings(prev=>({...prev,spiffs:(prev.spiffs||[]).filter((_,i)=>i!==si)})))}
                                            style={{ background:'none', border:'none', color:T.danger, cursor:'pointer', fontSize:14, marginLeft:'auto' }}>×</button>
                                    </div>
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
                                        <button onClick={async()=>{ const u={...claim,status:'approved',approvedAt:new Date().toISOString(),approvedBy:currentUser}; await dbFetch('/.netlify/functions/spiff-claims',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(u)}).catch(console.error); setSpiffClaims(prev=>prev.map(c=>c.id===claim.id?u:c)); }}
                                            style={{ padding:'2px 8px', background:T.ok, color:'#fff', border:'none', borderRadius:T.r, fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:T.sans }}>✓ Approve</button>
                                        <button onClick={async()=>{ const u={...claim,status:'rejected',approvedAt:new Date().toISOString(),approvedBy:currentUser}; await dbFetch('/.netlify/functions/spiff-claims',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(u)}).catch(console.error); setSpiffClaims(prev=>prev.map(c=>c.id===claim.id?u:c)); }}
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
    };

    return (
        <div className="tab-page" style={{ fontFamily:T.sans }}>
            {/* Header */}
            <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', paddingBottom:12 }}>
                <div>
                    <div style={{ fontSize:28, fontFamily:T.serif, fontStyle:'italic', fontWeight:300, letterSpacing:-0.8, color:T.ink, lineHeight:1, marginBottom:5 }}>Sales Manager</div>
                    <div style={{ fontSize:12, color:T.inkMuted }}>Team forecast · {qLabel} · {weeksLeft} weeks remaining</div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                    <button style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 11px', background:'transparent', border:`1px solid ${T.border}`, color:T.inkMid, fontSize:12, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>This quarter</button>
                    <button style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 11px', background:'transparent', border:`1px solid ${T.border}`, color:T.inkMid, fontSize:12, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>All reps</button>
                    <button style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 11px', background:'transparent', border:`1px solid ${T.border}`, color:T.inkMid, fontSize:12, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>Export</button>
                </div>
            </div>

            <SubTabs />

            {subTab === 'forecast' && <ForecastTab />}
            {subTab === 'team'     && <TeamTab />}
            {subTab === 'audit'    && <AuditTab />}
            {subTab === 'admin'    && <AdminTab />}
        </div>
    );
}
