# SESSION_HANDOFF.md

**Session of 2 September 2026 (the request flow ships end to end, the
Settings cleanup closes, the drift heals, and four open questions die),
FINAL.** Repo root. Read this first, then verify every claim in it against
the live repo before acting — **including the claims in this file**.

**Fast staleness check:** does `docs/ACCELEREP_CURRENT_STATE.md` contain
`### 0.59` with a paragraph beginning **"The two carried small items are
CLOSED"**, and does `docs/ACCELEREP_CODING_GUIDE.md` §19 carry **"trigger
WIDENED"**? If not, you are looking at a copy that predates this handoff.
Check section content, never dates.

---

## 1. What shipped — two pushed batches plus eight local commits

**The §0.58 set (Batches 1–7, pushed, deployed, and OBSERVED).** Jeff's
three morning calls became the claim-request flow: the Distribute panel
reads the ORG-WIDE pool (strict Mine had zeroed it — the "Auto-assign all
does nothing" report, diagnosed by reading); lead assignment is
Manager/Admin-only ON THE SERVER (leads.mjs PUT refuses any ownership
CHANGE from a non-canSeeAll caller, both halves compared — id AND
display-name string); `lead_claim_requests` + `lead-requests.mjs` (request
→ approve assigns to the requester and denies siblings / deny / cancel;
requester STAMPED from the caller; approve idempotent across its own
partial failure); UI for both chairs (Request/✓ Requested toggle,
RequestsPanel with Approve/Deny/Review); the pool's ways IN (managers'
"Leave unassigned" on create + "Unassign — return to pool" in the picker;
rep round-robin-to-colleagues retired, rep POST naming a colleague 403s);
the phantom row delete fixed (was setLeads-only, rendered for roles the
server refuses — now Admin-only and server-first); the status picker
retires the bulk window.prompt; Cockpit finally honors the clicked lead.
**The two-chair pass ran COMPLETE and Jeff re-ran it after every UX
batch:** Karen requested, Jeff reviewed and approved, the lead moved and
HELD. The DDL was applied by Jeff (classifier correctly blocked Claude's
write to the shared Neon main); `db/apply-lead-claim-requests.mjs` is the
committed record. Shipped: CI green, deploy marker-verified.

**The §0.59 set (pushed, deployed).** The SettingsTab cleanup, all four
queued items: audit rows name the CALLER as actor (users.mjs passed the
TARGET at all four writeAudit sites); the settings autosave diffs a
serialized SERVER BASELINE before PUTting (kills the junk
settings.updated audits AND the §0.53 non-writer 403 toast at the root);
the Reconcile button READ and verified working (its 6-row claim was the
real §0.54 drift); **the Security surfaces stopped inventing** —
smsNotifications-as-MFA replaced everywhere by ONE tri-state map from
`clerk-mfa-status` (which now returns `enrolledUsers`; unknown renders as
unknown, NEVER guessed), hardcoded SSO/session/password/audit
fabrications removed, SEVEN dead controls deleted. Plus: "NaNyr ago"
fixed (relAge now parses full ISO timestamps), and Settings alphabetized
(tabs A→Z with All pinned; cards by name; render-time sort, catalogue
stays category-grouped). Shipped: CI green on `28a001c`,
accelerep.netlify.app serving `index-CfSKnvfz.js`, markers verified.

