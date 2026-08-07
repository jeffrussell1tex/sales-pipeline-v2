// settings/security/FlsDetail.jsx
import React, { useState, useEffect } from 'react';
import { dbFetch } from '../../../utils/storage';
import { T } from '../shared/tokens.js';
import { SecCrumb, SecTitle, SecBtn } from './shared.jsx';

const flsCellStyle = (level) => {
    const m = {
        'Edit':   { bg:'rgba(77,107,61,0.14)',   fg:'#4d6b3d', label:'Edit'   },
        'Read':   { bg:'rgba(58,90,122,0.13)',    fg:'#3a5a7a', label:'Read'   },
        'Masked': { bg:'rgba(184,115,51,0.14)',   fg:'#b87333', label:'Masked' },
        'Hidden': { bg:'rgba(138,131,120,0.12)',  fg:'#5a544c', label:'Hidden' },
    };
    return m[level] || { bg:'transparent', fg:T.inkMuted, label:level };
};

const FlsMatrixCell = ({ level, onCycle }) => {
    const cycle = ['Edit','Read','Masked','Hidden'];
    const s = flsCellStyle(level);
    return (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
            <button onClick={onCycle}
                style={{ padding:'3px 11px', borderRadius:4, fontSize:11.5, fontWeight:700, background:s.bg, color:s.fg, border:'none', cursor:'pointer', fontFamily:T.sans, minWidth:56 }}>
                {s.label}
            </button>
        </div>
    );
};

const FLS_OBJECT_FIELDS = {
    Account: [
        { key:'arr',              label:'ARR / Revenue',       type:'currency', pii:false },
        { key:'creditScore',      label:'Credit Score',         type:'number',   pii:true  },
        { key:'accountOwner',     label:'Account Owner',        type:'text',     pii:false },
        { key:'industry',         label:'Industry',             type:'picklist', pii:false },
        { key:'employeeCount',    label:'Employee Count',       type:'number',   pii:false },
        { key:'website',          label:'Website',              type:'url',      pii:false },
        { key:'phone',            label:'Phone',                type:'phone',    pii:false },
        { key:'billingAddress',   label:'Billing Address',      type:'address',  pii:true  },
        { key:'taxId',            label:'Tax ID / EIN',         type:'text',     pii:true  },
        { key:'accountTier',      label:'Account Tier',         type:'picklist', pii:false },
        { key:'renewalMonth',     label:'Renewal Month',        type:'text',     pii:false },
    ],
    Contact: [
        { key:'contactEmail',     label:'Email',                type:'email',    pii:true  },
        { key:'contactPhone',     label:'Phone',                type:'phone',    pii:true  },
        { key:'mobilePhone',      label:'Mobile Phone',         type:'phone',    pii:true  },
        { key:'homeAddress',      label:'Home Address',         type:'address',  pii:true  },
        { key:'title',            label:'Title',                type:'text',     pii:false },
        { key:'linkedIn',         label:'LinkedIn URL',         type:'url',      pii:false },
        { key:'dateOfBirth',      label:'Date of Birth',        type:'date',     pii:true  },
        { key:'personaTag',       label:'Persona Tag',          type:'picklist', pii:false },
        { key:'execSponsor',      label:'Executive Sponsor',    type:'toggle',   pii:false },
    ],
    Opportunity: [
        { key:'arr',              label:'ARR',                  type:'currency', pii:false },
        { key:'probability',      label:'Win Probability',      type:'percent',  pii:false },
        { key:'discountPct',      label:'Discount %',           type:'percent',  pii:false },
        { key:'forecastNotes',    label:'Forecast Notes',       type:'text',     pii:false },
        { key:'competitorInfo',   label:'Competitor Info',      type:'text',     pii:false },
        { key:'decisionDate',     label:'Decision Date',        type:'date',     pii:false },
        { key:'whyWeLose',        label:'Why We Lose',          type:'text',     pii:false },
        { key:'nextSteps',        label:'Next Steps',           type:'text',     pii:false },
        { key:'notes',            label:'Notes',                type:'text',     pii:false },
        { key:'implementationCost',label:'Implementation Cost', type:'currency', pii:false },
        { key:'forecastCategory', label:'Forecast Category',    type:'picklist', pii:false },
    ],
    Quote: [
        { key:'cogs',             label:'COGS',                 type:'currency', pii:true  },
        { key:'grossMargin',      label:'Gross Margin %',       type:'percent',  pii:true  },
        { key:'quoteDiscount',    label:'Quote Discount',       type:'percent',  pii:false },
        { key:'paymentTerms',     label:'Payment Terms',        type:'text',     pii:false },
        { key:'signedAt',         label:'Signed Date',          type:'date',     pii:false },
    ],
    Lead: [
        { key:'leadEmail',        label:'Email',                type:'email',    pii:true  },
        { key:'leadPhone',        label:'Phone',                type:'phone',    pii:true  },
        { key:'leadScore',        label:'Lead Score',           type:'number',   pii:false },
        { key:'leadSource',       label:'Lead Source',          type:'picklist', pii:false },
        { key:'budgetConfirmed',  label:'Budget Confirmed',     type:'toggle',   pii:false },
        { key:'bantNotes',        label:'BANT Notes',           type:'text',     pii:false },
    ],
};

