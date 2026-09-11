// settings/salesProcess/EmailTemplatesDetail.jsx — the org's email templates
// (state §0.122). Admins write them here; every rep picks one from a contact's
// ✉ Email button, which renders the merge fields for that contact and opens the
// rep's own mail client. Saved through the settings PUT like every other
// Sales-process list (settings.extra.emailTemplates, both halves).
import React, { useState, useEffect, useRef } from 'react';
import { T } from '../shared/tokens.js';
import { putSettings } from '../shared/saveSettings.js';
import { CSectionCard } from '../shared/form.jsx';
import { CategoryDetailChrome } from '../shared/CategoryDetailChrome.jsx';
import { MERGE_FIELDS, LIMITS, cleanEmailTemplates, mergeContext, renderForContact } from '../../../utils/emailTemplates.js';

const SAMPLE = mergeContext({
    contact: { firstName: 'Dana', lastName: 'Whitfield', company: 'Northwind Mechanical', title: 'Operations Manager' },
    rep:     { name: 'Your name', email: 'you@yourcompany.com', phone: '(555) 010-0100' },
    org:     { companyDisplayName: 'Your company' },
});

const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, color: T.ink, fontFamily: T.sans, outline: 'none' };

// One template's fields. Module scope, data as props — a sub-component defined
// inside the panel would remount on every keystroke and lose focus.
const TemplateEditor = ({ tpl, onChange, onDelete }) => {
    const bodyRef = useRef(null);
    const insert = (key) => {
        const el = bodyRef.current;
        const token = `{{${key}}}`;
        if (!el) { onChange({ body: (tpl.body || '') + token }); return; }
        const start = el.selectionStart ?? el.value.length, end = el.selectionEnd ?? el.value.length;
        const next = el.value.slice(0, start) + token + el.value.slice(end);
        onChange({ body: next });
        requestAnimationFrame(() => { try { el.focus(); el.setSelectionRange(start + token.length, start + token.length); } catch { /* focus is a courtesy */ } });
    };
    const preview = renderForContact(tpl, SAMPLE);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: T.inkMid }}>Template name
                <input value={tpl.name} maxLength={LIMITS.name} onChange={e => onChange({ name: e.target.value })} placeholder="e.g. Intro after a call" style={{ ...inputStyle, marginTop: 4 }}/>
            </label>
            <label style={{ fontSize: 12, fontWeight: 600, color: T.inkMid }}>Subject
                <input value={tpl.subject} maxLength={LIMITS.subject} onChange={e => onChange({ subject: e.target.value })} placeholder="e.g. Following up, {{firstName}}" style={{ ...inputStyle, marginTop: 4 }}/>
            </label>
            <label style={{ fontSize: 12, fontWeight: 600, color: T.inkMid }}>Body
                <textarea ref={bodyRef} value={tpl.body} maxLength={LIMITS.body} onChange={e => onChange({ body: e.target.value })} rows={9}
                    placeholder={'Hi {{firstName}},\n\nThanks for your time today…\n\n{{repName}}\n{{companyName}} · {{repPhone}}'}
                    style={{ ...inputStyle, marginTop: 4, resize: 'vertical', lineHeight: 1.45 }}/>
            </label>
            <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>Insert a merge field</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {MERGE_FIELDS.map(f => (
                        <button key={f.key} type="button" onClick={() => insert(f.key)} title={`Inserts {{${f.key}}} at the cursor`}
                            style={{ padding: '3px 9px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 999, fontSize: 11.5, color: T.ink, cursor: 'pointer', fontFamily: T.sans }}>
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>
            <div style={{ padding: '10px 12px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.r + 2 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>Preview · sample contact</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, marginBottom: 4 }}>{preview.subject || <span style={{ color: T.inkMuted }}>(no subject)</span>}</div>
                <div style={{ fontSize: 12.5, color: T.inkMid, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{preview.body || <span style={{ color: T.inkMuted }}>(empty body)</span>}</div>
            </div>
            <div>
                <button type="button" onClick={onDelete} style={{ background: 'none', border: 'none', color: T.danger, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans, padding: 0 }}>Delete this template</button>
            </div>
        </div>
    );
};

export const EmailTemplatesDetail = ({ settings, setSettings, onBack, setSettingsDirty, settingsSaveRef }) => {
    const saved = cleanEmailTemplates(settings?.emailTemplates);
    const [items, setItems]       = useState(() => saved.map(t => ({ ...t })));
    const [selId, setSelId]       = useState(() => saved[0]?.id || null);
    const [dirty, setDirty]       = useState(false);
    const [saving, setSaving]     = useState(false);
    const [saveError, setSaveError] = useState('');

    const handleSave = async () => {
        setSaving(true);
        const clean = cleanEmailTemplates(items);
        try {
            await putSettings({ emailTemplates: clean });
            setSettings(prev => ({ ...prev, emailTemplates: clean }));
            setItems(clean.map(t => ({ ...t })));
            setSaveError('');
            setDirty(false);
        } catch (e) {
            setSaveError(e.message);
            setSaving(false);
            throw e;
        }
        setSaving(false);
    };
    useEffect(() => { if (setSettingsDirty) setSettingsDirty(dirty); return () => { if (setSettingsDirty) setSettingsDirty(false); }; }, [dirty]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!settingsSaveRef) return;
        settingsSaveRef.current = dirty ? handleSave : null;
        return () => { if (settingsSaveRef) settingsSaveRef.current = null; };
    }, [dirty]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleCancel = () => { setItems(saved.map(t => ({ ...t }))); setSelId(saved[0]?.id || null); setDirty(false); };
    const addTemplate = () => {
        if (items.length >= LIMITS.count) return;
        const id = 'tpl_' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36));
        setItems(prev => [...prev, { id, name: 'New template', subject: '', body: '' }]);
        setSelId(id);
        setDirty(true);
    };
    const update = (id, patch) => { setItems(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t)); setDirty(true); };
    const remove = (id) => { setItems(prev => prev.filter(t => t.id !== id)); setSelId(prev => (prev === id ? null : prev)); setDirty(true); };
    const sel = items.find(t => t.id === selId) || null;
    const unnamed = items.filter(t => !t.name.trim()).length;

    return (
        <CategoryDetailChrome
            error={saveError}
            crumb="Email templates" title="Email templates"
            subtitle="Reusable emails reps send from a contact — pick one on the contact's ✉ Email button, the merge fields fill in, and it opens in the rep's own mail client."
            statusDetail={`${items.length} template${items.length === 1 ? '' : 's'}`}
            onBack={onBack} dirty={dirty} onCancel={handleCancel}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'} disablePrimary={unnamed > 0}
            rightActions={
                <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={handleCancel} style={{ padding: '7px 14px', background: T.surface, color: T.ink, border: `1px solid ${T.borderStrong}`, borderRadius: T.r, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>Cancel</button>
                    <button type="button" onClick={handleSave} disabled={saving || unnamed > 0} title={unnamed > 0 ? 'Every template needs a name' : undefined}
                        style={{ padding: '7px 14px', background: T.ink, color: '#fbf8f3', border: 'none', borderRadius: T.r, fontSize: 12.5, fontWeight: 600, cursor: saving || unnamed > 0 ? 'default' : 'pointer', opacity: unnamed > 0 ? 0.5 : 1, fontFamily: T.sans }}>{saving ? 'Saving…' : 'Save changes'}</button>
                </div>
            }>
            <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20 }}>
                <CSectionCard title={`Templates · ${items.length}`} description="Shared by everyone in the workspace.">
                    <button type="button" onClick={addTemplate} disabled={items.length >= LIMITS.count}
                        style={{ width: '100%', padding: '8px 12px', marginBottom: 12, background: T.ink, color: '#fbf8f3', border: 'none', borderRadius: T.r, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                        + New template
                    </button>
                    {items.length === 0 && (
                        <div style={{ padding: '18px 0', textAlign: 'center', color: T.inkMuted, fontSize: 13, fontStyle: 'italic', fontFamily: T.sans }}>No templates yet.</div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {items.map(t => (
                            <button key={t.id} type="button" onClick={() => setSelId(t.id)}
                                style={{ textAlign: 'left', padding: '9px 12px', background: t.id === selId ? T.ink : T.surface2, color: t.id === selId ? '#fbf8f3' : T.ink,
                                    border: `1px solid ${t.id === selId ? T.ink : T.border}`, borderRadius: T.r + 2, cursor: 'pointer', fontFamily: T.sans }}>
                                <div style={{ fontSize: 13, fontWeight: 600 }}>{t.name.trim() || <span style={{ opacity: 0.7 }}>Unnamed</span>}</div>
                                <div style={{ fontSize: 11.5, opacity: 0.75, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject || 'No subject'}</div>
                            </button>
                        ))}
                    </div>
                </CSectionCard>
                <CSectionCard title={sel ? sel.name.trim() || 'Unnamed template' : 'Select a template'} description={sel ? 'Merge fields are replaced for the contact the rep is emailing.' : 'Pick one on the left, or add a new one.'}>
                    {sel ? <TemplateEditor tpl={sel} onChange={patch => update(sel.id, patch)} onDelete={() => remove(sel.id)}/> : null}
                </CSectionCard>
            </div>
        </CategoryDetailChrome>
    );
};
