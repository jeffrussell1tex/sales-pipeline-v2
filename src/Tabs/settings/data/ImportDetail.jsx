// settings/data/ImportDetail.jsx
import React, { useState, useRef } from 'react';
import { dbFetch } from '../../../utils/storage';
import { T } from '../shared/tokens.js';
import { DataStatCard, DataCard, DPill, DataCrumb, DataTitle, DataBtn } from './shared.jsx';

const DATA_IMPORT = {
    lastRun: { ts:'3 days ago', rows:812, errors:14, by:'morgan@accelerep.com', object:'Accounts' },
    history: [
        { id:'imp-014', ts:'3 days ago',  object:'Accounts',      rows:812,  errors:14, status:'partial',   by:'morgan@accelerep.com' },
        { id:'imp-013', ts:'1 week ago',  object:'Contacts',      rows:2410, errors:0,  status:'success',   by:'morgan@accelerep.com' },
        { id:'imp-012', ts:'2 weeks ago', object:'Leads',         rows:1680, errors:3,  status:'partial',   by:'jeff@accelerep.com'   },
        { id:'imp-011', ts:'3 weeks ago', object:'Opportunities', rows:248,  errors:0,  status:'success',   by:'morgan@accelerep.com' },
        { id:'imp-010', ts:'1 month ago', object:'Accounts',      rows:412,  errors:0,  status:'success',   by:'morgan@accelerep.com' },
    ],
    wizard: {
        step:'map',
        file:{ name:'salesforce-accounts-2026-q1.csv', size:'4.2 MB', rows:812, encoding:'UTF-8' },
        columns:[
            { csv:'Account Name',  target:'name',          type:'text',     sample:'Acme Corp',          confidence:0.99, required:true  },
            { csv:'Domain',        target:'domain',        type:'url',      sample:'acme.com',           confidence:0.97, required:true  },
            { csv:'Annual Revenue',target:'annualRevenue', type:'currency', sample:'$12,400,000',        confidence:0.94 },
            { csv:'Employees',     target:'employeeCount', type:'number',   sample:'320',                confidence:0.99 },
            { csv:'Industry',      target:'industry',      type:'enum',     sample:'Manufacturing',      confidence:0.91 },
            { csv:'Tier',          target:'customerTier',  type:'enum',     sample:'Enterprise',         confidence:0.84 },
            { csv:'Owner Email',   target:'ownerEmail',    type:'email',    sample:'morgan@accelerep…',  confidence:0.99 },
            { csv:'Created (UTC)', target:'createdAt',     type:'datetime', sample:'2024-04-12T10:14Z',  confidence:0.96 },
            { csv:'Notes',         target:'__skip__',      type:'text',     sample:'pricing call w/ CTO',confidence:0.42 },
            { csv:'Salesforce ID', target:'externalId',    type:'text',     sample:'0014x000abcd1234',   confidence:0.88 },
        ],
        dedupe:{ match:'domain', onMatch:'update', skipBlanks:true },
        preview:{ willCreate:612, willUpdate:186, willSkip:14, errors:[
            { row:47,  field:'domain',        msg:'Invalid format: "n/a"' },
            { row:112, field:'annualRevenue', msg:'Could not parse "TBD"' },
            { row:304, field:'industry',      msg:'"Crypto" not in industry taxonomy' },
        ]},
    },
};

const DataStepRail = ({ step }) => {
    const steps = [
        { id:'upload',  label:'Upload' },
        { id:'map',     label:'Map columns' },
        { id:'dedupe',  label:'Dedupe' },
        { id:'preview', label:'Preview' },
        { id:'done',    label:'Run' },
    ];
    const idx = steps.findIndex(s => s.id === step);
    return (
        <div style={{ display:'flex', alignItems:'center', background:T.surface2, border:`1px solid ${T.border}`, borderRadius:4, padding:'10px 16px', marginBottom:16, gap:0 }}>
            {steps.map((s,i) => {
                const done = i < idx; const active = i === idx;
                return (
                    <React.Fragment key={s.id}>
                        <span style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, fontWeight: active ? 700 : 500, color: active ? T.ink : done ? T.ok : T.inkMuted }}>
                            <span style={{ width:18, height:18, borderRadius:'50%', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700,
                                background: done ? T.ok : active ? T.goldInk : 'transparent',
                                color: (done||active) ? '#fbf8f3' : T.inkMuted,
                                border: (!done && !active) ? `1px solid ${T.border}` : 'none' }}>
                                {done ? '✓' : i+1}
                            </span>
                            {s.label}
                        </span>
                        {i < steps.length-1 && <span style={{ width:32, height:1, background:T.border, margin:'0 10px', flexShrink:0 }}/>}
                    </React.Fragment>
                );
            })}
        </div>
    );
};