const FLS_OBJECTS_LIST = Object.keys(FLS_OBJECT_FIELDS);

const FLS_LEVELS = ['Edit','Read','Masked','Hidden'];

export const FlsDetail = ({ onBack }) => {
    const [objFilter, setObjFilter] = React.useState(FLS_OBJECTS_LIST[0]);
    const [search,    setSearch]    = React.useState('');
    const [matrix,    setMatrix]    = React.useState({}); // { [fieldKey]: { [role]: level } }
    const [roles,     setRoles]     = React.useState(['Admin','Manager','User','Technician','ReadOnly']);
    const [dirty,     setDirty]     = React.useState(false);
    const [loading,   setLoading]   = React.useState(true);
    const [saving,    setSaving]    = React.useState(false);
    const [toast,     setToast]     = React.useState(null);

    const showToast = (msg, err) => { setToast({msg,err}); setTimeout(()=>setToast(null),3000); };

    // ── Load real fieldVisibility + roles on mount ───────────────
    React.useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const res  = await dbFetch('/.netlify/functions/settings');
                const data = await res.json();
                if (cancelled) return;
                if (!res.ok) throw new Error(data.error || 'Failed to load');
                // Roles from real users, excluding system roles
                const userRoles = [...new Set(
                    (data.settings?.users || [])
                        .map(u => u.role || u.userType)
                        .filter(Boolean)
                )].filter(r => r !== 'System');
                if (userRoles.length > 0) setRoles(userRoles);
                // Field visibility matrix
                const fv = data.settings?.fieldVisibility || {};
                setMatrix(fv);
            } catch (e) {
                showToast(e.message, true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, []);

    // ── Get level for a field+role, defaulting to 'Edit' ─────────
    const getLevel = (fieldKey, role) => {
        const rules = matrix[fieldKey];
        if (!rules) return 'Edit';
        const val = rules[role];
        if (val === undefined || val === null) return 'Edit';
        if (val === false) return 'Hidden';
        if (val === true)  return 'Edit';
        if (FLS_LEVELS.includes(val)) return val;
        return 'Edit';
    };

    // ── Cycle a cell ──────────────────────────────────────────────
    const cycleCell = (fieldKey, role) => {
        setMatrix(prev => {
            const cur = getLevel(fieldKey, role);
            const next = FLS_LEVELS[(FLS_LEVELS.indexOf(cur) + 1) % FLS_LEVELS.length];
            return {
                ...prev,
                [fieldKey]: { ...(prev[fieldKey] || {}), [role]: next },
            };
        });
        setDirty(true);
    };

    // ── Bulk set entire column (role) ─────────────────────────────
    const setColumn = (role, level) => {
        const allFields = FLS_OBJECTS_LIST.flatMap(obj => FLS_OBJECT_FIELDS[obj]);
        setMatrix(prev => {
            const next = { ...prev };
            allFields.forEach(f => {
                next[f.key] = { ...(next[f.key] || {}), [role]: level };
            });
            return next;
        });
        setDirty(true);
    };

    // ── Save ──────────────────────────────────────────────────────
    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await dbFetch('/.netlify/functions/settings', {
                method: 'PUT',
                body: JSON.stringify({ fieldVisibility: matrix }),
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
            setDirty(false);
            showToast('Field-level security saved.');
        } catch (e) {
            showToast(e.message, true);
        } finally {
            setSaving(false);
        }
    };

    // ── Export matrix as CSV ──────────────────────────────────────
    const handleExport = () => {
        const allFields = FLS_OBJECTS_LIST.flatMap(obj =>
            FLS_OBJECT_FIELDS[obj].map(f => ({ ...f, object: obj }))
        );
        const header = ['Object','Field','Key','Type','PII', ...roles].join(',');
        const rows   = allFields.map(f => [
            f.object, f.label, f.key, f.type, f.pii ? 'Yes' : 'No',
            ...roles.map(r => getLevel(f.key, r)),
        ].map(v => '"' + String(v).replace(/"/g,'""') + '"').join(','));
        const csv  = [header, ...rows].join(String.fromCharCode(13)+String.fromCharCode(10));
        const blob = new Blob([csv], { type:'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = 'accelerep-fls-matrix.csv';
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // ── Visible fields ────────────────────────────────────────────
    const objFields = FLS_OBJECT_FIELDS[objFilter] || [];
    const visFields = objFields.filter(f =>
        !search || f.label.toLowerCase().includes(search.toLowerCase()) || f.key.toLowerCase().includes(search.toLowerCase())
    );

    // Stats for badge
    const allFields = FLS_OBJECTS_LIST.flatMap(obj => FLS_OBJECT_FIELDS[obj]);
    const maskedCount = allFields.filter(f => roles.some(r => getLevel(f.key,r) === 'Masked')).length;
    const hiddenCount = allFields.filter(f => roles.some(r => getLevel(f.key,r) === 'Hidden')).length;
    const piiCount    = allFields.filter(f => f.pii).length;

    return (
        <div style={{ fontFamily:T.sans }}>
            {/* Toast */}
            {toast && (
                <div style={{ position:'fixed', bottom:24, right:24, zIndex:9999, padding:'10px 18px',
                    background: toast.err ? T.danger : T.ok, color:'#fbf8f3', borderRadius:6,
                    fontSize:13, fontWeight:600, boxShadow:'0 4px 16px rgba(0,0,0,0.2)', fontFamily:T.sans }}>
                    {toast.msg}
                </div>
            )}

            <SecCrumb page="Field-level security" onBack={onBack}/>
            <SecTitle
                title="Field-level security"
                sub={`${FLS_OBJECTS_LIST.length} objects · ${allFields.length} fields · ${piiCount} PII fields`}
                badge={loading ? 'Loading…' : `${maskedCount} masked · ${hiddenCount} hidden`}
                updatedAt="Changes persist to workspace settings"
                dirty={dirty}
                actions={[
                    <SecBtn key="exp" label="Export CSV" onClick={handleExport}/>,
                    <SecBtn key="sav" label={saving ? 'Saving…' : 'Save changes'} primary
                        onClick={handleSave} disabled={!dirty || saving}/>,
                ]}/>

            {/* Info callout */}
            <div style={{ padding:'11px 16px', background:'rgba(58,90,122,0.07)', borderLeft:`3px solid ${T.info}`,
                borderRadius:4, marginBottom:16, fontSize:12.5, color:T.inkMid, fontFamily:T.sans }}>
                <b style={{ color:T.info }}>Edit</b> — full read/write &nbsp;·&nbsp;
                <b style={{ color:T.info }}>Read</b> — visible, not editable &nbsp;·&nbsp;
                <b style={{ color:T.warn }}>Masked</b> — value shown as •••• (e.g. last 2 digits only) &nbsp;·&nbsp;
                <b style={{ color:T.danger }}>Hidden</b> — field not visible at all.
                Click any cell to cycle. Click a role header to set the whole column.
            </div>

            {/* Object filter + search */}
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8,
                padding:'12px 16px', marginBottom:16, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                <span style={{ fontSize:12.5, fontWeight:700, color:T.ink, marginRight:4 }}>Object</span>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {FLS_OBJECTS_LIST.map(obj => {
                        const objFields2 = FLS_OBJECT_FIELDS[obj] || [];
                        const hasPii = objFields2.some(f => f.pii);
                        return (
                            <button key={obj} onClick={() => setObjFilter(obj)}
                                style={{ padding:'5px 14px', fontSize:12.5, fontWeight:600, borderRadius:4,
                                    border:`1px solid ${objFilter===obj?T.ink:T.border}`,
                                    background:objFilter===obj?T.ink:'transparent',
                                    color:objFilter===obj?'#fbf8f3':T.inkMid,
                                    cursor:'pointer', fontFamily:T.sans, display:'flex', alignItems:'center', gap:5 }}>
                                {obj}
                                {hasPii && <span style={{ fontSize:9, fontWeight:700, color:objFilter===obj?'rgba(255,210,100,0.9)':T.warn }}>PII</span>}
                            </button>
                        );
                    })}
                </div>
                <div style={{ flex:1 }}/>
                <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search field…"
                    style={{ padding:'6px 12px', fontSize:12.5, border:`1px solid ${T.border}`,
                        borderRadius:16, outline:'none', width:200, fontFamily:T.sans,
                        background:T.surface, color:T.ink }}/>
            </div>

            {/* FLS matrix */}
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, overflow:'hidden' }}>
                <div style={{ padding:'12px 16px 10px', borderBottom:`1px solid ${T.border}`,
                    display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div>
                        <div style={{ fontSize:13.5, fontWeight:700, color:T.ink }}>{objFilter} · Field × Role matrix</div>
                        <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:2 }}>
                            {loading ? 'Loading…' : `${visFields.length} field${visFields.length!==1?'s':''} · ${roles.length} roles`}
                        </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        {FLS_LEVELS.map(l => {
                            const s = flsCellStyle(l);
                            return (
                                <span key={l} style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11.5 }}>
                                    <span style={{ width:10, height:10, borderRadius:2, background:s.bg, display:'inline-block', border:`1px solid ${s.fg}44` }}/>
                                    <span style={{ color:T.inkMuted }}>{l}</span>
                                </span>
                            );
                        })}
                    </div>
                </div>

                {loading ? (
                    <div style={{ padding:'40px 0', textAlign:'center', color:T.inkMuted, fontSize:13, fontFamily:T.sans }}>Loading field permissions…</div>
                ) : (
                    <div style={{ overflowX:'auto' }}>
                        <table style={{ width:'100%', borderCollapse:'collapse', minWidth:500, fontFamily:T.sans }}>
                            <thead>
                                <tr style={{ background:T.surface2, borderBottom:`1px solid ${T.border}` }}>
                                    <th style={{ padding:'8px 16px', fontSize:10, fontWeight:700, color:T.inkMuted,
                                        letterSpacing:0.6, textTransform:'uppercase', textAlign:'left',
                                        minWidth:240, position:'sticky', left:0, background:T.surface2, zIndex:1 }}>FIELD</th>
                                    {roles.map(r => (
                                        <th key={r} style={{ padding:'8px 12px', fontSize:10, fontWeight:700,
                                            color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase',
                                            textAlign:'center', minWidth:100 }}>
                                            <div>{r}</div>
                                            {/* Bulk set column menu */}
                                            <div style={{ display:'flex', gap:3, justifyContent:'center', marginTop:4 }}>
                                                {FLS_LEVELS.map(l => {
                                                    const s = flsCellStyle(l);
                                                    return (
                                                        <span key={l} onClick={() => setColumn(r, l)}
                                                            title={`Set all ${r} → ${l}`}
                                                            style={{ width:8, height:8, borderRadius:2, background:s.bg,
                                                                border:`1px solid ${s.fg}44`, cursor:'pointer', display:'inline-block' }}/>
                                                    );
                                                })}
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {visFields.length === 0 && (
                                    <tr><td colSpan={roles.length + 1} style={{ padding:'32px', textAlign:'center', color:T.inkMuted, fontSize:13 }}>
                                        No fields match "{search}"
                                    </td></tr>
                                )}
                                {visFields.map((field) => (
                                    <tr key={field.key} style={{ borderBottom:`1px solid ${T.border}` }}
                                        onMouseEnter={e => Array.from(e.currentTarget.cells).forEach(c => c.style.background = T.surface2)}
                                        onMouseLeave={e => Array.from(e.currentTarget.cells).forEach(c => c.style.background = 'transparent')}>
                                        <td style={{ padding:'10px 16px', position:'sticky', left:0, background:T.surface, zIndex:1 }}>
                                            <div style={{ fontSize:13, fontWeight:600, color:T.ink }}>{field.label}</div>
                                            <div style={{ fontSize:11, color:T.inkMuted, marginTop:2, display:'flex', gap:6, alignItems:'center' }}>
                                                <span style={{ fontFamily:'ui-monospace,Menlo,monospace' }}>{field.key}</span>
                                                <span>·</span>
                                                <span>{field.type}</span>
                                                {field.pii && (
                                                    <span style={{ fontSize:9.5, fontWeight:700, color:T.warn,
                                                        background:'rgba(184,115,51,0.10)', padding:'1px 5px', borderRadius:2 }}>PII</span>
                                                )}
                                            </div>
                                        </td>
                                        {roles.map(role => (
                                            <td key={role} style={{ padding:'8px 10px', textAlign:'center' }}>
                                                <FlsMatrixCell
                                                    level={getLevel(field.key, role)}
                                                    onCycle={() => cycleCell(field.key, role)}/>
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};
