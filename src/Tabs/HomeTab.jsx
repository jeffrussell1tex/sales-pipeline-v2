import React, { useState } from 'react';
import { useApp } from '../AppContext';
import { useAuth } from '@clerk/clerk-react';
import ViewingBar from '../components/ui/ViewingBar';
import { dbFetch, waitForToken } from '../utils/storage';

// ─────────────────────────────────────────────────────────────
//  V1 Design tokens (local — mirrors src/design/tokens.jsx)
// ─────────────────────────────────────────────────────────────
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
    serif:        'Georgia, "Tiempos", serif',
    r:            3,
};

// Eyebrow label style
const eyebrow = (color) => ({
    fontSize: 10, fontWeight: 700, color: color || T.inkMuted,
    letterSpacing: 1, textTransform: 'uppercase', fontFamily: T.sans,
});

// Deterministic avatar color from name
const avatarBg = (name) => {
    const p = ['#9c6b4a','#7a5a3c','#5a6e5a','#6b5a7a','#8a5a5a','#5a7a8a','#7a6b5a','#4a6b5a'];
    let h = 0; for (let i = 0; i < (name||'').length; i++) h = (h * 31 + (name||'').charCodeAt(i)) | 0;
    return p[Math.abs(h) % p.length];
};

// ─────────────────────────────────────────────────────────────
//  Team Health Panel — manager/admin view
// ─────────────────────────────────────────────────────────────
function TeamHealthPanel({ opportunities, activities, tasks, settings, currentUser, userRole, compact = false, setActiveTab }) {
    const [sortBy, setSortBy] = React.useState('health');
    const today = new Date();

    const isAdmin   = userRole === 'Admin';
    const isManager = userRole === 'Manager';
    if (!isAdmin && !isManager) return null;

    const fmtArr = (v) => v >= 1000000 ? '$'+(v/1000000).toFixed(1)+'M' : v >= 1000 ? '$'+Math.round(v/1000)+'K' : '$'+(v||0).toLocaleString();
    const daysSince = (d) => d ? Math.floor((today - new Date(d+'T12:00:00'))/86400000) : null;

    const allUsers = (settings.users||[]).filter(u => u.name && u.userType !== 'ReadOnly');
    const currentUserObj = allUsers.find(u => u.name === currentUser);
    const allReps = allUsers.filter(u => u.userType === 'User');
    const visibleReps = isAdmin ? allReps : allReps.filter(u =>
        (currentUserObj?.teamId && u.teamId === currentUserObj.teamId) ||
        (currentUserObj?.team   && u.team   === currentUserObj.team)
    );

    const repStats = visibleReps.map(rep => {
        const repOpps    = (opportunities||[]).filter(o => o.salesRep === rep.name && !['Closed Won','Closed Lost'].includes(o.stage));
        const allRepOpps = (opportunities||[]).filter(o => o.salesRep === rep.name);
        const wonOpps    = allRepOpps.filter(o => o.stage === 'Closed Won');
        const lostOpps   = allRepOpps.filter(o => o.stage === 'Closed Lost');
        const closedTotal = wonOpps.length + lostOpps.length;
        const winRate    = closedTotal > 0 ? Math.round((wonOpps.length/closedTotal)*100) : null;

        const repActs    = (activities||[]).filter(a => a.salesRep === rep.name || a.author === rep.name);
        const lastActDate = repActs.sort((a,b) => (b.date||'').localeCompare(a.date||''))[0]?.date || null;
        const daysSinceAct = daysSince(lastActDate);

        const repTasks   = (tasks||[]).filter(t => t.assignedTo === rep.name);
        const overdueCount = repTasks.filter(t => {
            const due = t.dueDate || t.due;
            return !t.completed && t.status !== 'Completed' && due && new Date(due+'T12:00:00') < today;
        }).length;

        const pipelineArr = repOpps.reduce((s,o) => s+(parseFloat(o.arr)||0), 0);
        const dealCount   = repOpps.length;
        const quotaMode   = rep.quotaType || 'annual';
        const quota       = quotaMode === 'annual' ? (rep.annualQuota||0)/4 : ['q1','q2','q3','q4'].reduce((s,q) => s+(rep[q+'Quota']||0), 0)/4;
        const wonArr      = wonOpps.reduce((s,o) => s+(parseFloat(o.arr)||0), 0);
        const attainPct   = quota > 0 ? Math.round((wonArr/quota)*100) : null;
        const staleDeals  = repOpps.filter(o => {
            const lastOppAct = (activities||[]).filter(a => a.opportunityId === o.id).sort((a,b) => (b.date||'').localeCompare(a.date||''))[0];
            const ds = daysSince(lastOppAct?.date || o.createdDate);
            return ds !== null && ds >= 14;
        }).length;

        let score = 100;
        if      (daysSinceAct === null) score -= 30;
        else if (daysSinceAct >= 21)    score -= 30;
        else if (daysSinceAct >= 14)    score -= 20;
        else if (daysSinceAct >= 7)     score -= 10;
        score -= Math.min(25, staleDeals * 8);
        score -= Math.min(20, overdueCount * 5);
        if      (attainPct === null)    score -= 10;
        else if (attainPct < 25)        score -= 25;
        else if (attainPct < 50)        score -= 15;
        else if (attainPct < 75)        score -= 5;
        score = Math.max(0, Math.round(score));

        const statusColor = score >= 65 ? T.ok   : score >= 40 ? T.warn   : T.danger;
        const statusBg    = score >= 65 ? 'rgba(77,107,61,0.08)'  : score >= 40 ? 'rgba(184,115,51,0.08)' : 'rgba(156,58,46,0.08)';
        const statusText  = score >= 65 ? '#2e4a24' : score >= 40 ? '#6b4820' : '#6b2020';
        const statusLabel = score >= 65 ? (score >= 80 ? 'Top performer' : 'On track') : (score >= 40 ? (staleDeals > 0 ? `${staleDeals} stale deal${staleDeals>1?'s':''}` : 'Needs attention') : 'Needs coaching');
        const statusSub   = score >= 65 ? (winRate !== null ? `${winRate}% win rate` : `${dealCount} active deals`) : (overdueCount > 0 ? `${overdueCount} overdue task${overdueCount>1?'s':''}` : daysSinceAct !== null ? `${daysSinceAct}d since last activity` : 'No activities logged');
        const initials    = (rep.name||'').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
        return { rep, score, statusColor, statusBg, statusText, statusLabel, statusSub, pipelineArr, dealCount, daysSinceAct, overdueCount, attainPct, winRate, staleDeals, initials };
    });

    const sortFn = (a, b) => sortBy === 'health' ? a.score - b.score : sortBy === 'arr' ? b.pipelineArr - a.pipelineArr : (b.attainPct||0) - (a.attainPct||0);
    const teams = {};
    repStats.forEach(rs => { const t = rs.rep.team || 'Unassigned'; if (!teams[t]) teams[t] = []; teams[t].push(rs); });
    Object.values(teams).forEach(arr => arr.sort(sortFn));
    const teamList = Object.entries(teams);

    // Mini SVG ring (no external dep)
    const Ring = ({ score, size = 48, stroke = 4, color }) => {
        const r = (size/2) - stroke;
        const circ = 2 * Math.PI * r;
        const dash = (score/100) * circ;
        return (
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink:0 }}>
                <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={T.border} strokeWidth={stroke}/>
                <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
                    strokeDasharray={`${dash} ${circ}`} strokeDashoffset={circ*0.25} strokeLinecap="round"/>
                <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
                    style={{ fontSize: size < 40 ? '10px' : '12px', fontWeight:'700', fill:color, fontFamily:'inherit' }}>
                    {score}
                </text>
            </svg>
        );
    };

    if (compact) {
        const allSorted = [...repStats].sort(sortFn);
        const totalArr  = repStats.reduce((s,r) => s+r.pipelineArr, 0);
        const atRisk    = repStats.filter(r => r.score < 40).length;

        const BENCHMARK_WIN_RATE = 45;
        const BENCHMARK_ACT_DAYS = 7;
        const repsWithWinRate  = repStats.filter(r => r.winRate !== null);
        const teamAvgWinRate   = repsWithWinRate.length > 0 ? Math.round(repsWithWinRate.reduce((s,r)=>s+r.winRate,0)/repsWithWinRate.length) : null;
        const repsWithActivity = repStats.filter(r => r.daysSinceAct !== null);
        const teamAvgActDays   = repsWithActivity.length > 0 ? Math.round(repsWithActivity.reduce((s,r)=>s+r.daysSinceAct,0)/repsWithActivity.length) : null;
        const repsWithAttain   = repStats.filter(r => r.attainPct !== null);
        const teamAvgAttain    = repsWithAttain.length > 0 ? Math.round(repsWithAttain.reduce((s,r)=>s+r.attainPct,0)/repsWithAttain.length) : null;
        const staleDealReps    = repStats.filter(r => r.staleDeals > 0);
        const topPerformer     = repStats.length > 0 ? [...repStats].sort((a,b) => b.score - a.score)[0] : null;
        const bottomRep        = repStats.length > 0 ? [...repStats].sort((a,b) => a.score - b.score)[0] : null;
        const scoreGap         = (topPerformer && bottomRep && repStats.length > 1) ? topPerformer.score - bottomRep.score : 0;

        const teamInsights = [];
        if (teamAvgWinRate !== null) {
            if (teamAvgWinRate < BENCHMARK_WIN_RATE) {
                teamInsights.push({ type:'warning', text:`Your team averages a ${teamAvgWinRate}% win rate vs the ${BENCHMARK_WIN_RATE}% benchmark. Focus on discovery quality and tighter qualification to move the needle.` });
            } else {
                teamInsights.push({ type:'success', text:`Team win rate is ${teamAvgWinRate}% — ${teamAvgWinRate - BENCHMARK_WIN_RATE}pts above the ${BENCHMARK_WIN_RATE}% benchmark. Strong qualification process; now focus on deal size and cycle speed.` });
            }
        }
        if (teamAvgActDays !== null && teamAvgActDays > BENCHMARK_ACT_DAYS) {
            teamInsights.push({ type:'warning', text:`Average ${teamAvgActDays} days since last activity across your team — above the ${BENCHMARK_ACT_DAYS}-day ideal. ${staleDealReps.length > 0 ? `${staleDealReps.length} rep${staleDealReps.length>1?'s have':' has'} stale deals.` : ''} Consider a team-wide activity sprint.` });
        }
        if (teamAvgAttain !== null && teamAvgAttain < 50) {
            teamInsights.push({ type:'warning', text:`Team quota attainment is averaging ${teamAvgAttain}%. Review pipeline coverage with reps below 25% — they may need deal strategy support or pipeline top-up.` });
        }
        if (teamAvgAttain !== null && teamAvgAttain >= 75) {
            teamInsights.push({ type:'success', text:`Team is at ${teamAvgAttain}% average quota attainment — on track for a strong quarter. Watch for end-of-quarter slip on deals in late stages.` });
        }
        if (scoreGap >= 40 && topPerformer && bottomRep) {
            teamInsights.push({ type:'info', text:`${scoreGap}-point health gap between ${topPerformer.rep.name} (${topPerformer.score}) and ${bottomRep.rep.name} (${bottomRep.score}). Consider peer shadowing or sharing ${topPerformer.rep.name}'s playbook.` });
        }
        const shownInsights = teamInsights.slice(0, 3);

        const hintCfg = {
            success: { bg:'rgba(77,107,61,0.07)', border:'rgba(77,107,61,0.25)', text:'#2e4a24', iconBg:T.ok,   icon:'★' },
            warning: { bg:'rgba(184,115,51,0.07)', border:'rgba(184,115,51,0.25)', text:'#6b4820', iconBg:T.warn, icon:'!' },
            info:    { bg:'rgba(58,90,122,0.07)',  border:'rgba(58,90,122,0.25)',  text:'#1d3a58', iconBg:T.info, icon:'→' },
        };

        return (
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+1, overflow:'hidden' }}>
                <div style={{ padding:'0.875rem 1.25rem', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div>
                        <div style={eyebrow()}>Team pipeline health</div>
                        <div style={{ fontSize:'0.75rem', color:T.inkMuted, marginTop:'2px', fontFamily:T.sans }}>
                            {repStats.length} rep{repStats.length!==1?'s':''} · {fmtArr(totalArr)} pipeline
                            {atRisk > 0 && <span style={{ marginLeft:'0.5rem', color:T.danger, fontWeight:'600' }}>· {atRisk} need{atRisk===1?'s':''} attention</span>}
                        </div>
                    </div>
                    {setActiveTab && (
                        <button onClick={() => setActiveTab('salesManager')}
                            style={{ fontSize:'0.75rem', padding:'4px 12px', border:`1px solid ${T.border}`, borderRadius:T.r, background:'transparent', color:T.inkMid, cursor:'pointer', fontFamily:T.sans }}>
                            View detail →
                        </button>
                    )}
                </div>
                {/* Rep strip */}
                <div style={{ padding:'0.875rem 1.25rem', display:'flex', gap:'8px', overflowX:'auto' }}>
                    {allSorted.map(rs => (
                        <div key={rs.rep.id} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'8px 12px', border:`1px solid ${T.border}`, borderLeft:`3px solid ${rs.statusColor}`, borderRadius:`0 ${T.r}px ${T.r}px 0`, background:T.bg, flexShrink:0, minWidth:'145px' }}>
                            <Ring score={rs.score} size={36} stroke={3} color={rs.statusColor} />
                            <div style={{ minWidth:0 }}>
                                <div style={{ fontSize:'12px', fontWeight:'600', color:T.ink, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'90px', fontFamily:T.sans }}>{rs.rep.name}</div>
                                <div style={{ fontSize:'11px', color:T.inkMid, fontFamily:T.sans }}>{fmtArr(rs.pipelineArr)} · {rs.dealCount} deals</div>
                                <div style={{ fontSize:'10px', color:rs.statusColor, fontWeight:'600', marginTop:'1px', fontFamily:T.sans }}>{rs.statusLabel}</div>
                            </div>
                        </div>
                    ))}
                </div>
                {/* Coaching insights */}
                {shownInsights.length > 0 && (
                    <div style={{ padding:'0 1.25rem 1rem', borderTop:`1px solid ${T.border}`, paddingTop:'0.75rem' }}>
                        <div style={{ ...eyebrow(), marginBottom:'6px' }}>Team coaching insights</div>
                        <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                            {shownInsights.map((hint, i) => {
                                const hc = hintCfg[hint.type] || hintCfg.info;
                                return (
                                    <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:'10px', padding:'10px 12px', background:hc.bg, border:`1px solid ${hc.border}`, borderRadius:T.r }}>
                                        <div style={{ width:'20px', height:'20px', borderRadius:'50%', background:hc.iconBg, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.6875rem', fontWeight:'700', flexShrink:0, fontFamily:T.sans }}>{hc.icon}</div>
                                        <div style={{ fontSize:'0.8125rem', color:hc.text, lineHeight:1.5, fontFamily:T.sans }}>{hint.text}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Full view
    return (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+1, overflow:'hidden' }}>
            <div style={{ padding:'0.875rem 1.25rem', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'0.5rem' }}>
                <div>
                    <div style={eyebrow()}>Team pipeline health</div>
                    <div style={{ fontSize:'0.75rem', color:T.inkMuted, marginTop:'2px', fontFamily:T.sans }}>Sorted by {sortBy === 'health' ? 'health score · worst first' : sortBy === 'arr' ? 'pipeline ARR · highest first' : 'quota attainment · highest first'}</div>
                </div>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                    style={{ fontSize:'0.75rem', padding:'0.3rem 1.5rem 0.3rem 0.625rem', border:`1px solid ${T.border}`, borderRadius:T.r, background:T.bg, color:T.inkMid, cursor:'pointer', fontFamily:T.sans }}>
                    <option value="health">Sort: Health score</option>
                    <option value="arr">Sort: Pipeline Revenue</option>
                    <option value="quota">Sort: Quota attainment</option>
                </select>
            </div>
            <div style={{ padding:'1.25rem' }}>
                {teamList.map(([teamName, reps], ti) => {
                    const teamArr   = reps.reduce((s,r) => s+r.pipelineArr, 0);
                    const avgHealth = reps.length ? Math.round(reps.reduce((s,r) => s+r.score, 0)/reps.length) : 0;
                    return (
                        <div key={teamName} style={{ marginBottom: ti < teamList.length-1 ? '1.5rem' : 0 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px' }}>
                                <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:T.gold, flexShrink:0 }}/>
                                <div style={{ fontSize:'0.8125rem', fontWeight:'700', color:T.ink, fontFamily:T.sans }}>{teamName}</div>
                                <div style={{ fontSize:'0.75rem', color:T.inkMuted, fontFamily:T.sans }}>{reps.length} rep{reps.length!==1?'s':''} · {fmtArr(teamArr)} pipeline · avg health {avgHealth}</div>
                            </div>
                            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:'10px' }}>
                                {reps.map(rs => (
                                    <div key={rs.rep.id} style={{ background:T.surface, border:`1px solid ${T.border}`, borderLeft:`3px solid ${rs.statusColor}`, borderRadius:`0 ${T.r}px ${T.r}px 0`, padding:'14px' }}>
                                        <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'12px' }}>
                                            <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:avatarBg(rs.rep.name), display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', fontWeight:'700', color:'#fef4e6', flexShrink:0 }}>{rs.initials}</div>
                                            <div style={{ flex:1, minWidth:0 }}>
                                                <div style={{ fontSize:'13px', fontWeight:'600', color:T.ink, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', fontFamily:T.sans }}>{rs.rep.name}</div>
                                                <div style={{ fontSize:'11px', color:T.inkMuted, fontFamily:T.sans }}>{rs.rep.territory || rs.rep.team || 'Sales Rep'}</div>
                                            </div>
                                            <Ring score={rs.score} size={48} stroke={4} color={rs.statusColor} />
                                        </div>
                                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px' }}>
                                            {[
                                                { val: fmtArr(rs.pipelineArr), lbl: 'Pipeline Rev.', danger: rs.pipelineArr === 0 },
                                                { val: rs.dealCount, lbl: 'Active deals', danger: rs.dealCount === 0 },
                                                { val: rs.daysSinceAct !== null ? rs.daysSinceAct+'d' : '—', lbl: 'Last activity', danger: rs.daysSinceAct === null || rs.daysSinceAct >= 14, warn: rs.daysSinceAct !== null && rs.daysSinceAct >= 7 && rs.daysSinceAct < 14 },
                                                { val: rs.overdueCount, lbl: 'Overdue tasks', danger: rs.overdueCount >= 3, warn: rs.overdueCount >= 1 && rs.overdueCount < 3 },
                                            ].map(({ val, lbl, danger, warn }) => (
                                                <div key={lbl} style={{ background:T.bg, borderRadius:T.r, padding:'6px 8px' }}>
                                                    <div style={{ fontSize:'13px', fontWeight:'600', color: danger ? T.danger : warn ? T.warn : T.ink, fontFamily:T.sans }}>{val}</div>
                                                    <div style={{ fontSize:'10px', color:T.inkMuted, marginTop:'1px', fontFamily:T.sans }}>{lbl}</div>
                                                </div>
                                            ))}
                                            <div style={{ gridColumn:'span 2', background:T.bg, borderRadius:T.r, padding:'6px 8px' }}>
                                                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'4px' }}>
                                                    <div style={{ fontSize:'10px', color:T.inkMuted, fontFamily:T.sans }}>Quota attainment</div>
                                                    <div style={{ fontSize:'12px', fontWeight:'600', fontFamily:T.sans, color: rs.attainPct === null ? T.inkMuted : rs.attainPct >= 75 ? T.ok : rs.attainPct >= 40 ? T.warn : T.danger }}>{rs.attainPct !== null ? rs.attainPct+'%' : '—'}</div>
                                                </div>
                                                <div style={{ height:'3px', background:T.border, borderRadius:'2px' }}>
                                                    <div style={{ height:'100%', width:Math.min(rs.attainPct||0, 100)+'%', background: (rs.attainPct||0) >= 75 ? T.ok : (rs.attainPct||0) >= 40 ? T.warn : T.danger, borderRadius:'2px' }}/>
                                                </div>
                                            </div>
                                            <div style={{ background:T.bg, borderRadius:T.r, padding:'6px 8px' }}>
                                                <div style={{ fontSize:'13px', fontWeight:'600', color: rs.winRate === null ? T.inkMuted : rs.winRate >= 50 ? T.ok : T.ink, fontFamily:T.sans }}>{rs.winRate !== null ? rs.winRate+'%' : '—'}</div>
                                                <div style={{ fontSize:'10px', color:T.inkMuted, marginTop:'1px', fontFamily:T.sans }}>Win rate</div>
                                            </div>
                                            <div style={{ background:rs.statusBg, borderRadius:T.r, padding:'6px 8px' }}>
                                                <div style={{ fontSize:'11px', fontWeight:'600', color:rs.statusText, fontFamily:T.sans }}>{rs.statusLabel}</div>
                                                <div style={{ fontSize:'10px', color:rs.statusText, opacity:0.75, marginTop:'1px', fontFamily:T.sans }}>{rs.statusSub}</div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
//  Recommended Actions Panel
// ─────────────────────────────────────────────────────────────
function RecommendedActions({ opportunities, activities, tasks, settings, currentUser, userRole, isManager, isAdmin, canSeeAll, stages, setEditingOpp, setShowModal, setEditingTask, setShowTaskModal, setActiveTab }) {
    const [filter, setFilter] = React.useState('all');
    const [dismissed, setDismissed] = React.useState(new Set());
    const [actionRate, setActionRate] = React.useState(null);
    const [logLoaded, setLogLoaded] = React.useState(false);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const fmtCurrency = (v) => v >= 1000000 ? '$' + (v/1000000).toFixed(1) + 'M' : v >= 1000 ? '$' + Math.round(v/1000) + 'K' : '$' + (v||0).toLocaleString();
    const daysSince = (dateStr) => dateStr ? Math.floor((today - new Date(dateStr + 'T12:00:00')) / 86400000) : null;
    const daysBetween = (a, b) => Math.floor((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);

    React.useEffect(() => {
        if (logLoaded) return;
        setLogLoaded(true);
        const run = async () => {
            try {
                await waitForToken();
                await dbFetch(`/.netlify/functions/recommendation-log?rep=${encodeURIComponent(currentUser)}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                });
                const res = await dbFetch(`/.netlify/functions/recommendation-log?rep=${encodeURIComponent(currentUser)}&days=30`);
                const data = await res.json();
                if (data?.summary && data.summary.total > 0) {
                    setActionRate({
                        resolved: data.summary.resolved, total: data.summary.total,
                        rate: data.summary.resolveRate, avgDays: data.summary.avgDays,
                        byType: data.summary.byType || {},
                    });
                }
            } catch (err) { console.warn('recommendation-log load error:', err.message); }
        };
        run();
    }, [currentUser]);

    const logDismiss = async (item) => {
        try {
            await dbFetch('/.netlify/functions/recommendation-log', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: 'rec_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
                    repName: currentUser,
                    actionType: item.cat === 'tasks' ? 'task' : item.id.split('-')[0],
                    opportunityId: item.opp?.id || (item.cat === 'tasks' ? item.taskId : null),
                    dealName: item.opp ? (item.opp.opportunityName || item.opp.account) : item.title,
                    arrAtRisk: item.arr || null, stage: item.stage || null, signal: item.reason || null,
                }),
            });
        } catch (err) { console.warn('Failed to log recommendation dismiss:', err.message); }
    };

    const dismiss = (item) => { setDismissed(d => new Set([...d, item.id])); logDismiss(item); };

    const avgDaysInStage = React.useMemo(() => {
        const map = {};
        (opportunities || []).filter(o => o.stage === 'Closed Won' && o.stageHistory?.length > 0).forEach(o => {
            const hist = o.stageHistory;
            hist.forEach((h, i) => {
                const from = i === 0 ? o.createdDate : hist[i-1]?.date;
                if (!from || !h.date) return;
                const days = daysBetween(from, h.date);
                if (!map[h.prevStage || h.stage]) map[h.prevStage || h.stage] = [];
                map[h.prevStage || h.stage].push(days);
            });
        });
        const result = {};
        Object.entries(map).forEach(([s, arr]) => { result[s] = Math.round(arr.reduce((a,b)=>a+b,0)/arr.length); });
        return result;
    }, [opportunities]);

    const myWonDeals   = (opportunities||[]).filter(o => o.stage === 'Closed Won' && o.salesRep === currentUser);
    const myTotalDeals = (opportunities||[]).filter(o => ['Closed Won','Closed Lost'].includes(o.stage) && o.salesRep === currentUser);
    const myWinRate    = myTotalDeals.length > 0 ? Math.round((myWonDeals.length / myTotalDeals.length) * 100) : null;
    const avgActsWon   = myWonDeals.length > 0
        ? Math.round(myWonDeals.reduce((sum, o) => sum + (activities||[]).filter(a => a.opportunityId === o.id).length, 0) / myWonDeals.length)
        : null;

    const actions = React.useMemo(() => {
        const items = [];
        const activeOpps = (opportunities||[]).filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');

        activeOpps.forEach(opp => {
            const oppActs = (activities||[]).filter(a => a.opportunityId === opp.id).sort((a,b) => b.date.localeCompare(a.date));
            const lastActDate = oppActs[0]?.date || opp.createdDate;
            const daysSinceContact = daysSince(lastActDate);
            const daysInStage = opp.stageChangedDate ? daysSince(opp.stageChangedDate) : daysSince(opp.createdDate);
            const avgForStage = avgDaysInStage[opp.stage] || null;
            const closeDate = opp.forecastedCloseDate;
            const daysToClose = closeDate ? daysBetween(todayStr, closeDate) : null;
            const arr = parseFloat(opp.arr) || 0;
            const name = opp.opportunityName || opp.account || 'Unnamed deal';

            if (daysSinceContact !== null && daysSinceContact >= 14 && !['Closed Won','Closed Lost'].includes(opp.stage)) {
                items.push({ id: `stale-${opp.id}`, priority: daysSinceContact >= 21 ? 'urgent' : 'warning', cat: 'urgent', title: `${name} — no contact in ${daysSinceContact} days`, reason: `Last activity was ${oppActs[0] ? oppActs[0].type.toLowerCase() : 'deal creation'}. Deals that go silent here rarely recover without outreach.`, tags: [{ label: `${daysSinceContact}d no contact`, type: daysSinceContact >= 21 ? 'red' : 'amber' }], arr, stage: opp.stage, action: 'Log a call', onClick: () => { setEditingOpp(opp); setShowModal(true); }, opp });
            }
            const stuckThreshold = avgForStage ? avgForStage * 2 : 21;
            if (daysInStage !== null && daysInStage >= stuckThreshold && daysInStage >= 14) {
                items.push({ id: `stuck-${opp.id}`, priority: 'warning', cat: 'urgent', title: `${name} stuck in ${opp.stage} for ${daysInStage} days`, reason: avgForStage ? `Your average time in ${opp.stage} is ${avgForStage} days. This deal is ${Math.round(daysInStage/avgForStage)}× over — consider advancing or disqualifying.` : `21+ days in the same stage with no progression. Review and decide next step.`, tags: [{ label: `${daysInStage}d in stage`, type: 'amber' }], arr, stage: opp.stage, action: 'Edit deal', onClick: () => { setEditingOpp(opp); setShowModal(true); }, opp });
            }
            if (daysToClose !== null && daysToClose < 0) {
                items.push({ id: `lapsed-${opp.id}`, priority: Math.abs(daysToClose) > 7 ? 'urgent' : 'warning', cat: 'urgent', title: `${name} — close date passed ${Math.abs(daysToClose)} day${Math.abs(daysToClose)!==1?'s':''} ago`, reason: `Forecasted close was ${new Date(closeDate + 'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}. Update the close date or move the stage to keep your pipeline accurate.`, tags: [{ label: `${Math.abs(daysToClose)}d overdue`, type: 'red' }], arr, stage: opp.stage, action: 'Update date', onClick: () => { setEditingOpp(opp); setShowModal(true); }, opp });
            }
            const contactNames = (opp.contacts||'').split(', ').filter(Boolean);
            const engagedContacts = new Set(oppActs.map(a => a.contactName).filter(Boolean));
            if (contactNames.length >= 2 && engagedContacts.size < 2 && arr >= 20000) {
                items.push({ id: `coverage-${opp.id}`, priority: 'info', cat: 'followup', title: `${name} — only ${engagedContacts.size} of ${contactNames.length} contacts engaged`, reason: `Multi-threaded deals close faster. Reach out to ${contactNames.filter(n => !engagedContacts.has(n.split(' (')[0]))[0]?.split(' (')[0] || 'additional stakeholders'} to broaden coverage.`, tags: [{ label: 'Low coverage', type: 'blue' }], arr, stage: opp.stage, action: 'View contacts', onClick: () => { setEditingOpp(opp); setShowModal(true); }, opp });
            }
            const createdDays = daysSince(opp.createdDate);
            const stageCount = (opp.stageHistory||[]).length;
            if (createdDays !== null && createdDays <= 14 && stageCount >= 2 && !['Negotiation/Review','Contracts','Closed Won','Closed Lost'].includes(opp.stage)) {
                items.push({ id: `velocity-${opp.id}`, priority: 'success', cat: 'momentum', title: `${name} is moving fast — ${stageCount} stages in ${createdDays} days`, reason: `Great velocity. Keep the momentum by scheduling the next step before the end of the week.`, tags: [{ label: 'High velocity', type: 'green' }], arr, stage: opp.stage, action: 'Add task', onClick: () => { setEditingTask({ relatedTo: opp.id, opportunityId: opp.id, type: 'Follow-up', dueDate: new Date(Date.now()+2*86400000).toISOString().split('T')[0] }); setShowTaskModal(true); }, opp });
            }
        });

        (tasks||[]).filter(t => {
            const due = t.dueDate || t.due;
            const done = t.status === 'Completed' || t.completed;
            return !done && due && new Date(due + 'T12:00:00') < today;
        }).slice(0, 3).forEach(task => {
            const daysOver = daysSince(task.dueDate || task.due);
            items.push({ id: `task-${task.id}`, priority: daysOver >= 3 ? 'urgent' : 'warning', cat: 'tasks', title: `Overdue task: "${task.title}"`, reason: `Due ${daysOver} day${daysOver!==1?'s':''} ago. Complete or reschedule to keep your pipeline clean.`, tags: [{ label: `${daysOver}d overdue`, type: daysOver >= 3 ? 'red' : 'amber' }], arr: null, stage: null, action: 'View task', onClick: () => { setEditingTask(task); setShowTaskModal(true); } });
        });

        const order = { urgent: 0, warning: 1, info: 2, tasks: 3, followup: 4, momentum: 5 };
        return items.filter(a => !dismissed.has(a.id)).sort((a, b) => (order[a.cat]||9) - (order[b.cat]||9) || (b.arr||0) - (a.arr||0));
    }, [opportunities, activities, tasks, dismissed, avgDaysInStage]);

    const coachingHints = React.useMemo(() => {
        const hints = [];
        if (myWinRate !== null && myWinRate < 40) hints.push({ type: 'info', text: `Your win rate is ${myWinRate}%. Top performers in similar roles average 45–55%. Focus on qualifying harder at Discovery.` });
        if (myWinRate !== null && myWinRate >= 55) hints.push({ type: 'success', text: `Strong win rate at ${myWinRate}%. You're in the top tier — focus on deal size and pipeline volume to maximize impact.` });
        if (avgActsWon !== null && avgActsWon > 0) {
            const activeWithFewActs = (opportunities||[]).filter(o => {
                const n = (activities||[]).filter(a => a.opportunityId === o.id).length;
                return !['Closed Won','Closed Lost'].includes(o.stage) && n < Math.ceil(avgActsWon * 0.4);
            });
            if (activeWithFewActs.length > 0) hints.push({ type: 'warning', text: `Your won deals average ${avgActsWon} activities. ${activeWithFewActs.length} active deal${activeWithFewActs.length>1?'s are':' is'} under-actioned — increase touchpoints to match your winning pattern.` });
        }
        const closingSoon = (opportunities||[]).filter(o => {
            const daysToClose = o.forecastedCloseDate ? daysBetween(todayStr, o.forecastedCloseDate) : null;
            const lastAct = (activities||[]).filter(a => a.opportunityId === o.id).sort((a,b) => b.date.localeCompare(a.date))[0];
            const daysSinceAct = lastAct ? daysSince(lastAct.date) : 99;
            return daysToClose !== null && daysToClose <= 14 && daysToClose >= 0 && daysSinceAct > 5 && !['Closed Won','Closed Lost'].includes(o.stage);
        });
        if (closingSoon.length > 0) hints.push({ type: 'warning', text: `${closingSoon.length} deal${closingSoon.length>1?'s are':' is'} closing within 14 days but haven't been contacted recently. Don't let these slip at the finish line.` });
        const thisWeek = new Date(); thisWeek.setDate(thisWeek.getDate() - 7);
        const weekActs = (activities||[]).filter(a => a.salesRep === currentUser && a.date >= thisWeek.toISOString().split('T')[0]);
        if (weekActs.length >= 5) hints.push({ type: 'success', text: `Great week — ${weekActs.length} activities logged in the last 7 days. Consistent activity is the #1 predictor of quota attainment.` });
        return hints.slice(0, 3);
    }, [opportunities, activities, myWinRate, avgActsWon]);

    // V1 color mappings for priority bars
    const priorityBar = { urgent: T.danger, warning: T.warn, info: T.info, success: T.ok, tasks: T.warn, followup: T.info, momentum: T.ok };
    const tagStyle = {
        red:   { background: 'rgba(156,58,46,0.1)',  color: T.danger },
        amber: { background: 'rgba(184,115,51,0.1)', color: T.warn },
        blue:  { background: 'rgba(58,90,122,0.1)',  color: T.info },
        green: { background: 'rgba(77,107,61,0.1)',  color: T.ok },
    };
    const hintConfig = {
        success: { bg:'rgba(77,107,61,0.07)',  border:'rgba(77,107,61,0.25)',  text:'#2e4a24', icon:'★', iconBg:T.ok },
        warning: { bg:'rgba(184,115,51,0.07)', border:'rgba(184,115,51,0.25)', text:'#6b4820', icon:'!', iconBg:T.warn },
        info:    { bg:'rgba(58,90,122,0.07)',  border:'rgba(58,90,122,0.25)',  text:'#1d3a58', icon:'→', iconBg:T.info },
    };

    const filterCats = { all: null, urgent: ['urgent','tasks'], followup: ['followup'], momentum: ['momentum'] };
    const filtered = filter === 'all' ? actions : actions.filter(a => (filterCats[filter]||[]).includes(a.cat));
    const urgentCount = actions.filter(a => ['urgent','tasks'].includes(a.cat)).length;
    const atRiskArr = actions.filter(a => a.arr && ['urgent','warning'].includes(a.priority)).reduce((s,a)=>s+(a.arr||0),0);

    if (actions.length === 0 && coachingHints.length === 0) return null;

    return (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+1, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '0.875rem 1.25rem', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <div style={eyebrow()}>Recommended actions</div>
                    <div style={{ fontSize: '0.75rem', color: T.inkMuted, marginTop: '2px', fontFamily: T.sans }}>
                        Personalized for {currentUser} · {actions.length} action{actions.length!==1?'s':''}
                        {atRiskArr > 0 && <span style={{ marginLeft: '0.5rem', color: T.danger, fontWeight: '600' }}>· {fmtCurrency(atRiskArr)} at risk</span>}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                    {[['all','All'], ['urgent','Urgent'], ['followup','Follow-up'], ['momentum','Wins']].map(([k,l]) => (
                        <button key={k} onClick={() => setFilter(k)}
                            style={{ fontSize: '0.6875rem', padding: '3px 10px', borderRadius: '999px', border: `1px solid ${filter===k ? T.borderStrong : T.border}`, cursor: 'pointer', fontFamily: T.sans, background: filter===k ? T.bg : 'transparent', color: filter===k ? T.ink : T.inkMuted, fontWeight: filter===k ? '700' : '400', transition: 'all .15s' }}>
                            {l}{k==='urgent' && urgentCount > 0 ? ` (${urgentCount})` : ''}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ padding: '0.75rem 1.25rem' }}>
                {filtered.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '1.5rem', color: T.inkMuted, fontSize: '0.8125rem', fontFamily: T.sans }}>No actions in this category right now.</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: coachingHints.length > 0 ? '1rem' : '0' }}>
                        {filtered.map(item => (
                            <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '10px 12px', border: `1px solid ${T.border}`, borderLeft: `3px solid ${priorityBar[item.cat]||T.info}`, borderRadius: `0 ${T.r}px ${T.r}px 0`, background: T.bg }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: T.ink, lineHeight: 1.4, fontFamily: T.sans }}>{item.title}</div>
                                    <div style={{ fontSize: '0.75rem', color: T.inkMid, lineHeight: 1.5, fontFamily: T.sans }}>{item.reason}</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                                        {item.tags?.map((tag, ti) => (
                                            <span key={ti} style={{ fontSize: '0.6875rem', padding: '1px 8px', borderRadius: T.r, fontWeight: '600', fontFamily: T.sans, ...tagStyle[tag.type] }}>{tag.label}</span>
                                        ))}
                                        {item.stage && <span style={{ fontSize: '0.6875rem', padding: '1px 8px', borderRadius: T.r, background: T.surface, border: `1px solid ${T.border}`, color: T.inkMuted, fontFamily: T.sans }}>{item.stage}</span>}
                                        {item.arr > 0 && <span style={{ fontSize: '0.6875rem', padding: '1px 8px', borderRadius: T.r, background: 'rgba(77,107,61,0.08)', color: T.ok, fontWeight: '600', fontFamily: T.sans }}>{fmtCurrency(item.arr)}</span>}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                    <button onClick={item.onClick}
                                        style={{ fontSize: '0.75rem', padding: '5px 12px', borderRadius: T.r, border: `1px solid ${T.border}`, background: T.surface, color: T.ink, cursor: 'pointer', fontFamily: T.sans, whiteSpace: 'nowrap', fontWeight: '600' }}>
                                        {item.action}
                                    </button>
                                    <button onClick={() => dismiss(item)} title="Dismiss"
                                        style={{ fontSize: '0.875rem', padding: '4px 6px', border: 'none', background: 'none', color: T.borderStrong, cursor: 'pointer', lineHeight: 1 }}
                                        onMouseEnter={e => e.currentTarget.style.color=T.inkMuted}
                                        onMouseLeave={e => e.currentTarget.style.color=T.borderStrong}>✕</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {coachingHints.length > 0 && (
                    <>
                        <div style={{ ...eyebrow(), marginBottom: '6px', marginTop: filtered.length > 0 ? '0.25rem' : 0 }}>Coaching insights</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {coachingHints.map((hint, i) => {
                                const hc = hintConfig[hint.type] || hintConfig.info;
                                return (
                                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', background: hc.bg, border: `1px solid ${hc.border}`, borderRadius: T.r }}>
                                        <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: hc.iconBg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6875rem', fontWeight: '700', flexShrink: 0, fontFamily: T.sans }}>{hc.icon}</div>
                                        <div style={{ fontSize: '0.8125rem', color: hc.text, lineHeight: 1.5, fontFamily: T.sans }}>{hint.text}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}

                {actionRate && actionRate.total >= 3 && (
                    <div style={{ marginTop: '0.875rem', paddingTop: '0.875rem', borderTop: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={eyebrow()}>Your action rate (30d)</div>
                        <div style={{ flex: 1, height: '4px', background: T.border, borderRadius: '2px', minWidth: '80px' }}>
                            <div style={{ height: '100%', width: actionRate.rate + '%', background: actionRate.rate >= 60 ? T.ok : actionRate.rate >= 35 ? T.warn : T.danger, borderRadius: '2px', transition: 'width 0.4s' }} />
                        </div>
                        <div style={{ fontSize: '0.8125rem', fontWeight: '600', fontFamily: T.sans, color: actionRate.rate >= 60 ? T.ok : actionRate.rate >= 35 ? T.warn : T.danger, flexShrink: 0 }}>{actionRate.rate}% resolved</div>
                        <div style={{ fontSize: '0.75rem', color: T.inkMuted, fontFamily: T.sans, flexShrink: 0 }}>
                            {actionRate.resolved} of {actionRate.total} acted on
                            {actionRate.avgDays && ` · avg ${actionRate.avgDays}d to resolve`}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
//  HomeTab — main export
// ─────────────────────────────────────────────────────────────
export default function HomeTab() {
    const {
        opportunities, accounts, contacts, tasks, activities, settings,
        currentUser, userRole, canSeeAll, isRepVisible,
        getStageColor, getQuarter, getQuarterLabel,
        calculateDealHealth, getKpiColor, showConfirm, softDelete, addAudit,
        visibleOpportunities, visibleTasks, activePipeline, allPipelines, stages,
        handleDelete, handleSave, handleCompleteTask, handleDeleteTask,
        calendarEvents, calendarConnected, calendarLoading, calendarError,
        fetchCalendarEvents, setActiveTab, isMobile,
        fetchLogFromCalEvents, logFromCalOpen, setLogFromCalOpen,
        logFromCalDateFrom, setLogFromCalDateFrom, logFromCalDateTo, setLogFromCalDateTo,
        logFromCalEvents, setLogFromCalEvents, logFromCalLoading, logFromCalError,
        loggedCalendarIds, setLoggedCalendarIds, logFromCalLinkingId, setLogFromCalLinkingId,
        logFromCalOppMap, setLogFromCalOppMap,
        meetingPrepOpen, setMeetingPrepOpen, meetingPrepEvent, setMeetingPrepEvent,
        meetingPrepOppId, setMeetingPrepOppId,
        viewingRep, setViewingRep, viewingTeam, setViewingTeam,
        viewingTerritory, setViewingTerritory,
        activePipelineId, setActivePipelineId,
        allRepNames, allTeamNames, allTerritoryNames, setUndoToast,
        setEditingOpp, setShowModal, setEditingTask, setShowTaskModal,
        setActivityInitialContext, setEditingActivity, setShowActivityModal,
        setShowOutlookImportModal,
    } = useApp();

    const isAdmin    = userRole === 'Admin';
    const isManager  = userRole === 'Manager';
    const isReadOnly = userRole === 'ReadOnly';
    const canEdit    = !isReadOnly;

    const { userId, orgId } = useAuth();

    const connectCalendar = (provider) => {
        if (!userId || !orgId) return;
        window.location.href = `/.netlify/functions/calendar-oauth-start?provider=${provider}&scope=user&userId=${userId}&orgId=${orgId}&userRole=${userRole || 'User'}`;
    };

    const totalARR  = visibleOpportunities.reduce((sum, opp) => sum + (parseFloat(opp.arr) || 0), 0);
    const activeOpps = visibleOpportunities.length;

    const [calView, setCalView] = useState('week');

    const handleAddNew   = () => { setEditingOpp(null); setShowModal(true); };
    const handleEdit     = (opp) => { setEditingOpp(opp); setShowModal(true); };
    const handleAddTask  = () => { setEditingTask(null); setShowTaskModal(true); };

    const quarterlyData = {};
    visibleOpportunities.forEach(opp => {
        if (opp.forecastedCloseDate) {
            const quarter      = getQuarter(opp.forecastedCloseDate);
            const quarterLabel = getQuarterLabel(quarter, opp.forecastedCloseDate);
            if (!quarterlyData[quarterLabel]) quarterlyData[quarterLabel] = 0;
            quarterlyData[quarterLabel] += (opp.arr + opp.implementationCost);
        }
    });
    const sortedQuarters = Object.entries(quarterlyData).sort((a, b) => {
        const dateA = visibleOpportunities.find(o => { const q = getQuarter(o.forecastedCloseDate); const ql = getQuarterLabel(q, o.forecastedCloseDate); return ql === a[0]; });
        const dateB = visibleOpportunities.find(o => { const q = getQuarter(o.forecastedCloseDate); const ql = getQuarterLabel(q, o.forecastedCloseDate); return ql === b[0]; });
        return new Date(dateA?.forecastedCloseDate) - new Date(dateB?.forecastedCloseDate);
    });
    const nextQuarter = sortedQuarters.length > 0 ? sortedQuarters[0] : null;

    // ── Derived values ──
    const todayStr  = new Date().toISOString().split('T')[0];
    const today12   = new Date(todayStr + 'T12:00:00');
    const firstName = currentUser ? currentUser.split(' ')[0] : 'there';
    const hour      = new Date().getHours();
    const greeting  = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const now       = new Date();
    const dayNames  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dateStr   = dayNames[now.getDay()] + ', ' + monthNames[now.getMonth()] + ' ' + now.getDate();

    const openTasks    = visibleTasks.filter(t => (t.status || (t.completed ? 'Completed' : 'Open')) !== 'Completed');
    const overdueTasks = openTasks.filter(t => t.dueDate && new Date(t.dueDate + 'T12:00:00') < today12);
    const todayTasks   = openTasks.filter(t => t.dueDate === todayStr);
    const sortedTasks  = [...openTasks].sort((a, b) => new Date(a.dueDate || '9999') - new Date(b.dueDate || '9999'));

    const closedWonARR  = visibleOpportunities.filter(o => o.stage === 'Closed Won').reduce((s,o) => s+(parseFloat(o.arr)||0), 0);
    const activeOppsArr = visibleOpportunities.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
    const pipelineARR   = activeOppsArr.reduce((s,o) => s+(parseFloat(o.arr)||0), 0);
    const fv            = nextQuarter ? nextQuarter[1] : 0;
    const fmtArr = v => v >= 1000000 ? '$'+(v/1000000).toFixed(1)+'M' : v >= 1000 ? '$'+Math.round(v/1000)+'K' : '$'+(v||0).toLocaleString();

    // Priority deals
    const priorityDeals = (() => {
        const scored = activeOppsArr.map(opp => {
            const oppActs = (activities||[]).filter(a => a.opportunityId === opp.id).sort((a,b) => (b.date||'').localeCompare(a.date||''));
            const lastAct = oppActs[0]?.date;
            const daysSinceAct = lastAct ? Math.floor((now - new Date(lastAct+'T12:00:00'))/86400000) : null;
            const daysToClose  = opp.forecastedCloseDate ? Math.floor((new Date(opp.forecastedCloseDate+'T12:00:00') - now)/86400000) : null;
            const health = calculateDealHealth ? calculateDealHealth(opp) : { score: 50 };
            let priority = 0, tag = '', tagColor = '';
            if (daysSinceAct !== null && daysSinceAct >= 14) { priority = 10 + daysSinceAct; tag = 'Stalled '+daysSinceAct+'d'; tagColor = T.danger; }
            else if (daysToClose !== null && daysToClose >= 0 && daysToClose <= 7) { priority = 9 + (7-daysToClose); tag = 'Closes in '+daysToClose+'d'; tagColor = T.warn; }
            else if (daysSinceAct === null) { priority = 8; tag = 'No activity'; tagColor = T.warn; }
            else if (health.score < 40) { priority = 7; tag = 'At risk'; tagColor = T.danger; }
            else { priority = 1; tag = 'Active'; tagColor = T.ok; }
            return { ...opp, priority, tag, tagColor, daysSinceAct, daysToClose, health };
        });
        return scored.sort((a,b) => b.priority - a.priority).slice(0,3);
    })();

    const myOpps          = visibleOpportunities.filter(o => !canSeeAll || !o.salesRep || o.salesRep === currentUser);
    const myActiveOpps    = myOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
    const myPipelineARR   = myActiveOpps.reduce((s,o) => s+(parseFloat(o.arr)||0), 0);
    const myClosedWonARR  = myOpps.filter(o => o.stage === 'Closed Won').reduce((s,o) => s+(parseFloat(o.arr)||0), 0);
    const myUserObj       = (settings?.users || []).find(u => u.name === currentUser);
    const myAnnualQuota   = myUserObj?.annualQuota || 0;

    const todayCalEvents = calendarConnected && calendarEvents
        ? calendarEvents.filter(ev => { const d = ev.start?.date || ev.start?.dateTime?.split('T')[0]; return d === todayStr; }).sort((a,b) => (a.start?.dateTime||'').localeCompare(b.start?.dateTime||''))
        : [];

    // "On your plate" sidebar list
    const plate = [];
    overdueTasks.forEach(t => plate.push({ type: 'task', urgency: 'overdue', label: t.title, sub: 'Overdue', color: T.danger, item: t }));
    todayTasks.filter(t => !overdueTasks.includes(t)).forEach(t => plate.push({ type: 'task', urgency: 'today', label: t.title, sub: 'Due today', color: T.warn, item: t }));
    todayCalEvents.forEach(ev => {
        const timeStr = ev.start?.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : 'All day';
        plate.push({ type: 'meeting', urgency: 'today', label: ev.summary, sub: timeStr, color: T.info, item: ev });
    });
    priorityDeals.filter(d => d.priority >= 7).forEach(d => plate.push({ type: 'deal', urgency: d.tagColor === T.danger ? 'overdue' : 'today', label: d.opportunityName || d.account, sub: d.tag, color: d.tagColor, item: d }));

    return (
        <div className="tab-page" style={{ gap: 0, padding: 0 }}>

            {/* ── Hero header ─────────────────────────────────────────── */}
            <div style={{ padding: '1.75rem 2rem 1.25rem', borderBottom: `1px solid ${T.border}`, background: T.surface }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div>
                        <div style={eyebrow(T.goldInk)}>{dateStr}</div>
                        {/* Serif italic greeting — V1 editorial signature */}
                        <div style={{ fontSize: '1.875rem', fontFamily: T.serif, fontStyle: 'italic', fontWeight: 300, color: T.ink, letterSpacing: '-0.5px', lineHeight: 1.15, margin: '0.35rem 0 0' }}>
                            {greeting},{' '}
                            <span style={{ fontWeight: 600 }}>{firstName}.</span>
                        </div>
                        <div style={{ fontSize: '0.875rem', color: T.inkMid, marginTop: '0.375rem', fontFamily: T.sans }}>
                            {overdueTasks.length > 0 && <span style={{ color: T.danger, fontWeight: '600' }}>{overdueTasks.length} task{overdueTasks.length>1?'s':''} overdue</span>}
                            {overdueTasks.length > 0 && priorityDeals.filter(d=>d.priority>=7).length > 0 && <span style={{ color: T.border }}> · </span>}
                            {priorityDeals.filter(d => d.priority >= 7).length > 0 && <span>{priorityDeals.filter(d => d.priority >= 7).length} deal{priorityDeals.filter(d=>d.priority>=7).length>1?'s':''} need attention</span>}
                            {(overdueTasks.length > 0 || priorityDeals.filter(d=>d.priority>=7).length > 0) && <span style={{ color: T.border }}> · </span>}
                            <span>Pipeline: {fmtArr(myPipelineARR)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Main layout: left sidebar + right content ───────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '260px 1fr', minHeight: '600px' }}>

                {/* ── Left sidebar ── */}
                <div style={{ borderRight: `1px solid ${T.border}`, padding: '1.25rem 1rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: T.bg }}>

                    {/* Today's focus */}
                    <div>
                        <div style={{ ...eyebrow(), marginBottom: '0.75rem' }}>Today's focus</div>
                        {plate.length === 0 ? (
                            <div style={{ fontSize: '0.8125rem', color: T.inkMuted, fontStyle: 'italic', padding: '0.5rem 0', fontFamily: T.sans }}>All clear — nothing urgent today</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                {plate.map((item, idx) => (
                                    <div key={idx}
                                        onClick={() => {
                                            if (item.type === 'task') { setEditingTask(item.item); setShowTaskModal(true); }
                                            else if (item.type === 'deal') { setEditingOpp(item.item); setShowModal(true); }
                                        }}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.45rem 0.625rem', borderRadius: T.r, cursor: item.type !== 'meeting' ? 'pointer' : 'default', transition: 'background 0.1s' }}
                                        onMouseEnter={e => { if (item.type !== 'meeting') e.currentTarget.style.background = T.surface2; }}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.8125rem', color: T.ink, fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: T.sans }}>{item.label}</div>
                                            <div style={{ fontSize: '0.6875rem', color: item.urgency === 'overdue' ? item.color : T.inkMuted, fontWeight: item.urgency === 'overdue' ? '600' : '400', fontFamily: T.sans }}>{item.sub}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Pipelines list */}
                    {allPipelines.length > 1 && (
                        <div>
                            <div style={{ ...eyebrow(), marginBottom: '0.625rem' }}>Pipelines</div>
                            {allPipelines.map(p => (
                                <div key={p.id} onClick={() => setActivePipelineId(p.id)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.625rem', borderRadius: T.r, cursor: 'pointer', marginBottom: '2px',
                                        background: p.id === activePipeline.id ? T.surface2 : 'transparent',
                                        fontWeight: p.id === activePipeline.id ? '700' : '400' }}
                                    onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                    onMouseLeave={e => e.currentTarget.style.background = p.id === activePipeline.id ? T.surface2 : 'transparent'}>
                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                                    <span style={{ fontSize: '0.8125rem', color: T.ink, fontFamily: T.sans }}>{p.name}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Quick log */}
                    {canEdit && (
                        <div>
                            <div style={{ ...eyebrow(), marginBottom: '0.625rem' }}>Quick log</div>
                            {[
                                { label: '+ Log a call',    fn: () => { setActivityInitialContext(null); setEditingActivity(null); setShowActivityModal(true); } },
                                { label: '+ Add activity',  fn: () => { setActivityInitialContext(null); setEditingActivity(null); setShowActivityModal(true); } },
                                { label: '+ New task',      fn: handleAddTask },
                            ].map(a => (
                                <button key={a.label} onClick={a.fn} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.3rem 0.625rem', background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.sans, fontSize: '0.8125rem', color: T.inkMid, borderRadius: T.r, transition: 'background 0.1s' }}
                                    onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    {a.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Right main content ── */}
                <div style={{ padding: '1.25rem 1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', overflowY: 'auto', background: T.bg }}>

                    {/* KPI strip — V1 left-border accent pattern */}
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, minmax(0,1fr))', gap: '0.75rem' }}>
                        {(() => {
                            const pipelineKpi = getKpiColor('totalPipelineARR', myPipelineARR, myAnnualQuota);
                            const forecastKpi = getKpiColor('nextQForecast',    fv,            myAnnualQuota);
                            const quotaKpi    = getKpiColor('quota',            myClosedWonARR, myAnnualQuota);
                            return [
                                { label: 'Pipeline Rev.',  value: fmtArr(myPipelineARR),   sub: myActiveOpps.length+' active deals',                                         accent: pipelineKpi.toleranceColor || T.info },
                                { label: 'Closed won',     value: fmtArr(myClosedWonARR),   sub: 'this period',                                                               accent: quotaKpi.toleranceColor    || T.ok   },
                                { label: 'Open tasks',     value: String(openTasks.length), sub: overdueTasks.length > 0 ? overdueTasks.length+' overdue' : 'all on track',   accent: overdueTasks.length > 0 ? T.danger : T.warn, subColor: overdueTasks.length > 0 ? T.danger : T.ok },
                                { label: nextQuarter ? nextQuarter[0]+' forecast' : 'Next qtr forecast', value: fmtArr(fv), sub: 'forecasted close',                         accent: forecastKpi.toleranceColor  || T.goldInk },
                            ];
                        })().map(kpi => (
                            <div key={kpi.label} style={{ background: T.surface, border: `1px solid ${T.border}`, borderLeft: `3px solid ${kpi.accent}`, borderRadius: T.r+1, padding: '0.875rem 1rem' }}>
                                <div style={{ ...eyebrow(kpi.accent), marginBottom: '0.3rem' }}>{kpi.label}</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: T.ink, letterSpacing: '-0.02em', lineHeight: 1, fontFamily: T.sans }}>{kpi.value}</div>
                                <div style={{ fontSize: '0.6875rem', color: kpi.subColor || T.inkMuted, marginTop: '0.25rem', fontWeight: kpi.subColor ? '600' : '400', fontFamily: T.sans }}>{kpi.sub}</div>
                            </div>
                        ))}
                    </div>

                    {/* Priority deals */}
                    {priorityDeals.length > 0 && (
                        <div>
                            <div style={{ ...eyebrow(), marginBottom: '0.625rem' }}>Priority deals — needs attention</div>
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0,1fr))', gap: '0.75rem' }}>
                                {priorityDeals.map(deal => {
                                    const sc = getStageColor ? getStageColor(deal.stage) : { text: T.inkMid };
                                    return (
                                        <div key={deal.id} onClick={() => { setEditingOpp(deal); setShowModal(true); }}
                                            style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+1, padding: '1rem', cursor: 'pointer', transition: 'all 0.15s', position: 'relative', overflow: 'hidden' }}
                                            onMouseEnter={e => { e.currentTarget.style.boxShadow=`0 2px 10px rgba(42,38,34,0.1)`; e.currentTarget.style.borderColor = T.borderStrong; }}
                                            onMouseLeave={e => { e.currentTarget.style.boxShadow='none'; e.currentTarget.style.borderColor = T.border; }}>
                                            {/* Top accent bar using stage color */}
                                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: deal.tagColor }} />
                                            <div style={{ fontSize: '0.5625rem', fontWeight: '700', padding: '2px 7px', borderRadius: T.r, background: deal.tagColor+'22', color: deal.tagColor, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'inline-block', marginBottom: '0.5rem', fontFamily: T.sans }}>{deal.tag}</div>
                                            <div style={{ fontWeight: '600', fontSize: '0.9375rem', color: T.ink, marginBottom: '0.2rem', lineHeight: 1.3, fontFamily: T.sans }}>{deal.opportunityName || deal.account}</div>
                                            <div style={{ fontSize: '0.75rem', color: T.inkMid, marginBottom: '0.75rem', fontFamily: T.sans }}>
                                                <span style={{ background: sc.text+'18', color: sc.text, padding: '1px 6px', borderRadius: T.r, fontWeight: '600', fontSize: '0.6875rem' }}>{deal.stage}</span>
                                                {deal.account && deal.opportunityName && <span style={{ marginLeft: '0.375rem' }}>{deal.account}</span>}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <span style={{ fontSize: '1.125rem', fontWeight: '700', color: T.ink, fontFamily: T.sans }}>{fmtArr(parseFloat(deal.arr)||0)}</span>
                                                <span style={{ fontSize: '0.75rem', color: T.goldInk, fontWeight: '600', fontFamily: T.sans }}>View deal →</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Tasks + Pipeline two-col */}
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0.75rem' }}>

                        {/* Tasks due today */}
                        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+1, overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1rem', borderBottom: `1px solid ${T.border}` }}>
                                <span style={{ fontWeight: '600', fontSize: '0.875rem', color: T.ink, fontFamily: T.sans }}>Tasks due today</span>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    {canEdit && <button onClick={handleAddTask} style={{ fontSize: '0.75rem', color: T.goldInk, background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.sans, fontWeight: '600' }}>+ Add task</button>}
                                    <button onClick={() => setActiveTab('tasks')} style={{ fontSize: '0.75rem', color: T.inkMuted, background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.sans }}>View all →</button>
                                </div>
                            </div>
                            {sortedTasks.slice(0,6).length === 0 ? (
                                <div style={{ padding: '2rem', textAlign: 'center', color: T.inkMuted, fontSize: '0.875rem', fontFamily: T.sans }}>No open tasks</div>
                            ) : (
                                <div>
                                    {sortedTasks.slice(0,6).map(task => {
                                        const isOvr   = task.dueDate && new Date(task.dueDate+'T12:00:00') < today12;
                                        const isToday = task.dueDate === todayStr;
                                        const dueLabel = isOvr ? 'Overdue' : isToday ? 'Today' : task.dueDate ? new Date(task.dueDate+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
                                        const dueColor = isOvr ? T.danger : isToday ? T.warn : T.inkMuted;
                                        return (
                                            <div key={task.id} onClick={() => { setEditingTask(task); setShowTaskModal(true); }}
                                                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 1rem', borderBottom: `1px solid ${T.bg}`, cursor: 'pointer' }}
                                                onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                <div style={{ width: '16px', height: '16px', borderRadius: T.r, border: `1.5px solid ${isOvr ? T.danger+'66' : T.borderStrong}`, flexShrink: 0 }} />
                                                <div style={{ flex: 1, fontSize: '0.8125rem', color: T.ink, lineHeight: 1.4, fontFamily: T.sans }}>{task.title}</div>
                                                {dueLabel && <div style={{ fontSize: '0.6875rem', fontWeight: '600', color: dueColor, flexShrink: 0, fontFamily: T.sans }}>{dueLabel}</div>}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* My pipeline */}
                        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+1, overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1rem', borderBottom: `1px solid ${T.border}` }}>
                                <span style={{ fontWeight: '600', fontSize: '0.875rem', color: T.ink, fontFamily: T.sans }}>My pipeline</span>
                                <button onClick={() => setActiveTab('pipeline')} style={{ fontSize: '0.75rem', color: T.inkMuted, background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.sans }}>View all →</button>
                            </div>
                            {myActiveOpps.length === 0 ? (
                                <div style={{ padding: '2rem', textAlign: 'center', color: T.inkMuted, fontSize: '0.875rem', fontFamily: T.sans }}>No active deals</div>
                            ) : (
                                <div>
                                    {myActiveOpps.slice(0,6).map(opp => {
                                        const sc = getStageColor ? getStageColor(opp.stage) : { text: T.inkMid };
                                        return (
                                            <div key={opp.id} onClick={() => { setEditingOpp(opp); setShowModal(true); }}
                                                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 1rem', borderBottom: `1px solid ${T.bg}`, cursor: 'pointer' }}
                                                onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                <div style={{ fontSize: '0.625rem', fontWeight: '700', padding: '2px 7px', borderRadius: T.r, background: sc.text+'18', color: sc.text, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.03em', minWidth: '80px', textAlign: 'center', fontFamily: T.sans }}>{opp.stage}</div>
                                                <div style={{ flex: 1, fontSize: '0.8125rem', color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: T.sans }}>{opp.opportunityName || opp.account}</div>
                                                <div style={{ fontSize: '0.8125rem', fontWeight: '700', color: T.ink, flexShrink: 0, fontFamily: T.sans }}>{fmtArr(parseFloat(opp.arr)||0)}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Calendar ── day/week toggle */}
                    {calendarConnected && (() => {
                        const _today    = new Date();
                        const _todayStr = _today.toISOString().split('T')[0];
                        const weekEvents = calendarEvents
                            ? [...calendarEvents].sort((a,b) => (a.start?.dateTime||a.start?.date||'').localeCompare(b.start?.dateTime||b.start?.date||''))
                            : [];
                        const eventsByDay = {};
                        weekEvents.forEach(ev => {
                            const d = ev.start?.date || ev.start?.dateTime?.split('T')[0];
                            if (!d) return;
                            if (!eventsByDay[d]) eventsByDay[d] = [];
                            eventsByDay[d].push(ev);
                        });
                        const sortedDays = Object.keys(eventsByDay).sort();
                        const _dayNames  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
                        const _monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                        const formatDayLabel = (ds) => {
                            const d = new Date(ds + 'T12:00:00');
                            if (ds === _todayStr) return 'Today';
                            const tomorrow = new Date(_today); tomorrow.setDate(_today.getDate() + 1);
                            if (ds === tomorrow.toISOString().split('T')[0]) return 'Tomorrow';
                            return _dayNames[d.getDay()] + ' ' + _monthNames[d.getMonth()] + ' ' + d.getDate();
                        };
                        const EventRow = ({ ev, idx, total, accentColor }) => {
                            const timeStr = ev.start?.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : 'All day';
                            return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 1rem', borderBottom: idx < total-1 ? `1px solid ${T.bg}` : 'none' }}>
                                    <div style={{ fontSize: '0.6875rem', color: T.inkMuted, width: '52px', flexShrink: 0, fontFamily: T.sans }}>{timeStr}</div>
                                    <div style={{ width: '3px', height: '28px', borderRadius: '2px', background: accentColor || T.info, flexShrink: 0 }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: T.sans }}>{ev.summary}</div>
                                        {ev.attendeeCount > 0 && <div style={{ fontSize: '0.6875rem', color: T.inkMuted, marginTop: '1px', fontFamily: T.sans }}>{ev.attendeeCount} attendee{ev.attendeeCount!==1?'s':''}</div>}
                                    </div>
                                </div>
                            );
                        };
                        const _todayCalEvents = weekEvents.filter(ev => { const d = ev.start?.date || ev.start?.dateTime?.split('T')[0]; return d === _todayStr; }).sort((a,b) => (a.start?.dateTime||'').localeCompare(b.start?.dateTime||''));
                        const totalCount = calView === 'day' ? _todayCalEvents.length : weekEvents.length;

                        return (
                            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+1, overflow: 'hidden' }}>
                                <div style={{ padding: '0.75rem 1rem', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span style={{ fontWeight: '600', fontSize: '0.875rem', color: T.ink, fontFamily: T.sans }}>{calView === 'day' ? "Today's meetings" : "This week"}</span>
                                        <span style={{ fontSize: '0.6875rem', color: T.inkMuted, fontFamily: T.sans }}>{totalCount} event{totalCount!==1?'s':''}</span>
                                    </div>
                                    {/* Day / Week toggle — V1 pill style */}
                                    <div style={{ display: 'flex', background: T.bg, borderRadius: T.r, padding: '2px', gap: '2px', border: `1px solid ${T.border}` }}>
                                        {['day','week'].map(v => (
                                            <button key={v} onClick={() => setCalView(v)} style={{
                                                padding: '0.2rem 0.625rem', borderRadius: T.r-1, border: 'none',
                                                background: calView === v ? T.ink : 'transparent',
                                                color: calView === v ? T.surface : T.inkMid,
                                                fontSize: '0.6875rem', fontWeight: '600', cursor: 'pointer',
                                                fontFamily: T.sans, textTransform: 'capitalize', transition: 'all 0.15s',
                                            }}>{v}</button>
                                        ))}
                                    </div>
                                </div>

                                {calView === 'day' && (
                                    _todayCalEvents.length === 0
                                        ? <div style={{ padding: '1.25rem', textAlign: 'center', color: T.inkMuted, fontSize: '0.8125rem', fontFamily: T.sans }}>No meetings today</div>
                                        : _todayCalEvents.map((ev, idx) => <EventRow key={ev.id||idx} ev={ev} idx={idx} total={_todayCalEvents.length} accentColor={T.info} />)
                                )}
                                {calView === 'week' && (
                                    sortedDays.length === 0
                                        ? <div style={{ padding: '1.25rem', textAlign: 'center', color: T.inkMuted, fontSize: '0.8125rem', fontFamily: T.sans }}>No events this week</div>
                                        : sortedDays.map((ds, di) => (
                                            <div key={ds}>
                                                <div style={{
                                                    padding: '0.375rem 1rem',
                                                    background: ds === _todayStr ? 'rgba(122,106,72,0.08)' : T.surface2,
                                                    borderBottom: `1px solid ${T.border}`,
                                                    borderTop: di > 0 ? `1px solid ${T.border}` : 'none',
                                                    fontSize: '0.6875rem', fontWeight: '700',
                                                    color: ds === _todayStr ? T.goldInk : T.inkMuted,
                                                    textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: T.sans,
                                                }}>
                                                    {formatDayLabel(ds)}
                                                </div>
                                                {eventsByDay[ds].map((ev, idx) => (
                                                    <EventRow key={ev.id||idx} ev={ev} idx={idx} total={eventsByDay[ds].length} accentColor={ds === _todayStr ? T.info : T.gold} />
                                                ))}
                                            </div>
                                        ))
                                )}
                            </div>
                        );
                    })()}

                    {/* Calendar connect prompt */}
                    {!calendarConnected && (
                        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+1, padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                            <div>
                                <div style={{ fontWeight: '600', color: T.ink, fontSize: '0.875rem', marginBottom: '0.2rem', fontFamily: T.sans }}>Connect your Google Calendar</div>
                                <div style={{ fontSize: '0.75rem', color: T.inkMuted, fontFamily: T.sans }}>See today's meetings alongside your pipeline</div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                                <button onClick={() => connectCalendar('google')}
                                    style={{ padding: '0.45rem 1rem', background: T.ink, color: T.surface, border: 'none', borderRadius: T.r, fontSize: '0.8125rem', fontWeight: '600', cursor: 'pointer', fontFamily: T.sans }}>
                                    Connect Google
                                </button>
                                <button onClick={() => connectCalendar('outlook')}
                                    style={{ padding: '0.45rem 1rem', background: T.surface2, color: T.inkMid, border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: '0.8125rem', fontWeight: '600', cursor: 'pointer', fontFamily: T.sans }}>
                                    Connect Outlook
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Team health (managers/admins) */}
                    {(isManager || isAdmin) && (
                        <TeamHealthPanel
                            opportunities={visibleOpportunities} activities={activities}
                            tasks={visibleTasks} settings={settings}
                            currentUser={currentUser} userRole={userRole}
                            compact={true} setActiveTab={setActiveTab}
                        />
                    )}

                    {/* Recommended actions */}
                    <RecommendedActions
                        opportunities={visibleOpportunities} activities={activities}
                        tasks={visibleTasks} settings={settings}
                        currentUser={currentUser} userRole={userRole}
                        isManager={isManager} isAdmin={isAdmin} canSeeAll={canSeeAll}
                        stages={stages} setEditingOpp={setEditingOpp} setShowModal={setShowModal}
                        setEditingTask={setEditingTask} setShowTaskModal={setShowTaskModal}
                        setActiveTab={setActiveTab}
                    />

                    {/* Multi-pipeline summary */}
                    {allPipelines.length > 1 && (() => {
                        const allVisibleOpps = canSeeAll ? (opportunities||[]) : (opportunities||[]).filter(o => !o.salesRep || o.salesRep === currentUser);
                        return (
                            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+1, overflow: 'hidden' }}>
                                <div style={{ padding: '0.875rem 1.5rem', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={eyebrow()}>All Pipelines</div>
                                    <span style={{ fontSize: '0.75rem', color: T.inkMuted, fontFamily: T.sans }}>Org total across all pipelines</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat('+allPipelines.length+', 1fr)', gap: 0 }}>
                                    {allPipelines.map((p, idx) => {
                                        const pOpps  = allVisibleOpps.filter(o => (o.pipelineId||'default') === p.id);
                                        const active = pOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
                                        const won    = pOpps.filter(o => o.stage === 'Closed Won');
                                        const pARR   = active.reduce((s,o) => s+(o.arr||0), 0);
                                        const wARR   = won.reduce((s,o) => s+(o.arr||0)+(o.implementationCost||0), 0);
                                        const isCurrent = p.id === activePipeline.id;
                                        return (
                                            <div key={p.id} onClick={() => setActivePipelineId(p.id)} style={{ padding: '1rem 1.5rem', cursor: 'pointer', transition: 'background 0.15s', borderRight: idx < allPipelines.length-1 ? `1px solid ${T.border}` : 'none', background: isCurrent ? T.surface2 : T.surface, borderTop: isCurrent ? `3px solid ${p.color}` : `3px solid transparent` }}
                                                onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = T.bg; }}
                                                onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = T.surface; }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: p.color }} />
                                                    <span style={{ fontWeight: '700', fontSize: '0.875rem', color: T.ink, fontFamily: T.sans }}>{p.name}</span>
                                                    {isCurrent && <span style={{ fontSize: '0.5625rem', fontWeight: '700', background: p.color, color: '#fff', padding: '0.0625rem 0.375rem', borderRadius: '999px', fontFamily: T.sans }}>ACTIVE</span>}
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                                    <div>
                                                        <div style={{ ...eyebrow(), marginBottom: '2px' }}>Active ARR</div>
                                                        <div style={{ fontSize: '1.125rem', fontWeight: '700', color: T.ink, fontFamily: T.sans }}>{fmtArr(pARR)}</div>
                                                        <div style={{ fontSize: '0.6875rem', color: T.inkMuted, fontFamily: T.sans }}>{active.length} deal{active.length!==1?'s':''}</div>
                                                    </div>
                                                    <div>
                                                        <div style={{ ...eyebrow(T.ok), marginBottom: '2px' }}>Closed Won</div>
                                                        <div style={{ fontSize: '1.125rem', fontWeight: '700', color: T.ok, fontFamily: T.sans }}>{fmtArr(wARR)}</div>
                                                        <div style={{ fontSize: '0.6875rem', color: T.inkMuted, fontFamily: T.sans }}>{won.length} deal{won.length!==1?'s':''}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })()}

                </div>
            </div>
        </div>
    );
}
