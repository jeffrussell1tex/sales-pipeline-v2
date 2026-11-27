// tests/digest-prefs.test.mjs
//
// State §0.101. `bf4a3c5` (7 Apr 2026, "text bug fix 2") touched TWO files:
// pipeline-alerts.mjs — fixed in §0.95 — and digest.mjs, where the same rename
// left `wantsDigest` and `wantsSms` reading `profile`, a name bound only inside
// the handler's user loop. The first user whose digest hour matched the clock
// threw ReferenceError, the outer catch answered 500, and Netlify retried the
// run twice — six `error` stamps a day on every site's heartbeat row (08:00 and
// 13:00 UTC, every roster member being 08:00 local in UTC or Chicago) and no
// digest of any kind since April. The Monday manager block had two more: it
// read `resolvedProfile` (the rep loop's const, out of scope) and selected
// managers by `u.userType`, a key the users table does not have (`role` is the
// column; `userType` lives inside the profile jsonb) — so no manager had ever
// matched. As in tests/pipeline-alerts.test.mjs the helpers are lifted out of
// the source text and RUN with nothing but the globals in scope.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../netlify/functions/digest.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

const fnSrc = (name) => {
    const m = src.match(new RegExp(`^function ${name}\\([^)]*\\) \\{[\\s\\S]*?^\\}`, 'm'));
    assert.ok(m, `${name} is a top-level function declaration in digest.mjs`);
    return m[0];
};
const defaults = src.match(/^const DEFAULT_PREFS = \{[\s\S]*?^\};/m)?.[0];
assert.ok(defaults, 'DEFAULT_PREFS is a top-level const');

// Instantiated with nothing but the standard globals: no db, no imports, and
// no `profile` — exactly the scope the helper has in the module.
const wantsDigest = new Function(`${defaults}\n${fnSrc('getPref')}\n${fnSrc('wantsDigest')}\nreturn wantsDigest;`)();
const wantsSms    = new Function(`${fnSrc('wantsSms')}\nreturn wantsSms;`)();

test('REGRESSION: wantsDigest reads the profile it is handed — the body had read a name bound only inside the user loop', () => {
    assert.equal(wantsDigest({ notificationPrefs: { taskDigest: { enabled: true,  mode: 'digest'  } } }, 'taskDigest'), true);
    assert.equal(wantsDigest({ notificationPrefs: { taskDigest: { enabled: false, mode: 'digest'  } } }, 'taskDigest'), false, 'a disabled preference is honoured');
    assert.equal(wantsDigest({ notificationPrefs: { taskDigest: { enabled: true,  mode: 'instant' } } }, 'taskDigest'), false, 'instant is not digest');
    assert.equal(wantsDigest({ notificationPrefs: {} }, 'overdueTaskNudge'), true, 'an unset preference falls back to the default (digest, on)');
    assert.equal(wantsDigest({ notificationPrefs: {} }, 'stageChanged'), false, 'the default for stageChanged is instant, so no digest');
    assert.equal(wantsDigest({}, 'managerTeamDigest'), true, 'no prefs at all: the default');
    assert.equal(wantsDigest(undefined, 'taskDigest'), true, 'no profile at all: the default, not a throw');
    assert.equal(wantsDigest({ notificationPrefs: {} }, 'notAnAlertType'), false, 'an unknown type is off');
});

test('REGRESSION: wantsSms reads the profile it is handed', () => {
    assert.equal(wantsSms({ smsNotifications: { enabled: true,  digest: true  } }, 'digest'), true);
    assert.equal(wantsSms({ smsNotifications: { enabled: true,  digest: false } }, 'digest'), false, 'SMS on but not for the digest');
    assert.equal(wantsSms({ smsNotifications: { enabled: false, digest: true  } }, 'digest'), false, 'SMS off globally');
    assert.equal(wantsSms({ smsNotifications: { enabled: true,  digest: 'yes' } }, 'digest'), false, 'the key must be boolean true');
    assert.equal(wantsSms({}, 'digest'), false, 'no SMS prefs: off');
    assert.equal(wantsSms(undefined, 'digest'), false, 'no profile: off, not a throw');
});

