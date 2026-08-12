// settings/company/CompanyProfileDetail.jsx
import React, { useState, useEffect } from 'react';
import { dbFetch } from '../../../utils/storage';
import { putSettings } from '../shared/saveSettings.js';
import { T } from '../shared/tokens.js';
import { CField, CInput, CTextarea, CSelect, CSectionCard, DetailPageChrome } from '../shared/form.jsx';

export const CompanyProfileDetail = ({ settings, setSettings, onBack, setSettingsDirty, settingsSaveRef }) => {
    const saved = {
        displayName:   settings?.companyDisplayName  || settings?.companyName || '',
        legalName:     settings?.companyLegalName    || '',
        brandColor:    settings?.companyBrandColor   || T.goldInk,
        address:       settings?.companyAddress      || '',
        city:          settings?.companyCity         || '',
        state:         settings?.companyState        || '',
        zip:           settings?.companyZip          || '',
        country:       settings?.companyCountry      || 'United States',
        phone:         settings?.companyPhone        || '',
        supportEmail:  settings?.companySupportEmail || '',
        quoteHeader:   settings?.quoteHeader         || '',
    };
    const [form, setForm]   = useState({ ...saved });
    const [dirty, setDirty] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [saving, setSaving] = useState(false);

    const set = (k, v) => { setForm(p => ({ ...p, [k]: v })); setDirty(true); };
    const handleCancel = () => { setForm({ ...saved }); setDirty(false); };
    const handleSave = async () => {
        setSaving(true);
        setSettings(prev => ({ ...prev,
            companyDisplayName:  form.displayName,
            companyLegalName:    form.legalName,
            companyBrandColor:   form.brandColor,
            companyAddress:      form.address,
            companyCity:         form.city,
            companyState:        form.state,
            companyZip:          form.zip,
            companyCountry:      form.country,
            companyPhone:        form.phone,
            companySupportEmail: form.supportEmail,
            quoteHeader:         form.quoteHeader,
        }));
        try {
            // Was a bare dbFetch with no res.ok check, then setDirty(false) OUTSIDE
            // the try — a 403 cleared the flag and looked like a successful save.
            await putSettings({
                companyDisplayName:  form.displayName,
                companyLegalName:    form.legalName,
                companyBrandColor:   form.brandColor,
                companyAddress:      form.address,
                companyCity:         form.city,
                companyState:        form.state,
                companyZip:          form.zip,
                companyCountry:      form.country,
                companyPhone:        form.phone,
                companySupportEmail: form.supportEmail,
                quoteHeader:         form.quoteHeader,
            });
            setSaveError('');
            setDirty(false);
        } catch (e) {
            setSaveError(e.message);
            setSaving(false);
            throw e;
        }
        setSaving(false);
    };
    // Sync dirty state to app-level nav guard
    React.useEffect(() => { if (setSettingsDirty) setSettingsDirty(dirty); return () => { if (setSettingsDirty) setSettingsDirty(false); }; }, [dirty]);
    React.useEffect(() => {
        if (!settingsSaveRef) return;
        settingsSaveRef.current = dirty ? handleSave : null;
        return () => { if (settingsSaveRef) settingsSaveRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dirty]);

    const COUNTRIES = ['United States','Canada','United Kingdom','Australia','Germany','France','Other'].map(c => ({ value:c, label:c }));

    return (
        <DetailPageChrome
            error={saveError}
            crumb="Company profile" title="Company profile"
            subtitle="Logo, address, phone, and default quote header"
            statusDetail="Complete" updatedBy={settings?.updatedBy || 'Admin'} updatedAt="2 months ago"
            onBack={onBack} dirty={dirty} onCancel={handleCancel}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
        >
            <div style={{ display:'grid', gridTemplateColumns:'1fr 420px', gap:20 }}>
                {/* LEFT */}
                <div>
                    <CSectionCard title="Brand" description="Your logo appears on quote PDFs, shared report exports, and in the workspace header for every user.">
                        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                            <CField label="Brand color" hint="Used as the accent on quote PDFs and report headers.">
                                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                    <input type="color" value={form.brandColor} onChange={e => set('brandColor', e.target.value)}
                                        style={{ width:34, height:34, padding:2, border:`1px solid ${T.border}`, borderRadius:T.r, cursor:'pointer', background:'none' }}/>
                                    <CInput value={form.brandColor} onChange={v => set('brandColor', v)} mono/>
                                </div>
                            </CField>
                            <CField label="Display name" hint="Appears in the top nav and on all exported documents.">
                                <CInput value={form.displayName} onChange={v => set('displayName', v)} placeholder="Your company name"/>
                            </CField>
                            <CField label="Legal name" hint="Full legal entity name for contracts and invoices.">
                                <CInput value={form.legalName} onChange={v => set('legalName', v)} placeholder="Legal entity name"/>
                            </CField>
                        </div>
                    </CSectionCard>

                    <CSectionCard title="Address & contact" description="The registered office address shown on quotes. For multi-location, set up locations under Sales process → Territories.">
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                            <div style={{ gridColumn:'1 / 3' }}>
                                <CField label="Street address"><CInput value={form.address} onChange={v => set('address', v)} placeholder="123 Main St, Suite 100"/></CField>
                            </div>
                            <CField label="City"><CInput value={form.city} onChange={v => set('city', v)}/></CField>
                            <CField label="State / Region"><CInput value={form.state} onChange={v => set('state', v)}/></CField>
                            <CField label="ZIP / Postal code"><CInput value={form.zip} onChange={v => set('zip', v)}/></CField>
                            <CField label="Country"><CSelect value={form.country} onChange={v => set('country', v)} options={COUNTRIES}/></CField>
                            <CField label="Main phone"><CInput value={form.phone} onChange={v => set('phone', v)} placeholder="+1 (555) 000-0000"/></CField>
                            <CField label="Support email"><CInput value={form.supportEmail} onChange={v => set('supportEmail', v)} placeholder="support@yourcompany.com"/></CField>
                        </div>
                    </CSectionCard>

                    <CSectionCard
                        title="Default quote header"
                        description="This block prints at the top of every new quote PDF. Reps can override per-quote if Quote templates allow it."
                        headAction={<span style={{ fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>Supports {'{{rep.name}}'}, {'{{account.name}}'}, {'{{quote.number}}'}</span>}
                    >
                        <CTextarea value={form.quoteHeader} onChange={v => set('quoteHeader', v)} rows={5}/>
                    </CSectionCard>
                </div>

                {/* RIGHT — live PDF preview */}
                <div>
                    <div style={{ position:'sticky', top:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, overflow:'hidden' }}>
                        <div style={{ padding:'10px 14px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', background:T.surface2 }}>
                            <span style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.8, fontFamily:T.sans }}>Live preview · Quote PDF</span>
                            <span style={{ fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>Updates as you type</span>
                        </div>
                        <div style={{ padding:14, background:'#d9d2c1' }}>
                            <div style={{ background:'#fff', boxShadow:'0 2px 10px rgba(0,0,0,0.08)', borderRadius:2, padding:24, fontFamily:T.serif }}>
                                <div style={{ display:'flex', alignItems:'flex-start', gap:14, paddingBottom:14, borderBottom:`2px solid ${form.brandColor || T.goldInk}` }}>
                                    <div style={{ width:44, height:44, background:form.brandColor || T.gold, borderRadius:3, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, fontWeight:700, color:'#fff', flexShrink:0 }}>
                                        {(form.displayName || 'A')[0].toUpperCase()}
                                    </div>
                                    <div style={{ flex:1 }}>
                                        <div style={{ fontSize:15, fontWeight:700, color:T.ink, letterSpacing:-0.2 }}>{form.displayName || 'Your Company'}</div>
                                        <div style={{ fontSize:10, color:T.inkMid, lineHeight:1.5, fontFamily:T.sans, marginTop:2 }}>
                                            {form.address && <>{form.address}<br/></>}
                                            {(form.city || form.state || form.zip) && <>{[form.city, form.state, form.zip].filter(Boolean).join(', ')}<br/></>}
                                            {form.phone && <>{form.phone}{form.supportEmail ? ' · ' : ''}</>}
                                            {form.supportEmail}
                                        </div>
                                    </div>
                                    <div style={{ textAlign:'right' }}>
                                        <div style={{ fontSize:9, fontFamily:T.sans, color:T.inkMuted, letterSpacing:1, fontWeight:600 }}>QUOTE</div>
                                        <div style={{ fontSize:13, fontWeight:700, color:T.ink, fontFamily:T.serif }}>Q-2026-0001</div>
                                    </div>
                                </div>
                                <div style={{ fontSize:11, color:T.inkMid, marginTop:12, lineHeight:1.55, fontFamily:T.sans }}>
                                    {form.quoteHeader
                                        ? form.quoteHeader.replace('{{account.name}}','<b>Acme Corp.</b>').replace('{{rep.name}}','<b>Jamie Chen</b>').replace('{{quote.expires}}','<b>Dec 31, 2026</b>').replace('{{quote.number}}','<b>Q-2026-0001</b>')
                                        : <em style={{ color:T.inkMuted }}>No quote header set — add one above.</em>}
                                </div>
                                <div style={{ marginTop:16, display:'flex', flexDirection:'column', gap:4 }}>
                                    {[80,60,75,50,65].map((w,i) => <div key={i} style={{ height:6, width:`${w}%`, background:T.border, borderRadius:1 }}/>)}
                                </div>
                                <div style={{ marginTop:16, paddingTop:10, borderTop:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', fontSize:10, color:T.inkMuted, fontFamily:T.sans }}>
                                    <span>{form.supportEmail || 'yourcompany.com'}</span>
                                    <span>Page 1 of 3</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </DetailPageChrome>
    );
};
