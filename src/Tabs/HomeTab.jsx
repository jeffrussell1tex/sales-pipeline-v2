import React, { useState } from 'react';
import { useApp } from '../AppContext';
import ViewingBar from '../components/ui/ViewingBar';
import { dbFetch, waitForToken } from '../utils/storage';

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

        const statusColor = score >= 65 ? '#639922' : score >= 40 ? '#BA7517' : '#E24B4A';
        const statusBg    = score >= 65 ? '#EAF3DE' : score >= 40 ? '#FAEEDA' : '#FCEBEB';
        const statusText  = score >= 65 ? '#27500A' : score >= 40 ? '#854F0B' : '#A32D2D';
        const statusLabel = score >= 65 ? (score >= 80 ? 'Top performer' : 'On track') : (score >= 40 ? (staleDeals > 0 ? `${staleDeals} stale deal${staleDeals>1?'s':''}` : 'Needs attention') : 'Needs coaching');
        const statusSub   = score >= 65 ? (winRate !== null ? `${winRate}% win rate` : `${dealCount} active deals`) : (overdueCount > 0 ? `${overdueCount} overdue task${overdueCount>1?'s':''}` : daysSinceAct !== null ? `${daysSinceAct}d since last activity` : 'No activities logged');
        const avatarColors = ['#2563eb','#7c3aed','#059669','#d97706','#dc2626','#0891b2','#be185d'];
        const avatarBg    = avatarColors[(rep.name||'').charCodeAt(0) % avatarColors.length];
        const initials    = (rep.name||'').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
        return { rep, score, statusColor, statusBg, statusText, statusLabel, statusSub, pipelineArr, dealCount, daysSinceAct, overdueCount, attainPct, winRate, staleDeals, avatarBg, initials };
    });

    const sortFn = (a, b) => sortBy === 'health' ? a.score - b.score : sortBy === 'arr' ? b.pipelineArr - a.pipelineArr : (b.attainPct||0) - (a.attainPct||0);
    const teams = {};
    repStats.forEach(rs => { const t = rs.rep.team || 'Unassigned'; if (!teams[t]) teams[t] = []; teams[t].push(rs); });
    Object.values(teams).forEach(arr => arr.sort(sortFn));
    const teamColors = ['#2563eb','#7c3aed','#059669','#d97706','#0891b2','#be185d'];
    const teamList = Object.entries(teams);

    const Ring = ({ score, size = 48, stroke = 4, color }) => {
        const r = (size/2) - stroke;
        const circ = 2 * Math.PI * r;
        const dash = (score/100) * circ;
        return (
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink:0 }}>
                <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke}/>
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

        // ── Team-level coaching insights ──────────────────────────────────────
        const BENCHMARK_WIN_RATE   = 45; // industry benchmark %
        const BENCHMARK_ACT_DAYS   = 7;  // ideal days between activities
        const repsWithWinRate = repStats.filter(r => r.winRate !== null);
        const teamAvgWinRate  = repsWithWinRate.length > 0
            ? Math.round(repsWithWinRate.reduce((s,r) => s + r.winRate, 0) / repsWithWinRate.length)
            : null;
        const repsWithActivity = repStats.filter(r => r.daysSinceAct !== null);
        const teamAvgActDays   = repsWithActivity.length > 0
            ? Math.round(repsWithActivity.reduce((s,r) => s + r.daysSinceAct, 0) / repsWithActivity.length)
            : null;
        const repsWithAttain = repStats.filter(r => r.attainPct !== null);
        const teamAvgAttain  = repsWithAttain.length > 0
            ? Math.round(repsWithAttain.reduce((s,r) => s + r.attainPct, 0) / repsWithAttain.length)
            : null;
        const staleDealReps  = repStats.filter(r => r.staleDeals > 0);
        const topPerformer   = repStats.length > 0 ? [...repStats].sort((a,b) => b.score - a.score)[0] : null;
        const bottomRep      = repStats.length > 0 ? [...repStats].sort((a,b) => a.score - b.score)[0] : null;
        const scoreGap       = (topPerformer && bottomRep && repStats.length > 1)
            ? topPerformer.score - bottomRep.score : 0;

        const teamInsights = [];
        const hintCfg = {
            success: { bg:'#EAF3DE', border:'#C0DD97', text:'#27500A', iconBg:'#639922', icon:'★' },
            warning: { bg:'#FAEEDA', border:'#FAC775', text:'#633806', iconBg:'#BA7517', icon:'!' },
            info:    { bg:'#E6F1FB', border:'#B5D4F4', text:'#0C447C', iconBg:'#378ADD', icon:'→' },
        };

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

        return (
            <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'12px', boxShadow:'0 1px 3px rgba(0,0,0,0.06)', marginBottom:'1.5rem', overflow:'hidden' }}>
                <div style={{ padding:'0.875rem 1.25rem', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div>
                        <div style={{ fontSize:'0.6875rem', fontWeight:'800', color:'#475569', textTransform:'uppercase', letterSpacing:'0.08em' }}>Team pipeline health</div>
                        <div style={{ fontSize:'0.75rem', color:'#94a3b8', marginTop:'2px' }}>
                            {repStats.length} rep{repStats.length!==1?'s':''} · {fmtArr(totalArr)} pipeline
                            {atRisk > 0 && <span style={{ marginLeft:'0.5rem', color:'#E24B4A', fontWeight:'600' }}>· {atRisk} need{atRisk===1?'s':''} attention</span>}
                        </div>
                    </div>
                    {setActiveTab && (
                        <button onClick={() => setActiveTab('salesManager')}
                            style={{ fontSize:'0.75rem', padding:'4px 12px', border:'0.5px solid #e2e8f0', borderRadius:'6px', background:'transparent', color:'#64748b', cursor:'pointer', fontFamily:'inherit' }}>
                            View detail →
                        </button>
                    )}
                </div>
                {/* Rep strip */}
                <div style={{ padding:'0.875rem 1.25rem', display:'flex', gap:'8px', overflowX:'auto' }}>
                    {allSorted.map(rs => (
                        <div key={rs.rep.id} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'8px 12px', border:`0.5px solid ${rs.statusColor}40`, borderLeft:`3px solid ${rs.statusColor}`, borderRadius:'0 8px 8px 0', background:'#fafafa', flexShrink:0, minWidth:'145px' }}>
                            <Ring score={rs.score} size={36} stroke={3} color={rs.statusColor} />
                            <div style={{ minWidth:0 }}>
                                <div style={{ fontSize:'12px', fontWeight:'600', color:'#1e293b', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'90px' }}>{rs.rep.name}</div>
                                <div style={{ fontSize:'11px', color:'#64748b' }}>{fmtArr(rs.pipelineArr)} · {rs.dealCount} deals</div>
                                <div style={{ fontSize:'10px', color:rs.statusColor, fontWeight:'600', marginTop:'1px' }}>{rs.statusLabel}</div>
                            </div>
                        </div>
                    ))}
                </div>
                {/* Team-level coaching insights */}
                {shownInsights.length > 0 && (
                    <div style={{ padding:'0 1.25rem 1rem', borderTop:'1px solid #f1f5f9', paddingTop:'0.75rem' }}>
                        <div style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'6px' }}>
                            Team coaching insights
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                            {shownInsights.map((hint, i) => {
                                const hc = hintCfg[hint.type] || hintCfg.info;
                                return (
                                    <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:'10px', padding:'10px 12px', background:hc.bg, border:`0.5px solid ${hc.border}`, borderRadius:'8px' }}>
                                        <div style={{ width:'22px', height:'22px', borderRadius:'50%', background:hc.iconBg, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.6875rem', fontWeight:'700', flexShrink:0 }}>{hc.icon}</div>
                                        <div style={{ fontSize:'0.8125rem', color:hc.text, lineHeight:1.5 }}>{hint.text}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'12px', boxShadow:'0 1px 3px rgba(0,0,0,0.06)', marginBottom:'1.5rem', overflow:'hidden' }}>
            <div style={{ padding:'0.875rem 1.25rem', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'0.5rem' }}>
                <div>
                    <div style={{ fontSize:'0.6875rem', fontWeight:'800', color:'#475569', textTransform:'uppercase', letterSpacing:'0.08em' }}>Team pipeline health</div>
                    <div style={{ fontSize:'0.75rem', color:'#94a3b8', marginTop:'2px' }}>Sorted by {sortBy === 'health' ? 'health score · worst first' : sortBy === 'arr' ? 'pipeline ARR · highest first' : 'quota attainment · highest first'}</div>
                </div>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                    style={{ fontSize:'0.75rem', padding:'0.3rem 1.5rem 0.3rem 0.625rem', border:'0.5px solid #e2e8f0', borderRadius:'6px', background:'#f8fafc', color:'#475569', cursor:'pointer', fontFamily:'inherit', appearance:'none', backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 12 12'%3E%3Cpath fill='%2364748b' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")", backgroundRepeat:'no-repeat', backgroundPosition:'right 6px center' }}>
                    <option value="health">Sort: Health score</option>
                    <option value="arr">Sort: Pipeline ARR</option>
                    <option value="quota">Sort: Quota attainment</option>
                </select>
            </div>
            <div style={{ padding:'1.25rem' }}>
                {teamList.map(([teamName, reps], ti) => {
                    const teamColor = teamColors[ti % teamColors.length];
                    const teamArr   = reps.reduce((s,r) => s+r.pipelineArr, 0);
                    const avgHealth = reps.length ? Math.round(reps.reduce((s,r) => s+r.score, 0)/reps.length) : 0;
                    return (
                        <div key={teamName} style={{ marginBottom: ti < teamList.length-1 ? '1.5rem' : 0 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px' }}>
                                <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:teamColor, flexShrink:0 }}/>
                                <div style={{ fontSize:'0.8125rem', fontWeight:'700', color:'#1e293b' }}>{teamName}</div>
                                <div style={{ fontSize:'0.75rem', color:'#94a3b8' }}>{reps.length} rep{reps.length!==1?'s':''} · {fmtArr(teamArr)} pipeline · avg health {avgHealth}</div>
                            </div>
                            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:'10px' }}>
                                {reps.map(rs => (
                                    <div key={rs.rep.id} style={{ background:'#fff', border:'0.5px solid #e2e8f0', borderLeft:`3px solid ${rs.statusColor}`, borderRadius:'0 10px 10px 0', padding:'14px' }}>
                                        <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'12px' }}>
                                            <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:rs.avatarBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', fontWeight:'700', color:'#fff', flexShrink:0 }}>{rs.initials}</div>
                                            <div style={{ flex:1, minWidth:0 }}>
                                                <div style={{ fontSize:'13px', fontWeight:'600', color:'#1e293b', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{rs.rep.name}</div>
                                                <div style={{ fontSize:'11px', color:'#64748b' }}>{rs.rep.territory || rs.rep.team || 'Sales Rep'}</div>
                                            </div>
                                            <Ring score={rs.score} size={48} stroke={4} color={rs.statusColor} />
                                        </div>
                                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px' }}>
                                            {[
                                                { val: fmtArr(rs.pipelineArr), lbl: 'Pipeline ARR', danger: rs.pipelineArr === 0 },
                                                { val: rs.dealCount, lbl: 'Active deals', danger: rs.dealCount === 0 },
                                                { val: rs.daysSinceAct !== null ? rs.daysSinceAct+'d' : '—', lbl: 'Last activity', danger: rs.daysSinceAct === null || rs.daysSinceAct >= 14, warn: rs.daysSinceAct !== null && rs.daysSinceAct >= 7 && rs.daysSinceAct < 14 },
                                                { val: rs.overdueCount, lbl: 'Overdue tasks', danger: rs.overdueCount >= 3, warn: rs.overdueCount >= 1 && rs.overdueCount < 3 },
                                            ].map(({ val, lbl, danger, warn }) => (
                                                <div key={lbl} style={{ background:'#f8fafc', borderRadius:'6px', padding:'6px 8px' }}>
                                                    <div style={{ fontSize:'13px', fontWeight:'600', color: danger ? '#A32D2D' : warn ? '#854F0B' : '#1e293b' }}>{val}</div>
                                                    <div style={{ fontSize:'10px', color:'#94a3b8', marginTop:'1px' }}>{lbl}</div>
                                                </div>
                                            ))}
                                            <div style={{ gridColumn:'span 2', background:'#f8fafc', borderRadius:'6px', padding:'6px 8px' }}>
                                                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'4px' }}>
                                                    <div style={{ fontSize:'10px', color:'#94a3b8' }}>Quota attainment</div>
                                                    <div style={{ fontSize:'12px', fontWeight:'600', color: rs.attainPct === null ? '#94a3b8' : rs.attainPct >= 75 ? '#27500A' : rs.attainPct >= 40 ? '#854F0B' : '#A32D2D' }}>{rs.attainPct !== null ? rs.attainPct+'%' : '—'}</div>
                                                </div>
                                                <div style={{ height:'3px', background:'#e2e8f0', borderRadius:'2px' }}>
                                                    <div style={{ height:'100%', width:Math.min(rs.attainPct||0, 100)+'%', background: (rs.attainPct||0) >= 75 ? '#639922' : (rs.attainPct||0) >= 40 ? '#BA7517' : '#E24B4A', borderRadius:'2px' }}/>
                                                </div>
                                            </div>
                                            <div style={{ background:'#f8fafc', borderRadius:'6px', padding:'6px 8px' }}>
                                                <div style={{ fontSize:'13px', fontWeight:'600', color: rs.winRate === null ? '#94a3b8' : rs.winRate >= 50 ? '#27500A' : '#1e293b' }}>{rs.winRate !== null ? rs.winRate+'%' : '—'}</div>
                                                <div style={{ fontSize:'10px', color:'#94a3b8', marginTop:'1px' }}>Win rate</div>
                                            </div>
                                            <div style={{ background:rs.statusBg, borderRadius:'6px', padding:'6px 8px' }}>
                                                <div style={{ fontSize:'11px', fontWeight:'600', color:rs.statusText }}>{rs.statusLabel}</div>
                                                <div style={{ fontSize:'10px', color:rs.statusText, opacity:0.75, marginTop:'1px' }}>{rs.statusSub}</div>
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
    const [actionRate, setActionRate] = React.useState(null); // { resolved, total, rate }
    const [logLoaded, setLogLoaded] = React.useState(false);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const fmtCurrency = (v) => v >= 1000000 ? '$' + (v/1000000).toFixed(1) + 'M' : v >= 1000 ? '$' + Math.round(v/1000) + 'K' : '$' + (v||0).toLocaleString();
    const daysSince = (dateStr) => dateStr ? Math.floor((today - new Date(dateStr + 'T12:00:00')) / 86400000) : null;
    const daysBetween = (a, b) => Math.floor((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);

    // On mount: evaluate pending items + load summary stats
    React.useEffect(() => {
        if (logLoaded) return;
        setLogLoaded(true);
        const run = async () => {
            try {
                await waitForToken();
                // Evaluate pending items (fire and forget)
                await dbFetch(`/.netlify/functions/recommendation-log?rep=${encodeURIComponent(currentUser)}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                });
                // Fetch summary stats for the action rate widget
                const res = await dbFetch(`/.netlify/functions/recommendation-log?rep=${encodeURIComponent(currentUser)}&days=30`);
                const data = await res.json();
                if (data?.summary && data.summary.total > 0) {
                    setActionRate({
                        resolved: data.summary.resolved,
                        total:    data.summary.total,
                        rate:     data.summary.resolveRate,
                        avgDays:  data.summary.avgDays,
                        byType:   data.summary.byType || {},
                    });
                }
            } catch (err) {
                console.warn('recommendation-log load error:', err.message);
            }
        };
        run();
    }, [currentUser]);

    // Log a dismissed recommendation to the DB
    const logDismiss = async (item) => {
        try {
            await dbFetch('/.netlify/functions/recommendation-log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id:            'rec_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
                    repName:       currentUser,
                    actionType:    item.cat === 'tasks' ? 'task' : item.id.split('-')[0],
                    opportunityId: item.opp?.id || (item.cat === 'tasks' ? item.taskId : null),
                    dealName:      item.opp ? (item.opp.opportunityName || item.opp.account) : item.title,
                    arrAtRisk:     item.arr || null,
                    stage:         item.stage || null,
                    signal:        item.reason || null,
                }),
            });
        } catch (err) {
            console.warn('Failed to log recommendation dismiss:', err.message);
        }
    };

    const dismiss = (item) => {
        setDismissed(d => new Set([...d, item.id]));
        logDismiss(item);
    };

    // Average days per stage across all won deals
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

    // Rep's own win rate for coaching insight
    const myWonDeals = (opportunities||[]).filter(o => o.stage === 'Closed Won' && o.salesRep === currentUser);
    const myTotalDeals = (opportunities||[]).filter(o => ['Closed Won','Closed Lost'].includes(o.stage) && o.salesRep === currentUser);
    const myWinRate = myTotalDeals.length > 0 ? Math.round((myWonDeals.length / myTotalDeals.length) * 100) : null;

    // Average activities per won deal for this rep
    const avgActsWon = myWonDeals.length > 0
        ? Math.round(myWonDeals.reduce((sum, o) => sum + (activities||[]).filter(a => a.opportunityId === o.id).length, 0) / myWonDeals.length)
        : null;

    // Build action items from live data
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

            // Stale — no contact in 14+ days on an active deal
            if (daysSinceContact !== null && daysSinceContact >= 14 && !['Closed Won','Closed Lost'].includes(opp.stage)) {
                items.push({
                    id: `stale-${opp.id}`,
                    priority: daysSinceContact >= 21 ? 'urgent' : 'warning',
                    cat: 'urgent',
                    title: `${name} — no contact in ${daysSinceContact} days`,
                    reason: `Last activity was ${oppActs[0] ? oppActs[0].type.toLowerCase() : 'deal creation'}. Deals that go silent here rarely recover without outreach.`,
                    tags: [{ label: `${daysSinceContact}d no contact`, type: daysSinceContact >= 21 ? 'red' : 'amber' }],
                    arr,
                    stage: opp.stage,
                    action: 'Log a call',
                    onClick: () => { setEditingOpp(opp); setShowModal(true); },
                    opp,
                });
            }

            // Stuck in stage — 2× the average or 21+ days with no avg data
            const stuckThreshold = avgForStage ? avgForStage * 2 : 21;
            if (daysInStage !== null && daysInStage >= stuckThreshold && daysInStage >= 14) {
                items.push({
                    id: `stuck-${opp.id}`,
                    priority: 'warning',
                    cat: 'urgent',
                    title: `${name} stuck in ${opp.stage} for ${daysInStage} days`,
                    reason: avgForStage
                        ? `Your average time in ${opp.stage} is ${avgForStage} days. This deal is ${Math.round(daysInStage/avgForStage)}× over — consider advancing or disqualifying.`
                        : `21+ days in the same stage with no progression. Review and decide next step.`,
                    tags: [{ label: `${daysInStage}d in stage`, type: 'amber' }],
                    arr,
                    stage: opp.stage,
                    action: 'Edit deal',
                    onClick: () => { setEditingOpp(opp); setShowModal(true); },
                    opp,
                });
            }

            // Close date lapsed
            if (daysToClose !== null && daysToClose < 0) {
                items.push({
                    id: `lapsed-${opp.id}`,
                    priority: Math.abs(daysToClose) > 7 ? 'urgent' : 'warning',
                    cat: 'urgent',
                    title: `${name} — close date passed ${Math.abs(daysToClose)} day${Math.abs(daysToClose)!==1?'s':''} ago`,
                    reason: `Forecasted close was ${new Date(closeDate + 'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}. Update the close date or move the stage to keep your pipeline accurate.`,
                    tags: [{ label: `${Math.abs(daysToClose)}d overdue`, type: 'red' }],
                    arr,
                    stage: opp.stage,
                    action: 'Update date',
                    onClick: () => { setEditingOpp(opp); setShowModal(true); },
                    opp,
                });
            }

            // Low stakeholder coverage — contacts listed but few engaged
            const contactNames = (opp.contacts||'').split(', ').filter(Boolean);
            const engagedContacts = new Set(oppActs.map(a => a.contactName).filter(Boolean));
            if (contactNames.length >= 2 && engagedContacts.size < 2 && arr >= 20000) {
                items.push({
                    id: `coverage-${opp.id}`,
                    priority: 'info',
                    cat: 'followup',
                    title: `${name} — only ${engagedContacts.size} of ${contactNames.length} contacts engaged`,
                    reason: `Multi-threaded deals close faster. Reach out to ${contactNames.filter(n => !engagedContacts.has(n.split(' (')[0]))[0]?.split(' (')[0] || 'additional stakeholders'} to broaden coverage.`,
                    tags: [{ label: 'Low coverage', type: 'blue' }],
                    arr,
                    stage: opp.stage,
                    action: 'View contacts',
                    onClick: () => { setEditingOpp(opp); setShowModal(true); },
                    opp,
                });
            }

            // High-velocity deal — moving fast, reinforce momentum
            const createdDays = daysSince(opp.createdDate);
            const stageCount = (opp.stageHistory||[]).length;
            if (createdDays !== null && createdDays <= 14 && stageCount >= 2 && !['Negotiation/Review','Contracts','Closed Won','Closed Lost'].includes(opp.stage)) {
                items.push({
                    id: `velocity-${opp.id}`,
                    priority: 'success',
                    cat: 'momentum',
                    title: `${name} is moving fast — ${stageCount} stages in ${createdDays} days`,
                    reason: `Great velocity. Keep the momentum by scheduling the next step before the end of the week.`,
                    tags: [{ label: 'High velocity', type: 'green' }],
                    arr,
                    stage: opp.stage,
                    action: 'Add task',
                    onClick: () => { setEditingTask({ relatedTo: opp.id, opportunityId: opp.id, type: 'Follow-up', dueDate: new Date(Date.now()+2*86400000).toISOString().split('T')[0] }); setShowTaskModal(true); },
                    opp,
                });
            }
        });

        // Overdue tasks
        (tasks||[]).filter(t => {
            const due = t.dueDate || t.due;
            const done = t.status === 'Completed' || t.completed;
            return !done && due && new Date(due + 'T12:00:00') < today;
        }).slice(0, 3).forEach(task => {
            const daysOver = daysSince(task.dueDate || task.due);
            items.push({
                id: `task-${task.id}`,
                priority: daysOver >= 3 ? 'urgent' : 'warning',
                cat: 'tasks',
                title: `Overdue task: "${task.title}"`,
                reason: `Due ${daysOver} day${daysOver!==1?'s':''} ago. Complete or reschedule to keep your pipeline clean.`,
                tags: [{ label: `${daysOver}d overdue`, type: daysOver >= 3 ? 'red' : 'amber' }],
                arr: null,
                stage: null,
                action: 'View task',
                onClick: () => { setEditingTask(task); setShowTaskModal(true); },
            });
        });

        // Sort: urgent first, then warning, then info, then success; within each by ARR desc
        const order = { urgent: 0, warning: 1, info: 2, tasks: 3, followup: 4, momentum: 5 };
        return items
            .filter(a => !dismissed.has(a.id))
            .sort((a, b) => (order[a.cat]||9) - (order[b.cat]||9) || (b.arr||0) - (a.arr||0));
    }, [opportunities, activities, tasks, dismissed, avgDaysInStage]);

    // Coaching hints — based on rep's own historical patterns
    const coachingHints = React.useMemo(() => {
        const hints = [];
        if (myWinRate !== null && myWinRate < 40) {
            hints.push({ type: 'info', text: `Your win rate is ${myWinRate}%. Top performers in similar roles average 45–55%. Focus on qualifying harder at Discovery.` });
        }
        if (myWinRate !== null && myWinRate >= 55) {
            hints.push({ type: 'success', text: `Strong win rate at ${myWinRate}%. You're in the top tier — focus on deal size and pipeline volume to maximize impact.` });
        }
        if (avgActsWon !== null && avgActsWon > 0) {
            const activeWithFewActs = (opportunities||[]).filter(o => {
                const n = (activities||[]).filter(a => a.opportunityId === o.id).length;
                return !['Closed Won','Closed Lost'].includes(o.stage) && n < Math.ceil(avgActsWon * 0.4);
            });
            if (activeWithFewActs.length > 0) {
                hints.push({ type: 'warning', text: `Your won deals average ${avgActsWon} activities. ${activeWithFewActs.length} active deal${activeWithFewActs.length>1?'s are':' is'} under-actioned — increase touchpoints to match your winning pattern.` });
            }
        }
        // Deals closing soon with no recent activity
        const closingSoon = (opportunities||[]).filter(o => {
            const daysToClose = o.forecastedCloseDate ? daysBetween(todayStr, o.forecastedCloseDate) : null;
            const lastAct = (activities||[]).filter(a => a.opportunityId === o.id).sort((a,b) => b.date.localeCompare(a.date))[0];
            const daysSinceAct = lastAct ? daysSince(lastAct.date) : 99;
            return daysToClose !== null && daysToClose <= 14 && daysToClose >= 0 && daysSinceAct > 5 && !['Closed Won','Closed Lost'].includes(o.stage);
        });
        if (closingSoon.length > 0) {
            hints.push({ type: 'warning', text: `${closingSoon.length} deal${closingSoon.length>1?'s are':' is'} closing within 14 days but haven't been contacted recently. Don't let these slip at the finish line.` });
        }
        // Positive — most active this week
        const thisWeek = new Date(); thisWeek.setDate(thisWeek.getDate() - 7);
        const weekActs = (activities||[]).filter(a => a.salesRep === currentUser && a.date >= thisWeek.toISOString().split('T')[0]);
        if (weekActs.length >= 5) {
            hints.push({ type: 'success', text: `Great week — ${weekActs.length} activities logged in the last 7 days. Consistent activity is the #1 predictor of quota attainment.` });
        }
        return hints.slice(0, 3);
    }, [opportunities, activities, myWinRate, avgActsWon]);

    const priorityConfig = {
        urgent:   { bar: '#E24B4A', dot: '#E24B4A' },
        warning:  { bar: '#BA7517', dot: '#BA7517' },
        info:     { bar: '#378ADD', dot: '#378ADD' },
        success:  { bar: '#639922', dot: '#639922' },
        tasks:    { bar: '#BA7517', dot: '#BA7517' },
        followup: { bar: '#378ADD', dot: '#378ADD' },
        momentum: { bar: '#639922', dot: '#639922' },
    };
    const tagStyle = {
        red:    { background: '#FCEBEB', color: '#A32D2D' },
        amber:  { background: '#FAEEDA', color: '#854F0B' },
        blue:   { background: '#E6F1FB', color: '#185FA5' },
        green:  { background: '#EAF3DE', color: '#3B6D11' },
    };
    const hintConfig = {
        success: { bg: '#EAF3DE', border: '#C0DD97', text: '#27500A', icon: '★', iconBg: '#639922' },
        warning: { bg: '#FAEEDA', border: '#FAC775', text: '#633806', icon: '!', iconBg: '#BA7517' },
        info:    { bg: '#E6F1FB', border: '#B5D4F4', text: '#0C447C', icon: '→', iconBg: '#378ADD' },
    };

    const filterCats = { all: null, urgent: ['urgent','tasks'], followup: ['followup'], momentum: ['momentum'] };
    const filtered = filter === 'all' ? actions : actions.filter(a => (filterCats[filter]||[]).includes(a.cat));
    const urgentCount = actions.filter(a => ['urgent','tasks'].includes(a.cat)).length;
    const atRiskArr = actions.filter(a => a.arr && ['urgent','warning'].includes(a.priority)).reduce((s,a)=>s+(a.arr||0),0);

    if (actions.length === 0 && coachingHints.length === 0) return null;

    return (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: '1.5rem', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <div style={{ fontSize: '0.6875rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Recommended actions
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                        Personalized for {currentUser} · {actions.length} action{actions.length!==1?'s':''}
                        {atRiskArr > 0 && <span style={{ marginLeft: '0.5rem', color: '#ef4444', fontWeight: '600' }}>· {fmtCurrency(atRiskArr)} at risk</span>}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                    {[['all','All'], ['urgent','Urgent'], ['followup','Follow-up'], ['momentum','Wins']].map(([k,l]) => (
                        <button key={k} onClick={() => setFilter(k)}
                            style={{ fontSize: '0.6875rem', padding: '3px 10px', borderRadius: '999px', border: '0.5px solid', cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
                                borderColor: filter===k ? '#94a3b8' : '#e2e8f0',
                                background: filter===k ? '#f1f5f9' : 'transparent',
                                color: filter===k ? '#1e293b' : '#64748b',
                                fontWeight: filter===k ? '700' : '400' }}>
                            {l}{k==='urgent' && urgentCount > 0 ? ` (${urgentCount})` : ''}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ padding: '0.75rem 1.25rem' }}>
                {/* Action items */}
                {filtered.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8', fontSize: '0.8125rem' }}>
                        No actions in this category right now.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: coachingHints.length > 0 ? '1rem' : '0' }}>
                        {filtered.map(item => {
                            const pc = priorityConfig[item.cat] || priorityConfig.info;
                            return (
                                <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '10px 12px', border: '0.5px solid #e2e8f0', borderLeft: `3px solid ${pc.bar}`, borderRadius: '0 8px 8px 0', background: '#fafafa', position: 'relative' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b', lineHeight: 1.4 }}>{item.title}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b', lineHeight: 1.5 }}>{item.reason}</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                                            {item.tags?.map((tag, ti) => (
                                                <span key={ti} style={{ fontSize: '0.6875rem', padding: '1px 8px', borderRadius: '999px', fontWeight: '600', ...tagStyle[tag.type] }}>{tag.label}</span>
                                            ))}
                                            {item.stage && <span style={{ fontSize: '0.6875rem', padding: '1px 8px', borderRadius: '4px', background: '#f1f5f9', color: '#64748b' }}>{item.stage}</span>}
                                            {item.arr > 0 && <span style={{ fontSize: '0.6875rem', padding: '1px 8px', borderRadius: '4px', background: '#f0fdf4', color: '#15803d', fontWeight: '600' }}>{fmtCurrency(item.arr)}</span>}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                        <button onClick={item.onClick}
                                            style={{ fontSize: '0.75rem', padding: '5px 12px', borderRadius: '6px', border: '0.5px solid #e2e8f0', background: '#fff', color: '#1e293b', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', fontWeight: '600' }}>
                                            {item.action}
                                        </button>
                                        <button onClick={() => dismiss(item)}
                                            title="Dismiss"
                                            style={{ fontSize: '0.875rem', padding: '4px 6px', border: 'none', background: 'none', color: '#cbd5e1', cursor: 'pointer', lineHeight: 1 }}
                                            onMouseEnter={e => e.currentTarget.style.color='#94a3b8'}
                                            onMouseLeave={e => e.currentTarget.style.color='#cbd5e1'}>✕</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Coaching hints */}
                {coachingHints.length > 0 && (
                    <>
                        <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', marginTop: filtered.length > 0 ? '0.25rem' : 0 }}>
                            Coaching insights
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {coachingHints.map((hint, i) => {
                                const hc = hintConfig[hint.type] || hintConfig.info;
                                return (
                                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', background: hc.bg, border: `0.5px solid ${hc.border}`, borderRadius: '8px' }}>
                                        <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: hc.iconBg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6875rem', fontWeight: '700', flexShrink: 0 }}>{hc.icon}</div>
                                        <div style={{ fontSize: '0.8125rem', color: hc.text, lineHeight: 1.5 }}>{hint.text}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
                {/* Action rate strip — shown once enough history exists */}
                {actionRate && actionRate.total >= 3 && (
                    <div style={{ marginTop: '0.875rem', paddingTop: '0.875rem', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>Your action rate (30d)</div>
                        <div style={{ flex: 1, height: '4px', background: '#f1f5f9', borderRadius: '2px', minWidth: '80px' }}>
                            <div style={{ height: '100%', width: actionRate.rate + '%', background: actionRate.rate >= 60 ? '#639922' : actionRate.rate >= 35 ? '#BA7517' : '#E24B4A', borderRadius: '2px', transition: 'width 0.4s' }} />
                        </div>
                        <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: actionRate.rate >= 60 ? '#3B6D11' : actionRate.rate >= 35 ? '#854F0B' : '#A32D2D', flexShrink: 0 }}>
                            {actionRate.rate}% resolved
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', flexShrink: 0 }}>
                            {actionRate.resolved} of {actionRate.total} acted on
                            {actionRate.avgDays && ` · avg ${actionRate.avgDays}d to resolve`}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function HomeTab() {
    const {
        opportunities,
        accounts,
        contacts,
        tasks,
        activities,
        settings,
        currentUser,
        userRole,
        canSeeAll,
        isRepVisible,
        getStageColor,
        getQuarter,
        getQuarterLabel,
        calculateDealHealth,
        getKpiColor,
        showConfirm,
        softDelete,
        addAudit,
        visibleOpportunities,
        visibleTasks,
        activePipeline,
        allPipelines,
        stages,
        handleDelete,
        handleSave,
        handleCompleteTask,
        handleDeleteTask,
        calendarEvents,
        calendarConnected,
        calendarLoading,
        calendarError,
        fetchCalendarEvents,
        setActiveTab, isMobile,
        fetchLogFromCalEvents,
        logFromCalOpen, setLogFromCalOpen,
        logFromCalDateFrom, setLogFromCalDateFrom,
        logFromCalDateTo, setLogFromCalDateTo,
        logFromCalEvents, setLogFromCalEvents,
        logFromCalLoading,
        logFromCalError,
        loggedCalendarIds, setLoggedCalendarIds,
        logFromCalLinkingId, setLogFromCalLinkingId,
        logFromCalOppMap, setLogFromCalOppMap,
        meetingPrepOpen, setMeetingPrepOpen,
        meetingPrepEvent, setMeetingPrepEvent,
        meetingPrepOppId, setMeetingPrepOppId,
        viewingRep, setViewingRep,
        viewingTeam, setViewingTeam,
        viewingTerritory, setViewingTerritory,
        activePipelineId, setActivePipelineId,
        allRepNames,
        allTeamNames,
        allTerritoryNames,
        setUndoToast,
        setEditingOpp, setShowModal,
        setEditingTask, setShowTaskModal,
        setActivityInitialContext, setEditingActivity, setShowActivityModal,
        setShowOutlookImportModal,
    } = useApp();

    const isAdmin = userRole === 'Admin';
    const isManager = userRole === 'Manager';
    const isReadOnly = userRole === 'ReadOnly';
    const canEdit = !isReadOnly;

    // Derived KPIs
    const totalARR = visibleOpportunities.reduce((sum, opp) => sum + (parseFloat(opp.arr) || 0), 0);
    const activeOpps = visibleOpportunities.length;
    const avgARR = activeOpps > 0 ? totalARR / activeOpps : 0;

    // Local state
    const [calView, setCalView] = useState('week');
    const [calOffset, setCalOffset] = useState(0);
    const [showCalConfig, setShowCalConfig] = useState(false);
    const [calShowGcal, setCalShowGcal] = useState(true);
    const [calShowCalls, setCalShowCalls] = useState(true);
    const [calShowMeetings, setCalShowMeetings] = useState(true);
    const [calShowWeekends, setCalShowWeekends] = useState(true);
    const [calRepFilter, setCalRepFilter] = useState('all');
    const [calProvider, setCalProvider] = useState('google');

    // UI handlers
    const handleAddNew = () => { setEditingOpp(null); setShowModal(true); };
    const handleEdit = (opp) => { setEditingOpp(opp); setShowModal(true); };
    const handleAddTask = () => { setEditingTask(null); setShowTaskModal(true); };
    const handleLogFromCalendar = () => { setShowOutlookImportModal(true); };

    const quarterlyData = {};
    visibleOpportunities.forEach(opp => {
        if (opp.forecastedCloseDate) {
            const quarter = getQuarter(opp.forecastedCloseDate);
            const quarterLabel = getQuarterLabel(quarter, opp.forecastedCloseDate);
            
            if (!quarterlyData[quarterLabel]) {
                quarterlyData[quarterLabel] = 0;
            }
            quarterlyData[quarterLabel] += (opp.arr + opp.implementationCost);
        }
    });

    const sortedQuarters = Object.entries(quarterlyData)
        .sort((a, b) => {
            const dateA = visibleOpportunities.find(o => {
                const q = getQuarter(o.forecastedCloseDate);
                const ql = getQuarterLabel(q, o.forecastedCloseDate);
                return ql === a[0];
            });
            const dateB = visibleOpportunities.find(o => {
                const q = getQuarter(o.forecastedCloseDate);
                const ql = getQuarterLabel(q, o.forecastedCloseDate);
                return ql === b[0];
            });
            return new Date(dateA?.forecastedCloseDate) - new Date(dateB?.forecastedCloseDate);
        });

    const nextQuarter = sortedQuarters.length > 0 ? sortedQuarters[0] : null;


    // ── Computed values for the new home layout ──
    const todayStr = new Date().toISOString().split('T')[0];
    const today12 = new Date(todayStr + 'T12:00:00');
    const firstName = currentUser ? currentUser.split(' ')[0] : 'there';
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const now = new Date();
    const dateStr = dayNames[now.getDay()] + ', ' + monthNames[now.getMonth()] + ' ' + now.getDate();

    const openTasks = visibleTasks.filter(t => (t.status || (t.completed ? 'Completed' : 'Open')) !== 'Completed');
    const overdueTasks = openTasks.filter(t => t.dueDate && new Date(t.dueDate + 'T12:00:00') < today12);
    const todayTasks = openTasks.filter(t => t.dueDate === todayStr);
    const sortedTasks = [...openTasks].sort((a, b) => new Date(a.dueDate || '9999') - new Date(b.dueDate || '9999'));

    const closedWonARR = visibleOpportunities.filter(o => o.stage === 'Closed Won').reduce((s,o) => s+(parseFloat(o.arr)||0), 0);
    const activeOppsArr = visibleOpportunities.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
    const pipelineARR = activeOppsArr.reduce((s,o) => s+(parseFloat(o.arr)||0), 0);
    const fv = nextQuarter ? nextQuarter[1] : 0;
    const fmtArr = v => v >= 1000000 ? '$'+(v/1000000).toFixed(1)+'M' : v >= 1000 ? '$'+Math.round(v/1000)+'K' : '$'+(v||0).toLocaleString();

    // Priority deals: stale (>14d no activity), closing soon (<7d), no activity, at-risk health
    const priorityDeals = (() => {
        const scored = activeOppsArr.map(opp => {
            const oppActs = (activities||[]).filter(a => a.opportunityId === opp.id).sort((a,b) => (b.date||'').localeCompare(a.date||''));
            const lastAct = oppActs[0]?.date;
            const daysSinceAct = lastAct ? Math.floor((now - new Date(lastAct+'T12:00:00'))/86400000) : null;
            const daysToClose = opp.forecastedCloseDate ? Math.floor((new Date(opp.forecastedCloseDate+'T12:00:00') - now)/86400000) : null;
            const health = calculateDealHealth ? calculateDealHealth(opp) : { score: 50 };
            let priority = 0, tag = '', tagColor = '';
            if (daysSinceAct !== null && daysSinceAct >= 14) { priority = 10 + daysSinceAct; tag = 'Stalled '+daysSinceAct+'d'; tagColor = '#ef4444'; }
            else if (daysToClose !== null && daysToClose >= 0 && daysToClose <= 7) { priority = 9 + (7-daysToClose); tag = 'Closes in '+daysToClose+'d'; tagColor = '#f59e0b'; }
            else if (daysSinceAct === null) { priority = 8; tag = 'No activity'; tagColor = '#f59e0b'; }
            else if (health.score < 40) { priority = 7; tag = 'At risk'; tagColor = '#ef4444'; }
            else { priority = 1; tag = 'Active'; tagColor = '#10b981'; }
            return { ...opp, priority, tag, tagColor, daysSinceAct, daysToClose, health };
        });
        return scored.sort((a,b) => b.priority - a.priority).slice(0,3);
    })();

    // Quick log handlers
    const quickLogCall = () => { setActivityInitialContext(null); setEditingActivity(null); setShowActivityModal(true); };

    // ── Only show current user's opps (not all visible — admin sees their own on Home) ──
    const myOpps = visibleOpportunities.filter(o =>
        !canSeeAll || !o.salesRep || o.salesRep === currentUser
    );
    const myActiveOpps = myOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
    const myPipelineARR = myActiveOpps.reduce((s,o) => s+(parseFloat(o.arr)||0), 0);
    const myClosedWonARR = myOpps.filter(o => o.stage === 'Closed Won').reduce((s,o) => s+(parseFloat(o.arr)||0), 0);

    // Today's calendar events
    const todayCalEvents = calendarConnected && calendarEvents
        ? calendarEvents.filter(ev => {
            const d = ev.start?.date || ev.start?.dateTime?.split('T')[0];
            return d === todayStr;
          }).sort((a,b) => (a.start?.dateTime||'').localeCompare(b.start?.dateTime||''))
        : [];

    // "On your plate" — unified list for left sidebar
    const plate = [];
    overdueTasks.forEach(t => plate.push({ type: 'task', urgency: 'overdue', label: t.title, sub: 'Overdue', color: '#ef4444', item: t }));
    todayTasks.filter(t => !overdueTasks.includes(t)).forEach(t => plate.push({ type: 'task', urgency: 'today', label: t.title, sub: 'Due today', color: '#f59e0b', item: t }));
    todayCalEvents.forEach(ev => {
        const timeStr = ev.start?.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : 'All day';
        plate.push({ type: 'meeting', urgency: 'today', label: ev.summary, sub: timeStr, color: '#7c3aed', item: ev });
    });
    priorityDeals.filter(d => d.priority >= 7).forEach(d => plate.push({ type: 'deal', urgency: d.tagColor === '#ef4444' ? 'overdue' : 'today', label: d.opportunityName || d.account, sub: d.tag, color: d.tagColor, item: d }));

    return (
        <div className="tab-page" style={{ gap: 0, padding: 0 }}>

            {/* ── Hero header ── */}
            <div style={{ padding: '1.75rem 2rem 1.25rem', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div>
                        <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>{dateStr}</div>
                        <h1 style={{ fontSize: '1.875rem', fontWeight: '700', color: '#1c1917', lineHeight: 1.15, margin: 0 }}>
                            {greeting}, <em style={{ fontStyle: 'italic', fontWeight: '400', color: '#57534e' }}>{firstName}.</em>
                        </h1>
                        <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.375rem' }}>
                            {overdueTasks.length > 0 && <span style={{ color: '#ef4444', fontWeight: '600' }}>{overdueTasks.length} task{overdueTasks.length>1?'s':''} overdue</span>}
                            {overdueTasks.length > 0 && priorityDeals.filter(d=>d.priority>=7).length > 0 && <span style={{ color: '#cbd5e1' }}> · </span>}
                            {priorityDeals.filter(d => d.priority >= 7).length > 0 && <span>{priorityDeals.filter(d => d.priority >= 7).length} deal{priorityDeals.filter(d=>d.priority>=7).length>1?'s':''} need attention</span>}
                            {(overdueTasks.length > 0 || priorityDeals.filter(d=>d.priority>=7).length > 0) && <span style={{ color: '#cbd5e1' }}> · </span>}
                            <span>Pipeline: {fmtArr(myPipelineARR)}</span>
                        </div>
                    </div>

                </div>
            </div>

            {/* ── Main layout: left sidebar + right main ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', minHeight: '600px' }}>

                {/* ── Left sidebar: On your plate today ── */}
                <div style={{ borderRight: '1px solid #e2e8f0', padding: '1.25rem 1rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: '#fafaf9' }}>
                    <div>
                        <div style={{ fontSize: '0.6rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>Today's focus</div>
                        {plate.length === 0 ? (
                            <div style={{ fontSize: '0.8125rem', color: '#94a3b8', fontStyle: 'italic', padding: '0.5rem 0' }}>All clear — nothing urgent today</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                {plate.map((item, idx) => (
                                    <div key={idx}
                                        onClick={() => {
                                            if (item.type === 'task') { setEditingTask(item.item); setShowTaskModal(true); }
                                            else if (item.type === 'deal') { setEditingOpp(item.item); setShowModal(true); }
                                        }}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.45rem 0.625rem', borderRadius: '7px', cursor: item.type !== 'meeting' ? 'pointer' : 'default', transition: 'background 0.1s' }}
                                        onMouseEnter={e => { if (item.type !== 'meeting') e.currentTarget.style.background='#f0ece4'; }}
                                        onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.8125rem', color: '#1c1917', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</div>
                                            <div style={{ fontSize: '0.6875rem', color: item.urgency === 'overdue' ? item.color : '#94a3b8', fontWeight: item.urgency === 'overdue' ? '600' : '400' }}>{item.sub}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Pipelines list */}
                    {allPipelines.length > 1 && (
                        <div>
                            <div style={{ fontSize: '0.6rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.625rem' }}>Pipelines</div>
                            {allPipelines.map(p => (
                                <div key={p.id} onClick={() => setActivePipelineId(p.id)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.625rem', borderRadius: '6px', cursor: 'pointer', marginBottom: '2px',
                                        background: p.id === activePipeline.id ? '#f0ece4' : 'transparent',
                                        fontWeight: p.id === activePipeline.id ? '700' : '400' }}
                                    onMouseEnter={e => e.currentTarget.style.background='#f0ece4'}
                                    onMouseLeave={e => e.currentTarget.style.background = p.id === activePipeline.id ? '#f0ece4' : 'transparent'}>
                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                                    <span style={{ fontSize: '0.8125rem', color: '#1c1917' }}>{p.name}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Quick log */}
                    {canEdit && (
                        <div>
                            <div style={{ fontSize: '0.6rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.625rem' }}>Quick log</div>
                            {[
                                { label: '+ Log a call', fn: () => { setActivityInitialContext(null); setEditingActivity(null); setShowActivityModal(true); } },
                                { label: '+ Add activity', fn: () => { setActivityInitialContext(null); setEditingActivity(null); setShowActivityModal(true); } },
                                { label: '+ New task', fn: handleAddTask },
                            ].map(a => (
                                <button key={a.label} onClick={a.fn} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.3rem 0.625rem', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8125rem', color: '#57534e', borderRadius: '6px', transition: 'background 0.1s' }}
                                    onMouseEnter={e => e.currentTarget.style.background='#f0ece4'}
                                    onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                    {a.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Right main content ── */}
                <div style={{ padding: '1.25rem 1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', overflowY: 'auto' }}>

                    {/* KPI strip */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: '0.75rem' }}>
                        {[
                            { label: 'Pipeline ARR', value: fmtArr(myPipelineARR), sub: myActiveOpps.length+' active deals', accent: '#2563eb' },
                            { label: 'Closed won', value: fmtArr(myClosedWonARR), sub: 'this period', accent: '#10b981' },
                            { label: 'Open tasks', value: String(openTasks.length), sub: overdueTasks.length > 0 ? overdueTasks.length+' overdue' : 'all on track', subColor: overdueTasks.length > 0 ? '#ef4444' : '#10b981', accent: overdueTasks.length > 0 ? '#ef4444' : '#f59e0b' },
                            { label: nextQuarter ? nextQuarter[0]+' forecast' : 'Next qtr forecast', value: fmtArr(fv), sub: 'forecasted close', accent: '#7c3aed' },
                        ].map(kpi => (
                            <div key={kpi.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderLeft: '3px solid '+kpi.accent, borderRadius: '10px', padding: '0.875rem 1rem' }}>
                                <div style={{ fontSize: '0.6rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.3rem' }}>{kpi.label}</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#1e293b', letterSpacing: '-0.02em', lineHeight: 1 }}>{kpi.value}</div>
                                <div style={{ fontSize: '0.6875rem', color: kpi.subColor || '#64748b', marginTop: '0.25rem', fontWeight: kpi.subColor ? '600' : '400' }}>{kpi.sub}</div>
                            </div>
                        ))}
                    </div>

                    {/* Priority deals */}
                    {priorityDeals.length > 0 && (
                        <div>
                            <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.625rem' }}>Priority deals — needs attention</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '0.75rem' }}>
                                {priorityDeals.map(deal => {
                                    const sc = getStageColor ? getStageColor(deal.stage) : { text: '#64748b' };
                                    return (
                                        <div key={deal.id} onClick={() => { setEditingOpp(deal); setShowModal(true); }}
                                            style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem', cursor: 'pointer', transition: 'all 0.15s', position: 'relative', overflow: 'hidden' }}
                                            onMouseEnter={e => { e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)'; e.currentTarget.style.borderColor='#cbd5e1'; }}
                                            onMouseLeave={e => { e.currentTarget.style.boxShadow='none'; e.currentTarget.style.borderColor='#e2e8f0'; }}>
                                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: deal.tagColor }} />
                                            <div style={{ fontSize: '0.5625rem', fontWeight: '700', padding: '2px 7px', borderRadius: '4px', background: deal.tagColor+'18', color: deal.tagColor, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'inline-block', marginBottom: '0.5rem' }}>{deal.tag}</div>
                                            <div style={{ fontWeight: '700', fontSize: '0.9375rem', color: '#1e293b', marginBottom: '0.2rem', lineHeight: 1.3 }}>{deal.opportunityName || deal.account}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.75rem' }}>
                                                <span style={{ background: sc.text+'18', color: sc.text, padding: '1px 6px', borderRadius: '4px', fontWeight: '600', fontSize: '0.6875rem' }}>{deal.stage}</span>
                                                {deal.account && deal.opportunityName && <span style={{ marginLeft: '0.375rem' }}>{deal.account}</span>}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <span style={{ fontSize: '1.125rem', fontWeight: '800', color: '#1e293b' }}>{fmtArr(parseFloat(deal.arr)||0)}</span>
                                                <span style={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: '600' }}>View deal →</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Tasks + Pipeline two-col */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        {/* Tasks */}
                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1rem', borderBottom: '1px solid #f1f5f9' }}>
                                <span style={{ fontWeight: '700', fontSize: '0.875rem', color: '#1e293b' }}>Tasks due today</span>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    {canEdit && <button onClick={handleAddTask} style={{ fontSize: '0.75rem', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: '600' }}>+ Add task</button>}
                                    <button onClick={() => setActiveTab('tasks')} style={{ fontSize: '0.75rem', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>View all →</button>
                                </div>
                            </div>
                            {sortedTasks.slice(0,6).length === 0 ? (
                                <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>No open tasks</div>
                            ) : (
                                <div>
                                    {sortedTasks.slice(0,6).map(task => {
                                        const isOvr = task.dueDate && new Date(task.dueDate+'T12:00:00') < today12;
                                        const isToday = task.dueDate === todayStr;
                                        const dueLabel = isOvr ? 'Overdue' : isToday ? 'Today' : task.dueDate ? new Date(task.dueDate+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
                                        const dueColor = isOvr ? '#ef4444' : isToday ? '#f59e0b' : '#94a3b8';
                                        return (
                                            <div key={task.id} onClick={() => { setEditingTask(task); setShowTaskModal(true); }}
                                                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 1rem', borderBottom: '1px solid #f8fafc', cursor: 'pointer' }}
                                                onMouseEnter={e => e.currentTarget.style.background='#f8fafc'}
                                                onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                                <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: '1.5px solid '+(isOvr?'#fca5a5':'#d1d5db'), flexShrink: 0 }} />
                                                <div style={{ flex: 1, fontSize: '0.8125rem', color: '#1e293b', lineHeight: 1.4 }}>{task.title}</div>
                                                {dueLabel && <div style={{ fontSize: '0.6875rem', fontWeight: '600', color: dueColor, flexShrink: 0 }}>{dueLabel}</div>}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* My pipeline */}
                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1rem', borderBottom: '1px solid #f1f5f9' }}>
                                <span style={{ fontWeight: '700', fontSize: '0.875rem', color: '#1e293b' }}>My pipeline</span>
                                <button onClick={() => setActiveTab('pipeline')} style={{ fontSize: '0.75rem', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>View all →</button>
                            </div>
                            {myActiveOpps.length === 0 ? (
                                <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>No active deals</div>
                            ) : (
                                <div>
                                    {myActiveOpps.slice(0,6).map(opp => {
                                        const sc = getStageColor ? getStageColor(opp.stage) : { text: '#64748b' };
                                        return (
                                            <div key={opp.id} onClick={() => { setEditingOpp(opp); setShowModal(true); }}
                                                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 1rem', borderBottom: '1px solid #f8fafc', cursor: 'pointer' }}
                                                onMouseEnter={e => e.currentTarget.style.background='#f8fafc'}
                                                onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                                <div style={{ fontSize: '0.625rem', fontWeight: '700', padding: '2px 7px', borderRadius: '4px', background: sc.text+'18', color: sc.text, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.03em', minWidth: '80px', textAlign: 'center' }}>{opp.stage}</div>
                                                <div style={{ flex: 1, fontSize: '0.8125rem', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opp.opportunityName || opp.account}</div>
                                                <div style={{ fontSize: '0.8125rem', fontWeight: '700', color: '#1e293b', flexShrink: 0 }}>{fmtArr(parseFloat(opp.arr)||0)}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Today's meetings — always shows when calendar connected */}
                    {calendarConnected && (
                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                            <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: '700', fontSize: '0.875rem', color: '#1e293b' }}>Today's meetings</span>
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{todayCalEvents.length} event{todayCalEvents.length!==1?'s':''}</span>
                            </div>
                            {todayCalEvents.length === 0 ? (
                                <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>No meetings today</div>
                            ) : (
                                <div>
                                    {todayCalEvents.map((ev, idx) => {
                                        const timeStr = ev.start?.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : 'All day';
                                        return (
                                            <div key={ev.id||idx} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 1rem', borderBottom: idx < todayCalEvents.length-1 ? '1px solid #f8fafc' : 'none' }}>
                                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', width: '56px', flexShrink: 0 }}>{timeStr}</div>
                                                <div style={{ width: '3px', height: '32px', borderRadius: '2px', background: '#7c3aed', flexShrink: 0 }} />
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b' }}>{ev.summary}</div>
                                                    {ev.attendeeCount > 0 && <div style={{ fontSize: '0.6875rem', color: '#94a3b8', marginTop: '1px' }}>{ev.attendeeCount} attendee{ev.attendeeCount!==1?'s':''}</div>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Calendar connect prompt when not connected */}
                    {!calendarConnected && (
                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                            <div>
                                <div style={{ fontWeight: '600', color: '#1e293b', fontSize: '0.875rem', marginBottom: '0.2rem' }}>Connect your Google Calendar</div>
                                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>See today's meetings alongside your pipeline</div>
                            </div>
                            <button onClick={fetchCalendarEvents} style={{ padding: '0.45rem 1rem', background: '#1c1917', color: '#f5f1eb', border: 'none', borderRadius: '8px', fontSize: '0.8125rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Connect Google Calendar</button>
                        </div>
                    )}

                    {/* Team health (managers/admins) */}
                    {(isManager || isAdmin) && (
                        <TeamHealthPanel
                            opportunities={visibleOpportunities}
                            activities={activities}
                            tasks={visibleTasks}
                            settings={settings}
                            currentUser={currentUser}
                            userRole={userRole}
                            compact={true}
                            setActiveTab={setActiveTab}
                        />
                    )}

                    {/* Recommended actions */}
                    <RecommendedActions
                        opportunities={visibleOpportunities}
                        activities={activities}
                        tasks={visibleTasks}
                        settings={settings}
                        currentUser={currentUser}
                        userRole={userRole}
                        isManager={isManager}
                        isAdmin={isAdmin}
                        canSeeAll={canSeeAll}
                        stages={stages}
                        setEditingOpp={setEditingOpp}
                        setShowModal={setShowModal}
                        setEditingTask={setEditingTask}
                        setShowTaskModal={setShowTaskModal}
                        setActiveTab={setActiveTab}
                    />

                    {/* Multi-pipeline summary */}
                    {allPipelines.length > 1 && (() => {
                        const allVisibleOpps = canSeeAll ? (opportunities||[]) : (opportunities||[]).filter(o => !o.salesRep || o.salesRep === currentUser);
                        return (
                            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                                <div style={{ padding: '0.875rem 1.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '0.6875rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' }}>All Pipelines</span>
                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Org total across all pipelines</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat('+allPipelines.length+', 1fr)', gap: 0 }}>
                                    {allPipelines.map((p, idx) => {
                                        const pOpps = allVisibleOpps.filter(o => (o.pipelineId||'default') === p.id);
                                        const active = pOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
                                        const won = pOpps.filter(o => o.stage === 'Closed Won');
                                        const pARR = active.reduce((s,o) => s+(o.arr||0), 0);
                                        const wARR = won.reduce((s,o) => s+(o.arr||0)+(o.implementationCost||0), 0);
                                        const isCurrent = p.id === activePipeline.id;
                                        return (
                                            <div key={p.id} onClick={() => setActivePipelineId(p.id)} style={{ padding: '1rem 1.5rem', cursor: 'pointer', transition: 'background 0.15s', borderRight: idx < allPipelines.length-1 ? '1px solid #f1f5f9' : 'none', background: isCurrent ? '#fafbff' : '#fff', borderTop: isCurrent ? '3px solid '+p.color : '3px solid transparent' }}
                                                onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background='#f8fafc'; }}
                                                onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background='#fff'; }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: p.color }} />
                                                    <span style={{ fontWeight: '800', fontSize: '0.875rem', color: '#1e293b' }}>{p.name}</span>
                                                    {isCurrent && <span style={{ fontSize: '0.5625rem', fontWeight: '700', background: p.color, color: '#fff', padding: '0.0625rem 0.375rem', borderRadius: '999px' }}>ACTIVE</span>}
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                                    <div>
                                                        <div style={{ fontSize: '0.625rem', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active ARR</div>
                                                        <div style={{ fontSize: '1.125rem', fontWeight: '800', color: '#1e293b' }}>{fmtArr(pARR)}</div>
                                                        <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>{active.length} deal{active.length!==1?'s':''}</div>
                                                    </div>
                                                    <div>
                                                        <div style={{ fontSize: '0.625rem', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Closed Won</div>
                                                        <div style={{ fontSize: '1.125rem', fontWeight: '800', color: '#10b981' }}>{fmtArr(wARR)}</div>
                                                        <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>{won.length} deal{won.length!==1?'s':''}</div>
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
