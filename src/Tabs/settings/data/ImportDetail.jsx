// settings/data/ImportDetail.jsx
//
// Honest by construction (state §0.86, handoff item 21). What was here: a
// DATA_IMPORT constant — five past imports by morgan@accelerep.com, a
// "salesforce-accounts-2026-q1.csv" with ten mapped columns and three typed
// row errors — driving a five-step wizard whose "Run import now" POSTed no rows
// to /.netlify/functions/import and rendered the preview's counts back as
// "Import completed successfully". Nothing was ever imported from this panel.
// The importers that work are the CSV modal the Accounts, Contacts and Pipeline
// tabs open, and the lead importer on the Leads tab; this panel now opens those
// and nothing else. "Save mapping as preset" wrote settings.importPresets, which
// nothing read back — the key is retired with the wizard.
import React from 'react';
import { useApp } from '../../../AppContext';
import { T } from '../shared/tokens.js';
import { DataCard, DataCrumb, DataTitle } from './shared.jsx';

const TARGETS = [
    { key:'accounts',      name:'Accounts',      desc:'Company records — name, industry, owner, territory, segment.' },
    { key:'contacts',      name:'Contacts',      desc:'People — name, email, phone, title, company, assigned rep.' },
    { key:'opportunities', name:'Opportunities', desc:'Deals — name, account, stage, ARR, close date, sales rep.' },
    { key:'leads',         name:'Leads',         desc:'Inbound leads — name, email, company, source, status, assigned rep.' },
];

export const ImportDetail = ({ onBack }) => {
    const { settings, setCsvImportType, setShowCsvImportModal, setShowLeadImportModal } = useApp();
    const leadsOn = settings?.leadsEnabled !== false;
    const targets = TARGETS.filter(t => t.key !== 'leads' || leadsOn);

    // The same openers the tabs use: the CSV modal keyed by entity, and the
    // lead importer. The modals render from ModalLayer over any tab, Settings
    // included, so nothing here needs to leave the panel.
    const open = (key) => {
        if (key === 'leads') { setShowLeadImportModal(true); return; }
        setCsvImportType(key);
        setShowCsvImportModal(true);
    };

    return (
        <div style={{ fontFamily:T.sans }}>
            <DataCrumb page="Import" onBack={onBack}/>
            <DataTitle
                title="Import data"
                sub="CSV import — the same importers the Accounts, Contacts, Pipeline and Leads tabs open"
            />

            <DataCard title="Choose what to import" desc="Each importer reads your CSV, lets you map its columns to Accelerep fields, previews the rows, and reports what the server accepted and what it refused.">
                <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:12 }}>
                    {targets.map(t => (
                        <button key={t.key} type="button" onClick={() => open(t.key)}
                            style={{ textAlign:'left', padding:'14px 16px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:6, cursor:'pointer', fontFamily:T.sans }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = T.goldInk; e.currentTarget.style.background = 'rgba(200,185,154,0.10)'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.surface; }}>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                                <span style={{ fontSize:14, fontWeight:700, color:T.ink }}>{t.name}</span>
                                <span style={{ fontSize:12, fontWeight:600, color:T.goldInk }}>Import CSV →</span>
                            </div>
                            <div style={{ fontSize:12, color:T.inkMid, lineHeight:1.5 }}>{t.desc}</div>
                        </button>
                    ))}
                </div>
                {!leadsOn && (
                    <div style={{ marginTop:12, fontSize:12, color:T.inkMuted, fontFamily:T.sans }}>
                        Leads are turned off for this workspace (Settings → Features), so the lead importer is not offered here.
                    </div>
                )}
            </DataCard>

            <DataCard title="Where imports land" desc="Nothing is imported from this page itself.">
                <ul style={{ margin:0, paddingLeft:18, fontSize:13, color:T.inkMid, lineHeight:1.7, fontFamily:T.sans }}>
                    <li>Rows are written through the same endpoints the app uses for its own records, in chunks, and the importer's receipt shows the counts the server reported — not a guess made before the write.</li>
                    <li>A column mapping is not saved between imports; map it in the importer each time.</li>
                </ul>
            </DataCard>
        </div>
    );
};