const IMPORT_FIELDS = {
    Accounts: [
        { value:'name',              label:'Name *'            },
        { value:'website',           label:'Website'           },
        { value:'phone',             label:'Phone'             },
        { value:'industry',          label:'Industry'          },
        { value:'verticalMarket',    label:'Vertical market'   },
        { value:'annualRevenue',     label:'Annual revenue'    },
        { value:'totalEmployees',    label:'Total employees'   },
        { value:'address',           label:'Address'           },
        { value:'city',              label:'City'              },
        { value:'state',             label:'State'             },
        { value:'zip',               label:'ZIP'               },
        { value:'country',           label:'Country'           },
        { value:'accountSegment',    label:'Segment'           },
        { value:'accountOwner',      label:'Account owner'     },
        { value:'assignedRep',       label:'Assigned rep'      },
        { value:'assignedTerritory', label:'Territory'         },
        { value:'description',       label:'Description'       },
        { value:'notes',             label:'Notes'             },
        { value:'linkedInUrl',       label:'LinkedIn URL'      },
        { value:'foundedYear',       label:'Founded year'      },
        { value:'externalId',        label:'External ID'       },
    ],
    Contacts: [
        { value:'firstName',         label:'First name *'      },
        { value:'lastName',          label:'Last name *'       },
        { value:'email',             label:'Email *'           },
        { value:'phone',             label:'Phone'             },
        { value:'mobile',            label:'Mobile'            },
        { value:'title',             label:'Title'             },
        { value:'company',           label:'Company'           },
        { value:'department',        label:'Department'        },
        { value:'address',           label:'Address'           },
        { value:'city',              label:'City'              },
        { value:'state',             label:'State'             },
        { value:'zip',               label:'ZIP'               },
        { value:'country',           label:'Country'           },
        { value:'assignedRep',       label:'Assigned rep'      },
        { value:'assignedTerritory', label:'Territory'         },
        { value:'notes',             label:'Notes'             },
        { value:'externalId',        label:'External ID'       },
    ],
    Leads: [
        { value:'firstName',         label:'First name *'      },
        { value:'lastName',          label:'Last name *'       },
        { value:'email',             label:'Email *'           },
        { value:'phone',             label:'Phone'             },
        { value:'company',           label:'Company'           },
        { value:'title',             label:'Title'             },
        { value:'source',            label:'Lead source'       },
        { value:'status',            label:'Status'            },
        { value:'notes',             label:'Notes'             },
        { value:'assignedRep',       label:'Assigned rep'      },
        { value:'externalId',        label:'External ID'       },
    ],
    Opportunities: [
        { value:'opportunityName',   label:'Opportunity name *'},
        { value:'account',           label:'Account'           },
        { value:'stage',             label:'Stage *'           },
        { value:'arr',               label:'ARR'               },
        { value:'forecastedCloseDate',label:'Close date'       },
        { value:'salesRep',          label:'Sales rep'         },
        { value:'probability',       label:'Probability'       },
        { value:'territory',         label:'Territory'         },
        { value:'team',              label:'Team'              },
        { value:'notes',             label:'Notes'             },
        { value:'externalId',        label:'External ID'       },
    ],
};

const REQUIRED_FIELDS = {
    Accounts:      ['name'],
    Contacts:      ['firstName','lastName','email'],
    Leads:         ['firstName','lastName','email'],
    Opportunities: ['opportunityName','stage'],
};

function autoMap(csvName, objectType) {
    const fields = IMPORT_FIELDS[objectType] || [];
    const n = csvName.toLowerCase().replace(/[^a-z0-9]/g,'');
    const exact = fields.find(f => f.value.toLowerCase() === n || f.label.toLowerCase().replace(/[^a-z0-9]/g,'') === n);
    if (exact) return { target: exact.value, confidence: 0.98 };
    const partial = fields.find(f => n.includes(f.value.toLowerCase()) || f.value.toLowerCase().includes(n));
    if (partial) return { target: partial.value, confidence: 0.80 };
    // Common aliases
    const aliases = {
        accountname:'name', company:'name', companyname:'name', organization:'name',
        domain:'website', url:'website', web:'website', homepage:'website',
        revenue:'annualRevenue', annrev:'annualRevenue',
        employees:'totalEmployees', headcount:'totalEmployees', emp:'totalEmployees',
        firstname:'firstName', first:'firstName', givenname:'firstName',
        lastname:'lastName', last:'lastName', surname:'lastName', familyname:'lastName',
        dealname:'opportunityName', opportunity:'opportunityName', deal:'opportunityName',
        closedate:'forecastedCloseDate', closingdate:'forecastedCloseDate',
        amount:'arr', value:'arr', dealsize:'arr', dealvalue:'arr',
        sfid:'externalId', salesforceid:'externalId', crmid:'externalId', hubspotid:'externalId',
        owner:'accountOwner', rep:'salesRep',
        segment:'accountSegment', tier:'accountSegment',
        vertical:'verticalMarket', industry:'industry',
        leadsource:'source', source:'source',
    };
    const mapped = aliases[n];
    if (mapped && fields.find(f => f.value === mapped)) return { target: mapped, confidence: 0.88 };
    return { target: '__skip__', confidence: 0.0 };
}

