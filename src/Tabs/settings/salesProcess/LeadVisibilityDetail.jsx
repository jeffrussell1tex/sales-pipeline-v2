// settings/salesProcess/LeadVisibilityDetail.jsx
//
// Two org-wide switches: may sales reps see unassigned LEADS, and unassigned DEALS?
//
// The values live at settings.extra.unassignedLeadsVisibleToReps and
// settings.extra.unassignedDealsVisibleToReps (18b12: each key exists in BOTH
// halves of settings.mjs, and tests/ownership-registry asserts the pairs). The
// consumers are the leads.mjs and opportunities.mjs GETs — READ policy enforced
// by the server, not a client filter. The two default differently: an absent
// leads key reads as visible (the standing policy since 31 Aug), an absent deals
// key as hidden (§0.151 — Jeff: "Reps should only see their own deals"). Write
// policy is deliberately unchanged: an unassigned record stays mutable by any
// writer whether or not it is visible here, because visibility and authorization
// are different rules and conflating them is how 18b20-shaped bugs start.
import React, { useState, useEffect } from 'react';
import { putSettings } from '../shared/saveSettings.js';
import { T } from '../shared/tokens.js';
import { CSectionCard } from '../shared/form.jsx';
import { CategoryDetailChrome } from '../shared/CategoryDetailChrome.jsx';

// One switch, one card — module scope, data as props (never defined inside the panel).
const VisibilityCard = ({ noun, visible, onChange, pooled, routed }) => (
    <CSectionCard
        title={`Unassigned ${noun}`}
        description={`Choose whether ${noun} with no owner appear in your sales reps' lists. Admins, Managers and Dispatchers always see every one either way.`}
    >
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={visible} onChange={e => onChange(e.target.checked)} />
            <span style={{ fontSize: 13, fontWeight: 600, color: T.ink, fontFamily: T.sans }}>
                Unassigned {noun} are {visible ? 'visible to' : 'hidden from'} sales reps
            </span>
        </label>

        <div style={{ marginTop: 14, padding: '10px 12px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 12, color: T.inkMid, lineHeight: 1.6, fontFamily: T.sans }}>
            {visible ? pooled : routed}
        </div>
    </CSectionCard>
);

export const LeadVisibilityDetail = ({ settings, setSettings, onBack }) => {
    // Absent keys = the server's defaults, so what this panel shows on first open
    // is what the server is doing: leads visible, deals hidden.
    const seed = () => ({
        leads: settings?.unassignedLeadsVisibleToReps ?? true,
        deals: settings?.unassignedDealsVisibleToReps ?? false,
    });
    const [vis, setVis]         = useState(seed);
    const [saved, setSaved]     = useState(seed);
    const [dirty, setDirty]     = useState(false);
    const [saving, setSaving]   = useState(false);
    const [saveError, setSaveError] = useState('');

    useEffect(() => { const s = seed(); setVis(s); setSaved(s); setDirty(false); /* eslint-disable-next-line */ }, [settings?.unassignedLeadsVisibleToReps, settings?.unassignedDealsVisibleToReps]);

    const setOne = (key, value) => { setVis(v => ({ ...v, [key]: value })); setDirty(true); };
    const handleCancel = () => { setVis(saved); setDirty(false); };
    const handleSave   = async () => {
        setSaving(true);
        // Snapshot-revert on failure (guide 18b1): dbFetch resolves for ANY
        // status, so without the revert a 403 would clear the dirty flag and
        // leave the panel looking saved while the server kept the old policy.
        const patch = { unassignedLeadsVisibleToReps: vis.leads, unassignedDealsVisibleToReps: vis.deals };
        let snapshot;
        setSettings(prev => { snapshot = prev; return { ...prev, ...patch }; });
        setSaveError('');
        try {
            await putSettings(patch);
            setSaved(vis);
            setDirty(false);
        } catch (e) {
            setSettings(snapshot);
            setSaveError(`Visibility not saved — ${e.message}`);
        }
        setSaving(false);
    };

    return (
        <CategoryDetailChrome
            error={saveError}
            crumb="Lead & deal visibility" category="Sales process" title="Lead & deal visibility"
            subtitle="Whether sales reps can see unassigned leads and deals. Enforced by the server on every load."
            onBack={onBack} dirty={dirty} onCancel={handleCancel}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
        >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20 }}>
                <VisibilityCard
                    noun="leads" visible={vis.leads} onChange={v => setOne('leads', v)}
                    pooled={<>Reps see their own leads plus any lead nobody owns — the shared pool model, where anyone can pick up unowned work. This is the default for leads.</>}
                    routed={<>Reps see only leads assigned to them. Unassigned leads are visible to Admins, Managers and Dispatchers alone until someone assigns them — the routed model, where distribution happens before a rep ever sees a lead.</>}
                />
                <VisibilityCard
                    noun="deals" visible={vis.deals} onChange={v => setOne('deals', v)}
                    pooled={<>Reps see their own deals plus any deal nobody owns — the shared pool model.</>}
                    routed={<>Reps see only deals assigned to them — the default for deals. Unassigned deals are visible to Admins, Managers and Dispatchers until someone assigns them.</>}
                />

                <div style={{ fontSize: 11.5, color: T.inkMuted, lineHeight: 1.6, fontFamily: T.sans }}>
                    This is visibility, not permission: an unassigned lead or deal can still be edited
                    by any writer who reaches it (for example through an import or the API).
                    The Mine/All control on the Leads tab is each user's personal filter on top
                    of whatever this policy lets them see.
                </div>
            </div>
        </CategoryDetailChrome>
    );
};
