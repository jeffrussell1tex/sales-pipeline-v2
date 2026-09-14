import React, { useState, useRef } from 'react';
import { useDraggable, useResizable } from '../../hooks/useDraggable';
import ResizeHandles from '../../hooks/ResizeHandles';
import { T } from '../../tokens.js';

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

            const id = 'lead_' + crypto.randomUUID() + '_' + i;
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
        setParseError('');
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
    const { dragHandleProps, dragOffsetStyle, overlayStyle, clickCatcherStyle, clickCatcherProps, containerRef } = useDraggable();
    const { size, getResizeHandleProps } = useResizable(680, 540, 480, 360);
    // The shell CsvImportModal wears (state §0.136): the warm surface, radius 12, a border, the dark drag-handle header.
    const modal    = { background:T.surface, borderRadius:'12px', border:`1px solid ${T.border}`, width:'96vw', maxWidth:'680px', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 12px 40px rgba(0,0,0,0.18)', overflow:'hidden' };
    const hdr      = { padding:'16px 20px', background:'#1c1917', color:T.surface, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0, cursor:'grab', userSelect:'none' };
    const body     = { padding:'1.25rem', overflowY:'auto', flex:1, minHeight:0 };
    const ftr      = { padding:'0.875rem 1.25rem', borderTop:`1px solid ${T.border}`, display:'flex', justifyContent:'flex-end', gap:'0.625rem', flexShrink:0 };
    const btn      = (bg,color=T.surface) => ({ padding:'0.4rem 1rem', border:'none', borderRadius:'7px', background:bg, color, fontSize:'0.8125rem', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' });
    const lblStyle = { fontSize:'0.6875rem', fontWeight:'700', color:T.inkMid, marginBottom:'0.3rem', display:'block' };
    const selStyle = { width:'100%', padding:'0.35rem 0.5rem', border:`1px solid ${T.border}`, borderRadius:'6px', fontSize:'0.8125rem', fontFamily:'inherit', background:T.surface, color:T.ink };

    const stepLabel = (s, label, n) => (
        <div style={{ display:'flex', alignItems:'center', gap:'0.375rem' }}>
            <div style={{ width:'20px', height:'20px', borderRadius:'50%', background: step===s?T.ink:T.border, color:step===s?T.surface:T.inkMuted, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.625rem', fontWeight:'800', flexShrink:0 }}>{n}</div>
            <span style={{ fontSize:'0.75rem', fontWeight:step===s?'700':'500', color:step===s?T.ink:T.inkMuted }}>{label}</span>
        </div>
    );

    return (
        <>
        <div style={{ ...overlayStyle }} />
        <div {...clickCatcherProps} />
        <div ref={containerRef} style={{ ...dragOffsetStyle, ...modal, width: size.w, height: size.h, maxWidth: 'none', maxHeight: 'none' }} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div {...dragHandleProps} style={{ ...dragHandleProps.style, ...hdr }}>
                    <div>
                        <h3 style={{ fontSize:'15px', fontWeight:'600', color:T.surface, margin:0 }}>Import Leads from CSV</h3>
                        <p style={{ fontSize:'0.75rem', color:T.surfaceInkFg, margin:'0.125rem 0 0' }}>Upload a CSV file to bulk-import leads</p>
                    </div>
                    <button onClick={onClose} style={{ background:'none', border:'none', fontSize:'1.25rem', cursor:'pointer', color:T.surfaceInkFg, lineHeight:1 }}>×</button>
                </div>

                {/* Step indicators */}
                <div style={{ padding:'0.625rem 1.25rem', borderBottom:`1px solid ${T.surface2}`, display:'flex', gap:'1.25rem', background:T.surface2 }}>
                    {stepLabel('upload','Upload','1')}
                    <div style={{ color:T.borderStrong, fontSize:'0.75rem', alignSelf:'center' }}>›</div>
                    {stepLabel('mapping','Map Columns','2')}
                    <div style={{ color:T.borderStrong, fontSize:'0.75rem', alignSelf:'center' }}>›</div>
                    {stepLabel('preview','Preview','3')}
                    <div style={{ color:T.borderStrong, fontSize:'0.75rem', alignSelf:'center' }}>›</div>
                    {stepLabel('results','Done','4')}
                </div>

                {/* ── STEP 1: Upload ── */}
                {step === 'upload' && (
                    <>
                    <div style={body}>
                        {parseError && <div style={{ background:`${T.danger}14`, border:`1px solid ${T.danger}33`, borderRadius:'8px', padding:'0.75rem', color:T.danger, fontSize:'0.8125rem', marginBottom:'1rem' }}>{parseError}</div>}

                        {/* Drop zone */}
                        <div onClick={() => fileRef.current.click()}
                             style={{ border:`2px dashed ${T.borderStrong}`, borderRadius:'10px', padding:'2rem', textAlign:'center', cursor:'pointer', background:T.surface2, marginBottom:'1.25rem' }}
                             onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor=T.info;}}
                             onDragLeave={e=>{e.currentTarget.style.borderColor=T.borderStrong;}}
                             onDrop={e=>{e.preventDefault();e.currentTarget.style.borderColor=T.borderStrong;const f=e.dataTransfer.files[0];if(f){const r=new FileReader();r.onload=ev=>parseCSV(ev.target.result);r.readAsText(f);}}}>
                            <div style={{ fontSize:'2rem', marginBottom:'0.5rem' }}>📄</div>
                            <div style={{ fontWeight:'700', color:T.ink, fontSize:'0.875rem' }}>Click to upload or drag &amp; drop</div>
                            <div style={{ color:T.inkMuted, fontSize:'0.75rem', marginTop:'0.25rem' }}>CSV files only</div>
                            <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display:'none' }} onChange={handleFile} />
                        </div>

                        {/* Paste area */}
                        <div style={{ marginBottom:'1rem' }}>
                            <label style={lblStyle}>Or paste CSV content directly:</label>
                            <textarea onChange={handlePaste} placeholder={"First Name,Last Name,Company,Email,Source\nJohn,Smith,Acme Corp,john@acme.com,LinkedIn"} style={{ width:'100%', height:'120px', padding:'0.625rem', border:`1px solid ${T.border}`, borderRadius:'8px', fontSize:'0.75rem', fontFamily:'monospace', resize:'vertical', boxSizing:'border-box' }} />
                        </div>

                        {/* Expected columns */}
                        <div style={{ background:T.surface2, borderRadius:'8px', padding:'0.875rem', border:`1px solid ${T.border}` }}>
                            <div style={{ fontSize:'0.6875rem', fontWeight:'700', color:T.inkMid, marginBottom:'0.5rem', textTransform:'uppercase', letterSpacing:'0.05em' }}>Expected CSV columns</div>
                            <div style={{ display:'flex', flexWrap:'wrap', gap:'0.375rem' }}>
                                {LEAD_FIELDS.map(f => (
                                    <span key={f.key} style={{ padding:'0.15rem 0.5rem', background: f.required?`${T.info}14`:T.surface, border:'1px solid '+(f.required?`${T.info}40`:T.border), borderRadius:'4px', fontSize:'0.6875rem', color: f.required?T.info:T.inkMid, fontWeight: f.required?'700':'500' }}>
                                        {f.label}{f.required?' *':''}
                                    </span>
                                ))}
                            </div>
                            <div style={{ fontSize:'0.6875rem', color:T.inkMuted, marginTop:'0.5rem' }}>* Required. Duplicate emails are automatically skipped.</div>
                        </div>
                    </div>
                    <div style={ftr}>
                        <button onClick={onClose} style={btn(T.surface2,T.inkMid)}>Cancel</button>
                    </div>
                    </>
                )}

                {/* ── STEP 2: Mapping ── */}
                {step === 'mapping' && (
                    <>
                    <div style={body}>
                        <div style={{ background:`${T.info}14`, border:`1px solid ${T.info}14`, borderRadius:'8px', padding:'0.625rem 0.875rem', fontSize:'0.8125rem', color:T.info, marginBottom:'1rem' }}>
                            Found <strong>{csvRows.length} rows</strong> and <strong>{csvHeaders.length} columns</strong>. Map your CSV columns to lead fields below.
                        </div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.625rem' }}>
                            {LEAD_FIELDS.map(field => (
                                <div key={field.key}>
                                    <label style={lblStyle}>
                                        {field.label}{field.required && <span style={{ color:T.danger }}> *</span>}
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
                        <button onClick={() => setStep('upload')} style={btn(T.surface2,T.inkMid)}>← Back</button>
                        <button onClick={goToPreview} style={btn(T.ink)}
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
                        {/* The import request fires from THIS step, but parseError
                            was only ever rendered inside the upload step — so a
                            failed import set an error nobody could see and the
                            modal simply sat there having done nothing. */}
                        {parseError && <div style={{ background:`${T.danger}14`, border:`1px solid ${T.danger}33`, borderRadius:'8px', padding:'0.75rem', color:T.danger, fontSize:'0.8125rem', marginBottom:'1rem' }}>{parseError}</div>}
                        <div style={{ display:'flex', gap:'0.75rem', marginBottom:'1rem', flexWrap:'wrap' }}>
                            <div style={{ background:`${T.ok}18`, border:`1px solid ${T.ok}40`, borderRadius:'8px', padding:'0.5rem 0.875rem', textAlign:'center' }}>
                                <div style={{ fontSize:'1.25rem', fontWeight:'800', color:T.ok }}>{preview.added}</div>
                                <div style={{ fontSize:'0.6875rem', color:T.ok, fontWeight:'600' }}>Will Import</div>
                            </div>
                            <div style={{ background:`${T.warn}18`, border:`1px solid ${T.warn}40`, borderRadius:'8px', padding:'0.5rem 0.875rem', textAlign:'center' }}>
                                <div style={{ fontSize:'1.25rem', fontWeight:'800', color:T.warn }}>{preview.skipped}</div>
                                <div style={{ fontSize:'0.6875rem', color:T.warn, fontWeight:'600' }}>Skipped (dupes)</div>
                            </div>
                        </div>

                        {preview.errors.length > 0 && (
                            <div style={{ background:`${T.danger}14`, border:`1px solid ${T.danger}33`, borderRadius:'8px', padding:'0.625rem 0.875rem', marginBottom:'1rem' }}>
                                <div style={{ fontSize:'0.75rem', fontWeight:'700', color:T.danger, marginBottom:'0.25rem' }}>Rows with issues (will be skipped):</div>
                                {preview.errors.slice(0,5).map((e,i) => <div key={i} style={{ fontSize:'0.75rem', color:T.danger }}>• {e}</div>)}
                                {preview.errors.length > 5 && <div style={{ fontSize:'0.75rem', color:T.danger }}>...and {preview.errors.length-5} more</div>}
                            </div>
                        )}

                        {preview.leads.length > 0 ? (
                            <div style={{ overflowX:'auto', border:`1px solid ${T.border}`, borderRadius:'8px' }}>
                                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.75rem' }}>
                                    <thead><tr>
                                        {['Name','Company','Email','Source','Status','Score','Est. ARR'].map(h => (
                                            <th key={h} style={{ padding:'0.4rem 0.625rem', background:T.surface2, borderBottom:`1px solid ${T.border}`, textAlign:'left', fontSize:'0.6rem', fontWeight:'700', color:T.inkMuted, textTransform:'uppercase', letterSpacing:'0.06em', whiteSpace:'nowrap' }}>{h}</th>
                                        ))}
                                    </tr></thead>
                                    <tbody>
                                        {preview.leads.slice(0,10).map((l,i) => (
                                            <tr key={i} style={{ background:i%2===0?T.surface:T.surface2 }}>
                                                <td style={{ padding:'0.375rem 0.625rem', borderBottom:`1px solid ${T.surface2}`, fontWeight:'600' }}>{l.firstName} {l.lastName}</td>
                                                <td style={{ padding:'0.375rem 0.625rem', borderBottom:`1px solid ${T.surface2}`, color:T.inkMid }}>{l.company||'—'}</td>
                                                <td style={{ padding:'0.375rem 0.625rem', borderBottom:`1px solid ${T.surface2}`, color:T.inkMid }}>{l.email||'—'}</td>
                                                <td style={{ padding:'0.375rem 0.625rem', borderBottom:`1px solid ${T.surface2}`, color:T.inkMid }}>{l.source}</td>
                                                <td style={{ padding:'0.375rem 0.625rem', borderBottom:`1px solid ${T.surface2}` }}>
                                                    <span style={{ padding:'0.1rem 0.4rem', borderRadius:'999px', fontSize:'0.5625rem', fontWeight:'700', background:`${T.info}14`, color:T.info }}>{l.status}</span>
                                                </td>
                                                <td style={{ padding:'0.375rem 0.625rem', borderBottom:`1px solid ${T.surface2}`, fontWeight:'700', color: l.score>=70?T.danger:l.score>=40?T.warn:T.info }}>{l.score}</td>
                                                <td style={{ padding:'0.375rem 0.625rem', borderBottom:`1px solid ${T.surface2}`, color:T.info, fontWeight:'700' }}>{l.estimatedARR>0?'$'+l.estimatedARR.toLocaleString():'—'}</td>
                                            </tr>
                                        ))}
                                        {preview.leads.length > 10 && (
                                            <tr><td colSpan={7} style={{ padding:'0.375rem 0.625rem', color:T.inkMuted, fontSize:'0.75rem', textAlign:'center' }}>...and {preview.leads.length-10} more</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div style={{ textAlign:'center', padding:'2rem', color:T.inkMuted }}>No valid leads to import.</div>
                        )}
                    </div>
                    <div style={ftr}>
                        <button onClick={() => setStep('mapping')} style={btn(T.surface2,T.inkMid)}>← Back</button>
                        <button onClick={doImport} disabled={importing || preview.leads.length===0} style={btn(T.ok)}>
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
                        <h3 style={{ fontSize:'1.125rem', fontWeight:'800', color:T.ink, marginBottom:'0.5rem' }}>Import Complete</h3>
                        <div style={{ display:'flex', gap:'1rem', justifyContent:'center', margin:'1.25rem 0' }}>
                            <div style={{ background:`${T.ok}18`, border:`1px solid ${T.ok}40`, borderRadius:'10px', padding:'0.875rem 1.25rem', textAlign:'center' }}>
                                <div style={{ fontSize:'1.5rem', fontWeight:'800', color:T.ok }}>{importStats.added}</div>
                                <div style={{ fontSize:'0.75rem', color:T.ok, fontWeight:'600' }}>Leads Imported</div>
                            </div>
                            {importStats.skipped > 0 && (
                                <div style={{ background:`${T.warn}18`, border:`1px solid ${T.warn}40`, borderRadius:'10px', padding:'0.875rem 1.25rem', textAlign:'center' }}>
                                    <div style={{ fontSize:'1.5rem', fontWeight:'800', color:T.warn }}>{importStats.skipped}</div>
                                    <div style={{ fontSize:'0.75rem', color:T.warn, fontWeight:'600' }}>Skipped</div>
                                </div>
                            )}
                        </div>
                        {importStats.errors.length > 0 && (
                            <div style={{ background:`${T.warn}18`, borderRadius:'8px', padding:'0.75rem', textAlign:'left', fontSize:'0.75rem', color:T.warn }}>
                                <strong>Skipped rows:</strong> {importStats.errors.slice(0,3).join('; ')}{importStats.errors.length>3?` (+${importStats.errors.length-3} more)`:''}
                            </div>
                        )}
                    </div>
                    <div style={ftr}>
                        <button onClick={onClose} style={btn(T.ink)}>Done</button>
                    </div>
                    </>
                )}
            </div>
            <ResizeHandles getResizeHandleProps={getResizeHandleProps} />
                </>
    );
}
