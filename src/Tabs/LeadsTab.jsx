import React, { useState, useMemo, useCallback } from 'react';
import { useApp } from '../AppContext';
import { dbFetch } from '../utils/storage';

// ── Design tokens ────────────────────────────────────────────
const T = {
    bg: '#f0ece4', surface: '#fbf8f3', surface2: '#f5efe3',
    border: '#e6ddd0', borderStrong: '#d4c8b4',
    ink: '#2a2622', inkMid: '#5a544c', inkMuted: '#8a8378',
    gold: '#c8b99a', goldInk: '#7a6a48',
    danger: '#9c3a2e', warn: '#b87333', ok: '#4d6b3d', info: '#3a5a7a',
    sans: '"Plus Jakarta Sans", system-ui, sans-serif',
    serif: 'Georgia, serif',
    r: 3,
};

// ── Status + source palettes ─────────────────────────────────
const STATUS_STYLES = {
    'New':       { dot:'#b0a088', bg:'rgba(176,160,136,0.12)', ink:'#5a544c' },
    'Contacted': { dot:'#c8a978', bg:'rgba(200,169,120,0.15)', ink:'#7a5a3c' },
    'Working':   { dot:'#b87333', bg:'rgba(184,115,51,0.14)',  ink:'#8a4f1c' },
    'Qualified': { dot:'#7a5a3c', bg:'rgba(122,90,60,0.14)',   ink:'#5a3e24' },
    'Converted': { dot:'#4d6b3d', bg:'rgba(77,107,61,0.14)',   ink:'#3a5530' },
    'Dead':      { dot:'#9c3a2e', bg:'rgba(156,58,46,0.10)',   ink:'#7a2a22' },
};

const SOURCE_COLORS = {
    'LinkedIn': '#3a5a7a', 'Referral': '#7a5a3c', 'Trade Show': '#b87333',
    'Cold Outreach': '#5a544c', 'Webinar': '#4d6b3d',
    'Partner Referral': '#b0a088', 'Website': '#9aa89a',
};

const SCORE_COLORS = { hot:'#b85a35', warm:'#c89a6b', cool:'#9aa89a', cold:'#c9c0b0' };
const scoreBand = (s) => s >= 70 ? 'hot' : s >= 50 ? 'warm' : s >= 30 ? 'cool' : 'cold';

// ── Field normaliser — real DB schema → design fields ────────
const norm = (l) => ({
    id:       l.id,
    first:    l.firstName  || (l.name||'').split(' ')[0] || '',
    last:     l.lastName   || (l.name||'').split(' ').slice(1).join(' ') || '',
    company:  l.company    || l.accountName || '',
    title:    l.title      || l.jobTitle    || '',
    source:   l.source     || l.leadSource  || '',
    status:   l.status     || 'New',
    score:    parseFloat(l.score || l.leadScore) || 0,
    rev:      parseFloat(l.estimatedARR || l.rev || l.arr) || 0,
    assignee: l.assignedTo || l.assignee    || null,
    notes:    l.notes      || '',
    createdAt: l.createdAt || l.created_at  || null,
    lastTouch: l.lastActivity || l.lastTouch || null,
    raw:      l,
});

const fmtRev = (n) => n >= 1000000 ? '$'+(n/1000000).toFixed(1)+'M' : n >= 1000 ? '$'+Math.round(n/1000)+'K' : n > 0 ? '$'+n : '—';

const relAge = (iso) => {
    if (!iso) return null;
    const d = Math.floor((Date.now() - new Date(iso+'T12:00:00').getTime()) / 86400000);
    if (d === 0) return 'today';
    if (d === 1) return '1d';
    if (d < 30)  return d + 'd';
    if (d < 365) return Math.round(d/30) + 'mo';
    return Math.round(d/365) + 'yr';
};

