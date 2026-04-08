import React, { useState, useRef } from 'react';
import { useDraggable, useResizable } from '../../hooks/useDraggable';
import ResizeHandles from '../../hooks/ResizeHandles';

const LEAD_FIELDS = [
    { key: 'firstName',    label: 'First Name',     required: true },
    { key: 'lastName',     label: 'Last Name',      required: true },
    { key: 'company',      label: 'Company' },
    { key: 'title',        label: 'Title / Job Title' },
    { key: 'email',        label: 'Email' },
    { key: 'phone',        label: 'Phone' },
    { key: 'source',       label: 'Source' },
    { key: 'status',       label: 'Status' },
    { key: 'score',        label: 'Lead Score (0-100)' },
    { key: 'estimatedARR', label: 'Estimated ARR' },
    { key: 'assignedTo',   label: 'Assigned To' },
    { key: 'notes',        label: 'Notes' },
];

const VALID_STATUSES = ['New','Contacted','Qualified','Working','Converted','Dead'];
const VALID_SOURCES  = ['Web Form','LinkedIn','Trade Show','Referral','CSV Import','Cold List','Email','Other'];

export default function LeadImportModal({ onClose, onImport, existingLeads = [] }) {
    const [step, setStep]               = useState('upload');   // upload | mapping | preview | results
    const [csvHeaders, setCsvHeaders]   = useState([]);
    const [csvRows, setCsvRows]         = useState([]);
    const [fieldMapping, setFieldMapping] = useState({});
    const [parseError, setParseError]   = useState('');
    const [importStats, setImportStats] = useState(null);
    const [importing, setImporting]     = useState(false);
    const fileRef = useRef();

    // ── CSV parser ────────────────────────────────────────────────────────────
    const parseLine = (line) => {
        const result = []; let cur = ''; let inQ = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (inQ) {
                if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; }
                else if (ch === '"') { inQ = false; }
                else { cur += ch; }
            } else {
                if (ch === '"') { inQ = true; }
                else if (ch === ',') { result.push(cur.trim()); cur = ''; }
                else { cur += ch; }
            }
        }
        result.push(cur.trim());
        return result;
    };

    const parseCSV = (text) => {
        setParseError('');
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) { setParseError('CSV must have a header row and at least one data row.'); return; }

        const headers = parseLine(lines[0]);
        const rows    = lines.slice(1).map(parseLine).filter(r => r.some(c => c));

        setCsvHeaders(headers);
        setCsvRows(rows);

        // Auto-map headers → lead fields
        const auto = {};
        LEAD_FIELDS.forEach(field => {
            const fLow = field.label.toLowerCase().replace(/[^a-z]/g, '');
            const kLow = field.key.toLowerCase();
            const idx  = headers.findIndex(h => {
                const hLow = h.toLowerCase().replace(/[^a-z]/g, '');
                return hLow === fLow || hLow === kLow ||
                       hLow.includes(kLow) || kLow.includes(hLow) ||
                       fLow.includes(hLow) || hLow.includes(fLow);
            });
            if (idx !== -1) auto[field.key] = idx;
        });
        setFieldMapping(auto);
        setStep('mapping');
    };

    const handleFile = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => parseCSV(ev.target.result);
        reader.readAsText(file);
    };

    const handlePaste = (e) => {
        const text = e.target.value;
        if (text.includes(',') && text.includes('\n')) parseCSV(text);
    };

    // ── Build preview rows ────────────────────────────────────────────────────
    const buildLeads = () => {
        const existingEmails = new Set(
            existingLeads.map(l => (l.email||'').toLowerCase()).filter(Boolean)
        );
        let added = 0, skipped = 0, errors = [];
        const leads = [];

        csvRows.forEach((row, i) => {
            const get = (key) => {
                const idx = fieldMapping[key];
                return idx !== undefined ? (row[idx] || '').trim() : '';
            };

            const firstName = get('firstName');
            const lastName  = get('lastName');
            if (!firstName && !lastName) { errors.push(`Row ${i+2}: missing first and last name`); skipped++; return; }

            const email = get('email').toLowerCase();
            if (email && existingEmails.has(email)) { skipped++; return; }

            const rawScore  = parseInt(get('score')) || 50;
            const score     = Math.min(100, Math.max(0, rawScore));
            const estARR    = parseFloat((get('estimatedARR')||'').replace(/[$,]/g,'')) || 0;
            const rawStatus = get('status');
            const status    = VALID_STATUSES.includes(rawStatus) ? rawStatus : 'New';
            const rawSource = get('source');
            const source    = VALID_SOURCES.includes(rawSource) ? rawSource : (rawSource || 'CSV Import');

            const id = 'lead_' + Date.now() + '_' + Math.random().toString(36).slice(2,7) + '_' + i;
            leads.push({ id, firstName, lastName, company:get('company'), title:get('title'),
                         email:get('email'), phone:get('phone'), source, status, score,
                         estimatedARR: estARR, assignedTo:get('assignedTo'), notes:get('notes') });
            if (email) existingEmails.add(email);
            added++;
        });
        return { leads, added, skipped, errors };
    };

    const [preview, setPreview] = useState(null);

    const goToPreview = () => {
        const result = buildLeads();
        setPreview(result);
        setStep('preview');
    };

    // ── Import ────────────────────────────────────────────────────────────────
    const doImport = async () => {
        if (!preview || !preview.leads.length) return;
        setImporting(true);
        try {
            await onImport(preview.leads);
            setImportStats({ added: preview.added, skipped: preview.skipped, errors: preview.errors });
            setStep('results');
        } catch (err) {
            setParseError('Import failed: ' + err.message);
        } finally {
            setImporting(false);
        }
    };

    // ── Shared styles ─────────────────────────────────────────────────────────
    const overlay  = { position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'1rem' };
    const { dragHandleProps, dragOffsetStyle, overlayStyle, clickCatcherStyle, containerRef } = useDraggable();
    const { size, getResizeHandleProps } = useResizable(680, 540, 480, 360);
    const modal    = { background:'#fff', borderRadius:'14px', width:'96vw', maxWidth:'680px', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.2)', overflow:'hidden' };
    const hdr      = { padding:'1rem 1.25rem', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 };
    const body     = { padding:'1.25rem', overflowY:'auto', flex:1, minHeight:0 };
    const ftr      = { padding:'0.875rem 1.25rem', borderTop:'1px solid #e2e8f0', display:'flex', justifyContent:'flex-end', gap:'0.625rem', flexShrink:0 };
    const btn      = (bg,color='#fff') => ({ padding:'0.4rem 1rem', border:'none', borderRadius:'7px', background:bg, color, fontSize:'0.8125rem', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' });
    const lblStyle = { fontSize:'0.6875rem', fontWeight:'700', color:'#475569', marginBottom:'0.3rem', display:'block' };
    const selStyle = { width:'100%', padding:'0.35rem 0.5rem', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'0.8125rem', fontFamily:'inherit', background:'#fff', color:'#1e293b' };

    const stepLabel = (s, label, n) => (
        <div style={{ display:'flex', alignItems:'center', gap:'0.375rem' }}>
            <div style={{ width:'20px', height:'20px', borderRadius:'50%', background: step===s?'#2563eb':'#e2e8f0', color:step===s?'#fff':'#94a3b8', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.625rem', fontWeight:'800', flexShrink:0 }}>{n}</div>
            <span style={{ fontSize:'0.75rem', fontWeight:step===s?'700':'500', color:step===s?'#1e293b':'#94a3b8' }}>{label}</span>
        </div>
    );

    return (
        <>
        <div style={{ ...overlayStyle }} />
        <div style={clickCatcherStyle} onClick={e => e.target===e.currentTarget && onClose()} />
        <div ref={containerRef} style={{ ...dragOffsetStyle, ...modal, width: size.w, height: size.h, maxWidth: 'none', maxHeight: 'none' }} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div {...dragHandleProps} style={{ ...dragHandleProps.style, ...hdr }}>
                    <div>
                        <h3 style={{ fontSize:'1rem', fontWeight:'800', color:'#0f172a', margin:0 }}>📥 Import Leads</h3>
                        <p style={{ fontSize:'0.75rem', color:'#64748b', margin:'0.125rem 0 0' }}>Upload a CSV file to bulk-import leads</p>
                    </div>
                    <button onClick={onClose} style={{ background:'none', border:'none', fontSize:'1.25rem', cursor:'pointer', color:'#94a3b8', lineHeight:1 }}>×</button>
                </div>

                {/* Step indicators */}
                <div style={{ padding:'0.625rem 1.25rem', borderBottom:'1px solid #f1f5f9', display:'flex', gap:'1.25rem', background:'#fafbfc' }}>
                    {stepLabel('upload','Upload','1')}
                    <div style={{ color:'#cbd5e1', fontSize:'0.75rem', alignSelf:'center' }}>›</div>
                    {stepLabel('mapping','Map Columns','2')}
                    <div style={{ color:'#cbd5e1', fontSize:'0.75rem', alignSelf:'center' }}>›</div>
                    {stepLabel('preview','Preview','3')}
                    <div style={{ color:'#cbd5e1', fontSize:'0.75rem', alignSelf:'center' }}>›</div>
                    {stepLabel('results','Done','4')}
                </div>

                {/* ── STEP 1: Upload ── */}
                {step === 'upload' && (
                    <>
                    <div style={body}>
                        {parseError && <div style={{ background:'#fee2e2', border:'1px solid #fecaca', borderRadius:'8px', padding:'0.75rem', color:'#dc2626', fontSize:'0.8125rem', marginBottom:'1rem' }}>{parseError}</div>}

                        {/* Drop zone */}
                        <div onClick={() => fileRef.current.click()}
                             style={{ border:'2px dashed #cbd5e1', borderRadius:'10px', padding:'2rem', textAlign:'center', cursor:'pointer', background:'#f8fafc', marginBottom:'1.25rem' }}
                             onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor='#2563eb';}}
                             onDragLeave={e=>{e.currentTarget.style.borderColor='#cbd5e1';}}
                             onDrop={e=>{e.preventDefault();e.currentTarget.style.borderColor='#cbd5e1';const f=e.dataTransfer.files[0];if(f){const r=new FileReader();r.onload=ev=>parseCSV(ev.target.result);r.readAsText(f);}}}>
                            <div style={{ fontSize:'2rem', marginBottom:'0.5rem' }}>📄</div>
                            <div style={{ fontWeight:'700', color:'#1e293b', fontSize:'0.875rem' }}>Click to upload or drag &amp; drop</div>
                            <div style={{ color:'#94a3b8', fontSize:'0.75rem', marginTop:'0.25rem' }}>CSV files only</div>
                            <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display:'none' }} onChange={handleFile} />
                        </div>

                        {/* Paste area */}
                        <div style={{ marginBottom:'1rem' }}>
                            <label style={lblStyle}>Or paste CSV content directly:</label>
                            <textarea onChange={handlePaste} placeholder={"First Name,Last Name,Company,Email,Source\nJohn,Smith,Acme Corp,john@acme.com,LinkedIn"} style={{ width:'100%', height:'120px', padding:'0.625rem', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'0.75rem', fontFamily:'monospace', resize:'vertical', boxSizing:'border-box' }} />
                        </div>

                        {/* Expected columns */}
                        <div style={{ background:'#f8fafc', borderRadius:'8px', padding:'0.875rem', border:'1px solid #e2e8f0' }}>
                            <div style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#475569', marginBottom:'0.5rem', textTransform:'uppercase', letterSpacing:'0.05em' }}>Expected CSV columns</div>
                            <div style={{ display:'flex', flexWrap:'wrap', gap:'0.375rem' }}>
                                {LEAD_FIELDS.map(f => (
                                    <span key={f.key} style={{ padding:'0.15rem 0.5rem', background: f.required?'#dbeafe':'#fff', border:'1px solid '+(f.required?'#93c5fd':'#e2e8f0'), borderRadius:'4px', fontSize:'0.6875rem', color: f.required?'#1d4ed8':'#64748b', fontWeight: f.required?'700':'500' }}>
                                        {f.label}{f.required?' *':''}
                                    </span>
                                ))}
                            </div>
                            <div style={{ fontSize:'0.6875rem', color:'#94a3b8', marginTop:'0.5rem' }}>* Required. Duplicate emails are automatically skipped.</div>
                        </div>
                    </div>
                    <div style={ftr}>
                        <button onClick={onClose} style={btn('#f1f5f9','#475569')}>Cancel</button>
                    </div>
                    </>
                )}

                {/* ── STEP 2: Mapping ── */}
                {step === 'mapping' && (
                    <>
                    <div style={body}>
                        <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'8px', padding:'0.625rem 0.875rem', fontSize:'0.8125rem', color:'#1d4ed8', marginBottom:'1rem' }}>
                            Found <strong>{csvRows.length} rows</strong> and <strong>{csvHeaders.length} columns</strong>. Map your CSV columns to lead fields below.
                        </div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.625rem' }}>
                            {LEAD_FIELDS.map(field => (
                                <div key={field.key}>
                                    <label style={lblStyle}>
                                        {field.label}{field.required && <span style={{ color:'#ef4444' }}> *</span>}
                                    </label>
                                    <select value={fieldMapping[field.key] !== undefined ? fieldMapping[field.key] : ''} onChange={e => setFieldMapping(prev => ({ ...prev, [field.key]: e.target.value === '' ? undefined : parseInt(e.target.value) }))} style={selStyle}>
                                        <option value="">— skip —</option>
                                        {csvHeaders.map((h,i) => <option key={i} value={i}>{h}</option>)}
                                    </select>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div style={ftr}>
                        <button onClick={() => setStep('upload')} style={btn('#f1f5f9','#475569')}>← Back</button>
                        <button onClick={goToPreview} style={btn('#2563eb')}
                            disabled={!LEAD_FIELDS.filter(f=>f.required).every(f => fieldMapping[f.key] !== undefined)}>
                            Preview Import →
                        </button>
                    </div>
                    </>
                )}

                {/* ── STEP 3: Preview ── */}
                {step === 'preview' && preview && (
                    <>
                    <div style={body}>
                        <div style={{ display:'flex', gap:'0.75rem', marginBottom:'1rem', flexWrap:'wrap' }}>
                            <div style={{ background:'#d1fae5', border:'1px solid #a7f3d0', borderRadius:'8px', padding:'0.5rem 0.875rem', textAlign:'center' }}>
                                <div style={{ fontSize:'1.25rem', fontWeight:'800', color:'#047857' }}>{preview.added}</div>
                                <div style={{ fontSize:'0.6875rem', color:'#065f46', fontWeight:'600' }}>Will Import</div>
                            </div>
                            <div style={{ background:'#fef3c7', border:'1px solid #fde68a', borderRadius:'8px', padding:'0.5rem 0.875rem', textAlign:'center' }}>
                                <div style={{ fontSize:'1.25rem', fontWeight:'800', color:'#d97706' }}>{preview.skipped}</div>
                                <div style={{ fontSize:'0.6875rem', color:'#92400e', fontWeight:'600' }}>Skipped (dupes)</div>
                            </div>
                        </div>

                        {preview.errors.length > 0 && (
                            <div style={{ background:'#fee2e2', border:'1px solid #fecaca', borderRadius:'8px', padding:'0.625rem 0.875rem', marginBottom:'1rem' }}>
                                <div style={{ fontSize:'0.75rem', fontWeight:'700', color:'#dc2626', marginBottom:'0.25rem' }}>Rows with issues (will be skipped):</div>
                                {preview.errors.slice(0,5).map((e,i) => <div key={i} style={{ fontSize:'0.75rem', color:'#ef4444' }}>• {e}</div>)}
                                {preview.errors.length > 5 && <div style={{ fontSize:'0.75rem', color:'#ef4444' }}>...and {preview.errors.length-5} more</div>}
                            </div>
                        )}

                        {preview.leads.length > 0 ? (
                            <div style={{ overflowX:'auto', border:'1px solid #e2e8f0', borderRadius:'8px' }}>
                                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.75rem' }}>
                                    <thead><tr>
                                        {['Name','Company','Email','Source','Status','Score','Est. ARR'].map(h => (
                                            <th key={h} style={{ padding:'0.4rem 0.625rem', background:'#f8fafc', borderBottom:'1px solid #e2e8f0', textAlign:'left', fontSize:'0.6rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em', whiteSpace:'nowrap' }}>{h}</th>
                                        ))}
                                    </tr></thead>
                                    <tbody>
                                        {preview.leads.slice(0,10).map((l,i) => (
                                            <tr key={i} style={{ background:i%2===0?'#fff':'#f8fafc' }}>
                                                <td style={{ padding:'0.375rem 0.625rem', borderBottom:'1px solid #f1f5f9', fontWeight:'600' }}>{l.firstName} {l.lastName}</td>
                                                <td style={{ padding:'0.375rem 0.625rem', borderBottom:'1px solid #f1f5f9', color:'#475569' }}>{l.company||'—'}</td>
                                                <td style={{ padding:'0.375rem 0.625rem', borderBottom:'1px solid #f1f5f9', color:'#475569' }}>{l.email||'—'}</td>
                                                <td style={{ padding:'0.375rem 0.625rem', borderBottom:'1px solid #f1f5f9', color:'#475569' }}>{l.source}</td>
                                                <td style={{ padding:'0.375rem 0.625rem', borderBottom:'1px solid #f1f5f9' }}>
                                                    <span style={{ padding:'0.1rem 0.4rem', borderRadius:'999px', fontSize:'0.5625rem', fontWeight:'700', background:'#eff6ff', color:'#2563eb' }}>{l.status}</span>
                                                </td>
                                                <td style={{ padding:'0.375rem 0.625rem', borderBottom:'1px solid #f1f5f9', fontWeight:'700', color: l.score>=70?'#dc2626':l.score>=40?'#d97706':'#2563eb' }}>{l.score}</td>
                                                <td style={{ padding:'0.375rem 0.625rem', borderBottom:'1px solid #f1f5f9', color:'#2563eb', fontWeight:'700' }}>{l.estimatedARR>0?'$'+l.estimatedARR.toLocaleString():'—'}</td>
                                            </tr>
                                        ))}
                                        {preview.leads.length > 10 && (
                                            <tr><td colSpan={7} style={{ padding:'0.375rem 0.625rem', color:'#94a3b8', fontSize:'0.75rem', textAlign:'center' }}>...and {preview.leads.length-10} more</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div style={{ textAlign:'center', padding:'2rem', color:'#94a3b8' }}>No valid leads to import.</div>
                        )}
                    </div>
                    <div style={ftr}>
                        <button onClick={() => setStep('mapping')} style={btn('#f1f5f9','#475569')}>← Back</button>
                        <button onClick={doImport} disabled={importing || preview.leads.length===0} style={btn('#10b981')}>
                            {importing ? 'Importing…' : `✓ Import ${preview.leads.length} Lead${preview.leads.length!==1?'s':''}`}
                        </button>
                    </div>
                    </>
                )}

                {/* ── STEP 4: Results ── */}
                {step === 'results' && importStats && (
                    <>
                    <div style={{ ...body, textAlign:'center', padding:'2rem' }}>
                        <div style={{ fontSize:'3rem', marginBottom:'0.75rem' }}>✅</div>
                        <h3 style={{ fontSize:'1.125rem', fontWeight:'800', color:'#0f172a', marginBottom:'0.5rem' }}>Import Complete</h3>
                        <div style={{ display:'flex', gap:'1rem', justifyContent:'center', margin:'1.25rem 0' }}>
                            <div style={{ background:'#d1fae5', border:'1px solid #a7f3d0', borderRadius:'10px', padding:'0.875rem 1.25rem', textAlign:'center' }}>
                                <div style={{ fontSize:'1.5rem', fontWeight:'800', color:'#047857' }}>{importStats.added}</div>
                                <div style={{ fontSize:'0.75rem', color:'#065f46', fontWeight:'600' }}>Leads Imported</div>
                            </div>
                            {importStats.skipped > 0 && (
                                <div style={{ background:'#fef3c7', border:'1px solid #fde68a', borderRadius:'10px', padding:'0.875rem 1.25rem', textAlign:'center' }}>
                                    <div style={{ fontSize:'1.5rem', fontWeight:'800', color:'#d97706' }}>{importStats.skipped}</div>
                                    <div style={{ fontSize:'0.75rem', color:'#92400e', fontWeight:'600' }}>Skipped</div>
                                </div>
                            )}
                        </div>
                        {importStats.errors.length > 0 && (
                            <div style={{ background:'#fef3c7', borderRadius:'8px', padding:'0.75rem', textAlign:'left', fontSize:'0.75rem', color:'#92400e' }}>
                                <strong>Skipped rows:</strong> {importStats.errors.slice(0,3).join('; ')}{importStats.errors.length>3?` (+${importStats.errors.length-3} more)`:''}
                            </div>
                        )}
                    </div>
                    <div style={ftr}>
                        <button onClick={onClose} style={btn('#2563eb')}>Done</button>
                    </div>
                    </>
                )}
            </div>
            <ResizeHandles getResizeHandleProps={getResizeHandleProps} />
                </>
    );
}
