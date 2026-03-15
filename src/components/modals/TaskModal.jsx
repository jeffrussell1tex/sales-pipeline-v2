import React, { useState, useEffect, useRef } from 'react';
import TimePicker from '../ui/TimePicker';

export default function TaskModal({ task, taskTypes, opportunities, accounts, contacts, settings, onClose, onSave, onAddTaskType, onSaveNewContact, onSaveNewAccount, onAddOpportunity, onAddContact, onAddAccount, errorMessage, onDismissError, saving }) {
    const [formData, setFormData] = useState(task ? { ...task, status: task.status || (task.completed ? 'Completed' : 'Open'), assignedTo: task.assignedTo || '', priority: task.priority || 'Medium' } : {
        title: '',
        description: '',
        type: (taskTypes || ['Call'])[0] || 'Call',
        dueDate: new Date().toISOString().split('T')[0],
        dueTime: '09:00',
        reminderDate: '',
        reminderTime: '',
        relatedTo: '',
        opportunityId: '',
        contactId: '',
        accountId: '',
        completed: false,
        status: 'Open',
        assignedTo: '',
        priority: 'Medium'
    });

    const [showNewTypeInput, setShowNewTypeInput] = useState(false);
    const [newType, setNewType] = useState('');
    
    // Search states
    const [opportunitySearch, setOpportunitySearch] = useState(() => {
        const presetId = task?.opportunityId;
        if (presetId) {
            const opp = (opportunities || []).find(o => o.id === presetId);
            return opp ? (opp.opportunityName || opp.account || '') : '';
        }
        return '';
    });
    const [showOpportunitySuggestions, setShowOpportunitySuggestions] = useState(false);
    const [contactSearch, setContactSearch] = useState('');
    const [showContactSuggestions, setShowContactSuggestions] = useState(false);
    const [accountSearch, setAccountSearch] = useState('');
    const [showAccountSuggestions, setShowAccountSuggestions] = useState(false);
    const [nestedModal, setNestedModal] = useState(null);

    const handleChange = (field, value) => {
        setFormData({ ...formData, [field]: value });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    const handleAddNewType = () => {
        if (newType.trim()) {
            onAddTaskType(newType.trim());
            setFormData({ ...formData, type: newType.trim() });
            setNewType('');
            setShowNewTypeInput(false);
        }
    };

    // Create list of related items (opportunities and accounts)
    const relatedOptions = [
        ...opportunities.map(opp => ({ value: `Opportunity: ${opp.account} - ${opp.site}`, label: `Opp: ${opp.account} - ${opp.site}` })),
        ...accounts.map(acc => ({ value: `Account: ${acc.name}`, label: `Account: ${acc.name}` }))
    ];

    return (
        <>
        {errorMessage && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}
                 onClick={e => e.stopPropagation()}>
                <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: '2rem', maxWidth: '420px', width: '90%', textAlign: 'center' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '1.5rem' }}>⚠️</div>
                    <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.0625rem', fontWeight: '700', color: '#1e293b' }}>Failed to Save Task</h3>
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
        <div className="modal-overlay" onClick={e => e.stopPropagation()}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <h2>{task ? 'Edit Task' : 'New Task'}</h2>
                <form onSubmit={handleSubmit}>
                    <div className="form-grid">
                        <div className="form-group">
                            <label>Assign To</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type="text"
                                    value={formData.assignedTo || ''}
                                    onChange={e => handleChange('assignedTo', e.target.value)}
                                    placeholder="Type to search users..."
                                    onFocus={e => e.target.nextSibling.style.display = 'block'}
                                    onBlur={e => setTimeout(() => { if (e.target.nextSibling) e.target.nextSibling.style.display = 'none'; }, 200)}
                                />
                                <div style={{ display: 'none', position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', zIndex: 50, maxHeight: '150px', overflow: 'auto' }}>
                                    {(settings?.users || []).filter(u => !formData.assignedTo || u.name.toLowerCase().includes((formData.assignedTo || '').toLowerCase())).map(u => (
                                        <div key={u.id} style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.875rem', borderBottom: '1px solid #f1f3f5' }}
                                            onMouseDown={() => handleChange('assignedTo', u.name)}
                                            onMouseEnter={e => e.target.style.background = '#f1f5f9'}
                                            onMouseLeave={e => e.target.style.background = '#fff'}
                                        >{u.name} <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>({u.role || 'User'})</span></div>
                                    ))}
                                    {(settings?.users || []).filter(u => !formData.assignedTo || u.name.toLowerCase().includes((formData.assignedTo || '').toLowerCase())).length === 0 && (
                                        <div style={{ padding: '0.5rem 0.75rem', color: '#94a3b8', fontSize: '0.8125rem' }}>No matching users</div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Priority</label>
                            <select value={formData.priority || 'Medium'} onChange={e => handleChange('priority', e.target.value)}>
                                <option value="High">High</option>
                                <option value="Medium">Medium</option>
                                <option value="Low">Low</option>
                            </select>
                        </div>
                        <div className="form-group full">
                            <label>Task Title*</label>
                            <input
                                type="text"
                                value={formData.title}
                                onChange={e => handleChange('title', e.target.value)}
                                required
                                placeholder="e.g., Follow up with prospect"
                            />
                        </div>
                        <div className="form-group full">
                            <label>Description</label>
                            <textarea
                                value={formData.description}
                                onChange={e => handleChange('description', e.target.value)}
                                placeholder="Additional details..."
                                style={{ minHeight: '80px' }}
                            />
                        </div>
                        <div className="form-group">
                            <label>Task Type*</label>
                            {!showNewTypeInput ? (
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <select
                                        value={formData.type}
                                        onChange={e => {
                                            if (e.target.value === '__ADD_NEW__') {
                                                setShowNewTypeInput(true);
                                            } else {
                                                handleChange('type', e.target.value);
                                            }
                                        }}
                                        required
                                        style={{ flex: 1 }}
                                    >
                                        {(taskTypes || ['Call', 'Meeting', 'Email']).map(type => (
                                            <option key={type} value={type}>{type}</option>
                                        ))}
                                        <option value="__ADD_NEW__">+ Add New Type</option>
                                    </select>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <input
                                        type="text"
                                        value={newType}
                                        onChange={e => setNewType(e.target.value)}
                                        placeholder="New task type..."
                                        style={{ flex: 1 }}
                                    />
                                    <button type="button" className="btn" onClick={handleAddNewType}>Add</button>
                                    <button type="button" className="btn btn-secondary" onClick={() => setShowNewTypeInput(false)}>Cancel</button>
                                </div>
                            )}
                        </div>
                        <div className="form-group">
                            <label>Status</label>
                            <select
                                value={formData.status || 'Open'}
                                onChange={e => {
                                    const s = e.target.value;
                                    setFormData({ ...formData, status: s, completed: s === 'Completed', completedDate: s === 'Completed' ? (formData.completedDate || new Date().toISOString().split('T')[0]) : formData.completedDate });
                                }}
                                style={{
                                    background: formData.status === 'Completed' ? '#dcfce7' : formData.status === 'In-Process' ? '#fef3c7' : '#dbeafe',
                                    fontWeight: '600'
                                }}
                            >
                                <option value="Open">Open</option>
                                <option value="In-Process">In-Process</option>
                                <option value="Completed">Completed</option>
                            </select>
                        </div>
                        <div className="form-group full" style={{ position: 'relative' }}>
                            <label>Opportunity</label>
                            <input
                                type="text"
                                value={opportunitySearch}
                                onChange={e => {
                                    setOpportunitySearch(e.target.value);
                                    setShowOpportunitySuggestions(e.target.value.length > 0);
                                }}
                                onFocus={() => { if (opportunitySearch.length > 0) setShowOpportunitySuggestions(true); }}
                                placeholder="Type opportunity name or company..."
                                autoComplete="off"
                            />
                            {formData.opportunityId && (
                                <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: '#f1f3f5', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' }}>
                                    <span>{opportunities.find(o => o.id === formData.opportunityId)?.opportunityName || opportunities.find(o => o.id === formData.opportunityId)?.account || 'Unknown'}</span>
                                    <button type="button" onClick={() => { handleChange('opportunityId', ''); setOpportunitySearch(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#64748b' }}>×</button>
                                </div>
                            )}
                            {showOpportunitySuggestions && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0 0 6px 6px', maxHeight: '200px', overflowY: 'auto', zIndex: 1000, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                                    {opportunities.filter(opp => 
                                        opp.account?.toLowerCase().includes(opportunitySearch.toLowerCase()) ||
                                        opp.opportunityName?.toLowerCase().includes(opportunitySearch.toLowerCase()) ||
                                        opp.site?.toLowerCase().includes(opportunitySearch.toLowerCase())
                                    ).map(opp => (
                                        <div key={opp.id} onClick={() => {
                                            handleChange('opportunityId', opp.id);
                                            setOpportunitySearch('');
                                            setShowOpportunitySuggestions(false);
                                        }} style={{ padding: '0.75rem', cursor: 'pointer', borderBottom: '1px solid #e2e8f0', transition: 'background 0.15s' }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            <div style={{ fontWeight: '600', fontSize: '0.875rem' }}>{opp.account}</div>
                                            {opp.opportunityName && <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{opp.opportunityName}</div>}
                                            {opp.site && <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{opp.site}</div>}
                                        </div>
                                    ))}
                                    {opportunities.filter(opp => 
                                        opp.account?.toLowerCase().includes(opportunitySearch.toLowerCase()) ||
                                        opp.opportunityName?.toLowerCase().includes(opportunitySearch.toLowerCase()) ||
                                        opp.site?.toLowerCase().includes(opportunitySearch.toLowerCase())
                                    ).length === 0 && (
                                        <div style={{ padding: '0.75rem', color: '#64748b', fontSize: '0.875rem' }}>No matches found</div>
                                    )}
                                    <div onClick={onAddOpportunity} style={{ padding: '0.75rem', color: '#2563eb', cursor: 'pointer', fontWeight: '600', fontSize: '0.875rem', borderTop: '1px solid #e2e8f0' }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        + Add New Opportunity
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="form-group full" style={{ position: 'relative' }}>
                            <label>Contact</label>
                            <input
                                type="text"
                                value={contactSearch}
                                onChange={e => {
                                    setContactSearch(e.target.value);
                                    setShowContactSuggestions(e.target.value.length > 0);
                                }}
                                onFocus={() => { if (contactSearch.length > 0) setShowContactSuggestions(true); }}
                                placeholder="Type contact name..."
                                autoComplete="off"
                            />
                            {formData.contactId && (
                                <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: '#f1f3f5', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' }}>
                                    <span>{contacts.find(c => c.id === formData.contactId)?.firstName} {contacts.find(c => c.id === formData.contactId)?.lastName}</span>
                                    <button type="button" onClick={() => { handleChange('contactId', ''); setContactSearch(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#64748b' }}>×</button>
                                </div>
                            )}
                            {showContactSuggestions && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0 0 6px 6px', maxHeight: '200px', overflowY: 'auto', zIndex: 1000, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                                    {contacts.filter(contact => 
                                        `${contact.firstName} ${contact.lastName}`.toLowerCase().startsWith(contactSearch.toLowerCase()) ||
                                        contact.firstName?.toLowerCase().startsWith(contactSearch.toLowerCase()) ||
                                        contact.lastName?.toLowerCase().startsWith(contactSearch.toLowerCase())
                                    ).map(contact => (
                                        <div key={contact.id} onClick={() => {
                                            handleChange('contactId', contact.id);
                                            setContactSearch('');
                                            setShowContactSuggestions(false);
                                        }} style={{ padding: '0.75rem', cursor: 'pointer', borderBottom: '1px solid #e2e8f0', transition: 'background 0.15s' }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            <div style={{ fontWeight: '600', fontSize: '0.875rem' }}>{contact.firstName} {contact.lastName}</div>
                                            {contact.title && <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{contact.title}</div>}
                                        </div>
                                    ))}
                                    {contacts.filter(contact => 
                                        `${contact.firstName} ${contact.lastName}`.toLowerCase().startsWith(contactSearch.toLowerCase()) ||
                                        contact.firstName?.toLowerCase().startsWith(contactSearch.toLowerCase()) ||
                                        contact.lastName?.toLowerCase().startsWith(contactSearch.toLowerCase())
                                    ).length === 0 && (
                                        <div style={{ padding: '0.75rem', color: '#64748b', fontSize: '0.875rem' }}>No matches found</div>
                                    )}
                                    <div onMouseDown={e => e.preventDefault()} onClick={() => { setShowContactSuggestions(false); setNestedModal({ type: 'contact', firstName: contactSearch.split(/\s+/)[0] || '', lastName: contactSearch.split(/\s+/).slice(1).join(' ') || '' }); setContactSearch(''); }} style={{ padding: '0.75rem', color: '#2563eb', cursor: 'pointer', fontWeight: '600', fontSize: '0.875rem', borderTop: '1px solid #e2e8f0' }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        + New Contact
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="form-group full" style={{ position: 'relative' }}>
                            <label>Account</label>
                            <input
                                type="text"
                                value={accountSearch}
                                onChange={e => {
                                    setAccountSearch(e.target.value);
                                    setShowAccountSuggestions(e.target.value.length > 0);
                                }}
                                onFocus={() => { if (accountSearch.length > 0) setShowAccountSuggestions(true); }}
                                placeholder="Type account name..."
                                autoComplete="off"
                            />
                            {formData.accountId && (
                                <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: '#f1f3f5', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' }}>
                                    <span>{accounts.find(a => a.id === formData.accountId)?.name || 'Unknown'}</span>
                                    <button type="button" onClick={() => { handleChange('accountId', ''); setAccountSearch(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#64748b' }}>×</button>
                                </div>
                            )}
                            {showAccountSuggestions && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0 0 6px 6px', maxHeight: '200px', overflowY: 'auto', zIndex: 1000, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                                    {accounts.filter(account => 
                                        account.name?.toLowerCase().startsWith(accountSearch.toLowerCase())
                                    ).map(account => (
                                        <div key={account.id} onClick={() => {
                                            handleChange('accountId', account.id);
                                            setAccountSearch('');
                                            setShowAccountSuggestions(false);
                                        }} style={{ padding: '0.75rem', cursor: 'pointer', borderBottom: '1px solid #e2e8f0', transition: 'background 0.15s' }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            <div style={{ fontWeight: '600', fontSize: '0.875rem' }}>{account.name}</div>
                                            {account.industry && <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{account.industry}</div>}
                                        </div>
                                    ))}
                                    {accounts.filter(account => 
                                        account.name?.toLowerCase().startsWith(accountSearch.toLowerCase())
                                    ).length === 0 && (
                                        <div style={{ padding: '0.75rem', color: '#64748b', fontSize: '0.875rem' }}>No matches found</div>
                                    )}
                                    <div onMouseDown={e => e.preventDefault()} onClick={() => { setShowAccountSuggestions(false); setNestedModal({ type: 'account', name: accountSearch.trim() }); setAccountSearch(''); }} style={{ padding: '0.75rem', color: '#2563eb', cursor: 'pointer', fontWeight: '600', fontSize: '0.875rem', borderTop: '1px solid #e2e8f0' }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        + New Account
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="form-group">
                            <label>Due Date*</label>
                            <input
                                type="date"
                                value={formData.dueDate}
                                onChange={e => handleChange('dueDate', e.target.value)}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>Due Time</label>
                            <TimePicker value={formData.dueTime} onChange={val => handleChange('dueTime', val)} />
                        </div>
                        <div className="form-group">
                            <label>Reminder Date</label>
                            <input
                                type="date"
                                value={formData.reminderDate}
                                onChange={e => handleChange('reminderDate', e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label>Reminder Time</label>
                            <TimePicker value={formData.reminderTime} onChange={val => handleChange('reminderTime', val)} />
                        </div>
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
                            Cancel
                        </button>
                        <button type="submit" className="btn" disabled={saving} style={{ opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {saving && <span style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />}
                            {saving ? 'Saving…' : (task ? 'Update' : 'Create')}
                        </button>
                    </div>
                </form>
            </div>
            {nestedModal && nestedModal.type === 'contact' && (
                <div className="modal-overlay" style={{ zIndex: 2000 }} onClick={() => setNestedModal(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <h2 style={{ marginBottom: '1rem' }}>New Contact</h2>
                        <NestedNewContactForm firstName={nestedModal.firstName} lastName={nestedModal.lastName}
                            onSave={(data) => { if (onSaveNewContact) { const saved = onSaveNewContact(data); if (saved) setFormData(prev => ({ ...prev, contactId: saved.id })); } setNestedModal(null); }}
                            onCancel={() => setNestedModal(null)} />
                    </div>
                </div>
            )}
            {nestedModal && nestedModal.type === 'account' && (
                <div className="modal-overlay" style={{ zIndex: 2000 }} onClick={() => setNestedModal(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <h2 style={{ marginBottom: '1rem' }}>New Account</h2>
                        <NestedNewAccountForm name={nestedModal.name}
                            onSave={(data) => { if (onSaveNewAccount) { const saved = onSaveNewAccount(data); if (saved) setFormData(prev => ({ ...prev, accountId: saved.id })); } setNestedModal(null); }}
                            onCancel={() => setNestedModal(null)} />
                    </div>
                </div>
            )}
        </div>
        </>
    );
}