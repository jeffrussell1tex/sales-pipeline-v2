// settings/people/RolesDetail.jsx
import React, { useState, useEffect } from 'react';
import { useApp } from '../../../AppContext';
import { dbFetch } from '../../../utils/storage';
import { T } from '../shared/tokens.js';

const ScopeBadge = ({ scope }) => {
    const map = {
        'ALL':  { bg:'rgba(77,107,61,0.12)',   fg:'#4d6b3d' },
        'TEAM': { bg:'rgba(58,90,122,0.12)',   fg:'#3a5a7a' },
        'OWN':  { bg:'rgba(184,115,51,0.12)',  fg:'#b87333' },
        '—':    { bg:'transparent',            fg:T.inkMuted },
    };
    const c = map[scope] || map['—'];
    return (
        <span style={{ display:'inline-block', padding:'2px 7px', borderRadius:3, fontSize:10.5, fontWeight:700, background:c.bg, color:c.fg, fontFamily:T.sans, letterSpacing:0.4 }}>
            {scope}
        </span>
    );
};

const PermDot = ({ on }) => on
    ? <span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background:T.ok }}/>
    : <span style={{ color:T.border, fontSize:14, lineHeight:1 }}>—</span>;

const PT_ROLES = [
    { id:'r1', name:'Admin',         userCount:2,  sys:true  },
    { id:'r2', name:'Sales Manager', userCount:4,  sys:true  },
    { id:'r3', name:'Sales Rep',     userCount:28, sys:true  },
    { id:'r4', name:'Customer Success', userCount:6, sys:false },
    { id:'r5', name:'Finance / CFO', userCount:2,  sys:true  },
];

const PT_PERM_OBJECTS = [
    { id:'o1', name:'Leads',            sub:'Pre-qualified contacts in the funnel' },
    { id:'o2', name:'Accounts',         sub:'Customer organizations' },
    { id:'o3', name:'Contacts',         sub:'People at accounts' },
    { id:'o4', name:'Opportunities',    sub:'Pipeline deals' },
    { id:'o5', name:'Quotes',           sub:'Pricing & proposal documents' },
    { id:'o6', name:'Price book',       sub:'Catalog, list prices, rules' },
    { id:'o7', name:'Reports',          sub:'Saved reports & dashboards' },
    { id:'o8', name:'Settings',         sub:'Workspace administration' },
    { id:'o9', name:'Billing & contracts', sub:'Subscriptions, invoices, MRR' },
];

