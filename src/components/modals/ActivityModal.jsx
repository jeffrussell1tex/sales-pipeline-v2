import React, { useState, useEffect, useRef } from 'react';
import { useDraggable, useResizable } from '../../hooks/useDraggable';
import ResizeHandles from '../../hooks/ResizeHandles';

export default function ActivityModal({ activity, opportunities, contacts, accounts, onClose, onSave, initialContext, onSaveNewContact, onSaveNewAccount, onAddContact, onAddAccount, onAddOpportunity, errorMessage, onDismissError, saving, zIndexBase = 9999 }) {

    // Build initial selectedContacts from existing activity (supports both legacy contactId and new contactIds)
    const buildInitialContacts = () => {
        if (!activity) {
            // Pre-populate from initialContext if a single contactId is passed
            if (initialContext?.contactId) {
                const c = (contacts || []).find(ct => ct.id === initialContext.contactId);
                return c ? [c] : [];
            }
            return [];
        }
        // Edit mode: prefer contactIds array, fall back to legacy contactId
        if (Array.isArray(activity.contactIds) && activity.contactIds.length > 0) {
            return activity.contactIds.map(id => (contacts || []).find(c => c.id === id)).filter(Boolean);
        }
        if (activity.contactId) {
            const c = (contacts || []).find(ct => ct.id === activity.contactId);
            return c ? [c] : [];
        }
        return [];
    };

    const [formData, setFormData] = useState(activity || {
        type: 'Call',
        date: [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-'),
        opportunityId: initialContext?.opportunityId || '',
        contactId: '',
        contactIds: [],
        companyName: '',
        notes: '',
        addToCalendar: false
    });

    const [selectedContacts, setSelectedContacts] = useState(buildInitialContacts);
    const [nestedModal, setNestedModal] = useState(null);
    const { dragHandleProps, dragOffsetStyle, overlayStyle, clickCatcherStyle, containerRef } = useDraggable();
    const { size, getResizeHandleProps } = useResizable(600, 500, 400, 300);

    const [opportunitySearch, setOpportunitySearch] = useState(
        activity ? (opportunities || []).find(o => o.id === activity.opportunityId)?.opportunityName || '' : (initialContext?.opportunityName || '')
    );
    const [showOpportunitySuggestions, setShowOpportunitySuggestions] = useState(false);
    const [contactSearch, setContactSearch] = useState('');
    const [showContactSuggestions, setShowContactSuggestions] = useState(false);
    const [companySearch, setCompanySearch] = useState(activity?.companyName || initialContext?.companyName || '');
    const [showCompanySuggestions, setShowCompanySuggestions] = useState(false);

    const activityTypes = ['Call', 'Email', 'Meeting', 'Demo', 'Proposal Sent', 'Follow-up', 'Other'];

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    // Add a contact to the multi-select list
    const handleAddContact = (contact) => {
        if (!contact) return;
        setSelectedContacts(prev => {
            if (prev.find(c => c.id === contact.id)) return prev; // already selected
            return [...prev, contact];
        });
        // Auto-populate company if blank
        if (contact.company && !companySearch) setCompanySearch(contact.company);
        setContactSearch('');
        setShowContactSuggestions(false);
    };

    // Remove a contact chip
    const handleRemoveContact = (contactId) => {
        setSelectedContacts(prev => prev.filter(c => c.id !== contactId));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const contactIds = selectedContacts.map(c => c.id);
        onSave({
            ...formData,
            companyName: companySearch,
            contactIds,
            // Keep legacy contactId as first selected contact for backward compat
            contactId: contactIds[0] || '',
        });
    };

    // Get unique company names from accounts and contacts
    const companyNames = [...new Set([
        ...accounts.map(a => a.name),
        ...contacts.map(c => c.company).filter(Boolean)
    ])].sort();

    // Filter opportunities - only show matches when user is typing
    const filteredOpportunities = !opportunitySearch ? [] : (opportunities || []).filter(opp => {
        const s = opportunitySearch.toLowerCase();
        return (opp.account || '').toLowerCase().startsWith(s) ||
               (opp.opportunityName || '').toLowerCase().startsWith(s) ||
               (opp.site || '').toLowerCase().startsWith(s);
    });

    // Filter companies
    const filteredCompanies = companyNames.filter(name =>
        name.toLowerCase().startsWith((companySearch || '').toLowerCase())
    );

    // Filter contacts — exclude already-selected ones
    const selectedContactIds = new Set(selectedContacts.map(c => c.id));
    const filteredContacts = contactSearch.length === 0 ? [] : (contacts || []).filter(c => {
        if (selectedContactIds.has(c.id)) return false;
        const s = contactSearch.toLowerCase();
        return `${c.firstName} ${c.lastName}`.toLowerCase().startsWith(s) ||
               c.firstName.toLowerCase().startsWith(s) ||
               c.lastName.toLowerCase().startsWith(s);
    });

    return (
        <>
        {errorMessage && (
            <div style={{ position: 'fixed', inset: 0, zIndex: zIndexBase, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}
                 onClick={e => e.stopPropagation()}>
                <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: '2rem', maxWidth: '420px', width: '90%', textAlign: 'center' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '1.5rem' }}>⚠️</div>
                    <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.0625rem', fontWeight: '700', color: '#1e293b' }}>Failed to Save Activity</h3>
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
        <div style={{ ...overlayStyle }} />
        <div style={clickCatcherStyle} />
        <div ref={containerRef} onClick={e => e.stopPropagation()} style={{ ...dragOffsetStyle, width: size.w, height: size.h, background: '#fff', borderRadius: '12px', boxShadow: '0 12px 40px rgba(0,0,0,0.18)', border: '1px solid #e5e2db', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* ── Drag handle header bar ── */}
                <div {...dragHandleProps} style={{ ...dragHandleProps.style, background: '#1c1917', padding: '0.875rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '12px 12px 0 0', minHeight: '52px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: '700', color: '#f5f1eb', cursor: 'inherit', userSelect: 'none' }}>
                        {activity ? 'Edit Activity' : 'Log Activity'}
                    </h2>
                    <span style={{ fontSize: '0.6875rem', color: 'rgba(245,241,235,0.35)', fontWeight: '500', letterSpacing: '0.03em' }}>⠿ drag</span>
                </div>
                <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, minHeight: 0 }}>
                <form onSubmit={handleSubmit}>
                    <div className="form-grid">
                        <div className="form-group">
                            <label>Activity Type*</label>
                            <select
                                value={formData.type}
                                onChange={e => handleChange('type', e.target.value)}
                                required
                            >
                                {activityTypes.map(type => (
                                    <option key={type} value={type}>{type}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Date*</label>
                            <input
                                type="date"
                                value={formData.date}
                                onChange={e => handleChange('date', e.target.value)}
                                required
                            />
                        </div>

                        {/* ── Contact multi-select ── */}
                        <div className="form-group full" style={{ position: 'relative' }}>
                            <label>Contacts</label>

                            {/* Selected contact chips */}
                            {selectedContacts.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '0.5rem' }}>
                                    {selectedContacts.map(c => (
                                        <div key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.25rem 0.5rem 0.25rem 0.625rem', background: '#f0ece4', border: '1px solid #e5e2db', borderRadius: '20px', fontSize: '0.8125rem', fontWeight: '600', color: '#1c1917' }}>
                                            <span>{c.firstName} {c.lastName}</span>
                                            {c.company && <span style={{ fontWeight: '400', color: '#78716c', fontSize: '0.75rem' }}>· {c.company}</span>}
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveContact(c.id)}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: '#78716c', fontSize: '1rem', display: 'flex', alignItems: 'center' }}
                                            >×</button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Contact search input */}
                            <input
                                type="text"
                                value={contactSearch}
                                onChange={e => {
                                    setContactSearch(e.target.value);
                                    setShowContactSuggestions(e.target.value.length > 0);
                                }}
                                onFocus={() => setShowContactSuggestions(contactSearch.length > 0)}
                                placeholder={selectedContacts.length === 0 ? 'Type to search contacts...' : 'Add another contact...'}
                                autoComplete="off"
                            />

                            {/* Suggestions dropdown */}
                            {showContactSuggestions && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', marginTop: '0.25rem', maxHeight: '200px', overflowY: 'auto', zIndex: 1000, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                                    {filteredContacts.map(c => (
                                        <div key={c.id}
                                            onMouseDown={e => e.preventDefault()}
                                            onClick={() => handleAddContact(c)}
                                            style={{ padding: '0.75rem', cursor: 'pointer', borderBottom: '1px solid #e2e8f0', transition: 'background 0.2s' }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <div style={{ fontWeight: '600' }}>{c.firstName} {c.lastName}</div>
                                            <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>{[c.company, c.email].filter(Boolean).join(' • ')}</div>
                                        </div>
                                    ))}
                                    {filteredContacts.length === 0 && contactSearch && (
                                        <div style={{ padding: '0.5rem 0.75rem', color: '#94a3b8', fontSize: '0.8125rem' }}>No matching contacts</div>
                                    )}
                                    <div onMouseDown={e => e.preventDefault()}
                                        onClick={() => {
                                            setShowContactSuggestions(false);
                                            setNestedModal({ type: 'contact', firstName: contactSearch.split(/\s+/)[0] || '', lastName: contactSearch.split(/\s+/).slice(1).join(' ') || '' });
                                            setContactSearch('');
                                        }}
                                        style={{ padding: '0.75rem', cursor: 'pointer', color: '#2563eb', fontWeight: '600', borderTop: '1px solid #e2e8f0', transition: 'background 0.2s' }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >+ New Contact</div>
                                </div>
                            )}
                        </div>

                        {/* Company typeahead with +new */}
                        <div className="form-group" style={{ position: 'relative' }}>
                            <label>Company</label>
                            <input
                                type="text"
                                value={companySearch}
                                onChange={e => { setCompanySearch(e.target.value); setShowCompanySuggestions(e.target.value.length > 0); }}
                                onFocus={() => setShowCompanySuggestions(companySearch.length > 0)}
                                placeholder="Type company name..."
                                autoComplete="off"
                            />
                            {showCompanySuggestions && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', marginTop: '0.25rem', maxHeight: '200px', overflowY: 'auto', zIndex: 1000, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                                    {filteredCompanies.map((name, idx) => (
                                        <div key={idx}
                                            onClick={() => { setCompanySearch(name); setShowCompanySuggestions(false); }}
                                            style={{ padding: '0.75rem', cursor: 'pointer', borderBottom: '1px solid #e2e8f0', transition: 'background 0.2s' }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >{name}</div>
                                    ))}
                                    {companySearch.trim() && !companyNames.some(n => n.toLowerCase() === companySearch.trim().toLowerCase()) && (
                                        <div onMouseDown={e => e.preventDefault()} onClick={() => { setShowCompanySuggestions(false); setNestedModal({ type: 'account', name: companySearch.trim() }); }}
                                            style={{ padding: '0.75rem', cursor: 'pointer', color: '#2563eb', fontWeight: '600', borderTop: '1px solid #e2e8f0', transition: 'background 0.2s' }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >+ New Account "{companySearch.trim()}"</div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Opportunity typeahead with +new */}
                        <div className="form-group full" style={{ position: 'relative' }}>
                            <label>Opportunity</label>
                            <input
                                type="text"
                                value={opportunitySearch}
                                onChange={e => { setOpportunitySearch(e.target.value); setShowOpportunitySuggestions(e.target.value.length > 0); }}
                                onFocus={() => setShowOpportunitySuggestions(opportunitySearch.length > 0)}
                                placeholder="Type opportunity or account name..."
                                autoComplete="off"
                            />
                            {formData.opportunityId && (
                                <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#f1f3f5', borderRadius: '4px', fontSize: '0.875rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>{(() => { const opp = opportunities.find(o => o.id === formData.opportunityId); return opp ? `${opp.account || ''}${opp.opportunityName ? ` — ${opp.opportunityName}` : ''}` : ''; })()}</span>
                                    <button type="button" onClick={() => { handleChange('opportunityId', ''); setOpportunitySearch(''); }}
                                        style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1.2rem', padding: 0 }}>×</button>
                                </div>
                            )}
                            {showOpportunitySuggestions && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', marginTop: '0.25rem', maxHeight: '200px', overflowY: 'auto', zIndex: 1000, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                                    {filteredOpportunities.map(opp => (
                                        <div key={opp.id}
                                            onClick={() => { handleChange('opportunityId', opp.id); setOpportunitySearch(''); setShowOpportunitySuggestions(false); }}
                                            style={{ padding: '0.75rem', cursor: 'pointer', borderBottom: '1px solid #e2e8f0', transition: 'background 0.2s' }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <div style={{ fontWeight: '600' }}>{opp.account || 'Unnamed'}</div>
                                            {(opp.opportunityName || opp.site) && (
                                                <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>{[opp.opportunityName, opp.site].filter(Boolean).join(' • ')}</div>
                                            )}
                                        </div>
                                    ))}
                                    {filteredOpportunities.length === 0 && opportunitySearch && (
                                        <div style={{ padding: '0.75rem', color: '#64748b', fontSize: '0.875rem', textAlign: 'center' }}>
                                            No matching opportunities found
                                        </div>
                                    )}
                                    <div onClick={() => { setShowOpportunitySuggestions(false); onAddOpportunity && onAddOpportunity(); }}
                                        style={{ padding: '0.75rem', cursor: 'pointer', color: '#2563eb', fontWeight: '600', borderTop: '1px solid #e2e8f0', transition: 'background 0.2s' }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >+ Add New Opportunity</div>
                                </div>
                            )}
                        </div>

                        <div className="form-group full">
                            <label>Notes*</label>
                            <textarea
                                value={formData.notes}
                                onChange={e => handleChange('notes', e.target.value)}
                                placeholder="What was discussed? Next steps? Important details..."
                                required
                                rows="5"
                            />
                        </div>
                    </div>
                    {/* ── Add to Google Calendar ── */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.75rem 0', borderTop: '1px solid #f1f5f9', marginTop: '0.25rem' }}>
                        <input
                            type="checkbox"
                            id="activityAddToCalendar"
                            checked={!!formData.addToCalendar}
                            onChange={e => handleChange('addToCalendar', e.target.checked)}
                            style={{ width: '16px', height: '16px', accentColor: '#2563eb', cursor: 'pointer', flexShrink: 0 }}
                        />
                        <label htmlFor="activityAddToCalendar" style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#475569', cursor: 'pointer', userSelect: 'none' }}>
                            📅 Add to Google Calendar
                        </label>
                        <span style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>Creates an all-day event on the activity date</span>
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
                            Cancel
                        </button>
                        <button type="submit" className="btn" disabled={saving} style={{ opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {saving && <span style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />}
                            {saving ? 'Saving…' : (activity ? 'Update' : 'Log Activity')}
                        </button>
                    </div>
                </form>
                </div>{/* end padding wrapper */}
            <ResizeHandles getResizeHandleProps={getResizeHandleProps} />
            </div>
            {nestedModal && nestedModal.type === 'contact' && (
                <div className="modal-overlay" style={{ zIndex: 2000 }} onClick={() => setNestedModal(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <h2 style={{ marginBottom: '1rem' }}>New Contact</h2>
                        <NestedNewContactForm firstName={nestedModal.firstName} lastName={nestedModal.lastName}
                            onSave={(data) => {
                                if (onSaveNewContact) {
                                    const saved = onSaveNewContact(data);
                                    if (saved) {
                                        handleAddContact(saved);
                                    }
                                }
                                setNestedModal(null);
                            }}
                            onCancel={() => setNestedModal(null)} />
                    </div>
                </div>
            )}
            {nestedModal && nestedModal.type === 'account' && (
                <div className="modal-overlay" style={{ zIndex: 2000 }} onClick={() => setNestedModal(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <h2 style={{ marginBottom: '1rem' }}>New Account</h2>
                        <NestedNewAccountForm name={nestedModal.name}
                            onSave={(data) => { if (onSaveNewAccount) { const saved = onSaveNewAccount(data); if (saved) setCompanySearch(saved.name); } setNestedModal(null); }}
                            onCancel={() => setNestedModal(null)} />
                    </div>
                </div>
            )}
        </>
    );
}
