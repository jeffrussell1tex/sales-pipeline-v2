// settings/data/ExportDetail.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useLocalLayer } from '../../../hooks/useLocalLayer';
import { dbFetch, dbWrite, requestOrg, stillOrg } from '../../../utils/storage';
import { readRefusal, failureWords, refusalWords, heardRefusal, landedBefore, maybeSaid, writeRefusalOf, refusalError, unknownOf } from '../../../utils/refusalWords.js';
import { T } from '../shared/tokens.js';
import { DataCard, DPill, DataCrumb, DataTitle, DataBtn, DataModal, DataModalHead, DataModalFoot } from './shared.jsx';

// A create an earlier press landed (state §0.264, the unknown-save rule, Part 5 — a 409 `code: 'idInUse'`, this org's):
// its row as stored, read again from its list by id — null when the list could not be read or does not hold it.
const storedRowOf = async (url, listKey, id) => {
    try {
        const res = await dbFetch(url);
        if (!res.ok) return null;
        const data = await res.json().catch(() => null);
        return (Array.isArray(data?.[listKey]) && data[listKey].find(r => r && r.id === id)) || null;
    } catch { return null; }
};

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
    // The name is an uncontrolled field; what it holds now, for the close's question (state §0.232).
    const [nameNow, setNameNow] = React.useState(existing?.name || '');
    // A refused or unsent save, said here above the buttons and kept while the window is open (§0.245 4b, Q8).
    const [saveError, setSaveError] = React.useState('');
    const [opened] = React.useState(() => JSON.stringify([existing?.name || '', existing?.scope || 'accounts', existing?.format || 'CSV', existing?.cadence || 'Weekly · Mondays 06:00 UTC', existing?.destination || 'download']));
    const requestClose = useLocalLayer(true, { onClose, dirty: JSON.stringify([nameNow, scope, fmt, cadence, dest]) !== opened, busy: saving });
    // A new schedule's id, one for this opening of the window (state §0.264, the unknown-save rule, Part 5): every press
    // sends it, so a press after an answer that proved nothing is answered "already in use" if the first landed.
    const [newId] = React.useState(() => 'sch_' + crypto.randomUUID());

    const handleSave = async () => {
        const name = nameRef.current?.value?.trim();
        if (!name) return;
        setSaveError('');
        setSaving(true);
        const why = await onSave({ id: existing?.id || null, name, scope, format:fmt, cadence, destination:dest, enabled:true, status:'ok' }, newId);
        setSaving(false);
        if (why) setSaveError(why);
    };

    return (
        <DataModal onClose={requestClose}>
            <DataModalHead title={existing ? 'Edit scheduled export' : 'New scheduled export'} sub="Define a recurring export. Manual trigger available immediately." onClose={requestClose}/>
            <div style={{ flex:1, overflowY:'auto', padding:22 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                    <FL label="Name"><input ref={nameRef} defaultValue={existing?.name || ''} onChange={e => setNameNow(e.target.value)} placeholder="e.g. Weekly accounts" style={inpStyle}/></FL>
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
            {saveError && <div role="alert" style={{ flexShrink:0, padding:'10px 22px', background:'rgba(156,58,46,0.08)', borderTop:`1px solid ${T.border}`, fontSize:12.5, color:T.danger, fontWeight:600 }}>✕ {saveError}</div>}
            <DataModalFoot>
                <DataBtn label="Cancel" onClick={requestClose}/>
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
    // A refused Pause / Enable or Mark complete (§0.243's second fix round), or Delete (§0.245 4a): what was not done and
    // why, kept until closed (§18b123 rule 4) — the row went back and nothing said why.
    const [actionError,  setActionError]  = React.useState('');
    // The schedule the banner speaks of (§0.247 review fix): a landed retry or Delete clears the banner only when it is
    // about THAT schedule, by id — names are not unique, so two schedules named alike never clear each other's words. A
    // Mark complete's words and the banner's Close leave it null.
    const errorSched = React.useRef(null);
    // One request per schedule at a time (§0.247 review fix): a Pause / Enable or Delete pressed while its schedule's
    // request is out sends nothing, so a put-back never undoes a later press. The ref is the synchronous guard; busyIds
    // draws it — the row's Pause / Enable and Delete wait, titled "Saving…", while its request is out.
    const busyScheds = React.useRef(new Set());
    const [busyIds, setBusyIds] = React.useState([]);

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
                // The ok checks first (§0.243): a refusal says which list and the server's words, else its status — the
                // bodies read before them said "Unexpected token '<'" for a page that was not JSON.
                if (!schRes.ok)  throw new Error(`Failed to load schedules: ${await readRefusal(schRes)}`);
                if (!runRes.ok)  throw new Error(`Failed to load runs: ${await readRefusal(runRes)}`);
                if (!dsrRes.ok)  throw new Error(`Failed to load DSR queue: ${await readRefusal(dsrRes)}`);
                const [schData, runData, dsrData] = await Promise.all([
                    schRes.json(), runRes.json(), dsrRes.json(),
                ]);
                setSchedules(schData.schedules || []);
                setRuns(runData.runs || []);
                setDsrItems(dsrData.dsrQueue || []);
            } catch (e) {
                // Plain words (§0.247, docs/design/refusal-sweep Part 8): a refusal's as thrown above, never "Failed to
                // fetch" or a parse error's "Unexpected token '<'".
                if (!cancelled) setError(failureWords(e));
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
        if (busyScheds.current.has(sched.id)) return;
        busyScheds.current.add(sched.id);
        setBusyIds([...busyScheds.current]);
        setSchedules(prev => prev.map(s => s.id === sched.id ? { ...s, enabled: !sched.enabled } : s));
        try {
            // The flag alone (§0.247 review fix): the PUT merges what a save names over the stored row (export-schedules.mjs,
            // §0.242). The whole screen copy it sent wrote back over an Edit saved while the toggle was out.
            const res  = await dbFetch('/.netlify/functions/export-schedules', { method:'PUT', body: JSON.stringify({ id: sched.id, enabled: !sched.enabled }) });
            // The server's words, else its status (§0.243); whether they are its own refusal (state §0.264, Part 5).
            if (!res.ok) { const r = await writeRefusalOf(res); throw refusalError(r.words, r.heard); }
            // Landed is landed (§0.247 review fix): a 200 whose body is not JSON keeps the change and says nothing.
            const data = await res.json().catch(() => null);
            // The row as it is now, never the press's copy: an Edit saved while the toggle was out stands.
            setSchedules(prev => prev.map(s => s.id === sched.id ? ((data && data.schedule) || { ...s, enabled: !sched.enabled }) : s));
            // A banner about this schedule is no longer true once its retry lands (the re-check, 10 Nov); one about
            // another row stands until closed — by id, never by name (§0.247 review fix).
            if (errorSched.current === sched.id) { errorSched.current = null; setActionError(''); }
        } catch (e) {
            // Only the flag goes back, on the row as it is now (§0.247 review fix) — an Edit saved meanwhile survives —
            // and only on the server's own refusal: an answer that proves nothing keeps it, said as maybe (state §0.264,
            // the unknown-save rule, Part 5).
            const unknown = unknownOf(e);
            if (!unknown) setSchedules(prev => prev.map(s => s.id === sched.id ? { ...s, enabled: sched.enabled } : s));
            errorSched.current = sched.id;
            setActionError(unknown ? maybeSaid(`"${sched.name}"`, sched.enabled ? 'paused' : 'enabled', failureWords(e))
                : `"${sched.name}" was not ${sched.enabled ? 'paused' : 'enabled'} — ${failureWords(e)}`);
        } finally { busyScheds.current.delete(sched.id); setBusyIds([...busyScheds.current]); }
    };

    // ── delete schedule ───────────────────────────────────────
    const handleDeleteSched = async (sched) => {
        // Optimistic removal, put back if the delete does not land (dbWrite never throws: a refusal in its words, a
        // request that never left in NETWORK_ERROR's). Said on the panel's banner, kept until closed (§0.245,
        // docs/design/refusal-sweep 4a) — never the load's `error`, which replaced the whole page with a red box. Only
        // its own row is put back, where it stood: a Pause or a new schedule that landed meanwhile stands. One request per
        // schedule at a time, with its Pause / Enable (§0.247 review fix).
        if (busyScheds.current.has(sched.id)) return;
        busyScheds.current.add(sched.id);
        setBusyIds([...busyScheds.current]);
        const at = Math.max(0, schedules.findIndex(s => s.id === sched.id));
        setSchedules(prev => prev.filter(s => s.id !== sched.id));
        try {
            const r = await dbWrite(`/.netlify/functions/export-schedules?id=${encodeURIComponent(sched.id)}`, { method:'DELETE' });
            // A banner about this schedule goes once it is deleted — by id, never by name (§0.247 review fix).
            if (r.ok) { if (errorSched.current === sched.id) { errorSched.current = null; setActionError(''); } return; }
            // An answer that proves nothing keeps it off the list, said as maybe (state §0.264, the unknown-save rule, Part 5).
            if (r.unknown) { errorSched.current = sched.id; setActionError(maybeSaid(`"${sched.name}"`, 'deleted', r.error)); return; }
            setSchedules(prev => (prev.some(s => s.id === sched.id) ? prev : [...prev.slice(0, at), sched, ...prev.slice(at)]));
            errorSched.current = sched.id;
            setActionError(`"${sched.name}" was not deleted — ${r.error}`);
        } finally { busyScheds.current.delete(sched.id); setBusyIds([...busyScheds.current]); }
    };

    // ── save a schedule / a GDPR request (the two windows' onSave) ──
    // Each answers '' when it landed (the window closed) or the words why not, which its window draws above its buttons
    // and keeps open (§0.245, docs/design/refusal-sweep 4b, Q8) — never window.alert, which said "Save failed: Failed to
    // fetch" over whatever screen was open by then.
    // Since §0.264 (the unknown-save rule, Part 5): only the server's own refusal is "not saved"; any other answer — a
    // thrown fetch, a 5xx, a page — may have saved it, said so with the window open as typed. A new one sends its window's
    // id (one per opening), so a press after one that landed is answered "already in use" for this org (409 `code:
    // 'idInUse'`): the row read again from the list and the window closed as saved. A landed answer that cannot be read is
    // saved.
    const saveSchedule = async (payload, newId) => {
        const isEdit = !!payload.id && schedules.find(s => s.id === payload.id);
        const method = isEdit ? 'PUT' : 'POST';
        if (!isEdit) payload.id = newId || ('sch_' + crypto.randomUUID());
        let res;
        try { res = await dbFetch('/.netlify/functions/export-schedules', { method, body: JSON.stringify(payload) }); }
        catch (e) { return maybeSaid('The schedule', 'saved', failureWords(e)); }
        if (!res.ok) {
            const refused = await res.json().catch(() => null);
            if (!isEdit && landedBefore(res.status, refused)) {
                const stored = await storedRowOf('/.netlify/functions/export-schedules', 'schedules', payload.id);
                if (!stored) return 'The schedule was saved by an earlier press, but it could not be read again — reload the page to see it.';
                setSchedules(prev => (prev.some(s => s.id === stored.id) ? prev.map(s => (s.id === stored.id ? stored : s)) : [stored, ...prev]));
                setShowModal(false); setEditingSched(null);
                return '';
            }
            return heardRefusal(res.status, refused) ? `The schedule was not saved — ${refusalWords(res, refused)}` : maybeSaid('The schedule', 'saved', refusalWords(res, refused));
        }
        const data = await res.json().catch(() => null);
        if (isEdit) setSchedules(prev => prev.map(s => s.id === payload.id ? (data?.schedule || { ...s, ...payload }) : s));
        else        setSchedules(prev => [data?.schedule || payload, ...prev]);
        setShowModal(false); setEditingSched(null);
        return '';
    };
    const saveDsr = async (payload) => {
        if (!payload.id) payload.id = 'dsr_' + crypto.randomUUID();   // the window sends its own, one per opening (state §0.264)
        let res;
        try { res = await dbFetch('/.netlify/functions/export-dsr', { method:'POST', body: JSON.stringify(payload) }); }
        catch (e) { return maybeSaid('The request', 'saved', failureWords(e)); }
        let row = null;
        if (!res.ok) {
            const refused = await res.json().catch(() => null);
            if (!landedBefore(res.status, refused)) {
                return heardRefusal(res.status, refused) ? `The request was not saved — ${refusalWords(res, refused)}` : maybeSaid('The request', 'saved', refusalWords(res, refused));
            }
        } else row = (await res.json().catch(() => null))?.dsr || null;
        // An earlier press landed, or this one did with an answer that cannot be read: the request as stored, read again.
        if (!row) row = await storedRowOf('/.netlify/functions/export-dsr', 'dsrQueue', payload.id);
        if (!row) return 'The request was saved, but it could not be read again — reload the page to see it.';
        setDsrItems(prev => (prev.some(d => d.id === row.id) ? prev : [row, ...prev]));
        setShowDsrModal(false);
        return '';
    };

    // ── ad-hoc export ─────────────────────────────────────────
    // A run keeps its id once an answer proved nothing (state §0.264, the unknown-save rule, Part 5; ReportsTab's
    // heldReportIds): the same export pressed again — its body as sent but for the id — sends that id, and the server's
    // "already in use" for this org (409 `code: 'idInUse'`) is the earlier press landed: the runs read again, and said that
    // its file was not downloaded here. Another body, a landed answer or the server's own refusal gives the id up.
    const heldRunIds = React.useRef({});
    const handleAdHoc = async () => {
        // After an org switch its answer saves no file and says nothing (state §0.175; §0.247 Part 8): the old org's
        // export was saved to disk on the new org's screen.
        const askedOrg = requestOrg();
        setAdhocLoading(true);
        setAdhocError(null);
        const body = { scope: adHocScope, format: adHocFmt };
        const key  = JSON.stringify(body);
        const held = heldRunIds.current[key];
        const id   = held || ('run_' + crypto.randomUUID());
        try {
            let res;
            try {
                res = await dbFetch('/.netlify/functions/export-runs', {
                    method: 'POST',
                    body: JSON.stringify({ id, ...body }),
                });
            } catch (e) {
                heldRunIds.current[key] = id;
                if (stillOrg(askedOrg)) setAdhocError(maybeSaid('The export', 'run', failureWords(e)));
                return;
            }
            if (!res.ok) {   // the ok check first (§0.243): its words, else its status
                const refused = await res.json().catch(() => null);
                if (held && landedBefore(res.status, refused)) {
                    delete heldRunIds.current[key];
                    const runRes = await dbFetch('/.netlify/functions/export-runs').catch(() => null);
                    const runData = runRes && runRes.ok ? await runRes.json().catch(() => null) : null;
                    if (!stillOrg(askedOrg)) return;
                    if (Array.isArray(runData?.runs)) setRuns(runData.runs);
                    setAdhocError('The export was already run by an earlier press, but its file was not downloaded here — press Download now for a new one.');
                    return;
                }
                if (heardRefusal(res.status, refused)) delete heldRunIds.current[key];
                else heldRunIds.current[key] = id;
                if (stillOrg(askedOrg)) setAdhocError(heardRefusal(res.status, refused) ? refusalWords(res, refused) : maybeSaid('The export', 'run', refusalWords(res, refused)));
                return;
            }
            delete heldRunIds.current[key];
            // Landed is landed (state §0.264): an answer that cannot be read is a run made whose file never came.
            const data = await res.json().catch(() => null);
            if (!stillOrg(askedOrg)) return;
            if (!data || !data.download) { setAdhocError('The export ran, but its file could not be read — press Download now for a new one.'); return; }

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
            // Only after the run landed (its answer read above): its file could not be made here (state §0.264, Part 5).
            if (stillOrg(askedOrg)) setAdhocError(`The export ran, but its file could not be saved — ${failureWords(e)}`);
        } finally {
            setAdhocLoading(false);
        }
    };

    // ── update DSR status ─────────────────────────────────────
    const handleDsrStatus = async (dsr, newStatus) => {
        // The status alone on the row as it now stands (state §0.266): never the row as it was pressed over a later change.
        setDsrItems(prev => prev.map(d => d.id === dsr.id ? { ...d, status: newStatus } : d));
        try {
            // The change alone (state §0.266): the PUT merges what it names over the stored request (export-dsr.mjs, §0.242),
            // so the row as this screen last read it is never written back.
            const res  = await dbFetch('/.netlify/functions/export-dsr', { method:'PUT', body: JSON.stringify({ id: dsr.id, status: newStatus }) });
            // Whether the refusal is the server's own (state §0.264, the unknown-save rule, Part 5).
            if (!res.ok) { const r = await writeRefusalOf(res); throw refusalError(r.words, r.heard); }
            const data = await res.json().catch(() => null);   // landed is landed (state §0.264): kept as sent
            setDsrItems(prev => prev.map(d => d.id === dsr.id ? ((data && data.dsr) || { ...d, status: newStatus }) : d));
            setActionError(prev => (prev.startsWith(`Request ${dsr.id} was not `) || prev.startsWith(`Request ${dsr.id} may have been `) ? '' : prev));
        } catch (e) {
            // Put back only on the server's own refusal; an answer that proves nothing keeps the change, said as maybe
            // (state §0.264, the unknown-save rule, Part 5).
            const unknown = unknownOf(e);
            const done = newStatus === 'completed' ? 'marked complete' : 'updated';
            // Put back only what this press changed, its status, and only while the row still shows it (state §0.266, guide
            // §18b134 rule 6): never the whole row as it was pressed over a later change.
            if (!unknown) setDsrItems(prev => prev.map(d => d.id === dsr.id && d.status === newStatus ? { ...d, status: dsr.status } : d));
            errorSched.current = null;   // these words speak of a request, no schedule (§0.247 review fix)
            setActionError(unknown ? maybeSaid(`Request ${dsr.id}`, done, failureWords(e)) : `Request ${dsr.id} was not ${done} — ${failureWords(e)}`);
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
            <div style={{ padding:'12px 16px', background:'rgba(156,58,46,0.08)', borderLeft:`3px solid ${T.danger}`, borderRadius:4, fontSize:13, color:T.danger }}>⚠ Export couldn't be opened ({String(error).replace(/[.\s]+$/, '')}). Reload the page to try again.</div>
        </div>
    );

    return (
        <div style={{ fontFamily:T.sans }}>
            {showModal    && <NewExportModal onClose={() => { setShowModal(false); setEditingSched(null); }} existing={editingSched} onSave={saveSchedule}/>}
            {showDsrModal && <NewDsrModal onClose={() => setShowDsrModal(false)} onSave={saveDsr}/>}

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

            {/* A refused Pause / Enable, Mark complete (§0.243) or Delete (§0.245): kept until closed, never on a timer. */}
            {actionError && (
                <div role="alert" style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'10px 16px', background:'rgba(156,58,46,0.08)', borderLeft:`3px solid ${T.danger}`, borderRadius:4, marginBottom:16, fontSize:12.5, color:T.danger, fontWeight:600 }}>
                    <span style={{ flex:1, minWidth:0 }}>✕ {actionError}</span>
                    <button onClick={() => { errorSched.current = null; setActionError(''); }}
                        style={{ fontSize:11, color:T.inkMid, background:'none', border:'none', cursor:'pointer', fontWeight:600, fontFamily:T.sans, padding:0 }}>
                        Close
                    </button>
                </div>
            )}

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
                                    const isBusy = busyIds.includes(s.id);   // its Pause / Enable or Delete is out (§0.247 review fix)
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
                                                    <span onClick={() => handleToggle(s)} style={{ fontSize:11, color:T.info, cursor:isBusy?'not-allowed':'pointer', opacity:isBusy?0.5:1, fontWeight:600 }} aria-disabled={isBusy} title={isBusy ? 'Saving…' : undefined}>
                                                        {s.enabled ? 'Pause' : 'Enable'}
                                                    </span>
                                                    <span onClick={() => { setEditingSched(s); setShowModal(true); }} style={{ fontSize:11, color:T.info, cursor:'pointer', fontWeight:600 }}>Edit</span>
                                                    <span onClick={() => handleDeleteSched(s)} style={{ fontSize:11, color:T.danger, cursor:isBusy?'not-allowed':'pointer', opacity:isBusy?0.5:1, fontWeight:600 }} aria-disabled={isBusy} title={isBusy ? 'Saving…' : undefined}>Delete</span>
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
    // A refused or unsent save, said here above the buttons and kept while the window is open (§0.245 4b, Q8).
    const [saveError, setSaveError] = React.useState('');
    const requestClose = useLocalLayer(true, { onClose, dirty: !!(subject.trim() || notes.trim()) || type !== 'access', busy: saving });
    // The request's id, one for this opening of the window (state §0.264, the unknown-save rule, Part 5): a press after an
    // answer that proved nothing sends it again, never a second request.
    const [newId] = React.useState(() => 'dsr_' + crypto.randomUUID());
    const inpStyle = { width:'100%', padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface, boxSizing:'border-box' };
    const handleSave = async () => {
        if (!subject.trim()) return;
        setSaveError('');
        setSaving(true);
        const why = await onSave({ id: newId, subject: subject.trim(), type, notes: notes.trim() || null });
        setSaving(false);
        if (why) setSaveError(why);
    };
    return (
        <DataModal onClose={requestClose}>
            <DataModalHead title="New DSR request" sub="Log a GDPR Data Subject Request. 30-day SLA starts today." onClose={requestClose}/>
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
            {saveError && <div role="alert" style={{ flexShrink:0, padding:'10px 22px', background:'rgba(156,58,46,0.08)', borderTop:`1px solid ${T.border}`, fontSize:12.5, color:T.danger, fontWeight:600 }}>✕ {saveError}</div>}
            <DataModalFoot>
                <DataBtn label="Cancel" onClick={requestClose}/>
                <DataBtn label={saving ? 'Saving…' : 'Create request'} primary disabled={!subject.trim() || saving} onClick={handleSave}/>
            </DataModalFoot>
        </DataModal>
    );
};
