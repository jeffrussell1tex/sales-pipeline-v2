// settings/dispatch/DispatchVehiclesDetail.jsx
//
// Vehicles and equipment are DB records, not configuration. This panel is backed
// by the dispatch_vehicles and dispatch_equipment TABLES.
//
// It previously edited settings.dispatchVehicles / settings.dispatchEquipment —
// two blobs that nothing operational read. The dispatch board's vehicle filter
// and the technician "Assigned vehicle" dropdown both read the table, so a van
// added here never appeared where a dispatcher would look for it.
//
// Two consequences of the move, both deliberate:
//   • There is no "Save changes" button. Each record is written on its own save,
//     because a whole-blob PUT clobbers concurrent edits, and equipment state
//     changes when a tech checks something out.
//   • One equipment ROW is one physical unit. "2 pressure testers" is two rows
//     sharing a category, not a qty field. That is what lets one unit be out for
//     calibration while the other stays available — a quantity cannot express it.
//     Job and template requirements therefore point at a CATEGORY.
//
// The old blob keys are left in place, untouched. Nothing reads them for
// decisions any more, but deleting live data to tidy up is not worth the risk.
import React, { useState, useEffect, useCallback } from 'react';
import { dbFetch } from '../../../utils/storage';
import { T } from '../shared/tokens.js';
import { CSectionCard } from '../shared/form.jsx';
import { SPTable } from '../salesProcess/shared.jsx';
import { CategoryDetailChrome } from '../shared/CategoryDetailChrome.jsx';

const VEHICLE_TYPES  = ['van', 'truck', 'car', 'trailer', 'other'];
const VEHICLE_STATUS = ['available', 'in_use', 'maintenance', 'out_of_service'];
const EQUIP_STATUS   = ['available', 'checked_out', 'maintenance', 'out_of_service'];

const labelise = (v) => String(v || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

const statusColor = (s) => ({
    available:      T.ok,
    in_use:         T.info,
    checked_out:    T.info,
    maintenance:    T.warn,
    out_of_service: T.danger,
}[s] || T.inkMuted);

const inputSt = {
    width: '100%', padding: '7px 10px', border: `1px solid ${T.borderStrong}`,
    borderRadius: T.r, fontSize: 13, fontFamily: T.sans, outline: 'none',
    boxSizing: 'border-box', background: T.surface,
};

const btnPrimary = {
    padding: '7px 14px', background: T.ink, color: '#fbf8f3', border: 'none',
    borderRadius: T.r, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans,
};

const btnGhost = {
    padding: '7px 14px', background: T.surface, border: `1px solid ${T.borderStrong}`,
    borderRadius: T.r, fontSize: 12.5, fontWeight: 600, color: T.inkMid, cursor: 'pointer', fontFamily: T.sans,
};

// Defined at module scope. A component declared inside the panel would be a new
// type on every render, remounting these inputs and losing focus per keystroke.
const FieldRow = ({ label, children, span }) => (
    <div style={span ? { gridColumn: '1 / -1' } : undefined}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase',
            letterSpacing: 0.6, marginBottom: 5, fontFamily: T.sans }}>{label}</div>
        {children}
    </div>
);

const StatusPill = ({ status }) => (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 3, fontWeight: 600,
        background: `${statusColor(status)}14`, color: statusColor(status), fontFamily: T.sans }}>
        {labelise(status)}
    </span>
);

const RowMenuButton = ({ onOpen }) => (
    <button onClick={onOpen} style={{ background: 'none', border: 'none', cursor: 'pointer',
        color: T.inkMuted, fontSize: 16, fontWeight: 700, padding: '0 2px', lineHeight: 1 }}>⋯</button>
);

