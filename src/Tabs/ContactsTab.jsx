import React, { useState } from 'react';
import { useApp } from '../AppContext';
import { dbFetch } from '../utils/storage';

export default function ContactsTab() {
    const {
        contacts, setContacts,
        opportunities,
        accounts,
        activities,
        tasks,
        settings,
        currentUser,
        userRole,
        canSeeAll,
        isRepVisible,
        exportToCSV,
        showConfirm,
        softDelete,
        addAudit,
        getStageColor,
        visibleContacts,
        exportingCSV, setExportingCSV,
        handleDeleteContact,
        setEditingContact, setShowContactModal,
        setCsvImportType, setShowCsvImportModal,
        viewingContact, setViewingContact,
        contactShowAllDeals, setContactShowAllDeals,
        contactsSortBy, setContactsSortBy,
        selectedContacts, setSelectedContacts,
        isMobile,
    } = useApp();

    const isAdmin = userRole === 'Admin';
    const isManager = userRole === 'Manager';
    const isReadOnly = userRole === 'ReadOnly';
    const canEdit = !isReadOnly;

    // State received via props from App.jsx (also used in contact detail panel)

    // UI handlers (open modals)
    const handleAddContact = () => { setEditingContact(null); setShowContactModal(true); };
    const handleEditContact = (contact) => { setEditingContact(contact); setShowContactModal(true); };

    return (

                <div className="tab-page">
                    <div className="tab-page-header">
                        <div className="tab-page-header-bar"></div>
                        <div>
                            <h2>Contacts</h2>
                            
                        </div>
                    </div>
                <div className="table-container">
                    <div className="table-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <h2>CONTACTS</h2>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            {canEdit && <button className="btn" onClick={handleAddContact}>+ ADD CONTACT</button>}
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: '600' }}>
                                    Sort by:
                                </span>
                                <select
                                    value={contactsSortBy}
                                    onChange={(e) => setContactsSortBy(e.target.value)}
                                    style={{
                                        background: '#ffffff',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '6px',
                                        padding: '0.5rem 0.75rem',
                                        color: '#1e293b',
                                        fontSize: '0.875rem',
                                        fontWeight: '600',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <option value="lastName">Last Name</option>
                                    <option value="firstName">First Name</option>
                                    <option value="company">Company</option>
                                </select>
                            </div>

                        </div>
                    </div>
                    {/* Bulk action bar */}
                    {selectedContacts.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1.5rem', background: '#eff6ff', borderBottom: '1px solid #bfdbfe' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#2563eb' }}>
                                    {selectedContacts.length} contact{selectedContacts.length > 1 ? 's' : ''} selected
                                </span>
                                <button onClick={() => setSelectedContacts([])}
                                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'inherit' }}
                                >Clear selection</button>
                            </div>
                            <button onClick={() => {
                                showConfirm('Delete ' + selectedContacts.length + ' selected contact(s)? This cannot be undone.', async () => {
    const contactIdsToDelete = [...selectedContacts];
    const snapshot = [...contacts];
    setContacts(contacts.filter(c => !contactIdsToDelete.includes(c.id)));
    setSelectedContacts([]);
    // If all contacts selected, use clear=true for a single DB call instead of N deletes
    const deletingAll = contactIdsToDelete.length === contacts.length;
    if (deletingAll) {
        await dbFetch('/.netlify/functions/contacts?clear=true', { method: 'DELETE' })
            .catch(err => console.error('Failed to clear contacts:', err));
    } else {
        const CONCURRENCY = 3;
        const queue = [...contactIdsToDelete];
        const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
            while (queue.length > 0) {
                const id = queue.shift();
                await dbFetch(`/.netlify/functions/contacts?id=${id}`, { method: 'DELETE' })
                    .catch(err => console.error('Failed to delete contact:', err));
            }
        });
        await Promise.all(workers);
    }
    softDelete(
        `${contactIdsToDelete.length} contact${contactIdsToDelete.length === 1 ? '' : 's'}`,
        () => {},
        () => { setContacts(snapshot); setUndoToast(null); }
    );
});
                            }}
                                style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: '600', fontSize: '0.8125rem', fontFamily: 'inherit', transition: 'background 0.2s' }}
                                onMouseEnter={e => e.target.style.background = '#dc2626'}
                                onMouseLeave={e => e.target.style.background = '#ef4444'}
                            >Delete Selected</button>
                        </div>
                    )}
                    <div style={{ padding: '1.5rem' }}>
                        {visibleContacts.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '4rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <circle cx="36" cy="24" r="12" fill="#fff7ed" stroke="#fed7aa" strokeWidth="2"/>
                                    <circle cx="36" cy="24" r="7" fill="#fb923c"/>
                                    <path d="M12 58c0-13.255 10.745-24 24-24s24 10.745 24 24" stroke="#fed7aa" strokeWidth="2" strokeLinecap="round" fill="#fff7ed"/>
                                    <circle cx="54" cy="18" r="8" fill="#22c55e"/>
                                    <path d="M50 18l3 3 5-5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                <div>
                                    <div style={{ width:'72px', height:'72px', borderRadius:'20px', background:'linear-gradient(135deg,#fff7ed,#ffedd5)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'2rem', margin:'0 auto 0.75rem' }}>👤</div>
                                    <div style={{ fontWeight: '700', fontSize: '1.0625rem', color: '#1e293b', marginBottom: '0.375rem' }}>No contacts yet</div>
                                    <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.25rem', maxWidth:'280px' }}>Add contacts to track people across your accounts and deals.</div>
                                    {canEdit && <button className="btn" onClick={handleAddContact}>+ Add Contact</button>}
                                </div>
                            </div>
                        ) : (
                            <>
                            {/* Select all */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', paddingLeft: '0.25rem' }}>
                                <input type="checkbox"
                                    checked={visibleContacts.length > 0 && selectedContacts.length === visibleContacts.length}
                                    onChange={e => setSelectedContacts(e.target.checked ? visibleContacts.map(c => c.id) : [])}
                                    style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#2563eb' }}
                                />
                                <span style={{ fontSize: '0.8125rem', color: '#64748b', fontWeight: '600' }}>Select all ({visibleContacts.length})</span>
                            </div>
                            <div style={{ position: 'relative' }}>
                            {/* Letter jump bar */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', padding: '0.375rem 0.5rem', background: '#f8fafc', borderRadius: '6px', marginBottom: '0.375rem', border: '1px solid #e9ecef' }}>
                                {(() => {
                                    const sortField = contactsSortBy === 'firstName' ? 'firstName' : contactsSortBy === 'company' ? 'company' : 'lastName';
                                    return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => {
                                        const hasMatch = visibleContacts.some(c => ((c[sortField] || '')[0] || '').toUpperCase() === letter);
                                        return (
                                            <div key={letter}
                                                onClick={() => {
                                                    if (!hasMatch) return;
                                                    const el = document.getElementById('contact-letter-' + letter);
                                                    if (el) el.scrollIntoView({ block: 'start' });
                                                }}
                                                style={{
                                                    fontSize: '0.6875rem', fontWeight: '700', width: '22px', height: '20px',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    color: hasMatch ? '#2563eb' : '#cbd5e1',
                                                    cursor: hasMatch ? 'pointer' : 'default',
                                                    borderRadius: '3px', transition: 'all 0.1s', userSelect: 'none'
                                                }}
                                                onMouseEnter={e => { if (hasMatch) { e.target.style.background = '#dbeafe'; e.target.style.color = '#1e40af'; } }}
                                                onMouseLeave={e => { e.target.style.background = 'transparent'; e.target.style.color = hasMatch ? '#2563eb' : '#cbd5e1'; }}
                                            >{letter}</div>
                                        );
                                    });
                                })()}
                            </div>
                            <div style={{ display: 'grid', gap: '1px' }}>
                                {(() => {
                                    const sortField = contactsSortBy === 'firstName' ? 'firstName' : contactsSortBy === 'company' ? 'company' : 'lastName';
                                    const sorted = [...visibleContacts].sort((a, b) => {
                                        if (contactsSortBy === 'lastName') return (a.lastName || '').localeCompare(b.lastName || '');
                                        else if (contactsSortBy === 'firstName') return (a.firstName || '').localeCompare(b.firstName || '');
                                        else {
                                            const cmp = (a.company || '').localeCompare(b.company || '');
                                            return cmp !== 0 ? cmp : (a.lastName || '').localeCompare(b.lastName || '');
                                        }
                                    });
                                    let lastLetter = '';
                                    let lastCompany = null;
                                    const results = [];
                                    sorted.forEach((contact, cIdx) => {
                                        const firstChar = ((contact[sortField] || '')[0] || '').toUpperCase();
                                        let anchorId = null;
                                        if (firstChar !== lastLetter) {
                                            lastLetter = firstChar;
                                            anchorId = 'contact-letter-' + firstChar;
                                        }
                                        // Company group header
                                        if (contactsSortBy === 'company') {
                                            const co = (contact.company || '').trim() || '(No Company)';
                                            if (co !== lastCompany) {
                                                lastCompany = co;
                                                results.push(
                                                    <div key={'company-hdr-' + co} id={anchorId} style={{
                                                        padding: '0.375rem 0.625rem', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0',
                                                        fontSize: '0.6875rem', fontWeight: '800', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.04em',
                                                        display: 'flex', alignItems: 'center', gap: '0.5rem'
                                                    }}>
                                                        <span style={{ color: '#475569' }}>{co}</span>
                                                        <span style={{ color: '#94a3b8', fontWeight: '600', fontSize: '0.625rem' }}>({sorted.filter(c => ((c.company || '').trim() || '(No Company)') === co).length})</span>
                                                    </div>
                                                );
                                                anchorId = null;
                                            }
                                        }
                                        results.push(
                                    <div key={contact.id} id={contactsSortBy !== 'company' ? anchorId : null} style={{
                                        border: selectedContacts.includes(contact.id) ? '1px solid #93c5fd' : '1px solid #edf0f3',
                                        borderRadius: '2px',
                                        background: selectedContacts.includes(contact.id) ? '#eff6ff' : (cIdx % 2 === 0 ? '#ffffff' : '#f8fafc'),
                                        transition: 'all 0.15s ease',
                                        overflow: 'hidden',
                                        marginLeft: contactsSortBy === 'company' ? '1rem' : 0
                                    }}
                                    onMouseEnter={e => { if (!selectedContacts.includes(contact.id)) e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'; }}
                                    onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                                    >
                                    <>
                                    {/* Mobile card - hidden on desktop */}
                                    <div className="mobile-record-card" onClick={() => setViewingContact(contact)}>
                                        <div className="mobile-card-top">
                                            <div>
                                                <div className="mobile-card-title">{contact.firstName} {contact.lastName}</div>
                                                {contact.title && <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.1rem' }}>{contact.title}</div>}
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
                                                <button onClick={e => { e.stopPropagation(); handleEditContact(contact); }} style={{ padding: '4px 10px', borderRadius: '999px', border: '0.5px solid #94a3b8', background: 'transparent', color: '#475569', fontWeight: '500', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Edit</button>
                                                <button onClick={e => { e.stopPropagation(); handleDeleteContact(contact.id); }} style={{ padding: '4px 10px', borderRadius: '999px', border: '0.5px solid #fca5a5', background: 'transparent', color: '#dc2626', fontWeight: '500', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Delete</button>
                                            </div>
                                        </div>
                                        <div className="mobile-card-meta">
                                            {contact.company && <span className="mobile-card-meta-item">🏢 {contact.company}</span>}
                                            {contact.phone && <span className="mobile-card-meta-item">📞 {contact.phone}</span>}
                                            {contact.email && <span className="mobile-card-meta-item">✉️ {contact.email}</span>}
                                        </div>
                                    </div>
                                    {/* Desktop row - hidden on mobile */}
                                    <div className="contacts-desktop-row" style={{ display: 'flex', alignItems: 'center', padding: '0.25rem 0.625rem', gap: '0.375rem' }}>
                                        <input type="checkbox"
                                            checked={selectedContacts.includes(contact.id)}
                                            onChange={e => {
                                                if (e.target.checked) setSelectedContacts([...selectedContacts, contact.id]);
                                                else setSelectedContacts(selectedContacts.filter(id => id !== contact.id));
                                            }}
                                            style={{ width: '13px', height: '13px', cursor: 'pointer', accentColor: '#2563eb', flexShrink: 0 }}
                                        />
                                        <div style={{ 
                                            flex: 1,
                                            display: 'grid',
                                            gridTemplateColumns: 'minmax(120px,2fr) minmax(100px,2fr) minmax(80px,2fr) minmax(80px,2fr) minmax(100px,3fr)',
                                            gap: '0.375rem',
                                            alignItems: 'center',
                                            minWidth: '0'
                                        }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                                    <div 
                                                        style={{ fontSize: '0.75rem', fontWeight: '700', color: '#2563eb', cursor: 'pointer', lineHeight: '1.2' }}
                                                        onClick={() => setViewingContact(contact)}
                                                        onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                                                        onMouseLeave={e => e.target.style.textDecoration = 'none'}
                                                    >
                                                        {contact.firstName} {contact.lastName}
                                                    </div>
                                                    {(() => {
                                                        const linkedOppCount = opportunities.filter(o =>
                                                            (o.contactIds && o.contactIds.includes(contact.id)) ||
                                                            (o.contacts && o.contacts.split(',').map(s => s.trim().toLowerCase()).some(n => n.startsWith((contact.firstName + ' ' + contact.lastName).toLowerCase())))
                                                        ).length;
                                                        if (!linkedOppCount) return null;
                                                        return (
                                                            <span title={`${linkedOppCount} linked opportunity${linkedOppCount > 1 ? 's' : ''}`}
                                                                style={{ fontSize: '0.5625rem', fontWeight: '700', background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe', padding: '0.05rem 0.35rem', borderRadius: '999px', lineHeight: '1.4', flexShrink: 0 }}>
                                                                {linkedOppCount} opp{linkedOppCount > 1 ? 's' : ''}
                                                            </span>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {contact.company || '-'}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {contact.title || '-'}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                {contact.phone || '-'}
                                            </div>
                                            <div style={{ fontSize: '0.75rem' }}>
                                                {contact.email ? (
                                                    <a href={`mailto:${contact.email}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
                                                        {contact.email}
                                                    </a>
                                                ) : '-'}
                                            </div>
                                        </div>
                                        <div style={{ marginLeft: '0.375rem', display: 'flex', gap: '4px' }}>
                                            <button onClick={() => handleEditContact(contact)} style={{ padding: '4px 10px', borderRadius: '999px', border: '0.5px solid #94a3b8', background: 'transparent', color: '#475569', fontWeight: '500', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Edit</button>
                                            <button onClick={() => handleDeleteContact(contact.id)} style={{ padding: '4px 10px', borderRadius: '999px', border: '0.5px solid #fca5a5', background: 'transparent', color: '#dc2626', fontWeight: '500', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Delete</button>
                                        </div>
                                    </div>
                                    {/* end contacts-desktop-row */}
                                    {selectedContacts.includes(contact.id) && (() => {
                                        const contactActivities = activities.filter(a => a.contactId === contact.id);
                                        const contactOpps = opportunities.filter(o => o.account && contact.company && o.account.toLowerCase() === contact.company.toLowerCase());
                                        const oppIds = contactOpps.map(o => o.id);
                                        const oppActivities = activities.filter(a => a.opportunityId && oppIds.includes(a.opportunityId) && a.contactId !== contact.id);
                                        const contactTasks = tasks.filter(t => {
                                            const titleMatch = t.title && (t.title.toLowerCase().includes((contact.firstName || '').toLowerCase()) || t.title.toLowerCase().includes((contact.lastName || '').toLowerCase()));
                                            const companyMatch = t.title && contact.company && t.title.toLowerCase().includes(contact.company.toLowerCase());
                                            return titleMatch || companyMatch;
                                        });
                                        const allItems = [
                                            ...contactActivities.map(a => ({ ...a, itemType: 'activity', sortDate: a.date })),
                                            ...oppActivities.map(a => ({ ...a, itemType: 'activity-related', sortDate: a.date })),
                                            ...contactTasks.map(t => ({ ...t, itemType: 'task', sortDate: t.dueDate || t.createdDate || '2000-01-01' }))
                                        ].sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate));

                                        return (
                                            <div style={{ borderTop: '1px solid #e2e8f0', padding: '0.75rem 1rem 0.75rem 3rem', background: '#f8f9fa' }}>
                                                <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                                                    Activity & Task History ({allItems.length})
                                                </div>
                                                {allItems.length === 0 ? (
                                                    <div style={{ fontSize: '0.8125rem', color: '#94a3b8', fontStyle: 'italic' }}>No activities or tasks found for this contact.</div>
                                                ) : (
                                                    <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                                                        {allItems.map((item, idx) => (
                                                            <div key={idx} style={{ display: 'flex', gap: '0.75rem', padding: '0.5rem 0', borderBottom: idx < allItems.length - 1 ? '1px solid #e2e8f0' : 'none', fontSize: '0.8125rem' }}>
                                                                <div style={{ width: '70px', flexShrink: 0, color: '#94a3b8', fontSize: '0.75rem' }}>
                                                                    {item.sortDate ? new Date(item.sortDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '-'}
                                                                </div>
                                                                <div style={{
                                                                    padding: '0.125rem 0.5rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '700', flexShrink: 0, textTransform: 'uppercase',
                                                                    background: item.itemType === 'task' ? '#fef3c7' : '#dbeafe',
                                                                    color: item.itemType === 'task' ? '#92400e' : '#1e40af'
                                                                }}>
                                                                    {item.itemType === 'task' ? 'Task' : item.type || 'Activity'}
                                                                </div>
                                                                <div style={{ flex: 1, color: '#475569' }}>
                                                                    {item.itemType === 'task' ? item.title : (item.notes || item.subject || 'No details')}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                    </>
                                    </div>
                                        );
                                    });
                                    return results;
                                })()}
                            </div>
                            </div>
                            </>
                        )}
                    </div>
                </div>
                </div>
            
    );
}
