import React, { useState, useEffect, useRef } from 'react';
import { productOptions, stages } from '../../utils/constants';

export default function OpportunityModal({ opportunity, accounts, contacts, settings, pipelines, activePipelineId, currentUser, activities, onSaveActivity, onDeleteActivity, onSaveComment, onEditComment, onDeleteComment, onClose, onSave, onAddAccount, onSaveNewContact, onSaveNewAccount, onAddContact, lastCreatedAccountName, onAddRep, lastCreatedRepName }) {
    const stages = (settings.funnelStages && settings.funnelStages.length > 0)
        ? settings.funnelStages.filter(s => s.name.trim()).map(s => s.name)
        : ['Qualification', 'Discovery', 'Evaluation (Demo)', 'Proposal', 'Negotiation/Review', 'Contracts', 'Closed Won', 'Closed Lost'];
    const allPipelines = (pipelines && pipelines.length > 0) ? pipelines : [{ id: 'default', name: 'New Business', color: '#2563eb' }];
    // Field-level visibility (mirrors App-level helper)
    const modalUserRecord = (settings.users || []).find(u => u.name === currentUser);
    const modalUserRole = modalUserRecord ? (modalUserRecord.userType || 'User') : (settings.users || []).length === 0 ? 'Admin' : 'User';
    const canViewField = (fieldKey) => {
        const fv = settings.fieldVisibility || {};
        const rules = fv[fieldKey];
        if (!rules) return true;
        return rules[modalUserRole] !== false;
    };
    const [formData, setFormData] = useState(opportunity || {
        opportunityName: '',
        account: '',
        site: '',
        salesRep: '',
        painPoints: '',
        contacts: '',
        stage: 'Qualification',
        probability: null,
        arr: 0,
        implementationCost: 0,
        forecastedCloseDate: new Date().toISOString().split('T')[0],
        products: 'Shiftboard',
        unionized: 'No',
        notes: '',
        nextSteps: '',
        pipelineId: activePipelineId || 'default'
    });

    const [contactSearch, setContactSearch] = useState('');
    const [showContactSuggestions, setShowContactSuggestions] = useState(false);
    const [accountSearch, setAccountSearch] = useState(opportunity?.account || '');
    const [showAccountSuggestions, setShowAccountSuggestions] = useState(false);
    const [repSearch, setRepSearch] = useState(opportunity?.salesRep || '');
    const [showRepSuggestions, setShowRepSuggestions] = useState(false);

    // Auto-populate account when a new one is created
    useEffect(() => {
        if (lastCreatedAccountName) {
            setAccountSearch(lastCreatedAccountName);
            setFormData(prev => ({ ...prev, account: lastCreatedAccountName }));
        }
    }, [lastCreatedAccountName]);

    // Auto-populate sales rep when a new one is created
    useEffect(() => {
        if (lastCreatedRepName) {
            setRepSearch(lastCreatedRepName);
            setFormData(prev => ({ ...prev, salesRep: lastCreatedRepName }));
        }
    }, [lastCreatedRepName]);
    const [selectedContacts, setSelectedContacts] = useState(
        opportunity?.contacts ? opportunity.contacts.split(', ').filter(c => c) : []
    );
    const [selectedContactIds, setSelectedContactIds] = useState(
        opportunity?.contactIds || []
    );
    const [nestedModal, setNestedModal] = useState(null);
    const [validationErrors, setValidationErrors] = useState({});

    // Auto-calculate close quarter based on forecasted close date and fiscal year settings
    const calculateCloseQuarter = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        const month = date.getMonth() + 1; // 1-12
        const year = date.getFullYear();
        const fiscalStart = settings?.fiscalYearStart || 10;
        
        // Calculate which quarter this month falls into
        // Quarter 1 starts at fiscalStart, Quarter 2 starts 3 months later, etc.
        let monthsFromFiscalStart = month - fiscalStart;
        if (monthsFromFiscalStart < 0) {
            monthsFromFiscalStart += 12; // Wrap around to previous fiscal year
        }
        
        // Determine quarter (0-2 = Q1, 3-5 = Q2, 6-8 = Q3, 9-11 = Q4)
        const quarter = Math.floor(monthsFromFiscalStart / 3) + 1;
        
        // Determine fiscal year
        let fiscalYear;
        if (month >= fiscalStart) {
            fiscalYear = year + 1;
        } else {
            fiscalYear = year;
        }
        
        return `FY${fiscalYear} Q${quarter}`;
    };

    const closeQuarter = calculateCloseQuarter(formData.forecastedCloseDate);

    // Create flat list of all accounts and sub-accounts for dropdown
    const allAccountOptions = [];
    accounts.forEach(account => {
        allAccountOptions.push({ value: account.name, label: account.name });
        (accounts || []).filter(a => a.parentId === account.id).forEach(sub => {
            allAccountOptions.push({ value: sub.name, label: `${account.name} - ${sub.name}` });
        });
    });

    const handleChange = (field, value) => {
        if (validationErrors[field]) setValidationErrors(prev => { const n = {...prev}; delete n[field]; return n; });
        if (field === 'stage') {
            const stageDefault = (settings?.funnelStages || []).find(s => s.name === value);
            const defaultProb = stageDefault ? stageDefault.weight : null;
            const prevStageDefault = (settings?.funnelStages || []).find(s => s.name === formData.stage);
            const prevDefaultProb = prevStageDefault ? prevStageDefault.weight : null;
            const probIsDefault = formData.probability === null || formData.probability === prevDefaultProb;
            setFormData({ ...formData, [field]: value, probability: probIsDefault ? defaultProb : formData.probability });
        } else {
            setFormData({ ...formData, [field]: value });
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const errors = {};
        if (!formData.opportunityName || !formData.opportunityName.trim())
            errors.opportunityName = 'Opportunity name is required';
        if (!formData.account || !formData.account.trim())
            errors.account = 'Account name is required';
        if (!formData.salesRep || !formData.salesRep.trim())
            errors.salesRep = 'Sales rep is required';
        if (!formData.forecastedCloseDate)
            errors.forecastedCloseDate = 'Close date is required';
        if (formData.arr === '' || formData.arr === null || formData.arr === undefined || parseFloat(formData.arr) < 0)
            errors.arr = 'ARR is required (enter 0 if none)';

        // Warn if account name doesn't match an existing account
if (formData.account && formData.account.trim()) {
    const isJustCreated = lastCreatedAccountName &&
        lastCreatedAccountName.toLowerCase() === formData.account.trim().toLowerCase();
    if (!isJustCreated) {
        const accountExists = (accounts || []).some(a =>
            a.name && a.name.toLowerCase() === formData.account.trim().toLowerCase()
        );
        if (!accountExists) {
            errors.account = '__not_found__';
        }
    }
}

        if (Object.keys(errors).length > 0) {
            setValidationErrors(errors);
            setTimeout(() => {
                const el = document.querySelector('.field-error');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 50);
            return;
        }
        setValidationErrors({});
        onSave({
            ...formData,
            arr: parseFloat(formData.arr) || 0,
            implementationCost: parseFloat(formData.implementationCost) || 0,
            closeQuarter: closeQuarter,
            contactIds: selectedContactIds
        });
    };

    // Activity log state (inside modal)
    const [showLogActivity, setShowLogActivity] = React.useState(false);
    const [newActivity, setNewActivity] = React.useState({ type: 'Call', date: new Date().toISOString().split('T')[0], notes: '' });
    // Comment thread state
    const [commentDraft, setCommentDraft] = React.useState('');
    const [editingCommentId, setEditingCommentId] = React.useState(null);
    const [editingCommentText, setEditingCommentText] = React.useState('');
    const [mentionQuery, setMentionQuery] = React.useState(null); // null = closed, string = query after @
    const [mentionAnchorPos, setMentionAnchorPos] = React.useState(0); // cursor position of the @ sign
    const commentTextareaRef = React.useRef(null);
    const comments = (opportunity?.comments || []).slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const teamMembers = (settings?.users || []).map(u => u.name).filter(Boolean).sort();

    // @mention helpers
    const extractMentions = (text) => {
        if (!text) return [];
        const found = [];
        const parts = text.split('@');
        for (let i = 1; i < parts.length; i++) {
            for (const name of [...teamMembers].sort((a, b) => b.length - a.length)) {
                if (parts[i].startsWith(name)) {
                    found.push(name);
                    break;
                }
            }
        }
        return [...new Set(found)];
    };
    const renderCommentText = (text) => {
        if (!text) return null;
        const parts = text.split(/(@[\w][\w\s]*)/g);
        return parts.map((part, i) => {
            if (part.startsWith('@')) {
                const name = part.slice(1).trim();
                const isValid = teamMembers.includes(name);
                return isValid ? (
                    <span key={i} style={{ background: '#dbeafe', color: '#1d4ed8', borderRadius: '4px', padding: '0.0625rem 0.375rem', fontWeight: '700', fontSize: '0.8125rem' }}>{part}</span>
                ) : <span key={i}>{part}</span>;
            }
            return <span key={i}>{part}</span>;
        });
    };
    // Handle @mention detection in textarea
    const handleCommentDraftChange = (e) => {
        const val = e.target.value;
        const cursor = e.target.selectionStart;
        setCommentDraft(val);
        // Find if cursor is inside an @mention word
        const textBeforeCursor = val.slice(0, cursor);
        const atMatch = textBeforeCursor.match(/@([\w\s]*)$/);
        if (atMatch) {
            setMentionQuery(atMatch[1]);
            setMentionAnchorPos(textBeforeCursor.lastIndexOf('@'));
        } else {
            setMentionQuery(null);
        }
    };
    const insertMention = (name) => {
        const before = commentDraft.slice(0, mentionAnchorPos);
        const after = commentDraft.slice(mentionAnchorPos).replace(/@[\w\s]*/, '');
        const newVal = before + '@' + name + ' ' + after;
        setCommentDraft(newVal);
        setMentionQuery(null);
        if (commentTextareaRef.current) commentTextareaRef.current.focus();
    };
    const filteredMentions = mentionQuery !== null
        ? teamMembers.filter(m => m.toLowerCase().startsWith(mentionQuery.toLowerCase())).slice(0, 6)
        : [];
    const activityTypes = ['Call', 'Email', 'Meeting', 'Demo', 'Proposal Sent', 'Follow-up', 'Other'];
    const oppActivities = opportunity
        ? (activities || []).filter(a => a.opportunityId === opportunity.id).sort((a, b) => new Date(b.date) - new Date(a.date))
        : [];
    const activityTypeIcon = { Call: '📞', Email: '✉️', Meeting: '🤝', Demo: '🖥️', 'Proposal Sent': '📄', 'Follow-up': '🔄', Other: '📝' };

    // Deal age info for header strip
    const dealAgeInfo = opportunity ? (() => {
        const today = new Date();
        const dealAge = opportunity.createdDate ? Math.floor((today - new Date(opportunity.createdDate)) / 86400000) : null;
        const timeInStage = opportunity.stageChangedDate ? Math.floor((today - new Date(opportunity.stageChangedDate)) / 86400000) : null;
        return { dealAge, timeInStage };
    })() : null;

    return (
        <div className="modal-overlay">
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '680px' }}>
                <h2>{opportunity ? 'Edit Opportunity' : 'New Opportunity'}</h2>

                {/* Deal age / time in stage info strip */}
                {opportunity && dealAgeInfo && (dealAgeInfo.dealAge !== null || dealAgeInfo.timeInStage !== null) && (
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '1rem', overflow: 'hidden' }}>
                        {/* Main metrics row */}
                        <div style={{ display: 'flex', gap: '1rem', padding: '0.625rem 0.875rem', flexWrap: 'wrap', borderBottom: (opportunity.stageHistory && opportunity.stageHistory.length > 0) ? '1px solid #e2e8f0' : 'none' }}>
                            {dealAgeInfo.dealAge !== null && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                    <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Deal Age</span>
                                    <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: dealAgeInfo.dealAge > 90 ? '#ef4444' : dealAgeInfo.dealAge > 60 ? '#f59e0b' : '#10b981' }}>
                                        {dealAgeInfo.dealAge}d
                                    </span>
                                </div>
                            )}
                            {dealAgeInfo.dealAge !== null && dealAgeInfo.timeInStage !== null && <span style={{ color: '#e2e8f0', fontSize: '0.875rem' }}>|</span>}
                            {dealAgeInfo.timeInStage !== null && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                    <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Time in Stage</span>
                                    <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: dealAgeInfo.timeInStage > 30 ? '#ef4444' : dealAgeInfo.timeInStage > 14 ? '#f59e0b' : '#10b981' }}>
                                        {dealAgeInfo.timeInStage}d
                                    </span>
                                    {dealAgeInfo.timeInStage > 14 && opportunity.stage !== 'Closed Won' && opportunity.stage !== 'Closed Lost' && (
                                        <span style={{ fontSize: '0.625rem', color: dealAgeInfo.timeInStage > 30 ? '#ef4444' : '#f59e0b', fontWeight: '700', background: dealAgeInfo.timeInStage > 30 ? '#fef2f2' : '#fffbeb', padding: '0.1rem 0.375rem', borderRadius: '4px', border: `1px solid ${dealAgeInfo.timeInStage > 30 ? '#fecaca' : '#fde68a'}` }}>⚠ Stale</span>
                                    )}
                                </div>
                            )}
                            {oppActivities.length > 0 && (
                                <>
                                    <span style={{ color: '#e2e8f0', fontSize: '0.875rem' }}>|</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                        <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last Activity</span>
                                        <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: '#475569' }}>
                                            {new Date(oppActivities[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {oppActivities[0].type}
                                        </span>
                                    </div>
                                </>
                            )}
                            {oppActivities.length === 0 && opportunity.stage !== 'Closed Won' && opportunity.stage !== 'Closed Lost' && (
                                <>
                                    <span style={{ color: '#e2e8f0', fontSize: '0.875rem' }}>|</span>
                                    <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#ef4444', background: '#fef2f2', padding: '0.1rem 0.5rem', borderRadius: '4px', border: '1px solid #fecaca' }}>⚠ No activities logged</span>
                                </>
                            )}
                        </div>
                        {/* Stage history timeline */}
                        {opportunity.stageHistory && opportunity.stageHistory.length > 0 && (
                            <div style={{ padding: '0.5rem 0.875rem', display: 'flex', gap: '0', alignItems: 'center', flexWrap: 'wrap', rowGap: '0.25rem' }}>
                                <span style={{ fontSize: '0.6125rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '0.625rem', flexShrink: 0 }}>Stage History</span>
                                {(() => {
                                    const hist = opportunity.stageHistory || [];
                                    const first = opportunity.createdDate ? { stage: hist[0]?.prevStage || opportunity.stage, date: opportunity.createdDate } : null;
                                    const entries = first ? [first, ...hist.map(h => ({ stage: h.stage, date: h.date }))] : hist.map(h => ({ stage: h.stage, date: h.date }));
                                    return entries.map((e, i) => (
                                        <React.Fragment key={i}>
                                            {i > 0 && <span style={{ color: '#cbd5e1', fontSize: '0.625rem', margin: '0 0.2rem' }}>→</span>}
                                            <span style={{ fontSize: '0.6875rem', color: '#475569', fontWeight: i === entries.length - 1 ? '700' : '400' }}>
                                                {e.stage}
                                                <span style={{ color: '#94a3b8', marginLeft: '0.2rem', fontWeight: '400' }}>({new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})</span>
                                            </span>
                                        </React.Fragment>
                                    ));
                                })()}
                            </div>
                        )}
                    </div>
                )}

                {/* Lost reason banner for Closed Lost opps */}
                {opportunity && opportunity.stage === 'Closed Lost' && (opportunity.lostCategory || opportunity.lostReason) && (
                    <div style={{ padding: '0.75rem 0.875rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#b91c1c', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Loss Reason</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {opportunity.lostCategory && (
                                <span style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', padding: '0.2rem 0.625rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: '700' }}>
                                    {opportunity.lostCategory}
                                </span>
                            )}
                            {opportunity.lostDate && (
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                    {new Date(opportunity.lostDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </span>
                            )}
                        </div>
                        {opportunity.lostReason && (
                            <div style={{ fontSize: '0.8125rem', color: '#7f1d1d', marginTop: '0.375rem', lineHeight: '1.4' }}>{opportunity.lostReason}</div>
                        )}
                    </div>
                )}
                <form onSubmit={handleSubmit}>
                    <div className="form-grid">
                        <div className="form-group full">
                            <label>Opportunity Name*</label>
                            <input
                                type="text"
                                value={formData.opportunityName}
                                onChange={e => handleChange('opportunityName', e.target.value)}
                                placeholder="e.g., Q1 2025 Implementation"
                                style={validationErrors.opportunityName ? { borderColor: '#dc2626', background: '#fff8f8' } : {}}
                            />
                            {validationErrors.opportunityName && <div className="field-error" style={{ color: '#dc2626', fontSize: '0.6875rem', fontWeight: '600', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>⚠ {validationErrors.opportunityName}</div>}
                        </div>
                        {allPipelines.length > 1 && (
                            <div className="form-group full">
                                <label>Pipeline</label>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    {allPipelines.map(p => {
                                        const sel = (formData.pipelineId || 'default') === p.id;
                                        return (
                                            <button key={p.id} type="button" onClick={() => handleChange('pipelineId', p.id)} style={{
                                                padding: '0.375rem 0.875rem', borderRadius: '999px', border: 'none', cursor: 'pointer',
                                                fontFamily: 'inherit', fontSize: '0.8125rem', fontWeight: '700', transition: 'all 0.15s',
                                                background: sel ? p.color : '#f1f5f9',
                                                color: sel ? '#fff' : '#64748b',
                                                boxShadow: sel ? `0 2px 6px ${p.color}50` : 'none',
                                            }}>{p.name}</button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        <div className="form-group" style={{ position: 'relative' }}>
                            <label>Account Name*</label>
                            <input
                                type="text"
                                value={accountSearch}
                                onChange={e => {
                                    setAccountSearch(e.target.value);
                                    setShowAccountSuggestions(e.target.value.length > 0);
                                    handleChange('account', e.target.value);
                                    if (validationErrors.account) setValidationErrors(prev => { const n={...prev}; delete n.account; return n; });
                                }}
                                onFocus={() => setShowAccountSuggestions(accountSearch.length > 0)}
                                onBlur={() => setTimeout(() => setShowAccountSuggestions(false), 200)}
                                placeholder="Start typing account name..."
                                autoComplete="off"
                                style={validationErrors.account ? { borderColor: '#dc2626', background: '#fff8f8' } : {}}
                            />
                            {validationErrors.account && validationErrors.account !== '__not_found__' && (
                                <div className="field-error" style={{ color: '#dc2626', fontSize: '0.6875rem', fontWeight: '600', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>⚠ {validationErrors.account}</div>
                            )}
                            {validationErrors.account === '__not_found__' && (
                                <div style={{ marginTop: '0.375rem', background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '6px', padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                                    <span style={{ color: '#92400e', fontSize: '0.75rem', fontWeight: '600' }}>
                                        ⚠ "{formData.account}" doesn't exist in your accounts list.
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => { setValidationErrors(prev => { const n = {...prev}; delete n.account; return n; }); onAddAccount(formData); }}
                                        style={{ background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '5px', padding: '0.25rem 0.625rem', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                                    >+ Create Account</button>
                                </div>
                            )}
                            {showAccountSuggestions && (
                                <div style={{
                                    position: 'absolute', top: '100%', left: 0, right: 0,
                                    background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px',
                                    marginTop: '0.25rem', maxHeight: '200px', overflowY: 'auto', zIndex: 1000,
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                                }}>
                                    {allAccountOptions
                                        .filter(opt => opt.label.toLowerCase().startsWith(accountSearch.toLowerCase()))
                                        .map(opt => (
                                            <div key={opt.value}
                                                onMouseDown={e => e.preventDefault()}
                                                onClick={() => { setAccountSearch(opt.label); handleChange('account', opt.value); setShowAccountSuggestions(false); }}
                                                style={{ padding: '0.625rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f1f3f5', fontWeight: '600', fontSize: '0.875rem' }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >{opt.label}</div>
                                        ))}
                                    <div onMouseDown={e => e.preventDefault()}
                                        onClick={() => { setShowAccountSuggestions(false); onAddAccount(formData); }}
                                        style={{ padding: '0.625rem 0.75rem', cursor: 'pointer', color: '#2563eb', fontWeight: '600', fontSize: '0.875rem' }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >+ New Account</div>
                                </div>
                            )}
                        </div>
                        <div className="form-group">
                            <label>Site Name</label>
                            <input
                                type="text"
                                value={formData.site}
                                onChange={e => handleChange('site', e.target.value)}
                            />
                        </div>
                        <div className="form-group" style={{ position: 'relative' }}>
                            <label>Sales Rep*</label>
                            <input
                                type="text"
                                value={repSearch}
                                onChange={e => {
                                    setRepSearch(e.target.value);
                                    setShowRepSuggestions(e.target.value.length > 0);
                                    handleChange('salesRep', e.target.value);
                                    if (validationErrors.salesRep) setValidationErrors(prev => { const n={...prev}; delete n.salesRep; return n; });
                                }}
                                onFocus={() => setShowRepSuggestions(repSearch.length > 0)}
                                onBlur={() => setTimeout(() => setShowRepSuggestions(false), 200)}
                                style={validationErrors.salesRep ? { borderColor: '#dc2626', background: '#fff8f8' } : {}}
                                placeholder="Start typing rep name..."
                                required
                                autoComplete="off"
                            />
                            {showRepSuggestions && (
                                <div style={{
                                    position: 'absolute', top: '100%', left: 0, right: 0,
                                    background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px',
                                    marginTop: '0.25rem', maxHeight: '200px', overflowY: 'auto', zIndex: 1000,
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                                }}>
                                    {(settings?.users || [])
                                        .filter(u => u.name.toLowerCase().startsWith(repSearch.toLowerCase()))
                                        .map(user => (
                                            <div key={user.id}
                                                onMouseDown={e => e.preventDefault()}
                                                onClick={() => { setRepSearch(user.name); handleChange('salesRep', user.name); setShowRepSuggestions(false); }}
                                                style={{ padding: '0.625rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f1f3f5', fontWeight: '600', fontSize: '0.875rem' }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >{user.name}</div>
                                        ))}
                                    <div onMouseDown={e => e.preventDefault()}
                                        onClick={() => { setShowRepSuggestions(false); if (onAddRep) onAddRep(); }}
                                        style={{ padding: '0.625rem 0.75rem', cursor: 'pointer', color: '#2563eb', fontWeight: '600', fontSize: '0.875rem' }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >+ New Rep</div>
                                </div>
                            )}
                            {validationErrors.salesRep && <div className="field-error" style={{ color: '#dc2626', fontSize: '0.6875rem', fontWeight: '600', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>⚠ {validationErrors.salesRep}</div>}
                        </div>
                        <div className="form-group">
                            <label>Stage*</label>
                            <select
                                value={formData.stage}
                                onChange={e => handleChange('stage', e.target.value)}
                                required
                            >
                                {stages.map(stage => (
                                    <option key={stage} value={stage}>{stage}</option>
                                ))}
                            </select>
                        </div>
                        {/* Probability field */}
                        {(() => {
                            const stageDefault = (settings?.funnelStages || []).find(s => s.name === formData.stage);
                            const defaultProb = stageDefault ? stageDefault.weight : null;
                            const effectiveProb = formData.probability !== null && formData.probability !== undefined ? formData.probability : defaultProb;
                            const isOverridden = formData.probability !== null && formData.probability !== undefined && formData.probability !== defaultProb;
                            if (!canViewField('probability')) return null;
                            return (
                                <div className="form-group">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        Probability (%)
                                        {isOverridden && (
                                            <span style={{ fontSize: '0.625rem', fontWeight: '700', color: '#f59e0b', background: '#fffbeb', border: '1px solid #fde68a', padding: '0.1rem 0.4rem', borderRadius: '999px', letterSpacing: '0.03em' }}>
                                                ✎ OVERRIDDEN
                                            </span>
                                        )}
                                        {!isOverridden && defaultProb !== null && (
                                            <span style={{ fontSize: '0.625rem', color: '#94a3b8', fontWeight: '500' }}>stage default</span>
                                        )}
                                    </label>
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                        <input
                                            type="number"
                                            min="0" max="100"
                                            value={effectiveProb !== null ? effectiveProb : ''}
                                            placeholder={defaultProb !== null ? String(defaultProb) : '0'}
                                            onChange={e => {
                                                const val = e.target.value === '' ? null : Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                                                handleChange('probability', val);
                                            }}
                                            style={{ flex: 1 }}
                                        />
                                        {isOverridden && (
                                            <button
                                                type="button"
                                                onClick={() => handleChange('probability', defaultProb)}
                                                title="Reset to stage default"
                                                style={{ padding: '0.5rem 0.75rem', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600', color: '#64748b', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                                            >↺ Reset</button>
                                        )}
                                    </div>
                                    {isOverridden && defaultProb !== null && (
                                        <div style={{ fontSize: '0.6875rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                                            Stage default: {defaultProb}% — your override: {formData.probability}%
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                        <div className="form-group">
                            <label>Product Interest*</label>
                            <select
                                value={formData.products}
                                onChange={e => handleChange('products', e.target.value)}
                                required
                            >
                                {productOptions.map(product => (
                                    <option key={product} value={product}>{product}</option>
                                ))}
                            </select>
                        </div>
{canViewField('arr') && (
                        <div className="form-group">
                            <label>ARR ($)*</label>
                            <input
                                type="number"
                                value={formData.arr}
                                onChange={e => handleChange('arr', e.target.value)}
                                style={validationErrors.arr ? { borderColor: '#dc2626', background: '#fff8f8' } : {}}
                            />
                            {validationErrors.arr && <div className="field-error" style={{ color: '#dc2626', fontSize: '0.6875rem', fontWeight: '600', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>⚠ {validationErrors.arr}</div>}
                        </div>
)}
{canViewField('implCost') && (
                        <div className="form-group">
                            <label>Implementation Cost ($)*</label>
                            <input
                                type="number"
                                value={formData.implementationCost}
                                onChange={e => handleChange('implementationCost', e.target.value)}
                            />
                        </div>
)}
                        <div className="form-group">
                            <label>Forecasted Close Date*</label>
                            <input
                                type="date"
                                value={formData.forecastedCloseDate}
                                onChange={e => handleChange('forecastedCloseDate', e.target.value)}
                                style={validationErrors.forecastedCloseDate ? { borderColor: '#dc2626', background: '#fff8f8' } : {}}
                            />
                            {validationErrors.forecastedCloseDate && <div className="field-error" style={{ color: '#dc2626', fontSize: '0.6875rem', fontWeight: '600', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>⚠ {validationErrors.forecastedCloseDate}</div>}
                        </div>
                        <div className="form-group">
                            <label>Close Quarter (Auto-calculated)</label>
                            <input
                                type="text"
                                value={closeQuarter}
                                readOnly
                                style={{ 
                                    background: '#f1f3f5', 
                                    color: '#64748b',
                                    cursor: 'not-allowed'
                                }}
                            />
                        </div>
                        <div className="form-group">
                            <label>Unionized*</label>
                            <select
                                value={formData.unionized}
                                onChange={e => handleChange('unionized', e.target.value)}
                                required
                            >
                                <option value="Yes">Yes</option>
                                <option value="No">No</option>
                                <option value="Mix">Mix</option>
                            </select>
                        </div>
                        <div className="form-group full" style={{ position: 'relative' }}>
                            <label>Key Contacts</label>
                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                                {selectedContacts.map((contact, idx) => {
                                    const contactId = selectedContactIds[idx];
                                    const contactRecord = contactId ? contacts.find(c => c.id === contactId) : null;
                                    return (
                                    <span key={idx} style={{
                                        background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe',
                                        padding: '0.3rem 0.5rem', borderRadius: '6px', fontSize: '0.8125rem',
                                        display: 'flex', alignItems: 'center', gap: '0.5rem'
                                    }}>
                                        <span>
                                            <div style={{ fontWeight: '600', lineHeight: 1.2 }}>{contact.split(' (')[0]}</div>
                                            {contactRecord?.title && <div style={{ fontSize: '0.6875rem', color: '#3b82f6', fontWeight: '500' }}>{contactRecord.title}</div>}
                                        </span>
                                        <button type="button"
                                            onClick={() => {
                                                const newContacts = selectedContacts.filter((_, i) => i !== idx);
                                                const newIds = selectedContactIds.filter((_, i) => i !== idx);
                                                setSelectedContacts(newContacts);
                                                setSelectedContactIds(newIds);
                                                handleChange('contacts', newContacts.join(', '));
                                            }}
                                            style={{ background: 'none', border: 'none', color: '#93c5fd', cursor: 'pointer', fontSize: '1rem', padding: 0, lineHeight: 1 }}
                                            onMouseEnter={e => e.target.style.color = '#1e40af'}
                                            onMouseLeave={e => e.target.style.color = '#93c5fd'}
                                        >×</button>
                                    </span>
                                    );
                                })}
                            </div>
                            <input
                                type="text"
                                value={contactSearch}
                                onChange={e => {
                                    setContactSearch(e.target.value);
                                    setShowContactSuggestions(e.target.value.length > 0);
                                }}
                                onFocus={() => setShowContactSuggestions(contactSearch.length > 0)}
                                onBlur={() => setTimeout(() => setShowContactSuggestions(false), 200)}
                                placeholder="Start typing contact name..."
                                autoComplete="off"
                            />
                            {showContactSuggestions && (
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    right: 0,
                                    background: '#ffffff',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '6px',
                                    marginTop: '0.25rem',
                                    maxHeight: '200px',
                                    overflowY: 'auto',
                                    zIndex: 1000,
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                                }}>
                                    {contacts
                                        .filter(contact => {
                                            const fullName = `${contact.firstName} ${contact.lastName}`;
                                            const searchLower = contactSearch.toLowerCase();
                                            return fullName.toLowerCase().startsWith(searchLower) ||
                                                   contact.firstName?.toLowerCase().startsWith(searchLower) ||
                                                   contact.lastName?.toLowerCase().startsWith(searchLower);
                                        })
                                        .map(contact => {
                                            const contactDisplay = `${contact.firstName} ${contact.lastName}${contact.title ? ` (${contact.title})` : ''}`;
                                            return (
                                                <div
                                                    key={contact.id}
                                                    onMouseDown={e => e.preventDefault()}
                                                    onClick={() => {
                                                        if (!selectedContactIds.includes(contact.id)) {
                                                            const newContacts = [...selectedContacts, contactDisplay];
                                                            const newIds = [...selectedContactIds, contact.id];
                                                            setSelectedContacts(newContacts);
                                                            setSelectedContactIds(newIds);
                                                            handleChange('contacts', newContacts.join(', '));
                                                        }
                                                        setContactSearch('');
                                                        setShowContactSuggestions(false);
                                                    }}
                                                    style={{
                                                        padding: '0.625rem 0.75rem',
                                                        cursor: 'pointer',
                                                        borderBottom: '1px solid #f1f3f5',
                                                        fontWeight: '600',
                                                        fontSize: '0.875rem'
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <div>{contact.firstName} {contact.lastName}</div>
                                                    {contact.title && (
                                                        <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '400' }}>{contact.title}</div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    <div
                                        onMouseDown={e => e.preventDefault()}
                                        onClick={() => {
                                            setShowContactSuggestions(false);
                                            setNestedModal({ type: 'contact', firstName: contactSearch.split(/\s+/)[0] || '', lastName: contactSearch.split(/\s+/).slice(1).join(' ') || '' });
                                            setContactSearch('');
                                        }}
                                        style={{
                                            padding: '0.625rem 0.75rem',
                                            cursor: 'pointer',
                                            color: '#2563eb',
                                            fontWeight: '600',
                                            fontSize: '0.875rem'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        + New Contact
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="form-group full" style={{ position: 'relative' }}>
                            <label>Pain Points</label>
                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                                {(() => {
                                    const selectedPainPoints = formData.painPoints ? formData.painPoints.split(', ').filter(p => p) : [];
                                    return selectedPainPoints.map((painPoint, idx) => (
                                        <span key={idx} style={{
                                            background: '#f59e0b',
                                            color: 'white',
                                            padding: '0.25rem 0.5rem',
                                            borderRadius: '4px',
                                            fontSize: '0.8125rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem'
                                        }}>
                                            {painPoint}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const newPainPoints = selectedPainPoints.filter((_, i) => i !== idx);
                                                    handleChange('painPoints', newPainPoints.join(', '));
                                                }}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    color: 'white',
                                                    cursor: 'pointer',
                                                    fontSize: '1rem',
                                                    padding: 0,
                                                    lineHeight: 1
                                                }}
                                            >
                                                ×
                                            </button>
                                        </span>
                                    ));
                                })()}
                            </div>
                            <select
                                value=""
                                onChange={e => {
                                    const value = e.target.value;
                                    if (value) {
                                        const currentPainPoints = formData.painPoints ? formData.painPoints.split(', ').filter(p => p) : [];
                                        if (!currentPainPoints.includes(value)) {
                                            const newPainPoints = [...currentPainPoints, value];
                                            handleChange('painPoints', newPainPoints.join(', '));
                                        }
                                    }
                                }}
                                style={{ width: '100%' }}
                            >
                                <option value="">Click to add a pain point...</option>
                                {(settings?.painPoints || ['High Turnover', 'Scheduling Complexity', 'Compliance Issues', 'Manual Processes', 'Poor Visibility']).map(painPoint => {
                                    const selectedPainPoints = formData.painPoints ? formData.painPoints.split(', ').filter(p => p) : [];
                                    const isSelected = selectedPainPoints.includes(painPoint);
                                    return (
                                        <option key={painPoint} value={painPoint} disabled={isSelected}>
                                            {painPoint} {isSelected ? '(already added)' : ''}
                                        </option>
                                    );
                                })}
                            </select>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                                Select pain points from the dropdown. Click × to remove.
                            </div>
                        </div>
{canViewField('notes') && (
                        <div className="form-group full">
                            <label>Description / Background</label>
                            <textarea
                                value={formData.notes}
                                onChange={e => handleChange('notes', e.target.value)}
                                placeholder="Deal context, background, key details..."
                                rows="3"
                            />
                        </div>
)}
{canViewField('nextSteps') && (
                        <div className="form-group full">
                            <label>Next Steps</label>
                            <textarea
                                value={formData.nextSteps}
                                onChange={e => handleChange('nextSteps', e.target.value)}
                                placeholder="Actions to move forward..."
                            />
                        </div>
)}
                    </div>

                    {/* ── Comments Thread ─────────────────────────── */}
                    <div style={{ borderTop: '2px solid #e2e8f0', marginTop: '1.25rem', paddingTop: '1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
                            <span style={{ fontSize: '0.875rem', fontWeight: '700', color: '#1e293b' }}>💬 Team Notes</span>
                            {comments.length > 0 && (
                                <span style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '0.1rem 0.45rem', borderRadius: '999px', fontSize: '0.625rem', fontWeight: '700' }}>
                                    {comments.length}
                                </span>
                            )}
                            <span style={{ fontSize: '0.6875rem', color: '#94a3b8', marginLeft: '0.25rem' }}>Visible to all team members · timestamped</span>
                        </div>

                        {/* Compose box */}
                        <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
                            <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6875rem', fontWeight: '800', flexShrink: 0, marginTop: '0.125rem' }}>
                                {(currentUser || 'A').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                            </div>
                            <div style={{ flex: 1, position: 'relative' }}>
                                <textarea
                                    ref={commentTextareaRef}
                                    value={commentDraft}
                                    onChange={handleCommentDraftChange}
                                    onKeyDown={e => {
                                        if (mentionQuery !== null && filteredMentions.length > 0) {
                                            if (e.key === 'Escape') { e.preventDefault(); setMentionQuery(null); return; }
                                            if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); insertMention(filteredMentions[0]); return; }
                                        }
                                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && commentDraft.trim()) {
                                            e.preventDefault();
                                            if (!opportunity) return;
                                            const text = commentDraft.trim();
                                            const comment = {
                                                id: 'c_' + Date.now(),
                                                text,
                                                author: currentUser || 'Anonymous',
                                                timestamp: new Date().toISOString(),
                                                mentions: extractMentions(text)
                                            };
                                            onSaveComment && onSaveComment(opportunity.id, comment);
                                            setCommentDraft('');
                                            setMentionQuery(null);
                                        }
                                    }}
                                    placeholder={opportunity ? `Add a note... Type @ to mention someone (⌘/Ctrl+Enter to post)` : 'Save the opportunity first to add team notes'}
                                    disabled={!opportunity}
                                    rows={2}
                                    style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.8125rem', fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: '1.5', transition: 'border-color 0.15s', background: opportunity ? '#fff' : '#f8fafc', color: opportunity ? '#1e293b' : '#94a3b8' }}
                                    onFocus={e => e.target.style.borderColor = '#2563eb'}
                                    onBlur={e => { e.target.style.borderColor = '#e2e8f0'; setTimeout(() => setMentionQuery(null), 150); }}
                                />
                                {/* @mention dropdown */}
                                {mentionQuery !== null && filteredMentions.length > 0 && (
                                    <div style={{ position: 'absolute', bottom: 'calc(100% - 0.5rem)', left: 0, zIndex: 300, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: '180px', overflow: 'hidden' }}>
                                        <div style={{ padding: '0.375rem 0.625rem', fontSize: '0.625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9' }}>Mention a teammate</div>
                                        {filteredMentions.map(name => {
                                            const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
                                            const avatarColors = ['#2563eb','#10b981','#f59e0b','#8b5cf6','#ec4899','#0891b2','#ef4444'];
                                            const color = avatarColors[name.charCodeAt(0) % avatarColors.length];
                                            return (
                                                <div key={name} onMouseDown={e => { e.preventDefault(); insertMention(name); }}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.625rem', cursor: 'pointer', transition: 'background 0.1s' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#f0f7ff'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.5625rem', fontWeight: '800', flexShrink: 0 }}>{initials}</div>
                                                    <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b' }}>{name}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                                {commentDraft.trim() && opportunity && (
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.375rem', gap: '0.375rem' }}>
                                        <button type="button" onClick={() => { setCommentDraft(''); setMentionQuery(null); }}
                                            style={{ padding: '0.3rem 0.75rem', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                                            Discard
                                        </button>
                                        <button type="button" onClick={() => {
                                                if (!commentDraft.trim() || !opportunity) return;
                                                const text = commentDraft.trim();
                                                const comment = {
                                                    id: 'c_' + Date.now(),
                                                    text,
                                                    author: currentUser || 'Anonymous',
                                                    timestamp: new Date().toISOString(),
                                                    mentions: extractMentions(text)
                                                };
                                                onSaveComment && onSaveComment(opportunity.id, comment);
                                                setCommentDraft('');
                                                setMentionQuery(null);
                                            }}
                                            style={{ padding: '0.3rem 0.875rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                                            Post Note
                                        </button>
                                    </div>
                                )}
                                {!opportunity && (
                                    <div style={{ fontSize: '0.6875rem', color: '#94a3b8', marginTop: '0.25rem' }}>Create this opportunity first, then you can add team notes.</div>
                                )}
                            </div>
                        </div>

                        {/* Comments list */}
                        {comments.length === 0 && opportunity && (
                            <div style={{ textAlign: 'center', padding: '1.25rem', color: '#94a3b8', fontSize: '0.8125rem', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #e2e8f0' }}>
                                No team notes yet. Be the first to leave a note.
                            </div>
                        )}
                        {comments.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto' }}>
                                {comments.map(c => {
                                    const isOwn = c.author === currentUser;
                                    const initials = (c.author || 'A').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
                                    const avatarColors = ['#2563eb','#10b981','#f59e0b','#8b5cf6','#ec4899','#0891b2','#ef4444'];
                                    const avatarColor = avatarColors[c.author.charCodeAt(0) % avatarColors.length];
                                    const ts = new Date(c.timestamp);
                                    const now = new Date();
                                    const diffMs = now - ts;
                                    const diffMins = Math.floor(diffMs / 60000);
                                    const diffHours = Math.floor(diffMs / 3600000);
                                    const diffDays = Math.floor(diffMs / 86400000);
                                    const timeAgo = diffMins < 1 ? 'just now'
                                        : diffMins < 60 ? `${diffMins}m ago`
                                        : diffHours < 24 ? `${diffHours}h ago`
                                        : diffDays < 7 ? `${diffDays}d ago`
                                        : ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: ts.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
                                    const fullDate = ts.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
                                    const isEditing = editingCommentId === c.id;

                                    return (
                                        <div key={c.id} style={{ display: 'flex', gap: '0.625rem', padding: '0.625rem 0.75rem', background: isOwn ? '#f0f7ff' : '#fff', border: '1px solid ' + (isOwn ? '#bfdbfe' : '#f1f5f9'), borderRadius: '10px', alignItems: 'flex-start' }}>
                                            <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: avatarColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6875rem', fontWeight: '800', flexShrink: 0 }}>
                                                {initials}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                                                    <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: '#1e293b' }}>{c.author}</span>
                                                    <span title={fullDate} style={{ fontSize: '0.6875rem', color: '#94a3b8', cursor: 'default' }}>{timeAgo}</span>
                                                    {c.edited && <span style={{ fontSize: '0.625rem', color: '#94a3b8', fontStyle: 'italic' }}>(edited)</span>}
                                                </div>
                                                {isEditing ? (
                                                    <div>
                                                        <textarea
                                                            autoFocus
                                                            value={editingCommentText}
                                                            onChange={e => setEditingCommentText(e.target.value)}
                                                            rows={2}
                                                            style={{ width: '100%', padding: '0.375rem 0.625rem', border: '1.5px solid #2563eb', borderRadius: '6px', fontSize: '0.8125rem', fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: '1.5' }}
                                                        />
                                                        <div style={{ display: 'flex', gap: '0.375rem', marginTop: '0.375rem', justifyContent: 'flex-end' }}>
                                                            <button type="button" onClick={() => setEditingCommentId(null)}
                                                                style={{ padding: '0.25rem 0.625rem', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '5px', fontSize: '0.6875rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                                                            <button type="button" onClick={() => {
                                                                    if (editingCommentText.trim()) {
                                                                        onEditComment && onEditComment(opportunity.id, c.id, editingCommentText.trim());
                                                                    }
                                                                    setEditingCommentId(null);
                                                                }}
                                                                style={{ padding: '0.25rem 0.625rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '0.6875rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>Save</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div style={{ fontSize: '0.8125rem', color: '#334155', lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{renderCommentText(c.text)}</div>
                                                )}
                                            </div>
                                            {isOwn && !isEditing && (
                                                <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                                                    <button type="button" onClick={() => { setEditingCommentId(c.id); setEditingCommentText(c.text); }}
                                                        title="Edit"
                                                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.75rem', padding: '0.125rem 0.25rem', lineHeight: 1, borderRadius: '3px' }}
                                                        onMouseEnter={e => e.currentTarget.style.color = '#2563eb'}
                                                        onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}>✏️</button>
                                                    <button type="button" onClick={() => onDeleteComment && onDeleteComment(opportunity.id, c.id)}
                                                        title="Delete"
                                                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.75rem', padding: '0.125rem 0.25rem', lineHeight: 1, borderRadius: '3px' }}
                                                        onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                                                        onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}>✕</button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* ── Activity Log ─────────────────────────── */}
                    {opportunity && (
                        <div style={{ borderTop: '2px solid #e2e8f0', marginTop: '1.25rem', paddingTop: '1.25rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.875rem', fontWeight: '700', color: '#1e293b' }}>Activity Log</span>
                                    {oppActivities.length > 0 && (
                                        <span style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '0.1rem 0.45rem', borderRadius: '999px', fontSize: '0.625rem', fontWeight: '700' }}>
                                            {oppActivities.length}
                                        </span>
                                    )}
                                </div>
                                <button type="button" onClick={() => setShowLogActivity(v => !v)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.375rem 0.75rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                                    + Log Activity
                                </button>
                            </div>

                            {/* Inline quick-log form */}
                            {showLogActivity && (
                                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem', marginBottom: '0.875rem' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                        <div>
                                            <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.375rem' }}>Type</div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                                {activityTypes.map(t => (
                                                    <button key={t} type="button" onClick={() => setNewActivity(a => ({ ...a, type: t }))}
                                                        style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', fontFamily: 'inherit', fontSize: '0.6875rem', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s',
                                                            border: '1px solid ' + (newActivity.type === t ? '#2563eb' : '#e2e8f0'),
                                                            background: newActivity.type === t ? '#eff6ff' : '#fff',
                                                            color: newActivity.type === t ? '#2563eb' : '#64748b' }}>
                                                        {activityTypeIcon[t] || '📝'} {t}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.375rem' }}>Date</div>
                                            <input type="date" value={newActivity.date}
                                                onChange={e => setNewActivity(a => ({ ...a, date: e.target.value }))}
                                                style={{ width: '100%', padding: '0.5rem 0.625rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.8125rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '0.75rem' }}>
                                        <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.375rem' }}>Notes</div>
                                        <textarea value={newActivity.notes}
                                            onChange={e => setNewActivity(a => ({ ...a, notes: e.target.value }))}
                                            placeholder="What happened? Key takeaways, next actions..."
                                            rows={3}
                                            style={{ width: '100%', padding: '0.5rem 0.625rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.8125rem', fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: '1.5' }} />
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                        <button type="button" onClick={() => setShowLogActivity(false)}
                                            style={{ padding: '0.4rem 0.875rem', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                                            Cancel
                                        </button>
                                        <button type="button" onClick={() => {
                                                if (!newActivity.type) return;
                                                onSaveActivity && onSaveActivity({
                                                    ...newActivity,
                                                    opportunityId: opportunity.id,
                                                    companyName: opportunity.account || ''
                                                });
                                                setNewActivity({ type: 'Call', date: new Date().toISOString().split('T')[0], notes: '' });
                                                setShowLogActivity(false);
                                            }}
                                            style={{ padding: '0.4rem 0.875rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                                            Save Activity
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Activity history */}
                            {oppActivities.length === 0 && !showLogActivity && (
                                <div style={{ textAlign: 'center', padding: '1.25rem', color: '#94a3b8', fontSize: '0.8125rem', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #e2e8f0' }}>
                                    No activities logged yet. Click <strong>+ Log Activity</strong> to record a call, email, or meeting.
                                </div>
                            )}
                            {oppActivities.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '260px', overflowY: 'auto' }}>
                                    {oppActivities.map((act, i) => (
                                        <div key={act.id} style={{ display: 'flex', gap: '0.75rem', padding: '0.625rem 0.75rem', background: i % 2 === 0 ? '#fff' : '#f8fafc', border: '1px solid #f1f5f9', borderRadius: '8px', alignItems: 'flex-start' }}>
                                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>
                                                {activityTypeIcon[act.type] || '📝'}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                                                    <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: '#1e293b' }}>{act.type}</span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <span style={{ fontSize: '0.6875rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                                                            {new Date(act.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                        </span>
                                                        {onDeleteActivity && (
                                                            <button type="button" onClick={() => onDeleteActivity(act.id)}
                                                                title="Remove activity"
                                                                style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: '0.8125rem', padding: '0', lineHeight: 1 }}
                                                                onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                                                                onMouseLeave={e => e.currentTarget.style.color = '#cbd5e1'}>✕</button>
                                                        )}
                                                    </div>
                                                </div>
                                                {act.notes && (
                                                    <div style={{ fontSize: '0.8125rem', color: '#475569', lineHeight: '1.4', wordBreak: 'break-word' }}>{act.notes}</div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {Object.keys(validationErrors).length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 0.875rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', marginTop: '1rem', color: '#dc2626', fontSize: '0.8125rem', fontWeight: '600' }}>
                            ⚠ Please fill in all required fields before saving.
                        </div>
                    )}
                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn">
                            {opportunity ? 'Update' : 'Create'}
                        </button>
                    </div>
                </form>
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
                                        const display = `${saved.firstName} ${saved.lastName}${saved.title ? ` (${saved.title})` : ''}`;
                                        const newContacts = [...selectedContacts, display];
                                        const newIds = [...selectedContactIds, saved.id];
                                        setSelectedContacts(newContacts);
                                        setSelectedContactIds(newIds);
                                        handleChange('contacts', newContacts.join(', '));
                                    }
                                }
                                setNestedModal(null);
                            }}
                            onCancel={() => setNestedModal(null)} />
                    </div>
                </div>
            )}
        </div>
    );
}


