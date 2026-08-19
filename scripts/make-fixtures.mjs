#!/usr/bin/env node
// make-fixtures.mjs — generate the delete-gate fixture CSVs.
//
// WHY THIS IS A GENERATOR AND NOT FOUR STATIC FILES
// -------------------------------------------------
// Ownership in this codebase is matched by DISPLAY NAME, not by id:
//
//   opportunities  ownerColumn = opportunities.salesRep      (a name string)
//   accounts       ownerColumn = accounts.accountOwner       (a name string)
//   leads          ownerColumn = leads.assignedTo            (a name string)
//   contacts       ownerColumn = contacts.createdBy          (never populated)
//   tasks          ownerColumn = tasks.assignedTo
//   activities     ownerColumn = activities.repName
//
// and the caller's side of that comparison is `getCallerName(userId)` in
// _lib.mjs, which reads ONE column: `users.name` for the caller's Clerk user id.
//
// So the whole fixture turns on a single string. If it does not match
// `users.name` byte for byte, every ownership check fails, every DELETE returns
// the OWNERSHIP 403 rather than the ADMIN-GATE 403, and the gate reads as
// passing while proving nothing. That string is not knowable from the repo —
// it has to be read out of the database — so it is an argument, not a literal.
//
// USAGE
//   node make-fixtures.mjs --rep="Karen Whitfield"
//   node make-fixtures.mjs --rep="Karen Whitfield" --other="ZZFX Other Rep" --out=./fixtures
//
// --rep    REQUIRED unless you pass --allow-placeholder. Exact value of
//          `users.name` for the rep account. See step 0 of the manifest.
// --other  A second owner name used for the "someone else's record" cases. It
//          must NOT be a real user: these rows exist to be refused, and naming
//          a real person would make them visible to that person instead.
// --out    Output directory. Default ./fixtures
// --prefix Record-name prefix. Default ZZFX. Deliberately NOT ZZTest — the
//          legacy ZZTest rows in the current dev org are evidence of the
//          §0.22 stage-clock damage and must stay distinguishable from these.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ── args ─────────────────────────────────────────────────────────────────────

const argv = Object.fromEntries(
    process.argv.slice(2).map(a => {
        const m = a.match(/^--([^=]+)(?:=(.*))?$/);
        return m ? [m[1], m[2] ?? true] : [a, true];
    })
);

const PLACEHOLDER = 'Karen Tester';
const REP    = typeof argv.rep === 'string' ? argv.rep : PLACEHOLDER;
const OTHER  = typeof argv.other === 'string' ? argv.other : 'ZZFX Other Rep';
const OUT    = typeof argv.out === 'string' ? argv.out : './fixtures';
const PREFIX = typeof argv.prefix === 'string' ? argv.prefix : 'ZZFX';

if (REP === PLACEHOLDER && !argv['allow-placeholder']) {
    console.error(`
  REFUSING TO GENERATE.

  --rep was not supplied, so the owner column would be "${PLACEHOLDER}" — a name
  that matches no users.name row. Every ownership check would fail and the
  delete gate would return the OWNERSHIP 403 on every subject, which is
  indistinguishable from the Admin gate working and proves nothing.

  Read the exact value first (step 0 of the manifest), then:

      node make-fixtures.mjs --rep="<exact users.name>"

  To generate anyway, e.g. to inspect the shape: --allow-placeholder
`);
    process.exit(1);
}

if (REP === OTHER) {
    console.error('  REFUSING: --rep and --other are the same string. The refused cases would be indistinguishable from the allowed ones.');
    process.exit(1);
}

// ── CSV writer ───────────────────────────────────────────────────────────────
// Both importers parse quotes and doubled quotes ("" -> ") and TRIM each field,
// so leading/trailing spaces in a value are lost either way. Quote defensively:
// a comma inside a value silently shifts every column to its right, and the
// importers have no way to report that.

