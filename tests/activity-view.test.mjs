// tests/activity-view.test.mjs
//
// State §0.93, item 26 — Jeff: "these are fairly useless because I can't see
// any content." An activity appeared only as a list row: the rails rendered the
// whole notes field unclamped, the deal History tab cut it at 80 characters
// with no way to see the rest, nothing was clickable, and no read-only view
// existed. The pure half (splitting an email's notes back into subject and
// body; who may open the editor) is exercised here; the scans pin the wiring —
// state, context, Escape, body lock, the host, and the click on every row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emailPartsOf, previewOf, canEditActivity, emailEnvelopeOf } from '../src/utils/activityView.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

// ── the pure half ────────────────────────────────────────────────────────────

test('an email row splits back into subject and body; anything else is title-less notes', () => {
    assert.deepEqual(emailPartsOf({ subject: 'Test email', notes: 'Test email — Test email for logging' }), { subject: 'Test email', body: 'Test email for logging' });
    assert.deepEqual(emailPartsOf({ subject: 'Q3 pricing', notes: 'Q3 pricing — line one\nline two' }), { subject: 'Q3 pricing', body: 'line one\nline two' }, 'line breaks survive');
    assert.deepEqual(emailPartsOf({ subject: 'Only subject', notes: 'Only subject' }), { subject: 'Only subject', body: '' }, 'no body captured');
    assert.deepEqual(emailPartsOf({ subject: 'Hello', notes: 'Something else entirely' }), { subject: 'Hello', body: 'Something else entirely' }, 'a subject that is not the prefix is kept as a title, notes untouched');
    assert.deepEqual(emailPartsOf({ subject: null, notes: 'Called about renewal' }), { subject: null, body: 'Called about renewal' }, 'a logged call has no subject');
    assert.deepEqual(emailPartsOf({ subject: '  ', notes: 'x' }), { subject: null, body: 'x' }, 'blank subject is no subject');
    assert.deepEqual(emailPartsOf({}), { subject: null, body: '' });
    assert.deepEqual(emailPartsOf(null), { subject: null, body: '' });
    assert.deepEqual(previewOf({ subject: 'Test email', notes: 'Test email — body' }), { title: 'Test email', snippet: 'body' });
    assert.deepEqual(previewOf({ notes: 'plain' }), { title: null, snippet: 'plain' });
});

test('Edit is offered exactly where the server would let the caller write', () => {
    const me = 'usr_00000000-0000-4000-8000-000000000001';
    const other = 'usr_00000000-0000-4000-8000-000000000002';
    const mine = { ownerId: me }, theirs = { ownerId: other }, unowned = { ownerId: null };
    // Admin and Manager see all and write all.
    for (const userRole of ['Admin', 'Manager']) {
        assert.equal(canEditActivity(theirs, { userRole, currentUserId: me }), true, userRole);
        assert.equal(canEditActivity(theirs, { userRole, currentUserId: null }), true, userRole + ' with no roster row');
    }
    // A rep: their own and unassigned rows only.
    assert.equal(canEditActivity(mine, { userRole: 'User', currentUserId: me }), true);
    assert.equal(canEditActivity(unowned, { userRole: 'User', currentUserId: me }), true, 'unassigned is open, as on the server');
    assert.equal(canEditActivity({ ownerId: '' }, { userRole: 'User', currentUserId: me }), true, 'empty owner is unassigned');
    assert.equal(canEditActivity(theirs, { userRole: 'User', currentUserId: me }), false, "another rep's row");
    assert.equal(canEditActivity(mine, { userRole: 'User', currentUserId: null }), false, 'a caller with no roster row (the null === null collision, guarded)');
    assert.equal(canEditActivity({ ownerId: 'user_clerkid' }, { userRole: 'User', currentUserId: me }), false, 'a Clerk id in the owner column never matches (18b22)');
    assert.equal(canEditActivity(mine, { userRole: 'User', currentUserId: 'user_clerkid' }), false, 'a Clerk id as the caller never matches');
    assert.equal(canEditActivity({ ownerId: 'user_clerkid' }, { userRole: 'User', currentUserId: 'user_clerkid' }), false, 'EQUAL Clerk ids still never match — the server refuses an owner outside the usr_ space before comparing (the mutant that survived first)');
    assert.equal(canEditActivity({ ownerId: '  ' + me + '  ' }, { userRole: 'User', currentUserId: me }), true, 'a padded owner id is trimmed, as on the server');
    // Read roles never edit, whatever they own.
    for (const userRole of ['ReadOnly', 'Technician', 'member', undefined, 'admin']) {
        assert.equal(canEditActivity(mine, { userRole, currentUserId: me }), false, String(userRole));
        assert.equal(canEditActivity(unowned, { userRole, currentUserId: me }), false, String(userRole) + ' unassigned');
    }
    assert.equal(canEditActivity(null, { userRole: 'Admin', currentUserId: me }), false, 'no activity, no button');
});

