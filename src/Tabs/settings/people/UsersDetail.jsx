// settings/people/UsersDetail.jsx
import React, { useState, useEffect } from 'react';
import { useApp } from '../../../AppContext';
import { dbFetch } from '../../../utils/storage';
import { T, eb } from '../shared/tokens.js';
import { RToggle, RCheck, UserAvatar } from '../shared/ui.jsx';

const RolePill = ({ role }) => {
    const map = {
        'Admin':         { bg:'rgba(42,38,34,0.85)',  fg:'#fbf8f3' },
        'Sales Manager': { bg:'rgba(58,90,122,0.14)', fg:'#3a5a7a' },
        'Sales Rep':     { bg:'rgba(77,107,61,0.12)', fg:'#4d6b3d' },
        'CS':            { bg:'rgba(94,78,122,0.12)', fg:'#5e4e7a' },
        'Finance':       { bg:'rgba(184,115,51,0.12)',fg:'#b87333' },
    };
    const c = map[role] || { bg:'rgba(138,131,120,0.14)', fg:'#5a544c' };
    return (
        <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:3, fontSize:11.5, fontWeight:700, background:c.bg, color:c.fg, fontFamily:T.sans, letterSpacing:0.1, whiteSpace:'nowrap' }}>
            {role}
        </span>
    );
};

const PeopleCrumb = ({ onBack, onUsers, leaf }) => (
    <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:T.inkMuted, marginBottom:14, fontFamily:T.sans }}>
        <button onClick={onBack} style={{ background:'none', border:'none', color:T.info, fontWeight:600, cursor:'pointer', fontFamily:T.sans, padding:0, fontSize:12 }}>Settings</button>
        <span>/</span>
        <button onClick={onBack} style={{ background:'none', border:'none', color:T.info, fontWeight:600, cursor:'pointer', fontFamily:T.sans, padding:0, fontSize:12 }}>People & Teams</button>
        <span>/</span>
        <button onClick={onUsers} style={{ background:'none', border:'none', color:T.info, fontWeight:600, cursor:'pointer', fontFamily:T.sans, padding:0, fontSize:12 }}>Users</button>
        <span>/</span>
        <span style={{ color:T.ink, fontWeight:600 }}>{leaf}</span>
    </div>
);

const PeoplePageHeader = ({ title, subtitle, statusDetail, rightActions }) => (
    <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', paddingBottom:16, borderBottom:`1px solid ${T.border}`, marginBottom:20 }}>
        <div style={{ borderLeft:`3px solid ${T.goldInk}`, paddingLeft:10 }}>
            <div style={{ fontSize:22, fontWeight:700, color:T.ink, letterSpacing:-0.3, fontFamily:T.sans }}>{title}</div>
            <div style={{ fontSize:13, color:T.inkMid, marginTop:3, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', fontFamily:T.sans }}>
                <span>{subtitle}</span>
                {statusDetail && <><span style={{ color:T.inkMuted }}>•</span><span style={{ color:T.ok, fontWeight:600 }}>✓</span><span>{statusDetail}</span></>}
            </div>
        </div>
        {rightActions && <div style={{ display:'flex', gap:8 }}>{rightActions}</div>}
    </div>
);

const PeopleSecBtn = ({ children, onClick }) => (
    <button onClick={onClick} style={{ padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}
        onMouseEnter={e=>e.currentTarget.style.background=T.surface2} onMouseLeave={e=>e.currentTarget.style.background=T.surface}>
        {children}
    </button>
);

const PeoplePriBtn = ({ children, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled} style={{ padding:'7px 16px', background: disabled ? T.border : T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:700, cursor: disabled ? 'default' : 'pointer', fontFamily:T.sans, opacity: disabled ? 0.7 : 1 }}>
        {children}
    </button>
);

const SectionCard = ({ title, description, headAction, children }) => (
    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:6, marginBottom:16, fontFamily:T.sans }}>
        {(title || headAction) && (
            <div style={{ padding:'14px 18px 10px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
                <div>
                    {title && <div style={{ fontSize:13.5, fontWeight:700, color:T.ink }}>{title}</div>}
                    {description && <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:2 }}>{description}</div>}
                </div>
                {headAction && <div style={{ flexShrink:0 }}>{headAction}</div>}
            </div>
        )}
        <div style={{ padding:'14px 18px' }}>{children}</div>
    </div>
);

const UsersInvitePage = ({ settings, onBack, onUsers }) => {
    const { setSettings } = useApp();
    const [rows, setRows] = useState([
        { id:1, email:'', role:'Sales Rep', team:'', manager:'', territory:'', valid:true, error:'' },
    ]);
    const [defaultRole, setDefaultRole] = useState('Sales Rep');
    const [expiry, setExpiry] = useState('7 days');
    const [requireMfa, setRequireMfa] = useState(true);
    const [note, setNote] = useState('Welcome to the team! Click below to set up your password — should take under 5 minutes.');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');

    const allTeams  = [...new Set((settings.teams || []).map(t => typeof t === 'string' ? t : t.name).filter(Boolean))].sort();
    const allReps   = [...new Set((settings.users || []).map(u => u.name).filter(Boolean))].sort();
    const allTerr   = [...new Set((settings.territories || []).map(t => typeof t === 'string' ? t : t.name).filter(Boolean))].sort();
    const roleOpts  = ['Admin', 'Manager', 'Sales Rep', 'ReadOnly'];

    const addRow = () => setRows(prev => [...prev, { id:Date.now(), email:'', role:defaultRole, team:'', manager:'', territory:'', valid:true, error:'' }]);
    const removeRow = (id) => setRows(prev => prev.filter(r => r.id !== id));
    const updateRow = (id, field, val) => setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));

    const validateRows = () => {
        const existingEmails = new Set((settings.users || []).map(u => (u.email || '').toLowerCase()));
        return rows.map(r => {
            const email = r.email.trim().toLowerCase();
            if (!email) return { ...r, valid:false, error:'Email required' };
            if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ...r, valid:false, error:'Invalid email format' };
            if (existingEmails.has(email)) return { ...r, valid:false, error:'Email already in workspace' };
            return { ...r, valid:true, error:'' };
        });
    };

    const readyCount = rows.filter(r => r.email.trim() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email.trim())).length;

    const handleSend = async () => {
        const validated = validateRows();
        setRows(validated);
        const invalid = validated.filter(r => !r.valid);
        if (invalid.length > 0) { setError(`Fix ${invalid.length} error${invalid.length > 1 ? 's' : ''} before sending.`); return; }
        setSaving(true); setError('');
        try {
            const invites = validated.map(r => ({ email:r.email.trim(), role:r.role||defaultRole, team:r.team, manager:r.manager, territory:r.territory, note, expiry, requireMfa }));
            const resp = await dbFetch('/.netlify/functions/users', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'invite', invites }) });
            if (!resp.ok) { const d = await resp.json(); throw new Error(d.error || 'Invite failed'); }
            setSaved(true);
            setTimeout(() => { setSaved(false); onUsers(); }, 1500);
        } catch(err) {
            setError(err.message || 'Failed to send invites. Please try again.');
        } finally { setSaving(false); }
    };

    const inp = { width:'100%', padding:'6px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, fontFamily:T.sans, background:T.surface, color:T.ink, outline:'none', boxSizing:'border-box' };
    const sel = { ...inp, cursor:'pointer' };

    return (
        <div style={{ fontFamily:T.sans }}>
            <PeopleCrumb onBack={onBack} onUsers={onUsers} leaf="Invite" />
            <PeoplePageHeader
                title="Invite users"
                subtitle="Send invitations to join the workspace. Invitees receive a 7-day expiring email link."
                statusDetail={readyCount > 0 ? `${readyCount} ready to send` : null}
                rightActions={<>
                    <PeopleSecBtn onClick={onUsers}>Cancel</PeopleSecBtn>
                    <PeoplePriBtn onClick={handleSend} disabled={saving || readyCount === 0}>
                        {saving ? 'Sending…' : saved ? '✓ Sent!' : `Send ${readyCount > 0 ? readyCount : ''} invite${readyCount !== 1 ? 's' : ''}`}
                    </PeoplePriBtn>
                </>}
            />

            {error && <div style={{ marginBottom:14, padding:'10px 14px', background:'rgba(156,58,46,0.10)', border:`1px solid rgba(156,58,46,0.25)`, borderRadius:T.r, fontSize:12.5, color:T.danger, fontFamily:T.sans }}>{error}</div>}

            <div style={{ display:'grid', gridTemplateColumns:'1fr 300px', gap:18, alignItems:'start' }}>
                <div>
                    <SectionCard title="Recipients" description="Add one email per row. Set role and team inline."
                        headAction={<PeopleSecBtn onClick={addRow}>+ Add row</PeopleSecBtn>}>
                        {/* Table header */}
                        <div style={{ display:'grid', gridTemplateColumns:'1.8fr 130px 130px 130px 24px', gap:8, padding:'0 0 8px', marginBottom:4, borderBottom:`1px solid ${T.border}` }}>
                            {['Email *','Role','Team','Territory',''].map((h,i) => (
                                <div key={i} style={{ ...eb(T.inkMuted), fontSize:9.5 }}>{h}</div>
                            ))}
                        </div>
                        {rows.map((r, idx) => (
                            <div key={r.id} style={{ marginBottom:6 }}>
                                <div style={{ display:'grid', gridTemplateColumns:'1.8fr 130px 130px 130px 24px', gap:8, alignItems:'center' }}>
                                    <div>
                                        <input style={{ ...inp, borderColor: r.error ? T.danger : T.border }} value={r.email} onChange={e=>updateRow(r.id,'email',e.target.value)} placeholder="user@company.com" type="email"/>
                                    </div>
                                    <select style={sel} value={r.role} onChange={e=>updateRow(r.id,'role',e.target.value)}>
                                        {roleOpts.map(o=><option key={o}>{o}</option>)}
                                    </select>
                                    <select style={sel} value={r.team} onChange={e=>updateRow(r.id,'team',e.target.value)}>
                                        <option value="">— choose —</option>
                                        {allTeams.map(t=><option key={t}>{t}</option>)}
                                    </select>
                                    <select style={sel} value={r.territory} onChange={e=>updateRow(r.id,'territory',e.target.value)}>
                                        <option value="">— choose —</option>
                                        {allTerr.map(t=><option key={t}>{t}</option>)}
                                    </select>
                                    <button onClick={()=>removeRow(r.id)} disabled={rows.length === 1} style={{ background:'none', border:'none', color:T.danger, cursor: rows.length===1?'default':'pointer', fontSize:14, lineHeight:1, opacity:rows.length===1?0.3:1, padding:0 }}>✕</button>
                                </div>
                                {r.error && <div style={{ fontSize:10.5, color:T.danger, marginTop:3, paddingLeft:2 }}>{r.error}</div>}
                            </div>
                        ))}
                        <button onClick={addRow} style={{ marginTop:8, width:'100%', padding:'7px', background:'transparent', border:`1px dashed ${T.borderStrong}`, borderRadius:T.r, fontSize:12, color:T.inkMid, cursor:'pointer', fontFamily:T.sans }}>+ Add another</button>
                    </SectionCard>

                    <SectionCard title="Invite settings" description="Applied to all recipients in this batch.">
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                            <div>
                                <div style={{ ...eb(T.inkMuted), marginBottom:5 }}>Default role</div>
                                <select style={sel} value={defaultRole} onChange={e=>setDefaultRole(e.target.value)}>
                                    {roleOpts.map(o=><option key={o}>{o}</option>)}
                                </select>
                                <div style={{ fontSize:10.5, color:T.inkMuted, marginTop:3 }}>Used for rows that don't specify one.</div>
                            </div>
                            <div>
                                <div style={{ ...eb(T.inkMuted), marginBottom:5 }}>Invite expiry</div>
                                <select style={sel} value={expiry} onChange={e=>setExpiry(e.target.value)}>
                                    {['3 days','7 days','14 days','30 days'].map(o=><option key={o}>{o}</option>)}
                                </select>
                            </div>
                            <div style={{ gridColumn:'1 / 3' }}>
                                <div style={{ ...eb(T.inkMuted), marginBottom:5 }}>Personal note (optional)</div>
                                <textarea value={note} onChange={e=>setNote(e.target.value)} rows={3}
                                    style={{ ...inp, resize:'vertical', lineHeight:1.5 }}
                                    placeholder="Appears in the invitation email above the join button."/>
                            </div>
                            <div style={{ gridColumn:'1 / 3', display:'flex', flexDirection:'column', gap:10, padding:12, background:T.bg, borderRadius:T.r }}>
                                <label style={{ display:'flex', alignItems:'center', gap:10, fontSize:12.5, color:T.ink, cursor:'pointer' }}>
                                    <RToggle on={requireMfa} onChange={setRequireMfa}/>
                                    Require MFA on first login
                                </label>
                            </div>
                        </div>
                    </SectionCard>
                </div>

                {/* Right rail */}
                <div style={{ position:'sticky', top:0 }}>
                    <SectionCard title="Seat impact" description="If you send all valid invites.">
                        {[
                            { label:'Active today', value:(settings.users||[]).filter(u=>u.name).length },
                            { label:'Pending today', value:0 },
                            { label:'After this batch', value:(settings.users||[]).filter(u=>u.name).length + readyCount, warn: readyCount > 0 },
                        ].map((r,i) => (
                            <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 0', borderTop: i>0 ? `1px solid ${T.border}` : 'none' }}>
                                <span style={{ fontSize:12.5, color:T.inkMid }}>{r.label}</span>
                                <span style={{ fontSize:13.5, fontWeight:700, color: r.warn ? T.warn : T.ink, fontFamily:'ui-monospace,Menlo,monospace' }}>{r.value}</span>
                            </div>
                        ))}
                    </SectionCard>

                    <SectionCard title="Email preview" description="What recipients will see.">
                        <div style={{ padding:14, background:T.bg, borderRadius:T.r, border:`1px solid ${T.border}` }}>
                            <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, marginBottom:6, fontFamily:T.sans }}>From: Accelerep &lt;noreply@accelerep.com&gt;</div>
                            <div style={{ fontSize:12.5, fontWeight:700, color:T.ink, marginBottom:8 }}>You've been invited to Accelerep</div>
                            <div style={{ fontSize:12, color:T.inkMid, lineHeight:1.55, marginBottom:10 }}>{note || 'Join your team on Accelerep.'}</div>
                            <div style={{ padding:'8px 14px', background:T.ink, color:'#fbf8f3', borderRadius:T.r, fontSize:12, fontWeight:700, display:'inline-block' }}>Accept invite →</div>
                            <div style={{ fontSize:10.5, color:T.inkMuted, marginTop:8 }}>This invite expires in {expiry}.</div>
                        </div>
                    </SectionCard>
                </div>
            </div>
        </div>
    );
};