// ── Avatar ───────────────────────────────────────────────────
const AV_PALETTE = ['#9c6b4a','#7a5a3c','#5a6e5a','#6b5a7a','#8a5a5a','#5a7a8a','#7a6b5a','#4a6b5a'];
const avBg = (name) => { let h=0; for (const c of (name||'')) h=(h*31+c.charCodeAt(0))|0; return AV_PALETTE[Math.abs(h)%AV_PALETTE.length]; };
const Av = ({ name, size=28 }) => {
    const init = (name||'').split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();
    return <div style={{ width:size, height:size, borderRadius:'50%', background:avBg(name), color:'#fef4e6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:Math.round(size*0.35), fontWeight:700, flexShrink:0 }}>{init}</div>;
};

// ── Shared lead primitives ────────────────────────────────────
const LeadScore = ({ score, size='md' }) => {
    const band = scoreBand(score);
    const color = SCORE_COLORS[band];
    const w = size==='sm' ? 30 : size==='lg' ? 42 : 36;
    const h = size==='sm' ? 22 : size==='lg' ? 30 : 26;
    const fs = size==='sm' ? 11 : size==='lg' ? 15 : 13;
    return (
        <div style={{ width:w, height:h, borderRadius:T.r, background: band==='hot' ? color : 'transparent', border: band==='hot' ? 'none' : `1.5px solid ${color}`, color: band==='hot' ? '#fbf8f3' : T.ink, display:'flex', alignItems:'center', justifyContent:'center', fontSize:fs, fontWeight:700, flexShrink:0 }}>
            {score || 0}
        </div>
    );
};

const LeadStatusPill = ({ status }) => {
    const s = STATUS_STYLES[status] || STATUS_STYLES['New'];
    return (
        <div style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 9px', background:s.bg, color:s.ink, fontSize:11, fontWeight:600, borderRadius:999, whiteSpace:'nowrap' }}>
            <div style={{ width:5, height:5, borderRadius:'50%', background:s.dot }}/>
            {status}
        </div>
    );
};

const LeadSourceChip = ({ source }) => (
    <div style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11.5, color:T.inkMid, fontWeight:500 }}>
        <div style={{ width:5, height:5, borderRadius:'50%', background:SOURCE_COLORS[source]||'#8a8378' }}/>
        {source || '—'}
    </div>
);

const LeadAssignee = ({ name, onClick }) => {
    if (!name) return (
        <button onClick={e => { e.stopPropagation(); onClick && onClick(); }} style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 9px', background:T.surface, border:`1px dashed ${T.borderStrong}`, color:T.goldInk, fontSize:11, fontWeight:600, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>
            + Assign
        </button>
    );
    return (
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <Av name={name} size={22}/>
            <span style={{ fontSize:12, color:T.inkMid, fontWeight:500 }}>{name.split(' ')[0]}</span>
        </div>
    );
};

