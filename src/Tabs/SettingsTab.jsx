import React from 'react';
import { useApp } from '../AppContext';
import { T } from './settings/shared/tokens.js';
import { AdminView } from './AdminView.jsx';
import { PersonalView } from './PersonalView.jsx';

export default function SettingsTab() {
    const {
        settings, setSettings,
        currentUser, userRole,
        setActiveTab, setAccountsDeepFilter,
        setSettingsDirty = () => {}, settingsSaveRef = { current: null },
    } = useApp();

    const isAdmin   = userRole === 'Admin';
    const isManager = userRole === 'Manager';
    const canAdmin  = isAdmin || isManager;

    return (
        <div className="tab-page" style={{ fontFamily:T.sans }}>
            {/* Page header */}
            <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', paddingBottom:16 }}>
                <div style={{ borderLeft:`3px solid ${T.goldInk}`, paddingLeft:10 }}>
                    <div style={{ fontSize:26, fontWeight:700, color:T.ink, letterSpacing:-0.3, fontFamily:T.sans }}>
                        {canAdmin ? 'Settings' : 'My account'}
                    </div>
                    <div style={{ fontSize:13, color:T.inkMid, marginTop:4, fontFamily:T.sans }}>
                        {canAdmin
                            ? 'Workspace admin console · manage users, pipelines, security, and integrations'
                            : 'Your personal preferences · not shared with your team'}
                    </div>
                </div>
            </div>

            {/* Body — role-gated */}
            {canAdmin ? (
                <AdminView settings={settings} setSettings={setSettings} currentUser={currentUser} setActiveTab={setActiveTab} setAccountsDeepFilter={setAccountsDeepFilter} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>
            ) : (
                <PersonalView settings={settings} setSettings={setSettings} currentUser={currentUser} isAdmin={false}/>
            )}
        </div>
    );
}