const UsersImportPage = ({ settings, onBack, onUsers }) => {
    const [step, setStep] = useState(1);
    const [file, setFile] = useState(null);
    const [dragging, setDragging] = useState(false);

    const stepLabels = ['Upload file', 'Map & validate', 'Confirm & send'];

    const handleDrop = (e) => {
        e.preventDefault(); setDragging(false);
        const f = e.dataTransfer.files[0];
        if (f && (f.name.endsWith('.csv') || f.name.endsWith('.xlsx'))) { setFile(f); setStep(2); }
    };

    return (
        <div style={{ fontFamily:T.sans }}>
            <PeopleCrumb onBack={onBack} onUsers={onUsers} leaf="Import" />
            <PeoplePageHeader
                title="Import users from CSV"
                subtitle="Upload a CSV or XLSX file to bulk-create users."
                statusDetail={file ? `${file.name}` : null}
                rightActions={<>
                    <PeopleSecBtn onClick={onUsers}>Cancel</PeopleSecBtn>
                    {step > 1 && <PeopleSecBtn onClick={() => setStep(s => s - 1)}>← Back</PeopleSecBtn>}
                    {step === 3 && <PeoplePriBtn onClick={onUsers}>Import users</PeoplePriBtn>}
                </>}
            />

            {/* Step indicator */}
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
                {stepLabels.map((label, i) => {
                    const n = i + 1;
                    const done = step > n; const active = step === n;
                    return (
                        <React.Fragment key={n}>
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                <span style={{ width:22, height:22, borderRadius:'50%', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700,
                                    background: done ? T.ok : active ? T.ink : T.border,
                                    color: (done || active) ? '#fbf8f3' : T.inkMuted }}>
                                    {done ? '✓' : n}
                                </span>
                                <span style={{ fontSize:12.5, fontWeight: active ? 700 : 500, color: active ? T.ink : T.inkMuted }}>{label}</span>
                            </div>
                            {i < stepLabels.length - 1 && <span style={{ flex:'0 0 48px', height:1, background:T.border }}/>}
                        </React.Fragment>
                    );
                })}
            </div>

            {step === 1 && (
                <SectionCard title="Upload file" description="Accepted: .csv, .xlsx — max 5 MB.">
                    <div
                        onDragOver={e=>{e.preventDefault();setDragging(true)}}
                        onDragLeave={()=>setDragging(false)}
                        onDrop={handleDrop}
                        style={{ border:`2px dashed ${dragging ? T.goldInk : T.borderStrong}`, borderRadius:6, padding:'48px 24px', textAlign:'center', background: dragging ? 'rgba(200,185,154,0.08)' : T.bg, cursor:'pointer', transition:'all 150ms' }}
                        onClick={() => document.getElementById('pt-csv-upload').click()}
                    >
                        <div style={{ fontSize:32, marginBottom:10 }}>📄</div>
                        <div style={{ fontSize:14, fontWeight:700, color:T.ink, marginBottom:6 }}>Drop your CSV or XLSX here</div>
                        <div style={{ fontSize:12.5, color:T.inkMid, marginBottom:16 }}>or click to browse</div>
                        <div style={{ display:'inline-block', padding:'8px 18px', background:T.ink, color:'#fbf8f3', borderRadius:T.r, fontSize:12.5, fontWeight:600 }}>Browse files</div>
                        <input id="pt-csv-upload" type="file" accept=".csv,.xlsx" style={{ display:'none' }}
                            onChange={e=>{ if(e.target.files[0]){ setFile(e.target.files[0]); setStep(2); } }}/>
                    </div>
                    <div style={{ marginTop:14, fontSize:12, color:T.inkMuted }}>
                        Don't have a file?{' '}
                        <span style={{ color:T.info, fontWeight:600, cursor:'pointer' }}>Download template →</span>
                        <span style={{ marginLeft:16, color:T.inkMuted }}>Required columns: Email, Name. Optional: Role, Team, Manager, Territory.</span>
                    </div>
                </SectionCard>
            )}

            {step === 2 && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:16 }}>
                    <SectionCard title="Column mapping" description={file ? `${file.name} · columns detected` : ''}>
                        <div style={{ fontSize:13, color:T.inkMid, padding:'24px', textAlign:'center' }}>
                            Upload a real CSV to see column mapping here. In production, detected columns will appear with auto-matched Accelerep fields.
                        </div>
                        <div style={{ marginTop:12, display:'flex', gap:8, justifyContent:'flex-end' }}>
                            <PeoplePriBtn onClick={() => setStep(3)}>Next → Preview</PeoplePriBtn>
                        </div>
                    </SectionCard>
                    <SectionCard title="Defaults" description="Applied to rows missing a value.">
                        <div style={{ fontSize:12, color:T.inkMid, lineHeight:1.6 }}>
                            <div style={{ marginBottom:8 }}><strong>Role:</strong> Sales Rep</div>
                            <div style={{ marginBottom:8 }}><strong>Team:</strong> Ask later</div>
                            <div><strong>MFA:</strong> Required on first login</div>
                        </div>
                    </SectionCard>
                </div>
            )}

            {step === 3 && (
                <SectionCard title="Preview" description="Review before importing.">
                    <div style={{ padding:'32px', textAlign:'center', color:T.inkMuted, fontSize:13 }}>
                        Upload and map a CSV file to preview rows here.
                    </div>
                </SectionCard>
            )}
        </div>
    );
};

