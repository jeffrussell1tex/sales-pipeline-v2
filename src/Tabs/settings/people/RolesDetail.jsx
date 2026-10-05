// settings/people/RolesDetail.jsx
//
// Honest by construction (state §0.171 — Jeff: "Fold it in"). What was here: a
// PT_ROLES constant — a hand-typed list of five roles, two of them ("Customer
// Success", "Finance / CFO") no role the app has — with invented member counts
// (Sales Rep: 28), a PT_PERMS grid of view /
// create / edit / delete / export / share / approve per object, rename,
// duplicate and delete for roles, and two saves (`roles`, `rolePermissions`) to
// settings keys nothing else read. No role was ever any of that: a role is one
// of six values on a member's roster row, and what each may do is fixed in
// src/utils/roles.js and enforced on the server. The page now shows exactly
// that, built from the functions the server runs (src/utils/roleAccess.js).
import React from 'react';
import { T } from '../shared/tokens.js';
import { SecCrumb, SecTitle, SecCallout, SecCard } from '../security/shared.jsx';
import { roleAccessRows } from '../../../utils/roleAccess.js';
import { activeMembersByRole } from './memberStatus.js';

const th = { padding:'8px 12px', fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', textAlign:'left', fontFamily:T.sans };
const td = { padding:'10px 12px', fontSize:13, color:T.inkMid, verticalAlign:'top', fontFamily:T.sans };

export const RolesDetail = ({ settings, onBack }) => {
    const rows       = roleAccessRows(settings || {});
    const roster     = settings?.users || [];
    const members    = activeMembersByRole(roster);
    const dispatchOn = !!settings?.dispatchEnabled;
    // Lead & deal visibility, read as the server reads it: an absent key leaves
    // unassigned leads visible and unassigned deals hidden.
    const leadsShown = settings?.unassignedLeadsVisibleToReps !== false;
    const dealsShown = settings?.unassignedDealsVisibleToReps === true;

    return (
        <div style={{ fontFamily:T.sans }}>
            <SecCrumb section="People & Teams" page="Roles & permissions" onBack={onBack}/>
            <SecTitle title="Roles & permissions"
                sub="Six roles · what each one allows is fixed, and enforced by the server"/>

            <SecCallout tone="info"
                text={<>
                    A member’s role is set on their profile — Settings → <b>Users</b> → a member — one role per member in each
                    workspace, and only an Admin changes it. What a role allows is not configurable: the table below is the rule
                    the server applies to every request, read from the same code.
                </>}/>

            <SecCard title="What each role can see and change"
                desc="Records are the CRM: leads, accounts, contacts, deals, tasks and activities. A quote goes where its deal goes.">
                <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', minWidth:560 }}>
                        <thead>
                            <tr style={{ background:T.surface2, borderBottom:`1px solid ${T.border}` }}>
                                <th style={th}>Role</th>
                                <th style={{ ...th, textAlign:'right' }}>Active members</th>
                                <th style={th}>Sees records</th>
                                <th style={th}>Changes records</th>
                                {dispatchOn && <th style={th}>Dispatch</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => (
                                <tr key={r.role} style={{ borderBottom:`1px solid ${T.border}` }}>
                                    <td style={td}>
                                        <div style={{ fontWeight:700, color:T.ink }}>{r.label}</div>
                                        <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:2 }}>{r.desc}</div>
                                    </td>
                                    <td style={{ ...td, textAlign:'right', color:T.ink, fontWeight:600 }}>{roster.length ? (members[r.role] || 0) : '—'}</td>
                                    <td style={td}>{r.records}</td>
                                    <td style={td}>{r.changes}</td>
                                    {dispatchOn && <td style={td}>{r.dispatch}</td>}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <ul style={{ margin:'14px 0 0', paddingLeft:18, fontSize:12.5, color:T.inkMid, lineHeight:1.7 }}>
                    <li>
                        “Their own” is the records a member owns. Unassigned leads are <b>{leadsShown ? 'visible' : 'hidden'}</b> to
                        them and unassigned deals <b>{dealsShown ? 'visible' : 'hidden'}</b> — Settings → Sales process → Lead &amp; deal visibility.
                    </li>
                    <li>
                        A Manager whose profile names their reps sees only those reps’ deals — and those deals’ quotes — and
                        the unassigned ones; every other record in full.
                    </li>
                    <li>
                        {dispatchOn
                            ? <>Sales Reps use Dispatch only while <b>Sales reps can use Dispatch</b> is on — Settings → Data → Features &amp; AI.</>
                            : <>Dispatch is off for this workspace, so no role uses it — Settings → Data → Features &amp; AI.</>}
                    </li>
                    <li>A deactivated member keeps their role and reaches nothing until an Admin reactivates them.</li>
                </ul>
            </SecCard>

            <SecCard title="An Admin’s alone" desc="Whatever the table says, these are refused to every other role.">
                <ul style={{ margin:0, paddingLeft:18, fontSize:13, color:T.inkMid, lineHeight:1.7 }}>
                    <li><b>Settings</b> — this page included — and every settings save.</li>
                    <li><b>Members and their roles</b>: changing a role; deactivating, reactivating or removing a member; inviting anyone
                        above a Sales Rep (a Manager may invite Sales Reps); revoking an invitation.</li>
                    <li><b>Data export</b>, its schedules, and the GDPR request queue.</li>
                    <li>On the Sales Manager page — which Admins and Managers open — the <b>commission plan</b> and the <b>SPIFF board</b>.</li>
                </ul>
            </SecCard>

            <SecCard title="Not available in Accelerep" desc="Said plainly, so nothing here promises what the app does not do.">
                <ul style={{ margin:0, paddingLeft:18, fontSize:13, color:T.inkMid, lineHeight:1.7 }}>
                    <li><b>Custom or renamed roles</b>, or a permission grid per object or action. The six roles above are the ones there are.</li>
                    <li><b>Per-field rules</b> — hiding or masking a field for a role. See Security → Field-level security.</li>
                </ul>
            </SecCard>
        </div>
    );
};
