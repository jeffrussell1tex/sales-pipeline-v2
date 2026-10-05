// settings/people/UsersDetail.jsx
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../../AppContext';
import { dbFetch, dbWrite } from '../../../utils/storage';
import { T, eb, STATUS_STYLES } from '../shared/tokens.js';
import { RCheck, UserAvatar } from '../shared/ui.jsx';
import { memberStatus, invitationEntries } from './memberStatus.js';
import { INVITE_EXPIRY_DAYS } from '../../../utils/inviteExpiry.js';
import { teamIdNamed, teamsWithMembers, teamsWithout } from '../../../utils/teamMembership.js';
// THE ROLE VALUES come from the one list the server checks (src/utils/roles.js,
// re-exported by auth.mjs as APP_ROLES). This file carried its own copy of five,
// which is how a role added on the server went missing here; the server refuses
// anything else on every write path, so a value invented here fails loudly.
//
// 'User' is the STORED value for a sales rep and "Sales Rep" is only its label.
// Confusing the two is the recurring bug in this file: the invite rows below were
// seeded with the label, so an untouched row invited someone as 'Sales Rep' —
// which auth.mjs did not recognise, and used to wave through as a rep anyway.
import { ROLE_OPTIONS } from '../../../utils/roles.js';
const ROLE_LABEL = ROLE_OPTIONS.reduce((m, o) => { m[o.value] = o.label; return m; }, {});
// A role we do not know is rendered AS ITSELF, never translated and never hidden.
// Legacy rows still hold `member`, `admin` and `Sales Rep`; showing the raw string
// is what makes them findable.
const roleLabel = (role) => ROLE_LABEL[role] || role || '\u2014';
const isKnownRole = (role) => Object.prototype.hasOwnProperty.call(ROLE_LABEL, role);

// A <select> whose value matches none of its options does not render empty — the
// browser falls back to the FIRST option, so a user stored as `member` displayed
// as "Admin" with nothing on screen indicating otherwise. One click on the
// dropdown then submitted that as a deliberate choice.
//
// This renders an explicit, disabled option carrying the real value, so the
// control shows what is actually stored and selecting a real role is an act.
const RoleSelect = ({ value, onChange, style, disabled }) => (
    <select style={style} value={value || ''} onChange={onChange} disabled={disabled}>
        {!isKnownRole(value) && (
            <option value={value || ''} disabled>
                {value ? `${value} \u2014 not an Accelerep role` : '\u2014 select a role \u2014'}
            </option>
        )}
        {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
);

// Colours key on the STORED values. The previous map keyed on labels that this
// application never stores ('Sales Manager', 'CS', 'Finance'), so every role
// except Admin fell through to the grey default — which is why four different
// roles rendered as the same badge.
const RolePill = ({ role }) => {
    const map = {
        'Admin':      { bg:'rgba(42,38,34,0.85)',  fg:'#fbf8f3' },
        'Manager':    { bg:'rgba(58,90,122,0.14)', fg:'#3a5a7a' },
        'User':       { bg:'rgba(77,107,61,0.12)', fg:'#4d6b3d' },
        'Technician': { bg:'rgba(94,78,122,0.12)', fg:'#5e4e7a' },
        'Dispatcher': { bg:'rgba(122,106,72,0.14)',fg:'#7a6a48' },
        'ReadOnly':   { bg:'rgba(184,115,51,0.12)',fg:'#b87333' },
    };
    const known = map[role];
    const c = known || { bg:'rgba(156,58,46,0.10)', fg:'#9c3a2e' };
    return (
        <span
            title={known ? undefined : `"${role}" is not an Accelerep role. This user is treated as a Sales Rep until an Admin sets one.`}
            style={{ display:'inline-block', padding:'2px 8px', borderRadius:3, fontSize:11.5, fontWeight:700, background:c.bg, color:c.fg, fontFamily:T.sans, letterSpacing:0.1, whiteSpace:'nowrap' }}>
            {roleLabel(role)}
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
        { id:1, email:'', role:'User', team:'', manager:'', territory:'', valid:true, error:'' },
    ]);
    // 'User', not 'Sales Rep'. This held the display label, so every invite row the
    // admin did not touch was sent with a role the server does not recognise — and
    // because the label matched no <option>, the select displayed "Admin".
    const [defaultRole, setDefaultRole] = useState('User');
    // Days the link lasts, sent to Clerk (state §0.165). The note and the "Require
    // MFA" switch that sat here were never sent anywhere: Clerk's invitation email
    // is its own template, and MFA is Clerk's setting, not one invitation's.
    const [expiry, setExpiry] = useState(7);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');

    const allTeams  = [...new Set((settings.teams || []).map(t => typeof t === 'string' ? t : t.name).filter(Boolean))].sort();
    const allReps   = [...new Set((settings.users || []).map(u => u.name).filter(Boolean))].sort();
    const allTerr   = [...new Set((settings.territories || []).map(t => typeof t === 'string' ? t : t.name).filter(Boolean))].sort();

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
    // Real counts for the seat card (state §0.165) — "Pending today" was a literal 0.
    const activeToday  = (settings.users || []).filter(u => u.name && memberStatus(u) === 'Active').length;
    const pendingToday = (settings.users || []).filter(u => u.name && memberStatus(u) === 'Invited').length;

    const handleSend = async () => {
        const validated = validateRows();
        setRows(validated);
        const invalid = validated.filter(r => !r.valid);
        if (invalid.length > 0) { setError(`Fix ${invalid.length} error${invalid.length > 1 ? 's' : ''} before sending.`); return; }
        setSaving(true); setError('');
        try {
            const invites = validated.map(r => ({ email:r.email.trim(), role:r.role||defaultRole, team:r.team, teamId: teamIdNamed(settings.teams, r.team), manager:r.manager, territory:r.territory, expiresInDays: expiry }));
            const resp = await dbFetch('/.netlify/functions/users', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'invite', invites }) });
            const d = await resp.json().catch(() => ({}));
            // The new rows join the roster on screen — the list showed none of
            // them until a reload (state §0.165).
            const sent = Array.isArray(d.invited) ? d.invited : [];
            if (sent.length) setSettings(prev => {
                const byId = new Map((prev.users || []).map(u => [u.id, u]));
                sent.forEach(u => byId.set(u.id, { ...(byId.get(u.id) || {}), ...u }));
                return { ...prev, users: [...byId.values()] };
            });
            // Each new member joins the list of the team chosen for them (state
            // §0.168): the Teams page reads the team's list, and the invite
            // stored the name alone, so an invited member joined on no team.
            const { teams: joinedTeams, changed: teamsChanged } = teamsWithMembers(settings.teams, sent);
            let teamNote = '';
            if (teamsChanged) {
                const rt = await dbWrite('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({ teams: joinedTeams }) });
                if (rt.ok) setSettings(prev => ({ ...prev, teams: joinedTeams }));
                else teamNote = ` The team list was not updated — ${rt.error}`;
            }
            // Per-invite refusals come back in `errors` — with a 201 when some went
            // out. They were dropped, and the screen said "Sent!".
            const failed = Array.isArray(d.errors) ? d.errors : [];
            if (failed.length) throw new Error(`${sent.length} sent; not sent — ${failed.map(f => `${f.email || 'a row'}: ${f.error}`).join('; ')}.${teamNote}`);
            if (!resp.ok) throw new Error(d.error || 'Invite failed');
            if (teamNote) throw new Error(`${sent.length} sent.${teamNote}`);
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
                subtitle={`Send invitations to join the workspace. Clerk emails each invitee a link that lasts ${expiry} days.`}
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
                                    <RoleSelect style={sel} value={r.role} onChange={e=>updateRow(r.id,'role',e.target.value)} />
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
                                <RoleSelect style={sel} value={defaultRole} onChange={e=>setDefaultRole(e.target.value)} />
                                <div style={{ fontSize:10.5, color:T.inkMuted, marginTop:3 }}>Used for rows that don't specify one.</div>
                            </div>
                            <div>
                                <div style={{ ...eb(T.inkMuted), marginBottom:5 }}>Invite expiry</div>
                                <select style={sel} value={expiry} onChange={e=>setExpiry(Number(e.target.value))}>
                                    {INVITE_EXPIRY_DAYS.map(n=><option key={n} value={n}>{n} days</option>)}
                                </select>
                            </div>
                        </div>
                    </SectionCard>
                </div>

                {/* Right rail */}
                <div style={{ position:'sticky', top:0 }}>
                    <SectionCard title="Seat impact" description="If you send all valid invites.">
                        {[
                            { label:'Active today', value:activeToday },
                            { label:'Pending today', value:pendingToday },
                            { label:'After this batch', value:activeToday + pendingToday + readyCount, warn: readyCount > 0 },
                        ].map((r,i) => (
                            <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 0', borderTop: i>0 ? `1px solid ${T.border}` : 'none' }}>
                                <span style={{ fontSize:12.5, color:T.inkMid }}>{r.label}</span>
                                <span style={{ fontSize:13.5, fontWeight:700, color: r.warn ? T.warn : T.ink, fontFamily:'ui-monospace,Menlo,monospace' }}>{r.value}</span>
                            </div>
                        ))}
                    </SectionCard>

                    {/* The preview that sat here was invented — a sender, a subject, a note
                        that was never sent. Clerk writes the email (state §0.165). */}
                    <SectionCard title="The email" description="Sent by Clerk, not by Accelerep.">
                        <div style={{ fontSize:12, color:T.inkMid, lineHeight:1.55 }}>
                            Each invitee gets Clerk's invitation email for this workspace, with a link that lasts {expiry} days.
                            Accepting it signs them in with the role chosen here. Pending invites lists who has not joined
                            yet, and Resend there sends a fresh link.
                        </div>
                    </SectionCard>
                </div>
            </div>
        </div>
    );
};