const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const toCsv = (headers, rows) =>
    [headers.map(cell).join(','), ...rows.map(r => r.map(cell).join(','))].join('\r\n') + '\r\n';

// ── accounts ─────────────────────────────────────────────────────────────────
// Header names are chosen to score 1.0 against csvAutoMap's ALIASES so the
// mapping step needs no hand-correction. "Account Owner" is denied to the `name`
// field by DENY.name (/owner/), so it cannot be misclaimed.
//
// Ashgrove is a parent with two children ON PURPOSE. accounts.mjs DELETE runs
// the child-promotion UPDATE *before* the Admin role gate, so a refused delete
// still detaches the children permanently. That is a known open defect and this
// is the fixture that evidences it.

const ACCOUNT_HEADERS = [
    'Account Name', 'Parent Account', 'Vertical Market', 'Account Owner',
    'Phone', 'Website', 'Address', 'City', 'State', 'ZIP Code', 'Country',
];

const accounts = [
    [`${PREFIX} Ashgrove Holdings`, '',                            'Manufacturing', REP,   '214-555-0142', 'https://ashgrove.example.com',                                  '1400 Foundry Rd',   'Dallas',      'TX', '75201', 'USA'],
    [`${PREFIX} Ashgrove North`,    `${PREFIX} Ashgrove Holdings`, 'Manufacturing', REP,   '214-555-0143', 'https://north.ashgrove.example.com',                            '22 Kiln St',        'Plano',       'TX', '75024', 'USA'],
    [`${PREFIX} Ashgrove South`,    `${PREFIX} Ashgrove Holdings`, 'Manufacturing', REP,   '214-555-0144', 'https://south.ashgrove.example.com',                            '8 Anvil Way',       'Waco',        'TX', '76701', 'USA'],
    [`${PREFIX} Beacon Metals`,     '',                            'Industrial',    REP,   '512-555-0117', 'https://beaconmetals.example.com',                              '901 Ingot Blvd',    'Austin',      'TX', '78701', 'USA'],
    [`${PREFIX} Cinder Logistics`,  '',                            'Transportation', '',   '713-555-0188', 'https://cinderlogistics.example.com',                           '55 Depot Ln',       'Houston',     'TX', '77002', 'USA'],
    [`${PREFIX} Dovetail Systems`,  '',                            'Technology',    OTHER, '469-555-0155', 'https://dovetailsystems.example.com',                           '300 Joinery Ct',    'Irving',      'TX', '75039', 'USA'],
    [`${PREFIX} Elmwood Foods`,     '',                            'Food & Bev',    REP,   '817-555-0121', 'https://elmwoodfoods.example.com',                              '77 Orchard Pkwy',   'Fort Worth',  'TX', '76102', 'USA'],
    // Markdown-wrapped URL — exercises cleanWebsite() in accounts.mjs, which
    // unwraps [text](href). If this row lands with the brackets intact, the
    // normalizer regressed.
    [`${PREFIX} Fenwick Group`,     '',                            'Professional Services', '', '210-555-0163', '[www.fenwickgroup.example.com](https://www.fenwickgroup.example.com)', '12 Chancery Sq', 'San Antonio', 'TX', '78205', 'USA'],
    [`${PREFIX} Granite Partners`,  '',                            'Construction',  OTHER, '972-555-0134', 'https://granitepartners.example.com',                           '4 Quarry Rise',     'Frisco',      'TX', '75034', 'USA'],
    [`${PREFIX} Harborline Marine`, '',                            'Marine',        REP,   '361-555-0109', 'https://harborline.example.com',                                '19 Pier Ave',       'Corpus Christi', 'TX', '78401', 'USA'],
];

// ── contacts ─────────────────────────────────────────────────────────────────
// contacts.mjs `sanitize()` has NO createdBy key, so nothing populates the
// column on any insert path. Every imported contact therefore has a null owner,
// the ownership check passes for anyone, and there is no Admin gate on the
// contacts DELETE. That is what makes contacts the cleanest 200 subject.
//
// Row 9 has neither first nor last name. It is deliberate: mapCsvRows drops it
// and describeDropped() must say so at Preview. A silent drop here is the §0.6
// regression.

