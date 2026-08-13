import React, { useState, useEffect, useRef } from 'react';
import { useDraggable, useResizable } from '../../hooks/useDraggable';
import ResizeHandles from '../../hooks/ResizeHandles';

const T = {
    bg:'#f0ece4', surface:'#fbf8f3', surface2:'#f5efe3', border:'#e6ddd0', borderStrong:'#d4c8b4',
    ink:'#2a2622', inkMid:'#5a544c', inkMuted:'#8a8378', gold:'#c8b99a', goldInk:'#7a6a48',
    danger:'#9c3a2e', warn:'#b87333', ok:'#4d6b3d', info:'#3a5a7a',
    sans:'"Plus Jakarta Sans", system-ui, sans-serif', r:3,
};
const modalActions = { display:'flex', justifyContent:'flex-end', gap:8, marginTop:20, paddingTop:16, borderTop:`1px solid ${T.border}` };
const priBtn = { padding:'8px 16px', background:T.ink, color:T.surface, border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans };
const secBtn = { padding:'8px 16px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans };

// ---------------------------------------------------------------------------
// Duplicate detection helpers
// ---------------------------------------------------------------------------

const norm = (s) => (s || '').toString().trim().toLowerCase();

/**
 * Given the incoming mapped records and the existing DB records already in
 * React state, return an array of conflict objects:
 *   { incomingIndex, incoming, existing, matchReason, action }
 * where action starts as 'skip'.
 */
const detectDuplicates = (incoming, existingContacts, existingAccounts, existingOpps, importType) => {
    const conflicts = [];

    if (importType === 'contacts') {
        incoming.forEach((rec, idx) => {
            // Primary match: email (non-blank)
            let match = null;
            let reason = '';
            if (rec.email?.trim()) {
                match = existingContacts.find(c => norm(c.email) === norm(rec.email));
                if (match) reason = 'same email';
            }
            // Fallback: first + last + company
            if (!match && rec.firstName?.trim() && rec.lastName?.trim()) {
                match = existingContacts.find(c =>
                    norm(c.firstName) === norm(rec.firstName) &&
                    norm(c.lastName)  === norm(rec.lastName)  &&
                    (rec.company ? norm(c.company) === norm(rec.company) : true)
                );
                if (match) reason = 'name match';
            }
            if (match) conflicts.push({ incomingIndex: idx, incoming: rec, existing: match, matchReason: reason, action: 'skip' });
        });
    } else if (importType === 'accounts') {
        incoming.forEach((rec, idx) => {
            if (!rec.name?.trim()) return;
            const match = existingAccounts.find(a => norm(a.name) === norm(rec.name));
            if (match) conflicts.push({ incomingIndex: idx, incoming: rec, existing: match, matchReason: 'same name', action: 'skip' });
        });
    } else if (importType === 'opportunities') {
        incoming.forEach((rec, idx) => {
            if (!rec.opportunityName?.trim()) return;
            const match = existingOpps.find(o =>
                norm(o.opportunityName) === norm(rec.opportunityName) &&
                norm(o.account) === norm(rec.account)
            );
            if (match) conflicts.push({ incomingIndex: idx, incoming: rec, existing: match, matchReason: 'same name + account', action: 'skip' });
        });
    }

    return conflicts;
};

// ---------------------------------------------------------------------------
// Display helper: human-readable label for a record in the conflicts table
// ---------------------------------------------------------------------------
const recordLabel = (rec, importType) => {
    if (importType === 'contacts') {
        const name = [rec.firstName, rec.lastName].filter(Boolean).join(' ');
        return { primary: name || '(unnamed)', secondary: rec.email || '' };
    }
    if (importType === 'accounts') {
        return { primary: rec.name || '(unnamed)', secondary: rec.phone || '' };
    }
    // opportunities
    return { primary: rec.opportunityName || '(unnamed)', secondary: rec.account || '' };
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CsvImportModal({ importType, contacts, accounts, opportunities, onClose, onImportContacts, onImportAccounts, onImportOpportunities }) {
    // steps: upload → mapping → preview → conflicts (if any) → results
    const [step, setStep] = useState('upload');
    const { dragHandleProps, dragOffsetStyle, overlayStyle, clickCatcherStyle, clickCatcherProps, containerRef } = useDraggable();
    const { size, getResizeHandleProps } = useResizable(800, 580, 520, 380);
    const [csvHeaders, setCsvHeaders] = useState([]);
    const [csvRows, setCsvRows] = useState([]);
    const [fieldMapping, setFieldMapping] = useState({});
    const [mappingConfidence, setMappingConfidence] = useState({});
    const [parseError, setParseError] = useState('');
    const [importStats, setImportStats] = useState(null);
    const [importing, setImporting] = useState(false);
    const [importProgress, setImportProgress] = useState(0);

    // conflicts: array of { incomingIndex, incoming, existing, matchReason, action }
    const [conflicts, setConflicts] = useState([]);

    // ---------------------------------------------------------------------------
    // Field definitions
    // ---------------------------------------------------------------------------

    const contactFields = [
        { key: 'firstName', label: 'First Name', required: true },
        { key: 'middleName', label: 'Middle Name' },
        { key: 'lastName', label: 'Last Name', required: true },
        { key: 'email', label: 'Email' },
        { key: 'personalEmail', label: 'Email 2' },
        { key: 'phone', label: 'Business Phone' },
        { key: 'mobile', label: 'Mobile Phone' },
        { key: 'title', label: 'Title / Job Title' },
        { key: 'company', label: 'Company' },
        { key: 'workLocation', label: 'Work Location' },
        { key: 'address', label: 'Address' },
        { key: 'city', label: 'City' },
        { key: 'state', label: 'State/Prov.' },
        { key: 'zip', label: 'ZIP Code' },
        { key: 'country', label: 'Country' }
    ];

    const accountFields = [
        { key: 'name', label: 'Account Name', required: true },
        { key: 'parentAccount', label: 'Parent Account' },
        { key: 'verticalMarket', label: 'Vertical Market' },
        { key: 'accountOwner', label: 'Account Owner' },
        { key: 'phone', label: 'Phone' },
        { key: 'website', label: 'Website' },
        { key: 'address', label: 'Address' },
        { key: 'city', label: 'City' },
        { key: 'state', label: 'State' },
        { key: 'zip', label: 'ZIP Code' },
        { key: 'country', label: 'Country' }
    ];

    const opportunityFields = [
        { key: 'opportunityName', label: 'Opportunity Name', required: true },
        { key: 'account',         label: 'Account Name',     required: true },
        { key: 'salesRep',        label: 'Sales Rep' },
        { key: 'stage',           label: 'Stage' },
        { key: 'arr',             label: 'ARR ($)' },
        { key: 'implementationCost', label: 'Implementation Cost ($)' },
        { key: 'forecastedCloseDate', label: 'Close Date' },
        { key: 'products',        label: 'Products' },
        { key: 'notes',           label: 'Notes' },
        { key: 'nextSteps',       label: 'Next Steps' },
        { key: 'territory',       label: 'Territory' },
        { key: 'vertical',        label: 'Vertical' },
        { key: 'probability',     label: 'Probability (%)' },
        { key: 'createdDate',     label: 'Created Date' },
    ];

    const appFields = importType === 'contacts' ? contactFields
        : importType === 'opportunities' ? opportunityFields
        : accountFields;

    // Always read live importType, not a stale closure
    const getAppFields = () => importType === 'contacts' ? contactFields
        : importType === 'opportunities' ? opportunityFields
        : accountFields;

    // ---------------------------------------------------------------------------
    // CSV parsing (unchanged from original)
    // ---------------------------------------------------------------------------

    const parseCSV = (text) => {
        const splitLines = (raw) => {
            const lines = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < raw.length; i++) {
                const ch = raw[i];
                if (ch === '"') {
                    if (inQuotes && raw[i + 1] === '"') { current += '"'; i++; }
                    else { inQuotes = !inQuotes; current += ch; }
                } else if ((ch === '\n' || (ch === '\r' && raw[i + 1] === '\n')) && !inQuotes) {
                    if (ch === '\r') i++;
                    lines.push(current);
                    current = '';
                } else {
                    current += ch;
                }
            }
            if (current) lines.push(current);
            return lines.filter(l => l.trim());
        };
        const lines = splitLines(text);
        if (lines.length < 2) { setParseError('CSV must have a header row and at least one data row.'); return; }

        const parseLine = (line) => {
            const result = []; let current = ''; let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (inQuotes) {
                    if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
                    else if (ch === '"') { inQuotes = false; }
                    else { current += ch; }
                } else {
                    if (ch === '"') { inQuotes = true; }
                    else if (ch === ',') { result.push(current.trim()); current = ''; }
                    else { current += ch; }
                }
            }
            result.push(current.trim());
            return result;
        };

        const headers = parseLine(lines[0]);
        const rows = lines.slice(1).map(parseLine).filter(r => r.some(cell => cell));

        setCsvHeaders(headers);
        setCsvRows(rows);

        const autoMapping = {};
        const autoConf = {};
        getAppFields().forEach(field => {
            const fieldLower = field.label.toLowerCase().replace(/[^a-z]/g, '');
            const keyLower = field.key.toLowerCase();
            const match = headers.findIndex(h => {
                const hLower = h.toLowerCase().replace(/[^a-z]/g, '');
                return hLower === fieldLower || hLower === keyLower ||
                       hLower.includes(keyLower) || keyLower.includes(hLower) ||
                       (field.key === 'firstName' && (hLower.includes('first') || hLower === 'givenname')) ||
                       (field.key === 'lastName' && (hLower.includes('last') || hLower === 'surname' || hLower === 'familyname')) ||
                       (field.key === 'name' && (hLower === 'accountname' || hLower === 'companyname' || hLower === 'name')) ||
                       (field.key === 'email' && hLower.includes('email')) ||
                       (field.key === 'phone' && (hLower.includes('phone') || hLower.includes('tel')) && !hLower.includes('mobile') && !hLower.includes('cell')) ||
                       (field.key === 'mobile' && (hLower.includes('mobile') || hLower.includes('cell'))) ||
                       (field.key === 'title' && (hLower.includes('title') || hLower.includes('jobtitle') || hLower.includes('position'))) ||
                       (field.key === 'company' && (hLower.includes('company') || hLower.includes('organization') || hLower.includes('org'))) ||
                       (field.key === 'website' && (hLower.includes('website') || hLower.includes('url') || hLower.includes('web'))) ||
                       (field.key === 'zip' && (hLower.includes('zip') || hLower.includes('postal'))) ||
                       (field.key === 'address' && (hLower.includes('address') || hLower.includes('street'))) ||
                       (field.key === 'verticalMarket' && (hLower.includes('vertical') || hLower.includes('industry') || hLower.includes('sector'))) ||
                       (field.key === 'parentAccount' && (hLower.includes('parent') || hLower.includes('parentaccount')));
            });
            if (match >= 0) {
                autoMapping[field.key] = match;
                const hL = headers[match].toLowerCase().replace(/[^a-z]/g, '');
                autoConf[field.key] = (hL === fieldLower || hL === keyLower) ? 0.98
                    : (hL.includes(keyLower) || keyLower.includes(hL)) ? 0.85 : 0.80;
            }
        });
        setFieldMapping(autoMapping);
        setMappingConfidence(autoConf);
        setStep('mapping');
    };

    const handleFileUpload = (file) => {
        if (!file) return;
        setParseError('');
        const reader = new FileReader();
        reader.onload = (e) => { parseCSV(e.target.result); };
        reader.onerror = () => { setParseError('Failed to read file.'); };
        reader.readAsText(file);
    };

    // ---------------------------------------------------------------------------
    // Map CSV rows → app field objects
    // ---------------------------------------------------------------------------

    const getMappedData = () => {
        return csvRows.map(row => {
            const record = {};
            appFields.forEach(field => {
                const colIdx = fieldMapping[field.key];
                record[field.key] = (colIdx !== undefined && colIdx !== '' && colIdx >= 0) ? (row[colIdx] || '') : '';
            });
            return record;
        }).filter(r => appFields.filter(f => f.required).some(f => r[f.key]?.trim()));
    };

    // ---------------------------------------------------------------------------
    // "Preview → Conflicts" transition
    // Runs dedup and either shows conflicts step or jumps straight to import
    // ---------------------------------------------------------------------------

    const handleCheckDuplicates = () => {
        const data = getMappedData();
        const found = detectDuplicates(
            data,
            contacts || [],
            accounts || [],
            opportunities || [],
            importType
        );
        if (found.length > 0) {
            setConflicts(found);
            setStep('conflicts');
        } else {
            // No duplicates — go straight to import
            setConflicts([]);
            runImport(data, []);
        }
    };

    // Update a single conflict's action
    const setConflictAction = (incomingIndex, action) => {
        setConflicts(prev => prev.map(c => c.incomingIndex === incomingIndex ? { ...c, action } : c));
    };

    // Bulk set all conflicts to skip or overwrite
    const setAllConflictActions = (action) => {
        setConflicts(prev => prev.map(c => ({ ...c, action })));
    };

    // ---------------------------------------------------------------------------
    // Import execution
    // Accepts the full mapped data array + resolved conflicts array.
    // Splits into: newRecords (no conflict), skipped, overwrites.
    // Passes { newRecords, overwrites } to the ModalLayer callback.
    // ---------------------------------------------------------------------------

    const runImport = async (data, resolvedConflicts) => {
        setImporting(true);
        setImportProgress(0);
        window.__importProgressCb = (done, total) => setImportProgress(Math.round((done / total) * 100));

        // Build a Set of incoming indices that are conflicts
        const conflictIndexSet = new Set(resolvedConflicts.map(c => c.incomingIndex));
        const skipIndexSet = new Set(
            resolvedConflicts.filter(c => c.action === 'skip').map(c => c.incomingIndex)
        );

        // Records that are not conflicted at all → always INSERT
        const newRecords = data.filter((_, idx) => !conflictIndexSet.has(idx));

        // Records the user chose to overwrite → UPDATE (carry existing id)
        const overwrites = resolvedConflicts
            .filter(c => c.action === 'overwrite')
            .map(c => ({ ...c.incoming, _existingId: c.existing.id }));

        const skippedCount = resolvedConflicts.filter(c => c.action === 'skip').length;
        const overwriteCount = overwrites.length;

        try {
            if (importType === 'contacts') {
                await onImportContacts(newRecords, overwrites);
            } else if (importType === 'opportunities') {
                await onImportOpportunities(newRecords, overwrites);
            } else if (importType === 'accounts') {
                await onImportAccounts(newRecords, overwrites);
            } else {
                throw new Error(`Unknown import type: "${importType}"`);
            }
            setImportStats({
                total: newRecords.length + overwriteCount,
                skipped: skippedCount,
                overwritten: overwriteCount,
                error: null,
                partial: false
            });
        } catch (err) {
            const msg = err.message || '';
            const isPartial = msg.includes('of') && msg.includes('failed to save');
            let savedCount = null;
            if (isPartial) {
                const m = msg.match(/(\d+)\s+of\s+(\d+)/);
                if (m) savedCount = parseInt(m[2]) - parseInt(m[1]);
            }
            setImportStats({
                total: newRecords.length + overwriteCount,
                skipped: skippedCount,
                overwritten: overwriteCount,
                error: msg || 'Import failed. Please try again.',
                partial: isPartial,
                savedCount
            });
        }

        window.__importProgressCb = null;
        setImporting(false);
        setImportProgress(0);
        setStep('results');
    };

    // Called from the conflicts step "Import" button
    const handleImportFromConflicts = () => {
        const data = getMappedData();
        runImport(data, conflicts);
    };

    // Called from the preview step when there are no duplicates detected
    // (fast path — also used by handleCheckDuplicates when 0 conflicts found)
    const previewData = (step === 'preview' || step === 'conflicts') ? getMappedData() : [];

    // ---------------------------------------------------------------------------
    // Styles
    // ---------------------------------------------------------------------------

    const thStyle = {
        padding: '8px 12px',
        background: T.border,
        borderBottom: `1px solid ${T.border}`,
        textAlign: 'left',
        fontWeight: '600',
        whiteSpace: 'nowrap',
        fontSize: '12px',
        color: T.inkMid,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
    };

    const tdStyle = {
        padding: '8px 12px',
        borderBottom: `1px solid ${T.border}`,
        fontSize: '13px',
        color: T.ink,
    };

    const conflictSelectStyle = {
        fontSize: '12px',
        padding: '4px 8px',
        border: `1px solid ${T.border}`,
        borderRadius: '6px',
        background: T.surface,
        color: T.ink,
        fontFamily: 'inherit',
        cursor: 'pointer',
    };

    const summaryCardStyle = (accent) => ({
        flex: 1,
        background: T.surface,
        border: `1px solid ${accent === 'warn' ? 'rgba(184,115,51,0.20)' : T.border}`,
        borderRadius: '8px',
        padding: '10px 14px',
    });

    const entityLabel = importType === 'contacts' ? 'contacts'
        : importType === 'opportunities' ? 'opportunities'
        : 'accounts';

    // ---------------------------------------------------------------------------
    // Step indicator
    // ---------------------------------------------------------------------------

    const STEPS = ['upload', 'mapping', 'preview', 'conflicts', 'results'];
    const STEP_LABELS = ['Upload', 'Mapping', 'Preview', 'Conflicts', 'Results'];
    // If no conflicts were found we skip the conflicts step visually
    const visibleSteps = conflicts.length === 0 && step !== 'conflicts'
        ? ['upload', 'mapping', 'preview', 'results']
        : STEPS;
    const visibleLabels = conflicts.length === 0 && step !== 'conflicts'
        ? ['Upload', 'Mapping', 'Preview', 'Results']
        : STEP_LABELS;

    const currentStepIdx = visibleSteps.indexOf(step);

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------

    return (
        <>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ ...overlayStyle }} />
        <div {...clickCatcherProps} />
        <div
            ref={containerRef}
            onClick={e => e.stopPropagation()}
            style={{
                ...dragOffsetStyle,
                width: size.w,
                height: size.h,
                overflow: 'auto',
                background: T.surface,
                borderRadius: '12px',
                boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
                border: `1px solid ${T.border}`,
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            {/* ── Header ── */}
            <h2 {...dragHandleProps} style={{
                margin: 0,
                padding: '16px 20px',
                background: '#1c1917',
                color: T.surface,
                fontSize: '15px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderRadius: '12px 12px 0 0',
                cursor: 'grab',
                userSelect: 'none',
                flexShrink: 0,
            }}>
                Import {importType === 'contacts' ? 'Contacts' : importType === 'opportunities' ? 'Opportunities' : 'Accounts'} from CSV
                <button
                    onClick={onClose}
                    style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: T.surface, borderRadius: '6px', width: '28px', height: '28px', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                >×</button>
            </h2>

            {/* ── Step indicator ── */}
            <div style={{ padding: '12px 24px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                    {visibleLabels.map((label, idx) => {
                        const isDone = idx < currentStepIdx;
                        const isActive = idx === currentStepIdx;
                        return (
                            <React.Fragment key={label}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <div style={{
                                        width: '22px', height: '22px', borderRadius: '50%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '11px', fontWeight: '600', flexShrink: 0,
                                        background: isDone ? T.ok : isActive ? '#1c1917' : T.surface2,
                                        color: isDone ? T.surface : isActive ? T.surface : T.inkMuted,
                                        border: isDone || isActive ? 'none' : `1px solid ${T.border}`,
                                    }}>
                                        {isDone ? '✓' : idx + 1}
                                    </div>
                                    <span style={{
                                        fontSize: '12px',
                                        fontWeight: isActive ? '600' : '400',
                                        color: isActive ? '#1c1917' : isDone ? T.inkMid : T.inkMuted,
                                        whiteSpace: 'nowrap',
                                    }}>{label}</span>
                                </div>
                                {idx < visibleLabels.length - 1 && (
                                    <div style={{ flex: 1, height: '1px', background: T.border, margin: '0 8px', minWidth: '12px' }} />
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>

            {/* ── Body ── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

                {/* ── Step: Upload ── */}
                {step === 'upload' && (
                    <div>
                        <p style={{ color: T.inkMid, marginBottom: '24px', fontSize: '14px' }}>
                            Upload a CSV file with your {entityLabel}. The first row should contain column headers.
                        </p>
                        <div
                            style={{
                                border: `2px dashed ${T.border}`, borderRadius: '8px', padding: '48px',
                                textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s',
                                background: T.surface2
                            }}
                            onClick={() => document.getElementById('csv-file-input').click()}
                            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = T.info; e.currentTarget.style.background = 'rgba(58,90,122,0.08)'; }}
                            onDragLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.surface2; }}
                            onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = T.border; handleFileUpload(e.dataTransfer.files[0]); }}
                        >
                            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📄</div>
                            <div style={{ fontWeight: '600', color: T.ink, marginBottom: '8px' }}>
                                Drop your CSV file here or click to browse
                            </div>
                            <div style={{ fontSize: '14px', color: T.inkMid }}>Supports .csv files</div>
                        </div>
                        <input id="csv-file-input" type="file" accept=".csv,.txt" style={{ display: 'none' }}
                            onChange={e => handleFileUpload(e.target.files[0])} />
                        {parseError && (
                            <div style={{ color: T.danger, padding: '12px', background: 'rgba(156,58,46,0.08)', borderRadius: '6px', marginTop: '16px', fontSize: '14px' }}>
                                {parseError}
                            </div>
                        )}
                        <div style={modalActions}>
                            <button type="button" style={secBtn} onClick={onClose}>Cancel</button>
                        </div>
                    </div>
                )}

                {/* ── Step: Mapping ── */}
                {step === 'mapping' && (
                    <div>
                        <p style={{ color: T.inkMid, marginBottom: '16px', fontSize: '14px' }}>
                            Found <strong>{csvRows.length}</strong> rows and <strong>{csvHeaders.length}</strong> columns. Map your CSV columns to app fields:
                        </p>
                        <div style={{ display: 'grid', gap: '12px', marginBottom: '24px' }}>
                            {appFields.map(field => (
                                <div key={field.key} style={{
                                    display: 'grid', gridTemplateColumns: '180px 1fr 104px', gap: '16px', alignItems: 'center',
                                    padding: '8px 0', borderBottom: `1px solid ${T.border}`
                                }}>
                                    <label style={{ fontWeight: '600', fontSize: '14px', color: T.ink }}>
                                        {field.label}{field.required ? ' *' : ''}
                                    </label>
                                    <select
                                        value={fieldMapping[field.key] !== undefined ? fieldMapping[field.key] : ''}
                                        onChange={e => {
                                            const v = e.target.value === '' ? undefined : parseInt(e.target.value);
                                            setFieldMapping({ ...fieldMapping, [field.key]: v });
                                            setMappingConfidence({ ...mappingConfidence, [field.key]: v === undefined ? undefined : 1 });
                                        }}
                                        style={{
                                            padding: '8px', border: `1px solid ${T.border}`, borderRadius: '6px',
                                            background: fieldMapping[field.key] !== undefined ? 'rgba(58,90,122,0.08)' : T.surface,
                                            fontSize: '14px', color: T.ink
                                        }}
                                    >
                                        <option value="">— Skip this field —</option>
                                        {csvHeaders.map((h, idx) => (
                                            <option key={idx} value={idx}>{h} {csvRows[0] && csvRows[0][idx] ? `(e.g. "${csvRows[0][idx].substring(0, 30)}")` : ''}</option>
                                        ))}
                                    </select>
                                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                        {fieldMapping[field.key] !== undefined && (() => {
                                            const conf = mappingConfidence[field.key] ?? 1;
                                            const low = conf < 0.85;
                                            return (<>
                                                <div style={{ width:56, height:5, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:3, overflow:'hidden' }}>
                                                    <div style={{ width:`${Math.round(conf*100)}%`, height:'100%', background: low ? T.warn : T.ok }}/>
                                                </div>
                                                <span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:10.5, color: low ? T.warn : T.inkMuted }}>{Math.round(conf*100)}%</span>
                                            </>);
                                        })()}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div style={modalActions}>
                            <button type="button" style={secBtn} onClick={() => setStep('upload')}>← Back</button>
                            <button type="button" style={priBtn} onClick={() => setStep('preview')}>
                                Preview Import →
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Step: Preview ── */}
                {step === 'preview' && (
                    <div>
                        <p style={{ color: T.inkMid, marginBottom: '16px', fontSize: '14px' }}>
                            <strong>{previewData.length}</strong> valid records ready to import. Review a sample below:
                        </p>
                        {importType === 'contacts' && previewData.length > 0 && (
                            <div style={{ fontSize: '13px', color: T.ok, marginBottom: '16px', padding: '8px 12px', background: 'rgba(77,107,61,0.10)', borderRadius: '6px' }}>
                                💡 Companies from imported contacts will be auto-added to your Accounts list if they don't already exist.
                            </div>
                        )}
                        <div style={{ overflowX: 'auto', maxHeight: '300px', overflowY: 'auto', border: `1px solid ${T.border}`, borderRadius: '6px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead>
                                    <tr>
                                        <th style={thStyle}>#</th>
                                        {appFields.filter(f => fieldMapping[f.key] !== undefined).map(f => (
                                            <th key={f.key} style={thStyle}>{f.label}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewData.slice(0, 10).map((row, idx) => (
                                        <tr key={idx}>
                                            <td style={{ ...tdStyle, color: T.inkMid }}>{idx + 1}</td>
                                            {appFields.filter(f => fieldMapping[f.key] !== undefined).map(f => (
                                                <td key={f.key} style={{ ...tdStyle, whiteSpace: 'nowrap', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {row[f.key] || '—'}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {previewData.length > 10 && (
                            <div style={{ textAlign: 'center', padding: '12px', color: T.inkMid, fontSize: '14px' }}>
                                ...and {previewData.length - 10} more records
                            </div>
                        )}
                        <div style={modalActions}>
                            <button type="button" style={secBtn} onClick={() => setStep('mapping')}>← Back</button>
                            <button
                                type="button"
                                onClick={handleCheckDuplicates}
                                disabled={importing}
                                style={{ ...priBtn, display: 'flex', alignItems: 'center', gap: '8px', opacity: importing ? 0.8 : 1 }}
                            >
                                {importing ? (
                                    <>
                                        <span style={{
                                            width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)',
                                            borderTopColor: 'white', borderRadius: '50%',
                                            animation: 'spin 0.7s linear infinite', display: 'inline-block', flexShrink: 0
                                        }} />
                                        {importProgress > 0 ? `Saving… ${importProgress}%` : 'Checking…'}
                                    </>
                                ) : (
                                    <>Check for Duplicates →</>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Step: Conflicts ── */}
                {step === 'conflicts' && (
                    <div>
                        {/* Summary cards */}
                        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                            <div style={summaryCardStyle('neutral')}>
                                <div style={{ fontSize: '22px', fontWeight: '700', color: '#1c1917' }}>
                                    {previewData.length - conflicts.length}
                                </div>
                                <div style={{ fontSize: '12px', color: T.inkMid, marginTop: '2px' }}>New records</div>
                            </div>
                            <div style={summaryCardStyle('warn')}>
                                <div style={{ fontSize: '22px', fontWeight: '700', color: T.warn }}>
                                    {conflicts.length}
                                </div>
                                <div style={{ fontSize: '12px', color: T.warn, marginTop: '2px' }}>Possible duplicates</div>
                            </div>
                        </div>

                        {/* Bulk action row */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <p style={{ fontSize: '14px', color: T.inkMid, margin: 0 }}>
                                Choose how to handle each duplicate:
                            </p>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    type="button"
                                    style={{ ...secBtn, fontSize: '12px', padding: '4px 12px' }}
                                    onClick={() => setAllConflictActions('skip')}
                                >
                                    Skip all
                                </button>
                                <button
                                    type="button"
                                    style={{ ...secBtn, fontSize: '12px', padding: '4px 12px' }}
                                    onClick={() => setAllConflictActions('overwrite')}
                                >
                                    Overwrite all
                                </button>
                            </div>
                        </div>

                        {/* Conflicts table */}
                        <div style={{ border: `1px solid ${T.border}`, borderRadius: '8px', overflow: 'hidden', marginBottom: '12px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead>
                                    <tr>
                                        <th style={{ ...thStyle, width: '32px' }}>#</th>
                                        <th style={thStyle}>From CSV</th>
                                        <th style={thStyle}>Matches existing</th>
                                        <th style={{ ...thStyle, width: '110px' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {conflicts.map((c, idx) => {
                                        const inLabel = recordLabel(c.incoming, importType);
                                        const exLabel = recordLabel(c.existing, importType);
                                        return (
                                            <tr key={c.incomingIndex}>
                                                <td style={{ ...tdStyle, color: T.inkMuted, textAlign: 'center' }}>{idx + 1}</td>
                                                <td style={tdStyle}>
                                                    <div style={{ fontWeight: '600', color: T.ink }}>{inLabel.primary}</div>
                                                    {inLabel.secondary && <div style={{ fontSize: '12px', color: T.inkMid }}>{inLabel.secondary}</div>}
                                                </td>
                                                <td style={tdStyle}>
                                                    <div style={{ color: T.ink }}>{exLabel.primary}</div>
                                                    <div style={{ fontSize: '12px', color: T.inkMuted }}>{c.matchReason}</div>
                                                </td>
                                                <td style={tdStyle}>
                                                    <select
                                                        style={conflictSelectStyle}
                                                        value={c.action}
                                                        onChange={e => setConflictAction(c.incomingIndex, e.target.value)}
                                                    >
                                                        <option value="skip">Skip</option>
                                                        <option value="overwrite">Overwrite</option>
                                                    </select>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div style={{ fontSize: '13px', color: T.inkMid, marginBottom: '16px' }}>
                            <strong>Skip</strong> leaves the existing record unchanged.&nbsp;
                            <strong>Overwrite</strong> replaces it with the data from your CSV.
                        </div>

                        <div style={modalActions}>
                            <button type="button" style={secBtn} onClick={() => setStep('preview')}>← Back</button>
                            <button
                                type="button"
                                onClick={handleImportFromConflicts}
                                disabled={importing}
                                style={{ ...priBtn, display: 'flex', alignItems: 'center', gap: '8px', opacity: importing ? 0.8 : 1 }}
                            >
                                {importing ? (
                                    <>
                                        <span style={{
                                            width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)',
                                            borderTopColor: 'white', borderRadius: '50%',
                                            animation: 'spin 0.7s linear infinite', display: 'inline-block', flexShrink: 0
                                        }} />
                                        {importProgress > 0 ? `Saving… ${importProgress}%` : 'Saving…'}
                                    </>
                                ) : (
                                    <>
                                        Import {(previewData.length - conflicts.filter(c => c.action === 'skip').length)} {entityLabel} →
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Step: Results ── */}
                {step === 'results' && (
                    <div style={{ textAlign: 'center', padding: '32px 0' }}>
                        {importStats?.error ? (
                            <>
                                <div style={{ fontSize: '48px', marginBottom: '16px' }}>
                                    {importStats.partial && importStats.savedCount > 0 ? '⚠️' : '❌'}
                                </div>
                                <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px', color: importStats.partial && importStats.savedCount > 0 ? T.warn : T.danger }}>
                                    {importStats.partial && importStats.savedCount > 0 ? 'Partially Imported' : 'Import Failed'}
                                </h3>
                                <p style={{ color: T.inkMid, marginBottom: '24px', fontSize: '14px' }}>
                                    {importStats.partial && importStats.savedCount != null
                                        ? importStats.savedCount > 0
                                            ? `${importStats.savedCount} of ${importStats.total} records saved. The remaining ${importStats.total - importStats.savedCount} failed — try re-importing them.`
                                            : `All ${importStats.total} records failed to save. This is likely a server error — please try again.`
                                        : importStats.error}
                                </p>
                                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                                    <button style={secBtn} onClick={() => setStep('preview')}>← Back</button>
                                    <button style={priBtn} onClick={onClose}>Close</button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
                                <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>
                                    Import Complete!
                                </h3>
                                <p style={{ color: T.inkMid, marginBottom: '24px', fontSize: '14px' }}>
                                    {importType === 'contacts' && ' Any new companies have been added to your Accounts list.'}
                                </p>
                                {/* Results breakdown */}
                                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginBottom: '24px' }}>
                                    <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '10px 20px', minWidth: '80px' }}>
                                        <div style={{ fontSize: '22px', fontWeight: '700', color: '#1c1917' }}>{importStats?.total ?? 0}</div>
                                        <div style={{ fontSize: '12px', color: T.inkMid }}>imported</div>
                                    </div>
                                    {importStats?.skipped > 0 && (
                                        <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '10px 20px', minWidth: '80px' }}>
                                            <div style={{ fontSize: '22px', fontWeight: '700', color: T.inkMid }}>{importStats.skipped}</div>
                                            <div style={{ fontSize: '12px', color: T.inkMid }}>skipped</div>
                                        </div>
                                    )}
                                    {importStats?.overwritten > 0 && (
                                        <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '10px 20px', minWidth: '80px' }}>
                                            <div style={{ fontSize: '22px', fontWeight: '700', color: T.info }}>{importStats.overwritten}</div>
                                            <div style={{ fontSize: '12px', color: T.inkMid }}>overwritten</div>
                                        </div>
                                    )}
                                </div>
                                <button style={priBtn} onClick={onClose}>Done</button>
                            </>
                        )}
                    </div>
                )}

            </div>{/* end body */}

            <ResizeHandles getResizeHandleProps={getResizeHandleProps} />
        </div>
        </>
    );
}
