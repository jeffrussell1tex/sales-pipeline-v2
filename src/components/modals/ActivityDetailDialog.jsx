// ActivityDetailDialog — the house read-only view of one activity (state §0.93,
// item 26 — Jeff: "these are fairly useless because I can't see any content").
// Module scope, data as props. Until §0.93 an activity appeared only as a list
// row: the rails dumped the whole notes field unclamped, the deal History tab
// cut it at 80 characters with no way to see the rest, and nothing was
// clickable — the only activity surface was the create/edit form. This shows
// the whole thing with its line breaks kept, and offers Edit only to a caller
// the server would let write (canEditActivity mirrors mayMutate).
import React from 'react';
import { useApp } from '../../AppContext';
import { emailPartsOf, canEditActivity } from '../../utils/activityView';
import { parseLocalDate } from '../../utils/dateLocal';

const T = {
    bg: '#f0ece4', surface: '#fbf8f3', surface2: '#f5efe3', border: '#e6ddd0', borderStrong: '#d4c8b4',
    ink: '#2a2622', inkMid: '#5a544c', inkMuted: '#8a8378', gold: '#c8b99a', goldInk: '#7a6a48',
    sans: '"Plus Jakarta Sans", system-ui, sans-serif', r: 3,
};

const fmtWhen = (v) => {
    const d = parseLocalDate(v);
    return d ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '—';
};

/**
 * props:
 *   activity     — the row as the activities endpoint returns it
 *   contactName, accountName, dealName — resolved by the host ('' when none)
 *   canEdit      — whether to offer Edit (the host decides through canEditActivity)
 *   onEdit       — () => void; opens the existing editor on this activity
 *   onClose      — () => void
 */
export default function ActivityDetailDialog({ activity, contactName = '', accountName = '', dealName = '', canEdit = false, onEdit, onClose, isMobile = false }) {
    const { subject, body } = emailPartsOf(activity);
    const type = activity?.type || 'Note';
    const links = [contactName, accountName, dealName].filter(Boolean);
    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 11000, background: 'rgba(42,38,34,0.40)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: T.sans }}>
            <div role="dialog" aria-modal="true" aria-label={`${type}${subject ? ': ' + subject : ''}`} onClick={e => e.stopPropagation()}
                style={{ width: isMobile ? '100%' : 600, maxWidth: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, boxShadow: '0 18px 48px rgba(42,38,34,0.22)' }}>
                <div style={{ padding: '14px 18px 12px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'flex-start', gap: 10, flexShrink: 0 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ background: 'rgba(58,90,122,0.1)', color: T.ink, padding: '1px 6px', borderRadius: 3, fontSize: 10.5, fontWeight: 700 }}>{type}</span>
                            <span style={{ fontSize: 12, color: T.inkMuted }}>{fmtWhen(activity?.date)}</span>
                            {activity?.author && <span style={{ fontSize: 12, color: T.inkMuted }}>· {activity.author}</span>}
                        </div>
                        {subject && <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginTop: 6, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{subject}</div>}
                        {links.length > 0 && <div style={{ fontSize: 11.5, color: T.inkMid, marginTop: 4 }}>{links.join(' · ')}</div>}
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close"
                        style={{ background: 'none', border: 'none', color: T.inkMuted, fontSize: 20, cursor: 'pointer', padding: '0 4px', lineHeight: 1, borderRadius: 4, flexShrink: 0 }}>×</button>
                </div>
                <div style={{ padding: '14px 18px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
                    <div style={{ fontSize: 13, lineHeight: 1.6, color: T.ink, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                        {body || <span style={{ color: T.inkMuted, fontStyle: 'italic' }}>No details</span>}
                    </div>
                    {(activity?.outcome || activity?.duration) && (
                        <div style={{ marginTop: 14, fontSize: 11.5, color: T.inkMid, borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
                            {activity.outcome && <span>Outcome: {activity.outcome}</span>}
                            {activity.outcome && activity.duration ? <span> · </span> : null}
                            {activity.duration ? <span>Duration: {activity.duration} min</span> : null}
                        </div>
                    )}
                </div>
                <div style={{ padding: '10px 18px', borderTop: `1px solid ${T.border}`, background: T.surface2, display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
                    <button type="button" onClick={onClose}
                        style={{ padding: '7px 14px', border: `1px solid ${T.borderStrong}`, borderRadius: T.r, background: T.surface, color: T.inkMid, fontWeight: 600, fontSize: 12.5, cursor: 'pointer', fontFamily: T.sans }}>Close</button>
                    {canEdit && (
                        <button type="button" onClick={onEdit}
                            style={{ padding: '7px 14px', border: 'none', borderRadius: T.r, background: T.ink, color: '#fbf8f3', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', fontFamily: T.sans }}>Edit</button>
                    )}
                </div>
            </div>
        </div>
    );
}

// The host: reads the app context, resolves the names the row points at, and
// renders the dialog while `viewingActivity` is set. Edit hands the row to the
// existing editor (editingActivity + showActivityModal) after closing this.
export function ActivityDetailDialogHost() {
    const {
        viewingActivity, setViewingActivity, contacts, accounts, opportunities,
        userRole, currentUserId, setEditingActivity, setShowActivityModal, isMobile,
    } = useApp();
    if (!viewingActivity) return null;
    const a = viewingActivity;
    const contact = (contacts || []).find(c => c.id === a.contactId);
    const contactName = contact ? [contact.firstName, contact.lastName].filter(Boolean).join(' ') : '';
    const accountName = (accounts || []).find(x => x.id === a.accountId)?.name || '';
    const opp = (opportunities || []).find(o => o.id === a.opportunityId);
    const dealName = opp ? (opp.opportunityName || opp.account || '') : '';
    const canEdit = canEditActivity(a, { userRole, currentUserId });
    const onEdit = () => { setViewingActivity(null); setEditingActivity(a); setShowActivityModal(true); };
    return (
        <ActivityDetailDialog activity={a} contactName={contactName} accountName={accountName} dealName={dealName}
            canEdit={canEdit} onEdit={onEdit} onClose={() => setViewingActivity(null)} isMobile={isMobile} />
    );
}