const CONTACT_HEADERS = [
    'First Name', 'Last Name', 'Email', 'Business Phone', 'Mobile Phone',
    'Job Title', 'Company', 'Address', 'City', 'State', 'ZIP Code',
];

const contacts = [
    ['Marisol', 'Trent',   'marisol.trent@ashgrove.example.com',  '214-555-0201', '214-555-0301', 'VP Operations',      `${PREFIX} Ashgrove Holdings`, '1400 Foundry Rd', 'Dallas',      'TX', '75201'],
    ['Devon',   'Achebe',  'devon.achebe@ashgrove.example.com',   '214-555-0202', '214-555-0302', 'Plant Manager',      `${PREFIX} Ashgrove North`,    '22 Kiln St',      'Plano',       'TX', '75024'],
    ['Priyanka','Rao',     'priyanka.rao@beaconmetals.example.com','512-555-0203','512-555-0303', 'Director of Supply', `${PREFIX} Beacon Metals`,     '901 Ingot Blvd',  'Austin',      'TX', '78701'],
    ['Tomas',   'Berg',    'tomas.berg@cinderlogistics.example.com','713-555-0204','713-555-0304','Fleet Lead',         `${PREFIX} Cinder Logistics`,  '55 Depot Ln',     'Houston',     'TX', '77002'],
    ['Ada',     'Whitlock', 'ada.whitlock@dovetailsystems.example.com','469-555-0205','469-555-0305','CTO',             `${PREFIX} Dovetail Systems`,  '300 Joinery Ct',  'Irving',      'TX', '75039'],
    ['Noor',    'Haddad',  'noor.haddad@elmwoodfoods.example.com','817-555-0206', '817-555-0306', 'Procurement Manager',`${PREFIX} Elmwood Foods`,     '77 Orchard Pkwy', 'Fort Worth',  'TX', '76102'],
    // Mononym — one required field present, the other absent. mapCsvRows uses
    // `.some`, not `.every`, so this row MUST survive. If it is dropped, the
    // required-field rule was tightened and real files will start failing.
    ['Sunniva',  '',       'sunniva@fenwickgroup.example.com',    '210-555-0207', '',             'Principal',          `${PREFIX} Fenwick Group`,     '12 Chancery Sq',  'San Antonio', 'TX', '78205'],
    ['Emeka',   'Obi',     'emeka.obi@harborline.example.com',    '361-555-0208', '361-555-0308', 'Service Director',   `${PREFIX} Harborline Marine`, '19 Pier Ave',     'Corpus Christi','TX','78401'],
    // Intentionally unnamed — expected to be DROPPED and REPORTED at Preview.
    ['',        '',        'noname@granitepartners.example.com',  '972-555-0209', '',             'Unknown',            `${PREFIX} Granite Partners`,  '4 Quarry Rise',   'Frisco',      'TX', '75034'],
];

// ── opportunities ────────────────────────────────────────────────────────────
// NOTE THE GAP: there is no way to import an UNASSIGNED opportunity.
// buildOpportunityRow does `merged.salesRep = merged.salesRep || currentUser`,
// so a blank Sales Rep column becomes whoever ran the import — an Admin-owned
// deal, not an unowned one. The unassigned-owner case is covered by accounts
// (Cinder, Fenwick) and leads instead, where no such default exists.
//
// Stage and Products values come from the SHIPPED vocabularies in
// src/utils/constants.js (`stages`, `productOptions`). Nothing validates either
// on import -- buildOpportunityRow only substitutes a default for an EMPTY
// stage -- so an invented value lands in the database as an unrecognised stage
// that groups into no funnel column. 'Negotiation/Review' is the real name;
// 'Negotiation' is not.
//
// Close dates are chosen to straddle the fiscal-year disagreement recorded in
// the handoff (§4): ListView.jsx:349 falls back to `|| 1`, everything else to
// `|| 10`. In an org with no settings row those two produce different quarter
// labels for the SAME deal.