const PT_PERMS = {
    // Admin
    r1: {
        o1:{ view:'ALL', create:true,  edit:true,  delete:true,  export:true,  share:'ALL', approve:true  },
        o2:{ view:'ALL', create:true,  edit:true,  delete:true,  export:true,  share:'ALL', approve:true  },
        o3:{ view:'ALL', create:true,  edit:true,  delete:true,  export:true,  share:'ALL', approve:true  },
        o4:{ view:'ALL', create:true,  edit:true,  delete:true,  export:true,  share:'ALL', approve:true  },
        o5:{ view:'ALL', create:true,  edit:true,  delete:true,  export:true,  share:'ALL', approve:true  },
        o6:{ view:'ALL', create:true,  edit:true,  delete:true,  export:true,  share:'ALL', approve:true  },
        o7:{ view:'ALL', create:true,  edit:true,  delete:true,  export:true,  share:'ALL', approve:true  },
        o8:{ view:'ALL', create:true,  edit:true,  delete:true,  export:false, share:'—',   approve:false },
        o9:{ view:'ALL', create:true,  edit:true,  delete:false, export:true,  share:'—',   approve:true  },
    },
    // Sales Manager
    r2: {
        o1:{ view:'TEAM', create:true, edit:true,  delete:false, export:true,  share:'TEAM', approve:false },
        o2:{ view:'TEAM', create:true, edit:true,  delete:false, export:true,  share:'TEAM', approve:false },
        o3:{ view:'TEAM', create:true, edit:true,  delete:false, export:true,  share:'TEAM', approve:false },
        o4:{ view:'TEAM', create:true, edit:true,  delete:false, export:true,  share:'TEAM', approve:true  },
        o5:{ view:'TEAM', create:true, edit:true,  delete:false, export:true,  share:'TEAM', approve:true  },
        o6:{ view:'ALL',  create:false,edit:false, delete:false, export:false, share:'—',    approve:false },
        o7:{ view:'TEAM', create:true, edit:true,  delete:false, export:true,  share:'TEAM', approve:false },
        o8:{ view:'—',    create:false,edit:false, delete:false, export:false, share:'—',    approve:false },
        o9:{ view:'—',    create:false,edit:false, delete:false, export:false, share:'—',    approve:false },
    },
    // Sales Rep
    r3: {
        o1:{ view:'OWN', create:true, edit:true,  delete:false, export:false, share:'OWN', approve:false },
        o2:{ view:'OWN', create:true, edit:true,  delete:false, export:false, share:'OWN', approve:false },
        o3:{ view:'OWN', create:true, edit:true,  delete:false, export:false, share:'OWN', approve:false },
        o4:{ view:'OWN', create:true, edit:true,  delete:false, export:false, share:'OWN', approve:false },
        o5:{ view:'OWN', create:true, edit:true,  delete:false, export:false, share:'OWN', approve:false },
        o6:{ view:'ALL', create:false,edit:false, delete:false, export:false, share:'—',   approve:false },
        o7:{ view:'OWN', create:true, edit:true,  delete:false, export:false, share:'OWN', approve:false },
        o8:{ view:'—',   create:false,edit:false, delete:false, export:false, share:'—',   approve:false },
        o9:{ view:'—',   create:false,edit:false, delete:false, export:false, share:'—',   approve:false },
    },
    // Customer Success
    r4: {
        o1:{ view:'ALL', create:false,edit:false, delete:false, export:false, share:'OWN', approve:false },
        o2:{ view:'ALL', create:false,edit:true,  delete:false, export:false, share:'OWN', approve:false },
        o3:{ view:'ALL', create:true, edit:true,  delete:false, export:false, share:'OWN', approve:false },
        o4:{ view:'ALL', create:false,edit:false, delete:false, export:false, share:'—',   approve:false },
        o5:{ view:'ALL', create:false,edit:false, delete:false, export:false, share:'—',   approve:false },
        o6:{ view:'ALL', create:false,edit:false, delete:false, export:false, share:'—',   approve:false },
        o7:{ view:'ALL', create:false,edit:false, delete:false, export:true,  share:'OWN', approve:false },
        o8:{ view:'—',   create:false,edit:false, delete:false, export:false, share:'—',   approve:false },
        o9:{ view:'—',   create:false,edit:false, delete:false, export:false, share:'—',   approve:false },
    },
    // Finance / CFO
    r5: {
        o1:{ view:'—',   create:false,edit:false, delete:false, export:false, share:'—',   approve:false },
        o2:{ view:'ALL', create:false,edit:false, delete:false, export:true,  share:'—',   approve:false },
        o3:{ view:'—',   create:false,edit:false, delete:false, export:false, share:'—',   approve:false },
        o4:{ view:'ALL', create:false,edit:false, delete:false, export:true,  share:'—',   approve:true  },
        o5:{ view:'ALL', create:false,edit:false, delete:false, export:true,  share:'—',   approve:true  },
        o6:{ view:'ALL', create:false,edit:true,  delete:false, export:true,  share:'—',   approve:false },
        o7:{ view:'ALL', create:true, edit:true,  delete:false, export:true,  share:'ALL', approve:false },
        o8:{ view:'—',   create:false,edit:false, delete:false, export:false, share:'—',   approve:false },
        o9:{ view:'ALL', create:true, edit:true,  delete:false, export:true,  share:'—',   approve:true  },
    },
};

const PT_PERM_ACTIONS = ['view','create','edit','delete','export','share','approve'];

const SCOPE_OPTIONS = [
    { id:'all',  label:'All records',  desc:'Across the entire workspace',  swatch:T.ok,      rec: false },
    { id:'team', label:'Team records', desc:'Records owned by their team',  swatch:T.info,    rec: false },
    { id:'own',  label:'Own records',  desc:'Only records they own',        swatch:T.goldInk, rec: true  },
    { id:'none', label:'None',         desc:'Cannot perform this action',   swatch:T.inkMuted,rec: false },
];

