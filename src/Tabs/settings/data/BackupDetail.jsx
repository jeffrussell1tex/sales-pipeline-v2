// settings/data/BackupDetail.jsx
import React, { useState, useEffect, useRef } from 'react';
import { dbFetch } from '../../../utils/storage';
import { T } from '../shared/tokens.js';
import { LIcon } from '../shared/ui.jsx';
import { DataStatCard, DataCard, DPill, DataCrumb, DataTitle, DataBtn, DataModal, DataModalHead, DataModalFoot } from './shared.jsx';

const ImportBackupModal = ({ onClose, onSuccess }) => {
    const [file,      setFile]      = useState(null);
    const [parsed,    setParsed]    = useState(null);
    const [parseErr,  setParseErr]  = useState('');
    const [loading,   setLoading]   = useState(false);
    const [result,    setResult]    = useState(null);
    const [error,     setError]     = useState('');
    const fileRef = useRef();

    const handleFile = e => {
        const f = e.target.files?.[0];
        if (!f) return;
        setFile(f);
        setParsed(null);
        setParseErr('');
        setResult(null);
        setError('');
        const reader = new FileReader();
        reader.onload = ev => {
            try {
                const data = JSON.parse(ev.target.result);
                if (!data.entities || typeof data.entities !== 'object') {
                    setParseErr('This file does not look like an Accelerep backup (missing "entities" key).');
                    return;
                }
                setParsed(data);
            } catch {
                setParseErr('Could not parse file — make sure it is a valid JSON backup.');
            }
        };
        reader.readAsText(f);
    };

    const handleImport = async () => {
        if (!parsed) return;
        setLoading(true);
        setError('');
        try {
            const res = await dbFetch('/.netlify/functions/backup', {
                method: 'PATCH',
                body: JSON.stringify(parsed),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Import failed');
            setResult(data);
            onSuccess && onSuccess(data);
        } catch (e) {
            setError(e.message || 'Import failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Summary counts from the parsed file
    const counts = parsed ? Object.entries(parsed.entities)
        .filter(([, v]) => Array.isArray(v) && v.length > 0)
        .map(([k, v]) => `${v.length} ${k}`)
        : [];

    return (
        <DataModal width={520} onClose={onClose}>
            <DataModalHead onClose={onClose}
                title="Import from backup file"
                sub="Upload a JSON backup to restore data into this workspace."/>
            <div style={{ flex:1, overflowY:'auto', padding:22 }}>

                {/* File picker */}
                {!result && (
                    <>
                        <div
                            onClick={() => fileRef.current?.click()}
                            style={{
                                border: `2px dashed ${file && !parseErr ? T.ok : T.border}`,
                                borderRadius: T.r, padding: '24px 16px', textAlign: 'center',
                                cursor: 'pointer', marginBottom: 14, background: T.surface2,
                                transition: 'border-color 150ms',
                            }}>
                            <LIcon name="upload" size={22} color={T.inkMuted}/>
                            <div style={{ fontSize:13, fontWeight:600, color:T.ink, marginTop:8 }}>
                                {file ? file.name : 'Click to choose a backup file'}
                            </div>
                            <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:4 }}>
                                {file ? `${(file.size / 1024).toFixed(1)} KB` : 'JSON files only · exported from Accelerep'}
                            </div>
                            <input ref={fileRef} type="file" accept=".json,application/json"
                                style={{ display:'none' }} onChange={handleFile}/>
                        </div>

                        {parseErr && (
                            <div style={{ fontSize:12.5, color:T.danger, fontWeight:600, marginBottom:12 }}>
                                ✕ {parseErr}
                            </div>
                        )}

                        {/* Preview what will be imported */}
                        {parsed && counts.length > 0 && (
                            <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:4, padding:'12px 14px', marginBottom:14, fontSize:12 }}>
                                <div style={{ fontWeight:700, color:T.ink, marginBottom:8 }}>File contents</div>
                                {counts.map(c => (
                                    <div key={c} style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                                        <span style={{ color:T.inkMid }}>{c.split(' ').slice(1).join(' ')}</span>
                                        <span style={{ fontWeight:600, color:T.ink }}>{c.split(' ')[0]}</span>
                                    </div>
                                ))}
                                {parsed.exportedAt && (
                                    <div style={{ marginTop:8, paddingTop:8, borderTop:`1px solid ${T.border}`, color:T.inkMuted, fontSize:11 }}>
                                        Exported {new Date(parsed.exportedAt).toLocaleString()}
                                    </div>
                                )}
                            </div>
                        )}

                        <div style={{ padding:'10px 12px', background:'rgba(58,90,122,0.08)', borderLeft:`3px solid ${T.info}`, borderRadius:3, marginBottom:14, fontSize:12, color:T.inkMid }}>
                            <b style={{ color:T.info }}>Safe to run on empty orgs.</b> Existing records with matching IDs will be updated. Records not in the file are left untouched.
                        </div>

                        {error && (
                            <div style={{ fontSize:12.5, color:T.danger, fontWeight:600, marginBottom:8 }}>
                                ✕ {error}
                            </div>
                        )}
                    </>
                )}

                {/* Success state */}
                {result && (
                    <div style={{ textAlign:'center', padding:'16px 0' }}>
                        <div style={{ fontSize:32, marginBottom:12 }}>✓</div>
                        <div style={{ fontSize:15, fontWeight:700, color:T.ok, marginBottom:6 }}>
                            Import complete
                        </div>
                        <div style={{ fontSize:13, color:T.inkMid }}>
                            {result.imported.toLocaleString()} records restored into this workspace.
                        </div>
                        {result.errors?.length > 0 && (
                            <div style={{ marginTop:12, fontSize:12, color:T.warn }}>
                                Some entities had errors: {result.errors.join(', ')}
                            </div>
                        )}
                    </div>
                )}
            </div>
            <DataModalFoot>
                <DataBtn label={result ? 'Close' : 'Cancel'} onClick={onClose}/>
                {!result && (
                    <DataBtn
                        label={loading ? 'Importing…' : 'Import records'}
                        primary
                        disabled={!parsed || !!parseErr || loading}
                        onClick={handleImport}/>
                )}
            </DataModalFoot>
        </DataModal>
    );
};

const RestoreModal = ({ snap, onClose }) => {
    const [confirm, setConfirm] = useState('');
    const [notify, setNotify]   = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState('');
    const ready = confirm.trim().toUpperCase() === 'RESTORE';

    const handleDownload = async () => {
        if (!ready) return;
        setLoading(true);
        setError('');
        try {
            const dlRes = await dbFetch(
                `/.netlify/functions/backup?id=${encodeURIComponent(snap.id)}&download=1`
            );
            if (!dlRes.ok) throw new Error('Server error');
            const text = await dlRes.text();
            const blob = new Blob([text], { type: 'application/json' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = `${snap.id}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            onClose();
        } catch (e) {
            setError('Download failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <DataModal width={540} onClose={onClose}>
            <DataModalHead onClose={onClose}
                title={<span style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ width:32, height:32, borderRadius:4, background:'rgba(156,58,46,0.12)', color:T.danger, display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:700, flexShrink:0 }}>⚠</span>
                    Restore from snapshot?
                </span>}
                sub={`Download the complete data export from ${snap?.ts || 'this snapshot'}.`}/>
            <div style={{ flex:1, overflowY:'auto', padding:22 }}>
                <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:4, padding:'12px 14px', marginBottom:14, fontSize:12 }}>
                    {[
                        { label:'Snapshot',        value: snap?.id || '—',                                         mono:true  },
                        { label:'Records',         value: snap?.recordCount != null ? snap.recordCount.toLocaleString() : '—', bold:true },
                        { label:'Size',            value: snap?.sizeLabel || '—'                                              },
                        { label:'Download format', value: 'JSON · all entities',                                   color:T.ok },
                    ].map((r,i) => (
                        <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: i<3?5:0 }}>
                            <span style={{ color:T.inkMid }}>{r.label}</span>
                            <span style={{ fontFamily:r.mono?'ui-monospace,Menlo,monospace':'inherit', fontWeight:r.bold?600:500, color:r.color||T.ink }}>{r.value}</span>
                        </div>
                    ))}
                </div>
                <div style={{ padding:'10px 12px', background:'rgba(58,90,122,0.08)', borderLeft:`3px solid ${T.info}`, borderRadius:3, marginBottom:14, fontSize:12, color:T.inkMid }}>
                    <b style={{ color:T.info }}>How restore works:</b> This downloads the full snapshot as a JSON file. To reimport records use Settings → Data → Import after reviewing the file.
                </div>
                <div style={{ marginBottom:12 }}>
                    <label style={{ display:'block', fontSize:12, fontWeight:600, color:T.inkMid, marginBottom:6 }}>
                        Type <b style={{ fontFamily:'ui-monospace,Menlo,monospace', color:T.ink }}>RESTORE</b> to confirm download
                    </label>
                    <input value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="RESTORE"
                        style={{ width:'100%', padding:'8px 10px', border:`1.5px solid ${ready?T.danger:T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace', outline:'none', background:T.surface, boxSizing:'border-box' }}/>
                </div>
                <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12.5, cursor:'pointer' }} onClick={()=>setNotify(v=>!v)}>
                    <span style={{ width:14, height:14, border:`1.5px solid ${notify?T.ok:T.border}`, borderRadius:2, background:notify?T.ok:'transparent', display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        {notify && <span style={{ color:'#fff', fontSize:9 }}>✓</span>}
                    </span>
                    Notify workspace admins after download
                </label>
                {error && <div style={{ marginTop:10, fontSize:12, color:T.danger, fontWeight:600 }}>{error}</div>}
            </div>
            <DataModalFoot>
                <DataBtn label="Cancel" onClick={onClose}/>
                <DataBtn label={loading ? 'Downloading…' : 'Download snapshot'} danger disabled={!ready || loading} onClick={handleDownload}/>
            </DataModalFoot>
        </DataModal>
    );
};

export const BackupDetail = ({ onBack }) => {
    // ── Data state
    const [snapshots,    setSnapshots]    = useState([]);
    const [schedule,     setSchedule]     = useState({ frequency:'Daily', timeUtc:'03:00', retentionDays:30, notifyOnFailure:'' });
    const [loading,      setLoading]      = useState(true);
    const [loadError,    setLoadError]    = useState('');

    // ── Action state
    const [restoreSnap,  setRestoreSnap]  = useState(null);
    const [showImport,   setShowImport]   = useState(false);
    const [runningBackup,setRunningBackup]= useState(false);
    const [backupError,  setBackupError]  = useState('');
    const [backupSuccess,setBackupSuccess]= useState('');

    // ── Schedule edit state
    const [schedDirty,   setSchedDirty]   = useState(false);
    const [schedSaving,  setSchedSaving]  = useState(false);
    const [schedError,   setSchedError]   = useState('');
    const [schedSaved,   setSchedSaved]   = useState(false);
    const [editSched,    setEditSched]    = useState(null); // working copy while editing

    // Derived from snapshots
    const totalSizeBytes = snapshots.reduce((sum, s) => sum + (s.sizeBytes || 0), 0);
    const totalSizeLabel = totalSizeBytes === 0 ? '—'
        : totalSizeBytes < 1024 * 1024 ? `${(totalSizeBytes / 1024).toFixed(1)} KB`
        : `${(totalSizeBytes / (1024 * 1024)).toFixed(1)} MB`;

    const lastSnap = snapshots[0] || null;

    // ── Load on mount
    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setLoadError('');
            try {
                const res  = await dbFetch('/.netlify/functions/backup');
                const data = await res.json();
                if (cancelled) return;
                setSnapshots(data.snapshots || []);
                if (data.schedule) {
                    setSchedule(data.schedule);
                    setEditSched(data.schedule);
                }
            } catch (e) {
                if (!cancelled) setLoadError('Failed to load backup data. Please refresh.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // ── Format helpers (client-side display)
    const fmtWhen = (isoString) => {
        if (!isoString) return '—';
        const d   = new Date(isoString);
        const now = new Date();
        const diffMs  = now - d;
        const diffMin = Math.round(diffMs / 60000);
        const diffH   = Math.round(diffMs / 3600000);
        const diffD   = Math.round(diffMs / 86400000);
        if (diffMin < 2)  return 'just now';
        if (diffMin < 60) return `${diffMin} minutes ago`;
        if (diffH < 24)   return `${diffH} hour${diffH===1?'':'s'} ago`;
        if (diffD === 1)  return 'yesterday, ' + d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', timeZone:'UTC' });
        if (diffD < 7)    return `${diffD} days ago`;
        if (diffD < 14)   return '1 week ago';
        return d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
    };

    // ── Run backup now
    const handleRunBackup = async () => {
        if (runningBackup) return;
        setRunningBackup(true);
        setBackupError('');
        setBackupSuccess('');
        try {
            // POST creates the snapshot row and returns metadata (no payload inline
            // to stay within Netlify's 6MB response limit)
            const res  = await dbFetch('/.netlify/functions/backup', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Backup failed');

            // Prepend new snapshot to list immediately
            setSnapshots(prev => [{
                id:            data.id,
                createdAt:     data.createdAt,
                type:          'manual',
                recordCount:   data.recordCount,
                sizeBytes:     data.sizeBytes,
                sizeLabel:     data.sizeLabel,
                durationMs:    data.durationMs,
                durationLabel: data.durationLabel,
                status:        'ready',
            }, ...prev]);

            setBackupSuccess(`Backup complete · ${data.recordCount?.toLocaleString() || '—'} records · ${data.sizeLabel || '—'} · ${data.id}`);

            // Fetch the export as raw text — must use res.text() so the JSON string
            // reaches the Blob constructor untouched (dbFetch returns a raw Response).
            try {
                const dlRes  = await dbFetch(
                    `/.netlify/functions/backup?id=${encodeURIComponent(data.id)}&download=1`
                );
                const text = await dlRes.text();
                const blob = new Blob([text], { type: 'application/json' });
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement('a');
                a.href     = url;
                a.download = `${data.id}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch {
                // Download failed but backup succeeded — user can download from the table
            }
        } catch (e) {
            setBackupError(e.message || 'Backup failed. Please try again.');
        } finally {
            setRunningBackup(false);
        }
    };

    // ── Save schedule
    const handleSaveSchedule = async () => {
        if (schedSaving) return;
        setSchedSaving(true);
        setSchedError('');
        setSchedSaved(false);
        try {
            const res  = await dbFetch('/.netlify/functions/backup', {
                method: 'PUT',
                body: JSON.stringify(editSched),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Save failed');
            setSchedule(editSched);
            setSchedDirty(false);
            setSchedSaved(true);
            setTimeout(() => setSchedSaved(false), 3000);
        } catch (e) {
            setSchedError(e.message || 'Failed to save schedule.');
        } finally {
            setSchedSaving(false);
        }
    };

    const updateSched = (field, value) => {
        setEditSched(() => ({ ...(editSched || schedule), [field]: value }));
        setSchedDirty(true);
        setSchedSaved(false);
    };

    const th = { padding:'9px 12px', fontSize:10, fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', color:T.inkMuted, fontFamily:T.sans, textAlign:'left' };
    const inpSt = { width:'100%', padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface, boxSizing:'border-box' };
    const selSt = { ...inpSt, cursor:'pointer', appearance:'none',
        backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%238a8378' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat:'no-repeat', backgroundPosition:'right 10px center', paddingRight:28 };

    const curSched = editSched || schedule;

    return (
        <div style={{ fontFamily:T.sans }}>
            {restoreSnap && <RestoreModal snap={restoreSnap} onClose={()=>setRestoreSnap(null)}/>}
            {showImport  && <ImportBackupModal onClose={()=>setShowImport(false)} onSuccess={() => { setShowImport(false); }}/>}

            <DataCrumb page="Backup & restore" onBack={onBack}/>
            <DataTitle
                title="Backup & restore"
                sub="Automated daily snapshots and point-in-time restore"
                badge={lastSnap ? `Daily · last: ${fmtWhen(lastSnap.createdAt)} · ${lastSnap.sizeLabel || '—'}` : undefined}
                updatedBy="System"
                updatedAt={lastSnap ? fmtWhen(lastSnap.createdAt) : '—'}
                actions={[
                    <DataBtn key="imp"
                        label="Import from file"
                        onClick={() => setShowImport(true)}/>,
                    <DataBtn key="res"
                        label="Restore from backup"
                        disabled={!lastSnap}
                        onClick={() => lastSnap && setRestoreSnap(lastSnap)}/>,
                    <DataBtn key="run"
                        label={runningBackup ? 'Running…' : 'Run backup now'}
                        primary
                        disabled={runningBackup}
                        onClick={handleRunBackup}/>,
                ]}/>

            {/* Feedback banners */}
            {backupSuccess && (
                <div style={{ padding:'10px 16px', background:'rgba(77,107,61,0.10)', borderLeft:`3px solid ${T.ok}`, borderRadius:4, marginBottom:16, fontSize:12.5, color:T.ok, fontWeight:600 }}>
                    ✓ {backupSuccess}
                </div>
            )}
            {backupError && (
                <div style={{ padding:'10px 16px', background:'rgba(156,58,46,0.08)', borderLeft:`3px solid ${T.danger}`, borderRadius:4, marginBottom:16, fontSize:12.5, color:T.danger, fontWeight:600 }}>
                    ✕ {backupError}
                </div>
            )}
            {loadError && (
                <div style={{ padding:'10px 16px', background:'rgba(156,58,46,0.08)', borderLeft:`3px solid ${T.danger}`, borderRadius:4, marginBottom:16, fontSize:12.5, color:T.danger }}>
                    {loadError}
                </div>
            )}

            {/* KPI stat cards */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12, marginBottom:16 }}>
                <DataStatCard label="Last backup"
                    value={loading ? '…' : lastSnap ? fmtWhen(lastSnap.createdAt) : 'Never'} mono/>
                <DataStatCard label="Backups stored"
                    value={loading ? '…' : snapshots.length}/>
                <DataStatCard label="Total size"
                    value={loading ? '…' : totalSizeLabel}/>
                <DataStatCard label="Retention"
                    value={`${schedule.retentionDays} days`}/>
            </div>

            {/* Schedule form */}
            <DataCard title="Schedule"
                desc="Backups are automated; you can also run a snapshot at any time."
                headAction={
                    schedDirty ? (
                        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                            {schedSaved && <span style={{ fontSize:12, color:T.ok, fontWeight:600 }}>✓ Saved</span>}
                            {schedError && <span style={{ fontSize:12, color:T.danger, fontWeight:600 }}>{schedError}</span>}
                            <DataBtn label="Cancel" onClick={() => { setEditSched(schedule); setSchedDirty(false); setSchedError(''); }}/>
                            <DataBtn label={schedSaving ? 'Saving…' : 'Save schedule'} primary disabled={schedSaving} onClick={handleSaveSchedule}/>
                        </div>
                    ) : schedSaved ? (
                        <span style={{ fontSize:12, color:T.ok, fontWeight:600 }}>✓ Saved</span>
                    ) : null
                }>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:16 }}>
                    {/* Frequency */}
                    <div>
                        <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5 }}>Frequency</label>
                        <select value={curSched.frequency || 'Daily'} onChange={e => updateSched('frequency', e.target.value)} style={selSt}>
                            <option>Daily</option>
                            <option>Weekly</option>
                            <option>Every 12 hours</option>
                        </select>
                    </div>
                    {/* Time of day */}
                    <div>
                        <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5 }}>Time of day (UTC)</label>
                        <input type="text" value={curSched.timeUtc || '03:00'} onChange={e => updateSched('timeUtc', e.target.value)}
                            placeholder="03:00" style={{ ...inpSt, fontFamily:'ui-monospace,Menlo,monospace' }}/>
                    </div>
                    {/* Retention */}
                    <div>
                        <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5 }}>Retention</label>
                        <select value={String(curSched.retentionDays || 30)} onChange={e => updateSched('retentionDays', Number(e.target.value))} style={selSt}>
                            <option value="7">7 days</option>
                            <option value="14">14 days</option>
                            <option value="30">30 days</option>
                            <option value="60">60 days</option>
                            <option value="90">90 days</option>
                        </select>
                    </div>
                    {/* Region — read-only (infra-level) */}
                    <div>
                        <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5 }}>Region</label>
                        <input readOnly value="us-east-1 (primary) · eu-west-1 (replica)"
                            style={{ ...inpSt, color:T.inkMuted, cursor:'default' }}/>
                    </div>
                    {/* Encryption — read-only */}
                    <div>
                        <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5 }}>Encryption</label>
                        <input readOnly value="AES-256 · workspace key"
                            style={{ ...inpSt, color:T.inkMuted, cursor:'default' }}/>
                    </div>
                    {/* Notify on failure */}
                    <div>
                        <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5 }}>Notify on failure</label>
                        <input type="text" value={curSched.notifyOnFailure || ''} onChange={e => updateSched('notifyOnFailure', e.target.value)}
                            placeholder="email or Slack handle" style={inpSt}/>
                    </div>
                </div>
            </DataCard>

            {/* Snapshots table */}
            <DataCard title="Recent snapshots"
                desc="Each snapshot is a complete point-in-time copy of all CRM data and settings."
                headAction={<span style={{ fontSize:11.5, color:T.inkMuted, fontStyle:'italic' }}>Storage: Neon PostgreSQL</span>}>
                {loading ? (
                    <div style={{ padding:'2rem', textAlign:'center', color:T.inkMuted, fontSize:13 }}>Loading snapshots…</div>
                ) : snapshots.length === 0 ? (
                    <div style={{ padding:'2rem', textAlign:'center', color:T.inkMuted, fontSize:13 }}>
                        No backups yet. Click <b>Run backup now</b> to create your first snapshot.
                    </div>
                ) : (
                    <div style={{ overflowX:'auto' }}>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5, fontFamily:T.sans, minWidth:700 }}>
                            <thead>
                                <tr style={{ background:T.surface2 }}>
                                    {['Snapshot ID','When','Type','Size','Records','Duration','Status',''].map((h,i) =>
                                        <th key={i} style={th}>{h}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {snapshots.map((s, i) => (
                                    <tr key={s.id} style={{ borderBottom: i < snapshots.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                                        <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5 }}>{s.id}</td>
                                        <td style={{ padding:'10px 12px', color:T.inkMid }}>{fmtWhen(s.createdAt)}</td>
                                        <td style={{ padding:'10px 12px' }}>
                                            <DPill tone={s.type === 'manual' ? 'info' : 'neutral'}>
                                                {s.type === 'manual' ? 'Manual' : 'Automated'}
                                            </DPill>
                                        </td>
                                        <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5 }}>
                                            {s.sizeLabel || '—'}
                                        </td>
                                        <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5 }}>
                                            {s.recordCount != null ? s.recordCount.toLocaleString() : '—'}
                                        </td>
                                        <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11 }}>
                                            {s.durationLabel || '—'}
                                        </td>
                                        <td style={{ padding:'10px 12px' }}>
                                            <DPill tone={s.status === 'ready' ? 'ok' : s.status === 'running' ? 'info' : 'danger'}>
                                                {s.status === 'ready' ? 'Ready' : s.status === 'running' ? 'Running…' : 'Failed'}
                                            </DPill>
                                        </td>
                                        <td style={{ padding:'10px 12px', textAlign:'right' }}>
                                            <span style={{ display:'flex', gap:12, justifyContent:'flex-end' }}>
                                                <button onClick={() => setRestoreSnap(s)}
                                                    style={{ fontSize:11, color:T.info, background:'none', border:'none', cursor:'pointer', fontWeight:600, fontFamily:T.sans }}>
                                                    Restore
                                                </button>
                                                <button onClick={async () => {
                                                    try {
                                                        const dlRes = await dbFetch(`/.netlify/functions/backup?id=${encodeURIComponent(s.id)}&download=1`);
                                                        const text  = await dlRes.text();
                                                        const blob  = new Blob([text], { type:'application/json' });
                                                        const url   = URL.createObjectURL(blob);
                                                        const a     = document.createElement('a');
                                                        a.href = url; a.download = `${s.id}.json`;
                                                        document.body.appendChild(a); a.click();
                                                        document.body.removeChild(a);
                                                        URL.revokeObjectURL(url);
                                                    } catch { /* silent */ }
                                                }} style={{ fontSize:11, color:T.inkMid, background:'none', border:'none', cursor:'pointer', fontWeight:600, fontFamily:T.sans }}>
                                                    Download
                                                </button>
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </DataCard>
        </div>
    );
};
