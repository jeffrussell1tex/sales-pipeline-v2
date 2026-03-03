import React, { useState, useEffect, useRef } from 'react';

export default function CsvImportModal({ importType, contacts, accounts, onClose, onImportContacts, onImportAccounts }) {
    const [step, setStep] = useState('upload'); // upload, mapping, preview, results
    const [csvHeaders, setCsvHeaders] = useState([]);
    const [csvRows, setCsvRows] = useState([]);
    const [fieldMapping, setFieldMapping] = useState({});
    const [parseError, setParseError] = useState('');
    const [importStats, setImportStats] = useState(null);

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

    const appFields = importType === 'contacts' ? contactFields : accountFields;

    const parseCSV = (text) => {
        const lines = text.split(/\r?\n/).filter(l => l.trim());
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
        appFields.forEach(field => {
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
                       (field.key === 'verticalMarket' && (hLower.includes('vertical') || hLower.includes('industry') || hLower.includes('sector')));
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

    const handleImport = () => {
        const data = getMappedData();
        if (importType === 'contacts') {
            onImportContacts(data);
        } else {
            onImportAccounts(data);
        }
        setImportStats({ total: data.length });
        setStep('results');
    };

    const previewData = step === 'preview' ? getMappedData() : [];

    return (
        <div className="modal-overlay">
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', maxHeight: '85vh', overflow: 'auto' }}>
                <h2>Import {importType === 'contacts' ? 'Contacts' : 'Accounts'} from CSV</h2>

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
                            <button type="button" className="btn" onClick={handleImport}>
                                Import {previewData.length} {importType === 'contacts' ? 'Contacts' : 'Accounts'}
                            </button>
                        </div>
                    </div>
                )}

                {step === 'results' && (
                    <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '0.5rem' }}>
                            Import Complete!
                        </h3>
                        <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>
                            Successfully imported <strong>{importStats?.total}</strong> {importType === 'contacts' ? 'contacts' : 'accounts'}.
                            {importType === 'contacts' && ' New companies have been added to your Accounts list.'}
                        </p>
                        <button className="btn" onClick={onClose}>Done</button>
                    </div>
                )}
            </div>
        </div>
    );
}

// Outlook Email Import Modal
