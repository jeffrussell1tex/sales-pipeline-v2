import React, { useState } from 'react';
import { useApp } from '../../AppContext';
import { useDraggable } from '../../hooks/useDraggable';

export default function UserModal({ user, settings: settingsProp, onClose, onSave, errorMessage, onDismissError, saving }) {
    // Always use context settings to ensure territories/teams/verticals are current
    const { settings: contextSettings } = useApp();
    const settings = contextSettings || settingsProp;
    const [formData, setFormData] = useState(user || {
        prefix: '', firstName: '', middleName: '', lastName: '', suffix: '', nickName: '',
        name: '', title: '', company: '', department: '', workLocation: '',
        email: '', personalEmail: '', phone: '', mobile: '',
        role: '', userType: 'User',
        address: '', city: '', state: '', zip: '', country: '',
        homeAddress: '', notes: ''
    });
    const [activeUserTab, setActiveUserTab] = useState('primary');
    const { dragHandleProps, dragOffsetStyle } = useDraggable();

    // Auto-switch to the tab containing the email field when an error arrives
    React.useEffect(() => {
        if (errorMessage) setActiveUserTab('primary');
    }, [errorMessage]);

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (field === 'firstName' || field === 'lastName') {
            const fn = field === 'firstName' ? value : formData.firstName;
            const ln = field === 'lastName' ? value : formData.lastName;
            setFormData(prev => ({ ...prev, [field]: value, name: (fn + ' ' + ln).trim() }));
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const name = (formData.firstName + ' ' + formData.lastName).trim() || formData.name;
        onSave({ ...formData, name });
    };

    const tabBtnStyle = (active) => ({
        padding: '0.625rem 1.5rem', borderRadius: '4px', border: 'none', cursor: 'pointer',
        fontWeight: '700', fontSize: '0.8125rem', fontFamily: 'inherit', transition: 'all 0.2s',
        background: active ? '#ffffff' : 'transparent', color: active ? '#1e293b' : '#64748b',
        boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
    });

    return (
        <>
        {errorMessage && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}
                 onClick={e => e.stopPropagation()}>
                <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: '2rem', maxWidth: '420px', width: '90%', textAlign: 'center' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '1.5rem' }}>⚠️</div>
                    <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.0625rem', fontWeight: '700', color: '#1e293b' }}>Failed to Save User</h3>
                    <p style={{ margin: '0 0 1.5rem', fontSize: '0.875rem', color: '#64748b', lineHeight: 1.6 }}>{errorMessage}</p>
                    <button
                        onClick={onDismissError}
                        style={{ padding: '0.5rem 1.5rem', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#1e293b', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                        Fix Email
                    </button>
                </div>
            </div>
        )}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div className="modal-overlay">
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '650px', ...dragOffsetStyle }}>
                <h2 {...dragHandleProps}>{user ? 'Edit User' : 'New User'}</h2>

                <div style={{ display: 'flex', background: '#f1f3f5', borderRadius: '6px', padding: '3px', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '2px' }}>
                    <button type="button" onClick={() => setActiveUserTab('primary')} style={tabBtnStyle(activeUserTab === 'primary')}>Primary Info</button>
                    <button type="button" onClick={() => setActiveUserTab('role')} style={tabBtnStyle(activeUserTab === 'role')}>Role &amp; Access</button>
                    <button type="button" onClick={() => setActiveUserTab('additional')} style={tabBtnStyle(activeUserTab === 'additional')}>Additional Info</button>
                </div>

                <form onSubmit={handleSubmit}>
                    {activeUserTab === 'primary' && (
                    <div className="form-grid">
                        {errorMessage && (
                            <div style={{ gridColumn: '1 / -1', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '0.625rem 0.875rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                                <span style={{ fontSize: '1rem', flexShrink: 0 }}>⚠️</span>
                                <span style={{ fontSize: '0.8125rem', color: '#b91c1c', lineHeight: 1.5 }}>{errorMessage}</span>
                            </div>
                        )}
                        <div className="form-group" style={{ gridColumn: 'span 1' }}>
                            <label>Prefix</label>
                            <select value={formData.prefix || ''} onChange={e => handleChange('prefix', e.target.value)}>
                                <option value="">—</option>
                                <option value="Mr.">Mr.</option><option value="Mrs.">Mrs.</option><option value="Ms.">Ms.</option><option value="Dr.">Dr.</option><option value="Prof.">Prof.</option>
                            </select>
                        </div>
                        <div className="form-group"><label>First Name*</label><input type="text" value={formData.firstName || ''} onChange={e => handleChange('firstName', e.target.value)} required /></div>
                        <div className="form-group"><label>Middle Name</label><input type="text" value={formData.middleName || ''} onChange={e => handleChange('middleName', e.target.value)} /></div>
                        <div className="form-group"><label>Last Name*</label><input type="text" value={formData.lastName || ''} onChange={e => handleChange('lastName', e.target.value)} required /></div>
                        <div className="form-group"><label>Suffix</label><input type="text" value={formData.suffix || ''} onChange={e => handleChange('suffix', e.target.value)} /></div>
                        <div className="form-group"><label>Nick Name</label><input type="text" value={formData.nickName || ''} onChange={e => handleChange('nickName', e.target.value)} /></div>
                        <div className="form-group"><label>Title</label><input type="text" value={formData.title || ''} onChange={e => handleChange('title', e.target.value)} /></div>
                        <div className="form-group"><label>Company</label><input type="text" value={formData.company || ''} onChange={e => handleChange('company', e.target.value)} /></div>
                        <div className="form-group"><label>Department</label><input type="text" value={formData.department || ''} onChange={e => handleChange('department', e.target.value)} /></div>
                        <div className="form-group"><label>Work Location</label><input type="text" value={formData.workLocation || ''} onChange={e => handleChange('workLocation', e.target.value)} /></div>
                        <div className="form-group"><label>Work Email</label><input type="email" value={formData.email || ''} onChange={e => handleChange('email', e.target.value)} style={errorMessage ? { borderColor: '#f87171', background: '#fff5f5' } : {}} /></div>
                        <div className="form-group"><label>Personal Email</label><input type="email" value={formData.personalEmail || ''} onChange={e => handleChange('personalEmail', e.target.value)} /></div>
                        <div className="form-group"><label>Work Phone</label><input type="tel" value={formData.phone || ''} onChange={e => handleChange('phone', e.target.value)} /></div>
                        <div className="form-group"><label>Mobile</label><input type="tel" value={formData.mobile || ''} onChange={e => handleChange('mobile', e.target.value)} /></div>
                        <div className="form-group"><label>Territory</label>
                            <div style={{ padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#f8fafc', fontSize: '0.875rem', color: formData.territory ? '#1e293b' : '#94a3b8', minHeight: '36px', display: 'flex', alignItems: 'center' }}>
                                {formData.territory ? `📍 ${formData.territory}` : 'Assigned via Team Builder'}
                            </div>
                        </div>
                        <div className="form-group"><label>Team</label>
                            <div style={{ padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#f8fafc', fontSize: '0.875rem', color: formData.team ? '#1e293b' : '#94a3b8', minHeight: '36px', display: 'flex', alignItems: 'center' }}>
                                {formData.team ? `👥 ${formData.team}` : 'Assigned via Team Builder'}
                            </div>
                        </div>
                        <div className="form-group"><label>Vertical</label>
                            <div style={{ padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#f8fafc', fontSize: '0.875rem', color: formData.vertical ? '#1e293b' : '#94a3b8', minHeight: '36px', display: 'flex', alignItems: 'center' }}>
                                {formData.vertical ? `🏭 ${formData.vertical}` : 'Assigned via Team Builder'}
                            </div>
                        </div>
                    </div>
                    )}

                    {activeUserTab === 'role' && (
                    <div style={{ maxWidth: '480px' }}>
                        <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                <span style={{ fontSize: '1.125rem' }}>🔑</span>
                                <span style={{ fontWeight: '700', fontSize: '0.875rem', color: '#1e293b' }}>Role &amp; Access Level</span>
                            </div>
                            <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '0 0 1rem', lineHeight: 1.5 }}>
                                Set the user's role to control what they can see and do in the app. Login credentials are managed through Clerk — users receive an invitation email to set their own password.
                            </p>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>User Type / Role*</label>
                                <select value={formData.userType || 'User'} onChange={e => setFormData(prev => ({ ...prev, userType: e.target.value }))} required>
                                    <option value="Admin">Admin — Full access, manage settings &amp; users</option>
                                    <option value="Manager">Manager — View all data, edit &amp; delete</option>
                                    <option value="User">Sales Rep — Own data only, create &amp; edit</option>
                                    <option value="ReadOnly">Read-Only — View only, no changes</option>
                                </select>
                            </div>
                        </div>
                        <div style={{ padding: '0.875rem 1rem', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', fontSize: '0.75rem', color: '#1e40af', lineHeight: 1.6 }}>
                            <strong>How login works:</strong> Users sign in via Clerk using their email address. Create their profile here to assign their role and team, then invite them from the Clerk dashboard so they can set their password and access the app.
                        </div>
                    </div>
                    )}

                    {activeUserTab === 'additional' && (
                    <div className="form-grid">
                        <div style={{ gridColumn: '1 / -1', fontWeight: '700', fontSize: '0.8125rem', color: '#1e293b', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.375rem', marginBottom: '0.25rem' }}>Home Address</div>
                        <div className="form-group full"><label>Street Address</label><input type="text" value={formData.address || ''} onChange={e => handleChange('address', e.target.value)} /></div>
                        <div className="form-group"><label>City</label><input type="text" value={formData.city || ''} onChange={e => handleChange('city', e.target.value)} /></div>
                        <div className="form-group"><label>State</label><input type="text" value={formData.state || ''} onChange={e => handleChange('state', e.target.value)} /></div>
                        <div className="form-group"><label>ZIP Code</label><input type="text" value={formData.zip || ''} onChange={e => handleChange('zip', e.target.value)} /></div>
                        <div className="form-group"><label>Country</label><input type="text" value={formData.country || ''} onChange={e => handleChange('country', e.target.value)} /></div>
                        <div className="form-group full"><label>Notes</label>
                            <textarea value={formData.notes || ''} onChange={e => handleChange('notes', e.target.value)}
                                rows="4" style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.875rem', fontFamily: 'inherit', resize: 'vertical' }} />
                        </div>
                    </div>
                    )}

                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
                        <button type="submit" className="btn" disabled={saving} style={{ opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {saving && <span style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />}
                            {saving ? 'Saving…' : (user ? 'Update' : 'Create')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
        </>
    );
}