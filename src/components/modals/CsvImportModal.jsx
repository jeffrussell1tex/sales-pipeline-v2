import React, { useState, useEffect, useRef } from 'react';

export default function CsvImportModal({ importType, contacts, accounts, onClose, onImportContacts, onImportAccounts, onImportOpportunities }) {
    const [step, setStep] = useState('upload'); // upload, mapping, preview, results
    const [csvHeaders, setCsvHeaders] = useState([]);
    const [csvRows, setCsvRows] = useState([]);
    const [fieldMapping, setFieldMapping] = useState({});
    const [parseError, setParseError] = useState('');
    const [importStats, setImportStats] = useState(null);
    const [importing, setImporting] = useState(false);
    const [importProgress, setImportProgress] = useState(0);

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

    const appFields = importType === 'contacts' ? contactFields : importType === 'opportunities' ? opportunityFields : accountFields;

    // Helper so auto-mapping always uses the correct field set for the current importType
    const getAppFields = () => importType === 'contacts' ? contactFields : importType === 'opportunities' ? opportunityFields : accountFields;

    const parseCSV = (text) => {
        // Split into logical lines — respecting quoted fields that span multiple lines
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
                    if (ch === '\r') i++; // skip \n of \r\n
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
        
        // Auto-map fields based on header name similarity
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
                       (field.key === 'parentAccount' && (hLower.includes('parent') || hLower.includes('parentaccount') || hLower.includes('parent account')));
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

    const getMappedData = () => {
        return csvRows.map(row => {
            const record = {};
            appFields.forEach(field => {
                const colIdx = fieldMapping[field.key];
                record[field.key] = (colIdx !== undefined && colIdx !== '' && colIdx >= 0) ? (row[colIdx] || '') : '';
            });
            return record;
        }).filter(r => {
            // Must have at least one required field populated
            return appFields.filter(f => f.required).some(f => r[f.key]?.trim());
        });
    };

    const handleImport = async () => {
        const data = getMappedData();
        setImporting(true);
        setImportProgress(0);
        // Expose progress callback so App.jsx batch loop can update it
        window.__importProgressCb = (done, total) => setImportProgress(Math.round((done / total) * 100));
        try {
            if (importType === 'contacts') {
                await onImportContacts(data);
            } else if (importType === 'opportunities') {
                await onImportOpportunities(data);
            } else if (importType === 'accounts') {
                await onImportAccounts(data);
            } else {
                throw new Error(`Unknown import type: "${importType}"`);
            }
            setImportStats({ total: data.length, error: null, partial: false });
        } catch (err) {
            const msg = err.message || '';
            const isPartial = msg.includes('of') && msg.includes('failed to save');
            // Extract how many actually saved on a partial import (e.g. "2 of 5 failed to save" → 3 saved)
            let savedCount = null;
            if (isPartial) {
                const m = msg.match(/(\d+)\s+of\s+(\d+)/);
                if (m) savedCount = parseInt(m[2]) - parseInt(m[1]);
            }
            setImportStats({ total: data.length, error: msg || 'Import failed. Please try again.', partial: isPartial, savedCount });
        }
        window.__importProgressCb = null;
        setImporting(false);
        setImportProgress(0);
        setStep('results');
    };

    const previewData = step === 'preview' ? getMappedData() : [];

    return (
        <div className="modal-overlay">
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', maxHeight: '85vh', overflow: 'auto' }}>
                <h2>Import {importType === 'contacts' ? 'Contacts' : importType === 'opportunities' ? 'Opportunities' : 'Accounts'} from CSV</h2>

                {step === 'upload' && (
                    <div>
                        <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>
                            Upload a CSV file with your {importType}. The first row should contain column headers.
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
                            <div style={{ color: '#ef4444', padding: '0.75rem', background: '#fef2f2', borderRadius: '6px', marginTop: '1rem' }}>
                                {parseError}
                            </div>
                        )}
                        <div className="modal-actions">
                            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                        </div>
                    </div>
                )}

                {step === 'mapping' && (
                    <div>
                        <p style={{ color: '#64748b', marginBottom: '1rem' }}>
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

                {step === 'preview' && (
                    <div>
                        <p style={{ color: '#64748b', marginBottom: '1rem' }}>
                            <strong>{previewData.length}</strong> valid records ready to import. Review a sample below:
                        </p>
                        {importType === 'contacts' && previewData.length > 0 && (
                            <div style={{ fontSize: '0.8125rem', color: '#10b981', marginBottom: '1rem', padding: '0.5rem 0.75rem', background: '#ecfdf5', borderRadius: '6px' }}>
                                💡 Companies from imported contacts will be auto-added to your Accounts list if they don't already exist.
                            </div>
                        )}
                        <div style={{ overflowX: 'auto', maxHeight: '350px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                                <thead>
                                    <tr>
                                        <th style={{ padding: '0.5rem 0.75rem', background: '#f1f3f5', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontWeight: '600', whiteSpace: 'nowrap' }}>#</th>
                                        {appFields.filter(f => fieldMapping[f.key] !== undefined).map(f => (
                                            <th key={f.key} style={{ padding: '0.5rem 0.75rem', background: '#f1f3f5', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontWeight: '600', whiteSpace: 'nowrap' }}>{f.label}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewData.slice(0, 10).map((row, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #f1f3f5' }}>
                                            <td style={{ padding: '0.5rem 0.75rem', color: '#64748b' }}>{idx + 1}</td>
                                            {appFields.filter(f => fieldMapping[f.key] !== undefined).map(f => (
                                                <td key={f.key} style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
                            <button type="button" className="btn" onClick={handleImport} disabled={importing}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: importing ? 0.8 : 1 }}>
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
                                    <>Import {previewData.length} {importType === 'contacts' ? 'Contacts' : importType === 'opportunities' ? 'Opportunities' : 'Accounts'}</>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {step === 'results' && (
                    <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                        {importStats?.error ? (
                            <>
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{importStats.partial ? '⚠️' : '❌'}</div>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '0.5rem', color: importStats.partial ? '#d97706' : '#ef4444' }}>
                                    {importStats.partial ? 'Partially Imported' : 'Import Failed'}
                                </h3>
                                <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>
                                    {importStats.partial && importStats.savedCount != null
                                        ? `${importStats.savedCount} of ${importStats.total} records saved successfully. ${importStats.error}`
                                        : importStats.error}
                                </p>
                                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                                    {!importStats.partial && <button className="btn btn-secondary" onClick={() => setStep('preview')}>← Back</button>}
                                    <button className="btn" onClick={onClose}>{importStats.partial ? 'Done' : 'Close'}</button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '0.5rem' }}>
                                    Import Complete!
                                </h3>
                                <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>
                                    Successfully imported <strong>{importStats?.total}</strong> {importType === 'contacts' ? 'contacts' : importType === 'opportunities' ? 'opportunities' : 'accounts'}.
                                    {importType === 'contacts' && ' Any new companies have been added to your Accounts list.'}
                                </p>
                                <button className="btn" onClick={onClose}>Done</button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// Outlook Email Import Modal
