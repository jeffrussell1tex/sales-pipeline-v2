import React from 'react';
import { useApp } from '../AppContext';
import { T } from './settings/shared/tokens.js';
import { AdminView } from './AdminView.jsx';

export default function SettingsTab() {
    const {
        settings, setSettings,
        currentUser,
        setActiveTab, setAccountsDeepFilter,
        settingsDirty = false,
        setSettingsDirty = () => {}, settingsSaveRef = { current: null },
    } = useApp();

    return (
        <div className="tab-page" style={{ fontFamily:T.sans }}>
            {/* Page header */}
            <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', paddingBottom:16 }}>
                <div style={{ borderLeft:`3px solid ${T.goldInk}`, paddingLeft:10 }}>
                    <div style={{ fontSize:26, fontWeight:700, color:T.ink, letterSpacing:-0.3, fontFamily:T.sans }}>
                        Settings
                    </div>
                    <div style={{ fontSize:13, color:T.inkMid, marginTop:4, fontFamily:T.sans }}>
                        Workspace admin console · manage users, pipelines, security, and integrations
                    </div>
                </div>
            </div>

            {/* Settings is the workspace admin console. App.jsx gates it on isAdmin at
                both the nav button and the render, so the non-admin branch that used to
                live here was unreachable — as was the `canAdmin` split, since Managers
                cannot open the tab either. Personal preferences live behind the avatar
                menu for every user. */}
            <AdminView settings={settings} setSettings={setSettings} currentUser={currentUser} setActiveTab={setActiveTab} setAccountsDeepFilter={setAccountsDeepFilter} settingsDirty={settingsDirty} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>
        </div>
    );
}