const OPPORTUNITY_HEADERS = [
    'Opportunity Name', 'Account Name', 'Sales Rep', 'Stage', 'ARR',
    'Implementation Cost', 'Close Date', 'Products', 'Notes', 'Next Steps',
    'Territory', 'Vertical', 'Probability', 'Created Date', 'Days in Stage',
];

const opportunities = [
    [`${PREFIX} Ashgrove Renewal`,    `${PREFIX} Ashgrove Holdings`, REP,   'Discovery',     '84000',  '9000',  '2026-11-15', 'Shiftboard',           'Renewal cycle opens Q1.',        'Confirm budget holder', 'Central', 'Manufacturing', '35', '2026-06-02', '12'],
    [`${PREFIX} Beacon Expansion`,    `${PREFIX} Beacon Metals`,     REP,   'Proposal',      '126000', '15000', '2027-01-10', 'Shiftboard, AutoCall', 'Second site added to scope.',   'Send revised proposal', 'Central', 'Industrial',    '60', '2026-05-18', '3'],
    [`${PREFIX} Cinder New Logo`,     `${PREFIX} Cinder Logistics`,  REP,   'Negotiation/Review','210000', '24000', '2026-09-30', 'Shiftboard',           'Legal review in progress.',      'Redline turnaround',    'Gulf',    'Transportation','75', '2026-04-09', '21'],
    [`${PREFIX} Dovetail Upgrade`,    `${PREFIX} Dovetail Systems`,  OTHER, 'Qualification', '48000',  '6000',  '2026-12-04', 'AutoCall',             'Not this rep\u2019s deal \u2014 refusal subject.', 'Discovery call', 'North', 'Technology', '20', '2026-07-01', '5'],
    [`${PREFIX} Elmwood Refresh`,     `${PREFIX} Elmwood Foods`,     REP,   'Closed Won',    '95000',  '11000', '2026-07-31', 'Shiftboard, Timesheets','Won \u2014 handed to onboarding.','Kickoff scheduled',    'Central', 'Food & Bev',    '100','2026-02-14', '30'],
    // No close date. Undated deals were invisible in the Pipeline list until
    // §0.8; this row keeps that fixed behaviour under test.
    [`${PREFIX} Fenwick Pilot`,       `${PREFIX} Fenwick Group`,     REP,   'Discovery',     '32000',  '4000',  '',           'Timesheets',           'Undated on purpose.',            'Agree pilot scope',     'South',   'Professional Services','15','2026-06-20','8'],
    [`${PREFIX} Granite Retrofit`,    `${PREFIX} Granite Partners`,  OTHER, 'Proposal',      '73000',  '8000',  '2026-10-22', 'AutoCall',             'Other rep \u2014 invisible to the rep account.', 'Follow up', 'North', 'Construction', '50','2026-05-05','14'],
    [`${PREFIX} Harborline Service`,  `${PREFIX} Harborline Marine`, REP,   'Discovery',     '58000',  '7000',  '2026-11-15', 'Timesheets',           'Same close date as Ashgrove Renewal \u2014 quarter-label probe.', 'Site survey', 'Gulf', 'Marine', '30', '2026-06-11', '6'],
    [`${PREFIX} Ashgrove Support`,    `${PREFIX} Ashgrove Holdings`, REP,   'Qualification', '26000',  '3000',  '2027-01-10', 'AutoCall',             'Second quarter-label probe.',    'Scope support tier',    'Central', 'Manufacturing', '25', '2026-07-15', '2'],
    // Days in Stage deliberately blank — the fourth stage-clock case, and the
    // one that failed on dev before §0.22.
    [`${PREFIX} Beacon Trial`,        `${PREFIX} Beacon Metals`,     REP,   'Discovery',     '18000',  '2000',  '2026-12-18', 'Shiftboard',           'Days in Stage left empty.',      'Convert trial',         'Central', 'Industrial',    '10', '2026-08-01', ''],
];

