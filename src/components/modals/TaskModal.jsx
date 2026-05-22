import React, { useState, useEffect, useRef } from 'react';
import TimePicker from '../ui/TimePicker';
import { useDraggable, useResizable } from '../../hooks/useDraggable';
import ResizeHandles from '../../hooks/ResizeHandles';

// Design tokens (warm stone, matches app-wide system)
const T = {
    bg:           '#f0ece4',
    surface:      '#fbf8f3',
    surface2:     '#f5efe3',
    border:       '#e6ddd0',
    borderStrong: '#d4c8b4',
    ink:          '#2a2622',
    inkMid:       '#5a544c',
    inkMuted:     '#8a8378',
    gold:         '#c8b99a',
    goldInk:      '#7a6a48',
    danger:       '#9c3a2e',
    ok:           '#4d6b3d',
    info:         '#3a5a7a',
    sans:         '"Plus Jakarta Sans", system-ui, sans-serif',
    r:            3,
    rMd:          4,
};

export default function TaskModal({
    task,
    taskTypes,
    opportunities,
    accounts,
    contacts,
    settings,
    onClose,
    onSave,
    onAddTaskType,
    onSaveNewContact,
    onSaveNewAccount,
    onAddOpportunity,
    onAddContact,
    onAddAccount,
    errorMessage,
    onDismissError,
    saving,
    onOpenNestedContact,
    onOpenNestedAccount,
}) {
    // Normalize legacy single contactId into contacts[] on edit
    const normalizeTaskContacts = (t) => {
        if (Array.isArray(t.contacts) && t.contacts.length > 0) return t.contacts;
        if (t.contactId) {
            const c = (contacts || []).find(x => x.id === t.contactId);
            if (c) return [{ id: c.id, name: `${c.firstName} ${c.lastName}`.trim(), title: c.title || '', primary: true }];
        }
        return [];
    };

    const [formData, setFormData] = useState(task
        ? { ...task, contacts: normalizeTaskContacts(task), status: task.status || (task.completed ? 'Completed' : 'Open'), assignedTo: task.assignedTo || '', priority: task.priority || 'Medium', addToCalendar: false }
        : {
            title: '',
            description: '',
            type: (taskTypes || ['Call'])[0] || 'Call',
            dueDate: [new Date().getFullYear(), String(new Date().getMonth() + 1).padStart(2, '0'), String(new Date().getDate()).padStart(2, '0')].join('-'),
            dueTime: '09:00',
            reminderDate: '',
            reminderTime: '',
            relatedTo: '',
            opportunityId: '',
            contactId: '',
            contacts: [],
            accountId: '',
            completed: false,
            status: 'Open',
            assignedTo: '',
            priority: 'Medium',
            addToCalendar: true,
        }
    );

    const [showNewTypeInput, setShowNewTypeInput] = useState(false);
    const [newType,          setNewType]          = useState('');
    const [modalTab,         setModalTab]         = useState('task');

    // Search states
    const [opportunitySearch,       setOpportunitySearch]       = useState(() => {
        const presetId = task?.opportunityId;
        if (presetId) {
            const opp = (opportunities || []).find(o => o.id === presetId);
            return opp ? (opp.opportunityName || opp.account || '') : '';
        }
        return '';
    });
    const [showOpportunitySuggestions, setShowOpportunitySuggestions] = useState(false);
    const [contactSearch,    setContactSearch]    = useState('');
    const [showContactSugg,  setShowContactSugg]  = useState(false);
    const contactInputRef = useRef(null);
    const [accountSearch,    setAccountSearch]    = useState('');
    const [showAccountSugg,  setShowAccountSugg]  = useState(false);

    const { dragHandleProps, dragOffsetStyle, overlayStyle, clickCatcherStyle, clickCatcherProps, containerRef } = useDraggable();
    const { size, getResizeHandleProps } = useResizable(760, 560, 480, 360);

    const handleChange = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

    const handleSubmit = e => {
        e.preventDefault();
        onSave(formData);
    };

    const handleAddNewType = () => {
        if (newType.trim()) {
            onAddTaskType(newType.trim());
            setFormData(prev => ({ ...prev, type: newType.trim() }));
            setNewType('');
            setShowNewTypeInput(false);
        }
    };

    // ── Shared input style ─────────────────────────────────────
    const inputStyle = {
        width: '100%', padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: T.rMd,
        fontSize: 13, color: T.ink, background: T.surface, outline: 'none',
        boxSizing: 'border-box', fontFamily: T.sans,
    };
    const labelStyle = {
        fontSize: 11, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase',
        letterSpacing: 0.6, marginBottom: 5, display: 'block', fontFamily: T.sans,
    };
    const formGroupStyle = { display: 'flex', flexDirection: 'column' };
    const suggBoxStyle = {
        position: 'absolute', top: '100%', left: 0, right: 0, background: T.surface,
        border: `1px solid ${T.borderStrong}`, borderRadius: `0 0 ${T.rMd}px ${T.rMd}px`,
        maxHeight: 200, overflowY: 'auto', zIndex: 1000,
        boxShadow: '0 4px 12px rgba(42,38,34,0.10)',
    };
    const suggItemStyle = (active) => ({
        padding: '8px 12px', cursor: 'pointer', borderBottom: `1px solid ${T.border}`,
        background: active ? T.surface2 : 'transparent', fontSize: 13, color: T.ink, fontFamily: T.sans,
    });
    const newLinkStyle = {
        padding: '8px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 13,
        color: T.goldInk, borderTop: `1px solid ${T.border}`, fontFamily: T.sans,
    };

    const customFields = (settings?.customFieldsByObject?.Tasks || []).filter(f => (f.visibility || '').includes('Detail'));
    const hasCustomFields = customFields.length > 0;

    const tabStyle = (t) => ({
        padding: '8px 18px', border: 'none', background: 'transparent',
        borderBottom: modalTab === t ? `2px solid ${T.goldInk}` : '2px solid transparent',
        color: modalTab === t ? T.ink : T.inkMuted,
        fontWeight: modalTab === t ? 700 : 500,
        fontSize: 13, cursor: 'pointer', fontFamily: T.sans,
        marginBottom: -1, transition: 'color 120ms, border-color 120ms',
    });

    return (
        <>
            {/* Error overlay */}
            {errorMessage && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}
                    onClick={e => e.stopPropagation()}>
                    <div style={{ background: T.surface, borderRadius: 8, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: '2rem', maxWidth: 420, width: '90%', textAlign: 'center', fontFamily: T.sans }}>
                        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(156,58,46,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '1.5rem' }}>⚠️</div>
                        <h3 style={{ margin: '0 0 0.5rem', fontSize: 17, fontWeight: 700, color: T.ink }}>Failed to Save Task</h3>
                        <p style={{ margin: '0 0 1.5rem', fontSize: 14, color: T.inkMid, lineHeight: 1.6 }}>{errorMessage}</p>
                        <button onClick={onDismissError} style={{ padding: '8px 24px', borderRadius: T.rMd, border: `1px solid ${T.border}`, background: T.surface2, color: T.ink, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: T.sans }}>
                            OK
                        </button>
                    </div>
                </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <div style={{ ...overlayStyle }}/>
            <div {...clickCatcherProps}/>

            <div ref={containerRef} onClick={e => e.stopPropagation()} style={{
                ...dragOffsetStyle,
                width: size.w, height: size.h,
                background: T.surface, borderRadius: 8,
                boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
                border: `1px solid ${T.borderStrong}`,
                padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}>
                {/* ── Drag handle header ── */}
                <div {...dragHandleProps} style={{
                    ...dragHandleProps.style,
                    background: T.ink,
                    padding: '14px 20px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    borderRadius: '8px 8px 0 0', minHeight: 52,
                }}>
                    <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: T.surface, cursor: 'inherit', userSelect: 'none', fontFamily: T.sans }}>
                        {task ? 'Edit Task' : 'New Task'}
                    </h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 11, color: 'rgba(245,241,235,0.35)', fontWeight: 500, letterSpacing: '0.03em' }}>⠿ drag</span>
                        <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: T.rMd, border: '1px solid rgba(245,241,235,0.2)', background: 'transparent', color: T.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                    </div>
                </div>

                {/* ── Tab strip (only shown if custom fields exist) ── */}
                {hasCustomFields && (
                    <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, paddingLeft: 8, background: T.surface }}>
                        <button type="button" style={tabStyle('task')}     onClick={() => setModalTab('task')}>Task</button>
                        <button type="button" style={tabStyle('details')}  onClick={() => setModalTab('details')}>Details</button>
                    </div>
                )}

                {/* ── Scrollable form body ── */}
                <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
                    <form onSubmit={handleSubmit}>

                        {modalTab === 'task' && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

                                {/* Assign To */}
                                <div style={formGroupStyle}>
                                    <label style={labelStyle}>Assign To</label>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type="text"
                                            value={formData.assignedTo || ''}
                                            onChange={e => handleChange('assignedTo', e.target.value)}
                                            placeholder="Type to search users…"
                                            onFocus={e => e.target.nextSibling.style.display = 'block'}
                                            onBlur={e => setTimeout(() => { if (e.target.nextSibling) e.target.nextSibling.style.display = 'none'; }, 200)}
                                            style={inputStyle}
                                        />
                                        <div style={{ display: 'none', ...suggBoxStyle }}>
                                            {(settings?.users || [])
                                                .filter(u => !formData.assignedTo || u.name.toLowerCase().includes((formData.assignedTo || '').toLowerCase()))
                                                .map(u => (
                                                    <div key={u.id}
                                                        style={suggItemStyle(false)}
                                                        onMouseDown={() => handleChange('assignedTo', u.name)}
                                                        onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                        {u.name} <span style={{ color: T.inkMuted, fontSize: 12 }}>({u.role || 'User'})</span>
                                                    </div>
                                                ))
                                            }
                                        </div>
                                    </div>
                                </div>

                                {/* Priority */}
                                <div style={formGroupStyle}>
                                    <label style={labelStyle}>Priority</label>
                                    <select value={formData.priority || 'Medium'} onChange={e => handleChange('priority', e.target.value)}
                                        style={{ ...inputStyle, appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a8378' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', paddingRight: 28 }}>
                                        <option value="High">High</option>
                                        <option value="Medium">Medium</option>
                                        <option value="Low">Low</option>
                                    </select>
                                </div>

                                {/* Task Title — full width */}
                                <div style={{ ...formGroupStyle, gridColumn: 'span 2' }}>
                                    <label style={labelStyle}>Task Title *</label>
                                    <input type="text" value={formData.title} onChange={e => handleChange('title', e.target.value)} required placeholder="e.g., Follow up with prospect" style={inputStyle}/>
                                </div>

                                {/* Description — full width */}
                                <div style={{ ...formGroupStyle, gridColumn: 'span 2' }}>
                                    <label style={labelStyle}>Description</label>
                                    <textarea value={formData.description} onChange={e => handleChange('description', e.target.value)} placeholder="Additional details…" style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}/>
                                </div>

                                {/* Task Type */}
                                <div style={formGroupStyle}>
                                    <label style={labelStyle}>Task Type *</label>
                                    {!showNewTypeInput ? (
                                        <select value={formData.type} onChange={e => { if (e.target.value === '__ADD_NEW__') { setShowNewTypeInput(true); } else { handleChange('type', e.target.value); } }} required
                                            style={{ ...inputStyle, appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a8378' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', paddingRight: 28 }}>
                                            {(taskTypes || ['Call', 'Meeting', 'Email']).map(type => <option key={type} value={type}>{type}</option>)}
                                            <option value="__ADD_NEW__">+ Add New Type</option>
                                        </select>
                                    ) : (
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <input type="text" value={newType} onChange={e => setNewType(e.target.value)} placeholder="New task type…" style={{ ...inputStyle, flex: 1 }}/>
                                            <button type="button" onClick={handleAddNewType} style={{ padding: '6px 14px', background: T.ink, color: T.surface, border: 'none', borderRadius: T.rMd, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>Add</button>
                                            <button type="button" onClick={() => setShowNewTypeInput(false)} style={{ padding: '6px 14px', background: T.surface2, color: T.ink, border: `1px solid ${T.border}`, borderRadius: T.rMd, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>Cancel</button>
                                        </div>
                                    )}
                                </div>

                                {/* Status */}
                                <div style={formGroupStyle}>
                                    <label style={labelStyle}>Status</label>
                                    <select value={formData.status || 'Open'}
                                        onChange={e => {
                                            const s = e.target.value;
                                            setFormData(prev => ({
                                                ...prev,
                                                status: s,
                                                completed: s === 'Completed',
                                                completedDate: s === 'Completed' ? (prev.completedDate || [new Date().getFullYear(), String(new Date().getMonth() + 1).padStart(2, '0'), String(new Date().getDate()).padStart(2, '0')].join('-')) : prev.completedDate,
                                            }));
                                        }}
                                        style={{
                                            ...inputStyle,
                                            fontWeight: 600,
                                            appearance: 'none',
                                            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a8378' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                                            backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', paddingRight: 28,
                                            background: formData.status === 'Completed' ? 'rgba(77,107,61,0.12)' : formData.status === 'In-Process' ? 'rgba(184,115,51,0.12)' : 'rgba(58,90,122,0.08)',
                                        }}>
                                        <option value="Open">Open</option>
                                        <option value="In-Process">In-Process</option>
                                        <option value="Completed">Completed</option>
                                    </select>
                                </div>

                                {/* Opportunity — full width */}
                                <div style={{ ...formGroupStyle, gridColumn: 'span 2', position: 'relative' }}>
                                    <label style={labelStyle}>Opportunity</label>
                                    <input type="text" value={opportunitySearch}
                                        onChange={e => { setOpportunitySearch(e.target.value); setShowOpportunitySuggestions(e.target.value.length > 0); }}
                                        onFocus={() => { if (opportunitySearch.length > 0) setShowOpportunitySuggestions(true); }}
                                        placeholder="Type opportunity name or company…"
                                        autoComplete="off"
                                        style={inputStyle}
                                    />
                                    {formData.opportunityId && (
                                        <div style={{ marginTop: 6, padding: '6px 10px', background: T.surface2, borderRadius: T.rMd, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, border: `1px solid ${T.border}` }}>
                                            <span>{opportunities.find(o => o.id === formData.opportunityId)?.opportunityName || opportunities.find(o => o.id === formData.opportunityId)?.account || 'Unknown'}</span>
                                            <button type="button" onClick={() => { handleChange('opportunityId', ''); setOpportunitySearch(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: T.inkMid, lineHeight: 1 }}>×</button>
                                        </div>
                                    )}
                                    {showOpportunitySuggestions && (
                                        <div style={{ ...suggBoxStyle }}>
                                            {opportunities.filter(opp =>
                                                opp.account?.toLowerCase().includes(opportunitySearch.toLowerCase()) ||
                                                opp.opportunityName?.toLowerCase().includes(opportunitySearch.toLowerCase()) ||
                                                opp.site?.toLowerCase().includes(opportunitySearch.toLowerCase())
                                            ).map(opp => (
                                                <div key={opp.id}
                                                    onClick={() => { handleChange('opportunityId', opp.id); setOpportunitySearch(''); setShowOpportunitySuggestions(false); }}
                                                    style={suggItemStyle(false)}
                                                    onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                    <div style={{ fontWeight: 600 }}>{opp.account}</div>
                                                    {opp.opportunityName && <div style={{ fontSize: 12, color: T.inkMid }}>{opp.opportunityName}</div>}
                                                    {opp.site && <div style={{ fontSize: 11, color: T.inkMuted }}>{opp.site}</div>}
                                                </div>
                                            ))}
                                            {opportunities.filter(opp => opp.account?.toLowerCase().includes(opportunitySearch.toLowerCase()) || opp.opportunityName?.toLowerCase().includes(opportunitySearch.toLowerCase())).length === 0 && (
                                                <div style={{ padding: '10px 12px', color: T.inkMuted, fontSize: 13, fontFamily: T.sans }}>No matches found</div>
                                            )}
                                            <div onMouseDown={e => e.preventDefault()} onClick={() => onAddOpportunity && onAddOpportunity()} style={{ ...newLinkStyle }}
                                                onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                + New Opportunity
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Contacts — multi-select */}
                                <div style={{ ...formGroupStyle, gridColumn: 'span 2', position: 'relative' }}>
                                    <label style={labelStyle}>Contacts</label>

                                    {/* Selected contact chips */}
                                    {(formData.contacts || []).length > 0 && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                                            {(formData.contacts || []).map((c, i) => (
                                                <div key={c.id || i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px 4px 10px', background: T.surface2, border: `1px solid ${T.borderStrong}`, borderRadius: 999, fontSize: 12, fontWeight: 500, color: T.ink, fontFamily: T.sans }}>
                                                    {c.primary && (
                                                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.goldInk, background: 'rgba(200,185,154,0.28)', padding: '1px 5px', borderRadius: 2, flexShrink: 0 }}>Primary</span>
                                                    )}
                                                    <span>{c.name}</span>
                                                    <button type="button"
                                                        onClick={() => {
                                                            const next = (formData.contacts || []).filter((_, j) => j !== i);
                                                            // If we removed the primary, promote the first remaining
                                                            const hasPrimary = next.some(x => x.primary);
                                                            handleChange('contacts', !hasPrimary && next.length > 0 ? next.map((x, j) => j === 0 ? { ...x, primary: true } : x) : next);
                                                        }}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.inkMuted, fontSize: 14, lineHeight: 1, padding: '0 0 0 2px', flexShrink: 0 }}>×</button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Search input — stays open to allow adding multiple */}
                                    <input
                                        ref={contactInputRef}
                                        type="text"
                                        value={contactSearch}
                                        onChange={e => { setContactSearch(e.target.value); setShowContactSugg(e.target.value.length > 0); }}
                                        onFocus={() => setShowContactSugg(contactSearch.length > 0)}
                                        placeholder={(formData.contacts || []).length > 0 ? 'Add another contact…' : 'Type contact name…'}
                                        autoComplete="off"
                                        style={inputStyle}
                                    />

                                    {/* Dropdown suggestions */}
                                    {showContactSugg && (() => {
                                        const alreadyIds = new Set((formData.contacts || []).map(c => c.id));
                                        const q = contactSearch.toLowerCase();
                                        const matched = contacts.filter(c =>
                                            !alreadyIds.has(c.id) && (
                                                `${c.firstName} ${c.lastName}`.toLowerCase().startsWith(q) ||
                                                c.firstName?.toLowerCase().startsWith(q) ||
                                                c.lastName?.toLowerCase().startsWith(q)
                                            )
                                        );
                                        return (
                                            <div style={{ ...suggBoxStyle, top: undefined, bottom: '100%', borderRadius: `${T.rMd}px ${T.rMd}px 0 0` }}>
                                                {matched.map(c => (
                                                    <div key={c.id}
                                                        onMouseDown={e => e.preventDefault()}
                                                        onClick={() => {
                                                            const existing = formData.contacts || [];
                                                            const newEntry = { id: c.id, name: `${c.firstName} ${c.lastName}`.trim(), title: c.title || '', primary: existing.length === 0 };
                                                            handleChange('contacts', [...existing, newEntry]);
                                                            setContactSearch('');
                                                            // Keep dropdown open for more; re-focus input
                                                            setTimeout(() => { contactInputRef.current?.focus(); }, 0);
                                                        }}
                                                        style={suggItemStyle(false)}
                                                        onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <div style={{ flex: 1 }}>
                                                                <div style={{ fontWeight: 600 }}>{c.firstName} {c.lastName}</div>
                                                                {c.title && <div style={{ fontSize: 12, color: T.inkMid }}>{c.title}</div>}
                                                            </div>
                                                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.ok} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                                                        </div>
                                                    </div>
                                                ))}
                                                {matched.length === 0 && (
                                                    <div style={{ padding: '10px 12px', color: T.inkMuted, fontSize: 13, fontFamily: T.sans }}>No matches found</div>
                                                )}
                                                <div onMouseDown={e => e.preventDefault()}
                                                    onClick={e => { e.stopPropagation(); setShowContactSugg(false); onOpenNestedContact && onOpenNestedContact({ firstName: contactSearch.split(/\s+/)[0] || '', lastName: contactSearch.split(/\s+/).slice(1).join(' ') || '' }); setContactSearch(''); }}
                                                    style={{ ...newLinkStyle }}
                                                    onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                    + New Contact
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* Account — full width */}
                                <div style={{ ...formGroupStyle, gridColumn: 'span 2', position: 'relative' }}>
                                    <label style={labelStyle}>Account</label>
                                    <input type="text" value={accountSearch}
                                        onChange={e => { setAccountSearch(e.target.value); setShowAccountSugg(e.target.value.length > 0); }}
                                        onFocus={() => { if (accountSearch.length > 0) setShowAccountSugg(true); }}
                                        placeholder="Type account name…"
                                        autoComplete="off"
                                        style={inputStyle}
                                    />
                                    {formData.accountId && (
                                        <div style={{ marginTop: 6, padding: '6px 10px', background: T.surface2, borderRadius: T.rMd, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, border: `1px solid ${T.border}` }}>
                                            <span>{accounts.find(a => a.id === formData.accountId)?.name || 'Unknown'}</span>
                                            <button type="button" onClick={() => { handleChange('accountId', ''); setAccountSearch(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: T.inkMid, lineHeight: 1 }}>×</button>
                                        </div>
                                    )}
                                    {showAccountSugg && (
                                        <div style={{ ...suggBoxStyle, top: undefined, bottom: '100%', borderRadius: `${T.rMd}px ${T.rMd}px 0 0` }}>
                                            {accounts.filter(a => a.name?.toLowerCase().startsWith(accountSearch.toLowerCase())).map(a => (
                                                <div key={a.id}
                                                    onClick={() => { handleChange('accountId', a.id); setAccountSearch(''); setShowAccountSugg(false); }}
                                                    style={suggItemStyle(false)}
                                                    onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                    <div style={{ fontWeight: 600 }}>{a.name}</div>
                                                    {a.industry && <div style={{ fontSize: 12, color: T.inkMid }}>{a.industry}</div>}
                                                </div>
                                            ))}
                                            {accounts.filter(a => a.name?.toLowerCase().startsWith(accountSearch.toLowerCase())).length === 0 && (
                                                <div style={{ padding: '10px 12px', color: T.inkMuted, fontSize: 13, fontFamily: T.sans }}>No matches found</div>
                                            )}
                                            <div onMouseDown={e => e.preventDefault()}
                                                onClick={e => { e.stopPropagation(); setShowAccountSugg(false); onOpenNestedAccount && onOpenNestedAccount({ name: accountSearch.trim() }); setAccountSearch(''); }}
                                                style={{ ...newLinkStyle }}
                                                onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                + New Account
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Due Date */}
                                <div style={formGroupStyle}>
                                    <label style={labelStyle}>Due Date *</label>
                                    <input type="date" value={formData.dueDate} onChange={e => handleChange('dueDate', e.target.value)} required style={inputStyle}/>
                                </div>

                                {/* Due Time */}
                                <div style={formGroupStyle}>
                                    <label style={labelStyle}>Due Time</label>
                                    <TimePicker value={formData.dueTime} onChange={val => handleChange('dueTime', val)}/>
                                </div>

                                {/* Reminder Date */}
                                <div style={formGroupStyle}>
                                    <label style={labelStyle}>Reminder Date</label>
                                    <input type="date" value={formData.reminderDate} onChange={e => handleChange('reminderDate', e.target.value)} style={inputStyle}/>
                                </div>

                                {/* Reminder Time */}
                                <div style={formGroupStyle}>
                                    <label style={labelStyle}>Reminder Time</label>
                                    <TimePicker value={formData.reminderTime} onChange={val => handleChange('reminderTime', val)}/>
                                </div>

                                {/* Add to Google Calendar */}
                                {formData.dueDate && (
                                    <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: `1px solid ${T.border}`, marginTop: 4 }}>
                                        <input type="checkbox" id="addToCalendar" checked={!!formData.addToCalendar} onChange={e => handleChange('addToCalendar', e.target.checked)}
                                            style={{ width: 16, height: 16, accentColor: T.ink, cursor: 'pointer', flexShrink: 0 }}/>
                                        <label htmlFor="addToCalendar" style={{ fontSize: 13, fontWeight: 600, color: T.inkMid, cursor: 'pointer', userSelect: 'none', fontFamily: T.sans }}>
                                            📅 Add to Google Calendar
                                        </label>
                                        <span style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>Creates an all-day event on the due date</span>
                                    </div>
                                )}

                            </div>
                        )}

                        {/* ── Custom fields tab ── */}
                        {modalTab === 'details' && (() => {
                            if (!hasCustomFields) return (
                                <div style={{ padding: '2rem', textAlign: 'center', color: T.inkMuted, fontSize: 13, fontStyle: 'italic', fontFamily: T.sans }}>
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
                                            <div key={f.api} style={formGroupStyle}>
                                                <label style={labelStyle}>
                                                    {f.label}{f.required && <span style={{ color: T.danger, marginLeft: 3 }}>*</span>}
                                                </label>
                                                {f.type === 'Toggle' ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 6 }}>
                                                        <input type="checkbox" checked={!!val} onChange={e => handleChange(apiKey, e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }}/>
                                                        <span style={{ fontSize: 13, color: T.ink, fontFamily: T.sans }}>{val ? 'Yes' : 'No'}</span>
                                                    </div>
                                                ) : f.type === 'Date' ? (
                                                    <input type="date" value={val} onChange={e => handleChange(apiKey, e.target.value)} style={inputStyle}/>
                                                ) : (
                                                    <input
                                                        type={f.type === 'Number' ? 'number' : f.type === 'Email' ? 'email' : f.type === 'Phone' ? 'tel' : f.type === 'URL' ? 'url' : 'text'}
                                                        value={val}
                                                        onChange={e => handleChange(apiKey, e.target.value)}
                                                        placeholder={f.label}
                                                        style={inputStyle}
                                                    />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })()}

                        {/* ── Footer actions ── */}
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
                            <button type="button" onClick={onClose} disabled={saving}
                                style={{ padding: '8px 20px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.rMd, fontSize: 13, fontWeight: 600, color: T.inkMid, cursor: 'pointer', fontFamily: T.sans }}>
                                Cancel
                            </button>
                            <button type="submit" disabled={saving}
                                style={{ padding: '8px 20px', background: T.ink, border: 'none', borderRadius: T.rMd, fontSize: 13, fontWeight: 700, color: T.surface, cursor: 'pointer', fontFamily: T.sans, opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                                {saving && <span style={{ width: 14, height: 14, border: '2px solid rgba(245,241,235,0.4)', borderTopColor: T.surface, borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }}/>}
                                {saving ? 'Saving…' : (task ? 'Update' : 'Create')}
                            </button>
                        </div>

                    </form>
                </div>

                <ResizeHandles getResizeHandleProps={getResizeHandleProps}/>
            </div>
        </>
    );
}