// ── source scans ─────────────────────────────────────────────────────────────

test('viewingActivity is wired: state, App destructure, context, Escape, body lock', () => {
    const hook = code(read('src/hooks/useModalState.js'));
    assert.ok(hook.includes('const [viewingActivity, setViewingActivity] = useState(null);'));
    assert.ok(hook.includes('        viewingActivity, setViewingActivity,'), 'returned');
    const app = code(read('src/App.jsx'));
    assert.ok(app.includes('        viewingActivity, setViewingActivity,'), 'destructured and in the context');
    assert.equal((app.match(/^        viewingActivity, setViewingActivity,$/gm) || []).length, 2, 'once out of useModalState, once into appContextValue');
    assert.ok(app.includes('if (viewingActivity) { setViewingActivity(null); return; }'), 'Escape closes the viewer first');
    assert.ok(app.indexOf('if (viewingActivity) { setViewingActivity(null); return; }') < app.indexOf('if (showShortcuts) { setShowShortcuts(false); return; }'), 'before everything else');
    assert.ok(app.includes('|| coachingNoteModal || viewingActivity;'), 'shortcuts stay quiet while the viewer is open');
    assert.ok(app.includes('viewingContact || viewingAccount || viewingTask || viewingActivity ||'), 'the body scroll lock');
    assert.ok(app.includes('        viewingContact, viewingAccount, viewingTask, viewingActivity,'), 'and its deps');
    assert.ok(app.includes('showModal, showAccountModal, showContactModal, showTaskModal, showUserModal, showActivityModal, viewingActivity,'), 'the key handler re-binds when it changes');
});

test('the host is rendered once, from ModalLayer, and decides Edit through canEditActivity', () => {
    const layer = code(read('src/components/layout/ModalLayer.jsx'));
    assert.ok(layer.includes("import { ActivityDetailDialogHost } from '../modals/ActivityDetailDialog';"));
    assert.equal((layer.match(/<ActivityDetailDialogHost \/>/g) || []).length, 1);
    const dlg = code(read('src/components/modals/ActivityDetailDialog.jsx'));
    assert.ok(dlg.includes('const canEdit = canEditActivity(a, { userRole, currentUserId });'));
    assert.ok(dlg.includes('{canEdit && ('), 'Edit is gated');
    assert.ok(dlg.includes('const onEdit = () => { setViewingActivity(null); setEditingActivity(a); setShowActivityModal(true); };'), 'Edit hands the row to the existing editor');
    assert.ok(dlg.includes("whiteSpace: 'pre-wrap'"), 'the body keeps its line breaks');
    assert.ok(dlg.includes('if (!viewingActivity) return null;'));
    assert.ok(dlg.includes('zIndex: 11000'), 'above the rails (10999)');
    assert.ok(!dlg.includes('dbFetch'), 'a viewer reads context; it fetches nothing');
});

