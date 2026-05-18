import React, { useState, useEffect, useRef } from 'react';
import TimePicker from '../ui/TimePicker';
import { useDraggable, useResizable } from '../../hooks/useDraggable';
import ResizeHandles from '../../hooks/ResizeHandles';

export default function TaskModal({ task, taskTypes, opportunities, accounts, contacts, settings, onClose, onSave, onAddTaskType, onSaveNewContact, onSaveNewAccount, onAddOpportunity, onAddContact, onAddAccount, errorMessage, onDismissError, saving, onOpenNestedContact, onOpenNestedAccount }) {
    const [formData, setFormData] = useState(task ? { ...task, status: task.status || (task.completed ? 'Completed' : 'Open'), assignedTo: task.assignedTo || '', priority: task.priority || 'Medium', addToCalendar: false } : {
        title: '',
        description: '',
        type: (taskTypes || ['Call'])[0] || 'Call',
        dueDate: [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-'),
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
        priority: 'Medium',
        addToCalendar: true
    });

    const [showNewTypeInput, setShowNewTypeInput] = useState(false);
    const [newType, setNewType] = useState('');
    const [modalTab, setModalTab] = useState('task');
    
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
    const { dragHandleProps, dragOffsetStyle, overlayStyle, clickCatcherStyle, clickCatcherProps, containerRef } = useDraggable();
    const { size, getResizeHandleProps } = useResizable(760, 560, 480, 360);

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
        <div style={{ ...overlayStyle }} />
        <div {...clickCatcherProps} />
        <div ref={containerRef} onClick={e => e.stopPropagation()} style={{ ...dragOffsetStyle, width: size.w, height: size.h, background: '#fff', borderRadius: '12px', boxShadow: '0 12px 40px rgba(0,0,0,0.18)', border: '1px solid #e5e2db', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* ── Drag handle header bar ── */}
                <div {...dragHandleProps} style={{ ...dragHandleProps.style, background: '#1c1917', padding: '0.875rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '12px 12px 0 0', minHeight: '52px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: '700', color: '#f5f1eb', cursor: 'inherit', userSelect: 'none' }}>
                        {task ? 'Edit Task' : 'New Task'}
                    </h2>
                    <span style={{ fontSize: '0.6875rem', color: 'rgba(245,241,235,0.35)', fontWeight: '500', letterSpacing: '0.03em' }}>⠿ drag</span>
                </div>
                {/* ── Tab strip ── */}
                {(() => {
                    const customFields = (settings?.customFieldsByObject?.Tasks || []).filter(f => (f.visibility||'').includes('Detail'));
                    if (customFields.length === 0) return null;
                    const tabStyle = (t) => ({
                        padding: '8px 18px', border: 'none', background: 'transparent',
                        borderBottom: modalTab === t ? '2px solid #c8b99a' : '2px solid transparent',
                        color: modalTab === t ? '#2a2622' : '#8a8378',
                        fontWeight: modalTab === t ? 700 : 500,
                        fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                        marginBottom: -1, transition: 'color 120ms, border-color 120ms',
                    });
                    return (
                        <div style={{ display: 'flex', borderBottom: '1px solid #e6ddd0', paddingLeft: 8 }}>
                            <button type="button" style={tabStyle('task')} onClick={() => setModalTab('task')}>Task</button>
                            <button type="button" style={tabStyle('details')} onClick={() => setModalTab('details')}>Task Details</button>
                        </div>
                    );
                })()}
                <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, minHeight: 0 }}>
                <form onSubmit={handleSubmit}>
                    {modalTab === 'task' && <div className="form-grid">
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
                                    setFormData({ ...formData, status: s, completed: s === 'Completed', completedDate: s === 'Completed' ? (formData.completedDate || [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-')) : formData.completedDate });
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
                                <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px 6px 0 0', maxHeight: '200px', overflowY: 'auto', zIndex: 1000, boxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
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
                                    <div onMouseDown={e => e.preventDefault()} onClick={(e) => { e.stopPropagation(); setShowContactSuggestions(false); onOpenNestedContact && onOpenNestedContact({ firstName: contactSearch.split(/\s+/)[0] || '', lastName: contactSearch.split(/\s+/).slice(1).join(' ') || '' }); setContactSearch(''); }} style={{ padding: '0.75rem', color: '#2563eb', cursor: 'pointer', fontWeight: '600', fontSize: '0.875rem', borderTop: '1px solid #e2e8f0' }}
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
                                <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px 6px 0 0', maxHeight: '200px', overflowY: 'auto', zIndex: 1000, boxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
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
                                    <div onMouseDown={e => e.preventDefault()} onClick={(e) => { e.stopPropagation(); setShowAccountSuggestions(false); onOpenNestedAccount && onOpenNestedAccount({ name: accountSearch.trim() }); setAccountSearch(''); }} style={{ padding: '0.75rem', color: '#2563eb', cursor: 'pointer', fontWeight: '600', fontSize: '0.875rem', borderTop: '1px solid #e2e8f0' }}
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
                    </div>}
                    {/* ── Add to Google Calendar checkbox ── */}
                    {modalTab === 'task' && formData.dueDate && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.75rem 0', borderTop: '1px solid #f1f5f9', marginTop: '0.25rem' }}>
                            <input
                                type="checkbox"
                                id="addToCalendar"
                                checked={!!formData.addToCalendar}
                                onChange={e => handleChange('addToCalendar', e.target.checked)}
                                style={{ width: '16px', height: '16px', accentColor: '#2563eb', cursor: 'pointer', flexShrink: 0 }}
                            />
                            <label htmlFor="addToCalendar" style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#475569', cursor: 'pointer', userSelect: 'none' }}>
                                📅 Add to Google Calendar
                            </label>
                            <span style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>Creates an all-day event on the due date</span>
                        </div>
                    )}
                    {modalTab === 'details' && (() => {
                        const customFields = (settings?.customFieldsByObject?.Tasks || []).filter(f => (f.visibility||'').includes('Detail'));
                        if (customFields.length === 0) return (
                            <div style={{ padding: '2rem', textAlign: 'center', color: '#8a8378', fontSize: 13, fontStyle: 'italic' }}>
                                No custom fields configured for Tasks yet.<br/>
                                <span style={{ fontSize: 12 }}>Go to Settings → Sales process → Custom fields to add them.</span>
                            </div>
                        );
                        return (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '4px 0' }}>
                                {customFields.map(f => {
                                    const apiKey = f.api.replace(/^[^.]+\./, '');
                                    const val = formData[apiKey] ?? formData[f.api] ?? '';
                                    return (
                                        <div key={f.api} className="form-group">
                                            <label>
                                                {f.label}{f.required && <span style={{ color: '#9c3a2e', marginLeft: 3 }}>*</span>}
                                            </label>
                                            {f.type === 'Toggle' ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 6 }}>
                                                    <input type="checkbox" checked={!!val}
                                                        onChange={e => handleChange(apiKey, e.target.checked)}
                                                        style={{ width: 16, height: 16, cursor: 'pointer' }}/>
                                                    <span style={{ fontSize: 13, color: '#2a2622' }}>{val ? 'Yes' : 'No'}</span>
                                                </div>
                                            ) : f.type === 'Date' ? (
                                                <input type="date" value={val}
                                                    onChange={e => handleChange(apiKey, e.target.value)}
                                                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #e6ddd0', borderRadius: 4, fontSize: 13, color: '#2a2622', background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}/>
                                            ) : (
                                                <input
                                                    type={f.type === 'Number' ? 'number' : f.type === 'Email' ? 'email' : f.type === 'Phone' ? 'tel' : f.type === 'URL' ? 'url' : 'text'}
                                                    value={val}
                                                    onChange={e => handleChange(apiKey, e.target.value)}
                                                    placeholder={f.label}
                                                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #e6ddd0', borderRadius: 4, fontSize: 13, color: '#2a2622', background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}/>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })()}
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
                </div>{/* end padding wrapper */}
            <ResizeHandles getResizeHandleProps={getResizeHandleProps} />
            </div>
        </>
    );
}