**Eight commits LOCAL and UNPUSHED at write time** (`6a059c2` →
this handoff; push decision is Jeff's): the MFA rail label made
tri-state-aware (Jeff caught "0/4 · all enrolled" live); guide §19's
functions trap WIDENED (below); the dev-org role drift CLOSED; the MFA
tri-state browser-observed; **rep-role GET coverage for the §0.48 four**
(12 tests: own+unassigned/never-a-colleague, Admin-all, null-caller
fail-closed; tasks suite gained its FIRST user seed, appended last);
**the §0.56 API-key question CLOSED SAFE and pinned**
(`tests/api-surface.test.mjs`: public-api 405s non-GET BEFORE key
parsing, verifyAuth has no key branch, nothing else consults apiKeys —
a future consumer fails the directory scan); and the two carried small
items (below).

## 2. The lesson that paid four times: probe before diagnosing

Guide §19's functions-side twin, written mid-session and WIDENED the same
day: under a long-running `netlify dev`, individual functions land in a
broken serve state (CJS shim parsed as ESM under `"type":"module"`),
NONDETERMINISTICALLY — the observed broken set was a NEW function
(lead-requests), a MODIFIED one (clerk-mfa-status), and an UNTOUCHED one
(`user-role`, which silently ATE JEFF'S FIRST TWO ROLE SAVES), while
equally-modified siblings served fine. Cache-dir deletion does not
recover (dead registration, ENOENT); the fix is a RESTART, full stop.
Recognition: probe the URL FIRST — 401 JSON = loaded and gated, ESM/
ENOENT 500 = stale serve; user-role's 405 (= parsed and ran) was the
proof that unblocked the drift fix. The same probe closed the untriaged
`documents.mjs` local 500 in ONE REQUEST: `@aws-sdk/client-s3` was never
installed — prod worked only because AWS Lambda's Node 18+ runtime ships
SDK v3 unpinned. Both R2 packages are now pinned dependencies
(^3.1124.0); the local re-probe rides the next dev-server restart.

## 3. Also closed at the end

**The dev-org role drift**: 5 refused values → column drift ZERO across
all three orgs. Reconcile was correctly silent (Clerk held NO role for
the `member` rows — nothing for a dry run to count); the §0.54 per-row
role-save path healed Clerk + column + blob together, verified by
`check-mirror-roles` re-run. One cosmetic blob residue remains
(smiller@test.com, plus Jeff's Admin/Technician blob split) — self-heals
on those rows' next real write; nothing authorizes on the blob.
**The static-landing flash**: a parser-blocking inline script hides the
crawler landing before FIRST PAINT for JS browsers and shows a
`#boot-splash` wordmark (both inside `#root`, replaced on mount); no-JS
crawlers never run it and keep the full page. Verified live AND in the
built `dist/index.html` before the §19 `rm -rf dist`.

## 4. Verified state at close (all observed 2 Sep)

Gates green · **301/301 unit** · **79/79 integration** · **99/99
mutations, printed green baseline** · build 2,476+ kB, bundle guard OK,
`dist/` cleared after every local gate build · MFA tri-state observed in
all three states (known-off dots + "0/4 · 4 off" real from Clerk;
unknown during the outage; known-ON has no dev-instance account to
produce it) · `dev` deployed and verified through `d8665b3`
(`index-CfSKnvfz.js`); **`master`/prod deliberately holds pre-§0.58
code** — prod still has direct rep claiming until Jeff moves it.

## 5. Next — start here

1. **Ritual:** this file, `check:handoff`, `git status`. Expect the
   local-vs-origin/dev gap unless Jeff pushed after this was written.
2. **Push the local batch** (Jeff's call), then CI + deploy markers —
   the pattern is proven twice this session.
3. **The prod ship decision**: `master` fast-forward when Jeff has lived
   with the request flow on dev. Remember prod REPS LOSE DIRECT
   CLAIMING the moment it lands — that is the designed behavior.
4. **The two-minute signed-in prod eyeball** — carried from 1 Sep,
   unchanged (prod has not moved).
5. After the next `netlify dev` restart: re-probe `documents` (expect
   401) — the last unverified inch of the R2 dependency fix.
6. Smaller carried: the `+'T12:00:00'` date-pattern audit (a spawned
   background-task chip exists); the Security health PAGE click-through
   as Admin (list dots and rail are observed; the page itself renders
   from the same map); rep-role — the opportunities Manager
   `managedReps` branch stays name-based by documented intent (Phase-2
   id migration); picker-format replication as surfaces get touched.
7. Session quirks worth knowing: PowerShell 5.1 mangled a here-string
   commit message containing double quotes (use multiple `-m`);
   `mutate-import` must never be invoked twice in one command nor piped
   through `Select-Object -First` (it kills the harness mid-mutation —
   leftover mutations in the tree, twice, both caught by `git status`).

## 6. The thread

A session that started as "continue the queue" turned into the request
flow shipping whole: seven batches, each one verified before the next,
with Jeff running the two-chair pass after every UX change and finding
something real each time — the pool with no way in, the phantom delete,
the stretched button, the dead function eating his clicks. The pattern
that held all day: read before writing, probe before diagnosing, pin
every closed question with a test that would catch its reopening. Four
long-standing open questions died today — the §0.53 toast, the §0.54
audit actor, the §0.56 API keys, the dev-org drift — and none of them
died by assumption: each closure names the evidence, and three of them
now have suites that fail if the answer ever changes. Observed, then
written, then committed, all day, in that order.
