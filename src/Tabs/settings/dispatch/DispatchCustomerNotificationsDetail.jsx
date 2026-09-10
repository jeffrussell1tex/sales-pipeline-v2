// settings/dispatch/DispatchCustomerNotificationsDetail.jsx
//
// What a dispatch customer is told, and when (state §0.111). THE COMPANY
// DECIDES: these switches gate every customer-facing send for this org. Off by
// default — a new workspace never emails a customer until an Admin turns it on
// here. The shape is customerNotifications.js's; the same module decides on
// the server, so what this panel shows is exactly what the jobs function does.
import React, { useState } from 'react';
import { T } from '../shared/tokens.js';
import { putSettings } from '../shared/saveSettings.js';
import { CSectionCard } from '../shared/form.jsx';
import { CategoryDetailChrome } from '../shared/CategoryDetailChrome.jsx';
import { cleanCustomerNotifications } from '../../../utils/customerNotifications.js';

const Switch = ({ on, onChange, disabled }) => (
    <button type="button" onClick={() => !disabled && onChange(!on)} disabled={disabled}
        aria-pressed={on}
        style={{ padding: '5px 12px', minWidth: 76, background: on ? T.ink : T.surface, color: on ? '#fbf8f3' : T.inkMid,
            border: `1px solid ${on ? T.ink : T.borderStrong}`, borderRadius: T.r, fontSize: 12, fontWeight: 600,
            cursor: disabled ? 'default' : 'pointer', fontFamily: T.sans, opacity: disabled ? 0.5 : 1 }}>
        {on ? 'On' : 'Off'}
    </button>
);

const Row = ({ label, hint, on, onChange, disabled }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', borderTop: `1px solid ${T.border}` }}>
        <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, fontFamily: T.sans }}>{label}</div>
            {hint && <div style={{ fontSize: 11.5, color: T.inkMuted, fontFamily: T.sans, marginTop: 2 }}>{hint}</div>}
        </div>
        <Switch on={on} onChange={onChange} disabled={disabled}/>
    </div>
);

export const DispatchCustomerNotificationsDetail = ({ settings, setSettings, onBack, setSettingsDirty, settingsSaveRef }) => {
    const saved = cleanCustomerNotifications(settings?.customerNotifications);
    const [cfg, setCfg] = useState(saved);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');

    const set = (k, v) => { setCfg(prev => ({ ...prev, [k]: v })); setDirty(true); };

    const handleSave = async () => {
        setSaving(true);
        const payload = { customerNotifications: cleanCustomerNotifications(cfg) };
        setSettings(prev => ({ ...prev, ...payload }));
        try {
            await putSettings(payload);   // throws on non-2xx
            setSaveError('');
            setDirty(false);
        } catch (e) {
            setSaveError(e.message);
            setSaving(false);
            throw e;
        }
        setSaving(false);
    };

    React.useEffect(() => { if (setSettingsDirty) setSettingsDirty(dirty); return () => { if (setSettingsDirty) setSettingsDirty(false); }; }, [dirty]);
    React.useEffect(() => {
        if (!settingsSaveRef) return;
        settingsSaveRef.current = dirty ? handleSave : null;
        return () => { if (settingsSaveRef) settingsSaveRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dirty]);

    const off = !cfg.enabled;

    return (
        <CategoryDetailChrome error={saveError} crumb="Customer notifications" category="Dispatch" title="Customer notifications"
            subtitle="What your service customers are told, and when. Off until you turn it on."
            onBack={onBack} dirty={dirty}
            onCancel={() => { setCfg(saved); setDirty(false); }}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}>

            <CSectionCard title="Send customer notifications" description="The master switch for this workspace. While it is off, nothing below sends and no status link is issued.">
                <Row label="Customer notifications" hint="Emails go to the customer's contact email on their record; texts to their contact phone."
                    on={cfg.enabled} onChange={v => set('enabled', v)}/>
            </CSectionCard>

            <CSectionCard title="Appointment confirmation" description="Sent when a job is scheduled with a date, and again if the date or time changes.">
                <Row label="By email" on={cfg.confirmationEmail} onChange={v => set('confirmationEmail', v)} disabled={off}/>
                <Row label="By text message" hint="Sends only once Twilio is configured on this site; until then the job's notification trail records why it did not."
                    on={cfg.confirmationSms} onChange={v => set('confirmationSms', v)} disabled={off}/>
            </CSectionCard>

            <CSectionCard title="Technician on the way" description="Sent when a job's status becomes En route — from the board or from the technician's own update.">
                <Row label="By email" on={cfg.onTheWayEmail} onChange={v => set('onTheWayEmail', v)} disabled={off}/>
                <Row label="By text message" on={cfg.onTheWaySms} onChange={v => set('onTheWaySms', v)} disabled={off}/>
            </CSectionCard>

            <CSectionCard title="Job-status link" description="A private link in each message where the customer can see the visit's status, date, technician and address. The link is an unguessable code, not a job number, and shows nothing else.">
                <Row label="Include the status link" on={cfg.statusLink} onChange={v => set('statusLink', v)} disabled={off}/>
            </CSectionCard>

            <div style={{ fontSize: 11.5, color: T.inkMuted, fontFamily: T.sans, marginTop: 8 }}>
                Every send — and every reason one did not go — is recorded on the job under Customer notifications in Dispatch.
            </div>
        </CategoryDetailChrome>
    );
};