test('every activity row opens the viewer: three rails and both deal-modal lists', () => {
    for (const f of ['src/components/rails/ContactRail.jsx', 'src/components/rails/AccountRail.jsx', 'src/components/rails/TaskRail.jsx']) {
        const s = code(read(f));
        assert.ok(s.includes("import ActivityRowText from './ActivityRowText';"), f + ': shared row text');
        assert.ok(s.includes('<ActivityRowText activity={a} />'), f + ': row text');
        assert.ok(s.includes('onClick={() => setViewingActivity(a)}'), f + ': click opens the viewer');
        assert.ok(!s.includes("{a.notes || a.subject || 'No details'}"), f + ': the unclamped dump is gone');
    }
    const opp = code(read('src/components/modals/OpportunityModal.jsx'));
    assert.ok(opp.includes('label: a.type, date: a.date, notes: a.notes, activity: a,'), 'history items carry the row');
    assert.ok(opp.includes('onClick={item.activity ? () => setViewingActivity(item.activity) : undefined}'), 'History tab');
    assert.ok(opp.includes('onClick={e => { e.stopPropagation(); item.onDelete(); }}'), 'delete does not also open');
    assert.ok(opp.includes('onClick={() => setViewingActivity(a)}'), 'the Activity rail list');
    assert.equal((opp.match(/const \{ setViewingActivity \} = useApp\(\);/g) || []).length, 2, 'DealHistoryTab and RightRail');
    const row = code(read('src/components/rails/ActivityRowText.jsx'));
    assert.ok(row.includes('WebkitLineClamp: 2'), 'two-line clamp');
    assert.ok(row.includes('const { title, snippet } = previewOf(activity);'));
});

// ── item 27 (state §0.105): the viewer shows the envelope when the row has one ──

test('emailEnvelopeOf: every field present; a row logged before §0.105 has nothing to show', () => {
    assert.deepEqual(emailEnvelopeOf({ emailFrom: 'Ada Rep <ada@alpha.test>', emailTo: ['carl@client.test'], emailCc: [], emailMessageId: '<m1@alpha>' }),
        { from: 'Ada Rep <ada@alpha.test>', to: ['carl@client.test'], cc: [], messageId: '<m1@alpha>', any: true });
    assert.deepEqual(emailEnvelopeOf({ type: 'Email', notes: 'x' }), { from: '', to: [], cc: [], messageId: '', any: false }, 'REGRESSION: an old row renders as before');
    assert.deepEqual(emailEnvelopeOf({ emailTo: 'one@x.test', emailCc: [' ', 'b@x.test'] }).to, ['one@x.test'], 'a string To is a one-item list');
    assert.deepEqual(emailEnvelopeOf({ emailCc: [' ', 'b@x.test'] }).cc, ['b@x.test'], 'blanks dropped');
    assert.equal(emailEnvelopeOf(null).any, false);
});

test('the viewer renders From, To and Cc under the subject and the Message-ID in a footer — only when present', () => {
    const s = code(read('src/components/modals/ActivityDetailDialog.jsx'));
    assert.ok(s.includes("import { emailPartsOf, emailEnvelopeOf, canEditActivity } from '../../utils/activityView';"));
    assert.ok(s.includes('    const envelope = emailEnvelopeOf(activity);'), 'one envelope per render');
    assert.ok(s.includes('                        {envelope.any && ('), 'nothing is drawn for a row without one');
    assert.ok(s.includes("{envelope.from && <div><span style={{ color: T.inkMuted }}>From:</span> {envelope.from}</div>}"), 'From');
    assert.ok(s.includes("{envelope.to.length > 0 && <div><span style={{ color: T.inkMuted }}>To:</span> {envelope.to.join(', ')}</div>}"), 'To');
    assert.ok(s.includes("{envelope.cc.length > 0 && <div><span style={{ color: T.inkMuted }}>Cc:</span> {envelope.cc.join(', ')}</div>}"), 'Cc');
    assert.ok(s.includes('                    {envelope.messageId && ('), 'REGRESSION: the Message-ID footer');
    assert.ok(s.includes('Message-ID: {envelope.messageId}'));
});
