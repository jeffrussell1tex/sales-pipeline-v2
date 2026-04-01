import React, { useState, useEffect, useRef } from 'react';
import { useDraggable } from '../../hooks/useDraggable';

export default function ContactModal({ contact, contacts, accounts, settings, onClose, onSave, onSaveNewContact, onAddAccount, errorMessage, onDismissError, saving }) {
    const [formData, setFormData] = useState(contact || {
        prefix: '', firstName: '', middleName: '', lastName: '', suffix: '', nickName: '',
        title: '', company: '', department: '', workLocation: '',
        email: '', personalEmail: '', phone: '', mobile: '',
        address: '', city: '', state: '', zip: '', country: '',
        managers: [], directReports: [], assistantName: '',
        homeAddress: '', notes: ''
    });

    const [activeContactTab, setActiveContactTab] = useState('primary');
    const [companySearch, setCompanySearch] = useState(contact?.company || '');
    const [showCompanySuggestions, setShowCompanySuggestions] = useState(false);
    const [managerSearch, setManagerSearch] = useState('');
    const [showManagerSuggestions, setShowManagerSuggestions] = useState(false);
    const [reportSearch, setReportSearch] = useState('');
    const [showReportSuggestions, setShowReportSuggestions] = useState(false);
    const [contactRepSearch, setContactRepSearch] = useState(contact?.assignedRep || '');
    const [showContactRepSuggestions, setShowContactRepSuggestions] = useState(false);

    const [nestedModal, setNestedModal] = useState(null);

    const contactAllRepNames = [...new Set([
        ...(settings?.users || []).filter(u => u.name).map(u => u.name)
    ])].sort();
    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleCompanyChange = (value) => {
        setCompanySearch(value);
        setShowCompanySuggestions(value.length > 0);
    };

    const handleSelectCompany = (companyName) => {
        // Find the matching account and inherit address fields (excluding phone)
        const matchedAccount = (accounts || []).find(a => a.name === companyName);
        setFormData(prev => ({
            ...prev,
            company: companyName,
            // Only auto-fill if field is currently empty (don't overwrite existing data)
            address:  prev.address  || matchedAccount?.address  || '',
            city:     prev.city     || matchedAccount?.city     || '',
            state:    prev.state    || matchedAccount?.state    || '',
            zip:      prev.zip      || matchedAccount?.zip      || '',
            country:  prev.country  || matchedAccount?.country  || '',
        }));
        setCompanySearch(companyName);
        setShowCompanySuggestions(false);
    };

    const handleAddNewAccount = () => {
        const newAccountName = companySearch.trim();
        if (newAccountName) {
            setFormData(prev => ({ ...prev, company: newAccountName }));
            setShowCompanySuggestions(false);
            onAddAccount();
        }
    };

    const [duplicateContactWarning, setDuplicateContactWarning] = useState(null);
    const { dragHandleProps, dragOffsetStyle } = useDraggable();

    const handleSubmit = (e) => {
        e.preventDefault();
        const saveData = { ...formData, company: companySearch, assignedRep: contactRepSearch };
        // Check for duplicate contact (only for new contacts)
        if (!contact && contacts) {
            const dup = contacts.find(c =>
                c.firstName.toLowerCase().trim() === saveData.firstName.toLowerCase().trim() &&
                c.lastName.toLowerCase().trim() === saveData.lastName.toLowerCase().trim()
            );
            if (dup && !duplicateContactWarning) {
                setDuplicateContactWarning(dup);
                return;
            }
        }
        onSave(saveData);
    };

    const filteredAccounts = accounts.filter(acc =>
        acc.name.toLowerCase().startsWith(companySearch.toLowerCase())
    );

    const allContacts = (contacts || []).filter(c => !contact || c.id !== contact.id);

    const openNestedNewContact = (fieldName, searchText) => {
        const parts = (searchText || '').trim().split(/\s+/);
        setNestedModal({ fieldName, firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || '' });
        setManagerSearch('');
        setReportSearch('');
        setShowManagerSuggestions(false);
        setShowReportSuggestions(false);
    };

    const handleNestedSave = (newData) => {
        if (onSaveNewContact && nestedModal) {
            const saved = onSaveNewContact(newData);
            if (saved) {
                const fullName = ((saved.firstName || '') + ' ' + (saved.lastName || '')).trim();
                const field = nestedModal.fieldName;
                setFormData(prev => ({
                    ...prev,
                    [field]: [...(prev[field] || []), { id: saved.id, name: fullName }]
                }));
            }
        }
        setNestedModal(null);
    };

    const ContactSearchField = ({ label, searchVal, setSearchVal, showSugg, setShowSugg, selectedItems, fieldName }) => {
        const hasSearch = searchVal.trim().length > 0;
        const filtered = hasSearch
            ? allContacts.filter(c =>
                ((c.firstName + ' ' + c.lastName).toLowerCase().startsWith(searchVal.toLowerCase()) ||
                c.firstName.toLowerCase().startsWith(searchVal.toLowerCase()) ||
                c.lastName.toLowerCase().startsWith(searchVal.toLowerCase())) &&
                !(selectedItems || []).some(s => s.id === c.id)
            ) : [];
        const showDropdown = showSugg && hasSearch;
        return (
            <div className="form-group full" style={{ position: 'relative' }}>
                <label>{label}</label>
                {(selectedItems || []).length > 0 && (
                    <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '0.375rem' }}>
                        {(selectedItems || []).map((p, i) => (
                            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', background: '#dbeafe', color: '#1e40af', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600' }}>
                                {p.name}
                                <button type="button" onClick={() => handleChange(fieldName, selectedItems.filter((_, idx) => idx !== i))}
                                    style={{ background: 'none', border: 'none', color: '#1e40af', cursor: 'pointer', fontSize: '0.875rem', padding: 0, lineHeight: 1 }}>×</button>
                            </span>
                        ))}
                    </div>
                )}
                <input type="text" value={searchVal}
                    placeholder="Type to search contacts..."
                    onChange={e => { setSearchVal(e.target.value); setShowSugg(e.target.value.trim().length > 0); }}
                    onBlur={() => setTimeout(() => setShowSugg(false), 250)}
                    autoComplete="off" />
                {showDropdown && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', marginTop: '0.25rem', maxHeight: '200px', overflowY: 'auto', zIndex: 1000, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                        {filtered.slice(0, 8).map(c => (
                            <div key={c.id} onMouseDown={e => e.preventDefault()}
                                onClick={() => { handleChange(fieldName, [...(selectedItems || []), { id: c.id, name: c.firstName + ' ' + c.lastName }]); setSearchVal(''); setShowSugg(false); }}
                                style={{ padding: '0.625rem 0.75rem', cursor: 'pointer', fontSize: '0.875rem', borderBottom: '1px solid #f1f3f5' }}
                                onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <strong>{c.firstName} {c.lastName}</strong>{c.title ? <span style={{ color: '#64748b' }}> — {c.title}</span> : ''}{c.company ? <span style={{ color: '#94a3b8' }}> ({c.company})</span> : ''}
                            </div>
                        ))}
                        <div onMouseDown={e => e.preventDefault()}
                            onClick={() => openNestedNewContact(fieldName, searchVal)}
                            style={{ padding: '0.625rem 0.75rem', cursor: 'pointer', color: '#2563eb', fontWeight: '600', fontSize: '0.875rem', borderTop: filtered.length > 0 ? '1px solid #e2e8f0' : 'none' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            + New Contact
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const tabBtnStyle = (active) => ({
        padding: '0.625rem 1.5rem', borderRadius: '4px', border: 'none', cursor: 'pointer',
        fontWeight: '700', fontSize: '0.8125rem', fontFamily: 'inherit', transition: 'all 0.2s',
        background: active ? '#ffffff' : 'transparent',
        color: active ? '#1e293b' : '#64748b',
        boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
    });

    return (
        <>
        {errorMessage && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}
                 onClick={e => e.stopPropagation()}>
                <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: '2rem', maxWidth: '420px', width: '90%', textAlign: 'center' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '1.5rem' }}>⚠️</div>
                    <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.0625rem', fontWeight: '700', color: '#1e293b' }}>Failed to Save Contact</h3>
                    <p style={{ margin: '0 0 1.5rem', fontSize: '0.875rem', color: '#64748b', lineHeight: 1.6 }}>{errorMessage}</p>
                    <button
                        onClick={onDismissError}
                        style={{ padding: '0.5rem 1.5rem', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#1e293b', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                        OK
                    </button>
                </div>
            </div>
        )}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ ...dragOffsetStyle, maxWidth: '650px', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* ── Drag handle header bar ── */}
                <div {...dragHandleProps} style={{ ...dragHandleProps.style, background: '#1c1917', padding: '0.875rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '12px 12px 0 0', minHeight: '52px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: '700', color: '#f5f1eb', cursor: 'inherit', userSelect: 'none' }}>
                        {contact ? 'Edit Contact' : 'New Contact'}
                    </h2>
                    <span style={{ fontSize: '0.6875rem', color: 'rgba(245,241,235,0.35)', fontWeight: '500', letterSpacing: '0.03em' }}>⠿ drag</span>
                </div>
                <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, minHeight: 0 }}>

                <div style={{ display: 'flex', background: '#f1f3f5', borderRadius: '6px', padding: '3px', marginBottom: '1.25rem' }}>
                    <button type="button" onClick={() => setActiveContactTab('primary')} style={tabBtnStyle(activeContactTab === 'primary')}>Primary Info</button>
                    <button type="button" onClick={() => setActiveContactTab('additional')} style={tabBtnStyle(activeContactTab === 'additional')}>Additional Info</button>
                </div>

                <form onSubmit={handleSubmit}>
                    {activeContactTab === 'primary' && (
                    <div className="form-grid">
                        <div className="form-group" style={{ gridColumn: 'span 1' }}>
                            <label>Prefix</label>
                            <select value={formData.prefix || ''} onChange={e => handleChange('prefix', e.target.value)}>
                                <option value="">—</option>
                                <option value="Mr.">Mr.</option><option value="Mrs.">Mrs.</option><option value="Ms.">Ms.</option><option value="Dr.">Dr.</option><option value="Prof.">Prof.</option>
                            </select>
                        </div>
                        <div className="form-group"><label>First Name*</label><input type="text" value={formData.firstName} onChange={e => handleChange('firstName', e.target.value)} required /></div>
                        <div className="form-group"><label>Middle Name</label><input type="text" value={formData.middleName || ''} onChange={e => handleChange('middleName', e.target.value)} /></div>
                        <div className="form-group"><label>Last Name*</label><input type="text" value={formData.lastName} onChange={e => handleChange('lastName', e.target.value)} required /></div>
                        <div className="form-group"><label>Suffix</label><input type="text" value={formData.suffix || ''} onChange={e => handleChange('suffix', e.target.value)} /></div>
                        <div className="form-group"><label>Nick Name</label><input type="text" value={formData.nickName || ''} onChange={e => handleChange('nickName', e.target.value)} /></div>
                        <div className="form-group full"><label>Title</label><input type="text" value={formData.title} onChange={e => handleChange('title', e.target.value)} /></div>
                        <div className="form-group full" style={{ position: 'relative' }}>
                            <label>Company</label>
                            <input type="text" value={companySearch} onChange={e => handleCompanyChange(e.target.value)}
                                onFocus={() => setShowCompanySuggestions(companySearch.length > 0)} autoComplete="off" />
                            {showCompanySuggestions && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', marginTop: '0.25rem', maxHeight: '200px', overflowY: 'auto', zIndex: 1000, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                                    {filteredAccounts.map(acc => (
                                        <div key={acc.id} onClick={() => handleSelectCompany(acc.name)}
                                            style={{ padding: '0.75rem', cursor: 'pointer', borderBottom: '1px solid #e2e8f0', transition: 'background 0.2s' }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{acc.name}</div>
                                    ))}
                                    <div onClick={handleAddNewAccount} style={{ padding: '0.75rem', cursor: 'pointer', color: '#2563eb', fontWeight: '600' }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>+ Add New Account</div>
                                </div>
                            )}
                        </div>
                        <div className="form-group"><label>Department</label><input type="text" value={formData.department || ''} onChange={e => handleChange('department', e.target.value)} /></div>
                        <div className="form-group"><label>Work Location</label><input type="text" value={formData.workLocation || ''} onChange={e => handleChange('workLocation', e.target.value)} /></div>
                        <div className="form-group"><label>Work Email</label><input type="email" value={formData.email} onChange={e => handleChange('email', e.target.value)} /></div>
                        <div className="form-group"><label>Personal Email</label><input type="email" value={formData.personalEmail || ''} onChange={e => handleChange('personalEmail', e.target.value)} /></div>
                        <div className="form-group"><label>Work Phone</label><input type="tel" value={formData.phone} onChange={e => handleChange('phone', e.target.value)} /></div>
                        <div className="form-group"><label>Mobile</label><input type="tel" value={formData.mobile} onChange={e => handleChange('mobile', e.target.value)} /></div>
                        <div className="form-group full"><label>Street Address</label><input type="text" value={formData.address} onChange={e => handleChange('address', e.target.value)} /></div>
                        <div className="form-group"><label>City</label><input type="text" value={formData.city} onChange={e => handleChange('city', e.target.value)} /></div>
                        <div className="form-group"><label>State</label><input type="text" value={formData.state} onChange={e => handleChange('state', e.target.value)} /></div>
                        <div className="form-group"><label>ZIP Code</label><input type="text" value={formData.zip} onChange={e => handleChange('zip', e.target.value)} /></div>
                        <div className="form-group"><label>Country</label><input type="text" value={formData.country} onChange={e => handleChange('country', e.target.value)} /></div>

                        {/* Assign Rep */}
                        <div className="form-group" style={{ position: 'relative' }}>
                            <label>Assign Rep</label>
                            <input type="text" value={contactRepSearch}
                                onChange={e => { setContactRepSearch(e.target.value); setShowContactRepSuggestions(true); }}
                                onFocus={() => setShowContactRepSuggestions(true)}
                                onBlur={() => setTimeout(() => setShowContactRepSuggestions(false), 200)}
                                placeholder="Type or select rep..." autoComplete="off" />
                            {showContactRepSuggestions && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', marginTop: '0.25rem', maxHeight: '180px', overflowY: 'auto', zIndex: 1000, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                                    {contactAllRepNames.filter(r => r.toLowerCase().includes(contactRepSearch.toLowerCase())).map((r, i) => (
                                        <div key={i} onMouseDown={e => e.preventDefault()}
                                            onClick={() => { setContactRepSearch(r); setShowContactRepSuggestions(false); }}
                                            style={{ padding: '0.625rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f1f3f5', fontSize: '0.875rem', fontWeight: '600' }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{r}</div>
                                    ))}
                                    {contactAllRepNames.filter(r => r.toLowerCase().includes(contactRepSearch.toLowerCase())).length === 0 && (
                                        <div style={{ padding: '0.625rem 0.75rem', color: '#94a3b8', fontSize: '0.8125rem' }}>No reps found — add in Settings</div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                    )}

                    {activeContactTab === 'additional' && (
                    <div className="form-grid">
                        <ContactSearchField label="Manager(s)" searchVal={managerSearch} setSearchVal={setManagerSearch}
                            showSugg={showManagerSuggestions} setShowSugg={setShowManagerSuggestions}
                            selectedItems={formData.managers || []} fieldName="managers" />
                        <ContactSearchField label="Direct Report(s)" searchVal={reportSearch} setSearchVal={setReportSearch}
                            showSugg={showReportSuggestions} setShowSugg={setShowReportSuggestions}
                            selectedItems={formData.directReports || []} fieldName="directReports" />
                        <div className="form-group full"><label>Assistant's Name</label><input type="text" value={formData.assistantName || ''} onChange={e => handleChange('assistantName', e.target.value)} /></div>
                        <div className="form-group full"><label>Home Address</label><input type="text" value={formData.homeAddress || ''} onChange={e => handleChange('homeAddress', e.target.value)} /></div>
                        <div className="form-group full"><label>Notes</label>
                            <textarea value={formData.notes || ''} onChange={e => handleChange('notes', e.target.value)}
                                rows="4" style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.875rem', fontFamily: 'inherit', resize: 'vertical' }} />
                        </div>
                    </div>
                    )}

                    {duplicateContactWarning && (
                        <div style={{ margin: '0 0 1rem', padding: '1rem', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px' }}>
                            <div style={{ fontWeight: '700', color: '#92400e', marginBottom: '0.5rem' }}>⚠ Duplicate Contact Found</div>
                            <div style={{ fontSize: '0.875rem', color: '#78350f', marginBottom: '0.75rem' }}>
                                A contact named <strong>"{duplicateContactWarning.firstName} {duplicateContactWarning.lastName}"</strong>{duplicateContactWarning.company ? ` at ${duplicateContactWarning.company}` : ''} already exists. Would you like to create a duplicate?
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button type="button" onClick={() => { setDuplicateContactWarning(null); onSave({ ...formData, company: companySearch }); }}
                                    style={{ padding: '0.375rem 0.75rem', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: '600', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'inherit' }}>Yes, Create Duplicate</button>
                                <button type="button" onClick={() => setDuplicateContactWarning(null)}
                                    style={{ padding: '0.375rem 0.75rem', background: '#fff', color: '#64748b', border: '1px solid #d1d5db', borderRadius: '4px', fontWeight: '600', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'inherit' }}>Cancel</button>
                            </div>
                        </div>
                    )}

                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
                            Cancel
                        </button>
                        <button type="submit" className="btn" disabled={saving} style={{ opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {saving && <span style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />}
                            {saving ? 'Saving…' : (contact ? 'Update' : 'Create')}
                        </button>
                    </div>
                </form>
                </div>{/* end padding wrapper */}
            </div>

            {nestedModal && (
                <div className="modal-overlay" style={{ zIndex: 2000 }} onClick={() => setNestedModal(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <h2 style={{ marginBottom: '1rem' }}>New Contact</h2>
                        <NestedNewContactForm firstName={nestedModal.firstName} lastName={nestedModal.lastName}
                            onSave={handleNestedSave} onCancel={() => setNestedModal(null)} />
                    </div>
                </div>
            )}
        </div>
        </>
    );
}

export function NestedNewContactForm({ firstName, lastName, onSave, onCancel }) {
    const [fd, setFd] = useState({ firstName: firstName || '', lastName: lastName || '', title: '', company: '', email: '', phone: '', mobile: '' });
    const hc = (f, v) => setFd(prev => ({ ...prev, [f]: v }));
    return (
        <form onSubmit={e => { e.preventDefault(); if (fd.firstName.trim()) onSave(fd); }}>
            <div className="form-grid">
                <div className="form-group"><label>First Name*</label><input type="text" value={fd.firstName} onChange={e => hc('firstName', e.target.value)} required autoFocus /></div>
                <div className="form-group"><label>Last Name</label><input type="text" value={fd.lastName} onChange={e => hc('lastName', e.target.value)} /></div>
                <div className="form-group full"><label>Title</label><input type="text" value={fd.title} onChange={e => hc('title', e.target.value)} /></div>
                <div className="form-group full"><label>Company</label><input type="text" value={fd.company} onChange={e => hc('company', e.target.value)} /></div>
                <div className="form-group"><label>Email</label><input type="email" value={fd.email} onChange={e => hc('email', e.target.value)} /></div>
                <div className="form-group"><label>Phone</label><input type="tel" value={fd.phone} onChange={e => hc('phone', e.target.value)} /></div>
            </div>
            <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
                <button type="submit" className="btn">Save Contact</button>
            </div>
        </form>
    );
}

export function NestedNewAccountForm({ name, onSave, onCancel }) {
    const [fd, setFd] = useState({ name: name || '', phone: '', website: '', address: '', city: '', state: '', zip: '' });
    const hc = (f, v) => setFd(prev => ({ ...prev, [f]: v }));
    return (
        <form onSubmit={e => { e.preventDefault(); if (fd.name.trim()) onSave(fd); }}>
            <div className="form-grid">
                <div className="form-group full"><label>Account Name*</label><input type="text" value={fd.name} onChange={e => hc('name', e.target.value)} required autoFocus /></div>
                <div className="form-group"><label>Phone</label><input type="tel" value={fd.phone} onChange={e => hc('phone', e.target.value)} /></div>
                <div className="form-group"><label>Website</label><input type="url" value={fd.website} onChange={e => hc('website', e.target.value)} /></div>
                <div className="form-group full"><label>Street Address</label><input type="text" value={fd.address} onChange={e => hc('address', e.target.value)} /></div>
                <div className="form-group"><label>City</label><input type="text" value={fd.city} onChange={e => hc('city', e.target.value)} /></div>
                <div className="form-group"><label>State</label><input type="text" value={fd.state} onChange={e => hc('state', e.target.value)} /></div>
                <div className="form-group"><label>ZIP</label><input type="text" value={fd.zip} onChange={e => hc('zip', e.target.value)} /></div>
            </div>
            <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
                <button type="submit" className="btn">Save Account</button>
            </div>
        </form>
    );
}