const UsersExportPage = ({ settings, onBack, onUsers }) => {
    const users = settings.users || [];
    const [format, setFormat] = useState('CSV');
    const [statusFilter, setStatusFilter] = useState('All');
    const [exporting, setExporting] = useState(false);
    const [exportDone, setExportDone] = useState(false);

    const fieldGroups = [
        { group:'Identity', items:[['Name',true],['Email',true],['Phone',false],['Title',false]] },
        { group:'Access',   items:[['Role',true],['Team',true],['Manager',true],['Territory',true]] },
        { group:'Status',   items:[['Status',true],['MFA',true],['Last active',true],['Joined',false]] },
    ];
    const [checked, setChecked] = useState(() => {
        const m = {}; fieldGroups.forEach(g => g.items.forEach(([k,v]) => { m[k] = v; })); return m;
    });

    const filteredUsers = users.filter(u => statusFilter === 'All' || u.userType === statusFilter || u.role === statusFilter);
    const checkedFields = Object.entries(checked).filter(([,v])=>v).map(([k])=>k);

    const handleExport = () => {
        setExporting(true);
        setTimeout(() => {
            // Build CSV from real users data
            const header = checkedFields.join(',');
            const rows = filteredUsers.map(u => checkedFields.map(f => {
                if (f === 'Name') return `"${u.name||''}"`;
                if (f === 'Email') return `"${u.email||''}"`;
                if (f === 'Role') return `"${u.userType||u.role||''}"`;
                if (f === 'Team') return `"${u.team||''}"`;
                if (f === 'Manager') return `"${u.manager||''}"`;
                if (f === 'Territory') return `"${u.territory||''}"`;
                if (f === 'Status') return '"Active"';
                if (f === 'MFA') return `"${u.smsNotifications?.enabled ? 'On' : 'Off'}"`;
                return '""';
            }).join(','));
            const csv = [header, ...rows].join('\n');
            const blob = new Blob([csv], { type:'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `accelerep-users-${new Date().toISOString().split('T')[0]}.${format.toLowerCase()}`;
            a.click(); URL.revokeObjectURL(url);
            setExporting(false); setExportDone(true);
            setTimeout(() => setExportDone(false), 3000);
        }, 800);
    };

    const fmtBtn = (f) => (
        <button key={f} onClick={() => setFormat(f)} style={{ padding:'6px 14px', fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans, border:`1px solid ${T.border}`, borderRadius: f === 'CSV' ? `${T.r}px 0 0 ${T.r}px` : f === 'JSON' ? `0 ${T.r}px ${T.r}px 0` : '0', background: format===f ? T.ink : T.surface, color: format===f ? '#fbf8f3' : T.inkMid, marginLeft: f==='CSV'?0:-1 }}>{f}</button>
    );

    return (
        <div style={{ fontFamily:T.sans }}>
            <PeopleCrumb onBack={onBack} onUsers={onUsers} leaf="Export" />
            <PeoplePageHeader
                title="Export users"
                subtitle="One-time export of your workspace user list."
                statusDetail={`${filteredUsers.length} rows · ${checkedFields.length} fields`}
                rightActions={<>
                    <PeopleSecBtn onClick={onUsers}>Cancel</PeopleSecBtn>
                    <PeoplePriBtn onClick={handleExport} disabled={exporting}>
                        {exporting ? 'Exporting…' : exportDone ? '✓ Downloaded' : `Download ${format}`}
                    </PeoplePriBtn>
                </>}
            />

            <div style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:18, alignItems:'start' }}>
                <div>
                    <SectionCard title="Scope" description="Which users to include.">
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                            <div>
                                <div style={{ ...eb(T.inkMuted), marginBottom:5 }}>Status filter</div>
                                <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
                                    style={{ width:'100%', padding:'6px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, fontFamily:T.sans, background:T.surface, color:T.ink, outline:'none' }}>
                                    <option>All</option>
                                    <option>Admin</option>
                                    <option>Manager</option>
                                    <option>User</option>
                                    <option>ReadOnly</option>
                                </select>
                            </div>
                            <div>
                                <div style={{ ...eb(T.inkMuted), marginBottom:5 }}>Format</div>
                                <div style={{ display:'flex' }}>{['CSV','XLSX','JSON'].map(fmtBtn)}</div>
                            </div>
                        </div>
                    </SectionCard>

                    <SectionCard title="Fields" description="Pick which columns to include.">
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                            {fieldGroups.map(g => (
                                <div key={g.group}>
                                    <div style={{ ...eb(T.inkMuted), marginBottom:8 }}>{g.group}</div>
                                    {g.items.map(([k]) => (
                                        <label key={k} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0', cursor:'pointer', fontSize:12.5, color:T.ink }}>
                                            <RCheck on={!!checked[k]} onChange={v => setChecked(prev => ({ ...prev, [k]:v }))}/>
                                            {k}
                                        </label>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </SectionCard>
                </div>

                <div style={{ position:'sticky', top:0 }}>
                    <SectionCard title="Preview" description="First row, selected fields.">
                        <div style={{ padding:10, background:T.bg, borderRadius:T.r, fontFamily:'ui-monospace,Menlo,monospace', fontSize:11, color:T.inkMid, wordBreak:'break-all', lineHeight:1.6 }}>
                            {checkedFields.join(', ')}<br/>
                            {filteredUsers.slice(0,1).map(u => checkedFields.map(f => {
                                if (f==='Name') return `"${u.name||''}"`;
                                if (f==='Email') return `"${u.email||''}"`;
                                if (f==='Role') return `"${u.userType||''}"`;
                                return '""';
                            }).join(', '))}
                        </div>
                    </SectionCard>
                    <SectionCard title="About exports" description="">
                        <div style={{ fontSize:12, color:T.inkMid, lineHeight:1.6 }}>
                            Exports are logged in the audit trail. Files are available for download immediately and expire after 7 days.
                        </div>
                    </SectionCard>
                </div>
            </div>
        </div>
    );
};

const UsersPendingPage = ({ settings, onBack, onUsers }) => {
    // Pending invites are surfaced from settings.users with status 'invited'
    const pendingUsers = (settings.users || []).filter(u => u.status === 'invited');
    const [openPendingKebab, setOpenPendingKebab] = useState(null); // invite id
    const [localPending, setLocalPending] = useState(null); // tracks revocations in session

    React.useEffect(() => {
        if (openPendingKebab === null) return;
        const handler = () => setOpenPendingKebab(null);
        document.addEventListener('click', handler);
        return () => document.removeEventListener('click', handler);
    }, [openPendingKebab]);

    const basePending = pendingUsers.map((u,i) => ({ id:u.id||i, name:u.name, email:u.email||'', role:u.userType||'Sales Rep', team:u.team||'—', invitedBy:'—', sent:'Recently', opened:false, expires:'in 7d' }));

    const displayPending = localPending !== null ? localPending : basePending;

    const handleRevoke  = (id) => { setLocalPending((displayPending).filter(u => u.id !== id)); setOpenPendingKebab(null); };
    const handleResend  = (id) => { setOpenPendingKebab(null); /* POST to resend invite */ };
    const handleCopyLink= (id) => { setOpenPendingKebab(null); navigator.clipboard?.writeText(`https://accelerep.com/invite/${id}`).catch(()=>{}); };
    const handleReinvite= (id) => { setLocalPending(displayPending.map(u => u.id===id ? { ...u, expired:false, expires:'in 7d', sent:'just now' } : u)); setOpenPendingKebab(null); };

    const openCount    = displayPending.filter(u => !u.expired).length;
    const openedCount  = displayPending.filter(u => u.opened).length;
    const expiringSoon = displayPending.filter(u => u.warn).length;
    const expired      = displayPending.filter(u => u.expired).length;

    return (
        <div style={{ fontFamily:T.sans }}>
            <PeopleCrumb onBack={onBack} onUsers={onUsers} leaf="Pending invites" />
            <PeoplePageHeader
                title="Pending invites"
                subtitle="Track who has been invited but hasn't joined yet."
                statusDetail={`${openCount} active · ${expired} expired`}
                rightActions={<>
                    <PeopleSecBtn>Resend all active</PeopleSecBtn>
                    <PeoplePriBtn onClick={onUsers}>← Back to users</PeoplePriBtn>
                </>}
            />

            <div style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:18, alignItems:'start' }}>
                <div>
                    {/* KPI strip */}
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
                        {[
                            { label:'Open invites',     value:openCount,    color:T.ink },
                            { label:'Opened email',     value:openedCount,  color:T.ok },
                            { label:'Expiring soon',    value:expiringSoon, color:T.warn },
                            { label:'Expired',          value:expired,      color:T.danger },
                        ].map(k => (
                            <div key={k.label} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:6, padding:'12px 14px' }}>
                                <div style={{ fontSize:22, fontWeight:700, color:k.color, fontFamily:'ui-monospace,Menlo,monospace', lineHeight:1 }}>{k.value}</div>
                                <div style={{ fontSize:11, color:T.inkMuted, marginTop:4 }}>{k.label}</div>
                            </div>
                        ))}
                    </div>

                    <SectionCard title="Invites" description="Status reflects the latest action.">
                        {displayPending.length === 0 ? (
                            <div style={{ padding:'32px', textAlign:'center', color:T.inkMuted, fontSize:13 }}>All caught up. No invites pending.</div>
                        ) : displayPending.map((u, i) => (
                            <div key={u.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 0', borderBottom: i < displayPending.length-1 ? `1px solid ${T.border}` : 'none' }}>
                                <UserAvatar name={u.name} size={32}/>
                                <div style={{ flex:1, minWidth:0 }}>
                                    <div style={{ fontSize:13, fontWeight:600, color: u.expired ? T.inkMuted : T.ink }}>{u.name}</div>
                                    <div style={{ fontSize:11, color:T.inkMuted }}>{u.email}</div>
                                </div>
                                <RolePill role={u.role}/>
                                <div style={{ fontSize:11.5, color:T.inkMid, minWidth:80 }}>{u.team || '—'}</div>
                                <div style={{ fontSize:11, color:T.inkMuted, minWidth:70 }}>via {u.invitedBy}</div>
                                <div style={{ fontSize:11, color:T.inkMuted, minWidth:70 }}>Sent {u.sent}</div>
                                <div style={{ fontSize:11, color: u.opened ? T.ok : T.inkMuted, minWidth:60 }}>{u.opened ? '● Opened' : '○ Not yet'}</div>
                                <div style={{ fontSize:11, fontWeight:600, color: u.expired ? T.danger : u.warn ? T.warn : T.inkMid, minWidth:55 }}>{u.expires}</div>
                                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                                    {u.expired
                                        ? <>
                                            <PeopleSecBtn onClick={() => handleReinvite(u.id)}>Re-invite</PeopleSecBtn>
                                            <PeopleSecBtn onClick={() => handleRevoke(u.id)}>Revoke</PeopleSecBtn>
                                        </>
                                        : <>
                                            <PeopleSecBtn onClick={() => handleResend(u.id)}>Resend</PeopleSecBtn>
                                            <PeopleSecBtn>Edit</PeopleSecBtn>
                                            <div style={{ position:'relative' }}>
                                                <button onClick={e => { e.stopPropagation(); setOpenPendingKebab(openPendingKebab === u.id ? null : u.id); }}
                                                    style={{ background:'none', border:`1px solid ${T.border}`, borderRadius:T.r, color:T.inkMuted, fontSize:15, cursor:'pointer', padding:'4px 8px', lineHeight:1 }}
                                                    onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'none'}>⋯</button>
                                                {openPendingKebab === u.id && (
                                                    <div onClick={e => e.stopPropagation()}
                                                        style={{ position:'absolute', right:0, bottom:'100%', marginBottom:4, zIndex:400, background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+2, boxShadow:'0 4px 16px rgba(42,38,34,0.12)', minWidth:180 }}>
                                                        {[
                                                            { label:'Copy invite link', action: () => handleCopyLink(u.id) },
                                                            { label:'Edit role',         action: () => setOpenPendingKebab(null) },
                                                            { label:'Revoke invite',     action: () => handleRevoke(u.id), danger: true },
                                                        ].map((item, mi) => (
                                                            <button key={mi} onClick={item.action}
                                                                style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none', borderTop: mi>0 ? `1px solid ${T.border}` : 'none', textAlign:'left', fontSize:13, color: item.danger ? T.danger : T.ink, cursor:'pointer', fontFamily:T.sans }}
                                                                onMouseEnter={e => e.currentTarget.style.background = item.danger ? 'rgba(156,58,46,0.06)' : T.surface2}
                                                                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                                                {item.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    }
                                </div>
                            </div>
                        ))}
                    </SectionCard>
                </div>

                <div style={{ position:'sticky', top:0 }}>
                    <SectionCard title="Reminder cadence" description="When automatic resends fire.">
                        {[
                            { day:'Day 0', label:'Initial invite sent', on:true },
                            { day:'Day 3', label:'First reminder — email', on:true },
                            { day:'Day 5', label:'Second reminder — email', on:true },
                            { day:'Day 7', label:'Invite expires — marked closed', on:true },
                        ].map((r,i) => (
                            <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderTop: i>0 ? `1px solid ${T.border}` : 'none' }}>
                                <span style={{ fontSize:10.5, fontWeight:700, color:T.inkMuted, minWidth:36 }}>{r.day}</span>
                                <span style={{ flex:1, fontSize:12.5, color:T.ink }}>{r.label}</span>
                                <RToggle on={r.on} onChange={() => {}}/>
                            </div>
                        ))}
                    </SectionCard>
                </div>
            </div>
        </div>
    );
};

const UsersSeatPage = ({ settings, onBack, onUsers }) => {
    const users = settings.users || [];
    const activeUsers = users.filter(u => u.name);
    const cap = 50;
    const used = activeUsers.length;
    const pct = used / cap;

    const breakdown = [
        { role:'Admin',         count: activeUsers.filter(u=>u.userType==='Admin').length,    color:'#6b2a22' },
        { role:'Manager',       count: activeUsers.filter(u=>u.userType==='Manager').length,  color:'#b87333' },
        { role:'Sales Rep',     count: activeUsers.filter(u=>u.userType==='User').length,     color:'#4d6b3d' },
        { role:'ReadOnly',      count: activeUsers.filter(u=>u.userType==='ReadOnly').length, color:'#3a5a7a' },
    ].filter(b => b.count > 0);

    const allTeams = [...new Set(activeUsers.map(u => u.team).filter(Boolean))].sort();
    const teamCounts = allTeams.map(t => ({ name:t, count:activeUsers.filter(u=>u.team===t).length }));
    const maxTeam = Math.max(...teamCounts.map(t=>t.count), 1);

    const warnPct = pct >= 0.8;
    const barColor = pct >= 1 ? T.danger : pct >= 0.8 ? T.warn : T.ok;

    return (
        <div style={{ fontFamily:T.sans }}>
            <PeopleCrumb onBack={onBack} onUsers={onUsers} leaf="Seat usage" />
            <PeoplePageHeader
                title="Seat usage"
                subtitle="Workspace seat allocation and plan limits."
                statusDetail={`${used} of ${cap} used (${Math.round(pct*100)}%)`}
                rightActions={<PeoplePriBtn onClick={() => {}}>Add seats</PeoplePriBtn>}
            />

            <SectionCard title="Workspace seats" description="Business plan · billed monthly"
                headAction={<PeopleSecBtn>Manage plan</PeopleSecBtn>}>
                <div style={{ display:'flex', alignItems:'baseline', gap:12, marginBottom:14 }}>
                    <span style={{ fontFamily:T.serif, fontStyle:'italic', fontWeight:700, fontSize:52, color:T.ink, lineHeight:1 }}>{used}</span>
                    <span style={{ fontSize:16, color:T.inkMid }}>of {cap} seats used</span>
                    <span style={{ flex:1 }}/>
                    <span style={{ fontSize:11.5, color:T.inkMuted }}>{cap - used} remaining</span>
                </div>
                {/* Stacked bar */}
                <div style={{ display:'flex', height:20, borderRadius:T.r, overflow:'hidden', border:`1px solid ${T.border}`, marginBottom:10 }}>
                    {breakdown.map(b => (
                        <div key={b.role} title={`${b.role}: ${b.count}`} style={{ width:`${(b.count/cap)*100}%`, background:b.color }}/>
                    ))}
                    <div style={{ flex:1, background:T.surface2 }}/>
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:12 }}>
                    {breakdown.map(b => (
                        <div key={b.role} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11.5, color:T.inkMid }}>
                            <span style={{ width:8, height:8, background:b.color, borderRadius:2 }}/>
                            <span>{b.role}</span>
                            <span style={{ fontFamily:'ui-monospace,Menlo,monospace', color:T.ink, fontWeight:700 }}>{b.count}</span>
                        </div>
                    ))}
                    <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11.5, color:T.inkMuted }}>
                        <span style={{ width:8, height:8, background:T.surface2, borderRadius:2, border:`1px solid ${T.borderStrong}` }}/>
                        <span>Available</span>
                        <span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontWeight:700 }}>{cap - used}</span>
                    </div>
                </div>
            </SectionCard>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:18, alignItems:'start' }}>
                <SectionCard title="By team" description="Seat count per team.">
                    {teamCounts.length === 0
                        ? <div style={{ color:T.inkMuted, fontSize:13, textAlign:'center', padding:24 }}>No teams configured.</div>
                        : teamCounts.map(t => (
                            <div key={t.name} style={{ marginBottom:12 }}>
                                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                                    <span style={{ fontSize:12.5, fontWeight:600, color:T.ink }}>{t.name}</span>
                                    <span style={{ fontSize:12, fontFamily:'ui-monospace,Menlo,monospace', fontWeight:700, color:T.ink }}>{t.count}</span>
                                </div>
                                <div style={{ height:4, background:T.surface2, borderRadius:2 }}>
                                    <div style={{ width:`${(t.count/maxTeam)*100}%`, height:'100%', background:T.goldInk, borderRadius:2 }}/>
                                </div>
                            </div>
                        ))
                    }
                </SectionCard>

                <div style={{ position:'sticky', top:0 }}>
                    <SectionCard title="Plan & billing" description="Current plan details.">
                        {[
                            ['Plan',         'Business'],
                            ['Seats included',`${cap}`],
                            ['Per-seat price','$39 / mo'],
                            ['Overage policy','Soft cap'],
                        ].map(([k,v],i) => (
                            <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderTop: i>0?`1px solid ${T.border}`:'none' }}>
                                <span style={{ fontSize:12.5, color:T.inkMid }}>{k}</span>
                                <span style={{ fontSize:12.5, fontWeight:600, color:T.ink }}>{v}</span>
                            </div>
                        ))}
                    </SectionCard>
                    {warnPct && (
                        <SectionCard title="⚠ Approaching limit" description="">
                            <div style={{ fontSize:12.5, color:T.warn, lineHeight:1.55 }}>
                                You're using <strong>{Math.round(pct*100)}%</strong> of your seats. Consider adding seats before you hit the cap.
                            </div>
                            <div style={{ marginTop:10 }}>
                                <PeoplePriBtn onClick={() => {}}>Add seats</PeoplePriBtn>
                            </div>
                        </SectionCard>
                    )}
                </div>
            </div>
        </div>
    );
};