// ── Right rail panels ─────────────────────────────────────────
const DistributePanel = ({ leads, repNames }) => {
    const unassigned = leads.filter(l => !l.assignee).length;
    const loadByRep = repNames.map(name => ({ name, count: leads.filter(l => l.assignee === name).length }))
        .sort((a,b) => a.count - b.count).slice(0, 8);
    const maxLoad = Math.max(...loadByRep.map(r => r.count), 1);
    return (
        <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderLeft:`3px solid ${T.gold}`, borderRadius:T.r, padding:'12px 14px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                <div style={{ fontSize:11, fontWeight:700, color:T.ink, textTransform:'uppercase', letterSpacing:0.8, fontFamily:T.sans }}>Distribute Leads</div>
                <span style={{ fontSize:10, color:T.inkMuted, fontWeight:600, fontFamily:T.sans }}>{unassigned} unassigned</span>
            </div>
            {loadByRep.map(r => (
                <div key={r.name} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0' }}>
                    <Av name={r.name} size={22}/>
                    <div style={{ fontSize:11.5, color:T.ink, flex:1, fontWeight:500, fontFamily:T.sans, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.name}</div>
                    <div style={{ width:44, height:4, background:T.surface2, borderRadius:2, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:(r.count/maxLoad*100)+'%', background:T.goldInk }}/>
                    </div>
                    <div style={{ fontSize:11, color:T.inkMid, fontWeight:600, width:12, textAlign:'right', fontFamily:T.sans }}>{r.count}</div>
                </div>
            ))}
            <button style={{ marginTop:10, width:'100%', background:T.ink, color:T.surface, border:'none', borderRadius:T.r, padding:'7px 12px', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:T.sans, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                Auto-assign all
            </button>
        </div>
    );
};

const LeadSourcesPanel = ({ leads }) => {
    const sourceMap = {};
    leads.forEach(l => { if (l.source) sourceMap[l.source] = (sourceMap[l.source]||0) + 1; });
    const sources = Object.entries(sourceMap).sort((a,b)=>b[1]-a[1]).map(([name,count]) => ({
        name, count, pct: Math.round(count/leads.length*100), color: SOURCE_COLORS[name]||'#8a8378',
    }));
    return (
        <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r, padding:'12px 14px' }}>
            <div style={{ fontSize:11, fontWeight:700, color:T.ink, textTransform:'uppercase', letterSpacing:0.8, marginBottom:10, fontFamily:T.sans }}>Lead Sources</div>
            {sources.map(s => (
                <div key={s.name} style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0' }}>
                    <div style={{ width:5, height:5, borderRadius:'50%', background:s.color, flexShrink:0 }}/>
                    <div style={{ fontSize:11.5, color:T.inkMid, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:T.sans }}>{s.name}</div>
                    <div style={{ width:50, height:3, background:T.surface2, borderRadius:2, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:s.pct+'%', background:s.color }}/>
                    </div>
                    <div style={{ fontSize:11, color:T.inkMid, fontWeight:600, width:30, textAlign:'right', fontFamily:T.sans }}>{s.pct}%</div>
                </div>
            ))}
            {sources.length === 0 && <div style={{ fontSize:12, color:T.inkMuted, fontFamily:T.sans }}>No leads yet.</div>}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// TRIAGE VIEW (V1)
// ─────────────────────────────────────────────────────────────
const TriageCard = ({ lead, accent, onClick }) => {
    const [hov, setHov] = useState(false);
    return (
        <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
            onClick={onClick}
            style={{ flex:'0 0 260px', background:T.surface, border:`1px solid ${hov ? T.borderStrong : T.border}`, borderLeft:`3px solid ${accent}`, borderRadius:T.r, padding:'10px 12px', cursor:'pointer', transition:'all 120ms', transform: hov ? 'translateY(-1px)' : 'none' }}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:8 }}>
                <LeadScore score={lead.score} size="sm"/>
                <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:T.ink, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', fontFamily:T.sans }}>{lead.first} {lead.last}</div>
                    <div style={{ fontSize:11, color:T.inkMuted, marginTop:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', fontFamily:T.sans }}>{lead.company}</div>
                </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, paddingTop:8, borderTop:`1px solid ${T.border}` }}>
                <LeadSourceChip source={lead.source}/>
                <div style={{ flex:1 }}/>
                <div style={{ fontSize:12, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{fmtRev(lead.rev)}</div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:8 }}>
                <LeadAssignee name={lead.assignee}/>
                <div style={{ flex:1 }}/>
                <span style={{ fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>
                    {lead.lastTouch ? relAge(lead.lastTouch) + ' ago' : 'not yet touched'}
                </span>
            </div>
        </div>
    );
};

const TriageLane = ({ title, subtitle, leads, accent, icon, onOpenLead }) => {
    if (leads.length === 0) return null;
    return (
        <div style={{ marginBottom:18 }}>
            <div style={{ display:'flex', alignItems:'flex-end', gap:10, padding:'0 0 8px' }}>
                <div style={{ width:3, height:22, background:accent, borderRadius:1.5 }}/>
                <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'baseline', gap:8 }}>
                        <div style={{ fontSize:15, fontFamily:T.serif, fontStyle:'italic', color:T.ink, lineHeight:1 }}>{title}</div>
                        <div style={{ fontSize:11, color:T.inkMuted, fontWeight:500, fontFamily:T.sans }}>{leads.length}</div>
                    </div>
                    <div style={{ fontSize:11, color:T.inkMuted, marginTop:3, fontFamily:T.sans }}>{subtitle}</div>
                </div>
                <span style={{ fontSize:11, color:T.inkMid, fontWeight:500, cursor:'pointer', display:'flex', alignItems:'center', gap:4, fontFamily:T.sans }}>
                    See all
                </span>
            </div>
            <div style={{ display:'flex', gap:10, overflow:'auto', paddingBottom:4 }}>
                {leads.map(l => (
                    <TriageCard key={l.id} lead={l} accent={accent} onClick={() => onOpenLead && onOpenLead(l.id)}/>
                ))}
            </div>
        </div>
    );
};

const TriageView = ({ leads, repNames, onOpenLead, setLeads, showConfirm }) => {
    const [statusFilter, setStatusFilter] = useState('all');
    const [selected,     setSelected    ] = useState({});
    const [search,       setSearch      ] = useState('');

    const hot          = leads.filter(l => l.score >= 70 && l.status !== 'Converted' && l.status !== 'Dead');
    const newUnassigned = leads.filter(l => l.status === 'New' && !l.assignee);
    const working      = leads.filter(l => l.status === 'Working');

    const filters = [
        { k:'all',       l:'All',        c:leads.length },
        { k:'hot',       l:'Hot',        c:leads.filter(l=>l.score>=70).length, dot:SCORE_COLORS.hot },
        { k:'new',       l:'New',        c:leads.filter(l=>l.status==='New').length, dot:STATUS_STYLES.New.dot },
        { k:'working',   l:'Working',    c:leads.filter(l=>l.status==='Working').length, dot:STATUS_STYLES.Working.dot },
        { k:'unassigned',l:'Unassigned', c:leads.filter(l=>!l.assignee).length, dot:T.goldInk },
    ];

    const matchesFilter = (l) => {
        if (statusFilter === 'hot')       return l.score >= 70;
        if (statusFilter === 'new')       return l.status === 'New';
        if (statusFilter === 'working')   return l.status === 'Working';
        if (statusFilter === 'unassigned')return !l.assignee;
        return true;
    };

    const allForTable = useMemo(() => {
        let list = leads.filter(matchesFilter);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(l => (l.first+' '+l.last+' '+l.company+' '+l.title).toLowerCase().includes(q));
        }
        return list.sort((a,b) => b.score - a.score);
    }, [leads, statusFilter, search]);

    const selCount = Object.values(selected).filter(Boolean).length;
    const totalRev = leads.reduce((s,l)=>s+l.rev,0);

    return (
        <div style={{ flex:1, minHeight:0, overflow:'hidden', display:'flex', flexDirection:'column' }}>
            {/* Filter bar */}
            <div style={{ padding:'0 0 14px', display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                {filters.map(chip => {
                    const active = statusFilter === chip.k;
                    return (
                        <button key={chip.k} onClick={() => setStatusFilter(chip.k)} style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'5px 10px', border:`1px solid ${active ? T.ink : T.border}`, background: active ? T.ink : T.surface, color: active ? T.surface : T.ink, fontSize:11.5, fontWeight:500, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>
                            {chip.dot && <div style={{ width:6, height:6, borderRadius:'50%', background:chip.dot }}/>}
                            {chip.l}
                            <span style={{ background: active ? 'rgba(255,255,255,0.18)' : T.surface2, padding:'1px 6px', borderRadius:8, fontSize:10, fontWeight:600, color: active ? T.surface : T.inkMuted }}>{chip.c}</span>
                        </button>
                    );
                })}
                <div style={{ flex:1 }}/>
                {/* Search */}
                <div style={{ display:'flex', alignItems:'center', gap:6, background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r, padding:'4px 10px', width:240 }}>
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={T.inkMuted} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search leads…" style={{ border:'none', outline:'none', background:'transparent', fontSize:12, color:T.ink, fontFamily:T.sans, flex:1 }}/>
                    {search && <button onClick={() => setSearch('')} style={{ background:'none', border:'none', color:T.inkMuted, cursor:'pointer', fontSize:14, padding:0 }}>×</button>}
                </div>
            </div>

            {/* Body */}
            <div style={{ flex:1, minHeight:0, overflow:'hidden', display:'flex', gap:14 }}>
                {/* Main */}
                <div style={{ flex:1, minWidth:0, overflow:'auto' }}>
                    {/* Triage lanes — only when filter is 'all' and no search */}
                    {statusFilter === 'all' && !search.trim() && (
                        <>
                            <TriageLane title="Call today" subtitle="Score 70+ — highest-intent leads in play" leads={hot} accent={SCORE_COLORS.hot} icon="flame" onOpenLead={onOpenLead}/>
                            <TriageLane title="Needs first touch" subtitle="New leads not yet assigned" leads={newUnassigned} accent={T.goldInk} icon="sparkle" onOpenLead={onOpenLead}/>
                            <TriageLane title="Working" subtitle="Active conversations — keep the ball moving" leads={working} accent={STATUS_STYLES.Working.dot} icon="trending" onOpenLead={onOpenLead}/>
                        </>
                    )}

                    {/* Full table */}
                    <div style={{ marginTop: statusFilter === 'all' && !search.trim() ? 10 : 0 }}>
                        <div style={{ display:'flex', alignItems:'flex-end', gap:10, padding:'0 0 8px' }}>
                            <div style={{ width:3, height:22, background:T.inkMuted, borderRadius:1.5 }}/>
                            <div style={{ flex:1 }}>
                                <div style={{ fontSize:15, fontFamily:T.serif, fontStyle:'italic', color:T.ink, lineHeight:1 }}>
                                    All leads <span style={{ fontSize:11, color:T.inkMuted, fontWeight:500, fontFamily:T.sans, fontStyle:'normal', marginLeft:6 }}>{allForTable.length}</span>
                                </div>
                                <div style={{ fontSize:11, color:T.inkMuted, marginTop:3, fontFamily:T.sans }}>Sorted by score · highest first</div>
                            </div>
                        </div>

                        {selCount > 0 && (
                            <div style={{ marginBottom:8, padding:'8px 14px', background:T.ink, color:T.surface, borderRadius:T.r, display:'flex', alignItems:'center', gap:12, fontSize:12, fontFamily:T.sans }}>
                                <span style={{ fontWeight:600 }}>{selCount} selected</span>
                                <span style={{ opacity:0.5 }}>·</span>
                                <span style={{ cursor:'pointer' }}>Assign</span>
                                <span style={{ opacity:0.5 }}>·</span>
                                <span style={{ cursor:'pointer' }}>Change status</span>
                                <span style={{ opacity:0.5 }}>·</span>
                                <span style={{ cursor:'pointer' }}>Convert to opportunity</span>
                                <div style={{ flex:1 }}/>
                                <span style={{ opacity:0.6, cursor:'pointer', fontSize:11 }} onClick={() => setSelected({})}>Clear</span>
                            </div>
                        )}

                        <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r, overflow:'hidden' }}>
                            {/* Column headers */}
                            <div style={{ display:'grid', gridTemplateColumns:'26px 50px 2fr 1fr 110px 1fr 90px 70px', gap:10, padding:'9px 14px', borderBottom:`1px solid ${T.border}`, background:T.surface2, alignItems:'center', fontSize:10, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.6, fontFamily:T.sans }}>
                                <div/><div>Score</div><div>Name · Company</div><div>Source</div><div>Status</div><div>Assignee</div><div style={{ textAlign:'right' }}>Est. ARR</div><div/>
                            </div>

                            {allForTable.length === 0 ? (
                                <div style={{ padding:'3rem', textAlign:'center', color:T.inkMuted, fontSize:13, fontStyle:'italic', fontFamily:T.sans }}>
                                    {search ? `No leads match "${search}".` : 'No leads in this filter.'}
                                </div>
                            ) : allForTable.map(l => {
                                const isSel = !!selected[l.id];
                                return (
                                    <div key={l.id}
                                        onClick={() => onOpenLead && onOpenLead(l.id)}
                                        style={{ display:'grid', gridTemplateColumns:'26px 50px 2fr 1fr 110px 1fr 90px 70px', gap:10, padding:'10px 14px', borderBottom:`1px solid ${T.border}`, alignItems:'center', cursor:'pointer', background: isSel ? 'rgba(200,185,154,0.12)' : 'transparent', transition:'background 100ms' }}
                                        onMouseEnter={e => { if (!isSel) e.currentTarget.style.background='rgba(200,185,154,0.06)'; }}
                                        onMouseLeave={e => { if (!isSel) e.currentTarget.style.background=isSel?'rgba(200,185,154,0.12)':'transparent'; }}>
                                        <div onClick={e => { e.stopPropagation(); setSelected(s => ({ ...s, [l.id]:!s[l.id] })); }}
                                            style={{ width:16, height:16, borderRadius:3, border:`1.5px solid ${isSel ? T.ink : T.borderStrong}`, background: isSel ? T.ink : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                                            {isSel && <span style={{ color:T.surface, fontSize:9, fontWeight:800 }}>✓</span>}
                                        </div>
                                        <LeadScore score={l.score}/>
                                        <div style={{ minWidth:0 }}>
                                            <div style={{ fontSize:13, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{l.first} {l.last}</div>
                                            <div style={{ fontSize:11, color:T.inkMuted, marginTop:1, fontFamily:T.sans }}>{l.company} {l.title && <span style={{ opacity:0.5 }}>· {l.title}</span>}</div>
                                        </div>
                                        <LeadSourceChip source={l.source}/>
                                        <LeadStatusPill status={l.status}/>
                                        <LeadAssignee name={l.assignee}/>
                                        <div style={{ textAlign:'right', fontSize:13, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{fmtRev(l.rev)}</div>
                                        <div style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
                                            <button onClick={e => { e.stopPropagation(); }} title="Convert to opportunity" style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:26, height:26, background:'transparent', border:`1px solid ${T.border}`, borderRadius:T.r, color:T.inkMid, cursor:'pointer', fontFamily:T.sans, fontSize:11 }}>↗</button>
                                            <button onClick={e => { e.stopPropagation(); }} title="More" style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:26, height:26, background:'transparent', border:`1px solid ${T.border}`, borderRadius:T.r, color:T.inkMid, cursor:'pointer' }}>···</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Right rail */}
                <div style={{ width:260, flexShrink:0, display:'flex', flexDirection:'column', gap:12, overflow:'auto' }}>
                    <DistributePanel leads={leads} repNames={repNames}/>
                    <LeadSourcesPanel leads={leads}/>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// COCKPIT VIEW (V3) — split list + detail
// ─────────────────────────────────────────────────────────────
const CockpitListRow = ({ lead, active, onClick }) => (
    <div onClick={onClick}
        style={{ display:'grid', gridTemplateColumns:'38px 1fr auto', gap:10, padding:'10px 12px', borderLeft:`3px solid ${active ? SCORE_COLORS[scoreBand(lead.score)] : 'transparent'}`, background: active ? T.surface2 : 'transparent', borderBottom:`1px solid ${T.border}`, alignItems:'center', cursor:'pointer' }}
        onMouseEnter={e => { if (!active) e.currentTarget.style.background='rgba(200,185,154,0.06)'; }}
        onMouseLeave={e => { if (!active) e.currentTarget.style.background=active?T.surface2:'transparent'; }}>
        <LeadScore score={lead.score} size="sm"/>
        <div style={{ minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight: active ? 700 : 600, color:T.ink, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', fontFamily:T.sans }}>{lead.first} {lead.last}</div>
            <div style={{ fontSize:11, color:T.inkMuted, marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', fontFamily:T.sans }}>{lead.company}</div>
        </div>
        <LeadStatusPill status={lead.status}/>
    </div>
);

const CockpitDetail = ({ lead, onSave, saving }) => {
    if (!lead) return (
        <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r, height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:T.inkMuted, fontSize:13, fontStyle:'italic', fontFamily:T.sans }}>
            Select a lead from the list
        </div>
    );

    const nextAction = lead.status === 'New' && !lead.assignee ? 'Assign to a rep'
        : lead.status === 'New'       ? 'Send first-touch email'
        : lead.status === 'Contacted' ? 'Schedule qualification call'
        : lead.status === 'Working'   ? 'Check in — keep the ball moving'
        : lead.status === 'Qualified' ? 'Convert to opportunity'
        : lead.status === 'Converted' ? 'Handoff complete — review opp'
        : 'Archive this lead';

    const timeline = [
        { label:'Lead created', time: lead.createdAt ? relAge(lead.createdAt)+' ago' : '—', icon:'✦' },
        lead.source && { label:`Came from ${lead.source}`, time: lead.createdAt ? relAge(lead.createdAt)+' ago' : '—', icon:'●' },
        lead.assignee && { label:`Assigned to ${lead.assignee}`, time:'—', icon:'◎' },
        lead.lastTouch && { label:'Last outreach', time: relAge(lead.lastTouch)+' ago', icon:'✉' },
    ].filter(Boolean);

    return (
        <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r, height:'100%', overflow:'auto', display:'flex', flexDirection:'column' }}>
            {/* Hero */}
            <div style={{ padding:'18px 22px 16px', borderBottom:`1px solid ${T.border}`, background:T.surface2 }}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:14 }}>
                    <LeadScore score={lead.score} size="lg"/>
                    <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'baseline', gap:10, flexWrap:'wrap' }}>
                            <div style={{ fontFamily:T.serif, fontStyle:'italic', fontWeight:300, fontSize:24, color:T.ink, letterSpacing:-0.4, lineHeight:1 }}>{lead.first} {lead.last}</div>
                            <LeadStatusPill status={lead.status}/>
                        </div>
                        <div style={{ fontSize:12.5, color:T.inkMid, marginTop:5, fontFamily:T.sans }}>
                            {lead.title} {lead.title && lead.company && <span style={{ color:T.inkMuted }}> at </span>} <strong style={{ fontWeight:600 }}>{lead.company}</strong>
                        </div>
                        <div style={{ display:'flex', gap:14, marginTop:10, alignItems:'center', flexWrap:'wrap' }}>
                            <LeadSourceChip source={lead.source}/>
                            {lead.rev > 0 && <>
                                <span style={{ opacity:0.4, color:T.inkMuted }}>·</span>
                                <div style={{ fontSize:12, color:T.inkMid, fontFamily:T.sans }}>
                                    <span style={{ color:T.inkMuted }}>Est. ARR</span>{' '}
                                    <strong style={{ fontWeight:600 }}>{fmtRev(lead.rev)}</strong>
                                </div>
                            </>}
                            {lead.createdAt && <>
                                <span style={{ opacity:0.4, color:T.inkMuted }}>·</span>
                                <div style={{ fontSize:12, color:T.inkMid, fontFamily:T.sans }}>
                                    <span style={{ color:T.inkMuted }}>Created</span> {relAge(lead.createdAt)} ago
                                </div>
                            </>}
                        </div>
                    </div>
                </div>
                <div style={{ display:'flex', gap:6, marginTop:12, flexWrap:'wrap' }}>
                    <button style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 12px', background:T.ink, border:'none', color:T.surface, fontSize:12, fontWeight:600, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>↗ Convert to opportunity</button>
                    {['Email','Call','Schedule'].map(a => (
                        <button key={a} style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'5px 10px', background:'transparent', border:`1px solid ${T.border}`, color:T.ink, fontSize:12, fontWeight:500, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>{a}</button>
                    ))}
                    <div style={{ flex:1 }}/>
                    <button style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'5px 10px', background:'transparent', border:`1px solid ${T.border}`, color:T.ink, fontSize:12, fontWeight:500, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>···</button>
                </div>
            </div>

            {/* Next action */}
            <div style={{ padding:'14px 22px', borderBottom:`1px solid ${T.border}` }}>
                <div style={{ fontSize:11, fontWeight:700, color:T.goldInk, textTransform:'uppercase', letterSpacing:0.8, marginBottom:6, fontFamily:T.sans }}>Recommended next action</div>
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'rgba(200,185,154,0.15)', border:`1px solid ${T.gold}`, borderRadius:T.r }}>
                    <div style={{ flex:1, fontSize:13, color:T.ink, fontWeight:500, fontFamily:T.sans }}>{nextAction}</div>
                    <button style={{ background:T.ink, color:T.surface, border:'none', borderRadius:T.r, padding:'5px 12px', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Do it</button>
                </div>
            </div>

            {/* Assignee */}
            <div style={{ padding:'14px 22px', borderBottom:`1px solid ${T.border}` }}>
                <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.8, marginBottom:6, fontFamily:T.sans }}>Assigned to</div>
                {lead.assignee ? (
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <Av name={lead.assignee} size={32}/>
                        <div style={{ flex:1 }}>
                            <div style={{ fontSize:13, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{lead.assignee}</div>
                            <div style={{ fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>AE · owner{lead.createdAt ? ' since '+relAge(lead.createdAt)+' ago' : ''}</div>
                        </div>
                        <button style={{ padding:'5px 10px', background:'transparent', border:`1px solid ${T.border}`, color:T.ink, fontSize:12, fontWeight:500, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>Reassign</button>
                    </div>
                ) : (
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{ width:32, height:32, borderRadius:'50%', border:`1px dashed ${T.borderStrong}`, color:T.goldInk, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>+</div>
                        <div style={{ flex:1, fontSize:13, color:T.inkMid, fontFamily:T.sans }}>Not yet assigned</div>
                        <button style={{ padding:'6px 12px', background:T.ink, border:'none', color:T.surface, fontSize:12, fontWeight:600, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>Assign now</button>
                    </div>
                )}
            </div>

            {/* Notes */}
            {lead.notes && (
                <div style={{ padding:'14px 22px', borderBottom:`1px solid ${T.border}` }}>
                    <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.8, marginBottom:6, fontFamily:T.sans }}>Notes</div>
                    <div style={{ fontSize:12.5, color:T.inkMid, lineHeight:1.5, fontFamily:T.sans }}>{lead.notes}</div>
                </div>
            )}

            {/* Activity timeline */}
            <div style={{ padding:'14px 22px' }}>
                <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.8, marginBottom:10, fontFamily:T.sans }}>Activity</div>
                <div style={{ position:'relative', paddingLeft:18 }}>
                    <div style={{ position:'absolute', left:6, top:6, bottom:6, width:1, background:T.border }}/>
                    {timeline.map((t, i) => (
                        <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:10, position:'relative' }}>
                            <div style={{ position:'absolute', left:-18, top:2, width:13, height:13, borderRadius:'50%', background:T.surface, border:`1.5px solid ${T.borderStrong}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:7, color:T.inkMid }}>
                                {t.icon}
                            </div>
                            <div style={{ flex:1 }}>
                                <div style={{ fontSize:12.5, color:T.ink, fontWeight:500, fontFamily:T.sans }}>{t.label}</div>
                                <div style={{ fontSize:11, color:T.inkMuted, marginTop:1, fontFamily:T.sans }}>{t.time}</div>
                            </div>
                        </div>
                    ))}
                    {timeline.length === 0 && <div style={{ fontSize:12, color:T.inkMuted, fontStyle:'italic', fontFamily:T.sans }}>No activity yet.</div>}
                </div>
            </div>
        </div>
    );
};

const CockpitView = ({ leads, onClose }) => {
    const sorted = useMemo(() => [...leads].sort((a,b) => b.score - a.score), [leads]);
    const [filter,     setFilter    ] = useState('all');
    const [selectedId, setSelectedId] = useState(() => sorted[0]?.id || null);

    const filterDefs = [
        { k:'all',       l:'All',        c:leads.length },
        { k:'hot',       l:'Hot',        c:leads.filter(l=>l.score>=70).length, dot:SCORE_COLORS.hot },
        { k:'new',       l:'New',        c:leads.filter(l=>l.status==='New').length, dot:STATUS_STYLES.New.dot },
        { k:'unassigned',l:'Unassigned', c:leads.filter(l=>!l.assignee).length, dot:T.goldInk },
    ];

    const filtered = sorted.filter(l => {
        if (filter === 'hot')       return l.score >= 70;
        if (filter === 'new')       return l.status === 'New';
        if (filter === 'unassigned')return !l.assignee;
        return true;
    });

    const selected = leads.find(l => l.id === selectedId) || sorted[0] || null;

    return (
        <div style={{ flex:1, minHeight:0, display:'flex', gap:12 }}>
            {/* Left list */}
            <div style={{ width:300, flexShrink:0, background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r, display:'flex', flexDirection:'column', overflow:'hidden' }}>
                <div style={{ padding:'10px 12px', borderBottom:`1px solid ${T.border}`, background:T.surface2 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r, padding:'4px 10px', marginBottom:8 }}>
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={T.inkMuted} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
                        <span style={{ fontSize:12, color:T.inkMuted, fontFamily:T.sans }}>Search leads…</span>
                    </div>
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                        {filterDefs.map(f => {
                            const active = filter === f.k;
                            return (
                                <button key={f.k} onClick={() => setFilter(f.k)} style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 8px', border:`1px solid ${active ? T.ink : T.border}`, background: active ? T.ink : T.surface, color: active ? T.surface : T.ink, fontSize:11, fontWeight:500, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>
                                    {f.dot && <div style={{ width:5, height:5, borderRadius:'50%', background:f.dot }}/>}
                                    {f.l}
                                    <span style={{ background: active ? 'rgba(255,255,255,0.18)' : T.surface2, padding:'0 5px', borderRadius:6, fontSize:10, fontWeight:600, color: active ? T.surface : T.inkMuted }}>{f.c}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div style={{ flex:1, overflow:'auto' }}>
                    {filtered.length === 0 ? (
                        <div style={{ padding:'2rem', textAlign:'center', color:T.inkMuted, fontSize:13, fontStyle:'italic', fontFamily:T.sans }}>No leads match.</div>
                    ) : filtered.map(l => (
                        <CockpitListRow key={l.id} lead={l} active={l.id === selectedId} onClick={() => setSelectedId(l.id)}/>
                    ))}
                </div>
            </div>

            {/* Detail pane */}
            <div style={{ flex:1, minWidth:0 }}>
                <CockpitDetail lead={selected}/>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────
export default function LeadsTab() {
    const {
        leads: rawLeads, setLeads,
        settings, currentUser, userRole,
        showConfirm, exportToCSV,
    } = useApp();

    const [tab, setTab] = useState(() => {
        try { return localStorage.getItem('tab:leads:subTab') || 'triage'; } catch { return 'triage'; }
    });

    const setTabPersist = useCallback((t) => {
        setTab(t);
        try { localStorage.setItem('tab:leads:subTab', t); } catch {}
    }, []);

    // Normalise real DB leads to design field names
    const leads = useMemo(() => (rawLeads || []).map(norm), [rawLeads]);

    // Rep names from settings for the Distribute panel
    const repNames = useMemo(() =>
        (settings?.users || []).filter(u => u.name && u.userType !== 'ReadOnly').map(u => u.name).sort(),
    [settings]);

    const openInCockpit = useCallback((id) => {
        setTabPersist('cockpit');
        // cockpit will auto-select the passed id via its own state management
    }, [setTabPersist]);

    const totalRev = leads.reduce((s,l) => s + l.rev, 0);
    const hotCount = leads.filter(l => l.score >= 70).length;
    const unassigned = leads.filter(l => !l.assignee).length;

    const subtitle = tab === 'triage'
        ? `${leads.length} leads · ${hotCount} hot · ${unassigned} unassigned · est. pipeline ${fmtRev(totalRev)}`
        : `Work one lead at a time — next-best action, timeline, assignment`;

    return (
        <div className="tab-page" style={{ fontFamily:T.sans, display:'flex', flexDirection:'column', height:'100%' }}>
            {/* Page header */}
            <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', paddingBottom:0 }}>
                <div>
                    <div style={{ fontSize:28, fontFamily:T.serif, fontStyle:'italic', fontWeight:300, letterSpacing:-0.8, color:T.ink, lineHeight:1, marginBottom:5 }}>Leads</div>
                    <div style={{ fontSize:12, color:T.inkMuted, fontFamily:T.sans }}>{subtitle}</div>
                </div>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                    <button style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'5px 10px', background:'transparent', border:`1px solid ${T.border}`, color:T.ink, fontSize:12, fontWeight:500, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>↗ Import</button>
                    <button style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 12px', background:T.ink, border:'none', color:T.surface, fontSize:12, fontWeight:600, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>+ New lead</button>
                </div>
            </div>

            {/* Sub-tab strip */}
            <div style={{ display:'flex', alignItems:'flex-end', gap:0, borderBottom:`1px solid ${T.border}`, marginBottom:14, marginTop:12 }}>
                {[
                    { k:'triage',  label:'Triage',  sub:'Scan and dispatch' },
                    { k:'cockpit', label:'Cockpit', sub:'Focused work' },
                ].map(t => {
                    const active = tab === t.k;
                    return (
                        <button key={t.k} onClick={() => setTabPersist(t.k)} style={{ position:'relative', padding:'10px 18px 11px', background:'transparent', border:'none', cursor:'pointer', fontFamily:T.sans, textAlign:'left', borderBottom: active ? `2px solid ${T.ink}` : '2px solid transparent', marginBottom:-1, transition:'border-color 120ms' }}>
                            <div style={{ fontSize:14, fontWeight: active ? 700 : 500, color: active ? T.ink : T.inkMid, letterSpacing:-0.1, fontFamily:T.sans }}>{t.label}</div>
                            <div style={{ fontSize:10.5, color: active ? T.inkMid : T.inkMuted, marginTop:1, fontWeight:500, letterSpacing:0.3, fontFamily:T.sans }}>{t.sub}</div>
                        </button>
                    );
                })}
            </div>

            {/* Tab body */}
            <div style={{ flex:1, minHeight:0, overflow:'hidden', display:'flex', flexDirection:'column' }}>
                {tab === 'triage' && (
                    <TriageView
                        leads={leads}
                        repNames={repNames}
                        onOpenLead={openInCockpit}
                        setLeads={setLeads}
                        showConfirm={showConfirm}
                    />
                )}
                {tab === 'cockpit' && (
                    <CockpitView leads={leads}/>
                )}
            </div>
        </div>
    );
}
