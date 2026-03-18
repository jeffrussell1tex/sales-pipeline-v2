import React, { useState, useEffect, useRef } from 'react';

export default function OutlookImportModal({ contacts, opportunities, activities, onClose, onImport }) {
    const [step, setStep] = useState('upload'); // upload, preview, results
    const [parsedEmails, setParsedEmails] = useState([]);
    const [matchResults, setMatchResults] = useState([]);
    const [importSelections, setImportSelections] = useState({});
    const [parseError, setParseError] = useState('');
    const [importStats, setImportStats] = useState(null);
    const [filterMatched, setFilterMatched] = useState('all'); // all, matched, unmatched

    // Helper to extract individual emails from a string like "user@email.com; other@email.com"
    const extractEmails = (str) => {
        if (!str) return [];
        return str.split(/[;,]/)
            .map(s => s.trim())
            .map(s => {
                // Handle "Display Name <email@addr.com>" format
                const match = s.match(/<([^>]+)>/);
                return match ? match[1].trim().toLowerCase() : s.toLowerCase();
            })
            .filter(s => s.includes('@'));
    };

    // Match email addresses to contacts
    const matchEmailsToContacts = (emails) => {
        const results = [];
        for (const email of emails) {
            // Extract all recipient emails
            const toEmails = extractEmails(email.to);
            const ccEmails = extractEmails(email.cc);
            const allRecipientEmails = [...toEmails, ...ccEmails];
            
            // Find matching contacts
            const matchedContacts = [];
            for (const recipientEmail of allRecipientEmails) {
                const contact = contacts.find(c => 
                    c.email && c.email.toLowerCase().trim() === recipientEmail
                );
                if (contact && !matchedContacts.find(mc => mc.id === contact.id)) {
                    matchedContacts.push(contact);
                }
            }

            // Also try to match to an opportunity via the matched contact's company
            let matchedOpportunity = null;
            if (matchedContacts.length > 0) {
                for (const mc of matchedContacts) {
                    if (mc.company) {
                        const opp = opportunities.find(o => 
                            o.account && o.account.toLowerCase() === mc.company.toLowerCase()
                        );
                        if (opp) {
                            matchedOpportunity = opp;
                            break;
                        }
                    }
                }
            }

            results.push({
                ...email,
                recipientEmails: allRecipientEmails,
                matchedContacts,
                matchedOpportunity,
                hasMatch: matchedContacts.length > 0
            });
        }
        return results;
    };

    // Parse CSV
    const parseCSV = (text) => {
        const lines = text.split(/\r?\n/);
        if (lines.length < 2) {
            setParseError('The CSV file appears to be empty or has no data rows.');
            return [];
        }

        // Parse header - handle quoted fields
        const parseCSVLine = (line) => {
            const result = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"') {
                    if (inQuotes && line[i + 1] === '"') {
                        current += '"';
                        i++;
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (ch === ',' && !inQuotes) {
                    result.push(current.trim());
                    current = '';
                } else {
                    current += ch;
                }
            }
            result.push(current.trim());
            return result;
        };

        const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
        
        // Identify columns - Outlook CSV uses these typical headers
        const subjectIdx = headers.findIndex(h => h === 'subject' || h === 'subject:');
        const bodyIdx = headers.findIndex(h => h === 'body' || h === 'notes' || h === 'body:');
        const toIdx = headers.findIndex(h => h === 'to' || h === 'to:' || h === 'to: (address)' || h === 'to (address)');
        const ccIdx = headers.findIndex(h => h === 'cc' || h === 'cc:' || h === 'cc: (address)' || h === 'cc (address)');
        const dateIdx = headers.findIndex(h => 
            h === 'date' || h === 'sent' || h === 'date/time' || 
            h === 'date sent' || h === 'start date' || h === 'date:' ||
            h === 'sent on' || h === 'sent date/time' || h === 'creation time'
        );
        const fromIdx = headers.findIndex(h => h === 'from' || h === 'from:' || h === 'from: (address)' || h === 'from (address)' || h === 'sender address' || h === 'sender');

        if (subjectIdx === -1 && toIdx === -1 && dateIdx === -1) {
            setParseError(
                'Could not identify email columns in the CSV. Expected columns like "Subject", "To", "Date", "Body".\n\n' +
                'Found columns: ' + headers.join(', ') + '\n\n' +
                'Make sure you are exporting from Outlook as CSV.'
            );
            return [];
        }

        const emails = [];
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const fields = parseCSVLine(lines[i]);

            const subject = subjectIdx >= 0 ? (fields[subjectIdx] || '').replace(/^"|"$/g, '') : '';
            const body = bodyIdx >= 0 ? (fields[bodyIdx] || '').replace(/^"|"$/g, '') : '';
            const to = toIdx >= 0 ? (fields[toIdx] || '').replace(/^"|"$/g, '') : '';
            const cc = ccIdx >= 0 ? (fields[ccIdx] || '').replace(/^"|"$/g, '') : '';
            const dateRaw = dateIdx >= 0 ? (fields[dateIdx] || '').replace(/^"|"$/g, '') : '';
            const from = fromIdx >= 0 ? (fields[fromIdx] || '').replace(/^"|"$/g, '') : '';

            // Try to parse the date
            let date = '';
            if (dateRaw) {
                const parsed = new Date(dateRaw);
                if (!isNaN(parsed.getTime())) {
                    date = parsed.toISOString().split('T')[0];
                } else {
                    date = dateRaw;
                }
            }

            if (subject || to || date) {
                emails.push({ subject, body, to, cc, date, from, rowIndex: i });
            }
        }

        return emails;
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setParseError('');

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const emails = parseCSV(event.target.result);
                if (emails.length === 0 && !parseError) {
                    setParseError('No email records found in the file.');
                    return;
                }
                setParsedEmails(emails);
                const results = matchEmailsToContacts(emails);
                setMatchResults(results);
                
                // Pre-select all matched emails
                const selections = {};
                results.forEach((r, idx) => {
                    selections[idx] = r.hasMatch;
                });
                setImportSelections(selections);
                setStep('preview');
            } catch (err) {
                setParseError('Error parsing CSV file: ' + err.message);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const handleImport = () => {
        const toImport = matchResults.filter((_, idx) => importSelections[idx]);
        const newActivities = toImport.map(email => ({
            type: 'Email',
            date: email.date || [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-'),
            contactId: email.matchedContacts.length > 0 ? email.matchedContacts[0].id : '',
            opportunityId: email.matchedOpportunity ? email.matchedOpportunity.id : '',
            notes: `Subject: ${email.subject}${email.to ? '\nTo: ' + email.to : ''}${email.cc ? '\nCC: ' + email.cc : ''}${email.body ? '\n\n' + email.body.substring(0, 500) + (email.body.length > 500 ? '...' : '') : ''}`,
            source: 'outlook-import'
        }));

        const matched = toImport.filter(e => e.hasMatch).length;
        const unmatched = toImport.filter(e => !e.hasMatch).length;
        
        setImportStats({ total: toImport.length, matched, unmatched });
        onImport(newActivities);
        setStep('results');
    };

    const toggleSelection = (idx) => {
        setImportSelections({ ...importSelections, [idx]: !importSelections[idx] });
    };

    const selectAll = () => {
        const newSelections = {};
        const filtered = getFilteredResults();
        filtered.forEach(r => { newSelections[r._idx] = true; });
        setImportSelections({ ...importSelections, ...newSelections });
    };

    const deselectAll = () => {
        const newSelections = {};
        const filtered = getFilteredResults();
        filtered.forEach(r => { newSelections[r._idx] = false; });
        setImportSelections({ ...importSelections, ...newSelections });
    };

    const getFilteredResults = () => {
        let filtered = matchResults.map((r, idx) => ({ ...r, _idx: idx }));
        if (filterMatched === 'matched') filtered = filtered.filter(r => r.hasMatch);
        if (filterMatched === 'unmatched') filtered = filtered.filter(r => !r.hasMatch);
        return filtered;
    };

    const totalMatched = matchResults.filter(r => r.hasMatch).length;
    const totalUnmatched = matchResults.filter(r => !r.hasMatch).length;
    const selectedCount = Object.values(importSelections).filter(Boolean).length;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', maxHeight: '90vh' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h2 style={{ margin: 0 }}>📧 Import Outlook Sent Emails</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}>×</button>
                </div>

                {step === 'upload' && (
                    <div>
                        <div style={{ 
                            padding: '1.25rem', 
                            background: '#f1f3f5', 
                            borderRadius: '8px', 
                            marginBottom: '1.5rem',
                            border: '1px solid #e2e8f0'
                        }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '0.75rem' }}>How to export from Outlook:</h3>
                            <ol style={{ paddingLeft: '1.25rem', color: '#64748b', fontSize: '0.875rem', lineHeight: '1.8' }}>
                                <li>Open <strong>Outlook Desktop</strong> → File → Open & Export → <strong>Import/Export</strong></li>
                                <li>Choose <strong>"Export to a file"</strong> → Next</li>
                                <li>Select <strong>"Comma Separated Values"</strong> → Next</li>
                                <li>Select the <strong>"Sent Items"</strong> folder (or any mail folder) → Next</li>
                                <li>Choose a save location and click <strong>Finish</strong></li>
                            </ol>
                            <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#ffffff', borderRadius: '6px', fontSize: '0.8125rem', color: '#64748b' }}>
                                <strong>Tip:</strong> The importer will match emails to contacts using the email addresses in the "To" and "CC" fields. Make sure your contacts have email addresses saved for the best match rate.
                            </div>
                        </div>

                        {parseError && (
                            <div style={{ 
                                padding: '1rem', 
                                background: '#fef2f2', 
                                border: '1px solid #ef4444', 
                                borderRadius: '6px', 
                                marginBottom: '1rem',
                                color: '#991b1b',
                                fontSize: '0.875rem',
                                whiteSpace: 'pre-line'
                            }}>
                                ❌ {parseError}
                            </div>
                        )}

                        <div style={{
                            border: '2px dashed var(--border-color)',
                            borderRadius: '12px',
                            padding: '3rem 2rem',
                            textAlign: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                        onClick={() => document.getElementById('outlook-csv-input').click()}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.background = '#f1f3f5'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = 'transparent'; }}
                        onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.background = '#f1f3f5'; }}
                        onDragLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = 'transparent'; }}
                        onDrop={e => {
                            e.preventDefault();
                            e.currentTarget.style.borderColor = '#e2e8f0';
                            e.currentTarget.style.background = 'transparent';
                            const file = e.dataTransfer.files[0];
                            if (file) {
                                const fakeEvent = { target: { files: [file], value: '' } };
                                handleFileUpload(fakeEvent);
                            }
                        }}
                        >
                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📂</div>
                            <div style={{ fontSize: '1rem', fontWeight: '600', color: '#1e293b', marginBottom: '0.5rem' }}>
                                Drop your Outlook CSV file here, or click to browse
                            </div>
                            <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                                Supports .csv files exported from Outlook
                            </div>
                            <input
                                type="file"
                                accept=".csv"
                                id="outlook-csv-input"
                                style={{ display: 'none' }}
                                onChange={handleFileUpload}
                            />
                        </div>
                    </div>
                )}

                {step === 'preview' && (
                    <div>
                        {/* Summary Bar */}
                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                            <div style={{ padding: '0.75rem 1.25rem', background: '#f1f3f5', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#1e293b' }}>{matchResults.length}</div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '600' }}>TOTAL EMAILS</div>
                            </div>
                            <div style={{ padding: '0.75rem 1.25rem', background: '#d1fae5', borderRadius: '6px', border: '1px solid #86efac' }}>
                                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#047857' }}>{totalMatched}</div>
                                <div style={{ fontSize: '0.7rem', color: '#065f46', fontWeight: '600' }}>CONTACT MATCHED</div>
                            </div>
                            <div style={{ padding: '0.75rem 1.25rem', background: '#fef3c7', borderRadius: '6px', border: '1px solid #fcd34d' }}>
                                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#92400e' }}>{totalUnmatched}</div>
                                <div style={{ fontSize: '0.7rem', color: '#78350f', fontWeight: '600' }}>NO MATCH</div>
                            </div>
                            <div style={{ padding: '0.75rem 1.25rem', background: '#dbeafe', borderRadius: '6px', border: '1px solid #93c5fd' }}>
                                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#1e40af' }}>{selectedCount}</div>
                                <div style={{ fontSize: '0.7rem', color: '#1e3a8a', fontWeight: '600' }}>SELECTED</div>
                            </div>
                        </div>

                        {/* Filter and Select Controls */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                {['all', 'matched', 'unmatched'].map(f => (
                                    <button
                                        key={f}
                                        onClick={() => setFilterMatched(f)}
                                        style={{
                                            padding: '0.375rem 0.75rem',
                                            borderRadius: '4px',
                                            border: '1px solid #e2e8f0',
                                            background: filterMatched === f ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                                            color: filterMatched === f ? 'white' : 'var(--text-secondary)',
                                            cursor: 'pointer',
                                            fontSize: '0.8125rem',
                                            fontWeight: '600'
                                        }}
                                    >
                                        {f === 'all' ? 'All' : f === 'matched' ? '✓ Matched' : '✗ Unmatched'}
                                    </button>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="action-btn" onClick={selectAll}>Select All Visible</button>
                                <button className="action-btn" onClick={deselectAll}>Deselect All Visible</button>
                            </div>
                        </div>

                        {/* Email List */}
                        <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                            {getFilteredResults().length === 0 ? (
                                <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                                    No emails match this filter
                                </div>
                            ) : (
                                getFilteredResults().map((email) => (
                                    <div key={email._idx} style={{
                                        padding: '0.875rem 1rem',
                                        borderBottom: '1px solid #e2e8f0',
                                        display: 'flex',
                                        gap: '0.75rem',
                                        alignItems: 'flex-start',
                                        background: importSelections[email._idx] ? 'var(--bg-tertiary)' : 'transparent',
                                        transition: 'background 0.15s'
                                    }}>
                                        <input
                                            type="checkbox"
                                            checked={importSelections[email._idx] || false}
                                            onChange={() => toggleSelection(email._idx)}
                                            style={{ marginTop: '0.2rem', cursor: 'pointer', flexShrink: 0 }}
                                        />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: '600', fontSize: '0.875rem', marginBottom: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {email.subject || '(No subject)'}
                                            </div>
                                            <div style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                To: {email.to || '-'}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                                {email.date || 'No date'}
                                            </div>
                                        </div>
                                        <div style={{ flexShrink: 0, textAlign: 'right' }}>
                                            {email.hasMatch ? (
                                                <div>
                                                    <span style={{
                                                        background: '#d1fae5',
                                                        color: '#047857',
                                                        padding: '0.2rem 0.5rem',
                                                        borderRadius: '4px',
                                                        fontSize: '0.7rem',
                                                        fontWeight: '600'
                                                    }}>
                                                        ✓ Matched
                                                    </span>
                                                    <div style={{ fontSize: '0.75rem', color: '#2563eb', marginTop: '0.25rem', fontWeight: '600' }}>
                                                        {email.matchedContacts.map(c => `${c.firstName} ${c.lastName}`).join(', ')}
                                                    </div>
                                                    {email.matchedOpportunity && (
                                                        <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.125rem' }}>
                                                            Opp: {email.matchedOpportunity.account}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <span style={{
                                                    background: '#fef3c7',
                                                    color: '#92400e',
                                                    padding: '0.2rem 0.5rem',
                                                    borderRadius: '4px',
                                                    fontSize: '0.7rem',
                                                    fontWeight: '600'
                                                }}>
                                                    No match
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Actions */}
                        <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
                            <button className="btn btn-secondary" onClick={() => { setStep('upload'); setParsedEmails([]); setMatchResults([]); setParseError(''); }}>
                                ← Back
                            </button>
                            <button className="btn btn-secondary" onClick={onClose}>
                                Cancel
                            </button>
                            <button 
                                className="btn" 
                                onClick={handleImport}
                                disabled={selectedCount === 0}
                                style={{ opacity: selectedCount === 0 ? 0.5 : 1 }}
                            >
                                Import {selectedCount} Email{selectedCount !== 1 ? 's' : ''} as Activities
                            </button>
                        </div>
                    </div>
                )}

                {step === 'results' && (
                    <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✅</div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1rem' }}>Import Complete!</h3>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginBottom: '2rem' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '2rem', fontWeight: '800', color: '#2563eb' }}>{importStats?.total || 0}</div>
                                <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>Activities Created</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '2rem', fontWeight: '800', color: '#10b981' }}>{importStats?.matched || 0}</div>
                                <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>Linked to Contacts</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '2rem', fontWeight: '800', color: '#f59e0b' }}>{importStats?.unmatched || 0}</div>
                                <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>Unlinked</div>
                            </div>
                        </div>
                        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                            Imported emails appear in your Activity Timeline as "Email" activities. Matched emails are automatically linked to their corresponding contacts{importStats?.matched > 0 ? ' and opportunities' : ''}.
                        </p>
                        <button className="btn" onClick={onClose}>Done</button>
                    </div>
                )}
            </div>
        </div>
    );
}

// Pipelines Settings Panel Component
