// scripts/patch-state-054.mjs — state doc: header refresh + §0.54.
// Dry-run by default; --apply writes ONCE and re-reads from disk to confirm.
import { readFileSync, writeFileSync } from 'fs';
const APPLY = process.argv.includes('--apply');
const path = 'docs/ACCELEREP_CURRENT_STATE.md';
let src = readFileSync(path, 'utf8');
const NL = '\r\n';
let fail = false;
const check = (name, s, expect) => {
    const n = src.split(s).length - 1;
    const ok = n === expect;
    if (!ok) fail = true;
    console.log(`${ok ? 'ok  ' : 'FAIL'} [${n}/${expect}] ${name}`);
    return ok;
};

// ── 1. Verified-at line, replaced wholesale ──
const oldVerified = "**Verified at:** all six gates green (143 tdz files) · **278 tests** · **31 integration tests** · **85/85 mutations caught, ON A VERIFIED GREEN BASELINE, zero STALE** · build 2,465 kB · **toggle browser-verified on LOCAL dev, both roles, 31 Aug** — Karen 4 (strict) / 23 (permissive), reconciled ROW-LEVEL against `ownerId` (4 × her `usr_…`, 19 × null, zero foreign owners); Admin 23 in both states; badge round-trip and Mine/All persistence confirmed (§0.53). The 28-Aug dev/prod after-counts (§0.50) still stand for the fixed predicate.";
const newVerified = "**Verified at:** all six gates green (143 tdz files) · **279 tests** · **33 integration tests** · **86/86 mutations caught, ON A VERIFIED GREEN BASELINE, zero STALE** · build 2,466 kB · **dev-org hygiene applied and post-verified** — 13 stale `assignedTo` names cleared on `ownerId: null` rows, zero candidates remain · **prod role checks both exit clean** — `check-clerk-roles` 7 memberships / 0 findings, `check-mirror-roles` 14 rows / 0 refused values · **Unassigned counts browser-verified on LOCAL dev as Admin, 31 Aug** — chip and Distribute panel at 19, load bars owned-only, one assignment round-trip surviving reload with every other field intact (§0.54). §0.53's Karen row-level reconciliation stands for the read policy.";
check('Verified-at line', oldVerified, 1);

// ── 2. New Batch line; old Batch becomes Prior batch ──
const batchMarker = "**Batch:** **the unassigned half";
const newBatch = "**Batch:** **the leads PUT overwrite path is closed** — `saveLead` has always sent `{ id, ...patch }` while `sanitize()` rebuilt the whole row, so a two-key status change nulled every other column (the client's local merge masked it until reload); the PUT now sanitizes the payload OVERLAID ON THE STORED ROW (`sanitize({ ...existing, ...data })`, the users.mjs `mergeForUpdate` pattern minus the blob flatten), with `ownerIdForUpdate` still fed the RAW body so 18b13's mentioned-assignedTo detection is untouched · held closed three ways: integration test (partial PUT preserves nine fields; explicit null still clears), a SOURCE-ASSERTION guard in `tests/partial-sanitize.test.mjs` (the harness runs unit suites only), and mutation #86 · **unassigned-ness keys on `ownerId` across LeadsTab** — both chips, both filters, the triage lane, the Distribute pool/count and the subtitle (they undercounted 6 vs 19 by counting names); Distribute load bars count `l.ownerId === id` via a `reps` `{id, name}` roster (settings.users carries the usr_ id for every role); the assignment payload stays NAME-keyed on purpose — the server resolves it and 409s ambiguity · **13 stale `assignedTo` ghosts cleared on dev** via `scripts/clear-stale-assigned-names.mjs` — dry-run reviewed, `--apply --org --expect` pinned, post-verified zero remain · **prod roles cleanup CLOSED both sides** (morning, commits `92386aa`+`34a3f94`): Clerk held ONE refused value (`\"Sales Rep\"` on the live.com user — the label-as-value seed), fixed via the UI and re-run clean; the mirror's `member` ×4 were UKG rows fixed through the `user-role` path after a single-subject validation with three controls, both locations (column + frozen blob) healing per save; two read-only verifiers added (`check-mirror-roles.mjs`, `list-clerk-members.mjs`) · **a prod `sk_live_` Clerk key was committed locally** (`93571f4`, sole-file commit), caught pre-push by `ls-files`/`check-ignore` disagreeing, reset out — the key never left the machine; `.env.clerk-prod` ignore rule added (§0.54)" + NL;
check('Batch marker', batchMarker, 1);

