import React from 'react';
import { useApp } from '../AppContext';
import { T } from './settings/shared/tokens.js';
import { AdminView } from './AdminView.jsx';

// What Settings shows until the ACTIVE org's settings are in state (state
// §0.162). A panel copies the settings it is handed when it opens, and its Save
// writes with the active org's token — so no panel opens on anything else: not
// the previous org's settings after the header's switcher changes the org, not
// the defaults after a failed load.
function SettingsNotLoaded({ failed }) {
    return (
        <div style={{ padding:'20px 22px', border:`1px solid ${T.border}`, borderRadius:T.rLg, background:T.surface, fontFamily:T.sans }}>
            <div style={{ fontSize:13, fontWeight:600, color:T.ink }}>
                {failed ? "This organization's settings did not load." : "Loading this organization's settings…"}
            </div>
            {failed && (
                <div style={{ fontSize:12, color:T.inkMuted, marginTop:4 }}>
                    Nothing here can be changed until they load. Reload the page to try again.
                </div>
            )}
        </div>
    );
}

export default function SettingsTab() {
    const {
        settings, setSettings,
        currentUser,
        setActiveTab, setAccountsDeepFilter,
        settingsDirty = false,
        setSettingsDirty = () => {}, settingsSaveRef = { current: null },
        settingsOpenPanel = null, setSettingsOpenPanel = () => {},
        activeOrgId = null,
        settingsOrgId = null, settingsLoadError = '',
    } = useApp();
    // Open only on the active org's own settings; rebuilt from scratch for each
    // org (the key), so no panel, form or open item carries across a switch.
    const loaded = !!activeOrgId && settingsOrgId === activeOrgId;

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
            {loaded
                ? <AdminView key={activeOrgId} activeOrgId={activeOrgId} settings={settings} setSettings={setSettings} currentUser={currentUser} setActiveTab={setActiveTab} setAccountsDeepFilter={setAccountsDeepFilter} settingsDirty={settingsDirty} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}
                    openPanelId={settingsOpenPanel} onOpenedPanel={() => setSettingsOpenPanel(null)}/>
                : <SettingsNotLoaded failed={!!settingsLoadError}/>}
        </div>
    );
}