// ── leads ────────────────────────────────────────────────────────────────────
// LeadImportModal has its OWN field list and its OWN matcher — it never adopted
// csvAutoMap, so it still uses first-match-wins substring matching in both
// directions. Headers below are exact matches for the field keys, which is the
// only reliable input to that matcher.
//
// Status and Source are validated against fixed vocabularies: an unrecognised
// Status silently becomes 'New', an unrecognised Source becomes the raw string.
// Every value below is in the allowed list.
//
// leads.mjs POST has NO array branch, so this file imports at one request per
// row. Keep it small.

const LEAD_HEADERS = [
    'First Name', 'Last Name', 'Company', 'Job Title', 'Email', 'Phone',
    'Source', 'Status', 'Score', 'Estimated ARR', 'Assigned To', 'Notes',
];

const leads = [
    ['Ivo',    'Karlsen',  `${PREFIX} Ashgrove Holdings`, 'Operations Analyst', 'ivo.karlsen@ashgrove.example.com',      '214-555-0401', 'Trade Show', 'Qualified', '72', '40000', REP,   'Rep-owned \u2014 Admin-gate subject.'],
    ['Lena',   'Fournier', `${PREFIX} Beacon Metals`,     'Buyer',              'lena.fournier@beaconmetals.example.com','512-555-0402', 'Referral',   'Contacted', '58', '25000', REP,   'Rep-owned spare.'],
    ['Kwame',  'Boateng',  `${PREFIX} Cinder Logistics`,  'Dispatch Lead',      'kwame.boateng@cinderlogistics.example.com','713-555-0403','Web Form', 'Working',   '64', '31000', REP,   'Rep-owned spare.'],
    ['Yuki',   'Tanabe',   `${PREFIX} Dovetail Systems`,  'IT Director',        'yuki.tanabe@dovetailsystems.example.com','469-555-0404','LinkedIn',  'New',       '45', '18000', OTHER, 'Other rep \u2014 refusal subject, invisible to the rep account.'],
    ['Rosa',   'Delacroix',`${PREFIX} Fenwick Group`,     'Partner',            'rosa.delacroix@fenwickgroup.example.com','210-555-0405','Cold List', 'New',       '38', '12000', '',    'Unassigned \u2014 visible to the rep, ownership check passes.'],
    ['Mattias','Holm',     `${PREFIX} Harborline Marine`, 'Fleet Supervisor',   'mattias.holm@harborline.example.com',   '361-555-0406', 'Email',      'Contacted', '51', '22000', '',    'Unassigned spare.'],
];

// ── emit ─────────────────────────────────────────────────────────────────────

mkdirSync(OUT, { recursive: true });

const files = [
    [`${PREFIX}-accounts.csv`,      toCsv(ACCOUNT_HEADERS, accounts)],
    [`${PREFIX}-contacts.csv`,      toCsv(CONTACT_HEADERS, contacts)],
    [`${PREFIX}-opportunities.csv`, toCsv(OPPORTUNITY_HEADERS, opportunities)],
    [`${PREFIX}-leads.csv`,         toCsv(LEAD_HEADERS, leads)],
];

for (const [name, body] of files) {
    writeFileSync(join(OUT, name), body, 'utf8');
    console.log(`  wrote ${join(OUT, name)}`);
}

console.log(`
  rep owner   : ${REP}${REP === PLACEHOLDER ? '   <-- PLACEHOLDER, ownership will NOT match' : ''}
  other owner : ${OTHER}
  rows        : ${accounts.length} accounts (1 parent + 2 children), ${contacts.length} contacts (1 will be dropped at Preview), ${opportunities.length} opportunities, ${leads.length} leads

  Import order matters: accounts, then contacts, then opportunities, then leads.
`);
