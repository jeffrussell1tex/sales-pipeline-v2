// settings/data/ExportDetail.jsx
import React, { useState, useEffect, useRef } from 'react';
import { dbFetch, dbWrite } from '../../../utils/storage';
import { T } from '../shared/tokens.js';
import { DataCard, DPill, DataCrumb, DataTitle, DataBtn, DataModal, DataModalHead, DataModalFoot } from './shared.jsx';

const FL = ({ label, children }) => (<div><label style={{ display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5 }}>{label}</label>{children}</div>);
const FLm = ({ label, children }) => (<div style={{ marginBottom:14 }}><label style={{ display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5 }}>{label}</label>{children}</div>);

const NewExportModal = ({ onClose, onSave, existing }) => {
    const selStyle = { width:'100%', padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface, appearance:'none', cursor:'pointer' };
    const inpStyle = { width:'100%', padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface, boxSizing:'border-box' };
    const nameRef  = React.useRef(null);
    const [scope,  setScope]  = React.useState(existing?.scope       || 'accounts');
    const [fmt,    setFmt]    = React.useState(existing?.format      || 'CSV');
    const [cadence,setCadence]= React.useState(existing?.cadence     || 'Weekly · Mondays 06:00 UTC');
    const [dest,   setDest]   = React.useState(existing?.destination || 'download');
    const [saving, setSaving] = React.useState(false);

    const handleSave = async () => {
        const name = nameRef.current?.value?.trim();
        if (!name) return;
        setSaving(true);
        await onSave({ id: existing?.id || null, name, scope, format:fmt, cadence, destination:dest, enabled:true, status:'ok' });
        setSaving(false);
    };

    return (
        <DataModal onClose={onClose}>
            <DataModalHead title={existing ? 'Edit scheduled export' : 'New scheduled export'} sub="Define a recurring export. Manual trigger available immediately." onClose={onClose}/>
            <div style={{ flex:1, overflowY:'auto', padding:22 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                    <FL label="Name"><input ref={nameRef} defaultValue={existing?.name || ''} placeholder="e.g. Weekly accounts" style={inpStyle}/></FL>
                    <FL label="Entity (scope)">
                        <select value={scope} onChange={e => setScope(e.target.value)} style={selStyle}>
                            {['accounts','contacts','opportunities','tasks','activities','leads'].map(s => (
                                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                            ))}
                        </select>
                    </FL>
                    <FL label="Format">
                        <select value={fmt} onChange={e => setFmt(e.target.value)} style={selStyle}>
                            <option>CSV</option><option>JSON</option>
                        </select>
                    </FL>
                    <FL label="Cadence">
                        <select value={cadence} onChange={e => setCadence(e.target.value)} style={selStyle}>
                            <option>Daily · 02:00 UTC</option>
                            <option>Weekly · Mondays 06:00 UTC</option>
                            <option>Weekly · Fridays 22:00 UTC</option>
                            <option>Monthly · 1st 00:00 UTC</option>
                            <option>Quarterly · 1st 00:00 UTC</option>
                            <option>On request</option>
                        </select>
                    </FL>
                    <FL label="Destination" style={{ gridColumn:'span 2' }}>
                        <select value={dest} onChange={e => setDest(e.target.value)} style={selStyle}>
                            <option value="download">Browser download (manual trigger)</option>
                            <option value="email">Email</option>
                            <option value="webhook">Webhook</option>
                        </select>
                    </FL>
                </div>
                <div style={{ marginTop:12, padding:'10px 12px', background:'rgba(58,90,122,0.07)', borderLeft:`3px solid ${T.info}`, borderRadius:3, fontSize:12, color:T.inkMid }}>
                    <b style={{ color:T.info }}>Note:</b> Automated delivery (S3, SFTP, Snowflake) is on the roadmap. Schedules created today can be triggered manually from the export page.
                </div>
            </div>
            <DataModalFoot>
                <DataBtn label="Cancel" onClick={onClose}/>
                <DataBtn label={saving ? 'Saving…' : (existing ? 'Save changes' : 'Create schedule')} primary disabled={saving} onClick={handleSave}/>
            </DataModalFoot>
        </DataModal>
    );
};

export const ExportDetail = ({ onBack }) => {
    // dbFetch is imported at the top of this file from ../utils/storage
    const [schedules,  setSchedules]  = React.useState([]);
    const [runs,       setRuns]       = React.useState([]);
    const [dsrItems,   setDsrItems]   = React.useState([]);
    const [loading,    setLoading]    = React.useState(true);
    const [error,      setError]      = React.useState(null);
    const [showModal,  setShowModal]  = React.useState(false);
    const [showDsrModal, setShowDsrModal] = React.useState(false);
    const [adHocScope, setAdHocScope] = React.useState('accounts');
    const [adHocFmt,   setAdHocFmt]   = React.useState('CSV');
    const [adhocLoading, setAdhocLoading] = React.useState(false);
    const [adhocError,   setAdhocError]   = React.useState(null);
    const [editingSched, setEditingSched] = React.useState(null); // schedule being edited

    // ── load all three endpoints on mount ─────────────────────
    React.useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const [schRes, runRes, dsrRes] = await Promise.all([
                    dbFetch('/.netlify/functions/export-schedules'),
                    dbFetch('/.netlify/functions/export-runs'),
                    dbFetch('/.netlify/functions/export-dsr'),
                ]);
                if (cancelled) return;
                const [schData, runData, dsrData] = await Promise.all([
                    schRes.json(), runRes.json(), dsrRes.json(),
                ]);
                if (!schRes.ok)  throw new Error(schData.error || 'Failed to load schedules');
                if (!runRes.ok)  throw new Error(runData.error || 'Failed to load runs');
                if (!dsrRes.ok)  throw new Error(dsrData.error || 'Failed to load DSR queue');
                setSchedules(schData.schedules || []);
                setRuns(runData.runs || []);
                setDsrItems(dsrData.dsrQueue || []);
            } catch (e) {
                if (!cancelled) setError(e.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, []);

    const failing    = schedules.find(s => s.status === 'failing');
    const activeCount = schedules.filter(s => s.enabled).length;
    const openDsr    = dsrItems.filter(d => d.status !== 'completed').length;
    const th         = { padding:'9px 12px', fontSize:10, fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', color:T.inkMuted, fontFamily:T.sans, textAlign:'left' };

    // ── toggle schedule enabled/disabled ──────────────────────
    const handleToggle = async (sched) => {
        const updated = { ...sched, enabled: !sched.enabled };
        setSchedules(prev => prev.map(s => s.id === sched.id ? updated : s));
        try {
            const res  = await dbFetch('/.netlify/functions/export-schedules', { method:'PUT', body: JSON.stringify(updated) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setSchedules(prev => prev.map(s => s.id === sched.id ? (data.schedule || updated) : s));
        } catch (e) {
            // Revert on error
            setSchedules(prev => prev.map(s => s.id === sched.id ? sched : s));
        }
    };

    // ── delete schedule ───────────────────────────────────────
    const handleDeleteSched = async (id) => {
        // Optimistic removal, restored if the delete does not land. dbFetch
        // resolves for ANY status (guide 18b1), so the old catch fired on a
        // network failure only and the row vanished until the next reload.
        const snapshot = schedules;
        setSchedules(prev => prev.filter(s => s.id !== id));
        setError('');
        const r = await dbWrite(`/.netlify/functions/export-schedules?id=${id}`, { method:'DELETE' });
        if (!r.ok) {
            setSchedules(snapshot);
            setError(`Schedule not deleted — ${r.error}`);
        }
    };

    // ── ad-hoc export ─────────────────────────────────────────
    const handleAdHoc = async () => {
        setAdhocLoading(true);
        setAdhocError(null);
        try {
            const id  = 'run_' + crypto.randomUUID();
            const res = await dbFetch('/.netlify/functions/export-runs', {
                method: 'POST',
                body: JSON.stringify({ id, scope: adHocScope, format: adHocFmt }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Export failed');

            // Trigger browser download from base64 payload
            const dl  = data.download;
            const bin = atob(dl.data);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            const blob = new Blob([arr], { type: dl.contentType });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = dl.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Add run to recent list
            if (data.run) setRuns(prev => [data.run, ...prev].slice(0, 20));
        } catch (e) {
            setAdhocError(e.message);
        } finally {
            setAdhocLoading(false);
        }
    };

    // ── update DSR status ─────────────────────────────────────
    const handleDsrStatus = async (dsr, newStatus) => {
        const updated = { ...dsr, status: newStatus };
        setDsrItems(prev => prev.map(d => d.id === dsr.id ? updated : d));
        try {
            const res  = await dbFetch('/.netlify/functions/export-dsr', { method:'PUT', body: JSON.stringify(updated) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setDsrItems(prev => prev.map(d => d.id === dsr.id ? (data.dsr || updated) : d));
        } catch (e) {
            setDsrItems(prev => prev.map(d => d.id === dsr.id ? dsr : d));
        }
    };

    // ── format helpers ────────────────────────────────────────
    const fmtTs = (iso) => {
        if (!iso) return '—';
        const d = new Date(iso);
        const now = new Date();
        const diffMs = now - d;
        const diffMin = Math.round(diffMs / 60000);
        if (diffMin < 1)   return 'just now';
        if (diffMin < 60)  return diffMin + 'm ago';
        const diffH = Math.round(diffMin / 60);
        if (diffH < 24)    return diffH + 'h ago';
        const diffD = Math.round(diffH / 24);
        if (diffD === 1)   return 'yesterday';
        if (diffD < 7)     return diffD + 'd ago';
        return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
    };

    const fmtSize = (bytes) => {
        if (!bytes || bytes === 0) return '—';
        if (bytes < 1024)        return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    if (loading) return (
        <div style={{ fontFamily:T.sans }}>
            <DataCrumb page="Export" onBack={onBack}/>
            <div style={{ padding:'60px 0', textAlign:'center', color:T.inkMuted, fontSize:13 }}>Loading export data…</div>
        </div>
    );

    if (error) return (
        <div style={{ fontFamily:T.sans }}>
            <DataCrumb page="Export" onBack={onBack}/>
            <div style={{ padding:'12px 16px', background:'rgba(156,58,46,0.08)', borderLeft:`3px solid ${T.danger}`, borderRadius:4, fontSize:13, color:T.danger }}>{error}</div>
        </div>
    );

    return (
        <div style={{ fontFamily:T.sans }}>
            {showModal    && <NewExportModal onClose={() => { setShowModal(false); setEditingSched(null); }} existing={editingSched} onSave={async (payload) => {
                try {
                    const isEdit = !!payload.id && schedules.find(s => s.id === payload.id);
                    const method = isEdit ? 'PUT' : 'POST';
                    if (!isEdit) payload.id = 'sch_' + crypto.randomUUID();
                    const res  = await dbFetch('/.netlify/functions/export-schedules', { method, body: JSON.stringify(payload) });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error);
                    if (isEdit) setSchedules(prev => prev.map(s => s.id === payload.id ? data.schedule : s));
                    else        setSchedules(prev => [data.schedule, ...prev]);
                    setShowModal(false); setEditingSched(null);
                } catch(e) { alert('Save failed: ' + e.message); }
            }}/>}
            {showDsrModal && <NewDsrModal onClose={() => setShowDsrModal(false)} onSave={async (payload) => {
                try {
                    payload.id = 'dsr_' + crypto.randomUUID();
                    const res  = await dbFetch('/.netlify/functions/export-dsr', { method:'POST', body: JSON.stringify(payload) });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error);
                    setDsrItems(prev => [data.dsr, ...prev]);
                    setShowDsrModal(false);
                } catch(e) { alert('Save failed: ' + e.message); }
            }}/>}

            <DataCrumb page="Export" onBack={onBack}/>
            <DataTitle
                title="Export"
                sub="Scheduled and ad-hoc exports; GDPR data subject requests"
                badge={`${activeCount} active schedule${activeCount !== 1 ? 's' : ''} · ${openDsr} open DSR`}
                updatedBy={runs[0] ? (runs[0].triggeredBy || 'system') : null}
                updatedAt={runs[0] ? fmtTs(runs[0].createdAt) : null}
                actions={[
                    <DataBtn key="adhoc" label={adhocLoading ? 'Exporting…' : 'Run ad-hoc export'} disabled={adhocLoading} onClick={() => {
                        // Show inline ad-hoc panel by toggling a flag
                        setAdHocScope('accounts'); setAdHocFmt('CSV'); setAdhocError(null);
                        setShowModal(false);
                    }}/>,
                    <DataBtn key="new" label="+ New scheduled export" primary onClick={() => { setEditingSched(null); setShowModal(true); }}/>,
                ]}
            />

            {/* Failing callout */}
            {failing && (
                <div style={{ padding:'11px 16px', background:'rgba(156,58,46,0.08)', borderLeft:`3px solid ${T.danger}`, borderRadius:4, marginBottom:16, fontSize:13 }}>
                    <b style={{ color:T.danger }}>"{failing.name}" is failing.</b>
                    <span style={{ color:T.inkMid, marginLeft:6 }}>Last run: {fmtTs(failing.lastRunAt)}. {failing.lastError || ''}</span>
                </div>
            )}

            {/* ── Ad-hoc export panel ── */}
            <DataCard title="Ad-hoc export" desc="Download a one-time export of any entity directly to your browser.">
                <div style={{ display:'flex', gap:12, alignItems:'flex-end', flexWrap:'wrap' }}>
                    <div>
                        <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5 }}>Entity</label>
                        <select value={adHocScope} onChange={e => setAdHocScope(e.target.value)}
                            style={{ padding:'7px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface, appearance:'none', minWidth:180, cursor:'pointer' }}>
                            {['accounts','contacts','opportunities','tasks','activities','leads'].map(s => (
                                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5 }}>Format</label>
                        <select value={adHocFmt} onChange={e => setAdHocFmt(e.target.value)}
                            style={{ padding:'7px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface, appearance:'none', minWidth:100, cursor:'pointer' }}>
                            <option>CSV</option>
                            <option>JSON</option>
                        </select>
                    </div>
                    <DataBtn label={adhocLoading ? 'Exporting…' : '↓ Download now'} primary disabled={adhocLoading} onClick={handleAdHoc}/>
                </div>
                {adhocError && <div style={{ marginTop:10, fontSize:12, color:T.danger, fontWeight:600 }}>{adhocError}</div>}
            </DataCard>

            {/* ── Scheduled exports table ── */}
            <DataCard
                title={`Scheduled exports (${schedules.length})`}
                desc="Recurring exports — manual trigger only in this release; automated delivery coming soon."
                headAction={<DataBtn label="+ New" onClick={() => { setEditingSched(null); setShowModal(true); }}/>}
            >
                {schedules.length === 0 ? (
                    <div style={{ padding:'24px 0', textAlign:'center', fontSize:12.5, color:T.inkMuted }}>
                        No schedules yet. Create one to get started.
                    </div>
                ) : (
                    <div style={{ overflowX:'auto' }}>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5, fontFamily:T.sans }}>
                            <thead><tr style={{ background:T.surface2 }}>{['Name','Scope','Cadence','Destination','Format','Last run','Status',''].map((h,i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
                            <tbody>
                                {schedules.map((s,i) => {
                                    const tone  = !s.enabled ? 'neutral' : s.status === 'failing' ? 'danger' : 'ok';
                                    const label = !s.enabled ? 'Paused' : s.status === 'failing' ? 'Failing' : 'Active';
                                    return (
                                        <tr key={s.id} style={{ borderBottom: i < schedules.length-1 ? `1px solid ${T.border}` : 'none', opacity: s.enabled ? 1 : 0.62 }}>
                                            <td style={{ padding:'10px 12px', fontWeight:600 }}>{s.name}</td>
                                            <td style={{ padding:'10px 12px', fontSize:12, color:T.inkMid }}>{s.scope}</td>
                                            <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11 }}>{s.cadence}</td>
                                            <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.destination}</td>
                                            <td style={{ padding:'10px 12px' }}><DPill tone="neutral">{s.format}</DPill></td>
                                            <td style={{ padding:'10px 12px', color:T.inkMid, fontSize:12 }}>{s.lastRunAt ? fmtTs(s.lastRunAt) : '—'}{s.lastSize ? ' · ' + s.lastSize : ''}</td>
                                            <td style={{ padding:'10px 12px' }}><DPill tone={tone}>{label}</DPill></td>
                                            <td style={{ padding:'10px 12px' }}>
                                                <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                                                    <span onClick={() => handleToggle(s)} style={{ fontSize:11, color:T.info, cursor:'pointer', fontWeight:600 }}>
                                                        {s.enabled ? 'Pause' : 'Enable'}
                                                    </span>
                                                    <span onClick={() => { setEditingSched(s); setShowModal(true); }} style={{ fontSize:11, color:T.info, cursor:'pointer', fontWeight:600 }}>Edit</span>
                                                    <span onClick={() => handleDeleteSched(s.id)} style={{ fontSize:11, color:T.danger, cursor:'pointer', fontWeight:600 }}>Delete</span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </DataCard>

            {/* ── Recent runs ── */}
            <DataCard title="Recent activity" desc="Ad-hoc and scheduled runs (last 20).">
                {runs.length === 0 ? (
                    <div style={{ padding:'24px 0', textAlign:'center', fontSize:12.5, color:T.inkMuted }}>No export runs yet.</div>
                ) : (
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5, fontFamily:T.sans }}>
                        <thead><tr style={{ background:T.surface2 }}>{['When','Name','By','Rows','Format','Size','Duration'].map((h,i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
                        <tbody>
                            {runs.map((r,i) => (
                                <tr key={r.id} style={{ borderBottom: i < runs.length-1 ? `1px solid ${T.border}` : 'none' }}>
                                    <td style={{ padding:'10px 12px', color:T.inkMuted }}>{fmtTs(r.createdAt)}</td>
                                    <td style={{ padding:'10px 12px', fontWeight:500 }}>{r.name}</td>
                                    <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11 }}>{r.triggeredBy || 'system'}</td>
                                    <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5 }}>{(r.rowCount || 0).toLocaleString()}</td>
                                    <td style={{ padding:'10px 12px' }}><DPill tone="neutral">{r.format}</DPill></td>
                                    <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5 }}>{fmtSize(r.sizeBytes)}</td>
                                    <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11 }}>{r.durationMs ? r.durationMs + 'ms' : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </DataCard>

            {/* ── GDPR / DSR queue ── */}
            <DataCard
                title={`GDPR / DSR queue (${openDsr} open)`}
                desc="Data Subject Requests — respond within 30 days per GDPR Art. 15–17."
                headAction={<DataBtn label="+ New DSR" onClick={() => setShowDsrModal(true)}/>}
            >
                {dsrItems.length === 0 ? (
                    <div style={{ padding:'24px 0', textAlign:'center', fontSize:12.5, color:T.inkMuted }}>No DSR requests on record.</div>
                ) : (
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5, fontFamily:T.sans }}>
                        <thead><tr style={{ background:T.surface2 }}>{['Ticket','Subject','Type','Submitted','SLA','Status',''].map((h,i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
                        <tbody>
                            {dsrItems.map((d,i) => (
                                <tr key={d.id} style={{ borderBottom: i < dsrItems.length-1 ? `1px solid ${T.border}` : 'none' }}>
                                    <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5 }}>{d.id}</td>
                                    <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5 }}>{d.subject}</td>
                                    <td style={{ padding:'10px 12px' }}><DPill tone={d.type === 'erasure' ? 'danger' : 'neutral'}>{d.type === 'erasure' ? 'Erasure' : 'Access'}</DPill></td>
                                    <td style={{ padding:'10px 12px', color:T.inkMid }}>{fmtTs(d.createdAt)}</td>
                                    <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11, color: d.slaLabel === 'Overdue' ? T.danger : T.inkMid }}>{d.slaLabel}</td>
                                    <td style={{ padding:'10px 12px' }}><DPill tone={d.status === 'completed' ? 'ok' : 'info'}>{d.status === 'completed' ? 'Completed' : 'In progress'}</DPill></td>
                                    <td style={{ padding:'10px 12px', textAlign:'right' }}>
                                        {d.status !== 'completed' && (
                                            <span onClick={() => handleDsrStatus(d, 'completed')} style={{ fontSize:11, color:T.ok, cursor:'pointer', fontWeight:600 }}>Mark complete</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </DataCard>
        </div>
    );
};

const NewDsrModal = ({ onClose, onSave }) => {
    const [subject, setSubject] = React.useState('');
    const [type,    setType]    = React.useState('access');
    const [notes,   setNotes]   = React.useState('');
    const [saving,  setSaving]  = React.useState(false);
    const inpStyle = { width:'100%', padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface, boxSizing:'border-box' };
    const handleSave = async () => {
        if (!subject.trim()) return;
        setSaving(true);
        await onSave({ subject: subject.trim(), type, notes: notes.trim() || null });
        setSaving(false);
    };
    return (
        <DataModal onClose={onClose}>
            <DataModalHead title="New DSR request" sub="Log a GDPR Data Subject Request. 30-day SLA starts today." onClose={onClose}/>
            <div style={{ flex:1, overflowY:'auto', padding:22 }}>
                <FLm label="Subject (email or identifier)"><input value={subject} onChange={e => setSubject(e.target.value)} placeholder="user@example.com" style={inpStyle}/></FLm>
                <FLm label="Request type">
                    <select value={type} onChange={e => setType(e.target.value)} style={{ ...inpStyle, appearance:'none', cursor:'pointer' }}>
                        <option value="access">Access — provide a copy of their data</option>
                        <option value="erasure">Erasure — delete all their data (Right to be forgotten)</option>
                    </select>
                </FLm>
                <FLm label="Notes (optional)"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Any context…" style={{ ...inpStyle, resize:'vertical' }}/></FLm>
            </div>
            <DataModalFoot>
                <DataBtn label="Cancel" onClick={onClose}/>
                <DataBtn label={saving ? 'Saving…' : 'Create request'} primary disabled={!subject.trim() || saving} onClick={handleSave}/>
            </DataModalFoot>
        </DataModal>
    );
};
