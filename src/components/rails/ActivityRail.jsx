import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../../AppContext';
import AttachmentsStrip from '../documents/AttachmentsStrip';
import AccountPicker from './AccountPicker';
import HiddenLink from './HiddenLink';
import { dbFetch } from '../../utils/storage';
import { T } from '../../tokens.js';
import { matchSearch, searchKey } from '../../utils/searchMatch.js';
import { dealText, dealSubline, isMergeArchived, HIDDEN_ACCOUNT, HIDDEN_DEAL } from '../../utils/pickLink.js';
import { NO_SEED, activitySeed, activityLinks, companyAfterDealPick, outOfList } from '../../utils/railLinks.js';
import { leaveOut, sameList } from '../../utils/leaveOut.js';

// ── Design tokens ─────────────────────────────────────────────────────────────

function SectionHeading({ label }) {
    return (
        <div style={{ fontSize: 10, fontWeight: 700, color: T.gold, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, marginTop: 6, borderBottom: `1px solid ${T.border}`, paddingBottom: 5 }}>
            {label}
        </div>
    );
}

function FieldGroup({ label, wide, children }) {
    return (
        <div style={{ gridColumn: wide ? '1 / -1' : undefined, marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{label}</label>
            {children}
        </div>
    );
}

function TextInput({ value, onChange, placeholder, type = 'text', onBlur }) {
    return (
        <input type={type} value={value || ''} onChange={e => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder}
            style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans, boxSizing: 'border-box', outline: 'none' }}
        />
    );
}