function parseCSVHeaders(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return { headers: [], sample: [] };
    const parseRow = (line) => {
        const out = []; let cur = ''; let inQ = false;
        for (const ch of line) {
            if (ch === '"') { inQ = !inQ; }
            else if (ch === ',' && !inQ) { out.push(cur.trim()); cur = ''; }
            else cur += ch;
        }
        out.push(cur.trim());
        return out;
    };
    const headers = parseRow(lines[0]);
    const sample  = lines.slice(1, 4).map(parseRow);
    return { headers, rows: lines.length - 1, sample };
}

const SavePresetModal = ({ columns, object, onClose }) => {
    const [name,   setName]   = useState('');
    const [saving, setSaving] = useState(false);
    const [saved,  setSaved]  = useState(false);

    const handleSave = async () => {
        if (!name.trim()) return;
        setSaving(true);
        try {
            await dbFetch('/.netlify/functions/settings', {
                method: 'PUT',
                body: JSON.stringify({
                    importPresets: [{ name: name.trim(), object, columns: columns.map(c => ({ csv: c.csv, target: c.target })) }],
                }),
            });
            setSaved(true); setTimeout(onClose, 800);
        } catch(e) { /* silent */ } finally { setSaving(false); }
    };

    const inp = { width:'100%', padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, background:T.surface, fontFamily:T.sans, outline:'none', boxSizing:'border-box' };
    return (
        <div style={{ position:'fixed', inset:0, background:'rgba(42,38,34,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={onClose}>
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, width:420, boxShadow:'0 8px 32px rgba(42,38,34,0.18)', fontFamily:T.sans }} onClick={e=>e.stopPropagation()}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:`1px solid ${T.border}` }}>
                    <div style={{ fontSize:15, fontWeight:700, color:T.ink }}>Save mapping as preset</div>
                    <button onClick={onClose} style={{ background:'none', border:'none', fontSize:18, color:T.inkMuted, cursor:'pointer' }}>×</button>
                </div>
                <div style={{ padding:'20px' }}>
                    <div style={{ fontSize:12, color:T.inkMid, marginBottom:12 }}>Save this column mapping so you can reuse it for future <b>{object}</b> imports.</div>
                    <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5 }}>Preset name</label>
                    <input value={name} onChange={e=>setName(e.target.value)} placeholder={`e.g. Salesforce → ${object}`} style={inp} autoFocus onKeyDown={e=>e.key==='Enter'&&handleSave()}/>
                </div>
                <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'14px 20px', borderTop:`1px solid ${T.border}` }}>
                    <button onClick={onClose} style={{ padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                    <button onClick={handleSave} disabled={!name.trim()||saving||saved} style={{ padding:'7px 16px', background: saved ? T.ok : T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:T.sans }}>
                        {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save preset'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const RunImportModal = ({ wizard, object, onClose, onComplete }) => {
    const [running, setRunning] = useState(false);
    const [result,  setResult]  = useState(null);
    const [err,     setErr]     = useState('');
    const mapped = wizard.columns.filter(c => c.target !== '__skip__');

    const handleRun = async () => {
        setRunning(true); setErr('');
        try {
            const res  = await dbFetch('/.netlify/functions/import', {
                method: 'POST',
                body: JSON.stringify({
                    object,
                    dedupe:  wizard.dedupe,
                    columns: mapped.map(c => ({ csv: c.csv, target: c.target })),
                    preview: wizard.preview,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Import failed');
            setResult(data);
        } catch(e) {
            setErr(e.message || 'Import failed. Please try again.');
        } finally { setRunning(false); }
    };

    return (
        <div style={{ position:'fixed', inset:0, background:'rgba(42,38,34,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={!result ? onClose : undefined}>
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, width:480, boxShadow:'0 8px 32px rgba(42,38,34,0.18)', fontFamily:T.sans }} onClick={e=>e.stopPropagation()}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:`1px solid ${T.border}` }}>
                    <div style={{ fontSize:15, fontWeight:700, color:T.ink }}>{result ? 'Import complete' : 'Run import'}</div>
                    <button onClick={result ? onComplete : onClose} style={{ background:'none', border:'none', fontSize:18, color:T.inkMuted, cursor:'pointer' }}>×</button>
                </div>
                <div style={{ padding:'20px' }}>
                    {result ? (
                        <div>
                            <div style={{ fontSize:13, color:T.ok, fontWeight:700, marginBottom:12 }}>✓ Import completed successfully</div>
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                                {[
                                    { label:'Created', value: result.created ?? wizard.preview.willCreate },
                                    { label:'Updated', value: result.updated ?? wizard.preview.willUpdate },
                                    { label:'Skipped', value: result.skipped ?? wizard.preview.willSkip  },
                                    { label:'Errors',  value: result.errors  ?? 0, warn: true             },
                                ].map((s,i) => (
                                    <div key={i} style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, padding:'10px 14px' }}>
                                        <div style={{ fontSize:10.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', marginBottom:4 }}>{s.label}</div>
                                        <div style={{ fontSize:22, fontWeight:700, color: s.warn && s.value > 0 ? T.warn : T.ink }}>{s.value}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div>
                            <div style={{ padding:'10px 14px', background:'rgba(58,90,122,0.07)', borderLeft:`3px solid ${T.info}`, borderRadius:4, marginBottom:14, fontSize:12.5, color:T.inkMid }}>
                                This will import <b>{wizard.file.rows.toLocaleString()} rows</b> into <b>{object}</b> using your column mapping and dedupe rules. This action cannot be undone.
                            </div>
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
                                {[
                                    { label:'Will create', value: wizard.preview.willCreate },
                                    { label:'Will update', value: wizard.preview.willUpdate },
                                    { label:'Will skip',   value: wizard.preview.willSkip   },
                                    { label:'Errors',      value: wizard.preview.errors.length, warn: true },
                                ].map((s,i) => (
                                    <div key={i} style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, padding:'10px 14px' }}>
                                        <div style={{ fontSize:10.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', marginBottom:4 }}>{s.label}</div>
                                        <div style={{ fontSize:22, fontWeight:700, color: s.warn && s.value > 0 ? T.warn : T.ink }}>{s.value}</div>
                                    </div>
                                ))}
                            </div>
                            {err && <div style={{ fontSize:12, color:T.danger, fontWeight:600, marginBottom:10 }}>{err}</div>}
                        </div>
                    )}
                </div>
                <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'14px 20px', borderTop:`1px solid ${T.border}` }}>
                    {result ? (
                        <button onClick={onComplete} style={{ padding:'7px 16px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:T.sans }}>Done</button>
                    ) : (
                        <>
                            <button onClick={onClose} style={{ padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                            <button onClick={handleRun} disabled={running} style={{ padding:'7px 16px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:T.sans, opacity:running?0.7:1 }}>
                                {running ? 'Running…' : 'Run import now'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export const ImportDetail = ({ onBack }) => {
    const fileInputRef   = React.useRef(null);
    const [showPreset,   setShowPreset]   = useState(false);
    const [showRun,      setShowRun]      = useState(false);
    const [showHistory,  setShowHistory]  = useState(false);
    const [object,       setObject]       = useState('Accounts');
    const [uploading,    setUploading]    = useState(false);
    const [uploadErr,    setUploadErr]    = useState('');

    // Wizard state — starts from mock data, becomes live after file upload
    const initWizard = () => ({
        step:    'map',
        file:    DATA_IMPORT.wizard.file,
        columns: DATA_IMPORT.wizard.columns.map(c => ({ ...c })),
        dedupe:  { ...DATA_IMPORT.wizard.dedupe },
        preview: { ...DATA_IMPORT.wizard.preview, errors: [...DATA_IMPORT.wizard.preview.errors] },
    });
    const [wizard, setWizard] = useState(initWizard);

    const STEPS = ['upload','map','dedupe','preview','done'];
    const stepIdx    = STEPS.indexOf(wizard.step);
    const mapped     = wizard.columns.filter(c => c.target !== '__skip__').length;
    const fields     = IMPORT_FIELDS[object] || [];
    const reqFields  = REQUIRED_FIELDS[object] || [];
    const reqMapped  = reqFields.every(f => wizard.columns.some(c => c.target === f));
    const canContinue = reqMapped && wizard.step !== 'done';

    // ── Helpers ───────────────────────────────────────────────────
    const setColumnTarget = (csv, target) => {
        setWizard(w => ({ ...w, columns: w.columns.map(c => c.csv === csv ? { ...c, target } : c) }));
    };
    const toggleSkip = (csv) => {
        setWizard(w => ({
            ...w,
            columns: w.columns.map(c => {
                if (c.csv !== csv) return c;
                if (c.target === '__skip__') {
                    const { target } = autoMap(csv, object);
                    return { ...c, target: target || '__skip__' };
                }
                return { ...c, target: '__skip__' };
            }),
        }));
    };
    const autoMapAll = () => {
        setWizard(w => ({
            ...w,
            columns: w.columns.map(c => {
                if (c.confidence >= 0.85 && c.target !== '__skip__') return c;
                const { target, confidence } = autoMap(c.csv, object);
                return { ...c, target, confidence };
            }),
        }));
    };
    const setDedupe = (patch) => setWizard(w => ({ ...w, dedupe: { ...w.dedupe, ...patch } }));

    const advance = () => {
        const next = STEPS[stepIdx + 1];
        if (next) setWizard(w => ({ ...w, step: next }));
    };

    const continueLabel = () => {
        if (wizard.step === 'map')     return 'Continue → Dedupe';
        if (wizard.step === 'dedupe')  return 'Continue → Preview';
        if (wizard.step === 'preview') return 'Run import ▶';
        return 'Continue';
    };

    // ── File upload ───────────────────────────────────────────────
    const handleFile = async (file) => {
        if (!file) return;
        if (file.size > 100 * 1024 * 1024) { setUploadErr('File exceeds 100 MB limit.'); return; }
        setUploading(true); setUploadErr('');
        try {
            const text    = await file.text();
            const { headers, rows, sample } = parseCSVHeaders(text);
            if (!headers.length) { setUploadErr('Could not read CSV headers.'); return; }
            if (rows > 250000)   { setUploadErr('File exceeds 250,000 row limit. Use the API for larger imports.'); return; }

            const columns = headers.map((csv, i) => {
                const { target, confidence } = autoMap(csv, object);
                const sampleVal = sample.map(row => row[i]).find(v => v) || '';
                const type = /\d{4}-\d{2}-\d{2}/.test(sampleVal) ? 'datetime'
                    : /^\$[\d,]+/.test(sampleVal) ? 'currency'
                    : /^[\d,]+$/.test(sampleVal) ? 'number'
                    : /^https?:\/\//.test(sampleVal) ? 'url'
                    : /@/.test(sampleVal) ? 'email' : 'text';
                const required = (REQUIRED_FIELDS[object]||[]).includes(target);
                return { csv, target, type, sample: sampleVal, confidence, required };
            });

            const sizeKB = file.size / 1024;
            const sizeLbl = sizeKB > 1024 ? `${(sizeKB/1024).toFixed(1)} MB` : `${sizeKB.toFixed(1)} KB`;

            setWizard(w => ({
                ...w,
                step:    'map',
                file:    { name: file.name, size: sizeLbl, rows, encoding: 'UTF-8' },
                columns,
                preview: { willCreate: 0, willUpdate: 0, willSkip: 0, errors: [] },
            }));
        } catch(e) {
            setUploadErr('Failed to read file. Ensure it is a valid UTF-8 CSV.');
        } finally { setUploading(false); }
    };

    const onFileInput = (e) => { const f = e.target.files?.[0]; if (f) handleFile(f); };
    const onDrop = (e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); };

    const inp = { padding:'7px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface, cursor:'pointer', appearance:'none', width:'100%', boxSizing:'border-box' };
    const lbl = { display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5 };
    const thSt = { padding:'9px 12px', fontSize:10, fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', color:T.inkMuted, fontFamily:T.sans, textAlign:'left' };
    const tdSt = (extra={}) => ({ padding:'8px 12px', fontFamily:T.sans, ...extra });

    // ── History view ──────────────────────────────────────────────
    if (showHistory) {
        const totalRows   = DATA_IMPORT.history.reduce((a,b)=>a+b.rows, 0);
        const totalErrors = DATA_IMPORT.history.reduce((a,b)=>a+b.errors, 0);
        return (
            <div style={{ fontFamily:T.sans }}>
                <DataCrumb page="Import history" onBack={onBack}/>
                <DataTitle title="Import history" sub="All CSV imports for this workspace"
                    actions={[
                        <DataBtn key="back" label="← Back to wizard" onClick={()=>setShowHistory(false)}/>,
                        <DataBtn key="new" label="+ New import" primary onClick={()=>setShowHistory(false)}/>,
                    ]}/>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:18 }}>
                    {[
                        { label:'Total runs',   value: DATA_IMPORT.history.length },
                        { label:'Total rows',   value: totalRows.toLocaleString() },
                        { label:'Total errors', value: totalErrors, warn: totalErrors > 0 },
                        { label:'Success rate', value: `${(100 - (totalErrors/totalRows)*100).toFixed(1)}%` },
                    ].map((s,i) => <DataStatCard key={i} label={s.label} value={s.value} warn={s.warn}/>)}
                </div>
                <DataCard title="Recent imports">
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5, fontFamily:T.sans }}>
                        <thead><tr style={{ background:T.surface2 }}>{['Run ID','When','Object','Rows','Errors','Status','Actor'].map((h,i)=><th key={i} style={thSt}>{h}</th>)}</tr></thead>
                        <tbody>
                            {DATA_IMPORT.history.map((h,i) => {
                                const tone  = h.status==='success'?'ok':h.status==='partial'?'warn':'neutral';
                                const label = h.status==='success'?'Success':h.status==='partial'?'Partial':'Cancelled';
                                return (
                                    <tr key={h.id} style={{ borderBottom:i<DATA_IMPORT.history.length-1?`1px solid ${T.border}`:'none', background:h.errors>0?`rgba(184,115,51,0.06)`:'transparent' }}>
                                        <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5 }}>{h.id}</td>
                                        <td style={{ padding:'10px 12px', color:T.inkMid }}>{h.ts}</td>
                                        <td style={{ padding:'10px 12px' }}>{h.object}</td>
                                        <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5 }}>{h.rows.toLocaleString()}</td>
                                        <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5, color:h.errors>0?T.warn:T.inkMid }}>{h.errors||'—'}</td>
                                        <td style={{ padding:'10px 12px' }}><DPill tone={tone}>{label}</DPill></td>
                                        <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11 }}>{h.by}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </DataCard>
            </div>
        );
    }

    return (
        <div style={{ fontFamily:T.sans }}>
            {/* Hidden file input */}
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" style={{ display:'none' }} onChange={onFileInput}/>

            {/* Modals */}
            {showPreset && <SavePresetModal columns={wizard.columns} object={object} onClose={()=>setShowPreset(false)}/>}
            {showRun && (
                <RunImportModal
                    wizard={wizard} object={object}
                    onClose={()=>setShowRun(false)}
                    onComplete={() => { setShowRun(false); setWizard(w => ({ ...w, step:'done' })); }}/>
            )}

            <DataCrumb page="Import" onBack={onBack}/>
            <DataTitle
                title="Import data"
                sub="CSV import for accounts, contacts, leads, opportunities"
                badge={`Last: ${DATA_IMPORT.lastRun.rows} rows · ${DATA_IMPORT.lastRun.errors} errors · ${DATA_IMPORT.lastRun.ts}`}
                updatedBy={DATA_IMPORT.lastRun.by}
                updatedAt={DATA_IMPORT.lastRun.ts}
                actions={[
                    <DataBtn key="h" label="View history" onClick={()=>setShowHistory(true)}/>,
                    <DataBtn key="m" label="Save mapping as preset" onClick={()=>setShowPreset(true)}/>,
                    <DataBtn key="c"
                        label={wizard.step === 'preview' ? 'Run import ▶' : continueLabel()}
                        primary
                        disabled={!canContinue}
                        onClick={() => wizard.step === 'preview' ? setShowRun(true) : advance()}
                    />,
                ]}/>

            {/* Error callout */}
            {uploadErr && (
                <div style={{ padding:'11px 16px', background:'rgba(156,58,46,0.08)', borderLeft:`3px solid ${T.danger}`, borderRadius:4, marginBottom:16, display:'flex', alignItems:'center', gap:12 }}>
                    <span style={{ color:T.danger, fontSize:15 }}>⚠</span>
                    <div style={{ flex:1, fontSize:12.5, color:T.inkMid }}><b style={{ color:T.danger }}>Upload error.</b> {uploadErr}</div>
                    <DataBtn label="Dismiss" onClick={()=>setUploadErr('')}/>
                </div>
            )}

            {/* Last-run errors callout */}
            {!uploadErr && DATA_IMPORT.lastRun.errors > 0 && wizard.step !== 'done' && (
                <div style={{ padding:'11px 16px', background:'rgba(184,115,51,0.09)', borderLeft:`3px solid ${T.warn}`, borderRadius:4, marginBottom:16, display:'flex', alignItems:'center', gap:12 }}>
                    <span style={{ color:T.warn, fontSize:15 }}>⚠</span>
                    <div style={{ flex:1, fontSize:12.5, color:T.inkMid }}>
                        <b style={{ color:T.warn }}>Last import had {DATA_IMPORT.lastRun.errors} row errors.</b> Review the error report before re-running, or load that mapping to retry.
                    </div>
                    <DataBtn label="Download error report"/>
                    <DataBtn label="Reload mapping"/>
                </div>
            )}

            {/* Step rail */}
            <DataStepRail step={wizard.step}/>

            {/* ── Step 1: File ── */}
            <DataCard title="File" desc={wizard.file.name ? 'Step 1 — uploaded.' : 'Step 1 — upload a CSV file.'}>
                {wizard.file.name ? (
                    // File uploaded — show info row
                    <div style={{ display:'flex', alignItems:'center', gap:14, padding:'4px 0' }}>
                        <div style={{ width:44, height:56, borderRadius:3, background:T.surface2, border:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:T.inkMid, fontFamily:'ui-monospace,Menlo,monospace', flexShrink:0 }}>CSV</div>
                        <div style={{ flex:1 }}>
                            <div style={{ fontSize:13, fontWeight:600, fontFamily:'ui-monospace,Menlo,monospace' }}>{wizard.file.name}</div>
                            <div style={{ fontSize:11.5, color:T.inkMid, marginTop:2 }}>{wizard.file.size} · {wizard.file.rows.toLocaleString()} rows · {wizard.file.encoding}</div>
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                            <label style={{ ...lbl, marginBottom:2 }}>Object</label>
                            <select value={object} onChange={e => { setObject(e.target.value); autoMapAll(); }} style={{ ...inp, width:160 }}>
                                {['Accounts','Contacts','Leads','Opportunities'].map(o => <option key={o}>{o}</option>)}
                            </select>
                        </div>
                        <DataBtn label={uploading ? 'Reading…' : 'Replace file'} disabled={uploading} onClick={()=>fileInputRef.current?.click()}/>
                    </div>
                ) : (
                    // No file — drop zone
                    <div
                        onDrop={onDrop}
                        onDragOver={e=>e.preventDefault()}
                        onClick={()=>fileInputRef.current?.click()}
                        style={{ border:`2px dashed ${T.border}`, borderRadius:6, padding:'40px 24px', textAlign:'center', background:T.surface2, cursor:'pointer' }}>
                        <div style={{ fontSize:28, color:T.inkMuted, marginBottom:8 }}>↑</div>
                        <div style={{ fontSize:13, fontWeight:600, color:T.ink }}>Drop CSV here, or <span style={{ color:T.info, textDecoration:'underline' }}>browse</span></div>
                        <div style={{ fontSize:11.5, color:T.inkMid, marginTop:6 }}>UTF-8 · max 100 MB · max 250,000 rows</div>
                    </div>
                )}
            </DataCard>

            {/* ── Step 2: Map columns ── */}
            <DataCard
                title={`Map columns (${mapped} of ${wizard.columns.length} mapped)`}
                desc="Step 2 — confirm Accelerep field for each CSV column. Low-confidence rows are highlighted."
                headAction={
                    <span onClick={autoMapAll} style={{ fontSize:11.5, color:T.info, cursor:'pointer', fontWeight:600 }}>Auto-map all →</span>
                }>
                {wizard.columns.length === 0 ? (
                    <div style={{ color:T.inkMuted, fontSize:13, textAlign:'center', padding:'24px 0' }}>Upload a CSV file to see column mapping.</div>
                ) : (
                <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5, fontFamily:T.sans }}>
                        <thead><tr style={{ background:T.surface2 }}>
                            {['CSV column','Sample value','Type','Accelerep field','Confidence',''].map((h,i)=><th key={i} style={thSt}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                            {wizard.columns.map((c,i) => {
                                const low  = c.confidence < 0.85;
                                const skip = c.target === '__skip__';
                                return (
                                    <tr key={c.csv} style={{ borderBottom: i<wizard.columns.length-1?`1px solid ${T.border}`:'none', background: low&&!skip?'rgba(184,115,51,0.06)':'transparent', opacity: skip?0.55:1 }}>
                                        <td style={{ ...tdSt(), fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5, fontWeight:600 }}>
                                            {c.csv}
                                            {c.required && !skip && <span style={{ marginLeft:6, padding:'1px 5px', borderRadius:10, background:'rgba(184,115,51,0.12)', color:T.warn, fontSize:10, fontWeight:700 }}>Required</span>}
                                        </td>
                                        <td style={{ ...tdSt(), fontFamily:'ui-monospace,Menlo,monospace', fontSize:11, color:T.inkMid, maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.sample}</td>
                                        <td style={tdSt()}>
                                            <span style={{ padding:'2px 7px', borderRadius:10, background:'rgba(138,131,120,0.12)', color:T.inkMid, fontSize:11, fontWeight:600 }}>{c.type}</span>
                                        </td>
                                        <td style={tdSt()}>
                                            <select
                                                value={skip ? '__skip__' : c.target}
                                                onChange={e => setColumnTarget(c.csv, e.target.value)}
                                                style={{ ...inp, width:200, fontSize:12 }}>
                                                <option value="__skip__">— Skip column —</option>
                                                <optgroup label={`${object} fields`}>
                                                    {fields.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                                </optgroup>
                                            </select>
                                        </td>
                                        <td style={tdSt()}>
                                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                                <div style={{ width:60, height:5, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:3, overflow:'hidden', flexShrink:0 }}>
                                                    <div style={{ width:`${Math.round(c.confidence*100)}%`, height:'100%', background: c.confidence>0.9?T.ok:c.confidence>0.7?T.warn:T.danger }}/>
                                                </div>
                                                <span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:10.5, color:T.inkMid, flexShrink:0 }}>{Math.round(c.confidence*100)}%</span>
                                            </div>
                                        </td>
                                        <td style={{ ...tdSt(), textAlign:'right' }}>
                                            <button onClick={() => toggleSkip(c.csv)} style={{ fontSize:11, color:T.inkMid, cursor:'pointer', fontWeight:600, background:'none', border:'none', fontFamily:T.sans }}>
                                                {skip ? 'Map →' : 'Skip'}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                )}
                {!reqMapped && wizard.columns.length > 0 && (
                    <div style={{ marginTop:10, padding:'8px 12px', background:'rgba(184,115,51,0.08)', borderLeft:`3px solid ${T.warn}`, borderRadius:4, fontSize:12, color:T.inkMid }}>
                        <b style={{ color:T.warn }}>Required fields missing.</b> Please map: {reqFields.filter(f => !wizard.columns.some(c => c.target===f)).join(', ')} before continuing.
                    </div>
                )}
            </DataCard>

            {/* ── Step 3: Dedupe ── */}
            <DataCard title="Dedupe rules" desc="Step 3 — what to do when an incoming row matches an existing record.">
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:16, marginBottom:14 }}>
                    <div>
                        <label style={lbl}>Match on</label>
                        <select value={wizard.dedupe.match} onChange={e=>setDedupe({match:e.target.value})} style={inp}>
                            <option value="domain">Domain (case-insensitive)</option>
                            <option value="email">Email address</option>
                            <option value="externalId">External ID (Salesforce / HubSpot)</option>
                            <option value="name">Name (fuzzy)</option>
                        </select>
                    </div>
                    <div>
                        <label style={lbl}>On match</label>
                        <select value={wizard.dedupe.onMatch} onChange={e=>setDedupe({onMatch:e.target.value})} style={inp}>
                            <option value="update">Update existing record</option>
                            <option value="create">Create duplicate</option>
                            <option value="skip">Skip — keep existing</option>
                        </select>
                    </div>
                    <div>
                        <label style={lbl}>Blank values in CSV</label>
                        <select value={wizard.dedupe.skipBlanks ? 'skip' : 'overwrite'} onChange={e=>setDedupe({skipBlanks:e.target.value==='skip'})} style={inp}>
                            <option value="skip">Skip — keep existing</option>
                            <option value="overwrite">Overwrite with blank</option>
                        </select>
                    </div>
                </div>
                <div style={{ padding:'10px 14px', background:'rgba(58,90,122,0.07)', borderLeft:`3px solid ${T.info}`, borderRadius:4, fontSize:12, color:T.inkMid }}>
                    <span style={{ fontWeight:700, color:T.info }}>Note.</span> Falls back to External ID when the chosen key is blank on a row.
                </div>
            </DataCard>

            {/* ── Step 4: Preview ── */}
            <DataCard title="Preview" desc="Step 4 — inspect what the import will do before committing.">
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12, marginBottom:16 }}>
                    <DataStatCard label="Will create" value={wizard.preview.willCreate}/>
                    <DataStatCard label="Will update" value={wizard.preview.willUpdate}/>
                    <DataStatCard label="Will skip"   value={wizard.preview.willSkip}/>
                    <DataStatCard label="Errors"      value={wizard.preview.errors.length} warn={wizard.preview.errors.length > 0}/>
                </div>
                {wizard.step === 'preview' ? (
                    wizard.preview.errors.length > 0 ? (
                        <div style={{ border:`1px solid ${T.border}`, borderRadius:6, overflow:'hidden' }}>
                            <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:T.sans }}>
                                <thead><tr style={{ background:T.surface2 }}>{['Row','Field','Message'].map((h,i)=><th key={i} style={thSt}>{h}</th>)}</tr></thead>
                                <tbody>
                                    {wizard.preview.errors.map((e,i) => (
                                        <tr key={i} style={{ borderBottom:i<wizard.preview.errors.length-1?`1px solid ${T.border}`:'none' }}>
                                            <td style={{ padding:'8px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11, color:T.inkMuted }}>{e.row}</td>
                                            <td style={{ padding:'8px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:12 }}>{e.field}</td>
                                            <td style={{ padding:'8px 12px', fontSize:12.5, color:T.warn }}>{e.msg}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div style={{ padding:'12px 16px', background:'rgba(77,107,61,0.08)', borderLeft:`3px solid ${T.ok}`, borderRadius:4, fontSize:12.5, color:T.inkMid }}>
                            <b style={{ color:T.ok }}>✓ No errors detected.</b> Ready to import.
                        </div>
                    )
                ) : (
                    <div style={{ padding:'12px 16px', background:T.surface2, borderRadius:4, fontSize:12.5, color:T.inkMuted, textAlign:'center' }}>
                        Preview computed from last run. Click <b>Continue → Preview</b> to generate a fresh dry-run.
                    </div>
                )}
            </DataCard>

            {/* ── Step 5: Done ── */}
            {wizard.step === 'done' && (
                <DataCard title="Import complete" desc="Your data has been imported successfully.">
                    <div style={{ padding:'20px', textAlign:'center' }}>
                        <div style={{ fontSize:32, marginBottom:8 }}>✓</div>
                        <div style={{ fontSize:15, fontWeight:700, color:T.ok, marginBottom:6 }}>Import complete</div>
                        <div style={{ fontSize:13, color:T.inkMid, marginBottom:16 }}>Records have been imported into <b>{object}</b>.</div>
                        <button onClick={()=>setWizard(initWizard())} style={{ padding:'8px 20px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:T.sans }}>
                            Start new import
                        </button>
                    </div>
                </DataCard>
            )}
        </div>
    );
};