test('neither helper names the loop-scoped binding; the rep loop hands them resolvedProfile; the manager loop reads its own row', () => {
    assert.doesNotMatch(fnSrc('wantsDigest'), /\bprofile\b/, 'wantsDigest reads only its parameter');
    assert.doesNotMatch(fnSrc('wantsSms'),    /\bprofile\b/, 'wantsSms reads only its parameter');
    assert.equal((code.match(/wantsDigest\(resolvedProfile, '/g) || []).length, 5, 'the five rep-side digests check the rep\'s resolved profile');
    assert.equal((code.match(/wantsSms\(resolvedProfile, 'digest'\)/g) || []).length, 2, 'the two SMS follow-ups check the rep\'s SMS preference');
    // The manager block: its own `profile` (declared the line above), never the rep loop's const.
    assert.match(code, /const profile = mgr\.profile \|\| \{\};\n\s*if \(!wantsDigest\(profile, 'managerTeamDigest'\)\) continue;/, 'REGRESSION: the manager check reads the manager\'s profile — it had read resolvedProfile, out of scope');
    const managerBlock = code.slice(code.indexOf('const isMonday'));
    assert.doesNotMatch(managerBlock, /resolvedProfile/, 'the rep loop\'s const is not named after the loop ends');
});

test('REGRESSION: managers and reps are selected by the role COLUMN — userType is a profile-jsonb key the row never carries', () => {
    assert.doesNotMatch(code, /\.userType\b/, 'no read of userType on a users row');
    assert.ok(code.includes("            const managers = allUsers.filter(u =>\n                reachable(u) &&\n                (u.role === 'Manager' || u.role === 'Admin')\n"), 'the Monday managers are Manager or Admin by role, reachable (§0.306)');
    assert.ok(code.includes('            if (!reachable(user)) continue;'), 'a member with no address, or a placeholder, is mailed no digest (§0.306)');
    // Since §0.159 the reps come from _jobRoster.mjs's teamRepsOf — role User, and
    // only the manager's OWN org's (the old line read every org's; job-roster.test.mjs RUNS it).
    assert.match(code, /const visibleReps = teamRepsOf\(mgr, allUsers\);/, 'the reps a manager sees are chosen by teamRepsOf');
    const roster = readFileSync(new URL('../netlify/functions/_jobRoster.mjs', import.meta.url), 'utf8');
    assert.match(roster, /u\?\.orgId === mgr\.orgId && u\.role === 'User'/, 'the reps a manager sees are role User, of the manager\'s org');
});

test('§0.310 the record of what went: a table of its own, added by a script that only creates it — the test database guarded by host; each row in its member\'s org', () => {
    const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    const strip = (s) => s.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    const schema = read('db/schema.ts');
    assert.ok(schema.includes("export const digestSends = pgTable('digest_sends', {\n    orgId:  text('org_id').notNull(),\n    userId: text('user_id').notNull(),"), 'the member by app id, in their org');
    assert.ok(schema.includes("    primaryKey({ name: 'digest_sends_pk', columns: [t.orgId, t.userId, t.kind] }),"), 'one row per member and digest');
    for (const line of ["    kind:   varchar('kind', { length: 40 }).notNull(),", "    day:    varchar('day', { length: 10 }).notNull(),", "    sentAt: timestamp('sent_at').notNull().defaultNow(),"]) assert.ok(schema.includes(line), line);
    const apply = strip(read('db/apply-digest-sends.mjs'));
    assert.ok(!/\b(DROP|ALTER|TRUNCATE|DELETE|UPDATE|INSERT)\b/.test(apply), 'additive only (guide §18c)');
    assert.equal((apply.match(/await sql\x60\s*CREATE TABLE IF NOT EXISTS "digest_sends"/g) || []).length, 1, 'one statement that changes the database');
    assert.ok(apply.includes('CONSTRAINT "digest_sends_pk" PRIMARY KEY ("org_id", "user_id", "kind")'));
    // The columns as created, and as read back — the schema's, one for one.
    assert.ok(apply.includes('        "org_id"  text NOT NULL,\n        "user_id" text NOT NULL,\n        "kind"    varchar(40) NOT NULL,\n        "day"     varchar(10) NOT NULL,\n        "sent_at" timestamp NOT NULL DEFAULT now(),\n'), 'the columns as created');
    assert.ok(apply.includes("const want = [['org_id', 'text', null, 'NO'], ['user_id', 'text', null, 'NO'], ['kind', 'character varying', 40, 'NO'], ['day', 'character varying', 10, 'NO'], ['sent_at', 'timestamp without time zone', null, 'NO']];"), 'the columns as read back');
    assert.ok(apply.includes("if (!/now\\(\\)/.test(after[4].column_default || '')) throw") && apply.includes("if (before.length) { console.log('checks only — the table is already there; its shape:'); await verify(); }") && apply.includes('await verify();\n'), 'the shape read back after the apply, and on a checks-only run of a table already there');
    assert.ok(apply.includes("if (useTest && host.includes('ep-soft-morning')) throw"), 'the test path never reaches the shared app database');
    assert.ok(apply.includes("const apply = process.argv.includes('--apply');") && apply.includes('if (!apply) {'), 'checks only without --apply');
    assert.ok(apply.includes("if (pk.length !== 1 || pk[0].def !== 'PRIMARY KEY (org_id, user_id, kind)') throw"), 'read back: its key');
    assert.ok(read('tests/integration/_schema-guard.mjs').includes("['digest_sends', 'day'],"), 'the test-schema guard names it');
    // The record is read and written in the member's own org, by app id (the fake answers every row, so the text holds it).
    assert.ok(code.includes('.where(and(eq(digestSends.orgId, row.orgId), eq(digestSends.userId, row.id), eq(digestSends.kind, kind))).limit(1);'));
    assert.ok(code.includes('.values({ orgId: row.orgId, userId: row.id, kind, day, sentAt: now })'));
    assert.ok(code.includes('setWhere: eq(digestSends.orgId, row.orgId) });'));
    // Each send asks the record first — outside its send's catch, so a failed read is the member's, counted — and records
    // itself once its email went, before its text.
    for (const [kind, list] of [['taskDigest', 'dueTodayTasks'], ['overdueTaskNudge', 'overdueTasks'], ['opportunityDigest', 'updatedRecently']]) {
        assert.ok(code.includes('if (' + list + ".length > 0 && !(await sentOn(user, '" + kind + "', day))) {"), kind);
        assert.equal(code.split("await recordSent(user, '" + kind + "', day, now);").length - 1, 1, kind + ' recorded once');
    }
    assert.ok(code.indexOf("await recordSent(user, 'taskDigest', day, now);") > -1 && code.indexOf("await recordSent(user, 'taskDigest', day, now);") < code.indexOf('taskCount: dueTodayTasks.length'), 'the record before the text');
    assert.ok(code.includes("await recordSent(user, 'overdueTaskNudge', day, now);") && code.includes('overdueCount: overdueTasks.length') && code.indexOf("await recordSent(user, 'overdueTaskNudge', day, now);") < code.indexOf('overdueCount: overdueTasks.length'), "the overdue nudge's record before its text");
    assert.ok(code.includes("if (await sentOn(mgr, 'managerTeamDigest', day)) continue;") && code.includes("await recordSent(mgr, 'managerTeamDigest', day, now);"));
    const send = code.indexOf('                    sending = true;\n                    await sendEmail({\n                        to: mgr.email,');
    assert.ok(send > -1 && code.includes("const allActs  = await db.select().from(activities)") && code.indexOf("const allActs  = await db.select().from(activities)") < send && code.includes('const html = ') && code.indexOf('const html = ') < send, 'the team digest is counted until its send: its record, its reads and its build before it');
});