function Typeahead({ value, onChange, suggestions, onSelect, placeholder, dropUp, textOf = (s) => s, lineOf = null }) {
    const [open, setOpen] = useState(false);
    // The shared matcher (state §0.194), while the list is open: ranked, the cut announced.
    // It opens as one types; nothing typed lists every suggestion, as it did, and only
    // punctuation typed lists none (the matcher reads it as nothing). A suggestion may be a
    // record — Log Activity's deals — read by textOf and handed back whole when picked, with
    // lineOf's grey line under it telling two of one name apart (state §0.198, D9). It shuts
    // when the field loses the focus, as the account picker does; a press on a row or on the
    // count keeps the focus in the field, so a click still lands.
    const { shown, more } = open && (searchKey(value) || !(value || '').trim()) ? matchSearch(suggestions, value, { text: textOf }) : { shown: [], more: 0 };
    return (
        <div style={{ position: 'relative' }}>
            <TextInput value={value} onChange={v => { onChange(v); setOpen(true); }} onBlur={() => setTimeout(() => setOpen(false), 200)} placeholder={placeholder} />
            {open && shown.length > 0 && (
                <div style={{ position: 'absolute', [dropUp ? 'bottom' : 'top']: '100%', left: 0, right: 0, background: '#fff', border: `1px solid ${T.border}`, borderRadius: T.r, marginTop: dropUp ? 0 : 2, marginBottom: dropUp ? 2 : 0, maxHeight: 180, overflowY: 'auto', zIndex: 300, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    {shown.map((s, i) => (
                        <div key={s?.id || i} onMouseDown={e => e.preventDefault()} onClick={() => { onSelect(s); setOpen(false); }}
                            style={{ padding: '7px 10px', fontSize: 13, cursor: 'pointer', borderBottom: `1px solid ${T.border}` }}
                            onMouseEnter={e => e.currentTarget.style.background = T.bg}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >{textOf(s)}{lineOf && lineOf(s) ? <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 1 }}>{lineOf(s)}</div> : null}</div>
                    ))}
                    {more > 0 && <div onMouseDown={e => e.preventDefault()} style={{ position: 'sticky', bottom: 0, background: 'inherit', padding: '6px 10px', fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>{more} more — keep typing</div>}
                </div>
            )}
        </div>
    );
}

// Multi-select contacts: removable chips inside the field + typeahead (Option A).
// Module scope (never an inline sub-component) so React keeps the input mounted.
function ContactMultiSelect({ contacts, value, onChange, placeholder }) {
    const [query, setQuery] = useState('');
    const [open, setOpen]   = useState(false);
    const selected = value || [];
    const nameOf = (c) => ((c?.firstName || '') + ' ' + (c?.lastName || '')).trim() || (c?.email || 'Unknown contact');
    // A contact merged into another is not offered (state §0.198, D12: "Yes, hide them"); a
    // chip already on the activity still names it, from the full list.
    const { shown: suggestions, more } = open ? matchSearch((contacts || []).filter(c => !selected.includes(c.id) && !isMergeArchived(c)), query, { text: nameOf, also: c => [c.company] }) : { shown: [], more: 0 };   // ranked while the list is open, the cut announced (state §0.194)
    const add    = (id) => { onChange([...selected, id]); setQuery(''); setOpen(false); };
    const remove = (id) => onChange(selected.filter(x => x !== id));
    return (
        <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center', border: `1px solid ${T.border}`, borderRadius: T.r, background: T.surface, padding: '5px 6px', minHeight: 34, boxSizing: 'border-box' }}>
                {selected.map(id => {
                    const c = (contacts || []).find(x => x.id === id);
                    return (
                        <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 999, padding: '2px 4px 2px 9px', fontSize: 12, color: T.inkMid }}>
                            {nameOf(c)}
                            <button type="button" aria-label={'Remove ' + nameOf(c)} onMouseDown={e => e.preventDefault()} onClick={() => remove(id)}
                                style={{ border: 'none', background: 'none', color: T.inkMuted, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px' }}>×</button>
                        </span>
                    );
                })}
                <input
                    type="text"
                    value={query}
                    onChange={e => { setQuery(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    onBlur={() => setTimeout(() => setOpen(false), 200)}
                    placeholder={selected.length ? '' : placeholder}
                    style={{ flex: 1, minWidth: 90, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: T.ink, fontFamily: T.sans, padding: 2 }}
                />
            </div>
            {open && suggestions.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: `1px solid ${T.border}`, borderRadius: T.r, marginTop: 2, maxHeight: 180, overflowY: 'auto', zIndex: 300, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    {suggestions.map(c => (
                        <div key={c.id}
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => add(c.id)}
                            style={{ padding: '7px 10px', fontSize: 13, cursor: 'pointer', borderBottom: `1px solid ${T.border}`, color: T.ink }}
                            onMouseEnter={e => e.currentTarget.style.background = T.bg}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            {nameOf(c)}{c.company ? <span style={{ color: T.inkMuted }}> · {c.company}</span> : ''}
                        </div>
                    ))}
                    {more > 0 && <div onMouseDown={e => e.preventDefault()} style={{ position: 'sticky', bottom: 0, background: 'inherit', padding: '6px 10px', fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>{more} more — keep typing</div>}
                </div>
            )}
        </div>
    );
}
const today = () => {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
};

const EMPTY_ACTIVITY = {
    type: 'Call', date: '', notes: '',
    opportunityId: '', contactId: '', company: '',
};

// ── Main component ─────────────────────────────────────────────────────────────

export default function ActivityRail() {
    const {
        opportunities, contacts, accounts, settings, currentUser,
        showActivityModal, setShowActivityModal,
        editingActivity, setEditingActivity,
        activityInitialContext, setActivityInitialContext,
        activityModalError, setActivityModalError,
        activityModalSaving,
        handleSaveActivity,
        setFollowUpPrompt,
        setQuickLogOpen, setQuickLogForm, setQuickLogContactResults,
        setContacts, setAccounts,
        contactRailId, setContactRailId,
        contactRailMode, setContactRailMode,
        accountRailId, setAccountRailId,
        accountRailMode, setAccountRailMode,
        escapeBlocked,
    } = useApp();

    const isOpen    = !!showActivityModal;
    const isEditing = true; // Activity rail is always in edit/create mode

    // ── Form state ─────────────────────────────────────────────────────────────
    const [formData,     setFormData]     = useState({ ...EMPTY_ACTIVITY, date: today() });
    const [oppSearch,    setOppSearch]    = useState('');
    const [selectedContactIds, setSelectedContactIds] = useState([]);
    const [companySearch,setCompanySearch]= useState('');
    // The id each link field holds — the row picked, or the link it opened with — and the
    // links it opened with, taken once when the rail opens (state §0.198).
    const [companyId,    setCompanyId]    = useState('');
    const [oppId,        setOppId]        = useState('');
    const seedRef = useRef(NO_SEED);
    // The contacts it opened with, taken with the seed: an edit's Save with them as they were
    // leaves them out (the pre-ship round; utils/leaveOut.js).
    const contactsSeedRef = useRef([]);
    const [saveError,    setSaveError]    = useState(null);
    // A refused Save says why in the banner at the top of the body, out of sight once the rail
    // is scrolled down to Company and Opportunity: each refusal, and the server's, scrolls it
    // into view — the same words twice too (refusals counts them; state §0.198).
    const errorRef = useRef(null);
    const [refusals, setRefusals] = useState(0);
    const refuse = (why) => { setSaveError(why); setRefusals(n => n + 1); };

    useEffect(() => {
        if (!isOpen) return;
        const ctx = activityInitialContext || {};
        const src = editingActivity ? { ...EMPTY_ACTIVITY, ...editingActivity } : { ...EMPTY_ACTIVITY, date: today(), ...ctx };

        setFormData(src);

        // Seed selected contacts from the array (source of truth), falling back to the
        // legacy singular contactId so existing activities and Email/Call prefills work.
        const seedContactIds = Array.isArray(src.contactIds) && src.contactIds.length
            ? src.contactIds.filter(Boolean)
            : (src.contactId ? [src.contactId] : []);
        setSelectedContactIds(seedContactIds);
        contactsSeedRef.current = seedContactIds;

        // The links the rail opens with, taken once (state §0.198): an edit's stored ids, or a
        // new activity's prefilled ones — an account's own rail (D10), a contact's (D19), a
        // deal, a lead's company. A field left as it opened keeps its link exactly, even one
        // the user can't open (D16); an edit with no account shows none (D1). Company persists
        // as accountId (activities have no `company` column). utils/railLinks.js activitySeed.
        const opened = activitySeed(src, { editing: !!editingActivity, accounts, opportunities });
        seedRef.current = opened.seed;
        setCompanySearch(opened.company.text);
        setCompanyId(opened.company.id);
        setOppSearch(opened.deal.text);
        setOppId(opened.deal.id);
        setSaveError(null);
        setActivityModalError?.(null);
    }, [showActivityModal, editingActivity, activityInitialContext]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (refusals || activityModalError) errorRef.current?.scrollIntoView?.({ block: 'nearest' });
    }, [refusals, activityModalError]);

    // ── Derived lists ──────────────────────────────────────────────────────────
    const taskTypes   = settings?.taskTypes || ['Call', 'Meeting', 'Email', 'Demo', 'Follow-up'];
    const dealOptions = (opportunities || []).filter(o => !!dealText(o));   // each deal its own row, told apart by "<account> · <stage>" (D9)

    const hc = useCallback((field, value) => setFormData(prev => ({ ...prev, [field]: value })), []);

    // A deal picked is held by its id (state §0.198), and fills an EMPTY Company with the
    // deal's account, where it shows (D7: "Save what the field shows"); a Company already
    // shown stays (utils/railLinks.js companyAfterDealPick).
    const pickDeal = (o) => {
        setOppSearch(dealText(o));
        setOppId(o.id);
        const next = companyAfterDealPick(o, { text: companySearch, id: companyId }, accounts);
        setCompanySearch(next.text);
        setCompanyId(next.id);
    };

    const closeRail = () => {
        setShowActivityModal(false);
        setEditingActivity(null);
        setActivityInitialContext?.(null);
        setActivityModalError?.(null);
        setSaveError(null);
    };

    const handleSave = async () => {
        setSaveError(null);
        setActivityModalError?.(null); // the last save's server error never hides this Save's own refusal (§0.198)
        if (!formData.notes?.trim()) { refuse('Notes are required.'); return; }

        // A pick is saved as the record picked (state §0.198). Each field saves what it shows:
        // the link it opened with when nobody touched it — exactly, even one the user can't
        // open; the record it holds while its text still reads as it; nothing when it is empty
        // (a cleared Company is no account, whatever deal is named — D7); a name typed in full
        // only when one record has it — two refuse, none refuse (no free-text companies; the
        // Company field offers Create). utils/railLinks.js activityLinks, over resolveLink.
        // An edit's Save leaves out each link nobody touched — Company, Opportunity, the
        // contacts — so the activity's links stand as stored, whatever this rail's lists say of
        // them (a merge or another session may have moved them since; the pre-ship round).
        const links = activityLinks({ company: { text: companySearch, id: companyId }, deal: { text: oppSearch, id: oppId }, seed: seedRef.current, accounts, opportunities });
        if (links.error) { refuse(links.error); return; }

        const saveData = leaveOut({
            ...formData,
            company:       links.company,
            accountId:     links.accountId,
            opportunityId: links.opportunityId,
            contactIds:    selectedContactIds,
            contactId:     selectedContactIds[0] || '',
        }, editingActivity ? [
            ...(links.untouched.company ? ['accountId', 'company'] : []),
            ...(links.untouched.deal ? ['opportunityId'] : []),
            ...(sameList(selectedContactIds, contactsSeedRef.current) ? ['contactIds', 'contactId'] : []),
        ] : []);

        await handleSaveActivity(saveData, {
            editingActivity,
            currentUser,
            opportunities,
            setShowActivityModal: (open) => { if (!open) closeRail(); },
            setFollowUpPrompt,
            setQuickLogOpen,
            setQuickLogForm,
            setQuickLogContactResults,
        });
    };

    // ESC to close — the rail's Escape while no layer above it is open (state §0.189): the
    // one order (escapeBlocked), not a list of its own — the app's confirm and prompt were on
    // it (§0.178), the activity viewer and the coaching note were not. It marks the Escape it
    // takes, so nothing under the rail acts on it too: App closed this rail a second time,
    // and anything of App's under it.
    // An Escape a layer above took — marked, as a document's is (§0.180) — is left alone.
    const escapeHeld = escapeBlocked('activityRail');
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e) => {
            if (e.key !== 'Escape' || e.defaultPrevented || escapeHeld) return;
            e.preventDefault();
            closeRail();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isOpen, escapeHeld]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!isOpen) return null;

    const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' };

    return (
        <>
        {/* Click-catcher */}
        <div onClick={closeRail}
            style={{ position: 'fixed', inset: 0, zIndex: 11000, background: 'rgba(42,38,34,0.25)' }}
        />

        {/* Rail panel */}
        <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 480,
            background: T.surface, borderLeft: `1px solid ${T.border}`,
            display: 'flex', flexDirection: 'column',
            zIndex: 11001, boxShadow: '-8px 0 32px rgba(42,38,34,0.12)',
            fontFamily: T.sans,
        }}>

            {/* ── Header ────────────────────────────────────────────────────── */}
            <div style={{ background: T.ink, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#f5f1eb' }}>
                        {editingActivity ? 'Edit Activity' : 'Log Activity'}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(245,241,235,0.5)', marginTop: 1 }}>
                        What happened?
                    </div>
                </div>
                <button onClick={closeRail} style={{ background: 'none', border: 'none', color: 'rgba(245,241,235,0.5)', fontSize: 18, cursor: 'pointer', padding: '2px 4px', lineHeight: 1, flexShrink: 0 }}>×</button>
            </div>

            {/* ── Scrollable body ────────────────────────────────────────────── */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '14px 18px' }}>

                {/* Error */}
                {(activityModalError || saveError) && (
                    <div ref={errorRef} style={{ background: `${T.danger}14`, border: `1px solid ${T.danger}`, borderRadius: T.r, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: T.danger, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>{activityModalError || saveError}</span>
                        <button onClick={() => { setActivityModalError?.(null); setSaveError(null); }} style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
                    </div>
                )}

                <SectionHeading label="Activity Details" />
                <div style={grid2}>
                    <FieldGroup label="Activity Type">
                        <select value={formData.type || 'Call'} onChange={e => hc('type', e.target.value)}
                            style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans }}>
                            {taskTypes.map(tt => <option key={tt} value={tt}>{tt}</option>)}
                        </select>
                    </FieldGroup>
                    <FieldGroup label="Date *">
                        <input type="date" value={formData.date || today()} onChange={e => hc('date', e.target.value)}
                            style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans, boxSizing: 'border-box' }} />
                    </FieldGroup>
                    <FieldGroup label="Notes *" wide>
                        <textarea value={formData.notes || ''} onChange={e => hc('notes', e.target.value)}
                            rows={5} placeholder="What was discussed? Next steps? Important details…"
                            style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans, boxSizing: 'border-box', resize: 'vertical' }}
                        />
                    </FieldGroup>
                </div>

                <SectionHeading label="Related To" />
                <div style={grid2}>
                    <FieldGroup label="Contacts" wide>
                        <ContactMultiSelect contacts={contacts} value={selectedContactIds} onChange={setSelectedContactIds} placeholder="Type to search contacts…" />
                    </FieldGroup>
                    <FieldGroup label="Company" wide>
                        {/* A link the user can't open: said so, and an × removes it; untouched, a Save keeps
                            it (state §0.198, D16). A row picked, or created, is held by its id. */}
                        {outOfList(companyId, accounts)
                            ? <HiddenLink hidden={HIDDEN_ACCOUNT} title="Remove the account" onRemove={() => setCompanyId('')} />
                            : <AccountPicker value={companySearch} onChange={setCompanySearch} onSelectAccount={a => setCompanyId(a.id)} onError={setSaveError} placeholder="Type company name…" />}
                    </FieldGroup>
                    <FieldGroup label="Opportunity" wide>
                        {outOfList(oppId, opportunities)
                            ? <HiddenLink hidden={HIDDEN_DEAL} title="Remove the deal" onRemove={() => setOppId('')} />
                            : <Typeahead value={oppSearch} onChange={setOppSearch} suggestions={dealOptions} textOf={dealText} lineOf={dealSubline} onSelect={pickDeal} placeholder="Type opportunity or account name…" dropUp />}
                    </FieldGroup>
                </div>

                {editingActivity && editingActivity.id && (
                    <>
                        <SectionHeading label="Attachments" />
                        <AttachmentsStrip recordType="activity" recordId={editingActivity.id} recordName={editingActivity.subject || editingActivity.type || 'Activity'} recordSub={editingActivity.date || ''} />
                    </>
                )}
            </div>

            {/* ── Footer ────────────────────────────────────────────────────── */}
            <div style={{ flexShrink: 0, borderTop: `1px solid ${T.border}`, padding: '12px 16px', background: T.surface, display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={closeRail}
                    style={{ padding: '8px 16px', background: T.surface2, color: T.inkMid, border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                    Cancel
                </button>
                <button onClick={handleSave} disabled={activityModalSaving}
                    style={{ padding: '8px 20px', background: T.ink, color: '#f5f1eb', border: 'none', borderRadius: T.r, fontSize: 13, fontWeight: 700, cursor: activityModalSaving ? 'not-allowed' : 'pointer', fontFamily: T.sans, opacity: activityModalSaving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                    {activityModalSaving && <span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />}
                    {activityModalSaving ? 'Saving…' : editingActivity ? 'Save Activity' : 'Log Activity'}
                </button>
            </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </>
    );
}