// The Import CSV page that stood here was a mockup (state §0.167): it read no
// file, said "In production, detected columns will appear", and its "Import
// users" closed the page. Import CSV opens the shared CSV importer for team
// members now — CsvImportModal, with the rules in src/utils/userImport.js — and
// each row it imports is an invitation.

const UsersExportPage = ({ settings, onBack, onUsers, mfaByEmail }) => {
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

    const filteredUsers = users.filter(u => statusFilter === 'All' || u.role === statusFilter);
    const checkedFields = Object.entries(checked).filter(([,v])=>v).map(([k])=>k);

    const handleExport = () => {
        setExporting(true);
        setTimeout(() => {
            // Build CSV from real users data
            const header = checkedFields.join(',');
            const rows = filteredUsers.map(u => checkedFields.map(f => {
                if (f === 'Name') return `"${u.name||''}"`;
                if (f === 'Email') return `"${u.email||''}"`;
                if (f === 'Role') return `"${u.role||''}"`;
                if (f === 'Team') return `"${u.team||''}"`;
                if (f === 'Manager') return `"${u.manager||''}"`;
                if (f === 'Territory') return `"${u.territory||''}"`;
                if (f === 'Status') return `"${memberStatus(u)}"`;   // was "Active" for everyone (state §0.164)
                // Live from Clerk (§0.59) — was smsNotifications.enabled, a
                // notification preference exported as a security fact.
                if (f === 'MFA') { const v = mfaByEmail?.get((u.email || '').toLowerCase()); return `"${v === true ? 'On' : v === false ? 'Off' : 'Unknown'}"`; }
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
                                    <option value="All">All</option>
                                    {/* The one role list (src/utils/roles.js) — this filter carried its own four. */}
                                    {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
                                if (f==='Role') return `"${u.role||''}"`;
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

// Invitations not yet accepted (state §0.165): the roster's invited rows and
// this org's pending Clerk invitations, with Clerk's own dates. The page read
// rows with a lower-case 'invited' status — the invite path stores 'Invited', so
// it listed none — and printed made-up figures ("Opened email", "Sent Recently",
// "in 7d") beside buttons that did nothing: Revoke only hid the row on screen.
const UsersPendingPage = ({ settings, onBack, onUsers }) => {
    const { showConfirm, setSettings } = useApp();
    const [clerkInvites, setClerkInvites] = useState(null);   // null while reading
    const [loadError, setLoadError] = useState('');
    const [actionError, setActionError] = useState('');
    const [busyEmail, setBusyEmail] = useState(null);

    const loadInvites = React.useCallback(async () => {
        setLoadError('');
        try {
            const res = await dbFetch('/.netlify/functions/users?invitations=pending');
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || ('HTTP ' + res.status));
            setClerkInvites(Array.isArray(d.invitations) ? d.invitations : []);
        } catch (e) {
            setClerkInvites([]);
            setLoadError(`Clerk's invitations could not be read (${e.message}), so the dates are missing.`);
        }
    }, []);
    useEffect(() => { loadInvites(); }, [loadInvites]);

    const entries = invitationEntries(settings.users || [], clerkInvites || []);
    const now = Date.now();
    const isExpired = (inv) => !!(inv && inv.expiresAt && inv.expiresAt < now);
    const liveCount = entries.filter(e => e.invite && !isExpired(e.invite)).length;

    const doResend = async (e) => {
        if (busyEmail) return;
        setBusyEmail(e.email); setActionError('');
        try { await resendInvite(e.row); await loadInvites(); }
        catch (err) { setActionError(`Could not resend to ${e.email}: ${err.message}`); }
        finally { setBusyEmail(null); }
    };
    const doRevoke = (e) => {
        if (busyEmail) return;
        showConfirm(`Revoke the invitation to ${e.email}? Its link stops working${e.row ? ' and their row is removed' : ''}. You can invite them again later.`, async () => {
            setBusyEmail(e.email); setActionError('');
            try {
                const r = await revokeInvite(e.email);
                const note = await dropRevokedRow(r.removedRowId, settings.teams, setSettings);
                setClerkInvites(prev => (prev || []).filter(inv => inv.email !== e.email));
                if (note) setActionError(note);
            } catch (err) { setActionError(`Could not revoke the invitation to ${e.email}: ${err.message}`); }
            finally { setBusyEmail(null); }
        }, false);
    };

    return (
        <div style={{ fontFamily:T.sans }}>
            <PeopleCrumb onBack={onBack} onUsers={onUsers} leaf="Pending invites" />
            <PeoplePageHeader
                title="Pending invites"
                subtitle="Invited, not joined yet. Revoke withdraws the invitation in Clerk; Resend sends a fresh link."
                statusDetail={clerkInvites === null ? 'Reading invitations…' : `${entries.length} pending · ${liveCount} with a live link`}
                rightActions={<PeoplePriBtn onClick={onUsers}>← Back to users</PeoplePriBtn>}
            />
            {loadError && (
                <div style={{ marginBottom:12, padding:'9px 12px', background:`${T.warn}12`, border:`1px solid ${T.warn}55`, borderRadius:T.r, fontSize:12.5, color:T.warn }}>{loadError}</div>
            )}
            {actionError && (
                <div style={{ marginBottom:12, padding:'9px 12px', background:`${T.danger}12`, border:`1px solid ${T.danger}55`, borderRadius:T.r, fontSize:12.5, color:T.danger }}>{actionError}</div>
            )}
            <SectionCard title="Invitations" description="Sent and expiry dates are Clerk's.">
                {entries.length === 0 ? (
                    <div style={{ padding:'32px', textAlign:'center', color:T.inkMuted, fontSize:13 }}>
                        {clerkInvites === null ? 'Reading invitations…' : 'No invitations pending.'}
                    </div>
                ) : entries.map((e, i) => {
                    const expired = isExpired(e.invite);
                    return (
                        <div key={e.email} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 0', borderBottom: i < entries.length-1 ? `1px solid ${T.border}` : 'none' }}>
                            <UserAvatar name={e.row?.name || e.email} size={32}/>
                            <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:13, fontWeight:600, color:T.ink }}>{e.row?.name || e.email}</div>
                                <div style={{ fontSize:11, color:T.inkMuted }}>{e.email}</div>
                            </div>
                            {e.row ? <RolePill role={e.row.role || 'User'}/> : <span style={{ fontSize:11, color:T.inkMuted }}>Not in the roster</span>}
                            <div style={{ fontSize:11, color:T.inkMuted, minWidth:90 }}>Sent {fmtDate(e.invite?.createdAt)}</div>
                            <div style={{ fontSize:11, fontWeight:600, minWidth:110, color: !e.invite || expired ? T.warn : T.inkMid }}>
                                {!e.invite ? (clerkInvites === null ? '…' : 'No live link') : expired ? `Expired ${fmtDate(e.invite.expiresAt)}` : `Expires ${fmtDate(e.invite.expiresAt)}`}
                            </div>
                            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                                {e.row && <PeopleSecBtn onClick={() => doResend(e)}>{busyEmail === e.email ? 'Working…' : 'Resend'}</PeopleSecBtn>}
                                <PeopleSecBtn onClick={() => doRevoke(e)}>Revoke</PeopleSecBtn>
                            </div>
                        </div>
                    );
                })}
            </SectionCard>
        </div>
    );
};

// The Seat usage page (state §0.168). It printed a "Business plan · billed
// monthly", a $39 per-seat price, a "Soft cap" overage policy and a 50-seat
// cap, with a "Manage plan" and two "Add seats" wired to nothing — there is no
// plan and no billing. The one limit that is real is Clerk's membership limit
// for the organization (users?seats=true): the members Clerk counts against it,
// the invitations pending, and the roster's members by role and by team.
const UsersSeatPage = ({ settings, onBack, onUsers, seats, seatsFailed }) => {
    const users = settings.users || [];
    // The roster's members: everyone but an invitation not yet accepted. A
    // deactivated member is still one in Clerk — deactivating is the app's.
    const members = users.filter(u => u.name && memberStatus(u) !== 'Invited');
    const limit   = Number.isFinite(seats?.limit) ? seats.limit : null;        // 0 is no limit
    const inClerk = Number.isFinite(seats?.members) ? seats.members : null;
    const pending = Number.isFinite(seats?.pendingInvitations) ? seats.pendingInvitations : null;
    const capped  = limit > 0 && inClerk !== null;
    const pct     = capped ? inClerk / limit : null;
    const left    = capped ? Math.max(limit - inClerk, 0) : null;

    // Counted off `role` (the users.role column), not `userType` (a copy in the
    // profile blob that no role change ever updated). The counts were reading the
    // stale copy, which is why this panel could show Admins 0 with an Admin on the
    // screen above it. `Unrecognised` is deliberately visible rather than dropped:
    // those users are treated as reps by the server and someone has to know.
    const countRole = (v) => members.filter(u => u.role === v).length;
    const breakdown = [
        { role:'Admin',         count: countRole('Admin'),      color:'#6b2a22' },
        { role:'Manager',       count: countRole('Manager'),    color:'#b87333' },
        { role:'Sales Rep',     count: countRole('User'),       color:'#4d6b3d' },
        { role:'Dispatcher',    count: countRole('Dispatcher'), color:'#7a6a48' },
        { role:'Technician',    count: countRole('Technician'), color:'#5e4e7a' },
        { role:'ReadOnly',      count: countRole('ReadOnly'),   color:'#3a5a7a' },
        { role:'Unrecognised',  count: members.filter(u => !isKnownRole(u.role)).length, color:'#9c3a2e' },
    ].filter(b => b.count > 0);
    // The bar is out of the limit when there is one, else out of the members.
    const scale = Math.max(capped ? limit : 0, members.length, 1);

    const allTeams = [...new Set(members.map(u => u.team).filter(Boolean))].sort();
    const teamCounts = allTeams.map(t => ({ name:t, count:members.filter(u=>u.team===t).length }));
    const maxTeam = Math.max(...teamCounts.map(t=>t.count), 1);

    const status = !seats ? (seatsFailed ? 'Unknown — could not read Clerk' : 'Loading…')
        : inClerk === null ? 'Unknown — Clerk sent no count'
        : capped ? `${inClerk} of ${limit} members (${Math.round(pct * 100)}%)`
        : limit === 0 ? `${inClerk} members · no limit`
        : `${inClerk} members`;

    return (
        <div style={{ fontFamily:T.sans }}>
            <PeopleCrumb onBack={onBack} onUsers={onUsers} leaf="Seat usage" />
            <PeoplePageHeader
                title="Seat usage"
                subtitle="Members of this organization against Clerk's membership limit — the one limit there is."
                statusDetail={status}
                rightActions={
                    <PeopleSecBtn onClick={() => window.open('https://dashboard.clerk.com', '_blank', 'noopener')}>
                        Membership limit — set in Clerk ↗
                    </PeopleSecBtn>
                }
            />

            <SectionCard title="Members" description="Counted by Clerk, which holds the limit.">
                <div style={{ display:'flex', alignItems:'baseline', gap:12, marginBottom:14 }}>
                    <span style={{ fontFamily:T.serif, fontStyle:'italic', fontWeight:700, fontSize:52, color:T.ink, lineHeight:1 }}>{inClerk ?? '—'}</span>
                    <span style={{ fontSize:16, color:T.inkMid }}>{capped ? `of ${limit} allowed` : limit === 0 ? 'members · no limit set' : 'members'}</span>
                    <span style={{ flex:1 }}/>
                    {capped && <span style={{ fontSize:11.5, color:T.inkMuted }}>{left} remaining</span>}
                </div>
                {/* The roster's members by role */}
                <div style={{ display:'flex', height:20, borderRadius:T.r, overflow:'hidden', border:`1px solid ${T.border}`, marginBottom:10 }}>
                    {breakdown.map(b => (
                        <div key={b.role} title={`${b.role}: ${b.count}`} style={{ width:`${(b.count/scale)*100}%`, background:b.color }}/>
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
                    {capped && (
                        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11.5, color:T.inkMuted }}>
                            <span style={{ width:8, height:8, background:T.surface2, borderRadius:2, border:`1px solid ${T.borderStrong}` }}/>
                            <span>Available</span>
                            <span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontWeight:700 }}>{left}</span>
                        </div>
                    )}
                </div>
                <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:10, lineHeight:1.5 }}>
                    The bar is the roster's members by role.
                    {pending !== null && ` ${pending} invitation${pending === 1 ? '' : 's'} pending in Clerk.`}
                </div>
            </SectionCard>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:18, alignItems:'start' }}>
                <SectionCard title="By team" description="Members per team.">
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
                    <SectionCard title="Membership limit" description="Clerk's, for this organization.">
                        {[
                            ['Limit',               limit === null ? '—' : limit === 0 ? 'None' : String(limit)],
                            ['Members',             inClerk === null ? '—' : String(inClerk)],
                            ['Invitations pending', pending === null ? '—' : String(pending)],
                        ].map(([k,v],i) => (
                            <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderTop: i>0?`1px solid ${T.border}`:'none' }}>
                                <span style={{ fontSize:12.5, color:T.inkMid }}>{k}</span>
                                <span style={{ fontSize:12.5, fontWeight:600, color:T.ink }}>{v}</span>
                            </div>
                        ))}
                        <div style={{ fontSize:11.5, color:T.inkMuted, lineHeight:1.5, marginTop:8 }}>
                            Set per organization in the Clerk dashboard: Organizations → this organization → Membership limit.
                        </div>
                    </SectionCard>
                    {capped && pct >= 0.8 && (
                        <SectionCard title={pct >= 1 ? '⚠ At the limit' : '⚠ Approaching the limit'} description="">
                            <div style={{ fontSize:12.5, color: pct >= 1 ? T.danger : T.warn, lineHeight:1.55 }}>
                                <strong>{inClerk}</strong> of <strong>{limit}</strong> memberships are taken. At the limit Clerk refuses the next member — raise it in the Clerk dashboard.
                            </div>
                        </SectionCard>
                    )}
                </div>
            </div>
        </div>
    );
};