const UsersSecurityPage = ({ settings, onBack, onUsers }) => {
    const users = settings.users || [];
    const active = users.filter(u => u.name);

    // Derive security signals from available user data
    const noMfa  = active.filter(u => u.smsNotifications && !u.smsNotifications.enabled);
    const stale  = active.filter(u => {
        if (!u.lastLoginAt) return false;
        const days = (Date.now() - new Date(u.lastLoginAt).getTime()) / 86400000;
        return days > 30;
    });

    const mfaOn  = active.length - noMfa.length;
    const score  = Math.round(70 + (mfaOn / Math.max(active.length, 1)) * 20 + (stale.length === 0 ? 10 : 0));
    const scoreColor = score >= 80 ? T.ok : score >= 60 ? T.warn : T.danger;

    const recentEvents = [
        { when:'2h ago',    actor:'System',        event:'MFA enforcement reminder sent to 4 users',         severity:'info' },
        { when:'Yesterday', actor:'Morgan Reyes',  event:'New user invited — Anika Bose',                    severity:'info' },
        { when:'2 days ago',actor:'System',        event:'Session policy enforced — 3 sessions expired',     severity:'low'  },
        { when:'4 days ago',actor:'Morgan Reyes',  event:'Role changed: Ravi Bhatt → Customer Success',      severity:'info' },
    ];
    const sevColor = { info:T.info, low:T.ok, medium:T.warn, high:T.danger };

    return (
        <div style={{ fontFamily:T.sans }}>
            <PeopleCrumb onBack={onBack} onUsers={onUsers} leaf="Security health" />
            <PeoplePageHeader
                title="Security health"
                subtitle="Workspace security posture across MFA, sessions, and access."
                statusDetail={`Score: ${score} · ${score >= 80 ? 'Good' : score >= 60 ? 'Fair' : 'Needs attention'}`}
                rightActions={<>
                    <PeopleSecBtn>Run audit now</PeopleSecBtn>
                    <PeoplePriBtn onClick={() => {}}>Enforce MFA</PeoplePriBtn>
                </>}
            />

            <SectionCard title="Security score" description="Weighted across enrollment, session policy, and recent incidents.">
                <div style={{ display:'grid', gridTemplateColumns:'140px 1fr', gap:24, alignItems:'center' }}>
                    {/* Score ring */}
                    <div style={{ position:'relative', width:120, height:120, margin:'0 auto' }}>
                        <svg viewBox="0 0 100 100" style={{ width:'100%', height:'100%', transform:'rotate(-90deg)' }}>
                            <circle cx="50" cy="50" r="42" fill="none" stroke={T.border} strokeWidth="10"/>
                            <circle cx="50" cy="50" r="42" fill="none" stroke={scoreColor} strokeWidth="10"
                                strokeDasharray={`${(score/100)*264} 264`} strokeLinecap="round"/>
                        </svg>
                        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column' }}>
                            <span style={{ fontFamily:T.serif, fontStyle:'italic', fontWeight:700, fontSize:32, color:T.ink, lineHeight:1 }}>{score}</span>
                            <span style={{ fontSize:10, color:scoreColor, fontWeight:700, marginTop:2 }}>{score >= 80 ? 'GOOD' : score >= 60 ? 'FAIR' : 'POOR'}</span>
                        </div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                        {[
                            { label:'MFA Enrollment', value:`${mfaOn}/${active.length}`, sub:`${active.length - mfaOn} off`, color: noMfa.length > 0 ? T.warn : T.ok },
                            { label:'SSO',            value:'On',  sub:'Okta configured', color:T.ok },
                            { label:'Session policy', value:'12h', sub:'matches recommended', color:T.ok },
                            { label:'Stale sessions', value:`${stale.length}`, sub:'> 30d', color: stale.length > 0 ? T.warn : T.ok },
                        ].map((m,i) => (
                            <div key={i} style={{ padding:'10px 12px', background:T.bg, border:`1px solid ${T.border}`, borderLeft:`3px solid ${m.color}`, borderRadius:T.r }}>
                                <div style={{ fontSize:10, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.5, marginBottom:2 }}>{m.label}</div>
                                <div style={{ fontSize:18, fontWeight:700, color:m.color, fontFamily:'ui-monospace,Menlo,monospace', lineHeight:1 }}>{m.value}</div>
                                <div style={{ fontSize:10.5, color:T.inkMuted, marginTop:2 }}>{m.sub}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </SectionCard>

            {noMfa.length > 0 && (
                <SectionCard title={`MFA not enabled (${noMfa.length})`} description="These active users haven't enrolled in MFA."
                    headAction={<PeoplePriBtn onClick={() => {}}>Enforce on all</PeoplePriBtn>}>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 120px 120px 120px 80px', gap:8, padding:'0 0 8px', borderBottom:`1px solid ${T.border}`, marginBottom:4 }}>
                        {['USER','TEAM','LAST ACTIVE','',''].map((h,i) => (
                            <div key={i} style={{ ...eb(T.inkMuted), fontSize:9.5 }}>{h}</div>
                        ))}
                    </div>
                    {noMfa.map((u,i) => (
                        <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 120px 120px 120px 80px', gap:8, alignItems:'center', padding:'9px 0', borderBottom: i<noMfa.length-1 ? `1px solid ${T.border}` : 'none' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                <UserAvatar name={u.name} size={24}/>
                                <div>
                                    <div style={{ fontSize:12.5, fontWeight:600, color:T.ink }}>{u.name}</div>
                                    <div style={{ fontSize:10.5, color:T.inkMuted }}>{u.email}</div>
                                </div>
                            </div>
                            <span style={{ fontSize:12, color:T.inkMid }}>{u.team || '—'}</span>
                            <span style={{ fontSize:12, color:T.inkMid }}>—</span>
                            <span style={{ fontSize:11, color:T.warn }}>○ MFA off</span>
                            <PeopleSecBtn onClick={() => {}}>Nudge</PeopleSecBtn>
                        </div>
                    ))}
                    {noMfa.length === 0 && (
                        <div style={{ padding:'24px', textAlign:'center', color:T.inkMuted, fontSize:13 }}>All active users have MFA enabled. 🎉</div>
                    )}
                </SectionCard>
            )}

            <SectionCard title="Recent security events" description="Audit-logged events from the last 30 days.">
                <div style={{ display:'grid', gridTemplateColumns:'80px 120px 1fr 60px', gap:8, padding:'0 0 8px', borderBottom:`1px solid ${T.border}`, marginBottom:4 }}>
                    {['WHEN','ACTOR','EVENT','SEV'].map((h,i) => (
                        <div key={i} style={{ ...eb(T.inkMuted), fontSize:9.5 }}>{h}</div>
                    ))}
                </div>
                {recentEvents.map((e,i) => (
                    <div key={i} style={{ display:'grid', gridTemplateColumns:'80px 120px 1fr 60px', gap:8, alignItems:'center', padding:'9px 0', borderBottom: i<recentEvents.length-1 ? `1px solid ${T.border}` : 'none' }}>
                        <span style={{ fontSize:11.5, color:T.inkMuted }}>{e.when}</span>
                        <span style={{ fontSize:12, color:T.inkMid, fontWeight:600 }}>{e.actor}</span>
                        <span style={{ fontSize:12.5, color:T.ink }}>{e.event}</span>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 7px', borderRadius:T.r, fontSize:10.5, fontWeight:700, background:`${sevColor[e.severity]}18`, color:sevColor[e.severity] }}>● {e.severity}</span>
                    </div>
                ))}
            </SectionCard>
        </div>
    );
};

const UserProfilePage = ({ user, settings, onBack, onUsers }) => {
    const { setSettings, showConfirm } = useApp();
    const [form, setForm]     = useState({ ...user });
    const [saving, setSaving] = useState(false);
    const [saved,  setSaved]  = useState(false);
    const [error,  setError]  = useState('');
    const dirty = JSON.stringify(form) !== JSON.stringify(user);

    const allTeams = [...new Set((settings.teams || []).map(t => typeof t === 'string' ? t : t.name).filter(Boolean))].sort();
    const allMgrs  = (settings.users || []).filter(u => u.name && u.id !== user.id).map(u => u.name).sort();
    const allTerr  = [...new Set((settings.territories || []).map(t => typeof t === 'string' ? t : t.name).filter(Boolean))].sort();
    const roleOpts = ['Admin','Manager','User','ReadOnly'];

    const handleChange = (field, val) => setForm(prev => ({ ...prev, [field]: val }));

    const handleSave = async () => {
        setSaving(true); setError('');
        try {
            const resp = await dbFetch('/.netlify/functions/users', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(form) });
            if (!resp.ok) { const d = await resp.json(); throw new Error(d.error || 'Save failed'); }

            // Sync team assignment into settings.teams repIds
            let updatedTeams = settings.teams || [];
            const oldTeamName = user.team;
            const newTeamName = form.team;
            if (oldTeamName !== newTeamName) {
                updatedTeams = updatedTeams.map(t => {
                    if (t.name === oldTeamName) return { ...t, repIds: (t.repIds||[]).filter(id => id !== user.id) };
                    if (t.name === newTeamName) return { ...t, repIds: [...new Set([...(t.repIds||[]), user.id])] };
                    return t;
                });
            }

            // Sync manager into settings.teams managerId
            const newManagerName = form.manager;
            if (newManagerName && newTeamName) {
                const mgr = (settings.users||[]).find(u => u.name === newManagerName);
                if (mgr) {
                    updatedTeams = updatedTeams.map(t =>
                        t.name === newTeamName ? { ...t, managerId: mgr.id } : t
                    );
                }
            }

            // Persist updated teams if changed
            if (JSON.stringify(updatedTeams) !== JSON.stringify(settings.teams || [])) {
                dbFetch('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({ teams: updatedTeams }) })
                    .catch(e => console.error('Failed to sync teams:', e));
            }

            // Update local settings state
            setSettings(prev => ({
                ...prev,
                users: (prev.users||[]).map(u => u.id === form.id ? { ...u, ...form } : u),
                teams: updatedTeams,
            }));
            setSaved(true); setTimeout(() => setSaved(false), 2500);
        } catch(err) {
            setError(err.message || 'Failed to save. Please try again.');
        } finally { setSaving(false); }
    };

    const handleDeactivate = () => {
        showConfirm(`Deactivate ${user.name}? They will immediately lose access to Accelerep.`, async () => {
            try {
                // users.mjs DELETE reads id from query string, not body
                await dbFetch(`/.netlify/functions/users?id=${encodeURIComponent(user.id)}`, { method:'DELETE' });
                setSettings(prev => ({ ...prev, users: (prev.users||[]).filter(u => u.id !== user.id) }));
                onUsers();
            } catch(err) { setError('Failed to deactivate user.'); }
        });
    };

    const inp = { width:'100%', padding:'7px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, fontFamily:T.sans, background:'#f5efe3', color:T.ink, outline:'none', boxSizing:'border-box' };
    const sel = { ...inp, cursor:'pointer' };
    const lbl = { display:'block', fontSize:11, fontWeight:700, color:T.inkMuted, letterSpacing:0.5, textTransform:'uppercase', marginBottom:5, fontFamily:T.sans };

    // Derive effective permissions from role
    const permMap = {
        'Admin':    { Leads:'All',      Accounts:'All',      Opportunities:'All',      Quotes:'All + approve', Reports:'All',  Settings:'Full access' },
        'Manager':  { Leads:'Team',     Accounts:'Team',     Opportunities:'Team',     Quotes:'Own + approve', Reports:'Team', Settings:'No access' },
        'User':     { Leads:'Own only', Accounts:'Own only', Opportunities:'Own only', Quotes:'Own + create',  Reports:'Own',  Settings:'No access' },
        'ReadOnly': { Leads:'View only',Accounts:'View only',Opportunities:'View only',Quotes:'View only',     Reports:'View', Settings:'No access' },
    };
    const perms = permMap[form.userType] || permMap['User'];

    const statusColor = (role) => {
        const ok = ['All','Team','Own only','Own + approve','Own + create'];
        if (ok.some(s => role?.startsWith(s.split(' ')[0]))) return T.ok;
        if (role === 'No access') return T.danger;
        return T.warn;
    };

    return (
        <div style={{ fontFamily:T.sans }}>
            <PeopleCrumb onBack={onBack} onUsers={onUsers} leaf={user.name} />

            {/* Title band */}
            <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', paddingBottom:16, borderBottom:`1px solid ${T.border}`, marginBottom:20 }}>
                <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                    <UserAvatar name={user.name} size={48}/>
                    <div>
                        <div style={{ fontSize:22, fontWeight:700, color:T.ink, letterSpacing:-0.3 }}>{user.name}</div>
                        <div style={{ fontSize:13, color:T.inkMid, marginTop:2 }}>
                            {user.userType || 'Sales Rep'} · {user.team || '—'} · reports to {user.manager || '—'}
                            <span style={{ marginLeft:10, display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px', background:'rgba(77,107,61,0.10)', color:T.ok, borderRadius:T.r, fontSize:11, fontWeight:700 }}>● Active</span>
                        </div>
                    </div>
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <PeopleSecBtn onClick={() => {}}>Reset password</PeopleSecBtn>
                    <button onClick={handleDeactivate} style={{ padding:'7px 14px', background:'transparent', color:T.danger, border:`1px solid rgba(156,58,46,0.3)`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}
                        onMouseEnter={e=>{e.currentTarget.style.background='rgba(156,58,46,0.06)'}} onMouseLeave={e=>{e.currentTarget.style.background='transparent'}}>
                        Deactivate
                    </button>
                    {dirty && <PeoplePriBtn onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : saved ? '✓ Saved' : 'Save changes'}</PeoplePriBtn>}
                </div>
            </div>

            {error && <div style={{ marginBottom:14, padding:'10px 14px', background:'rgba(156,58,46,0.10)', border:`1px solid rgba(156,58,46,0.25)`, borderRadius:T.r, fontSize:12.5, color:T.danger }}>{error}</div>}
            {saved && <div style={{ marginBottom:14, padding:'10px 14px', background:'rgba(77,107,61,0.10)', border:`1px solid rgba(77,107,61,0.25)`, borderRadius:T.r, fontSize:12.5, color:T.ok }}>✓ Changes saved successfully.</div>}

            <div style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:18, alignItems:'start' }}>
                <div>
                    {/* Identity */}
                    <SectionCard title="Identity" description="Name and contact information.">
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                            <div>
                                <label style={lbl}>Full name</label>
                                <input style={inp} value={form.name||''} onChange={e=>handleChange('name',e.target.value)}/>
                            </div>
                            <div>
                                <label style={lbl}>Email</label>
                                <input style={{ ...inp, color:T.inkMuted }} value={form.email||''} readOnly title="Email is managed via Clerk SSO"/>
                                <div style={{ fontSize:10.5, color:T.inkMuted, marginTop:3 }}>Managed via Clerk — contact admin to change.</div>
                            </div>
                            <div>
                                <label style={lbl}>Job title</label>
                                <input style={inp} value={form.title||''} onChange={e=>handleChange('title',e.target.value)} placeholder="e.g. Account Executive"/>
                            </div>
                            <div>
                                <label style={lbl}>Phone</label>
                                <input style={inp} value={form.phone||form.mobile||''} onChange={e=>handleChange('phone',e.target.value)} placeholder="+1 (415) 555-0100"/>
                            </div>
                        </div>
                    </SectionCard>

                    {/* Access & assignment */}
                    <SectionCard title="Access & assignment" description="Drives what this user can see and do across the app.">
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:16 }}>
                            <div>
                                <label style={lbl}>Role</label>
                                <select style={sel} value={form.userType||'User'} onChange={e=>handleChange('userType',e.target.value)}>
                                    {roleOpts.map(o=><option key={o}>{o}</option>)}
                                </select>
                                <div style={{ fontSize:10.5, color:T.inkMuted, marginTop:3 }}>Determines base permission set.</div>
                            </div>
                            <div>
                                <label style={lbl}>Team</label>
                                <select style={sel} value={form.team||''} onChange={e=>handleChange('team',e.target.value)}>
                                    <option value="">— unassigned —</option>
                                    {allTeams.map(t=><option key={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={lbl}>Manager</label>
                                <select style={sel} value={form.manager||''} onChange={e=>handleChange('manager',e.target.value)}>
                                    <option value="">— none —</option>
                                    {allMgrs.map(n=><option key={n}>{n}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={lbl}>Territory</label>
                                <select style={sel} value={form.territory||''} onChange={e=>handleChange('territory',e.target.value)}>
                                    <option value="">— unassigned —</option>
                                    {allTerr.map(t=><option key={t}>{t}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Effective permissions summary */}
                        <div style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:T.r, padding:'12px 14px' }}>
                            <div style={{ ...eb(T.inkMuted), marginBottom:10 }}>Effective permissions (read-only summary)</div>
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                                {Object.entries(perms).map(([obj, access]) => (
                                    <div key={obj} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
                                        <span style={{ fontSize:12, color:T.inkMid }}>{obj}</span>
                                        <span style={{ fontSize:11, fontWeight:700, color:statusColor(access), background:`${statusColor(access)}18`, padding:'1px 6px', borderRadius:T.r }}>{access}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </SectionCard>

                    {/* Security */}
                    <SectionCard title="Security" description="Auth methods and active sessions.">
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', background:T.bg, borderRadius:T.r, border:`1px solid ${T.border}` }}>
                                <div>
                                    <div style={{ fontSize:12.5, fontWeight:600, color:T.ink }}>MFA</div>
                                    <div style={{ fontSize:11, color:T.inkMuted }}>Authenticator app</div>
                                </div>
                                <span style={{ fontSize:11, fontWeight:700, color:T.ok }}>● On</span>
                            </div>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', background:T.bg, borderRadius:T.r, border:`1px solid ${T.border}` }}>
                                <div>
                                    <div style={{ fontSize:12.5, fontWeight:600, color:T.ink }}>SSO</div>
                                    <div style={{ fontSize:11, color:T.inkMuted }}>Okta Workforce</div>
                                </div>
                                <span style={{ fontSize:11, fontWeight:700, color:T.ok }}>● On</span>
                            </div>
                            <div style={{ padding:'10px 12px', background:T.bg, borderRadius:T.r, border:`1px solid ${T.border}` }}>
                                <div style={{ fontSize:11, color:T.inkMuted, marginBottom:2 }}>Last password change</div>
                                <div style={{ fontSize:12.5, fontWeight:600, color:T.ink }}>3 months ago</div>
                            </div>
                            <div style={{ padding:'10px 12px', background:T.bg, borderRadius:T.r, border:`1px solid ${T.border}` }}>
                                <div style={{ fontSize:11, color:T.inkMuted, marginBottom:2 }}>Active sessions</div>
                                <div style={{ fontSize:12.5, fontWeight:600, color:T.ink }}>2 — macOS, iPhone</div>
                            </div>
                        </div>
                    </SectionCard>
                </div>

                {/* Right rail */}
                <div style={{ position:'sticky', top:0 }}>
                    <SectionCard title="Activity" description="Workspace footprint.">
                        {[
                            { label:'Owned opportunities', value: '—' },
                            { label:'Pipeline',            value: '—' },
                            { label:'Quota attainment',    value: '—' },
                            { label:'Last login',          value: user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : '—' },
                        ].map((r,i) => (
                            <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderTop: i>0?`1px solid ${T.border}`:'none' }}>
                                <span style={{ fontSize:12.5, color:T.inkMid }}>{r.label}</span>
                                <span style={{ fontSize:13, fontWeight:700, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace' }}>{r.value}</span>
                            </div>
                        ))}
                    </SectionCard>

                    <SectionCard title="Audit log" description="Last 5 changes to this user.">
                        {(settings.auditLog || [])
                            .filter(e => e.entityId === user.id || e.label === user.name)
                            .slice(-5).reverse()
                            .map((e,i) => (
                                <div key={i} style={{ padding:'8px 0', borderBottom: `1px solid ${T.border}` }}>
                                    <div style={{ fontSize:11, color:T.inkMuted }}>{new Date(e.timestamp).toLocaleDateString()} · {e.author}</div>
                                    <div style={{ fontSize:12, color:T.ink, marginTop:1 }}>{e.action} {e.entity}</div>
                                </div>
                            ))
                        }
                        {(settings.auditLog || []).filter(e => e.entityId === user.id || e.label === user.name).length === 0 && (
                            <div style={{ color:T.inkMuted, fontSize:12, fontStyle:'italic' }}>No changes recorded yet.</div>
                        )}
                    </SectionCard>

                    {/* Dispatch technician — pointer only.
                        The previous card wrote skills, certs, licence, vehicle, hours cap and
                        the active-tech toggle via PUT /settings { users: [...] }. That was a
                        silent no-op twice over: settings.mjs has no `users` key in its whitelist
                        (users live in their own table), and the handler never called setSettings,
                        so nothing persisted and nothing re-rendered. dispatch_technicians is the
                        source of truth — manage technicians under Dispatch → Technicians. */}
                    {settings?.dispatchEnabled && (
                        <SectionCard title="Dispatch technician" desc="Field technicians are managed in the Dispatch tab.">
                            <div style={{ fontSize:12.5, color:T.inkMid, fontFamily:T.sans, lineHeight:1.6 }}>
                                Skills, certifications, employment type, rates and vehicle assignment live on
                                the technician record, not on the user account — subcontractors can be scheduled
                                without an app login at all.
                                <div style={{ marginTop:8, color:T.inkMuted }}>
                                    Go to <strong>Dispatch → Technicians</strong> to add this person as a technician
                                    and link them to this user account.
                                </div>
                            </div>
                        </SectionCard>
                    )}

                </div>
            </div>
        </div>
    );
};

export const UsersDetail = ({ settings, onBack }) => {
    const [filter, setFilter]   = useState('All'); // All|Active|Invited|Deactivated|MFA off
    const [search, setSearch]   = useState('');
    const [selected, setSelected] = useState(new Set());
    const [peopleView, setPeopleView] = useState(null); // null|'invite'|'import'|'export'|'pending'|'seats'|'security'|'profile'
    const [viewingUser, setViewingUser] = useState(null);
    const [openUserKebab, setOpenUserKebab] = useState(null); // user id
    const { showConfirm, setSettings: _setSettings } = useApp();

    // Close kebab on click-outside
    React.useEffect(() => {
        if (openUserKebab === null) return;
        const handler = () => setOpenUserKebab(null);
        document.addEventListener('click', handler);
        return () => document.removeEventListener('click', handler);
    }, [openUserKebab]);

    const onUsers = () => { setPeopleView(null); setViewingUser(null); };

    // Reconcile the roster against Clerk (Admin tool). Creates rows for members
    // missing from the DB, conservatively updates existing ones (see users-sync.mjs),
    // and reports rows not found in Clerk. Refreshes settings.users on success.
    const [syncing, setSyncing]   = useState(false);
    const [syncMsg, setSyncMsg]   = useState(null);
    const runClerkSync = async () => {
        if (syncing) return;
        setSyncing(true); setSyncMsg(null);
        try {
            const res = await dbFetch('/.netlify/functions/users-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Sync failed');
            const c = data.counts || {};
            let msg = `Synced: ${c.created} added, ${c.updated} updated, ${c.unchanged} unchanged`;
            if (c.dbOnly > 0) msg += ` · ${c.dbOnly} in Accelerep not in Clerk (review)`;
            setSyncMsg(msg);
            // Refresh the roster from the DB so new/updated rows appear immediately.
            const r = await dbFetch('/.netlify/functions/users');
            if (r.ok) { const ud = await r.json(); if (ud && ud.users) _setSettings(prev => ({ ...prev, users: ud.users })); }
        } catch (err) {
            setSyncMsg('Sync failed: ' + (err.message || 'unknown error'));
        } finally {
            setSyncing(false);
        }
    };

    // Sub-page router
    if (peopleView === 'invite')   return <UsersInvitePage   settings={settings} onBack={onBack} onUsers={onUsers}/>;
    if (peopleView === 'import')   return <UsersImportPage   settings={settings} onBack={onBack} onUsers={onUsers}/>;
    if (peopleView === 'export')   return <UsersExportPage   settings={settings} onBack={onBack} onUsers={onUsers}/>;
    if (peopleView === 'pending')  return <UsersPendingPage  settings={settings} onBack={onBack} onUsers={onUsers}/>;
    if (peopleView === 'seats')    return <UsersSeatPage     settings={settings} onBack={onBack} onUsers={onUsers}/>;
    if (peopleView === 'security') return <UsersSecurityPage settings={settings} onBack={onBack} onUsers={onUsers}/>;
    if (peopleView === 'profile' && viewingUser) return <UserProfilePage user={viewingUser} settings={settings} onBack={onBack} onUsers={onUsers}/>;

    // Map settings.users into the table display format
    const realUsers = (settings.users || []).filter(u => u.name && !u.id?.startsWith('pending_')).map(u => {
        // Derive display status from active flag and stored status field
        let status = 'Active';
        if (u.active === false) status = 'Deactivated';
        else if (u.status === 'Invited' || u.status === 'invited') status = 'Invited';
        return {
            id: u.id || u.name,
            name: u.name,
            email: u.email || '',
            role: u.userType || 'User',
            team: u.team || null,
            manager: u.manager || null,
            lastActive: u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : '—',
            mfa: !!(u.smsNotifications?.enabled),
            status,
            _raw: u,
        };
    });
    // Pending rows (pending_ id prefix) — shown separately in Invited filter
    const pendingRows = (settings.users || []).filter(u => u.id?.startsWith('pending_') && u.name).map(u => ({
        id: u.id,
        name: u.name,
        email: u.email || '',
        role: u.userType || 'User',
        team: u.team || null,
        manager: null,
        lastActive: '—',
        mfa: false,
        status: 'Invited',
        _raw: u,
    }));
    const displayUsers = [...realUsers, ...pendingRows];

    const filterTabs = [
        { key:'All',        label:`All · ${displayUsers.length}` },
        { key:'Active',     label:`Active · ${displayUsers.filter(u=>u.status==='Active').length}` },
        { key:'Invited',    label:`Pending · ${displayUsers.filter(u=>u.status==='Invited').length}` },
        { key:'Deactivated',label:`Deactivated · ${displayUsers.filter(u=>u.status==='Deactivated').length}` },
        { key:'MFA off',    label:`MFA off · ${displayUsers.filter(u=>!u.mfa && u.status==='Active').length}` },
    ];

    const visible = displayUsers.filter(u => {
        if (filter === 'Active'     && u.status !== 'Active')  return false;
        if (filter === 'Invited'    && u.status !== 'Invited') return false;
        if (filter === 'MFA off'    && u.mfa)                  return false;
        if (filter === 'Deactivated'&& u.status !== 'Deactivated') return false;
        const q = search.toLowerCase();
        return !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.team||'').toLowerCase().includes(q);
    });

    const isStale = (s) => s && (s.includes('days ago') || s.includes('week'));

    const activeCount       = displayUsers.filter(u=>u.status==='Active').length;
    const deactivatedCount  = displayUsers.filter(u=>u.status==='Deactivated').length;
    const invitedCount = displayUsers.filter(u=>u.status==='Invited');

    return (
        <div style={{ fontFamily:T.sans }}>
            {/* Breadcrumb */}
            <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:T.inkMuted, marginBottom:10 }}>
                <button onClick={onBack} style={{ background:'none', border:'none', color:T.info, fontWeight:600, cursor:'pointer', fontFamily:T.sans, padding:0, fontSize:12 }}>Settings</button>
                <span>/</span>
                <button onClick={onBack} style={{ background:'none', border:'none', color:T.info, fontWeight:600, cursor:'pointer', fontFamily:T.sans, padding:0, fontSize:12 }}>People & Teams</button>
                <span>/</span>
                <span style={{ color:T.ink, fontWeight:600 }}>Users</span>
            </div>

            {/* Title band */}
            <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', paddingBottom:16, borderBottom:`1px solid ${T.border}`, marginBottom:18 }}>
                <div style={{ borderLeft:`3px solid ${T.goldInk}`, paddingLeft:10 }}>
                    <div style={{ fontSize:22, fontWeight:700, color:T.ink, letterSpacing:-0.3 }}>Users</div>
                    <div style={{ fontSize:13, color:T.inkMid, marginTop:3, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                        <span>Invite, deactivate, and assign roles & permissions</span>
                        <span style={{ color:T.inkMuted }}>•</span>
                        <span style={{ color:T.ok, fontWeight:600 }}>✓</span>
                        <span>{activeCount} active · {invitedCount.length} pending invite · {deactivatedCount} deactivated</span>
                    </div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => setPeopleView('import')} style={{ padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}
                        onMouseEnter={e=>e.currentTarget.style.background=T.surface2} onMouseLeave={e=>e.currentTarget.style.background=T.surface}>Import CSV</button>
                    <button onClick={() => setPeopleView('export')} style={{ padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}
                        onMouseEnter={e=>e.currentTarget.style.background=T.surface2} onMouseLeave={e=>e.currentTarget.style.background=T.surface}>Export</button>
                    <button onClick={runClerkSync} disabled={syncing} title="Rebuild the roster from Clerk org membership"
                        style={{ padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:syncing?'default':'pointer', fontFamily:T.sans, opacity:syncing?0.6:1 }}
                        onMouseEnter={e=>{ if(!syncing) e.currentTarget.style.background=T.surface2; }} onMouseLeave={e=>e.currentTarget.style.background=T.surface}>
                        {syncing ? 'Syncing…' : '⟳ Sync from Clerk'}
                    </button>
                    <button onClick={() => setPeopleView('invite')} style={{ padding:'7px 16px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:T.sans }}>Invite users</button>
                </div>
            </div>
            {syncMsg && (
                <div style={{ margin:'0 0 12px', padding:'8px 12px', background:T.surface2, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12, color:T.inkMid, fontFamily:T.sans }}>
                    {syncMsg}
                </div>
            )}

            {/* Body: 1fr + 320px right rail */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:18, alignItems:'start' }}>

                {/* Left: filter tabs + table */}
                <div>
                    {/* Filter strip */}
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                        <div style={{ display:'flex', gap:0, background:T.bg, border:`1px solid ${T.border}`, borderRadius:T.r+2, padding:3, overflow:'hidden' }}>
                            {filterTabs.map(ft => (
                                <button key={ft.key} onClick={() => setFilter(ft.key)}
                                    style={{ padding:'5px 12px', fontSize:12, fontWeight:600, border:'none', borderRadius:T.r, cursor:'pointer', fontFamily:T.sans,
                                        background: filter===ft.key ? T.ink : 'transparent',
                                        color: filter===ft.key ? '#fbf8f3' : T.inkMid,
                                        whiteSpace:'nowrap',
                                    }}>{ft.label}</button>
                            ))}
                        </div>
                        <input value={search} onChange={e=>setSearch(e.target.value)}
                            placeholder="Search by name, email, team…"
                            style={{ padding:'6px 12px', fontSize:12.5, border:`1px solid ${T.border}`, borderRadius:16, outline:'none', width:220, fontFamily:T.sans, background:T.surface, color:T.ink }}/>
                    </div>

                    {/* User table */}
                    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8 }}>
                        <div style={{ padding:'12px 16px 8px', borderBottom:`1px solid ${T.border}` }}>
                            <div style={{ fontSize:13.5, fontWeight:700, color:T.ink }}>All users</div>
                            <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:2 }}>Click any row to open the user profile. Use bulk select for role changes, deactivation, or MFA enforcement.</div>
                        </div>
                        {/* Table header */}
                        <div style={{ display:'grid', gridTemplateColumns:'32px 1fr 120px 110px 110px 100px 40px 80px 32px', gap:8, padding:'8px 16px', background:T.surface2, borderBottom:`1px solid ${T.border}` }}>
                            {['','NAME','ROLE','TEAM','MANAGER','LAST ACTIVE','MFA','STATUS',''].map((h,i) => (
                                <div key={i} style={{ fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', fontFamily:T.sans }}>{h}</div>
                            ))}
                        </div>
                        {visible.length === 0 && (
                            <div style={{ padding:'36px 16px', textAlign:'center', fontSize:13, color:T.inkMuted, fontFamily:T.sans }}>
                                No users yet — use "Invite users" to add your team.
                            </div>
                        )}
                        {visible.map((u, i) => (
                            <div key={u.id}
                                style={{ display:'grid', gridTemplateColumns:'32px 1fr 120px 110px 110px 100px 40px 80px 32px', gap:8, padding:'10px 16px', borderBottom: i<visible.length-1 ? `1px solid ${T.border}` : 'none', alignItems:'center', cursor:'pointer', transition:'background 80ms' }}
                                onClick={() => { setViewingUser(u._raw || u); setPeopleView('profile'); }}
                                onMouseEnter={e=>e.currentTarget.style.background=T.surface2}
                                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                                {/* Checkbox */}
                                <div onClick={e=>{ e.stopPropagation(); setSelected(prev => { const n=new Set(prev); n.has(u.id)?n.delete(u.id):n.add(u.id); return n; }); }}
                                    style={{ width:14, height:14, border:`1.5px solid ${selected.has(u.id)?T.ink:T.border}`, borderRadius:2, background:selected.has(u.id)?T.ink:'transparent', cursor:'pointer', flexShrink:0 }}/>
                                {/* Name + email */}
                                <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0, overflow:'hidden' }}>
                                    <div style={{ flexShrink:0 }}><UserAvatar name={u.name} size={26}/></div>
                                    <div style={{ minWidth:0, flex:1 }}>
                                        <div style={{ fontSize:13, fontWeight:600, color:T.ink, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{u.name}</div>
                                        <div style={{ fontSize:11, color:T.inkMuted, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{u.email}</div>
                                    </div>
                                </div>
                                {/* Role */}
                                <div><RolePill role={u.role}/></div>
                                {/* Team */}
                                <div style={{ fontSize:12.5, color:T.inkMid }}>{u.team || '—'}</div>
                                {/* Manager */}
                                <div style={{ fontSize:12.5, color:T.inkMid }}>{u.manager || '—'}</div>
                                {/* Last active */}
                                <div style={{ fontSize:12, color: isStale(u.lastActive) ? T.warn : T.inkMid }}>{u.lastActive || '—'}</div>
                                {/* MFA */}
                                <div style={{ textAlign:'center' }}>
                                    {u.status === 'Active'
                                        ? u.mfa ? <span style={{ color:T.ok, fontSize:14 }}>●</span> : <span style={{ color:T.border, fontSize:14 }}>○</span>
                                        : <span style={{ color:T.border, fontSize:12 }}>—</span>}
                                </div>
                                {/* Status */}
                                <div>
                                    <span style={{ display:'inline-block', padding:'2px 7px', borderRadius:10, fontSize:11, fontWeight:700,
                                        background: u.status==='Active' ? 'rgba(77,107,61,0.12)' : u.status==='Invited' ? 'rgba(184,115,51,0.12)' : 'rgba(138,131,120,0.14)',
                                        color: u.status==='Active' ? T.ok : u.status==='Invited' ? T.warn : T.inkMuted }}>
                                        {u.status}
                                    </span>
                                </div>
                                {/* Kebab */}
                                <div style={{ position:'relative' }}>
                                    <button onClick={e => { e.stopPropagation(); setOpenUserKebab(openUserKebab === u.id ? null : u.id); }}
                                        style={{ background:'none', border:'none', color:T.inkMuted, fontSize:16, cursor:'pointer', padding:'2px 4px', lineHeight:1, borderRadius:T.r }}
                                        onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                        onMouseLeave={e => e.currentTarget.style.background = 'none'}>⋯</button>
                                    {openUserKebab === u.id && (
                                        <div onClick={e => e.stopPropagation()}
                                            style={{ position:'absolute', right:0, bottom:'100%', marginBottom:4, zIndex:400, background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+2, boxShadow:'0 4px 16px rgba(42,38,34,0.12)', minWidth:200 }}>
                                            {[
                                                { label:'View profile', action: () => { setViewingUser(u._raw || u); setPeopleView('profile'); setOpenUserKebab(null); } },
                                                { label:'Reset password', action: () => { setOpenUserKebab(null); /* Clerk handles via email */ } },
                                                u.status === 'Active' && { label:'Enforce MFA', action: () => { setOpenUserKebab(null); } },
                                                u.status === 'Invited' && { label:'Resend invite', action: () => { setOpenUserKebab(null); } },
                                                { label:'Deactivate', danger: true, action: () => {
                                                    setOpenUserKebab(null);
                                                    showConfirm(`Deactivate ${u.name}? They will immediately lose access to Accelerep.`, async () => {
                                                        try {
                                                            await dbFetch('/.netlify/functions/users', { method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id: u.id }) });
                                                            _setSettings(prev => ({ ...prev, users: (prev.users||[]).filter(su => su.id !== u.id) }));
                                                        } catch(err) { console.error('Deactivate failed:', err); }
                                                    });
                                                }},
                                            ].filter(Boolean).map((item, mi) => (
                                                <button key={mi} onClick={item.action}
                                                    style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none', borderTop: mi>0 ? `1px solid ${T.border}` : 'none', textAlign:'left', fontSize:13, color: item.danger ? T.danger : T.ink, cursor:'pointer', fontFamily:T.sans }}
                                                    onMouseEnter={e => e.currentTarget.style.background = item.danger ? 'rgba(156,58,46,0.06)' : T.surface2}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                                    {item.label}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right rail — all values derived from live displayUsers */}
                {(() => {
                    const cap          = 50; // seat cap — update when plan changes
                    const seatPct      = Math.round((activeCount / cap) * 100);
                    const seatColor    = seatPct >= 90 ? T.danger : seatPct >= 75 ? T.warn : T.ok;

                    // Role breakdown from real userType field
                    const repCount     = displayUsers.filter(u => u.status==='Active' && (u.role==='User'     || u.role==='Sales Rep')).length;
                    const mgrCount     = displayUsers.filter(u => u.status==='Active' && (u.role==='Manager'  || u.role==='Sales Manager')).length;
                    const adminCount   = displayUsers.filter(u => u.status==='Active' && (u.role==='Admin')).length;
                    const pendingCount = invitedCount.length;

                    // MFA — real users: derived from smsNotifications.enabled as proxy;
                    // for real Clerk MFA, this field would come from the /users endpoint
                    const mfaOn  = displayUsers.filter(u => u.status==='Active' && u.mfa).length;
                    const mfaOff = activeCount - mfaOn;

                    return (
                        <div style={{ display:'flex', flexDirection:'column', gap:14, position:'sticky', top:0 }}>
                            {/* Pending invites */}
                            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:16 }}>
                                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                                    <button onClick={() => setPeopleView('pending')} style={{ fontSize:13.5, fontWeight:700, color:T.ink, background:'none', border:'none', cursor:'pointer', fontFamily:T.sans, padding:0, textAlign:'left' }}>Pending invites →</button>
                                    {pendingCount > 0 && <button style={{ fontSize:12, fontWeight:600, color:T.info, background:'none', border:'none', cursor:'pointer', fontFamily:T.sans }}>Resend all</button>}
                                </div>
                                <div style={{ fontSize:11.5, color:T.inkMuted, marginBottom: pendingCount > 0 ? 10 : 0 }}>Sent but not yet accepted.</div>
                                {pendingCount === 0
                                    ? <div style={{ fontSize:12, color:T.inkMuted, fontStyle:'italic', marginTop:6 }}>No pending invites.</div>
                                    : invitedCount.map(u => (
                                        <div key={u.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderTop:`1px solid ${T.border}` }}>
                                            <UserAvatar name={u.name} size={28}/>
                                            <div style={{ flex:1, minWidth:0 }}>
                                                <div style={{ fontSize:12.5, fontWeight:600, color:T.ink }}>{u.name}</div>
                                                <div style={{ fontSize:11, color:T.inkMuted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.email}</div>
                                            </div>
                                            {u.invitedDaysAgo != null && (
                                                <span style={{ fontSize:11, color:T.warn, fontWeight:600, flexShrink:0 }}>
                                                    {u.invitedDaysAgo === 1 ? 'yesterday' : `${u.invitedDaysAgo}d ago`}
                                                </span>
                                            )}
                                        </div>
                                    ))
                                }
                            </div>

                            {/* Seat usage */}
                            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:16 }}>
                                <button onClick={() => setPeopleView('seats')} style={{ fontSize:13.5, fontWeight:700, color:T.ink, marginBottom:4, background:'none', border:'none', cursor:'pointer', fontFamily:T.sans, padding:0, display:'block', textAlign:'left' }}>Seat usage →</button>
                                <div style={{ fontSize:11.5, color:T.inkMuted, marginBottom:12 }}>Workspace limits.</div>
                                <div style={{ display:'flex', alignItems:'baseline', gap:4, marginBottom:6 }}>
                                    <span style={{ fontSize:18, fontWeight:700, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace' }}>{activeCount}</span>
                                    <span style={{ fontSize:13, color:T.inkMuted }}>/ {cap}</span>
                                    <div style={{ flex:1 }}/>
                                    <span style={{ fontSize:11.5, fontWeight:600, color:seatColor }}>{seatPct}%</span>
                                </div>
                                <div style={{ height:5, background:T.border, borderRadius:3, marginBottom:12, overflow:'hidden' }}>
                                    <div style={{ width:`${Math.min(seatPct,100)}%`, height:'100%', background:seatColor, borderRadius:3 }}/>
                                </div>
                                {[
                                    { label:'Reps',     value:repCount },
                                    { label:'Managers', value:mgrCount },
                                    { label:'Admins',   value:adminCount },
                                    ...(pendingCount > 0 ? [{ label:'Pending', value:pendingCount, sub:'expires in 7d', color:T.warn }] : []),
                                ].map((row,i) => (
                                    <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'5px 0', borderTop:`1px solid ${T.border}` }}>
                                        <span style={{ fontSize:12.5, color:T.inkMid }}>{row.label}</span>
                                        <div style={{ textAlign:'right' }}>
                                            <span style={{ fontSize:13, fontWeight:700, color:row.color||T.ink, fontFamily:'ui-monospace,Menlo,monospace' }}>{row.value}</span>
                                            {row.sub && <div style={{ fontSize:10.5, color:T.inkMuted }}>{row.sub}</div>}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Security health */}
                            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:16 }}>
                                <button onClick={() => setPeopleView('security')} style={{ fontSize:13.5, fontWeight:700, color:T.ink, marginBottom:3, background:'none', border:'none', cursor:'pointer', fontFamily:T.sans, padding:0, display:'block', textAlign:'left' }}>Security health →</button>
                                <div style={{ fontSize:11.5, color:T.inkMuted, marginBottom:12 }}>Last 30 days.</div>
                                {[
                                    {
                                        label: 'MFA on',
                                        value: `${mfaOn}/${activeCount}`,
                                        sub:   mfaOff > 0 ? `${mfaOff} off` : 'all enrolled',
                                        color: mfaOff > 0 ? T.warn : T.ok,
                                    },
                                    {
                                        label: 'SSO',
                                        value: (settings.extra?.ssoEnabled || settings.ssoEnabled) ? 'On' : '—',
                                        sub:   (settings.extra?.ssoEnabled || settings.ssoEnabled) ? 'configured' : 'not configured',
                                        color: (settings.extra?.ssoEnabled || settings.ssoEnabled) ? T.ok : T.inkMuted,
                                    },
                                    {
                                        label: 'Stale sessions',
                                        value: '—',
                                        sub:   'from Clerk dashboard',
                                        color: T.inkMuted,
                                    },
                                ].map((row,i) => (
                                    <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 0', borderTop: i>0 ? `1px solid ${T.border}` : 'none' }}>
                                        <span style={{ fontSize:12.5, color:T.inkMid }}>{row.label}</span>
                                        <div style={{ textAlign:'right' }}>
                                            <div style={{ fontSize:13.5, fontWeight:700, color:row.color, fontFamily:'ui-monospace,Menlo,monospace' }}>{row.value}</div>
                                            <div style={{ fontSize:10.5, color:T.inkMuted }}>{row.sub}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })()}
            </div>
        </div>
    );
};
