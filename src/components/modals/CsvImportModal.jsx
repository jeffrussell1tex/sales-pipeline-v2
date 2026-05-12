import React, { useState, useEffect, useRef } from 'react';
import { useDraggable, useResizable } from '../../hooks/useDraggable';
import ResizeHandles from '../../hooks/ResizeHandles';

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
    const { dragHandleProps, dragOffsetStyle, overlayStyle, clickCatcherStyle, containerRef } = useDraggable();
    const { size, getResizeHandleProps } = useResizable(800, 580, 520, 380);
    const [csvHeaders, setCsvHeaders] = useState([]);
    const [csvRows, setCsvRows] = useState([]);
    const [fieldMapping, setFieldMapping] = useState({});
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
            if (match >= 0) autoMapping[field.key] = match;
        });
        setFieldMapping(autoMapping);
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
        padding: '0.5rem 0.75rem',
        background: '#f1f3f5',
        borderBottom: '1px solid #e2e8f0',
        textAlign: 'left',
        fontWeight: '600',
        whiteSpace: 'nowrap',
        fontSize: '0.75rem',
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
    };

    const tdStyle = {
        padding: '0.5rem 0.75rem',
        borderBottom: '1px solid #f1f3f5',
        fontSize: '0.8125rem',
        color: '#1e293b',
    };

    const conflictSelectStyle = {
        fontSize: '0.75rem',
        padding: '0.25rem 0.5rem',
        border: '1px solid #e2e8f0',
        borderRadius: '6px',
        background: '#ffffff',
        color: '#1e293b',
        fontFamily: 'inherit',
        cursor: 'pointer',
    };

    const summaryCardStyle = (accent) => ({
        flex: 1,
        background: '#ffffff',
        border: `1px solid ${accent === 'warn' ? '#fde68a' : '#e2e8f0'}`,
        borderRadius: '8px',
        padding: '0.625rem 0.875rem',
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
        <div style={clickCatcherStyle} />
        <div
            ref={containerRef}
            onClick={e => e.stopPropagation()}
            style={{
                ...dragOffsetStyle,
                width: size.w,
                height: size.h,
                overflow: 'auto',
                background: '#fff',
                borderRadius: '12px',
                boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
                border: '1px solid #e5e2db',
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            {/* ── Header ── */}
            <h2 {...dragHandleProps} style={{
                margin: 0,
                padding: '1rem 1.25rem',
                background: '#1c1917',
                color: '#f5f1eb',
                fontSize: '0.9375rem',
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
                    style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#f5f1eb', borderRadius: '6px', width: '28px', height: '28px', fontSize: '1.125rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                >×</button>
            </h2>

            {/* ── Step indicator ── */}
            <div style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
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
                                        background: isDone ? '#16a34a' : isActive ? '#1c1917' : '#f1f5f9',
                                        color: isDone ? '#fff' : isActive ? '#f5f1eb' : '#94a3b8',
                                        border: isDone || isActive ? 'none' : '1px solid #e2e8f0',
                                    }}>
                                        {isDone ? '✓' : idx + 1}
                                    </div>
                                    <span style={{
                                        fontSize: '0.75rem',
                                        fontWeight: isActive ? '600' : '400',
                                        color: isActive ? '#1c1917' : isDone ? '#64748b' : '#94a3b8',
                                        whiteSpace: 'nowrap',
                                    }}>{label}</span>
                                </div>
                                {idx < visibleLabels.length - 1 && (
                                    <div style={{ flex: 1, height: '1px', background: '#e2e8f0', margin: '0 8px', minWidth: '12px' }} />
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>

            {/* ── Body ── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>

                {/* ── Step: Upload ── */}
                {step === 'upload' && (
                    <div>
                        <p style={{ color: '#64748b', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                            Upload a CSV file with your {entityLabel}. The first row should contain column headers.
                        </p>
                        <div
                            style={{
                                border: '2px dashed #e2e8f0', borderRadius: '8px', padding: '3rem',
                                textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s',
                                background: '#f8f9fa'
                            }}
                            onClick={() => document.getElementById('csv-file-input').click()}
                            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.background = '#eff6ff'; }}
                            onDragLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8f9fa'; }}
                            onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#e2e8f0'; handleFileUpload(e.dataTransfer.files[0]); }}
                        >
                            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📄</div>
                            <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '0.5rem' }}>
                                Drop your CSV file here or click to browse
                            </div>
                            <div style={{ fontSize: '0.875rem', color: '#64748b' }}>Supports .csv files</div>
                        </div>
                        <input id="csv-file-input" type="file" accept=".csv,.txt" style={{ display: 'none' }}
                            onChange={e => handleFileUpload(e.target.files[0])} />
                        {parseError && (
                            <div style={{ color: '#ef4444', padding: '0.75rem', background: '#fef2f2', borderRadius: '6px', marginTop: '1rem', fontSize: '0.875rem' }}>
                                {parseError}
                            </div>
                        )}
                        <div className="modal-actions">
                            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                        </div>
                    </div>
                )}

                {/* ── Step: Mapping ── */}
                {step === 'mapping' && (
                    <div>
                        <p style={{ color: '#64748b', marginBottom: '1rem', fontSize: '0.875rem' }}>
                            Found <strong>{csvRows.length}</strong> rows and <strong>{csvHeaders.length}</strong> columns. Map your CSV columns to app fields:
                        </p>
                        <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '1.5rem' }}>
                            {appFields.map(field => (
                                <div key={field.key} style={{
                                    display: 'grid', gridTemplateColumns: '180px 1fr', gap: '1rem', alignItems: 'center',
                                    padding: '0.5rem 0', borderBottom: '1px solid #f1f3f5'
                                }}>
                                    <label style={{ fontWeight: '600', fontSize: '0.875rem', color: '#1e293b' }}>
                                        {field.label}{field.required ? ' *' : ''}
                                    </label>
                                    <select
                                        value={fieldMapping[field.key] !== undefined ? fieldMapping[field.key] : ''}
                                        onChange={e => setFieldMapping({
                                            ...fieldMapping,
                                            [field.key]: e.target.value === '' ? undefined : parseInt(e.target.value)
                                        })}
                                        style={{
                                            padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: '6px',
                                            background: fieldMapping[field.key] !== undefined ? '#eff6ff' : '#ffffff',
                                            fontSize: '0.875rem', color: '#1e293b'
                                        }}
                                    >
                                        <option value="">— Skip this field —</option>
                                        {csvHeaders.map((h, idx) => (
                                            <option key={idx} value={idx}>{h} {csvRows[0] && csvRows[0][idx] ? `(e.g. "${csvRows[0][idx].substring(0, 30)}")` : ''}</option>
                                        ))}
                                    </select>
                                </div>
                            ))}
                        </div>
                        <div className="modal-actions">
                            <button type="button" className="btn btn-secondary" onClick={() => setStep('upload')}>← Back</button>
                            <button type="button" className="btn" onClick={() => setStep('preview')}>
                                Preview Import →
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Step: Preview ── */}
                {step === 'preview' && (
                    <div>
                        <p style={{ color: '#64748b', marginBottom: '1rem', fontSize: '0.875rem' }}>
                            <strong>{previewData.length}</strong> valid records ready to import. Review a sample below:
                        </p>
                        {importType === 'contacts' && previewData.length > 0 && (
                            <div style={{ fontSize: '0.8125rem', color: '#10b981', marginBottom: '1rem', padding: '0.5rem 0.75rem', background: '#ecfdf5', borderRadius: '6px' }}>
                                💡 Companies from imported contacts will be auto-added to your Accounts list if they don't already exist.
                            </div>
                        )}
                        <div style={{ overflowX: 'auto', maxHeight: '300px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
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
                                            <td style={{ ...tdStyle, color: '#64748b' }}>{idx + 1}</td>
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
                            <div style={{ textAlign: 'center', padding: '0.75rem', color: '#64748b', fontSize: '0.875rem' }}>
                                ...and {previewData.length - 10} more records
                            </div>
                        )}
                        <div className="modal-actions">
                            <button type="button" className="btn btn-secondary" onClick={() => setStep('mapping')}>← Back</button>
                            <button
                                type="button"
                                className="btn"
                                onClick={handleCheckDuplicates}
                                disabled={importing}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: importing ? 0.8 : 1 }}
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
                        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
                            <div style={summaryCardStyle('neutral')}>
                                <div style={{ fontSize: '1.375rem', fontWeight: '700', color: '#1c1917' }}>
                                    {previewData.length - conflicts.length}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>New records</div>
                            </div>
                            <div style={summaryCardStyle('warn')}>
                                <div style={{ fontSize: '1.375rem', fontWeight: '700', color: '#92400e' }}>
                                    {conflicts.length}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#92400e', marginTop: '2px' }}>Possible duplicates</div>
                            </div>
                        </div>

                        {/* Bulk action row */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                            <p style={{ fontSize: '0.875rem', color: '#64748b', margin: 0 }}>
                                Choose how to handle each duplicate:
                            </p>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem' }}
                                    onClick={() => setAllConflictActions('skip')}
                                >
                                    Skip all
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem' }}
                                    onClick={() => setAllConflictActions('overwrite')}
                                >
                                    Overwrite all
                                </button>
                            </div>
                        </div>

                        {/* Conflicts table */}
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', marginBottom: '0.75rem' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
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
                                                <td style={{ ...tdStyle, color: '#94a3b8', textAlign: 'center' }}>{idx + 1}</td>
                                                <td style={tdStyle}>
                                                    <div style={{ fontWeight: '600', color: '#1e293b' }}>{inLabel.primary}</div>
                                                    {inLabel.secondary && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{inLabel.secondary}</div>}
                                                </td>
                                                <td style={tdStyle}>
                                                    <div style={{ color: '#1e293b' }}>{exLabel.primary}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{c.matchReason}</div>
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

                        <div style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '1rem' }}>
                            <strong>Skip</strong> leaves the existing record unchanged.&nbsp;
                            <strong>Overwrite</strong> replaces it with the data from your CSV.
                        </div>

                        <div className="modal-actions">
                            <button type="button" className="btn btn-secondary" onClick={() => setStep('preview')}>← Back</button>
                            <button
                                type="button"
                                className="btn"
                                onClick={handleImportFromConflicts}
                                disabled={importing}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: importing ? 0.8 : 1 }}
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
                    <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                        {importStats?.error ? (
                            <>
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
                                    {importStats.partial && importStats.savedCount > 0 ? '⚠️' : '❌'}
                                </div>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '0.5rem', color: importStats.partial && importStats.savedCount > 0 ? '#d97706' : '#ef4444' }}>
                                    {importStats.partial && importStats.savedCount > 0 ? 'Partially Imported' : 'Import Failed'}
                                </h3>
                                <p style={{ color: '#64748b', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                                    {importStats.partial && importStats.savedCount != null
                                        ? importStats.savedCount > 0
                                            ? `${importStats.savedCount} of ${importStats.total} records saved. The remaining ${importStats.total - importStats.savedCount} failed — try re-importing them.`
                                            : `All ${importStats.total} records failed to save. This is likely a server error — please try again.`
                                        : importStats.error}
                                </p>
                                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                                    <button className="btn btn-secondary" onClick={() => setStep('preview')}>← Back</button>
                                    <button className="btn" onClick={onClose}>Close</button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '0.5rem' }}>
                                    Import Complete!
                                </h3>
                                <p style={{ color: '#64748b', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                                    {importType === 'contacts' && ' Any new companies have been added to your Accounts list.'}
                                </p>
                                {/* Results breakdown */}
                                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginBottom: '1.5rem' }}>
                                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.625rem 1.25rem', minWidth: '80px' }}>
                                        <div style={{ fontSize: '1.375rem', fontWeight: '700', color: '#1c1917' }}>{importStats?.total ?? 0}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>imported</div>
                                    </div>
                                    {importStats?.skipped > 0 && (
                                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.625rem 1.25rem', minWidth: '80px' }}>
                                            <div style={{ fontSize: '1.375rem', fontWeight: '700', color: '#64748b' }}>{importStats.skipped}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>skipped</div>
                                        </div>
                                    )}
                                    {importStats?.overwritten > 0 && (
                                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.625rem 1.25rem', minWidth: '80px' }}>
                                            <div style={{ fontSize: '1.375rem', fontWeight: '700', color: '#2563eb' }}>{importStats.overwritten}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>overwritten</div>
                                        </div>
                                    )}
                                </div>
                                <button className="btn" onClick={onClose}>Done</button>
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