// ── 3. §0.54 before the 0P0 archive heading ──
const archAnchor = "## 0P0. Prior Batch — One Role Vocabulary, And A Gate That Allows Instead Of Denies";
check('0P0 heading', archAnchor, 1);

const s054 = [
"### 0.54 The leads overwrite path, ownerId-keyed unassigned counts, stale-name hygiene, and the prod roles close-out (31 Aug, second session)",
"",
"**The overwrite path — found by reading, closed the same day.** The queued",
"hygiene item (\"move the Unassigned chips to `ownerId`\") sat on top of a live",
"bug: `saveLead` sends `{ id, ...patch }`, `leads.mjs` PUT fed that straight",
"into a full-row `sanitize()`, and the upsert wrote the result with",
"`set: { ...updateData }` — so a two-key status change REPLACED the row,",
"nulling `firstName`, `lastName`, `company`, `email`, `phone`, `source`,",
"`notes`, `estimatedARR` and `assignedTo`. Only `firstTouchDate`/`convertedAt`",
"had preservation. The client's optimistic local merge kept the fields on",
"screen, so the wipe only ever showed on reload — the users.mjs §0.44 wipe,",
"same mechanism, different endpoint, and the carried-forward \"leads overwrite",
"path\" item located at last. Doing the UI half first would have armed it: an",
"honest 19-row unassigned pool feeding \"Auto-assign all\" through a wiping PUT.",
"So the merge went in first:",
"",
"```js",
"const clean = sanitize({ ...existing, ...data });",
"```",
"",
"— the `mergeForUpdate` pattern minus the blob flatten (lead rows are flat).",
"Field-present semantics: a key sent is applied, including an explicit null; a",
"key omitted keeps its stored value. `ownerIdForUpdate` still receives the RAW",
"body — merging first would make every PUT look like it mentioned `assignedTo`",
"and defeat 18b13's change detection. A quiet second fix rode along: partial",
"PUTs had been re-scoring leads from mostly-null rows.",
"",
"**Held closed three ways**, because the harness cannot see it directly: the",
"integration pair (a partial PUT preserves nine asserted fields; an explicit",
"null still clears — field-present, not field-protection), a source-assertion",
"guard in `tests/partial-sanitize.test.mjs` (the mutation harness runs UNIT",
"suites only, so the rule is pinned where the harness can see it: the merged",
"call present exactly once, the bare `sanitize(data)` absent), and harness",
"mutation #86 reverting the merge — simulated caught before delivery, CAUGHT",
"on the real tree. 279 unit / 33 integration / 86-86.",
"",
"**Unassigned-ness keys on `ownerId`** everywhere it is a PREDICATE: both",
"status chips, both view filters, the triage \"Needs first touch\" lane, the",
"Distribute pool and count, and the subtitle — all previously `!l.assignee`,",
"undercounting the real pool 6 vs 19 because thirteen ghosts carried names.",
"The Distribute load bars now count `l.ownerId === id` from a `reps`",
"`{id, name}` roster (`settings.users` is the users.mjs `flatten()` shape and",
"carries the usr_ id even in the rep directory read). The assignment payload",
"stays NAME-keyed deliberately: the server resolves the name and refuses",
"ambiguity with a 409 rather than the client guessing. The `!lead.assignee`",
"DISPLAY sites (next-action text, the assignee card) were left alone — showing",
"a name is what they are for; owner-set/name-null rows exist (single creates",
"stamp the caller silently) and an ownerId predicate there would render an",
"avatar with no name.",
"",
"**The hygiene run.** `scripts/clear-stale-assigned-names.mjs`: dry-run by",
"default (13 candidates, all in the dev org, the ZZFX fixture among them —",
"matching §0.53's browser reconciliation to the row; UKG contributed zero);",
"`--apply` demands `--org` and `--expect=N`, refuses if the live count moved,",
"detects the physical column spelling from a sample row rather than assuming,",
"and post-verifies BY RE-SELECTING. Cleared 13, zero remain. Backfilling",
"`ownerId` FROM the names was rejected explicitly: resolving ownership by",
"display-name equality is the hazard the id migration removed.",
"",
"**The morning: prod roles cleanup closed on both sides** (commits `92386aa`,",
"`34a3f94`). The remembered \"five of six mirror rows\" resolved cleanly: Clerk",
"itself held exactly ONE refused value — `\"Sales Rep\"` on the live.com user,",
"the invite-label-as-value seed the checker's own header predicts — fixed in",
"the UI, re-run clean (7 memberships, 0 findings). The `member` ×4 lived only",
"in the mirror (column AND frozen `profile.userType` blob, both locations),",
"on four UKG test accounts whose Clerk role is ABSENT — nobody was 403ing.",
"Fixed through the `user-role` UI path after a single-subject validation",
"(Andy as subject, three controls held, network capture, row-level re-read);",
"each save healed column and blob together. One row set to Manager was",
"DELIBERATE. Two read-only verifiers joined `scripts/`: `check-mirror-roles`",
"(SELECT-only, both locations, tolerant of column spelling, exit 1 on",
"findings) and `list-clerk-members` (full membership with Clerk identifiers —",
"the roster email and the Clerk login can DIVERGE via the display-name link",
"fallback, which is how the UKG Admin row reads `jeff.russell@ukg.com` while",
"the account signs in as the yahoo address).",
"",
"**The key incident, resolved.** `.env.clerk-prod` carrying a live `sk_live_`",
"was committed locally (`93571f4`, message \"1\", sole file) BEFORE the ignore",
"rule existed — which is why `check-ignore` stayed silent through an entire",
"red-herring chase of the pattern: ignore rules do not apply to tracked",
"files. `ls-files` (prints it) vs `check-ignore --no-index` (matches) split",
"the diagnosis in one step. `git reset HEAD~1` dropped the commit; the key",
"never left the machine (no remote contained the commit); rotation optional.",
"The ignore rule is committed. Standing lesson: a reflexive `commit -am`",
"nearly pushed a prod secret — named adds only while secrets sit ignored.",
"",
"**Found and QUEUED, deliberately untouched** (SettingsTab cleanup pass):",
"audit `user.updated` events attribute the TARGET as actor (the paired",
"`user.role.changed` rows attribute correctly — the bug is in the users.mjs",
"PUT's writeAudit call); the settings autosave fired ~9 junk `settings.updated`",
"audit events across three role saves (the §0.53 useSettings debt, now shown",
"polluting the audit trail, not just consoles); the roster's \"Out of sync",
"with Clerk / Reconcile\" button is UNREAD code claiming 6-row drift; the user",
"profile Security card contradicts the list view on MFA/SSO. Dev-org role",
"drift remains: org_3B8Tg `member` ×2 (both locations), org_3BDQ one blob-only",
"(`smiller`, self-heals on next write) plus an Admin/Technician blob split on",
"a valid row.",
"",
"---",
"",
""].join(NL);

if (fail) { console.error('REFUSING: anchor counts wrong'); process.exit(1); }
if (!APPLY) { console.log('dry-run OK — rerun with --apply'); process.exit(0); }
src = src.replace(oldVerified, newVerified);
src = src.replace(batchMarker, newBatch + "**Prior batch:** **the unassigned half");
src = src.replace(archAnchor, s054 + archAnchor);
writeFileSync(path, src);
const re = readFileSync(path, 'utf8');
console.log('re-read from disk: 0.54 heading present:', re.includes('### 0.54 The leads overwrite path'));
console.log('re-read from disk: 279 tests in header:', re.includes('**279 tests**'));
console.log('re-read from disk: exactly one Batch line:', re.split('**Batch:**').length - 1 === 1);
