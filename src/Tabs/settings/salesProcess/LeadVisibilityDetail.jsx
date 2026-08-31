// settings/salesProcess/LeadVisibilityDetail.jsx
//
// One org-wide switch: may sales reps see unassigned leads?
//
// The value lives at settings.extra.unassignedLeadsVisibleToReps (18b12: the
// key exists in BOTH halves of settings.mjs, and tests/ownership-registry
// asserts the pair). The consumer is the leads.mjs GET — this is READ policy
// enforced by the server, not a client filter. Write policy is deliberately
// unchanged: an unassigned lead stays mutable by any writer whether or not it
// is visible here, because visibility and authorization are different rules
// and conflating them is how 18b20-shaped bugs start.
import React, { useState, useEffect } from 'react';
import { putSettings } from '../shared/saveSettings.js';
import { T } from '../shared/tokens.js';
import { CSectionCard } from '../shared/form.jsx';
import { CategoryDetailChrome } from '../shared/CategoryDetailChrome.jsx';

export const LeadVisibilityDetail = ({ settings, setSettings, onBack }) => {
    // Absent key = the standing policy (visible). Same default the server uses,
    // so what this panel shows on first open is what the server is doing.
    const seed = () => settings?.unassignedLeadsVisibleToReps ?? true;
    const [visible, setVisible] = useState(seed);
    const [saved, setSaved]     = useState(seed);
    const [dirty, setDirty]     = useState(false);
    const [saving, setSaving]   = useState(false);
    const [saveError, setSaveError] = useState('');

    useEffect(() => { const s = seed(); setVisible(s); setSaved(s); setDirty(false); /* eslint-disable-next-line */ }, [settings?.unassignedLeadsVisibleToReps]);

    const handleCancel = () => { setVisible(saved); setDirty(false); };
    const handleSave   = async () => {
        setSaving(true);
        // Snapshot-revert on failure (guide 18b1): dbFetch resolves for ANY
        // status, so without the revert a 403 would clear the dirty flag and
        // leave the panel looking saved while the server kept the old policy.
        let snapshot;
        setSettings(prev => { snapshot = prev; return { ...prev, unassignedLeadsVisibleToReps: visible }; });
        setSaveError('');
        try {
            await putSettings({ unassignedLeadsVisibleToReps: visible });
            setSaved(visible);
            setDirty(false);
        } catch (e) {
            setSettings(snapshot);
            setSaveError(`Lead visibility not saved — ${e.message}`);
        }
        setSaving(false);
    };

    return (
        <CategoryDetailChrome
            error={saveError}
            crumb="Lead visibility" category="Sales process" title="Lead visibility"
            subtitle="Whether sales reps can see unassigned leads. Enforced by the server on every load."
            onBack={onBack} dirty={dirty} onCancel={handleCancel}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
        >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20 }}>
                <CSectionCard
                    title="Unassigned leads"
                    description="Choose whether leads with no owner appear in your sales reps' lead lists. Admins and Managers always see every lead either way."
                >
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                        <input type="checkbox" checked={visible} onChange={e => { setVisible(e.target.checked); setDirty(true); }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: T.ink, fontFamily: T.sans }}>
                            Unassigned leads are {visible ? 'visible to' : 'hidden from'} sales reps
                        </span>
                    </label>

                    <div style={{ marginTop: 14, padding: '10px 12px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 12, color: T.inkMid, lineHeight: 1.6, fontFamily: T.sans }}>
                        {visible ? (
                            <>Reps see their own leads plus any lead nobody owns — the shared pool
                            model, where anyone can pick up unowned work. This is the default.</>
                        ) : (
                            <>Reps see only leads assigned to them. Unassigned leads are visible to
                            Admins and Managers alone until someone assigns them — the routed model,
                            where distribution happens before a rep ever sees a lead.</>
                        )}
                    </div>

                    <div style={{ marginTop: 10, fontSize: 11.5, color: T.inkMuted, lineHeight: 1.6, fontFamily: T.sans }}>
                        This is visibility, not permission: an unassigned lead can still be edited
                        by any writer who reaches it (for example through an import or the API).
                        The Mine/All control on the Leads tab is each user's personal filter on top
                        of whatever this policy lets them see.
                    </div>
                </CSectionCard>
            </div>
        </CategoryDetailChrome>
    );
};