const VehicleForm = ({ draft, set, techs, onSave, onDelete, onCancel, busy, error }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FieldRow label="Name *">
            <input value={draft.name || ''} onChange={e => set('name', e.target.value)}
                placeholder="e.g. Van 3 — HVAC" style={inputSt}/>
        </FieldRow>
        <FieldRow label="Type">
            <select value={draft.type || 'van'} onChange={e => set('type', e.target.value)} style={inputSt}>
                {VEHICLE_TYPES.map(t => <option key={t} value={t}>{labelise(t)}</option>)}
            </select>
        </FieldRow>
        <FieldRow label="Licence plate">
            <input value={draft.licensePlate || ''} onChange={e => set('licensePlate', e.target.value)} style={inputSt}/>
        </FieldRow>
        <FieldRow label="Status">
            <select value={draft.status || 'available'} onChange={e => set('status', e.target.value)} style={inputSt}>
                {VEHICLE_STATUS.map(s => <option key={s} value={s}>{labelise(s)}</option>)}
            </select>
        </FieldRow>
        <FieldRow label="Make">
            <input value={draft.make || ''} onChange={e => set('make', e.target.value)} style={inputSt}/>
        </FieldRow>
        <FieldRow label="Model">
            <input value={draft.model || ''} onChange={e => set('model', e.target.value)} style={inputSt}/>
        </FieldRow>
        <FieldRow label="Assigned technician">
            <select value={draft.assignedTechId || ''} onChange={e => set('assignedTechId', e.target.value || null)} style={inputSt}>
                <option value="">— Unassigned —</option>
                {(techs || []).map(t => (
                    <option key={t.id} value={t.id}>{`${t.firstName || ''} ${t.lastName || ''}`.trim() || t.id}</option>
                ))}
            </select>
        </FieldRow>
        <FieldRow label="Odometer (miles)">
            <input type="number" value={draft.odometer ?? ''}
                onChange={e => set('odometer', e.target.value)}
                onBlur={e => { const n = parseInt(e.target.value, 10); set('odometer', Number.isFinite(n) ? n : null); }}
                style={inputSt}/>
        </FieldRow>
        <FieldRow label="Notes" span>
            <textarea value={draft.notes || ''} onChange={e => set('notes', e.target.value)} rows={2}
                style={{ ...inputSt, resize: 'vertical' }}/>
        </FieldRow>
        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={onSave} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>
                {busy ? 'Saving…' : (draft._isNew ? 'Create vehicle' : 'Save vehicle')}
            </button>
            <button onClick={onCancel} style={btnGhost}>Cancel</button>
            {!draft._isNew && (
                <button onClick={onDelete} style={{ ...btnGhost, color: T.danger, marginLeft: 'auto' }}>Delete</button>
            )}
            {error && <span style={{ fontSize: 12, fontWeight: 600, color: T.danger, fontFamily: T.sans }}>{error}</span>}
        </div>
    </div>
);

const EquipmentForm = ({ draft, set, categories, techs, onSave, onDelete, onCancel, busy, error }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FieldRow label="Name *">
            <input value={draft.name || ''} onChange={e => set('name', e.target.value)}
                placeholder="e.g. Pressure Tester #1" style={inputSt}/>
        </FieldRow>
        <FieldRow label="Category *">
            {/* Requirements on jobs and templates point at the category, so this is
                the field that matters operationally. Free typing is allowed, but
                existing categories are offered first to stop near-duplicates
                ("Pressure Tester" vs "Pressure tester") splitting the pool. */}
            <input list="equip-categories" value={draft.category || ''}
                onChange={e => set('category', e.target.value)}
                placeholder="e.g. Pressure Tester" style={inputSt}/>
            <datalist id="equip-categories">
                {(categories || []).map(c => <option key={c} value={c}/>)}
            </datalist>
        </FieldRow>
        <FieldRow label="Serial number">
            <input value={draft.serialNumber || ''} onChange={e => set('serialNumber', e.target.value)} style={inputSt}/>
        </FieldRow>
        <FieldRow label="Asset tag">
            <input value={draft.assetTag || ''} onChange={e => set('assetTag', e.target.value)} style={inputSt}/>
        </FieldRow>
        <FieldRow label="Status">
            <select value={draft.status || 'available'} onChange={e => set('status', e.target.value)} style={inputSt}>
                {EQUIP_STATUS.map(s => <option key={s} value={s}>{labelise(s)}</option>)}
            </select>
        </FieldRow>
        <FieldRow label="Next calibration">
            <input type="date" value={draft.nextCalibrationDate || ''}
                onChange={e => set('nextCalibrationDate', e.target.value || null)} style={inputSt}/>
        </FieldRow>
        {draft.checkedOutToId && (
            <div style={{ gridColumn: '1 / -1', padding: '7px 10px', borderRadius: T.r,
                background: `${T.info}12`, borderLeft: `3px solid ${T.info}`, fontSize: 11.5, fontFamily: T.sans, color: T.ink }}>
                Checked out to {(techs || []).find(t => t.id === draft.checkedOutToId)
                    ? `${(techs || []).find(t => t.id === draft.checkedOutToId).firstName || ''} ${(techs || []).find(t => t.id === draft.checkedOutToId).lastName || ''}`.trim()
                    : 'an unknown technician'}.
            </div>
        )}
        <FieldRow label="Notes" span>
            <textarea value={draft.notes || ''} onChange={e => set('notes', e.target.value)} rows={2}
                style={{ ...inputSt, resize: 'vertical' }}/>
        </FieldRow>
        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={onSave} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>
                {busy ? 'Saving…' : (draft._isNew ? 'Create item' : 'Save item')}
            </button>
            <button onClick={onCancel} style={btnGhost}>Cancel</button>
            {!draft._isNew && (
                <button onClick={onDelete} style={{ ...btnGhost, color: T.danger, marginLeft: 'auto' }}>Delete</button>
            )}
            {error && <span style={{ fontSize: 12, fontWeight: 600, color: T.danger, fontFamily: T.sans }}>{error}</span>}
        </div>
    </div>
);

