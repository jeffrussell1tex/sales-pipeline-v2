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
        settingsOpenPanel = null, setSettingsOpenPanel = () => {},
    } = useApp();

    return (
        <div className="tab-page" style={{ fontFamily:T.sans }}>
            {/* Page header */}
            <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', paddingBottom:16 }}>
                {/* The same title block every tab uses (Jeff, 14 Sep) — the serif title,
                    the caption line; the gold rule stays on the panel headings only. */}
                <div>
                    <div style={{ fontSize:28, fontFamily:T.serif, fontStyle:'italic', fontWeight:300, letterSpacing:-0.8, color:T.ink, lineHeight:1, marginBottom:5 }}>
                        Settings
                    </div>
                    <div style={{ fontSize:12, color:T.inkMuted, fontFamily:T.sans }}>
                        Workspace admin console · manage users, pipelines, security, and integrations
                    </div>
                </div>
            </div>

            {/* Settings is the workspace admin console. App.jsx gates it on isAdmin at
                both the nav button and the render, so the non-admin branch that used to
                live here was unreachable — as was the `canAdmin` split, since Managers
                cannot open the tab either. Personal preferences live behind the avatar
                menu for every user. */}
            <AdminView settings={settings} setSettings={setSettings} currentUser={currentUser} setActiveTab={setActiveTab} setAccountsDeepFilter={setAccountsDeepFilter} settingsDirty={settingsDirty} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}
                openPanelId={settingsOpenPanel} onOpenedPanel={() => setSettingsOpenPanel(null)}/>
        </div>
    );
}