const ACTION_DESC = {
    view:    (obj) => `Controls which ${obj} records this role can see in lists and search.`,
    create:  (obj) => `Allows this role to create new ${obj} records.`,
    edit:    (obj) => `Allows this role to modify existing ${obj} records within their scope.`,
    delete:  (obj) => `Allows this role to permanently delete ${obj} records.`,
    export:  (obj) => `Allows this role to export ${obj} data to CSV or other formats.`,
    share:   (obj) => `Controls which ${obj} records this role can share with other users.`,
    approve: (obj) => `Approving a ${obj} record triggers downstream automations and status changes.`,
};

const ScopeVisual = ({ scope, narrowed }) => {
    const fill = (level) => {
        if (scope === 'all')              return T.ok;
        if (scope === 'team' && level <= 1) return T.info;
        if (scope === 'own'  && level === 0) return T.goldInk;
        return T.border;
    };
    const base = scope === 'all' ? 1240 : scope === 'team' ? 340 : scope === 'own' ? 45 : 0;
    const count = narrowed && base > 0 ? `~${Math.max(1,Math.round(base*0.27))} of ${base}` : scope === 'all' ? '1,240' : scope === 'team' ? '~340' : scope === 'own' ? '~45' : '0';
    return (
        <div style={{ display:'flex', alignItems:'center', gap:4, height:18 }}>
            <span style={{ width:8,  height:8,  borderRadius:'50%', background:fill(0), flexShrink:0 }}/>
            <span style={{ width:12, height:12, borderRadius:'50%', background:fill(1), opacity: scope==='all'||scope==='team'?1:0.35, flexShrink:0 }}/>
            <span style={{ width:16, height:16, borderRadius:'50%', background:fill(2), opacity: scope==='all'?1:0.25, flexShrink:0 }}/>
            <span style={{ flex:1 }}/>
            <span style={{ fontSize:9.5, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace', letterSpacing:0.4 }}>{count} records</span>
        </div>
    );
};

const PermCellPopover = ({ anchor, currentValue, roleName, onApply, onClose }) => {
    // anchor = { objectId, objectName, action }
    // currentValue = scope string or bool
    const initScope = () => {
        if (currentValue === true)  return 'all';
        if (currentValue === false || currentValue === undefined || currentValue === null) return 'none';
        if (['all','team','own','none'].includes(currentValue)) return currentValue;
        return currentValue === '—' ? 'none' : (currentValue || 'none').toLowerCase();
    };

    const [scope,      setScope]      = useState(initScope);
    const [condsOpen,  setCondsOpen]  = useState(false);
    const [conds,      setConds]      = useState([]);
    const [saving,     setSaving]     = useState(false);
    const [err,        setErr]        = useState('');

    // Close on Escape
    React.useEffect(() => {
        const h = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, []);

    const handleApply = () => {
        setSaving(true);
        // Simulate async persist — no backend endpoint yet
        setTimeout(() => {
            setSaving(false);
            const isScope = anchor.action === 'view' || anchor.action === 'share';
            onApply(anchor.objectId, anchor.action, isScope ? scope : scope !== 'none');
            onClose();
        }, 300);
    };

    const desc = ACTION_DESC[anchor.action]?.(anchor.objectName) || '';
    const title = `${anchor.action.charAt(0).toUpperCase() + anchor.action.slice(1)} · ${anchor.objectName}`;
    const narrowed = condsOpen && conds.length > 0;

    const isRightCol = ['delete','export','share','approve'].includes(anchor.action);

    return (
        <div style={{
            background:T.surface, border:`1px solid ${T.border}`, borderRadius:4,
            boxShadow:'0 12px 32px rgba(42,38,34,0.18), 0 2px 6px rgba(42,38,34,0.08)',
            width:380, position:'relative', textAlign:'left',
            animation:'fadeInDown 120ms ease-out',
        }}>
            {/* Caret — tracks anchor side */}
            <span style={{
                position:'absolute', top:-7,
                left: isRightCol ? 'auto' : '50%',
                right: isRightCol ? 24 : 'auto',
                transform: isRightCol ? 'rotate(45deg)' : 'translateX(-50%) rotate(45deg)',
                width:12, height:12, background:T.surface,
                borderTop:`1px solid ${T.border}`, borderLeft:`1px solid ${T.border}`,
            }}/>

            {/* Header */}
            <div style={{ padding:'12px 14px 8px', borderBottom:`1px solid ${T.border}` }}>
                <div style={{ display:'flex', alignItems:'baseline', gap:8 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:T.ink }}>{title}</span>
                    <span style={{ flex:1 }}/>
                    <span style={{ fontSize:10.5, fontWeight:700, color:T.goldInk, background:'rgba(200,185,154,0.25)', padding:'1px 7px', borderRadius:2, letterSpacing:0.4 }}>{roleName}</span>
                </div>
                <div style={{ fontSize:11, color:T.inkMid, marginTop:4, lineHeight:1.4 }}>{desc}</div>
            </div>

            {/* Scope cards grid */}
            <div style={{ padding:10, display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {SCOPE_OPTIONS.map(o => {
                    const sel = scope === o.id;
                    return (
                        <div key={o.id} onClick={() => setScope(o.id)} style={{
                            position:'relative', cursor:'pointer',
                            background: sel ? 'rgba(42,38,34,0.04)' : T.surface,
                            border: `1px solid ${sel ? T.ink : T.border}`,
                            borderRadius:3, padding:10,
                            boxShadow: sel ? `inset 0 0 0 1px ${T.ink}` : 'none',
                            transition:'border 80ms, box-shadow 80ms',
                        }}>
                            {o.rec && (
                                <span style={{
                                    position:'absolute', top:-7, right:8,
                                    fontSize:9, fontWeight:700, letterSpacing:0.6, textTransform:'uppercase',
                                    background:'#c8b99a', color:'#7a6a48', padding:'1px 6px', borderRadius:2,
                                }}>Recommended</span>
                            )}
                            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                                <span style={{ width:10, height:10, borderRadius:'50%', background:o.swatch, flexShrink:0 }}/>
                                <span style={{ fontSize:12, fontWeight:700, color:T.ink }}>{o.label}</span>
                            </div>
                            <div style={{ fontSize:10.5, color:T.inkMuted, lineHeight:1.35, marginBottom:8 }}>{o.desc}</div>
                            <ScopeVisual scope={o.id} narrowed={narrowed}/>
                        </div>
                    );
                })}
            </div>

            {/* Conditions — collapsible */}
            <div style={{ borderTop:`1px solid ${T.border}` }}>
                <div onClick={() => setCondsOpen(o=>!o)} style={{
                    display:'flex', alignItems:'center', gap:8, padding:'8px 14px',
                    cursor:'pointer', userSelect:'none',
                }}>
                    <span style={{ fontSize:10.5, color:T.inkMuted, fontWeight:600, letterSpacing:0.6, textTransform:'uppercase' }}>
                        Narrow by conditions
                    </span>
                    {conds.length > 0 && (
                        <span style={{ fontSize:9.5, fontWeight:700, color:T.goldInk, background:'rgba(200,185,154,0.35)', padding:'1px 5px', borderRadius:2, fontFamily:'ui-monospace,Menlo,monospace' }}>
                            {conds.length}
                        </span>
                    )}
                    <span style={{ fontSize:10.5, color:T.inkMuted, fontWeight:500 }}>optional</span>
                    <span style={{ flex:1 }}/>
                    <span style={{ fontSize:11, color:T.inkMid, transition:'transform 120ms', display:'inline-block', transform: condsOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▾</span>
                </div>
                {condsOpen && (
                    <div style={{ padding:'0 14px 12px' }}>
                        <div style={{ fontSize:10.5, color:T.inkMuted, lineHeight:1.4, marginBottom:8 }}>
                            Only records matching <b style={{ color:T.inkMid }}>all</b> conditions can be affected within the chosen scope.
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                            {conds.map((c,i) => (
                                <div key={i} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 8px', background:T.surface2, border:`1px solid ${T.border}`, borderRadius:3, fontSize:11.5 }}>
                                    <span style={{ color:T.inkMid, fontWeight:600 }}>{c.field}</span>
                                    <span style={{ color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace' }}>{c.op}</span>
                                    <span style={{ fontWeight:600, color:T.ink }}>{c.val}</span>
                                    <span style={{ flex:1 }}/>
                                    <span onClick={() => setConds(cs=>cs.filter((_,j)=>j!==i))} style={{ color:T.inkMuted, cursor:'pointer', padding:'0 2px', fontSize:14, lineHeight:1 }}>×</span>
                                </div>
                            ))}
                            <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 8px', border:`1px dashed ${T.border}`, borderRadius:3, fontSize:11.5, color:T.inkMid, cursor:'pointer' }}>
                                <span style={{ fontWeight:700 }}>+</span>
                                <span>Add condition</span>
                                <span style={{ flex:1 }}/>
                                <span style={{ fontSize:10, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace' }}>field · op · value</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* What changes footer */}
            <div style={{ padding:'8px 14px', borderTop:`1px solid ${T.border}`, background:T.surface2 }}>
                <div style={{ fontSize:10.5, color:T.inkMuted, fontWeight:600, letterSpacing:0.6, textTransform:'uppercase', marginBottom:4 }}>What changes</div>
                <div style={{ fontSize:11.5, color:T.ink, lineHeight:1.45 }}>
                    {scope === 'none'
                        ? <><b>{roleName}</b> cannot perform this action on any {anchor.objectName.toLowerCase()} records.</>
                        : scope === 'all'
                        ? <><b>{roleName}</b> can {anchor.action} <b>all records</b>{narrowed && conds.length > 0 ? <> matching <b>{conds.length} condition{conds.length===1?'':'s'}</b></> : <>. This applies across the entire workspace</>}.</>
                        : scope === 'team'
                        ? <><b>{roleName}</b> can {anchor.action} <b>their team's records</b>{narrowed && conds.length > 0 ? <> matching <b>{conds.length} condition{conds.length===1?'':'s'}</b></> : <> — records owned by anyone in their team</>}.</>
                        : <><b>{roleName}</b> can {anchor.action} <b>their own records</b>{narrowed && conds.length > 0 ? <> matching <b>{conds.length} condition{conds.length===1?'':'s'}</b> — ~{Math.round(45*0.27)} of ~45 qualify today</> : <>. Only records they created or own</>}.</>
                    }
                </div>
            </div>

            {/* Action footer */}
            <div style={{ padding:'10px 14px', borderTop:`1px solid ${T.border}`, display:'flex', gap:8, alignItems:'center' }}>
                <span onClick={onClose} style={{ fontSize:11, color:T.inkMuted, cursor:'pointer' }}>← Back to matrix</span>
                <span style={{ flex:1 }}/>
                {err && <span style={{ fontSize:11, color:T.danger }}>{err}</span>}
                <button onClick={onClose} style={{ fontSize:11.5, color:T.inkMid, background:'none', border:'none', cursor:'pointer', padding:'4px 8px', fontFamily:T.sans }}>Cancel</button>
                <button onClick={handleApply} disabled={saving} style={{ fontSize:11.5, color:T.surface, background: saving ? T.inkMuted : T.ink, border:'none', padding:'5px 12px', borderRadius:2, cursor: saving?'default':'pointer', fontWeight:600, fontFamily:T.sans }}>
                    {saving ? 'Saving…' : `Apply to ${roleName}`}
                </button>
            </div>
        </div>
    );
};

export const RolesDetail = ({ settings, onBack }) => {
    const [activeRole, setActiveRole] = useState('r3'); // default: Sales Rep
    const [openRoleKebab, setOpenRoleKebab] = useState(null);
    const { showConfirm, setSettings } = useApp();

    // Local perms state — starts from PT_PERMS, updated on Apply
    const [localPerms, setLocalPerms] = useState(() => JSON.parse(JSON.stringify(settings?.rolePermissions || PT_PERMS)));

    // Popover state
    const [popover, setPopover] = useState(null); // { objectId, objectName, action, currentValue } | null

    // Close kebab on outside click
    React.useEffect(() => {
        if (openRoleKebab === null) return;
        const h = () => setOpenRoleKebab(null);
        document.addEventListener('click', h);
        return () => document.removeEventListener('click', h);
    }, [openRoleKebab]);

    // Close popover on outside click
    React.useEffect(() => {
        if (!popover) return;
        const h = (e) => {
            if (!e.target.closest('[data-popover]') && !e.target.closest('[data-perm-cell]')) {
                setPopover(null);
            }
        };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, [popover]);

    const roles = settings?.roles || PT_ROLES;
    const role  = roles.find(r => r.id === activeRole);
    const perms = localPerms[activeRole] || {};

    const handleApply = (objectId, action, value) => {
        const next = {
            ...localPerms,
            [activeRole]: {
                ...(localPerms[activeRole] || {}),
                [objectId]: { ...(localPerms[activeRole]?.[objectId] || {}), [action]: value },
            },
        };
        setLocalPerms(next);
        if (setSettings) setSettings(s => ({ ...s, rolePermissions: next }));
        dbFetch('/.netlify/functions/settings', { method: 'PUT', body: JSON.stringify({ rolePermissions: next }) }).catch(e => console.error('save roles', e));
    };

    // Roles list — standard persistence (setSettings + dbFetch PUT settings.roles)
    const saveRoles = (next) => {
        if (setSettings) setSettings(s => ({ ...s, roles: next }));
        dbFetch('/.netlify/functions/settings', { method: 'PUT', body: JSON.stringify({ roles: next }) }).catch(e => console.error('save roles list', e));
    };
    const savePerms = (nextPerms) => {
        setLocalPerms(nextPerms);
        if (setSettings) setSettings(s => ({ ...s, rolePermissions: nextPerms }));
        dbFetch('/.netlify/functions/settings', { method: 'PUT', body: JSON.stringify({ rolePermissions: nextPerms }) }).catch(e => console.error('save role perms', e));
    };
    const addRole = () => {
        const id = 'role_' + crypto.randomUUID();
        saveRoles([...roles, { id, name: 'New role', userCount: 0, sys: false }]);
        setActiveRole(id);
    };
    const duplicateRole = (srcId) => {
        const src = roles.find(r => r.id === srcId) || role;
        if (!src) return;
        const id = 'role_' + crypto.randomUUID();
        saveRoles([...roles, { ...src, id, name: src.name + ' (copy)', userCount: 0, sys: false }]);
        savePerms({ ...localPerms, [id]: JSON.parse(JSON.stringify(localPerms[srcId] || {})) });
        setActiveRole(id);
    };
    const renameRole = (id) => {
        const r = roles.find(x => x.id === id); if (!r) return;
        const name = window.prompt('Rename role', r.name);
        if (name && name.trim()) saveRoles(roles.map(x => x.id === id ? { ...x, name: name.trim() } : x));
    };
    const deleteRole = (id) => {
        const r = roles.find(x => x.id === id); if (!r) return;
        setOpenRoleKebab(null);
        showConfirm(`Delete role "${r.name}"? Users will need reassignment.`, () => {
            const next = roles.filter(x => x.id !== id);
            saveRoles(next);
            if (activeRole === id && next.length) setActiveRole(next[0].id);
        });
    };

    const handleCellClick = (obj, action) => {
        const currentValue = (localPerms[activeRole]?.[obj.id] || {})[action];
        setPopover({ objectId: obj.id, objectName: obj.name, action, currentValue });
    };

    return (
        <div style={{ fontFamily:T.sans }}>
            {/* Breadcrumb */}
            <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:T.inkMuted, marginBottom:10 }}>
                <button onClick={onBack} style={{ background:'none', border:'none', color:T.info, fontWeight:600, cursor:'pointer', fontFamily:T.sans, padding:0, fontSize:12 }}>Settings</button>
                <span>/</span>
                <button onClick={onBack} style={{ background:'none', border:'none', color:T.info, fontWeight:600, cursor:'pointer', fontFamily:T.sans, padding:0, fontSize:12 }}>People & Teams</button>
                <span>/</span>
                <span style={{ color:T.ink, fontWeight:600 }}>Roles & permissions</span>
            </div>

            {/* Title band */}
            <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', paddingBottom:16, borderBottom:`1px solid ${T.border}`, marginBottom:20 }}>
                <div style={{ borderLeft:`3px solid ${T.goldInk}`, paddingLeft:10 }}>
                    <div style={{ fontSize:22, fontWeight:700, color:T.ink, letterSpacing:-0.3 }}>Roles & permissions</div>
                    <div style={{ fontSize:13, color:T.inkMid, marginTop:3, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                        <span>{roles.length} roles · {PT_PERM_OBJECTS.length} objects · {PT_PERM_ACTIONS.length} actions</span>
                        <span style={{ color:T.inkMuted }}>•</span>
                        <span style={{ color:T.ok, fontWeight:600 }}>✓</span>
                        <span>Editing — <b style={{ color:T.ink }}>{role?.name}</b></span>
                    </div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => duplicateRole(activeRole)} style={{ padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}
                        onMouseEnter={e=>e.currentTarget.style.background=T.surface2} onMouseLeave={e=>e.currentTarget.style.background=T.surface}>Duplicate role</button>
                    <button onClick={addRole} style={{ padding:'7px 16px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:T.sans }}>New role</button>
                </div>
            </div>

            {/* Role tabs */}
            <div style={{ display:'flex', gap:0, borderBottom:`1px solid ${T.border}`, marginBottom:18 }}>
                {roles.map(r => {
                    const active = r.id === activeRole;
                    return (
                        <div key={r.id} style={{ position:'relative', display:'flex', alignItems:'center' }}>
                            <button onClick={() => { setActiveRole(r.id); setPopover(null); }}
                                style={{ padding:'10px 16px 10px 20px', fontSize:13, fontWeight:600, border:'none', background:'transparent', cursor:'pointer', fontFamily:T.sans, color: active?T.ink:T.inkMid, borderBottom: active?`2px solid ${T.goldInk}`:'2px solid transparent', display:'flex', alignItems:'center', gap:6 }}>
                                <span>{r.name}</span>
                                <span style={{ fontSize:11, color:T.inkMuted }}>{r.userCount}</span>
                                {r.sys && <span style={{ padding:'1px 4px', fontSize:9, fontWeight:800, background:'rgba(42,38,34,0.07)', color:T.inkMuted, borderRadius:2, letterSpacing:0.4 }}>SYS</span>}
                            </button>
                            <div style={{ position:'relative', marginRight:6 }}>
                                <button onClick={e => { e.stopPropagation(); setOpenRoleKebab(openRoleKebab === r.id ? null : r.id); }}
                                    style={{ background:'none', border:'none', color: active?T.inkMid:T.border, fontSize:14, cursor:'pointer', padding:'2px 4px', lineHeight:1, borderRadius:T.r }}
                                    onMouseEnter={e => { e.currentTarget.style.color=T.inkMid; e.currentTarget.style.background=T.surface2; }}
                                    onMouseLeave={e => { e.currentTarget.style.color=active?T.inkMid:T.border; e.currentTarget.style.background='none'; }}>⋯</button>
                                {openRoleKebab === r.id && (
                                    <div onClick={e=>e.stopPropagation()} style={{ position:'absolute', left:0, bottom:'100%', marginBottom:4, zIndex:400, background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+2, boxShadow:'0 4px 16px rgba(42,38,34,0.12)', minWidth:190 }}>
                                        {[
                                            { label:'Duplicate role',         action: () => { setOpenRoleKebab(null); duplicateRole(r.id); } },
                                            { label:'Rename',                 action: () => { setOpenRoleKebab(null); renameRole(r.id); } },
                                            { label:`View ${r.userCount} users`, action: () => setOpenRoleKebab(null) },
                                            ...(!r.sys ? [{ label:'Delete role', action: () => { deleteRole(r.id); }, danger: true }] : []),
                                        ].map((item, mi) => (
                                            <button key={mi} onClick={item.action}
                                                style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none', borderTop: mi>0?`1px solid ${T.border}`:'none', textAlign:'left', fontSize:13, color: item.danger?T.danger:T.ink, cursor:'pointer', fontFamily:T.sans }}
                                                onMouseEnter={e=>e.currentTarget.style.background=item.danger?'rgba(156,58,46,0.06)':T.surface2}
                                                onMouseLeave={e=>e.currentTarget.style.background='none'}>
                                                {item.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Permission matrix */}
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, overflow:'visible' }}>
                <div style={{ padding:'12px 16px 10px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div>
                        <div style={{ fontSize:13.5, fontWeight:700, color:T.ink }}>Permission matrix</div>
                        <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:2 }}>
                            Click any cell to set scope and optional conditions. Changes apply to {role?.userCount} users.
                        </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:T.inkMuted }}>
                        <span>Legend:</span>
                        {['all','team','own','—'].map(s => <ScopeBadge key={s} scope={s}/>)}
                    </div>
                </div>

                <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:T.sans, overflow:'visible' }}>
                    <thead>
                        <tr style={{ background:T.surface2 }}>
                            <th style={{ padding:'8px 16px', fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', textAlign:'left', borderBottom:`1px solid ${T.border}`, width:200 }}>OBJECT</th>
                            {PT_PERM_ACTIONS.map(a => (
                                <th key={a} style={{
                                    padding:'8px 12px', fontSize:10, fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', textAlign:'center', borderBottom:`1px solid ${T.border}`,
                                    color: popover?.action === a ? T.ink : T.inkMuted,
                                    background: popover?.action === a ? 'rgba(200,185,154,0.12)' : 'transparent',
                                    transition:'background 80ms, color 80ms',
                                }}>{a}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {PT_PERM_OBJECTS.map((obj, oi) => {
                            const p = perms[obj.id] || {};
                            const isActiveRow = popover?.objectId === obj.id;
                            return (
                                <tr key={obj.id} style={{
                                    borderBottom: oi < PT_PERM_OBJECTS.length-1 ? `1px solid ${T.border}` : 'none',
                                    background: isActiveRow ? 'rgba(200,185,154,0.06)' : 'transparent',
                                    transition:'background 80ms',
                                }}>
                                    <td style={{ padding:'11px 16px' }}>
                                        <div style={{ fontSize:13, fontWeight:600, color:T.ink }}>{obj.name}</div>
                                        <div style={{ fontSize:11, color:T.inkMuted }}>{obj.sub}</div>
                                    </td>
                                    {PT_PERM_ACTIONS.map(action => {
                                        const v = p[action];
                                        const isScope  = action === 'view' || action === 'share';
                                        const isActive = popover?.objectId === obj.id && popover?.action === action;
                                        return (
                                            <td key={action}
                                                data-perm-cell="1"
                                                onClick={() => handleCellClick(obj, action)}
                                                style={{
                                                    padding:'11px 12px', textAlign:'center', position:'relative',
                                                    cursor:'pointer',
                                                    boxShadow: isActive ? `inset 0 0 0 2px ${T.ink}` : 'none',
                                                    background: isActive ? T.surface : 'transparent',
                                                    transition:'box-shadow 80ms',
                                                }}
                                                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = T.surface2; }}
                                                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}>
                                                {isActive ? (
                                                    <>
                                                        <span style={{ display:'inline-block', padding:'2px 6px', fontSize:9.5, fontWeight:700, letterSpacing:0.6, color:T.surface, background:T.ink, borderRadius:2, fontFamily:'ui-monospace,Menlo,monospace' }}>EDIT</span>
                                                        {/* Popover anchored below this cell */}
                                                        <div data-popover="1" style={{ position:'absolute', top:'100%', right: ['delete','export','share','approve'].includes(action) ? 0 : 'auto', left: ['delete','export','share','approve'].includes(action) ? 'auto' : '50%', transform: ['delete','export','share','approve'].includes(action) ? 'none' : 'translateX(-50%)', marginTop:6, zIndex:50, width:380 }}
                                                            onClick={e => e.stopPropagation()}>
                                                            <PermCellPopover
                                                                anchor={{ objectId:obj.id, objectName:obj.name, action }}
                                                                currentValue={v}
                                                                roleName={role?.name || 'Role'}
                                                                onApply={handleApply}
                                                                onClose={() => setPopover(null)}/>
                                                        </div>
                                                    </>
                                                ) : isScope ? (
                                                    <ScopeBadge scope={v || '—'}/>
                                                ) : (
                                                    <PermDot on={v === true}/>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