// Legacy blob → table rows. Ids are derived from the blob id so the import is
// idempotent: the POST upserts on id, so running it twice cannot duplicate.
const plannedVehicleImports = (blob) => (blob || [])
    .filter(v => (v.name || '').trim())
    .map(v => ({
        id:           'imp_' + v.id,
        name:         v.name.trim(),
        type:         String(v.type || v.kind || 'van').toLowerCase(),
        licensePlate: v.plate || v.licensePlate || null,
        notes:        v.notes || null,
    }));

const plannedEquipmentImports = (blob) => {
    const out = [];
    (blob || []).filter(e => (e.name || '').trim()).forEach(e => {
        const q = parseInt(e.qty, 10);
        const units = q > 0 ? q : 1;
        for (let i = 1; i <= units; i++) {
            out.push({
                id:       'imp_' + e.id + '_u' + i,
                name:     units > 1 ? `${e.name.trim()} #${i}` : e.name.trim(),
                category: e.name.trim(),
                notes:    e.notes || null,
            });
        }
    });
    return out;
};

export const DispatchVehiclesDetail = ({ settings, onBack, setSettingsDirty }) => {
    const [vehicles,  setVehicles]  = useState([]);
    const [equipment, setEquipment] = useState([]);
    const [techs,     setTechs]     = useState([]);
    const [loading,   setLoading]   = useState(true);
    const [loadError, setLoadError] = useState('');

    const [vDraft, setVDraft] = useState(null);
    const [eDraft, setEDraft] = useState(null);
    const [busy,   setBusy]   = useState(false);
    const [vError, setVError] = useState('');
    const [eError, setEError] = useState('');

    const [importing,    setImporting]    = useState(false);
    const [importResult, setImportResult] = useState('');

    const legacyVehicles  = settings?.dispatchVehicles  || [];
    const legacyEquipment = settings?.dispatchEquipment || [];

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError('');
        try {
            const [vRes, eRes, tRes] = await Promise.all([
                dbFetch('/.netlify/functions/dispatch-vehicles'),
                dbFetch('/.netlify/functions/dispatch-equipment'),
                dbFetch('/.netlify/functions/dispatch-technicians'),
            ]);
            // dbFetch returns a Response and does not throw on 4xx/5xx. Reading
            // `.vehicles` off an error body would fall through `|| []` and render
            // as an empty fleet — a failure indistinguishable from no data.
            const bad = [['vehicles', vRes], ['equipment', eRes], ['technicians', tRes]].filter(([, r]) => !r.ok);
            if (bad.length) throw new Error('Failed to load ' + bad.map(([n, r]) => `${n} (${r.status})`).join(', '));
            const [vJson, eJson, tJson] = await Promise.all([vRes.json(), eRes.json(), tRes.json()]);
            setVehicles(vJson.vehicles    || []);
            setEquipment(eJson.equipment  || []);
            setTechs(tJson.technicians    || []);
        } catch (err) {
            setLoadError(err.message || 'Failed to load fleet.');
        }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    // This panel writes each record on its own save, so it has no unsaved-changes
    // state. Clear the shared flag explicitly — inheriting a stale `true` from a
    // previously open panel would arm a navigation guard with nothing to save.
    useEffect(() => {
        if (setSettingsDirty) setSettingsDirty(false);
        return () => { if (setSettingsDirty) setSettingsDirty(false); };
    }, [setSettingsDirty]);

    const categories = [...new Set(equipment.map(e => (e.category || '').trim()).filter(Boolean))].sort();
    const techName = (id) => {
        const t = techs.find(x => x.id === id);
        return t ? `${t.firstName || ''} ${t.lastName || ''}`.trim() : null;
    };

    // ── Vehicle writes ───────────────────────────────────────────────────────
    const saveVehicle = async () => {
        if (!vDraft) return;
        if (!(vDraft.name || '').trim()) { setVError('Name is required.'); return; }
        setBusy(true); setVError('');
        try {
            const body = { ...vDraft, name: vDraft.name.trim() };
            delete body._isNew;
            const url = vDraft._isNew
                ? '/.netlify/functions/dispatch-vehicles'
                : '/.netlify/functions/dispatch-vehicles?id=' + encodeURIComponent(vDraft.id);
            const res = await dbFetch(url, {
                method: vDraft._isNew ? 'POST' : 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(res.status === 403 ? 'Your role cannot change vehicles.' : (data.error || 'HTTP ' + res.status));
            await load();
            setVDraft(null);
        } catch (err) {
            setVError(err.message);
        }
        setBusy(false);
    };

    const deleteVehicle = async () => {
        if (!vDraft || vDraft._isNew) return;
        if (vDraft.assignedTechId) { setVError('Unassign the technician before deleting this vehicle.'); return; }
        setBusy(true); setVError('');
        try {
            const res = await dbFetch('/.netlify/functions/dispatch-vehicles?id=' + encodeURIComponent(vDraft.id), { method: 'DELETE' });
            if (!res.ok) throw new Error(res.status === 403 ? 'Your role cannot delete vehicles.' : 'HTTP ' + res.status);
            await load();
            setVDraft(null);
        } catch (err) {
            setVError(err.message);
        }
        setBusy(false);
    };

    // ── Equipment writes ─────────────────────────────────────────────────────
    const saveEquipment = async () => {
        if (!eDraft) return;
        if (!(eDraft.name || '').trim())     { setEError('Name is required.'); return; }
        if (!(eDraft.category || '').trim()) { setEError('Category is required — job requirements point at it.'); return; }
        setBusy(true); setEError('');
        try {
            const body = { ...eDraft, name: eDraft.name.trim(), category: eDraft.category.trim() };
            delete body._isNew;
            const url = eDraft._isNew
                ? '/.netlify/functions/dispatch-equipment'
                : '/.netlify/functions/dispatch-equipment?id=' + encodeURIComponent(eDraft.id);
            const res = await dbFetch(url, {
                method: eDraft._isNew ? 'POST' : 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(res.status === 403 ? 'Your role cannot change equipment.' : (data.error || 'HTTP ' + res.status));
            await load();
            setEDraft(null);
        } catch (err) {
            setEError(err.message);
        }
        setBusy(false);
    };

    const deleteEquipment = async () => {
        if (!eDraft || eDraft._isNew) return;
        if (eDraft.checkedOutJobId || eDraft.checkedOutToId) { setEError('Check this item in before deleting it.'); return; }
        setBusy(true); setEError('');
        try {
            const res = await dbFetch('/.netlify/functions/dispatch-equipment?id=' + encodeURIComponent(eDraft.id), { method: 'DELETE' });
            if (!res.ok) throw new Error(res.status === 403 ? 'Your role cannot delete equipment.' : 'HTTP ' + res.status);
            await load();
            setEDraft(null);
        } catch (err) {
            setEError(err.message);
        }
        setBusy(false);
    };

    // ── One-time import from the retired settings blobs ──────────────────────
    const runImport = async () => {
        setImporting(true); setImportResult('');
        const vPlan = plannedVehicleImports(legacyVehicles);
        const ePlan = plannedEquipmentImports(legacyEquipment);
        let ok = 0; const failed = [];
        for (const row of vPlan) {
            try {
                const res = await dbFetch('/.netlify/functions/dispatch-vehicles', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(row) });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                ok++;
            } catch (err) { failed.push(`${row.name}: ${err.message}`); }
        }
        for (const row of ePlan) {
            try {
                const res = await dbFetch('/.netlify/functions/dispatch-equipment', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(row) });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                ok++;
            } catch (err) { failed.push(`${row.name}: ${err.message}`); }
        }
        await load();
        setImportResult(failed.length
            ? `Imported ${ok}. ${failed.length} failed — ${failed.slice(0, 3).join('; ')}${failed.length > 3 ? '…' : ''}`
            : `Imported ${ok} record${ok === 1 ? '' : 's'}. Re-running is safe; ids are derived from the originals.`);
        setImporting(false);
    };

    const importPending = plannedVehicleImports(legacyVehicles).length + plannedEquipmentImports(legacyEquipment).length;

    return (
        <CategoryDetailChrome error={loadError} crumb="Vehicles & equipment" category="Dispatch" title="Vehicles & equipment"
            subtitle="Your fleet and tool inventory. Each equipment row is one physical unit; jobs require a category, and scheduling counts the units actually available."
            onBack={onBack}
            rightActions={
                <button onClick={load} disabled={loading} style={btnGhost}>{loading ? 'Loading…' : 'Refresh'}</button>
            }>

            {importPending > 0 && (
                <CSectionCard title="Import from the old settings list"
                    desc="Vehicles and equipment used to live in workspace settings, where nothing operational read them. These entries have not been carried across.">
                    <div style={{ fontSize: 12.5, fontFamily: T.sans, color: T.inkMid, lineHeight: 1.6 }}>
                        Creates <strong style={{ color: T.ink }}>{plannedVehicleImports(legacyVehicles).length} vehicle(s)</strong> and{' '}
                        <strong style={{ color: T.ink }}>{plannedEquipmentImports(legacyEquipment).length} equipment unit(s)</strong>.
                        An item with a quantity becomes that many units, all sharing one category.
                        Nothing is deleted from the old list, and re-running the import cannot create duplicates.
                    </div>
                    <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button onClick={runImport} disabled={importing} style={{ ...btnPrimary, opacity: importing ? 0.6 : 1 }}>
                            {importing ? 'Importing…' : 'Import now'}
                        </button>
                        {importResult && <span style={{ fontSize: 12, fontFamily: T.sans, color: T.inkMid }}>{importResult}</span>}
                    </div>
                </CSectionCard>
            )}

            {/* ── Vehicles ─────────────────────────────────────────────────── */}
            <CSectionCard title="Vehicles" desc="Read by the dispatch board filter and the technician record.">
                <SPTable columns={[
                    { key: 'name',   label: 'Vehicle',     w: '1.4fr' },
                    { key: 'type',   label: 'Type',        w: '100px' },
                    { key: 'plate',  label: 'Plate',       w: '110px' },
                    { key: 'tech',   label: 'Assigned to', w: '1fr' },
                    { key: 'status', label: 'Status',      w: '120px' },
                    { key: 'more',   label: '',            w: '28px' },
                ]} rows={vehicles.map(v => ({
                    name:   <span style={{ fontWeight: 600, color: T.ink, cursor: 'pointer' }}
                                onClick={() => { setVDraft({ ...v }); setVError(''); }}>{v.name}</span>,
                    type:   <span style={{ fontSize: 12, color: T.inkMid }}>{labelise(v.type)}</span>,
                    plate:  <span style={{ fontSize: 12, color: T.inkMuted, fontFamily: 'ui-monospace,Menlo,monospace' }}>{v.licensePlate || '—'}</span>,
                    tech:   <span style={{ fontSize: 12, color: T.inkMid }}>{techName(v.assignedTechId) || '—'}</span>,
                    status: <StatusPill status={v.status || 'available'}/>,
                    more:   <RowMenuButton onOpen={() => { setVDraft({ ...v }); setVError(''); }}/>,
                }))}/>
                {vehicles.length === 0 && !loading && (
                    <div style={{ padding: '14px 2px', fontSize: 12.5, color: T.inkMuted, fontStyle: 'italic', fontFamily: T.sans }}>
                        No vehicles yet.
                    </div>
                )}
                {vDraft ? (
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 12, fontFamily: T.sans }}>
                            {vDraft._isNew ? 'New vehicle' : vDraft.name}
                        </div>
                        <VehicleForm draft={vDraft} techs={techs} busy={busy} error={vError}
                            set={(k, val) => setVDraft(d => ({ ...d, [k]: val }))}
                            onSave={saveVehicle} onDelete={deleteVehicle}
                            onCancel={() => { setVDraft(null); setVError(''); }}/>
                    </div>
                ) : (
                    <button onClick={() => { setVDraft({ id: 'veh_' + crypto.randomUUID(), _isNew: true, name: '', type: 'van', status: 'available' }); setVError(''); }}
                        style={{ ...btnGhost, marginTop: 12, color: T.ink }}>+ Add vehicle</button>
                )}
            </CSectionCard>

            {/* ── Equipment ────────────────────────────────────────────────── */}
            <CSectionCard title="Equipment"
                desc="One row per physical unit. Jobs and job templates require a category; scheduling blocks when every available unit in that category is committed to an overlapping job.">
                {categories.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                        {categories.map(c => {
                            const units = equipment.filter(e => (e.category || '').trim() === c);
                            const free  = units.filter(e => (e.status || 'available') === 'available').length;
                            return (
                                <span key={c} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 8,
                                    background: T.surface2, border: `1px solid ${T.border}`, color: T.inkMid, fontFamily: T.sans }}>
                                    {c}
                                    <span style={{ marginLeft: 6, fontFamily: 'ui-monospace,Menlo,monospace',
                                        color: free === 0 ? T.danger : T.inkMuted }}>{free}/{units.length}</span>
                                </span>
                            );
                        })}
                    </div>
                )}
                <SPTable columns={[
                    { key: 'name',   label: 'Item',        w: '1.4fr' },
                    { key: 'cat',    label: 'Category',    w: '1fr' },
                    { key: 'serial', label: 'Serial',      w: '120px' },
                    { key: 'out',    label: 'Checked out', w: '1fr' },
                    { key: 'status', label: 'Status',      w: '120px' },
                    { key: 'more',   label: '',            w: '28px' },
                ]} rows={equipment.map(e => ({
                    name:   <span style={{ fontWeight: 600, color: T.ink, cursor: 'pointer' }}
                                onClick={() => { setEDraft({ ...e }); setEError(''); }}>{e.name}</span>,
                    cat:    <span style={{ fontSize: 12, color: T.inkMid }}>{e.category || '—'}</span>,
                    serial: <span style={{ fontSize: 12, color: T.inkMuted, fontFamily: 'ui-monospace,Menlo,monospace' }}>{e.serialNumber || '—'}</span>,
                    out:    <span style={{ fontSize: 12, color: T.inkMid }}>{techName(e.checkedOutToId) || '—'}</span>,
                    status: <StatusPill status={e.status || 'available'}/>,
                    more:   <RowMenuButton onOpen={() => { setEDraft({ ...e }); setEError(''); }}/>,
                }))}/>
                {equipment.length === 0 && !loading && (
                    <div style={{ padding: '14px 2px', fontSize: 12.5, color: T.inkMuted, fontStyle: 'italic', fontFamily: T.sans }}>
                        No equipment yet.
                    </div>
                )}
                {eDraft ? (
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 12, fontFamily: T.sans }}>
                            {eDraft._isNew ? 'New equipment item' : eDraft.name}
                        </div>
                        <EquipmentForm draft={eDraft} categories={categories} techs={techs} busy={busy} error={eError}
                            set={(k, val) => setEDraft(d => ({ ...d, [k]: val }))}
                            onSave={saveEquipment} onDelete={deleteEquipment}
                            onCancel={() => { setEDraft(null); setEError(''); }}/>
                    </div>
                ) : (
                    <button onClick={() => { setEDraft({ id: 'eq_' + crypto.randomUUID(), _isNew: true, name: '', category: '', status: 'available' }); setEError(''); }}
                        style={{ ...btnGhost, marginTop: 12, color: T.ink }}>+ Add item</button>
                )}
            </CSectionCard>
        </CategoryDetailChrome>
    );
};

export default DispatchVehiclesDetail;
