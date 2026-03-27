import React, { useState, useEffect } from 'react';
import { useApp } from '../AppContext';
import { dbFetch } from '../utils/storage';
import PipelinesSettingsPanel from '../components/modals/PipelinesSettingsPanel';
import TeamBuilder from './TeamBuilder';
import TerritoriesSettings from './TerritoriesSettings';
import VerticalsSettings from './VerticalsSettings';

// ── BYOK API Key Section ─────────────────────────────────────────────────────
// Must be a proper component so React hooks are valid
function ByokKeySection({ settings, setSettings }) {
    const [byokKey, setByokKey] = React.useState(settings.anthropicApiKey || '');
    const [byokVisible, setByokVisible] = React.useState(false);
    const [byokSaving, setByokSaving] = React.useState(false);
    const [byokError, setByokError] = React.useState(null);
    const [byokSaved, setByokSaved] = React.useState(false);
    const hasKey = !!(settings.anthropicApiKey);

    const saveByokKey = async () => {
        setByokSaving(true);
        setByokError(null);
        setByokSaved(false);
        try {
            const res = await dbFetch('/.netlify/functions/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ anthropicApiKey: byokKey.trim() || null }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setByokError(d.error || 'Failed to save key.');
            } else {
                setSettings(prev => ({ ...prev, anthropicApiKey: byokKey.trim() || null }));
                setByokSaved(true);
                setTimeout(() => setByokSaved(false), 3000);
            }
        } catch (err) {
            setByokError('Network error — please try again.');
        } finally {
            setByokSaving(false);
        }
    };

    const removeKey = async () => {
        setByokKey('');
        setByokSaving(true);
        setByokError(null);
        try {
            const res = await dbFetch('/.netlify/functions/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ anthropicApiKey: null }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setByokError(d.error || 'Failed to remove key.');
            } else {
                setSettings(prev => ({ ...prev, anthropicApiKey: null }));
            }
        } catch (err) {
            setByokError('Network error — please try again.');
        } finally {
            setByokSaving(false);
        }
    };

    return (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: '700', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        🔑 Bring Your Own API Key
                        {hasKey && (
                            <span style={{ fontSize: '0.625rem', fontWeight: '700', background: '#d1fae5', color: '#065f46', padding: '1px 8px', borderRadius: '999px' }}>USING YOUR KEY</span>
                        )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '3px' }}>
                        {hasKey
                            ? 'AI scoring is using your Anthropic API key. Usage costs go directly to your account.'
                            : 'Add your own Anthropic API key for direct cost visibility and to keep deal data out of shared billing.'
                        }
                    </div>
                </div>
            </div>
            {/* Key input */}
            <div style={{ padding: '1rem 1.25rem' }}>
                <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Anthropic API Key</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <input
                            type={byokVisible ? 'text' : 'password'}
                            value={byokKey}
                            onChange={e => setByokKey(e.target.value)}
                            placeholder="sk-ant-api03-..."
                            style={{
                                width: '100%', padding: '0.5rem 2.5rem 0.5rem 0.75rem',
                                border: '1px solid #d1d5db', borderRadius: '6px',
                                fontSize: '0.8125rem', fontFamily: 'monospace',
                                outline: 'none', boxSizing: 'border-box',
                                background: '#f8fafc',
                            }}
                        />
                        <button
                            onClick={() => setByokVisible(v => !v)}
                            style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.875rem', color: '#94a3b8', padding: '2px' }}
                            title={byokVisible ? 'Hide key' : 'Show key'}
                        >
                            {byokVisible ? '🙈' : '👁️'}
                        </button>
                    </div>
                    <button
                        onClick={saveByokKey}
                        disabled={byokSaving || byokKey.trim() === (settings.anthropicApiKey || '')}
                        style={{
                            padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', cursor: 'pointer',
                            background: byokSaved ? '#10b981' : '#2563eb', color: '#fff',
                            fontSize: '0.8125rem', fontWeight: '700', fontFamily: 'inherit',
                            opacity: (byokSaving || byokKey.trim() === (settings.anthropicApiKey || '')) ? 0.5 : 1,
                            minWidth: '64px', transition: 'background 0.2s',
                        }}
                    >
                        {byokSaving ? '…' : byokSaved ? '✓ Saved' : 'Save'}
                    </button>
                    {hasKey && (
                        <button
                            onClick={removeKey}
                            disabled={byokSaving}
                            style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #fecaca', cursor: 'pointer', background: 'transparent', color: '#dc2626', fontSize: '0.8125rem', fontWeight: '600', fontFamily: 'inherit' }}
                        >
                            Remove
                        </button>
                    )}
                </div>
                {byokError && (
                    <div style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '6px' }}>{byokError}</div>
                )}
                <div style={{ fontSize: '0.6875rem', color: '#94a3b8', marginTop: '8px', lineHeight: 1.5 }}>
                    Your key is encrypted with AES-256 before being stored. It is never logged or exposed in responses.
                    Get your key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>console.anthropic.com</a>.
                </div>
            </div>
        </div>
    );
}