const UsersSecurityPage = ({ settings, onBack, onUsers, mfaData, mfaFailed }) => {
    // Everything on this page is REAL or says it is unknown (§0.59). The
    // first version derived "MFA" from smsNotifications.enabled — a
    // notification preference standing in for a security fact — hardcoded
    // SSO/session-policy/stale tiles, rendered four fabricated audit events
    // with demo names, and offered four buttons wired to nothing. A security
    // page whose signals are invented is worse than no page: it certifies.
    // Loading until the fetch answers; a fetch that failed is UNKNOWN, not
    // loading — this page said "Loading…" for good, and "nobody" not enrolled,
    // in green (state §0.167).
    const loading     = mfaData === null && !mfaFailed;
    const failed      = mfaData === null && !!mfaFailed;
    const enrolled    = mfaData?.enrolled ?? 0;
    const total       = mfaData?.total ?? 0;
    const notEnrolled = mfaData?.notEnrolled ?? [];
    const score       = total > 0 ? Math.round(enrolled / total * 100) : null;
    const scoreColor  = score === null ? T.border : score >= 80 ? T.ok : score >= 60 ? T.warn : T.danger;

    // Real security-relevant audit entries — the same trail AuditDetail
    // renders, narrowed to identity/config actions.
    const [events, setEvents] = React.useState(null);
    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await dbFetch('/.netlify/functions/audit-log');
                if (!res.ok) return;               // section shows its empty state
                const d = await res.json();
                if (cancelled) return;
                setEvents((d.entries || [])
                    .filter(e => /^user\.|^settings\.|apikey/.test(e.action || ''))
                    .slice(0, 8));
            } catch (e) { /* empty state */ }
        })();
        return () => { cancelled = true; };
    }, []);
    const relWhen = (ts) => {
        if (!ts) return '—';
        const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
        if (mins < 60)   return mins <= 1 ? 'just now' : `${mins}m ago`;
        if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
        return `${Math.floor(mins / 1440)}d ago`;
    };

    return (
        <div style={{ fontFamily:T.sans }}>
            <PeopleCrumb onBack={onBack} onUsers={onUsers} leaf="Security health" />
            <PeoplePageHeader
                title="Security health"
                subtitle="MFA enrollment live from Clerk · events from the audit log."
                statusDetail={loading ? 'Loading…' : failed ? 'MFA unknown — could not read Clerk' : `MFA ${enrolled}/${total} enrolled${score !== null ? ` · ${score}%` : ''}`}
                rightActions={
                    <PeopleSecBtn onClick={() => window.open('https://dashboard.clerk.com', '_blank', 'noopener')}>
                        MFA policy — managed in Clerk ↗
                    </PeopleSecBtn>
                }
            />

            <SectionCard title="MFA enrollment" description="Second-factor enrollment across the workspace, live from Clerk.">
                <div style={{ display:'grid', gridTemplateColumns:'140px 1fr', gap:24, alignItems:'center' }}>
                    {/* Enrollment ring */}
                    <div style={{ position:'relative', width:120, height:120, margin:'0 auto' }}>
                        <svg viewBox="0 0 100 100" style={{ width:'100%', height:'100%', transform:'rotate(-90deg)' }}>
                            <circle cx="50" cy="50" r="42" fill="none" stroke={T.border} strokeWidth="10"/>
                            <circle cx="50" cy="50" r="42" fill="none" stroke={scoreColor} strokeWidth="10"
                                strokeDasharray={`${((score ?? 0)/100)*264} 264`} strokeLinecap="round"/>
                        </svg>
                        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column' }}>
                            <span style={{ fontFamily:T.serif, fontStyle:'italic', fontWeight:700, fontSize:32, color:T.ink, lineHeight:1 }}>{score === null ? '—' : `${score}%`}</span>
                            <span style={{ fontSize:10, color:scoreColor, fontWeight:700, marginTop:2 }}>{score === null ? (loading ? 'LOADING' : 'UNKNOWN') : 'ENROLLED'}</span>
                        </div>
                    </div>
                    {/* Only what Clerk actually tells us. SSO state, session
                        policy and password ages live in the Clerk dashboard —
                        the old tiles hardcoded them ("Okta configured", "12h")
                        for every org. */}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                        {[
                            { label:'MFA enrolled',     value: loading ? '…' : failed ? '—' : `${enrolled}/${total}`, sub: failed ? 'could not read Clerk' : 'live from Clerk', color: failed ? T.inkMuted : notEnrolled.length > 0 ? T.warn : T.ok },
                            { label:'Not enrolled',     value: loading ? '…' : failed ? '—' : `${notEnrolled.length}`, sub: failed ? 'unknown' : notEnrolled.length > 0 ? 'listed below' : 'nobody', color: failed ? T.inkMuted : notEnrolled.length > 0 ? T.warn : T.ok },
                            { label:'SSO · sessions',   value:'Clerk', sub:'managed in the Clerk dashboard', color:T.inkMuted },
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

            {!loading && notEnrolled.length > 0 && (
                <SectionCard title={`MFA not enabled (${notEnrolled.length})`} description="Clerk members without a second factor. Enrollment and enforcement happen in Clerk.">
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 140px 110px', gap:8, padding:'0 0 8px', borderBottom:`1px solid ${T.border}`, marginBottom:4 }}>
                        {['USER','ROLE',''].map((h,i) => (
                            <div key={i} style={{ ...eb(T.inkMuted), fontSize:9.5 }}>{h}</div>
                        ))}
                    </div>
                    {notEnrolled.map((u,i) => (
                        <div key={u.userId || i} style={{ display:'grid', gridTemplateColumns:'1fr 140px 110px', gap:8, alignItems:'center', padding:'9px 0', borderBottom: i<notEnrolled.length-1 ? `1px solid ${T.border}` : 'none' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                <UserAvatar name={u.name} size={24}/>
                                <div>
                                    <div style={{ fontSize:12.5, fontWeight:600, color:T.ink }}>{u.name}</div>
                                    <div style={{ fontSize:10.5, color:T.inkMuted }}>{u.email}</div>
                                </div>
                            </div>
                            <span style={{ fontSize:12, color:T.inkMid }}>{u.role || '—'}</span>
                            <span style={{ fontSize:11, color:T.warn }}>○ MFA off</span>
                        </div>
                    ))}
                </SectionCard>
            )}
            {!loading && notEnrolled.length === 0 && total > 0 && (
                <SectionCard title="MFA not enabled (0)" description="Clerk members without a second factor.">
                    <div style={{ padding:'24px', textAlign:'center', color:T.inkMuted, fontSize:13 }}>Every Clerk member has MFA enabled.</div>
                </SectionCard>
            )}

            <SectionCard title="Recent security events" description="Identity and configuration actions from the org's audit log.">
                <div style={{ display:'grid', gridTemplateColumns:'80px 140px 1fr', gap:8, padding:'0 0 8px', borderBottom:`1px solid ${T.border}`, marginBottom:4 }}>
                    {['WHEN','ACTOR','EVENT'].map((h,i) => (
                        <div key={i} style={{ ...eb(T.inkMuted), fontSize:9.5 }}>{h}</div>
                    ))}
                </div>
                {(events || []).map((e,i) => (
                    <div key={e.id || i} style={{ display:'grid', gridTemplateColumns:'80px 140px 1fr', gap:8, alignItems:'center', padding:'9px 0', borderBottom: i<events.length-1 ? `1px solid ${T.border}` : 'none' }}>
                        <span style={{ fontSize:11.5, color:T.inkMuted }}>{relWhen(e.timestamp)}</span>
                        <span style={{ fontSize:12, color:T.inkMid, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.userName || e.userId || 'System'}</span>
                        <span style={{ fontSize:12.5, color:T.ink, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.action}{e.entityName ? ` — ${e.entityName}` : ''}</span>
                    </div>
                ))}
                {(!events || events.length === 0) && (
                    <div style={{ padding:'18px', textAlign:'center', color:T.inkMuted, fontSize:12.5, fontStyle:'italic' }}>
                        {events === null ? 'Loading…' : 'No identity or configuration events in the last 500 audit entries.'}
                    </div>
                )}
            </SectionCard>
        </div>
    );
};

// Deactivating takes away every right the member has in this org; reactivating
// gives it back — the row keeps its role (state §0.164). Both are an Admin's:
// the server refuses anyone else, and anyone deactivating themselves. Only
// `active` is sent; the server merges it into the stored row and sets the
// status, and its answer is the row as it now stands.
const setMemberActive = async (id, active) => {
    const res = await dbFetch('/.netlify/functions/users', {
        method:'PUT', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ id, active }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || ('HTTP ' + res.status));
    return d.user || { id, active };
};

// Invitations (state §0.165). Revoke withdraws THIS org's Clerk invitation for
// the email and removes its row — the old Revoke only hid the row on screen, and
// Delete user left the invitation live. Resend is the invite again: the server
// revokes the old invitation and Clerk sends a fresh link.
const revokeInvite = async (email) => {
    const res = await dbFetch('/.netlify/functions/users', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ action:'revoke-invite', email }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || ('HTTP ' + res.status));
    return d;
};
// A revoked invitation's row is gone (state §0.165): it leaves the roster on
// screen and — the invite put it there (§0.168) — its team's list. Returns a
// sentence when the team list could not be saved, null otherwise.
const dropRevokedRow = async (removedRowId, teams, setSettings) => {
    if (!removedRowId) return null;
    setSettings(prev => ({ ...prev, users: (prev.users || []).filter(u => u.id !== removedRowId) }));
    const { teams: remaining, changed } = teamsWithout(teams, removedRowId);
    if (!changed) return null;
    const rt = await dbWrite('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({ teams: remaining }) });
    if (!rt.ok) return `The invitation was revoked, but the team list was not updated — ${rt.error}`;
    setSettings(prev => ({ ...prev, teams: remaining }));
    return null;
};
const resendInvite = async (row) => {
    const res = await dbFetch('/.netlify/functions/users', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ action:'invite', invites:[{ email: row.email, role: row.role || 'User', team: row.team || null, territory: row.territory || null }] }),
    });
    const d = await res.json().catch(() => ({}));
    const refused = Array.isArray(d.errors) && d.errors[0];
    if (refused) throw new Error(refused.error || 'Clerk refused the invitation');
    if (!res.ok) throw new Error(d.error || ('HTTP ' + res.status));
    return d;
};
const fmtDate = (ms) => (ms ? new Date(ms).toLocaleDateString() : '—');

// The profile header's status. It read "● Active" for every member, deactivated
// and invited included (state §0.164). Red is for Delete (the style guide), so a
// deactivated member reads muted.
const STATUS_PILL = { Active: STATUS_STYLES.ok, Invited: STATUS_STYLES.partial, Deactivated: STATUS_STYLES.none };
// The Users row menu's place (guide §16, the menu rule — state §0.167): fixed,
// from the ⋯ button's rect, right-aligned to it, below it unless the room under
// it is short and there is more above, and kept 8px inside the viewport.
const KEBAB_W = 200;
const kebabPlacement = (r) => {
    const below = window.innerHeight - r.bottom, above = r.top;
    const openUp = below < 240 && above > below;
    const left = Math.max(8, Math.min(r.right - KEBAB_W, window.innerWidth - KEBAB_W - 8));
    return openUp
        ? { left, bottom: window.innerHeight - r.top + 4, maxHeight: above - 16 }
        : { left, top: r.bottom + 4, maxHeight: below - 16 };
};

const StatusPill = ({ status }) => {
    const s = STATUS_PILL[status] || STATUS_STYLES.none;
    return (
        <span style={{ marginLeft:10, display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px', background:s.bg, color:s.fg, borderRadius:T.r, fontSize:11, fontWeight:700 }}>● {status}</span>
    );
};

const UserProfilePage = ({ user, settings, onBack, onUsers, mfaByEmail }) => {
    const { setSettings, showConfirm } = useApp();
    const status = memberStatus(user);
    const [form, setForm]     = useState({ ...user });
    const [saving, setSaving] = useState(false);
    const [saved,  setSaved]  = useState(false);
    const [error,  setError]  = useState('');
    const dirty = JSON.stringify(form) !== JSON.stringify(user);

    const allTeams = [...new Set((settings.teams || []).map(t => typeof t === 'string' ? t : t.name).filter(Boolean))].sort();
    const allMgrs  = (settings.users || []).filter(u => u.name && u.id !== user.id).map(u => u.name).sort();
    const allTerr  = [...new Set((settings.territories || []).map(t => typeof t === 'string' ? t : t.name).filter(Boolean))].sort();

    const [roleNote, setRoleNote] = useState('');
    const handleChange = (field, val) => setForm(prev => ({ ...prev, [field]: val }));

    const handleSave = async () => {
        setSaving(true); setError('');
        try {
            // The member's teamId is the id of the team the form names, on every
            // save (state §0.168): the form carried the row's teamId as it was
            // loaded, so a new team kept the old id — the one coaching notes and
            // the digest read — and comparing with the page's first copy of the
            // member would keep an id that was already wrong.
            const toSave = { ...form, teamId: teamIdNamed(settings.teams, form.team) };
            const resp = await dbFetch('/.netlify/functions/users', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(toSave) });
            if (!resp.ok) { const d = await resp.json(); throw new Error(d.error || 'Save failed'); }

            // A role change goes to user-role.mjs, the one path that changes a
            // role: the PUT above keeps the stored one. The role is this org's
            // roster row, which auth.mjs reads per request, cached up to 30
            // seconds — the note below (state §0.163).
            // `role`, not `userType`: the latter is a stale copy in the profile blob.
            // Comparing against it meant the "did the role change?" test was asking
            // about a field nothing maintained.
            //
            // `targetUserId` is the APP id (usr_...). user-role.mjs resolves the Clerk
            // identity from the roster row itself — it used to take this value and
            // hand it straight to the Clerk API, which stopped working the moment
            // users.id stopped being the Clerk id.
            const priorRole = user.role || 'User';
            if (form.role && form.role !== priorRole) {
                const rr = await dbFetch('/.netlify/functions/user-role', {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ targetUserId: user.id, role: form.role }),
                });
                const rd = await rr.json().catch(() => ({}));
                if (!rr.ok) throw new Error(rd.error || 'Could not change the role.');
                setRoleNote('Role updated \u2014 it can take up to 30 seconds to take effect.');
            }

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
                // Was fire-and-forget. A failed team sync leaves the user assigned
                // to a team the roster does not have, which reads as a data bug
                // rather than a permissions one.
                const rt = await dbWrite('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({ teams: updatedTeams }) });
                if (!rt.ok) { setError(`User saved, but the team list was not updated — ${rt.error}`); return; }
            }

            // Update local settings state
            setSettings(prev => ({
                ...prev,
                users: (prev.users||[]).map(u => u.id === toSave.id ? { ...u, ...toSave } : u),
                teams: updatedTeams,
            }));
            setSaved(true); setTimeout(() => setSaved(false), 2500);
        } catch(err) {
            setError(err.message || 'Failed to save. Please try again.');
        } finally { setSaving(false); }
    };

    // This was labelled "Deactivate" but permanently deleted the row, and it never
    // checked res.ok — a failed request still removed the user from the screen,
    // so they reappeared on refresh. Deactivate is now reversible; Delete is
    // separate and says what it does.
    //
    // Both confirms are the plain kind, not the red "Delete" one: nothing is
    // deleted, and each undoes the other (state §0.164). Deactivate sent the
    // whole profile form, so it also saved any unsaved edit; it sends `active`.
    const handleDeactivate = () => {
        showConfirm(`Deactivate ${user.name}? They keep their record and role but lose access to this organization until an Admin reactivates them.`, async () => {
            try {
                const row = await setMemberActive(user.id, false);
                setSettings(prev => ({ ...prev, users: (prev.users||[]).map(u => u.id === user.id ? { ...u, ...row } : u) }));
                onUsers();
            } catch(err) { setError('Could not deactivate: ' + err.message); }
        }, false);
    };

    const handleReactivate = () => {
        showConfirm(`Reactivate ${user.name}? They get their access to this organization back, with the role they had.`, async () => {
            try {
                const row = await setMemberActive(user.id, true);
                setSettings(prev => ({ ...prev, users: (prev.users||[]).map(u => u.id === user.id ? { ...u, ...row } : u) }));
                onUsers();
            } catch(err) { setError('Could not reactivate: ' + err.message); }
        }, false);
    };

    const handleDeleteUser = () => {
        showConfirm(`Permanently delete ${user.name}? This cannot be undone. Their record is removed from Accelerep; the Clerk account is unaffected.`, async () => {
            try {
                // users.mjs DELETE reads id from the query string, not the body.
                const res = await dbFetch(`/.netlify/functions/users?id=${encodeURIComponent(user.id)}`, { method:'DELETE' });
                if (!res.ok) { const d = await res.json().catch(()=>({})); throw new Error(d.error || ('HTTP ' + res.status)); }
                setSettings(prev => ({ ...prev, users: (prev.users||[]).filter(u => u.id !== user.id) }));
                onUsers();
            } catch(err) { setError('Could not delete: ' + err.message); }
        });
    };

    // An invitation not yet accepted is revoked, not deleted (state §0.165):
    // deleting the row left the Clerk invitation live.
    const handleRevokeInvite = () => {
        showConfirm(`Revoke the invitation to ${user.email || user.name}? Its link stops working and their row is removed. You can invite them again later.`, async () => {
            try {
                const r = await revokeInvite(user.email);
                const note = await dropRevokedRow(r.removedRowId, settings.teams, setSettings);
                if (note) { setError(note); return; }
                onUsers();
            } catch(err) { setError('Could not revoke the invitation: ' + err.message); }
        }, false);
    };

    const inp = { width:'100%', padding:'7px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, fontFamily:T.sans, background:'#f5efe3', color:T.ink, outline:'none', boxSizing:'border-box' };
    const sel = { ...inp, cursor:'pointer' };
    const lbl = { display:'block', fontSize:11, fontWeight:700, color:T.inkMuted, letterSpacing:0.5, textTransform:'uppercase', marginBottom:5, fontFamily:T.sans };

    // Derive effective permissions from role
    // A rep's Dispatch cell is the org's switch (§0.152), not a fixed word.
    const repDispatch = !settings?.dispatchEnabled ? 'No access' : settings?.repsCanUseDispatch ? 'Full' : 'No access';
    const permMap = {
        'Admin':    { Leads:'All',      Accounts:'All',      Opportunities:'All',      Quotes:'All + approve', Reports:'All',  Settings:'Full access', Dispatch:'Full' },
        'Manager':  { Leads:'Team',     Accounts:'Team',     Opportunities:'Team',     Quotes:'Own + approve', Reports:'Team', Settings:'No access', Dispatch:'Full' },
        'User':     { Leads:'Own only', Accounts:'Own only', Opportunities:'Own only', Quotes:'Own + create',  Reports:'Own',  Settings:'No access', Dispatch: repDispatch },
        'ReadOnly': { Leads:'View only',Accounts:'View only',Opportunities:'View only',Quotes:'View only',     Reports:'View', Settings:'No access', Dispatch:'View' },
        // Technician was missing entirely, so a Technician's summary silently
        // rendered the Sales Rep row — describing CRM write access they do not have.
        'Technician':{Leads:'No access',Accounts:'No access',Opportunities:'No access',Quotes:'No access',    Reports:'No access', Settings:'No access', Dispatch:'Own jobs' },
        // A Dispatcher reads the whole CRM and changes none of it (§0.151): the
        // server's crmReadScope is 'all' for them and requireWrite refuses every write.
        'Dispatcher':{Leads:'View all', Accounts:'View all', Opportunities:'View all', Quotes:'View all',     Reports:'View all', Settings:'No access', Dispatch:'Full' },
    };
    // An unknown role falls back to the rep row because that is what the SERVER
    // does with it (auth.mjs treats an absent role as 'User' and refuses an
    // unrecognised one outright). The summary must not describe permissions the
    // user does not have.
    const perms = permMap[form.role] || permMap['User'];

    const statusColor = (role) => {
        const ok = ['All','Team','Own only','Own + approve','Own + create','Full'];
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
                            {roleLabel(user.role)} · {user.team || '—'} · reports to {user.manager || '—'}
                            <StatusPill status={status}/>
                        </div>
                    </div>
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    {/* "Reset password" sat here and did nothing (onClick={() => {}}) — a
                        dead control §0.59's sweep missed (state §0.167). Passwords are
                        Clerk's; no Admin control here resets a member's. */}
                    {/* Reactivate a deactivated member, deactivate an active one. An
                        invitation not yet accepted is neither: its row stays off until
                        the first sign-in links it (state §0.164). */}
                    {status === 'Deactivated' ? (
                        <PeopleSecBtn onClick={handleReactivate}>Reactivate</PeopleSecBtn>
                    ) : user.active !== false && (
                        <button onClick={handleDeactivate} style={{ padding:'7px 14px', background:'transparent', color:T.danger, border:`1px solid rgba(156,58,46,0.3)`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}
                            onMouseEnter={e=>{e.currentTarget.style.background='rgba(156,58,46,0.06)'}} onMouseLeave={e=>{e.currentTarget.style.background='transparent'}}>
                            Deactivate
                        </button>
                    )}
                    {/* An invitation not yet accepted is revoked, not deleted (state §0.165). */}
                    {status === 'Invited' ? (
                        <PeopleSecBtn onClick={handleRevokeInvite}>Revoke invite</PeopleSecBtn>
                    ) : (
                        <button onClick={handleDeleteUser} style={{ padding:'7px 14px', background:T.danger, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>
                            Delete user
                        </button>
                    )}
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
                                <RoleSelect style={sel} value={form.role} onChange={e=>handleChange('role',e.target.value)} />
                                <div style={{ fontSize:10.5, color:T.inkMuted, marginTop:3 }}>
                                    Determines base permission set. Technicians see only their own assigned jobs.
                                </div>
                                {roleNote && (
                                    <div style={{ fontSize:10.5, color:T.ok, fontWeight:600, marginTop:3 }}>{roleNote}</div>
                                )}
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

                    {/* Security — real MFA from Clerk; everything the app
                        cannot see says so. The first version hardcoded
                        "MFA ● On", "SSO Okta Workforce", "Last password change
                        3 months ago" and "2 sessions — macOS, iPhone" for
                        EVERY user (§0.59). */}
                    <SectionCard title="Security" description="MFA live from Clerk. Sessions, SSO and passwords are managed there.">
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                            {(() => {
                                const v = mfaByEmail ? (mfaByEmail.get((user.email || '').toLowerCase()) ?? null) : null;
                                return (
                                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', background:T.bg, borderRadius:T.r, border:`1px solid ${T.border}` }}>
                                        <div>
                                            <div style={{ fontSize:12.5, fontWeight:600, color:T.ink }}>MFA</div>
                                            <div style={{ fontSize:11, color:T.inkMuted }}>{v === null ? 'Not linked in Clerk, or still loading' : 'Second factor'}</div>
                                        </div>
                                        {v === true  ? <span style={{ fontSize:11, fontWeight:700, color:T.ok }}>● On</span>
                                        : v === false ? <span style={{ fontSize:11, fontWeight:700, color:T.warn }}>○ Off</span>
                                        : <span style={{ fontSize:11, fontWeight:700, color:T.inkMuted }}>—</span>}
                                    </div>
                                );
                            })()}
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', background:T.bg, borderRadius:T.r, border:`1px solid ${T.border}` }}>
                                <div>
                                    <div style={{ fontSize:12.5, fontWeight:600, color:T.ink }}>Sessions · SSO · password</div>
                                    <div style={{ fontSize:11, color:T.inkMuted }}>Managed in the Clerk dashboard</div>
                                </div>
                                <a href="https://dashboard.clerk.com" target="_blank" rel="noopener noreferrer" style={{ fontSize:11, fontWeight:700, color:T.info, textDecoration:'none' }}>Open ↗</a>
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
    const [peopleView, setPeopleView] = useState(null); // null|'invite'|'export'|'pending'|'seats'|'security'|'profile'
    const [viewingUser, setViewingUser] = useState(null);
    const [openUserKebab, setOpenUserKebab] = useState(null); // user id
    const [kebabPos, setKebabPos] = useState(null);
    const kebabMenuRef = React.useRef(null);
    const { showConfirm, setSettings: _setSettings, setCsvImportType, setShowCsvImportModal } = useApp();

    // Close kebab on click-outside, scroll or resize (guide §16, the menu rule) —
    // but not on an event inside it: the menu is portaled to <body>, and its own
    // scrollbar would close it.
    React.useEffect(() => {
        if (openUserKebab === null) return;
        const handler = (e) => {
            if (kebabMenuRef.current && e && e.target && kebabMenuRef.current.contains(e.target)) return;
            setOpenUserKebab(null);
        };
        document.addEventListener('click', handler);
        window.addEventListener('scroll', handler, true);
        window.addEventListener('resize', handler);
        return () => {
            document.removeEventListener('click', handler);
            window.removeEventListener('scroll', handler, true);
            window.removeEventListener('resize', handler);
        };
    }, [openUserKebab]);

    const onUsers = () => { setPeopleView(null); setViewingUser(null); };
    // Import CSV opens the shared CSV importer for team members (state §0.167):
    // each row it imports is an invitation, sent once the Admin has reviewed them.
    const openCsvImport = () => { setCsvImportType('users'); setShowCsvImportModal(true); };

    // Reconcile the roster against Clerk (Admin tool). Creates rows for members
    // missing from the DB, conservatively updates existing ones (see users-sync.mjs),
    // and reports rows not found in Clerk. Refreshes settings.users on success.
    const [syncing, setSyncing]   = useState(false);
    const [syncMsg, setSyncMsg]   = useState(null);
    const [drift,   setDrift]     = useState(null);   // { created, updated, dbOnly }
    const [userActionError, setUserActionError] = useState('');

    // Real MFA enrollment from Clerk (§0.59). Every surface below used to
    // derive "MFA" from smsNotifications.enabled — a notification PREFERENCE
    // standing in for a security fact. One fetch here feeds the list dots,
    // the chips, the seats rail, the export column, the Security page and the
    // profile card. null = unknown (still loading, or the fetch failed) and
    // renders as unknown — never guessed in either direction. `mfaFailed` says
    // which: the Security health card read "Clerk not reachable" while the fetch
    // was still on its way, and the Security page "Loading…" after it had failed
    // (state §0.167).
    const [mfaData, setMfaData] = useState(null);
    const [mfaFailed, setMfaFailed] = useState(false);
    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await dbFetch('/.netlify/functions/clerk-mfa-status');
                if (!res.ok) { if (!cancelled) setMfaFailed(true); return; }   // stays unknown
                const d = await res.json();
                if (!cancelled) setMfaData(d);
            } catch (e) { if (!cancelled) setMfaFailed(true); }               // stays unknown
        })();
        return () => { cancelled = true; };
    }, []);
    // Clerk's membership limit for this org and its count of members (state
    // §0.168) — the rail and the Seat usage page printed a 50-seat cap that
    // exists nowhere. Read with the list and again as the page opens and
    // closes; null is loading, `seatsFailed` a read that did not answer.
    const [seats, setSeats] = useState(null);
    const [seatsFailed, setSeatsFailed] = useState(false);
    const onSeatPage = peopleView === 'seats';
    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await dbFetch('/.netlify/functions/users?seats=true');
                if (!res.ok) { if (!cancelled) { setSeats(null); setSeatsFailed(true); } return; }
                const d = await res.json();
                if (!cancelled) { setSeats(d); setSeatsFailed(false); }
            } catch (e) { if (!cancelled) { setSeats(null); setSeatsFailed(true); } }
        })();
        return () => { cancelled = true; };
    }, [onSeatPage]);
    // Map(lower-cased email → true/false). An email in NEITHER list is not a
    // Clerk member (e.g. a pending invite) — absent from the map, i.e. unknown.
    const mfaByEmail = React.useMemo(() => {
        if (!mfaData) return null;
        const m = new Map();
        (mfaData.enrolledUsers || []).forEach(u => { if (u.email) m.set(u.email.toLowerCase(), true); });
        (mfaData.notEnrolled   || []).forEach(u => { if (u.email) m.set(u.email.toLowerCase(), false); });
        return m;
    }, [mfaData]);

    // Drift check on load. Clerk is authoritative for who is in the org (the
    // role is the row's — state §0.163); the roster and Clerk diverge quietly
    // (a member added or removed in Clerk, an invite that never completed).
    // ?check=true runs the same reconciliation and writes nothing, so the
    // difference is visible here instead of being discovered by accident.
    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await dbFetch('/.netlify/functions/users-sync?check=true', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
                });
                if (!res.ok) return;                       // non-admins simply see nothing
                const d = await res.json();
                if (cancelled) return;
                const c = d.counts || {};
                if ((c.created || 0) + (c.updated || 0) + (c.dbOnly || 0) > 0) setDrift(c);
            } catch (e) { /* drift banner is advisory */ }
        })();
        return () => { cancelled = true; };
    }, []);
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
            // No role report: the sync no longer reads or writes a role — the role is
            // the row's, per org, and an Admin sets it (state §0.163).
            setSyncMsg(msg);
            setDrift(null);   // reconciled
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
    if (peopleView === 'export')   return <UsersExportPage   settings={settings} onBack={onBack} onUsers={onUsers} mfaByEmail={mfaByEmail}/>;
    if (peopleView === 'pending')  return <UsersPendingPage  settings={settings} onBack={onBack} onUsers={onUsers}/>;
    if (peopleView === 'seats')    return <UsersSeatPage     settings={settings} onBack={onBack} onUsers={onUsers} seats={seats} seatsFailed={seatsFailed}/>;
    if (peopleView === 'security') return <UsersSecurityPage settings={settings} onBack={onBack} onUsers={onUsers} mfaData={mfaData} mfaFailed={mfaFailed}/>;
    if (peopleView === 'profile' && viewingUser) return <UserProfilePage user={viewingUser} settings={settings} onBack={onBack} onUsers={onUsers} mfaByEmail={mfaByEmail}/>;

    // Map settings.users into the table display format
    const realUsers = (settings.users || []).filter(u => u.name && !u.id?.startsWith('pending_')).map(u => {
        // One rule for the list, the profile and the export (memberStatus.js).
        const status = memberStatus(u);
        return {
            id: u.id || u.name,
            name: u.name,
            email: u.email || '',
            role: u.role || 'User',
            team: u.team || null,
            manager: u.manager || null,
            lastActive: u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : '—',
            // Tri-state from Clerk: true/false when known, null when unknown
            // (fetch pending/failed, or not a Clerk member yet).
            mfa: mfaByEmail ? (mfaByEmail.get((u.email || '').toLowerCase()) ?? null) : null,
            status,
            _raw: u,
        };
    });
    // Pending rows (pending_ id prefix) — shown separately in Invited filter
    const pendingRows = (settings.users || []).filter(u => u.id?.startsWith('pending_') && u.name).map(u => ({
        id: u.id,
        name: u.name,
        email: u.email || '',
        role: u.role || 'User',
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
        { key:'MFA off',    label:`MFA off · ${displayUsers.filter(u=>u.mfa === false && u.status==='Active').length}` },
    ];

    const visible = displayUsers.filter(u => {
        if (filter === 'Active'     && u.status !== 'Active')  return false;
        if (filter === 'Invited'    && u.status !== 'Invited') return false;
        if (filter === 'MFA off'    && u.mfa !== false)        return false;   // unknown is not "off"
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
                    <button onClick={openCsvImport} style={{ padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}
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
            {userActionError && (
                <div style={{ margin:'0 0 12px', padding:'9px 12px', background:`${T.danger}12`,
                    border:`1px solid ${T.danger}55`, borderRadius:T.r, fontSize:12.5,
                    color:T.danger, fontWeight:600, fontFamily:T.sans }}>
                    {userActionError}
                </div>
            )}
            {!syncMsg && drift && (
                <div style={{ margin:'0 0 12px', padding:'9px 12px', background:`${T.warn}12`,
                    border:`1px solid ${T.warn}55`, borderRadius:T.r, fontSize:12.5, color:T.ink,
                    fontFamily:T.sans, display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontWeight:700, color:T.warn }}>Out of sync with Clerk</span>
                    <span style={{ color:T.inkMid }}>
                        {[
                            drift.created ? `${drift.created} in Clerk not here` : null,
                            drift.updated ? `${drift.updated} with different details` : null,
                            drift.dbOnly  ? `${drift.dbOnly} here not in Clerk` : null,
                        ].filter(Boolean).join(' · ')}
                    </span>
                    <button onClick={runClerkSync} disabled={syncing}
                        style={{ marginLeft:'auto', padding:'5px 12px', background:T.ink, color:'#fbf8f3',
                            border:'none', borderRadius:T.r, fontSize:12, fontWeight:600,
                            cursor: syncing ? 'default' : 'pointer', fontFamily:T.sans }}>
                        {syncing ? 'Syncing…' : 'Reconcile'}
                    </button>
                </div>
            )}
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
                            <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:2 }}>Click any row to open the user profile. Deactivate or reactivate from a row's ⋯ menu.</div>
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
                                {/* MFA — live from Clerk; dim dash = unknown */}
                                <div style={{ textAlign:'center' }}>
                                    {u.status === 'Active'
                                        ? u.mfa === true  ? <span title="MFA enrolled" style={{ color:T.ok, fontSize:14 }}>●</span>
                                        : u.mfa === false ? <span title="MFA not enrolled" style={{ color:T.warn, fontSize:14 }}>○</span>
                                        : <span title="Unknown — loading, or not linked in Clerk" style={{ color:T.border, fontSize:12 }}>—</span>
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
                                    <button onClick={e => {
                                            e.stopPropagation();
                                            if (openUserKebab === u.id) { setOpenUserKebab(null); return; }
                                            setKebabPos(kebabPlacement(e.currentTarget.getBoundingClientRect()));
                                            setOpenUserKebab(u.id);
                                        }}
                                        style={{ background:'none', border:'none', color:T.inkMuted, fontSize:16, cursor:'pointer', padding:'2px 4px', lineHeight:1, borderRadius:T.r }}
                                        onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                        onMouseLeave={e => e.currentTarget.style.background = 'none'}>⋯</button>
                                    {/* Portaled and fixed (guide §16, state §0.167): absolute inside
                                        the table, it opened upward over whatever sat above the row. The
                                        stopPropagation stays — a portal's clicks still reach the row's
                                        onClick through React, which would open the profile. */}
                                    {openUserKebab === u.id && kebabPos && createPortal(
                                        <div ref={kebabMenuRef} onClick={e => e.stopPropagation()}
                                            style={{ position:'fixed', left:kebabPos.left, ...(kebabPos.top != null ? { top:kebabPos.top } : { bottom:kebabPos.bottom }), maxHeight:kebabPos.maxHeight, overflowY:'auto', zIndex:1000, background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+2, boxShadow:'0 4px 16px rgba(42,38,34,0.12)', width:KEBAB_W }}>
                                            {[
                                                { label:'View profile', action: () => { setViewingUser(u._raw || u); setPeopleView('profile'); setOpenUserKebab(null); } },
                                                // 'Reset password', 'Enforce MFA' and 'Resend invite' were
                                                // close-only no-ops — controls that promise an action and do
                                                // nothing (§0.59, the dead-control sweep). Passwords, MFA
                                                // policy and invite emails are Clerk's; restore these only
                                                // wired to real Clerk Backend calls.
                                                // Deactivate = reversible; keeps the row, its role and its history.
                                                // `u` is the list's display row and carries no `active`, so
                                                // u.active offered Deactivate on every row; the roster row is
                                                // `_raw` (state §0.164).
                                                (u._raw || u).active !== false && { label:'Deactivate', action: () => {
                                                    setOpenUserKebab(null);
                                                    showConfirm(`Deactivate ${u.name}? They keep their record and role but lose access to this organization until an Admin reactivates them.`, async () => {
                                                        try {
                                                            const row = await setMemberActive(u.id, false);
                                                            _setSettings(prev => ({ ...prev, users: (prev.users||[]).map(su => su.id === u.id ? { ...su, ...row } : su) }));
                                                        } catch(err) { setUserActionError(`Could not deactivate ${u.name}: ${err.message}`); }
                                                    }, false);
                                                }},
                                                // Reactivate = the way back (state §0.164): the row kept its role.
                                                u.status === 'Deactivated' && { label:'Reactivate', action: () => {
                                                    setOpenUserKebab(null);
                                                    showConfirm(`Reactivate ${u.name}? They get their access to this organization back, with the role they had.`, async () => {
                                                        try {
                                                            const row = await setMemberActive(u.id, true);
                                                            _setSettings(prev => ({ ...prev, users: (prev.users||[]).map(su => su.id === u.id ? { ...su, ...row } : su) }));
                                                        } catch(err) { setUserActionError(`Could not reactivate ${u.name}: ${err.message}`); }
                                                    }, false);
                                                }},
                                                // An invitation not yet accepted is revoked, not deleted (state
                                                // §0.165): deleting its row left the Clerk invitation live.
                                                u.status === 'Invited' && { label:'Revoke invite', action: () => {
                                                    setOpenUserKebab(null);
                                                    showConfirm(`Revoke the invitation to ${u.email || u.name}? Its link stops working and their row is removed. You can invite them again later.`, async () => {
                                                        try {
                                                            const r = await revokeInvite(u.email);
                                                            const note = await dropRevokedRow(r.removedRowId, settings.teams, _setSettings);
                                                            if (note) setUserActionError(note);
                                                        } catch(err) { setUserActionError(`Could not revoke the invitation to ${u.email || u.name}: ${err.message}`); }
                                                    }, false);
                                                }},
                                                // Delete = permanent. This previously sent the id in the BODY while
                                                // the server reads it from the query string, so it 400'd, the client
                                                // never checked res.ok, and the row reappeared on refresh.
                                                u.status !== 'Invited' && { label:'Delete user', danger: true, action: () => {
                                                    setOpenUserKebab(null);
                                                    showConfirm(`Permanently delete ${u.name}? This cannot be undone. Their record is removed from Accelerep; the Clerk account is unaffected.`, async () => {
                                                        try {
                                                            const res = await dbFetch(`/.netlify/functions/users?id=${encodeURIComponent(u.id)}`, { method:'DELETE' });
                                                            if (!res.ok) { const d = await res.json().catch(()=>({})); throw new Error(d.error || ('HTTP ' + res.status)); }
                                                            _setSettings(prev => ({ ...prev, users: (prev.users||[]).filter(su => su.id !== u.id) }));
                                                        } catch(err) { setUserActionError(`Could not delete ${u.name}: ${err.message}`); }
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
                                        </div>,
                                        document.body,
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right rail — all values derived from live displayUsers */}
                {(() => {
                    // Clerk's membership limit (state §0.168) — "50" was invented.
                    // Clerk's count of members is what it holds against the limit;
                    // a limit of 0 is none.
                    const limit        = Number.isFinite(seats?.limit) ? seats.limit : null;
                    const inClerk      = Number.isFinite(seats?.members) ? seats.members : null;
                    const seatPct      = limit > 0 && inClerk !== null ? Math.round((inClerk / limit) * 100) : null;
                    const seatColor    = seatPct === null ? T.inkMuted : seatPct >= 100 ? T.danger : seatPct >= 80 ? T.warn : T.ok;

                    // Role breakdown from users.role — the column, not the profile copy.
                    // Single values, no label aliases. The `|| 'Sales Rep'` and
                    // `|| 'Sales Manager'` arms were counting display labels that this
                    // app never stores, which hid the fact that the field being counted
                    // was the stale profile copy rather than the role column.
                    const repCount     = displayUsers.filter(u => u.status==='Active' && u.role==='User').length;
                    const mgrCount     = displayUsers.filter(u => u.status==='Active' && u.role==='Manager').length;
                    const adminCount   = displayUsers.filter(u => u.status==='Active' && u.role==='Admin').length;
                    const pendingCount = invitedCount.length;

                    // MFA — live from Clerk (tri-state; unknown counts neither way)
                    const mfaOn  = displayUsers.filter(u => u.status==='Active' && u.mfa === true).length;
                    const mfaOff = displayUsers.filter(u => u.status==='Active' && u.mfa === false).length;

                    return (
                        <div style={{ display:'flex', flexDirection:'column', gap:14, position:'sticky', top:0 }}>
                            {/* Pending invites */}
                            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:16 }}>
                                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                                    <button onClick={() => setPeopleView('pending')} style={{ fontSize:13.5, fontWeight:700, color:T.ink, background:'none', border:'none', cursor:'pointer', fontFamily:T.sans, padding:0, textAlign:'left' }}>Pending invites →</button>
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
                                        </div>
                                    ))
                                }
                            </div>

                            {/* Seat usage */}
                            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:16 }}>
                                <button onClick={() => setPeopleView('seats')} style={{ fontSize:13.5, fontWeight:700, color:T.ink, marginBottom:4, background:'none', border:'none', cursor:'pointer', fontFamily:T.sans, padding:0, display:'block', textAlign:'left' }}>Seat usage →</button>
                                <div style={{ fontSize:11.5, color:T.inkMuted, marginBottom:12 }}>Members against Clerk's limit.</div>
                                <div style={{ display:'flex', alignItems:'baseline', gap:4, marginBottom:6 }}>
                                    <span style={{ fontSize:18, fontWeight:700, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace' }}>{inClerk ?? '—'}</span>
                                    <span style={{ fontSize:13, color:T.inkMuted }}>{limit > 0 ? `/ ${limit}` : limit === 0 ? 'no limit' : ''}</span>
                                    <div style={{ flex:1 }}/>
                                    <span style={{ fontSize:11.5, fontWeight:600, color:seatColor }}>
                                        {seatPct !== null ? `${seatPct}%` : !seats ? (seatsFailed ? 'could not read Clerk' : 'loading…') : ''}
                                    </span>
                                </div>
                                {seatPct !== null && (
                                    <div style={{ height:5, background:T.border, borderRadius:3, marginBottom:12, overflow:'hidden' }}>
                                        <div style={{ width:`${Math.min(seatPct,100)}%`, height:'100%', background:seatColor, borderRadius:3 }}/>
                                    </div>
                                )}
                                {[
                                    { label:'Reps',     value:repCount },
                                    { label:'Managers', value:mgrCount },
                                    { label:'Admins',   value:adminCount },
                                    ...(pendingCount > 0 ? [{ label:'Pending', value:pendingCount, sub:'not joined yet', color:T.warn }] : []),
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
                                        // Tri-state aware: with no Clerk data the old ternary
                                        // rendered "0/4 · all enrolled" — a contradiction born
                                        // of unknown counting as neither on nor off (§0.59).
                                        label: 'MFA on',
                                        value: mfaByEmail ? `${mfaOn}/${activeCount}` : '—',
                                        sub:   !mfaByEmail ? (mfaFailed ? 'unknown — could not read Clerk' : 'loading…')
                                             : mfaOff > 0  ? `${mfaOff} off`
                                             : mfaOn > 0   ? 'all enrolled'
                                             : 'no Clerk-linked members',
                                        color: !mfaByEmail ? T.inkMuted : mfaOff > 0 ? T.warn : mfaOn > 0 ? T.ok : T.inkMuted,
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