export default function SettingsTab() {
    const {
        settings, setSettings,
        opportunities,
        accounts,
        contacts,
        tasks,
        activities,
        leads,
        users,
        currentUser,
        userRole,
        exportToCSV,
        exportingCSV, setExportingCSV,
        showConfirm,
        softDelete,
        addAudit,
        handleUpdateFiscalYearStart,
        handleSaveUser,
        setUndoToast,
        allPipelines,
        activePipeline,
        setActiveTab,
        activePipelineId, setActivePipelineId,
        setShowUserModal, setEditingUser,
        setCsvImportType, setShowCsvImportModal,
        isMobile,
    } = useApp();

    const isAdmin = userRole === 'Admin';
    const isManager = userRole === 'Manager';
    if (!isAdmin) return null;

    // Local state
    const [settingsView, setSettingsView] = useState('menu');
    const [savedToast, setSavedToast] = useState(false);
    const [settingsSnapshot, setSettingsSnapshot] = useState(null);
    const [auditEntries, setAuditEntries] = useState([]);
    const [auditLoading, setAuditLoading] = useState(false);
    const [newPainPointInput, setNewPainPointInput] = useState('');
    const [newProductInput, setNewProductInput] = useState('');
    const [newVerticalMarketInput, setNewVerticalMarketInput] = useState('');
    const [exportingBackup, setExportingBackup] = useState(false);
    const [restoringBackup, setRestoringBackup] = useState(false);
    const [expandedIndustry, setExpandedIndustry] = useState(null);
    const [auditSearch, setAuditSearch] = useState('');
    const [auditEntityFilter, setAuditEntityFilter] = useState('all');
    const [auditActionFilter, setAuditActionFilter] = useState('all');
    const [newSubIndustryInput, setNewSubIndustryInput] = useState('');

    // Fetch audit log when view changes to audit-log
    useEffect(() => {
        if (settingsView !== 'audit-log') return;
        setAuditLoading(true);
        dbFetch('/.netlify/functions/audit-log')
            .then(r => r.json())
            .then(data => {
                const normalized = (data.entries || []).map(e => ({
                    id:     e.id,
                    ts:     e.timestamp,
                    user:   e.userName || 'Unknown',
                    action: e.action,
                    entity: e.entityType,
                    label:  e.entityName || '',
                    detail: e.detail || '',
                }));
                setAuditEntries(normalized);
            })
            .catch(err => console.error('Failed to load audit log:', err))
            .finally(() => setAuditLoading(false));
    }, [settingsView]);

    // UI handlers
    const handleAddUser = () => { setEditingUser(null); setShowUserModal(true); };
    const handleEditUser = (user) => { setEditingUser(user); setShowUserModal(true); };
    const handleDeleteUser = (userId) => {
        showConfirm('Are you sure you want to delete this user?', async () => {
            await dbFetch('/.netlify/functions/users?id=' + userId, { method: 'DELETE' }).catch(console.error);
        });
    };


    const goToView = (view) => {
        setSettingsSnapshot(JSON.parse(JSON.stringify(settings)));
        setSettingsView(view);
        setSavedToast(false);
    };

    const goBackToMenu = () => {
        setSettingsSnapshot(null);
        setSettingsView('menu');
    };

    const handleSaveView = () => {
        setSettingsSnapshot(null);
        setSavedToast(true);
        setTimeout(() => setSavedToast(false), 2500);
        setSettingsView('menu');
    };

    const handleCancelView = () => {
        if (settingsSnapshot) setSettings(settingsSnapshot);
        setSettingsSnapshot(null);
        setSavedToast(false);
        setSettingsView('menu');
    };

    const SaveCancelBar = () => (
        <div style={{ display:'flex', gap:'0.75rem', padding:'1rem 1.5rem', borderTop:'1px solid #e2e8f0', background:'#f8fafc', marginTop:'1rem' }}>
            <button onClick={handleSaveView}
                style={{ padding:'0.5rem 1.5rem', background:'#2563eb', color:'#fff', border:'none', borderRadius:'7px', fontSize:'0.875rem', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>
                Save changes
            </button>
            <button onClick={handleCancelView}
                style={{ padding:'0.5rem 1.25rem', background:'transparent', color:'#64748b', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'0.875rem', fontWeight:'600', cursor:'pointer', fontFamily:'inherit' }}>
                Cancel
            </button>
        </div>
    );

    return (

                <div className="tab-page">
                    <div className="tab-page-header">
                        <div className="tab-page-header-bar"></div>
                        <div>
                            <h2>Settings</h2>
                            <p>Manage users, configuration, and system preferences</p>
                        </div>
                    </div>
                <>
                    {savedToast && (
                        <div style={{ position:'fixed', bottom:'2rem', left:'50%', transform:'translateX(-50%)', background:'#1e293b', color:'#fff', padding:'0.625rem 1.5rem', borderRadius:'8px', fontSize:'0.875rem', fontWeight:'600', zIndex:9999, display:'flex', alignItems:'center', gap:'8px', boxShadow:'0 4px 16px rgba(0,0,0,0.18)' }}>
                            <span style={{ color:'#4ade80' }}>✓</span> Settings saved
                        </div>
                    )}
                    {settingsView === 'menu' && (
                        <div className="table-container">
                            <div className="table-header">
                                <h2>SETTINGS</h2>
                            </div>
                            <div style={{ padding: '1.5rem' }}>
                                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', maxWidth: isMobile ? '100%' : '560px' }}>
                                    {[
                                        { group: 'Team' },
                                        { view: 'users',          icon: '👥', title: 'Manage Users',       desc: 'Roles & permissions' },
                                        { view: 'team-builder',   icon: '🏗️', title: 'Team Builder',       desc: 'Teams & managers' },
                                        { view: 'territories',    icon: '📍', title: 'Territories',         desc: 'Sales territory definitions' },
                                        { group: 'Configuration' },
                                        { view: 'vertical-markets', icon: '🏢', title: 'Industries',        desc: 'Primary & sub-industry types' },
                                        { view: 'verticals',      icon: '🏭', title: 'Verticals',           desc: 'Sales vertical assignments' },
                                        { view: 'funnel-stages',  icon: '🔻', title: 'Funnel Stages',       desc: 'Stages & win probability' },
                                        { view: 'pipelines',      icon: '🔀', title: 'Pipelines',           desc: 'Multiple pipeline management' },
                                        { view: 'kpi-settings',   icon: '📊', title: 'KPI Settings',        desc: 'Thresholds, colors & sparklines' },
                                        { view: 'fiscal-year',    icon: '📅', title: 'Fiscal Year',         desc: 'Quarter & fiscal year start' },
                                        { view: 'logo',           icon: '🖼️', title: 'Company Logo',        desc: 'Upload company logo' },
                                        { view: 'pain-points',    icon: '⚠️', title: 'Pain Points Library', desc: 'Customer pain point templates' },
                                        { view: 'products',       icon: '📦', title: 'Products',             desc: 'Products and services offered' },
                                        { group: 'Security & Data' },
                                        { view: 'features',       icon: '🧩', title: 'Features',             desc: 'Enable or disable app features' },
                                        { view: 'ai-features',    icon: '🤖', title: 'AI Features',          desc: 'Deal scoring & data privacy controls' },
                                        { view: 'field-visibility', icon: '🔒', title: 'Field Visibility',  desc: 'Role-based field access control' },
                                        { view: 'data-management', icon: '💾', title: 'Data Management',    desc: 'Backup & restore' },
                                        { view: 'audit-log',      icon: '📋', title: 'Audit Log',           desc: 'Change history across all records' },
                                    ].map((item, idx, arr) => {
                                        if (item.group) return (() => {
                                                const gc = { 'Team': { bg:'#eff6ff', border:'#bfdbfe', color:'#1d4ed8', dot:'#2563eb' }, 'Configuration': { bg:'#f5f3ff', border:'#ddd6fe', color:'#6d28d9', dot:'#7c3aed' }, 'Security & Data': { bg:'#fff7ed', border:'#fed7aa', color:'#c2410c', dot:'#ea580c' } }[item.group] || { bg:'#f8fafc', border:'#e2e8f0', color:'#64748b', dot:'#94a3b8' };
                                                return (
                                                    <div key={item.group} style={{ display:'flex', alignItems:'center', gap:'6px', padding: '6px 16px 5px', fontSize: '0.625rem', fontWeight: '700', letterSpacing: '0.07em', textTransform: 'uppercase', color: gc.color, background: gc.bg, borderBottom: '0.5px solid ' + gc.border, borderTop: idx > 0 ? '0.5px solid ' + gc.border : 'none' }}>
                                                        <div style={{ width:'6px', height:'6px', borderRadius:'50%', background: gc.dot, flexShrink:0 }} />
                                                        {item.group}
                                                    </div>
                                                );
                                            })();
                                        const isLast = idx === arr.length - 1 || arr[idx + 1]?.group;
                                        return (
                                            <div key={item.view}
                                                onClick={() => goToView(item.view)}
                                                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 16px 9px 24px', borderBottom: isLast ? 'none' : '0.5px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.1s' }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <div style={{ width: '24px', height: '24px', borderRadius: '5px', background: ['users','team-builder','territories'].includes(item.view) ? '#dbeafe' : ['vertical-markets','verticals','funnel-stages','pipelines','kpi-settings','fiscal-year','logo','pain-points'].includes(item.view) ? '#ede9fe' : '#ffedd5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', flexShrink: 0 }}>{item.icon}</div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b' }}>{item.title}</div>
                                                    {item.desc && <div style={{ fontSize: '0.6875rem', color: '#94a3b8', marginTop: '1px' }}>{item.desc}</div>}
                                                </div>
                                                <span style={{ fontSize: '0.875rem', color: '#cbd5e1', flexShrink: 0 }}>›</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}


                    {settingsView === 'products' && (
                        <div className="table-container">
                            <div className="table-header">
                                <button className="btn btn-secondary" onClick={goBackToMenu} style={{ marginRight: '1rem' }}>← Back</button>
                                <h2>PRODUCTS</h2>
                            </div>
                            <div style={{ padding: '1.5rem' }}>
                                <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.5rem', lineHeight: '1.6' }}>
                                    Define your product and service catalog. These products will appear as selectable options when creating or editing opportunities.
                                </p>
                                <div style={{ marginBottom: '2rem' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem' }}>Add New Product</h3>
                                    <div style={{ display: 'flex', gap: '0.5rem', maxWidth: isMobile ? '100%' : '500px' }}>
                                        <input
                                            type="text"
                                            value={newProductInput}
                                            onChange={e => setNewProductInput(e.target.value)}
                                            placeholder="Enter product name..."
                                            style={{ flex: 1, background: '#f8f9fa', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.625rem 0.75rem', color: '#1e293b', fontSize: '0.875rem' }}
                                            onKeyPress={e => {
                                                if (e.key === 'Enter') {
                                                    const value = newProductInput.trim();
                                                    if (value && !(settings.products || []).includes(value)) {
                                                        setSettings(prev => ({ ...prev, products: [...(prev.products || []), value] }));
                                                        setNewProductInput('');
                                                    }
                                                }
                                            }}
                                        />
                                        <button className="btn" onClick={() => {
                                            const value = newProductInput.trim();
                                            if (value && !(settings.products || []).includes(value)) {
                                                setSettings(prev => ({ ...prev, products: [...(prev.products || []), value] }));
                                                setNewProductInput('');
                                            }
                                        }}>+ ADD</button>
                                    </div>
                                </div>
                                <div>
                                    <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem' }}>
                                        Products ({(settings.products || []).length})
                                    </h3>
                                    {(settings.products || []).length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b', background: '#f1f3f5', borderRadius: '8px' }}>
                                            No products yet. Add your first product above.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                                            {(settings.products || []).map((product, idx) => (
                                                <span key={idx} style={{ background: '#ffffff', padding: '0.75rem 1rem', borderRadius: '6px', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.75rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                                    <span style={{ fontSize: '1rem' }}>📦</span>
                                                    <span style={{ fontWeight: '500', color: '#1e293b' }}>{product}</span>
                                                    <button onClick={() => setSettings(prev => ({ ...prev, products: (prev.products || []).filter((_, i) => i !== idx) }))}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '1rem', padding: 0, lineHeight: 1 }}>×</button>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        
                            <SaveCancelBar />
</div>
                    )}

                    {settingsView === 'field-visibility' && (() => {
                        const roles = ['Admin', 'Manager', 'User', 'ReadOnly'];
                        const roleLabels = { Admin: 'Admin', Manager: 'Manager', User: 'Sales Rep', ReadOnly: 'Read-Only' };
                        const fields = [
                            { key: 'arr',           label: 'ARR ($)',              desc: 'Revenue amount on the deal' },
                            { key: 'implCost',      label: 'Implementation Cost',  desc: 'Implementation / services cost' },
                            { key: 'probability',   label: 'Probability %',        desc: 'Close probability (stage default or rep override)' },
                            { key: 'weightedValue', label: 'Weighted Value',        desc: 'Calculated weighted pipeline value' },
                            { key: 'dealAge',       label: 'Deal Age',             desc: 'Days since opportunity was created' },
                            { key: 'timeInStage',   label: 'Time in Stage',        desc: 'Days in current stage' },
                            { key: 'activities',    label: 'Activities',           desc: 'Activity count and recency' },
                            { key: 'notes',         label: 'Notes / Description',  desc: 'Deal background and context notes' },
                            { key: 'nextSteps',     label: 'Next Steps',           desc: 'Next action items' },
                            { key: 'closeDate',     label: 'Close Date',           desc: 'Forecasted close date' },
                        ];
                        const fv = settings.fieldVisibility || {};
                        const toggle = (fieldKey, role) => {
                            const current = (fv[fieldKey] && fv[fieldKey][role] !== undefined) ? fv[fieldKey][role] : true;
                            const updated = {
                                ...fv,
                                [fieldKey]: { ...(fv[fieldKey] || { Admin: true, Manager: true, User: true, ReadOnly: true }), [role]: !current }
                            };
                            // Always keep Admin visible (Admin always sees everything)
                            if (fieldKey && updated[fieldKey]) updated[fieldKey].Admin = true;
                            setSettings(s => ({ ...s, fieldVisibility: updated }));
                        };
                        const isVisible = (fieldKey, role) => {
                            if (role === 'Admin') return true; // Admin always sees all
                            return !fv[fieldKey] || fv[fieldKey][role] !== false;
                        };
                        return (
                            <div className="table-container">
                                <div className="table-header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <button className="btn btn-secondary" onClick={goBackToMenu}>← Back</button>
                                        <h2>FIELD VISIBILITY</h2>
                                    </div>
                                    <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>Admins always see all fields</span>
                                </div>
                                <div style={{ padding: '1.5rem' }}>
                                    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: '0.8125rem', color: '#1e40af' }}>
                                        ℹ️ Toggle a field off for a role to hide it from the pipeline table and the opportunity form for users with that role.
                                    </div>
                                    <div style={{ overflowX: 'auto' }}>
                                        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', minWidth: '500px' }}>
                                            <thead>
                                                <tr style={{ background: '#f8fafc' }}>
                                                    <th style={{ textAlign: 'left', padding: '0.625rem 0.875rem', fontWeight: '700', color: '#64748b', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #e2e8f0', width: '220px' }}>Field</th>
                                                    {roles.map(role => (
                                                        <th key={role} style={{ textAlign: 'center', padding: '0.625rem 1rem', fontWeight: '700', color: '#64748b', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #e2e8f0' }}>
                                                            {roleLabels[role]}
                                                            {role === 'Admin' && <div style={{ fontSize: '0.5625rem', color: '#94a3b8', fontWeight: '400', marginTop: '0.125rem', textTransform: 'none' }}>always on</div>}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {fields.map((field, i) => (
                                                    <tr key={field.key} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                                                        <td style={{ padding: '0.75rem 0.875rem' }}>
                                                            <div style={{ fontWeight: '600', color: '#1e293b' }}>{field.label}</div>
                                                            <div style={{ fontSize: '0.6875rem', color: '#94a3b8', marginTop: '0.125rem' }}>{field.desc}</div>
                                                        </td>
                                                        {roles.map(role => {
                                                            const visible = isVisible(field.key, role);
                                                            const locked = role === 'Admin';
                                                            return (
                                                                <td key={role} style={{ textAlign: 'center', padding: '0.75rem 1rem' }}>
                                                                    <button
                                                                        type="button"
                                                                        disabled={locked}
                                                                        onClick={() => !locked && toggle(field.key, role)}
                                                                        title={locked ? 'Admins always see all fields' : (visible ? 'Click to hide from ' + roleLabels[role] : 'Click to show to ' + roleLabels[role])}
                                                                        style={{
                                                                            width: '42px', height: '24px', borderRadius: '12px', border: 'none', cursor: locked ? 'not-allowed' : 'pointer',
                                                                            background: visible ? '#2563eb' : '#e2e8f0',
                                                                            position: 'relative', transition: 'background 0.2s', outline: 'none',
                                                                            opacity: locked ? 0.5 : 1
                                                                        }}>
                                                                        <span style={{
                                                                            position: 'absolute', top: '3px', left: visible ? '21px' : '3px',
                                                                            width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
                                                                            transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                                                                        }} />
                                                                    </button>
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
            </div>
                                    </div>
                                </div>
                                <SaveCancelBar />
                        </div>
                        );
                    })()}

                    {settingsView === 'audit-log' && (() => {
                        const actionColor = { create: '#10b981', update: '#3b82f6', delete: '#ef4444' };
                        const actionLabel = { create: '+ Created', update: '✎ Updated', delete: '🗑 Deleted' };
                        const entityIcon = { opportunity: '🤝', account: '🏢', contact: '👤', task: '✅' };
                        const auditLog = auditEntries;
                        const filtered = auditLog.filter(e => {
                            if (auditEntityFilter !== 'all' && e.entity !== auditEntityFilter) return false;
                            if (auditActionFilter !== 'all' && e.action !== auditActionFilter) return false;
                            if (auditSearch) {
                                const q = auditSearch.toLowerCase();
                                return (e.label||'').toLowerCase().includes(q) || (e.detail||'').toLowerCase().includes(q) || (e.user||'').toLowerCase().includes(q);
                            }
                            return true;
                        });
                        return (
                            <div className="table-container">
                                <div className="table-header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <button className="btn btn-secondary" onClick={goBackToMenu}>← Back</button>
                                        <h2>AUDIT LOG</h2>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                        <input value={auditSearch} onChange={e => setAuditSearch(e.target.value)} placeholder="Search…"
                                            style={{ padding: '0.375rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.8125rem', width: '160px' }} />
                                        <select value={auditEntityFilter} onChange={e => setAuditEntityFilter(e.target.value)}
                                            style={{ padding: '0.375rem 0.625rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.8125rem', background: '#fff' }}>
                                            <option value="all">All types</option>
                                            <option value="opportunity">Opportunities</option>
                                            <option value="account">Accounts</option>
                                            <option value="contact">Contacts</option>
                                            <option value="task">Tasks</option>
                                        </select>
                                        <select value={auditActionFilter} onChange={e => setAuditActionFilter(e.target.value)}
                                            style={{ padding: '0.375rem 0.625rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.8125rem', background: '#fff' }}>
                                            <option value="all">All actions</option>
                                            <option value="create">Created</option>
                                            <option value="update">Updated</option>
                                            <option value="delete">Deleted</option>
                                        </select>
                                        {auditLog.length > 0 && (
                                            <button className="btn btn-secondary" disabled={exportingCSV === 'audit'} onClick={() => {
                                                const rows = [['Time','User','Action','Type','Record','Detail']];
                                                auditLog.forEach(e => rows.push([new Date(e.ts).toLocaleString(), e.user, e.action, e.entity, e.label, e.detail]));
                                                exportToCSV('audit-log-' + new Date().toISOString().slice(0,10) + '.csv',
                                                    rows[0], rows.slice(1), 'audit');
                                            }}>{exportingCSV === 'audit' ? '⏳ Exporting…' : '📤 Export'}</button>
                                        )}
                                    </div>
                                </div>
                                <div style={{ padding: '1rem 1.5rem' }}>
                                    {auditLoading ? (
                                        <div style={{ textAlign: 'center', padding: '4rem 2rem', color: '#94a3b8' }}>
                                            <div style={{ fontSize: '1rem' }}>Loading audit log…</div>
                                        </div>
                                    ) : auditLog.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '4rem 2rem', color: '#94a3b8' }}>
                                            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📋</div>
                                            <div style={{ fontWeight: '600', fontSize: '1rem', marginBottom: '0.375rem', color: '#64748b' }}>No activity recorded yet</div>
                                            <div style={{ fontSize: '0.875rem' }}>Changes to opportunities, accounts, contacts, and tasks will appear here</div>
                                        </div>
                                    ) : filtered.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8', fontSize: '0.875rem' }}>No entries match your filters</div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                                            {filtered.map((entry, i) => (
                                                <div key={entry.id} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr auto' : '150px 110px 90px 100px 1fr auto', gap: '0.75rem', alignItems: 'center',
                                                    padding: '0.625rem 0.75rem', background: i % 2 === 0 ? '#fff' : '#f8fafc',
                                                    borderBottom: '1px solid #f1f5f9', fontSize: '0.8125rem' }}>
                                                    <div style={{ color: '#64748b', fontSize: '0.75rem' }}>
                                                        {new Date(entry.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}{' '}
                                                        <span style={{ color: '#94a3b8' }}>{new Date(entry.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                                                    </div>
                                                    <div style={{ fontWeight: '600', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.user}</div>
                                                    <div>
                                                        <span style={{ background: (actionColor[entry.action] || '#94a3b8') + '18', color: actionColor[entry.action] || '#94a3b8',
                                                            padding: '0.125rem 0.5rem', borderRadius: '999px', fontSize: '0.6875rem', fontWeight: '700', whiteSpace: 'nowrap' }}>
                                                            {actionLabel[entry.action] || entry.action}
                                                        </span>
                                                    </div>
                                                    <div style={{ color: '#64748b', fontSize: '0.75rem' }}>
                                                        {entityIcon[entry.entity] || '•'} {entry.entity}
                                                    </div>
                                                    <div style={{ fontWeight: '600', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={entry.label}>{entry.label}</div>
                                                    <div style={{ color: '#64748b', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{entry.detail}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {auditLog.length > 0 && (
                                    <div style={{ padding: '0.625rem 1.5rem', borderTop: '1px solid #f1f5f9', color: '#94a3b8', fontSize: '0.75rem' }}>
                                        Showing {filtered.length} of {auditLog.length} entries (last 500 saved)
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {settingsView === 'fiscal-year' && (
                        <div className="table-container">
                            <div className="table-header">
                                <button 
                                    className="btn btn-secondary" 
                                    onClick={goBackToMenu}
                                    style={{ marginRight: '1rem' }}
                                >
                                    ← Back
                                </button>
                                <h2>FISCAL YEAR SETTINGS</h2>
                            </div>
                            <div style={{ padding: '1.5rem' }}>
                                <div className="form-group" style={{ maxWidth: isMobile ? '100%' : '400px' }}>
                                    <label style={{ 
                                        color: '#64748b', 
                                        fontSize: '0.875rem', 
                                        fontWeight: '600', 
                                        marginBottom: '0.5rem',
                                        display: 'block'
                                    }}>
                                        Fiscal Year Start Month
                                    </label>
                                    <select
                                        value={settings.fiscalYearStart}
                                        onChange={(e) => handleUpdateFiscalYearStart(e.target.value)}
                                        style={{
                                            background: '#f8f9fa',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '6px',
                                            padding: '0.625rem 0.75rem',
                                            color: '#1e293b',
                                            fontSize: '0.875rem',
                                            width: '100%'
                                        }}
                                    >
                                        <option value="1">January</option>
                                        <option value="2">February</option>
                                        <option value="3">March</option>
                                        <option value="4">April</option>
                                        <option value="5">May</option>
                                        <option value="6">June</option>
                                        <option value="7">July</option>
                                        <option value="8">August</option>
                                        <option value="9">September</option>
                                        <option value="10">October</option>
                                        <option value="11">November</option>
                                        <option value="12">December</option>
                                    </select>
                                    <div style={{ 
                                        marginTop: '0.75rem', 
                                        color: '#64748b', 
                                        fontSize: '0.8125rem' 
                                    }}>
                                        Current setting: Fiscal year starts in <strong>{['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][settings.fiscalYearStart]}</strong>
                                        <br />
                                        Quarters are calculated as 3-month periods starting from this month.
                                    </div>
                                </div>
                            </div>
                        
                            <SaveCancelBar />
                        </div>
                    )}

                    {settingsView === 'logo' && (
                        <div className="table-container">
                            <div className="table-header">
                                <button 
                                    className="btn btn-secondary" 
                                    onClick={goBackToMenu}
                                    style={{ marginRight: '1rem' }}
                                >
                                    ← Back
                                </button>
                                <h2>COMPANY LOGO</h2>
                            </div>
                            <div style={{ padding: '1.5rem' }}>
                                <div style={{ maxWidth: isMobile ? '100%' : '600px' }}>
                                    <div className="form-group">
                                        <label style={{ 
                                            color: '#64748b', 
                                            fontSize: '0.875rem', 
                                            fontWeight: '600', 
                                            marginBottom: '0.5rem',
                                            display: 'block'
                                        }}>
                                            Upload Logo
                                        </label>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) => {
                                                const file = e.target.files[0];
                                                if (file) {
                                                    const reader = new FileReader();
                                                    reader.onloadend = () => {
                                                        setSettings(prev => ({
                                                            ...prev,
                                                            logoUrl: reader.result
                                                        }));
                                                    };
                                                    reader.readAsDataURL(file);
                                                }
                                            }}
                                            style={{
                                                background: '#f8f9fa',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '6px',
                                                padding: '0.625rem 0.75rem',
                                                color: '#1e293b',
                                                fontSize: '0.875rem',
                                                width: '100%',
                                                cursor: 'pointer'
                                            }}
                                        />
                                        <div style={{ 
                                            marginTop: '0.75rem', 
                                            color: '#64748b', 
                                            fontSize: '0.8125rem' 
                                        }}>
                                            Select an image file from your computer. The logo will appear in the top-left corner of the application.
                                        </div>
                                    </div>
                                    {settings.logoUrl && (
                                        <div style={{ marginTop: '1.5rem' }}>
                                            <div style={{ 
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                marginBottom: '0.75rem'
                                            }}>
                                                <div style={{ 
                                                    color: '#64748b', 
                                                    fontSize: '0.875rem', 
                                                    fontWeight: '600'
                                                }}>
                                                    Logo Preview:
                                                </div>
                                                <button
                                                    onClick={() => setSettings(prev => ({
                                                        ...prev,
                                                        logoUrl: ''
                                                    }))}
                                                    style={{
                                                        background: '#ef4444',
                                                        color: 'white',
                                                        border: 'none',
                                                        padding: '0.4rem 0.8rem',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        fontSize: '0.8125rem',
                                                        fontWeight: '600'
                                                    }}
                                                >
                                                    Remove Logo
                                                </button>
                                            </div>
                                            <div style={{ 
                                                padding: '1.5rem',
                                                background: '#f1f3f5',
                                                borderRadius: '8px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                minHeight: '100px'
                                            }}>
                                                <img 
                                                    src={settings.logoUrl} 
                                                    alt="Logo Preview" 
                                                    style={{ 
                                                        maxHeight: '80px',
                                                        maxWidth: '100%',
                                                        objectFit: 'contain'
                                                    }}
                                                    onError={(e) => {
                                                        e.target.style.display = 'none';
                                                        e.target.nextSibling.style.display = 'block';
                                                    }}
                                                />
                                                <div style={{ 
                                                    display: 'none',
                                                    color: '#ef4444',
                                                    fontSize: '0.875rem'
                                                }}>
                                                    Failed to load image. Please try uploading again.
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        
                            <SaveCancelBar />
</div>
                    )}

                    {settingsView === 'users' && (
                        <div className="table-container">
                            <div className="table-header">
                                <button 
                                    className="btn btn-secondary" 
                                    onClick={goBackToMenu}
                                    style={{ marginRight: '1rem' }}
                                >
                                    ← Back
                                </button>
                                <h2>MANAGE USERS</h2>
                                <button className="btn" onClick={handleAddUser}>+ ADD USER</button>
                            </div>
                            <div style={{ padding: '1.5rem' }}>
                                {(settings.users || []).length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                                        No users yet. Click "+ ADD USER" to create one.
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gap: '1rem' }}>
                                        {(settings.users || []).map(user => (
                                            <div key={user.id} style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'flex-start',
                                                padding: '1rem',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '8px',
                                                background: '#ffffff'
                                            }}>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ 
                                                        fontWeight: '700', 
                                                        fontSize: '1rem',
                                                        color: '#1e293b',
                                                        marginBottom: '0.25rem',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.5rem'
                                                    }}>
                                                        {user.name}
                                                        <span style={{
                                                            fontSize: '0.6875rem',
                                                            fontWeight: '600',
                                                            padding: '0.125rem 0.5rem',
                                                            borderRadius: '10px',
                                                            background: (user.userType || 'User') === 'Admin' ? '#eff6ff' : (user.userType || 'User') === 'Manager' ? '#ecfdf5' : (user.userType || 'User') === 'ReadOnly' ? '#f1f5f9' : '#f1f3f5',
                                                            color: (user.userType || 'User') === 'Admin' ? '#2563eb' : (user.userType || 'User') === 'Manager' ? '#059669' : (user.userType || 'User') === 'ReadOnly' ? '#94a3b8' : '#64748b',
                                                            border: (user.userType || 'User') === 'Admin' ? '1px solid #bfdbfe' : (user.userType || 'User') === 'Manager' ? '1px solid #a7f3d0' : '1px solid #e2e8f0',
                                                            textTransform: 'uppercase',
                                                            letterSpacing: '0.03em'
                                                        }}>
                                                            {(user.userType || 'User') === 'User' ? 'Sales Rep' : (user.userType || 'User') === 'ReadOnly' ? 'Read-Only' : user.userType || 'Sales Rep'}
                                                        </span>
                                                    </div>
                                                    <div style={{ 
                                                        color: '#64748b',
                                                        fontSize: '0.875rem'
                                                    }}>
                                                        {user.email}
                                                        {user.role && <span> • {user.role}</span>}
                                                    </div>
                                                    {(user.territory || user.team) && (
                                                        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginTop: '0.375rem' }}>
                                                            {user.territory && (
                                                                <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '0.1rem 0.5rem', borderRadius: '999px', fontSize: '0.625rem', fontWeight: '700' }}>
                                                                    📍 {user.territory}
                                                                </span>
                                                            )}
                                                            {user.team && (
                                                                <span style={{ background: '#ede9fe', color: '#5b21b6', border: '1px solid #ddd6fe', padding: '0.1rem 0.5rem', borderRadius: '999px', fontSize: '0.625rem', fontWeight: '700' }}>
                                                                    👥 {user.team}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                    {(user.workPhone || user.cellPhone) && (
                                                        <div style={{ 
                                                            color: '#64748b',
                                                            fontSize: '0.8125rem',
                                                            marginTop: '0.25rem'
                                                        }}>
                                                            {user.workPhone && <span>Work: {user.workPhone}</span>}
                                                            {user.workPhone && user.cellPhone && <span> • </span>}
                                                            {user.cellPhone && <span>Cell: {user.cellPhone}</span>}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="action-buttons">
                                                    <button className="action-btn" onClick={() => handleEditUser(user)}>Edit</button>
                                                    <button className="action-btn delete" onClick={() => handleDeleteUser(user.id)}>Delete</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <SaveCancelBar />
                        </div>
                    )}

                    {settingsView === 'team-builder' && (
                        <TeamBuilder
                            onBack={goBackToMenu}
                            onSave={handleSaveView}
                            onCancel={handleCancelView}
                        />
                    )}
                    {settingsView === 'territories' && (
                        <TerritoriesSettings
                            onBack={goBackToMenu}
                            onSave={handleSaveView}
                            onCancel={handleCancelView}
                        />
                    )}
                    {settingsView === 'verticals' && (
                        <VerticalsSettings
                            onBack={goBackToMenu}
                            onSave={handleSaveView}
                            onCancel={handleCancelView}
                        />
                    )}

                    {settingsView === 'pain-points' && (
                        <div className="table-container">
                            <div className="table-header">
                                <button 
                                    className="btn btn-secondary" 
                                    onClick={goBackToMenu}
                                    style={{ marginRight: '1rem' }}
                                >
                                    ← Back
                                </button>
                                <h2>PAIN POINTS LIBRARY</h2>
                            </div>
                            <div style={{ padding: '1.5rem' }}>
                                <div style={{ marginBottom: '2rem' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem' }}>
                                        Add New Pain Point
                                    </h3>
                                    <div style={{ display: 'flex', gap: '0.5rem', maxWidth: isMobile ? '100%' : '500px' }}>
                                        <input
                                            type="text"
                                            value={newPainPointInput}
                                            onChange={(e) => setNewPainPointInput(e.target.value)}
                                            placeholder="Enter new pain point..."
                                            style={{
                                                flex: 1,
                                                background: '#f8f9fa',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '6px',
                                                padding: '0.625rem 0.75rem',
                                                color: '#1e293b',
                                                fontSize: '0.875rem'
                                            }}
                                            onKeyPress={(e) => {
                                                if (e.key === 'Enter') {
                                                    const value = newPainPointInput.trim();
                                                    if (value && !(settings.painPoints || []).includes(value)) {
                                                        setSettings(prev => ({
                                                            ...prev,
                                                            painPoints: [...prev.painPoints, value]
                                                        }));
                                                        setNewPainPointInput('');
                                                    }
                                                }
                                            }}
                                        />
                                        <button
                                            className="btn"
                                            onClick={() => {
                                                const value = newPainPointInput.trim();
                                                if (value) {
                                                    const currentPainPoints = settings.painPoints || [];
                                                    if (!currentPainPoints.includes(value)) {
                                                        setSettings(prev => ({
                                                            ...prev,
                                                            painPoints: [...currentPainPoints, value]
                                                        }));
                                                        setNewPainPointInput('');
                                                    }
                                                }
                                            }}
                                        >
                                            + ADD
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem' }}>
                                        Existing Pain Points ({(settings.painPoints || []).length})
                                    </h3>
                                    {(settings.painPoints || []).length === 0 ? (
                                        <div style={{ 
                                            textAlign: 'center', 
                                            padding: '3rem', 
                                            color: '#64748b',
                                            background: '#f1f3f5',
                                            borderRadius: '8px'
                                        }}>
                                            No pain points yet. Add one above to get started.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                                            {(settings.painPoints || []).map((painPoint, idx) => (
                                                <span key={idx} style={{
                                                    background: '#ffffff',
                                                    padding: '0.75rem 1rem',
                                                    borderRadius: '6px',
                                                    fontSize: '0.875rem',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.75rem',
                                                    border: '2px solid #e2e8f0',
                                                    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                                                }}>
                                                    <span style={{ fontWeight: '500' }}>{painPoint}</span>
                                                    <button
                                                        onClick={() => {
                                                            showConfirm(`Remove "${painPoint}" from pain points library?`, () => {
                                                                setSettings(prev => ({
                                                                    ...prev,
                                                                    painPoints: prev.painPoints.filter((_, i) => i !== idx)
                                                                }));
                                                            });
                                                        }}
                                                        style={{
                                                            background: '#ef4444',
                                                            border: 'none',
                                                            color: 'white',
                                                            cursor: 'pointer',
                                                            fontSize: '1.2rem',
                                                            padding: '0.125rem 0.375rem',
                                                            lineHeight: 1,
                                                            borderRadius: '4px',
                                                            transition: 'opacity 0.2s'
                                                        }}
                                                        onMouseEnter={e => e.target.style.opacity = '0.8'}
                                                        onMouseLeave={e => e.target.style.opacity = '1'}
                                                    >
                                                        ×
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        
                            <SaveCancelBar />
</div>
                    )}

                    {settingsView === 'vertical-markets' && (
                        <div className="table-container">
                            <div className="table-header">
                                <button 
                                    className="btn btn-secondary" 
                                    onClick={goBackToMenu}
                                    style={{ marginRight: '1rem' }}
                                >
                                    ← Back
                                </button>
                                <h2>INDUSTRIES</h2>
                            </div>
                            <div style={{ padding: '1.5rem' }}>
                                {(() => {
                                    const rawList = settings.verticalMarkets || [];
                                    const industries = rawList.map(m => typeof m === 'string' ? { name: m, subs: [] } : m);
                                    const saveIndustries = (updated) => setSettings(prev => ({ ...prev, verticalMarkets: updated }));
                                    return (
                                        <>
                                        <div style={{ marginBottom: '2rem' }}>
                                            <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem' }}>Add Primary Industry</h3>
                                            <div style={{ display: 'flex', gap: '0.5rem', maxWidth: isMobile ? '100%' : '500px' }}>
                                                <input type="text" value={newVerticalMarketInput} onChange={e => setNewVerticalMarketInput(e.target.value)} placeholder="e.g. Oil & Gas, Manufacturing..."
                                                    style={{ flex: 1, background: '#f8f9fa', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.625rem 0.75rem', color: '#1e293b', fontSize: '0.875rem' }}
                                                    onKeyPress={e => { if (e.key === 'Enter') { const v = newVerticalMarketInput.trim(); if (v && !industries.some(i => i.name.toLowerCase() === v.toLowerCase())) { saveIndustries([...industries, { name: v, subs: [] }]); setNewVerticalMarketInput(''); } } }} />
                                                <button className="btn" onClick={() => { const v = newVerticalMarketInput.trim(); if (v && !industries.some(i => i.name.toLowerCase() === v.toLowerCase())) { saveIndustries([...industries, { name: v, subs: [] }]); setNewVerticalMarketInput(''); } }}>+ Add</button>
                                            </div>
                                        </div>
                                        <div>
                                            <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem' }}>Industries ({industries.length})</h3>
                                            {industries.length === 0 ? (
                                                <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b', background: '#f1f3f5', borderRadius: '8px' }}>No industries yet. Add one above to get started.</div>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                    {[...industries].sort((a, b) => a.name.localeCompare(b.name)).map((industry) => {
                                                        const realIdx = industries.findIndex(i => i.name === industry.name);
                                                        const isExpanded = expandedIndustry === industry.name;
                                                        return (
                                                            <div key={industry.name} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', padding: '0.625rem 1rem', gap: '0.5rem' }}>
                                                                    <button onClick={() => setExpandedIndustry(isExpanded ? null : industry.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#2563eb', padding: '0', width: '16px', flexShrink: 0 }}>{isExpanded ? '▼' : '▶'}</button>
                                                                    <span style={{ fontWeight: '600', fontSize: '0.875rem', flex: 1 }}>{industry.name}</span>
                                                                    {industry.subs.length > 0 && <span style={{ fontSize: '0.6875rem', color: '#94a3b8', background: '#f1f5f9', padding: '1px 6px', borderRadius: '999px' }}>{industry.subs.length} sub{industry.subs.length > 1 ? 's' : ''}</span>}
                                                                    <button onClick={() => setExpandedIndustry(isExpanded ? null : industry.name)} style={{ fontSize: '0.6875rem', fontWeight: '600', color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>+ Sub</button>
                                                                    <button onClick={() => showConfirm(`Remove "${industry.name}" and all its sub-industries?`, () => { saveIndustries(industries.filter((_, i) => i !== realIdx)); if (expandedIndustry === industry.name) setExpandedIndustry(null); })} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '1rem', padding: '0 0 0 4px', lineHeight: 1 }}>×</button>
                                                                </div>
                                                                {isExpanded && (
                                                                    <div style={{ borderTop: '1px solid #f1f5f9', background: '#f8fafc', padding: '0.625rem 1rem 0.625rem 2.5rem' }}>
                                                                        {industry.subs.length > 0 && (
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '0.5rem' }}>
                                                                                {industry.subs.map((sub, si) => (
                                                                                    <div key={si} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem' }}>
                                                                                        <span style={{ color: '#94a3b8' }}>↳</span>
                                                                                        <span style={{ flex: 1, color: '#475569' }}>{sub}</span>
                                                                                        <button onClick={() => { const updated = industries.map((ind, i) => i === realIdx ? { ...ind, subs: ind.subs.filter((_, j) => j !== si) } : ind); saveIndustries(updated); }} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.875rem', padding: '0', lineHeight: 1 }}>×</button>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                        <div style={{ display: 'flex', gap: '0.375rem' }}>
                                                                            <input type="text" value={newSubIndustryInput} onChange={e => setNewSubIndustryInput(e.target.value)} placeholder={`Add sub-industry under ${industry.name}...`}
                                                                                style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '0.375rem 0.625rem', fontSize: '0.8125rem', color: '#1e293b' }}
                                                                                onKeyPress={e => { if (e.key === 'Enter') { const v = newSubIndustryInput.trim(); if (v && !industry.subs.includes(v)) { saveIndustries(industries.map((ind, i) => i === realIdx ? { ...ind, subs: [...ind.subs, v] } : ind)); setNewSubIndustryInput(''); } } }} />
                                                                            <button onClick={() => { const v = newSubIndustryInput.trim(); if (v && !industry.subs.includes(v)) { saveIndustries(industries.map((ind, i) => i === realIdx ? { ...ind, subs: [...ind.subs, v] } : ind)); setNewSubIndustryInput(''); } }} style={{ padding: '0.375rem 0.75rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Add</button>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                        </>
                                    );
                                })()}
                            </div>
                        
                            <SaveCancelBar />
</div>
                    )}

                    {settingsView === 'funnel-stages' && (
                        <div className="table-container">
                            <div className="table-header">
                                <button className="btn btn-secondary" onClick={goBackToMenu} style={{ marginRight: '1rem' }}>← Back</button>
                                <h2>SALES FUNNEL STAGES</h2>
                            </div>
                            <div style={{ padding: '1.5rem', maxWidth: isMobile ? '100%' : '650px' }}>
                                <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                                    Configure your sales funnel stages and their win probability weightings. These weightings are used to calculate weighted pipeline values in analytics and forecasting.
                                </p>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', marginBottom: '1rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                                            <th style={{ padding: '0.625rem 0.5rem', textAlign: 'left', fontWeight: '700', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>Stage Name</th>
                                            <th style={{ padding: '0.625rem 0.5rem', textAlign: 'center', fontWeight: '700', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', width: '120px' }}>Win Probability %</th>
                                            <th style={{ padding: '0.625rem 0.5rem', textAlign: 'center', fontWeight: '700', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', width: '60px' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(settings.funnelStages || []).map((stage, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid #f1f3f5' }}>
                                                <td style={{ padding: '0.5rem' }}>
                                                    <input type="text" value={stage.name} onChange={e => {
                                                        const updated = [...(settings.funnelStages || [])];
                                                        updated[idx] = { ...updated[idx], name: e.target.value };
                                                        setSettings(prev => ({ ...prev, funnelStages: updated }));
                                                    }} style={{ width: '100%', padding: '0.5rem 0.625rem', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '0.875rem', fontFamily: 'inherit' }} />
                                                </td>
                                                <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', justifyContent: 'center' }}>
                                                        <input type="number" min="0" max="100" value={stage.weight} onChange={e => {
                                                            const updated = [...(settings.funnelStages || [])];
                                                            updated[idx] = { ...updated[idx], weight: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) };
                                                            setSettings(prev => ({ ...prev, funnelStages: updated }));
                                                        }} style={{ width: '65px', padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '0.875rem', textAlign: 'center', fontFamily: 'inherit' }} />
                                                        <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>%</span>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                                    {(settings.funnelStages || []).length > 2 && (
                                                        <button onClick={() => setSettings(prev => ({ ...prev, funnelStages: (prev.funnelStages || []).filter((_, i) => i !== idx) }))}
                                                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.125rem', padding: '0 0.25rem' }}>×</button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <button onClick={() => setSettings(prev => ({ ...prev, funnelStages: [...(prev.funnelStages || []), { name: '', weight: 0 }] }))}
                                    style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: '600', color: '#2563eb', fontFamily: 'inherit' }}>
                                    + Add Stage
                                </button>
                                <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem' }}>Funnel Preview</div>
                                    {(settings.funnelStages || []).filter(s => s.name.trim()).map((stage, idx, arr) => {
                                        const widthPct = 100 - (idx * (60 / Math.max(arr.length - 1, 1)));
                                        const colors = ['#6366f1', '#818cf8', '#a78bfa', '#c084fc', '#3b82f6', '#2563eb', '#10b981', '#ef4444'];
                                        return (
                                            <div key={idx} style={{ display: 'flex', alignItems: 'center', marginBottom: '0.25rem' }}>
                                                <div style={{
                                                    width: widthPct + '%', margin: '0 auto', padding: '0.375rem 0.75rem',
                                                    background: colors[idx % colors.length] + '18', border: '1px solid ' + colors[idx % colors.length] + '40',
                                                    borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                    fontSize: '0.75rem', color: '#1e293b'
                                                }}>
                                                    <span style={{ fontWeight: '600' }}>{stage.name}</span>
                                                    <span style={{ color: '#64748b' }}>{stage.weight}%</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        
                            <SaveCancelBar />
</div>
                    )}

                    {settingsView === 'pipelines' && (
                        <PipelinesSettingsPanel
                            settings={settings}
                            setSettings={setSettings}
                            opportunities={opportunities}
                            activePipelineId={activePipelineId}
                            setActivePipelineId={setActivePipelineId}
                            onBack={goBackToMenu}
                            onSave={handleSaveView}
                            onCancel={handleCancelView}
                        />
                    )}

                    {settingsView === 'kpi-settings' && (
                        <div className="table-container">
                            <div className="table-header">
                                <button className="btn btn-secondary" onClick={goBackToMenu} style={{ marginRight: '1rem' }}>← Back</button>
                                <h2>KPI SETTINGS</h2>
                            </div>
                            <div style={{ padding: '1.5rem' }}>
                                <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                                    Configure your KPI cards. Set color indicators and tolerance thresholds to visually track performance.
                                </p>

                                {/* KPI Trend Mode */}
                                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
                                    <div style={{ fontWeight: '700', fontSize: '0.9375rem', color: '#1e293b', marginBottom: '0.375rem' }}>Sparkline Trend Mode</div>
                                    <div style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '1rem' }}>Controls what the sparklines on KPI cards visualize.</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        {[
                                            { value: 'stage-distribution', label: 'Stage Distribution', desc: 'ARR/count across funnel stages' },
                                            { value: 'month-over-month', label: 'Month over Month', desc: 'Last 6 months of close dates' },
                                            { value: 'quarter-over-quarter', label: 'Quarter over Quarter', desc: 'Last 4 quarters' },
                                            { value: 'year-to-date', label: 'Year to Date', desc: 'Monthly buckets since Jan 1' },
                                            { value: 'year-over-year', label: 'Year over Year', desc: 'This year vs last year delta' },
                                        ].map(opt => {
                                            const active = (settings.kpiTrendMode || 'stage-distribution') === opt.value;
                                            return (
                                                <div key={opt.value} onClick={() => setSettings(prev => ({ ...prev, kpiTrendMode: opt.value }))}
                                                    style={{ padding: '0.625rem 1rem', borderRadius: '8px', border: active ? '2px solid #2563eb' : '1px solid #e2e8f0', background: active ? '#eff6ff' : '#fff', cursor: 'pointer', minWidth: '160px', transition: 'all 0.15s' }}>
                                                    <div style={{ fontWeight: '600', fontSize: '0.8125rem', color: active ? '#2563eb' : '#1e293b' }}>{opt.label}</div>
                                                    <div style={{ fontSize: '0.6875rem', color: '#94a3b8', marginTop: '2px' }}>{opt.desc}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {(settings.kpiConfig || []).map((kpi, kIdx) => {
                                    const colorOptions = [
                                        { value: 'primary', label: 'Blue', swatch: '#2563eb' },
                                        { value: 'success', label: 'Green', swatch: '#16a34a' },
                                        { value: 'warning', label: 'Amber', swatch: '#f59e0b' },
                                        { value: 'info', label: 'Indigo', swatch: '#6366f1' },
                                        { value: 'neutral', label: 'Gray', swatch: '#475569' }
                                    ];
                                    return (
                                        <div key={kpi.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem', marginBottom: '1rem', background: '#ffffff' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <input type="text" value={kpi.name}
                                                        onChange={e => {
                                                            const updated = [...(settings.kpiConfig || [])];
                                                            updated[kIdx] = { ...updated[kIdx], name: e.target.value };
                                                            setSettings(prev => ({ ...prev, kpiConfig: updated }));
                                                        }}
                                                        style={{ fontWeight: '700', fontSize: '1rem', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.375rem 0.75rem', fontFamily: 'inherit', width: '280px' }}
                                                    />
                                                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                                                        {colorOptions.map(co => (
                                                            <div key={co.value}
                                                                onClick={() => {
                                                                    const updated = [...(settings.kpiConfig || [])];
                                                                    updated[kIdx] = { ...updated[kIdx], color: co.value };
                                                                    setSettings(prev => ({ ...prev, kpiConfig: updated }));
                                                                }}
                                                                title={co.label}
                                                                style={{
                                                                    width: '22px', height: '22px', borderRadius: '50%', background: co.swatch,
                                                                    cursor: 'pointer', border: kpi.color === co.value ? '3px solid #1e293b' : '2px solid #e2e8f0',
                                                                    transition: 'all 0.15s'
                                                                }}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                                <button onClick={() => {
                                                    const updated = (settings.kpiConfig || []).filter((_, i) => i !== kIdx);
                                                    setSettings(prev => ({ ...prev, kpiConfig: updated }));
                                                }}
                                                    style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '6px', padding: '0.375rem 0.75rem', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: '600', fontFamily: 'inherit' }}
                                                >Delete</button>
                                            </div>

                                            {/* Tolerances */}
                                            <div style={{ background: '#f8fafc', borderRadius: '6px', padding: '0.75rem', border: '1px solid #f1f3f5' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tolerance Thresholds</span>
                                                    <button onClick={() => {
                                                        const updated = [...(settings.kpiConfig || [])];
                                                        const tols = [...(updated[kIdx].tolerances || [])];
                                                        tols.push({ label: 'New Level', min: 0, color: '#64748b' });
                                                        updated[kIdx] = { ...updated[kIdx], tolerances: tols };
                                                        setSettings(prev => ({ ...prev, kpiConfig: updated }));
                                                    }}
                                                        style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', padding: '0.25rem 0.625rem', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600', fontFamily: 'inherit' }}
                                                    >+ Add</button>
                                                </div>
                                                {(!kpi.tolerances || kpi.tolerances.length === 0) ? (
                                                    <div style={{ textAlign: 'center', padding: '0.75rem', color: '#94a3b8', fontSize: '0.8125rem' }}>No tolerances set. Add thresholds to show color indicators.</div>
                                                ) : (
                                                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                                                        {(kpi.tolerances || []).map((tol, tIdx) => (
                                                            <div key={tIdx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#ffffff', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                                                <input type="color" value={tol.color || '#64748b'}
                                                                    onChange={e => {
                                                                        const updated = [...(settings.kpiConfig || [])];
                                                                        const tols = [...(updated[kIdx].tolerances || [])];
                                                                        tols[tIdx] = { ...tols[tIdx], color: e.target.value };
                                                                        updated[kIdx] = { ...updated[kIdx], tolerances: tols };
                                                                        setSettings(prev => ({ ...prev, kpiConfig: updated }));
                                                                    }}
                                                                    style={{ width: '32px', height: '28px', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: 0 }}
                                                                />
                                                                <input type="text" value={tol.label || ''} placeholder="Label"
                                                                    onChange={e => {
                                                                        const updated = [...(settings.kpiConfig || [])];
                                                                        const tols = [...(updated[kIdx].tolerances || [])];
                                                                        tols[tIdx] = { ...tols[tIdx], label: e.target.value };
                                                                        updated[kIdx] = { ...updated[kIdx], tolerances: tols };
                                                                        setSettings(prev => ({ ...prev, kpiConfig: updated }));
                                                                    }}
                                                                    style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: '4px', padding: '0.3rem 0.5rem', fontSize: '0.8125rem', fontFamily: 'inherit' }}
                                                                />
                                                                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600', whiteSpace: 'nowrap' }}>≥</span>
                                                                <input type="number" value={tol.min} placeholder="Min value"
                                                                    onChange={e => {
                                                                        const updated = [...(settings.kpiConfig || [])];
                                                                        const tols = [...(updated[kIdx].tolerances || [])];
                                                                        tols[tIdx] = { ...tols[tIdx], min: parseFloat(e.target.value) || 0 };
                                                                        updated[kIdx] = { ...updated[kIdx], tolerances: tols };
                                                                        setSettings(prev => ({ ...prev, kpiConfig: updated }));
                                                                    }}
                                                                    style={{ width: '100px', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '0.3rem 0.5rem', fontSize: '0.8125rem', fontFamily: 'inherit' }}
                                                                />
                                                                <button onClick={() => {
                                                                    const updated = [...(settings.kpiConfig || [])];
                                                                    const tols = [...(updated[kIdx].tolerances || [])].filter((_, i) => i !== tIdx);
                                                                    updated[kIdx] = { ...updated[kIdx], tolerances: tols };
                                                                    setSettings(prev => ({ ...prev, kpiConfig: updated }));
                                                                }}
                                                                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem', fontWeight: '700', padding: '0 0.25rem' }}
                                                                >×</button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}

                                <button onClick={() => {
                                    const kpiConfig = [...(settings.kpiConfig || [])];
                                    kpiConfig.push({
                                        id: 'kpi_' + Date.now(),
                                        name: 'New KPI',
                                        color: 'primary',
                                        tolerances: [
                                            { label: 'Good', min: 100, color: '#16a34a' },
                                            { label: 'Warning', min: 50, color: '#f59e0b' },
                                            { label: 'Critical', min: 0, color: '#ef4444' }
                                        ]
                                    });
                                    setSettings(prev => ({ ...prev, kpiConfig }));
                                }}
                                    style={{ width: '100%', padding: '1rem', border: '2px dashed #d1d5db', borderRadius: '8px', background: '#f8fafc', cursor: 'pointer', fontSize: '0.9375rem', fontWeight: '600', color: '#64748b', fontFamily: 'inherit', transition: 'all 0.2s' }}
                                    onMouseEnter={e => { e.target.style.borderColor = '#2563eb'; e.target.style.color = '#2563eb'; }}
                                    onMouseLeave={e => { e.target.style.borderColor = '#d1d5db'; e.target.style.color = '#64748b'; }}
                                >+ Add New KPI</button>
                            </div>
                        
                            <SaveCancelBar />
</div>
                    )}

                    {settingsView === 'features' && (
                        <div className="table-container">
                            <div className="table-header">
                                <button className="btn btn-secondary" onClick={goBackToMenu} style={{ marginRight: '1rem' }}>← Back</button>
                                <h2>FEATURES</h2>
                            </div>
                            <div style={{ padding: '1.5rem', maxWidth: isMobile ? '100%' : '560px' }}>
                                <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.5rem', lineHeight: '1.6' }}>
                                    Enable or disable features for your organization. Disabled features are hidden from the navigation and reports.
                                </p>
                                {/* Leads toggle */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '0.75rem' }}>
                                    <div>
                                        <div style={{ fontWeight: '700', fontSize: '0.9375rem', color: '#1e293b', marginBottom: '0.25rem' }}>Leads</div>
                                        <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>Show the Leads tab and leads-related reports. Disable for teams that manage leads outside the app.</div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '1.5rem', flexShrink: 0 }}>
                                        <button
                                            onClick={() => setSettings(prev => ({ ...prev, leadsEnabled: !(prev.leadsEnabled !== false) }))}
                                            style={{ width: '44px', height: '24px', borderRadius: '999px', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', background: settings.leadsEnabled !== false ? '#2563eb' : '#e2e8f0', border: 'none', padding: 0, flexShrink: 0 }}>
                                            <div style={{ position: 'absolute', width: '18px', height: '18px', background: '#fff', borderRadius: '50%', top: '3px', transition: 'left 0.2s', left: settings.leadsEnabled !== false ? '23px' : '3px', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                                        </button>
                                        <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: settings.leadsEnabled !== false ? '#2563eb' : '#94a3b8', minWidth: '28px' }}>
                                            {settings.leadsEnabled !== false ? 'On' : 'Off'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <SaveCancelBar />
                        </div>
                    )}

                    {settingsView === 'ai-features' && (
                        <div className="table-container">
                            <div className="table-header">
                                <button className="btn" onClick={goBackToMenu}>← Back</button>
                                <h2>AI FEATURES</h2>
                            </div>
                            <div style={{ padding: '1.5rem', maxWidth: isMobile ? '100%' : '560px' }}>

                                {/* Privacy notice */}
                                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                    <div style={{ fontSize: '1.25rem', flexShrink: 0, lineHeight: 1 }}>🔒</div>
                                    <div>
                                        <div style={{ fontSize: '0.8125rem', fontWeight: '700', color: '#c2410c', marginBottom: '4px' }}>Data privacy notice</div>
                                        <div style={{ fontSize: '0.75rem', color: '#92400e', lineHeight: 1.6 }}>
                                            When AI deal scoring is enabled, deal data (account name, stage, ARR, activity summaries, and contact names) is sent to Anthropic's API to generate scores. No data is stored by Anthropic beyond the request. Disable this feature if your organization has data residency or confidentiality requirements that prevent sending deal data to third-party AI services.
                                        </div>
                                    </div>
                                </div>

                                {/* AI Scoring toggle */}
                                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', marginBottom: '1.5rem' }}>
                                    <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                                        <div>
                                            <div style={{ fontSize: '0.875rem', fontWeight: '700', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span>🤖</span> AI deal scoring
                                                {(settings.aiScoringEnabled) && (
                                                    <span style={{ fontSize: '0.625rem', fontWeight: '700', background: '#d1fae5', color: '#065f46', padding: '1px 8px', borderRadius: '999px' }}>ENABLED</span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '3px' }}>
                                                Score deals with Claude AI — get a health score, headline, signals, and a recommended next action per deal.
                                            </div>
                                        </div>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', flexShrink: 0 }}>
                                            <div
                                                onClick={() => setSettings(prev => ({
                                                    ...prev,
                                                    aiScoringEnabled: !prev.aiScoringEnabled
                                                }))}
                                                style={{
                                                    width: '44px', height: '24px', borderRadius: '12px', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
                                                    background: settings.aiScoringEnabled ? '#2563eb' : '#e2e8f0',
                                                    position: 'relative',
                                                }}>
                                                <div style={{
                                                    position: 'absolute', top: '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
                                                    transition: 'left 0.2s', left: settings.aiScoringEnabled ? '23px' : '3px',
                                                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                                }} />
                                            </div>
                                            <span style={{ fontSize: '0.75rem', color: '#64748b', userSelect: 'none' }}>
                                                {settings.aiScoringEnabled ? 'On' : 'Off'}
                                            </span>
                                        </label>
                                    </div>

                                    {/* What data is sent */}
                                    <div style={{ padding: '0.875rem 1.25rem' }}>
                                        <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Data sent to AI per scoring request</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                            {[
                                                ['Deal name & account', true],
                                                ['Stage & ARR', true],
                                                ['Activity summaries', true],
                                                ['Contact names', true],
                                                ['Notes (first 200 chars)', true],
                                                ['Passwords or API keys', false],
                                            ].map(([label, sent]) => (
                                                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: sent ? '#475569' : '#94a3b8' }}>
                                                    <span style={{ color: sent ? '#2563eb' : '#cbd5e1', flexShrink: 0 }}>{sent ? '●' : '○'}</span>
                                                    {label}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Score freshness */}
                                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
                                    <div style={{ fontSize: '0.8125rem', fontWeight: '700', color: '#1e293b', marginBottom: '6px' }}>How scoring works</div>
                                    <ul style={{ fontSize: '0.75rem', color: '#64748b', lineHeight: 1.8, margin: 0, paddingLeft: '1.25rem' }}>
                                        <li>Scores are generated on demand — reps click "Score this deal" inside the deal modal</li>
                                        <li>Each score is cached for 24 hours to minimize API usage</li>
                                        <li>Reps can force a refresh at any time</li>
                                        <li>Scores are powered by Claude Haiku (fast and cost-efficient)</li>
                                        <li>Without a custom key, API costs are billed to the shared <code style={{ fontSize: '0.6875rem', background: '#f1f5f9', padding: '1px 5px', borderRadius: '3px' }}>ANTHROPIC_API_KEY</code> in Netlify</li>
                                    </ul>
                                </div>

                                {/* BYOK — Bring Your Own API Key */}
                                <ByokKeySection settings={settings} setSettings={setSettings} />
                            </div>
                        
                            <SaveCancelBar />
</div>
                    )}

                    {settingsView === 'data-management' && (
                        <div className="table-container">
                            <div className="table-header">
                                <button 
                                    className="btn btn-secondary" 
                                    onClick={goBackToMenu}
                                    style={{ marginRight: '1rem' }}
                                >
                                    ← Back
                                </button>
                                <h2>DATA MANAGEMENT</h2>
                            </div>
                            <div style={{ padding: '1.5rem' }}>
                                {/* Data Summary */}
                                <div style={{ 
                                    marginBottom: '2rem', 
                                    padding: '1.25rem', 
                                    background: '#f1f3f5', 
                                    borderRadius: '8px',
                                    border: '1px solid #e2e8f0'
                                }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem' }}>
                                        Current Data Summary
                                    </h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                                        <div style={{ textAlign: 'center', padding: '0.75rem', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                            <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#2563eb' }}>{opportunities.length}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>Opportunities</div>
                                        </div>
                                        <div style={{ textAlign: 'center', padding: '0.75rem', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                            <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#10b981' }}>{accounts.length}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>Accounts</div>
                                        </div>
                                        <div style={{ textAlign: 'center', padding: '0.75rem', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                            <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#f59e0b' }}>{contacts.length}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>Contacts</div>
                                        </div>
                                        <div style={{ textAlign: 'center', padding: '0.75rem', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                            <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#3b82f6' }}>{tasks.length}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>Tasks</div>
                                        </div>
                                        <div style={{ textAlign: 'center', padding: '0.75rem', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                            <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#1e293b' }}>{activities.length}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>Activities</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Export Section */}
                                <div style={{ 
                                    marginBottom: '2rem', 
                                    padding: '1.5rem', 
                                    border: '1px solid #e2e8f0', 
                                    borderRadius: '8px',
                                    background: '#ffffff'
                                }}>
                                    <h3 style={{ fontSize: '1.125rem', fontWeight: '700', marginBottom: '0.5rem' }}>
                                        📤 Export / Back Up Data
                                    </h3>
                                    <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                                        Download a complete backup of all your data as a JSON file. This includes opportunities, accounts, contacts, tasks, activities, and settings.
                                    </p>
                                    <button
                                        className="btn"
                                        disabled={exportingBackup}
                                        onClick={() => {
                                            setExportingBackup(true);
                                            try {
                                                const exportData = {
                                                    exportVersion: '1.0',
                                                    exportDate: new Date().toISOString(),
                                                    appName: 'Sales Pipeline Tracker',
                                                    data: {
                                                        opportunities,
                                                        accounts,
                                                        contacts,
                                                        tasks,
                                                        activities,
                                                        leads,
                                                        settings
                                                    }
                                                };
                                                const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                                                const url = URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                const dateStr = [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-');
                                                a.download = `sales-pipeline-backup-${dateStr}.json`;
                                                document.body.appendChild(a);
                                                a.click();
                                                document.body.removeChild(a);
                                                URL.revokeObjectURL(url);
                                            } finally {
                                                setTimeout(() => setExportingBackup(false), 1500);
                                            }
                                        }}
                                        style={{ padding: '0.75rem 1.5rem', fontSize: '0.9rem', opacity: exportingBackup ? 0.7 : 1 }}
                                    >
                                        {exportingBackup ? '⏳ Preparing Backup…' : '💾 Download Full Backup'}
                                    </button>
                                </div>

                                {/* Import Section */}
                                <div style={{ 
                                    marginBottom: '2rem', 
                                    padding: '1.5rem', 
                                    border: '1px solid #e2e8f0', 
                                    borderRadius: '8px',
                                    background: '#ffffff'
                                }}>
                                    <h3 style={{ fontSize: '1.125rem', fontWeight: '700', marginBottom: '0.5rem' }}>
                                        📥 Import / Restore Data
                                    </h3>
                                    <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
                                        Restore your data from a previously exported backup file. This will <strong>replace</strong> all current data with the backup contents.
                                    </p>
                                    <div style={{ 
                                        padding: '0.75rem 1rem', 
                                        background: '#fef3c7', 
                                        border: '1px solid #fcd34d', 
                                        borderRadius: '6px', 
                                        marginBottom: '1.25rem',
                                        fontSize: '0.8125rem',
                                        color: '#92400e'
                                    }}>
                                        ⚠️ <strong>Warning:</strong> Importing a backup will overwrite all existing data. Consider exporting a backup of your current data first.
                                    </div>
                                    <input
                                        type="file"
                                        accept=".json"
                                        id="backup-file-input"
                                        style={{ display: 'none' }}
                                        onChange={(e) => {
                                            const file = e.target.files[0];
                                            if (!file) return;
                                            
                                            const reader = new FileReader();
                                            reader.onload = (event) => {
                                                try {
                                                    const importData = JSON.parse(event.target.result);
                                                    
                                                    // Validate structure
                                                    if (!importData.data || !importData.appName) {
                                                        alert('Invalid backup file. Please select a valid Sales Pipeline Tracker backup file.');
                                                        return;
                                                    }
                                                    
                                                    const d = importData.data;
                                                    const counts = [
                                                        d.opportunities ? `${d.opportunities.length} opportunities` : null,
                                                        d.accounts ? `${d.accounts.length} accounts` : null,
                                                        d.contacts ? `${d.contacts.length} contacts` : null,
                                                        d.leads ? `${d.leads.length} leads` : null,
                                                        d.tasks ? `${d.tasks.length} tasks` : null,
                                                        d.activities ? `${d.activities.length} activities` : null
                                                    ].filter(Boolean).join(', ');
                                                    
                                                    const exportDate = importData.exportDate 
                                                        ? new Date(importData.exportDate).toLocaleString() 
                                                        : 'Unknown date';
                                                    
                                                    showConfirm(`Restore backup from ${exportDate}?\n\nThis file contains: ${counts}\n\nThis will REPLACE all current data.`, () => {
                                                        // Sync restored data to DB: clear each table first, then insert
                                                        const syncToDb = async () => {
                                                            setRestoringBackup(true);
                                                            try {
                                                                const endpoints = [
                                                                    { key: 'opportunities', url: '/.netlify/functions/opportunities' },
                                                                    { key: 'accounts', url: '/.netlify/functions/accounts' },
                                                                    { key: 'contacts', url: '/.netlify/functions/contacts' },
                                                                    { key: 'leads', url: '/.netlify/functions/leads' },
                                                                    { key: 'tasks', url: '/.netlify/functions/tasks' },
                                                                    { key: 'activities', url: '/.netlify/functions/activities' },
                                                                ];
                                                                // Step 1: Clear all tables
                                                                for (const { url } of endpoints) {
                                                                    await dbFetch(`${url}?clear=true`, { method: 'DELETE' }).catch(() => {});
                                                                }
                                                                // Step 2: Insert records per table — use PUT if record has an id (restore preserves IDs)
                                                                let insertOk = 0, insertFail = 0;
                                                                for (const { key, url } of endpoints) {
                                                                    if (!d[key] || d[key].length === 0) continue;
                                                                    for (const record of d[key]) {
                                                                        const method = record.id ? 'PUT' : 'POST';
                                                                        const r = await dbFetch(url, {
                                                                            method,
                                                                            headers: { 'Content-Type': 'application/json' },
                                                                            body: JSON.stringify(record)
                                                                        }).catch(() => null);
                                                                        if (r && r.ok) insertOk++;
                                                                        else { insertFail++; console.error('Restore insert failed', key, r?.status, record.id); }
                                                                    }
                                                                }
                                                                // Step 3: Restore users — propagate team/territory/vertical from
                                                                // teams.repIds before writing, so user profiles match Team Builder state
                                                                if (d.settings?.users?.length > 0) {
                                                                    const teams = d.settings?.teams || [];
                                                                    // Build repId → team assignment map
                                                                    const repTeamMap = {};
                                                                    for (const t of teams) {
                                                                        const assignment = { team: t.name, territory: t.territory || '', vertical: t.vertical || '' };
                                                                        for (const rid of (t.repIds || [])) repTeamMap[rid] = assignment;
                                                                        if (t.managerId) repTeamMap[t.managerId] = assignment;
                                                                    }
                                                                    for (const u of d.settings.users) {
                                                                        // Merge team assignment into user record before saving
                                                                        const assignment = repTeamMap[u.id] || {};
                                                                        const enrichedUser = { ...u, ...assignment };
                                                                        await dbFetch('/.netlify/functions/users', {
                                                                            method: 'POST',
                                                                            headers: { 'Content-Type': 'application/json' },
                                                                            body: JSON.stringify(enrichedUser)
                                                                        }).catch(() => {});
                                                                    }
                                                                }
                                                                // Step 4: Restore settings (strip users — managed separately)
                                                                if (d.settings) {
                                                                    const { users: _u, ...settingsOnly } = d.settings;
                                                                    await dbFetch('/.netlify/functions/settings', {
                                                                        method: 'PUT',
                                                                        headers: { 'Content-Type': 'application/json' },
                                                                        body: JSON.stringify(settingsOnly)
                                                                    }).catch(() => {});
                                                                }
                                                                if (insertFail > 0) {
                                                                    alert(`Restore mostly complete: ${insertOk} records restored, ${insertFail} failed. The page will now reload.`);
                                                                }
                                                            } catch(e) { console.error('DB sync after restore failed:', e); alert('Restore encountered an error. The page will reload — check your data after.'); }
                                                            finally { setRestoringBackup(false); }
                                                        };
                                                        // After DB sync, reload the page so all React state is fresh from DB
                                                        syncToDb().then(() => window.location.reload());
                                                    }, false);
                                                } catch (err) {
                                                    alert('Error reading backup file. The file may be corrupted or in an incorrect format.\n\nDetails: ' + err.message);
                                                }
                                            };
                                            reader.readAsText(file);
                                            // Reset input so same file can be selected again
                                            e.target.value = '';
                                        }}
                                    />
                                    <button
                                        className="btn btn-secondary"
                                        disabled={restoringBackup}
                                        onClick={() => !restoringBackup && document.getElementById('backup-file-input').click()}
                                        style={{ padding: '0.75rem 1.5rem', fontSize: '0.9rem', opacity: restoringBackup ? 0.7 : 1 }}
                                    >
                                        {restoringBackup ? (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{ width: '14px', height: '14px', border: '2px solid #94a3b8', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                                                Restoring Data…
                                            </span>
                                        ) : '📂 Select Backup File to Restore'}
                                    </button>
                                </div>

                                {/* Outlook Email Import Section */}
                                <div style={{ 
                                    marginBottom: '2rem', 
                                    padding: '1.5rem', 
                                    border: '1px solid #e2e8f0', 
                                    borderRadius: '8px',
                                    background: '#ffffff'
                                }}>
                                    <h3 style={{ fontSize: '1.125rem', fontWeight: '700', marginBottom: '0.5rem' }}>
                                        📧 Import Outlook Sent Emails
                                    </h3>
                                    <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                                        Import emails from your Outlook Sent Items folder (CSV export) and automatically link them to matching contacts as activities.
                                    </p>
                                    <button
                                        className="btn"
                                        onClick={() => { setShowOutlookImportModal(true); }}
                                        style={{ padding: '0.75rem 1.5rem', fontSize: '0.9rem' }}
                                    >
                                        📧 Import Outlook Emails
                                    </button>
                                </div>

                                {/* Clear Data Section */}
                                <div style={{ 
                                    padding: '1.5rem', 
                                    border: '1px solid #ef4444', 
                                    borderRadius: '8px',
                                    background: '#fef2f2'
                                }}>
                                    <h3 style={{ fontSize: '1.125rem', fontWeight: '700', marginBottom: '0.5rem', color: '#ef4444' }}>
                                        🗑️ Clear All Data
                                    </h3>
                                    <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                                        Permanently delete all data and reset the application to its default state. This action cannot be undone.
                                    </p>
                                    <button
                                        className="btn"
                                        onClick={() => {
                                            showConfirm('Are you SURE you want to delete ALL data? This cannot be undone.\n\nConsider exporting a backup first.', () => {
                                                showConfirm('FINAL WARNING: This will permanently erase all opportunities, accounts, contacts, tasks, activities, and settings. Proceed?', async () => {
                                                    // Clear localStorage
                                                    try {
                                                        safeStorage.removeItem('salesOpportunities');
                                                        safeStorage.removeItem('salesAccounts');
                                                        safeStorage.removeItem('salesContacts');
                                                        safeStorage.removeItem('salesTasks');
                                                        safeStorage.removeItem('salesTaskTypes');
                                                        safeStorage.removeItem('salesActivities');
                                                        safeStorage.removeItem('salesSettings');
                                                    } catch(e) {}
                                                    // Clear DB — delete from all entity tables
                                                    const endpoints = [
                                                        '/.netlify/functions/opportunities',
                                                        '/.netlify/functions/accounts',
                                                        '/.netlify/functions/contacts',
                                                        '/.netlify/functions/tasks',
                                                        '/.netlify/functions/activities',
                                                        '/.netlify/functions/leads',
                                                        '/.netlify/functions/users',
                                                    ];
                                                    try {
                                                        await Promise.all(endpoints.map(url =>
                                                            dbFetch(`${url}?clear=true`, { method: 'DELETE' }).catch(err =>
                                                                console.error('Clear failed for', url, err.message)
                                                            )
                                                        ));
                                                        // Reset settings to blank defaults
                                                        await dbFetch('/.netlify/functions/settings', {
                                                            method: 'PUT',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({
                                                                companyName: '',
                                                                companyLogo: '',
                                                                fiscalYearStart: '',
                                                                funnelStages: [],
                                                                taskTypes: ['Call', 'Meeting', 'Email'],
                                                                painPoints: [],
                                                                verticalMarkets: [],
                                                                fieldVisibility: {},
                                                                products: [],
                                                                pipelines: null,
                                                                teams: null,
                                                                territories: null,
                                                                verticals: null,
                                                                quotaData: null,
                                                                kpiConfig: null,
                                                                logoUrl: null,
                                                                aiScoringEnabled: false,
                                                            }),
                                                        }).catch(err => console.error('Settings reset failed:', err.message));
                                                    } catch(e) {
                                                        console.error('DB clear error:', e);
                                                    }
                                                    // Reload the page — cleanest way to reset all React state
                                                    window.location.reload();
                                                });
                                            });
                                        }}
                                        style={{ 
                                            background: '#ef4444', 
                                            padding: '0.75rem 1.5rem', 
                                            fontSize: '0.9rem'
                                        }}
                                    >
                                        🗑️ Clear All Data
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </>
                </div>
            
    );
}
