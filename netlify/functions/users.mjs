import { db } from '../../db/index.js';
import { users, settings as settingsTable } from '../../db/schema.js';
import { eq, asc, and, sql, inArray } from 'drizzle-orm';
import { verifyAuth, requireRole, isAppRole, APP_ROLES } from './auth.mjs';
import { auditLog } from '../../db/schema.js';
import { serverErrorBody, resolveCaller, invalidateRoster, getCallerName, ensureRosterRow, isOpenInvitationRow, memberNamesOf, keepQuotaPlans } from './_lib.mjs';
import { pickSelfEditable } from './_selfProfile.mjs';
import { randomUUID } from 'crypto';
// Pure, shared with the Sales Manager tab (the _stage.mjs / stageClock.js
// arrangement): one validator decides the forecast-call shape on both sides.
import { cleanForecastCalls } from '../../src/utils/forecastCall.js';
import { streamAudit } from './_auditStream.mjs';
import { crmReadScope } from '../../src/utils/roles.js';
import { INVITE_EXPIRY_DAYS, DEFAULT_INVITE_EXPIRY_DAYS } from '../../src/utils/inviteExpiry.js';
// One name per member of an org (state §0.196): every write of users.name here decides through it.
import { nameRefusal, firstFreeName, numbered, nameTakenMessage } from '../../src/utils/memberName.js';
// A Sales Rep's quota plan per fiscal year (state §0.203): one rule for the board and this writer.
import { QUOTA_PERIODS, QUOTA_KEYS, cleanQuotaPeriods, cleanQuotaPlans, storedQuota, checkQuotaSave, quotaRefusal, planFromSave, samePlan, quotaYearAllowed } from '../../src/utils/quotaPlan.js';
import { fiscalStartOf } from '../../src/utils/quarters.js';
import { currentFiscalYear } from '../../src/utils/reportPeriod.js';
// A member's team, manager and pinned reports name this org's (state §0.205; the manager since §0.212): asked through
// the links machinery.
import { checkLinks, liveIdsInOrg } from './_links.mjs';
import { notInOrg, NOT_AN_ID } from '../../src/utils/linkIds.js';
// A manager's name and id, '' and none one value (state §0.212): the PUT keeps the two paired.
import { sameValue } from '../../src/utils/memberSave.js';

const ADMIN_ROLES = ['Admin', 'Manager'];

// A member's links (state §0.205 — Jeff, 15 Oct: "Any of this org's, refuse"): their team, an entry of the org's teams
// list (settings.extra.teams); their pinned reports, saved reports of the org — any of either, a colleague's private
// report too. Pins are the member's own: of the saves, only their own (?me — the Pin) writes them; an Admin's restore
// lands a restored member's as filed, cleared of any that name no saved report here (backup.mjs, _links.mjs).
const TEAM_LINK = [{ key: 'teamId', kind: 'team' }];
const PIN_LINKS = [{ key: 'pinnedReports', kind: 'report', shape: 'many' }];
// And their manager (state §0.212) — who they report to (Jeff, 26 Oct: "Only who they report to"), a member of this org
// by id (guide §18b102 rule 9): any of its members, deactivated or invited too (the profile page offers fewer), never
// the member themselves. An Admin's or a Manager's save sets it; the member's own (?me) never does (_selfProfile.mjs).
const MANAGER_LINK = [{ key: 'managerId', kind: 'member', notSelf: true }];

// ── Clerk organization invitations (state §0.165) ───────────────────────────
// Every call names the CALLER's org — the token's, never one from the request —
// so a list or a revoke reaches no other org's invitations.
const clerkClient = async () => {
    const { createClerkClient } = await import('@clerk/backend');
    return createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
};
const inviteEmail = (inv) => (inv.emailAddress || inv.email_address || '').toLowerCase();
const pendingInvitationsOf = async (clerk, orgId) => {
    const list = await clerk.organizations.getOrganizationInvitationList({ organizationId: orgId, status: ['pending'], limit: 500 });
    return list?.data || (Array.isArray(list) ? list : []);
};

// Roster ids are ours and permanent. This function is the ONLY place a new one
// is minted. Nothing derives an id from Clerk, from an email, or from a name:
// all three can change, and a primary key that changes is not a primary key.
const newUserId = () => 'usr_' + randomUUID();

const writeAudit = async (orgId, action, entityId, entityName, actorId, actorName) => {
    try {
        const [row] = await db.insert(auditLog).values({
            id:         'audit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            orgId,
            action,
            entityType: 'user',
            entityId:   String(entityId || ''),
            entityName: entityName || null,
            userId:     actorId    || null,
            userName:   actorName  || null,
            timestamp:  new Date(),
        }).returning();
        await streamAudit(orgId, row);   // state §0.87
    } catch (e) { console.warn('writeAudit error:', e.message); }
};


export const handler = async (event) => {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    const auth = await verifyAuth(event);
    if (auth.error) {
        // The code travels with it: 'deactivated' is how the app knows to show
        // its no-access page rather than a screen of failed loads (§0.164).
        return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error, ...(auth.code ? { code: auth.code } : {}) }) };
    }

    const { userId, orgId, userRole } = auth;

    // ── Helpers (hoisted above all early-exit handlers so they're available everywhere) ──

    // ROLE IS DELIBERATELY ABSENT from sanitize.
    //
    // The role on this table's row IS the role in this org — auth.mjs reads it on
    // every request (state §0.163; until then Clerk's user-level metadata was the
    // source and this column a mirror). Taking role from the request body caused
    // two problems, back when the column was the mirror:
    //   1. `PUT ?me=true` let any user rewrite their own mirror role, and a save
    //      that simply omitted userType silently downgraded them to 'User'.
    //   2. An admin editing a user wrote the new role to the mirror only, so the
    //      roster and actual authorization disagreed with no warning.
    // Role changes go through user-role.mjs (Admin-only). A NEW row's role is set
    // explicitly via withRole() below (an Admin's invite or create); upsertUser
    // never changes an existing row's role.
    const sanitize = (data) => ({
        id:           data.id,
        // Carried through so an update cannot blank the Clerk link. Absent on
        // create (an invited row has no Clerk identity until acceptance).
        clerkUserId:  data.clerkUserId ?? null,
        name:         ((data.firstName || '') + ' ' + (data.lastName || '')).trim() || String(data.name ?? '').trim() || 'Unnamed User',
        // email is notNull + unique in schema — use a unique placeholder if not provided
        email:        (data.email && data.email.trim()) ? data.email.trim() : `${data.id}@placeholder.local`,
        team:         data.team     || null,
        territory:    data.territory || null,
        quota:        (data.quota !== null && data.quota !== undefined && data.quota !== '') ? parseFloat(data.quota) : null,
        active:       data.active   ?? true,
        // Store the full profile as jsonb for fields not in dedicated columns
        profile: {
            prefix:        data.prefix        || null,
            firstName:     data.firstName     || null,
            middleName:    data.middleName     || null,
            lastName:      data.lastName      || null,
            suffix:        data.suffix        || null,
            nickName:      data.nickName      || null,
            title:         data.title         || null,
            company:       data.company       || null,
            department:    data.department    || null,
            workLocation:  data.workLocation  || null,
            personalEmail: data.personalEmail || null,
            phone:         data.phone         || null,
            mobile:        data.mobile        || null,
            address:       data.address       || null,
            city:          data.city          || null,
            state:         data.state         || null,
            zip:           data.zip           || null,
            country:       data.country       || null,
            notes:         data.notes         || null,
            // Personal email signature, appended to outbound mail this user sends.
            // Stored as plain text and HTML-escaped at render — a rich-text field
            // here would be an injection path into every recipient's inbox.
            emailSignature: data.emailSignature || null,
            vertical:      data.vertical      || null,
            teamId:        data.teamId        || null,
            manager:       data.manager       || null,
            managerId:     data.managerId     || null,
            userType:      data.userType      || 'User',
            notificationPrefs: data.notificationPrefs || null,
            digestTime:    data.digestTime    || '08:00',
            smsNotifications: data.smsNotifications || null,
            timezone:         data.timezone         || null,
            // The saved reports pinned to this member's Home (state §0.135): ids,
            // strings only, capped — a report that no longer exists is skipped on read.
            pinnedReports:    Array.isArray(data.pinnedReports) ? data.pinnedReports.filter(x => typeof x === 'string').slice(0, 50) : null,
            status:           data.status            || null,
            // Quota fields — stored in profile jsonb so they survive DB round-trips
            annualQuota:   data.annualQuota   ?? null,
            q1Quota:       data.q1Quota       ?? null,
            q2Quota:       data.q2Quota       ?? null,
            q3Quota:       data.q3Quota       ?? null,
            q4Quota:       data.q4Quota       ?? null,
            quotaType:     data.quotaType     || null,
            // A plan per fiscal year (state §0.203) — { "2026": { annual, quarters, months } };
            // only PUT ?quotas=true writes it, and the merge keeps it as stored for every other save.
            quotaPlans:    cleanQuotaPlans(data.quotaPlans),
            // Forecast calls per fiscal quarter — { '2026-Q4': { commit, bestCase } }
            // (state §0.84). The ledger's Commit used to arrive as `commit`, a key
            // this builder never carried, so it was 0 again on every refresh.
            forecastCalls: cleanForecastCalls(data.forecastCalls),
        },
    });

    // Flatten a DB row back into the shape the frontend expects
    // Attach a role explicitly. `known` is the stored row's role on an update;
    // on a create or an invitation it is the role the request names, and only
    // an Admin names one above Sales Rep (state §0.163).
    const withRole = (clean, known) => (known ? { ...clean, role: known } : clean);

    // An address another member of this org holds (users_org_email_uq) — Postgres
    // unique_violation, SQLSTATE 23505, read off the driver's error: drizzle wraps
    // it (err.cause), and the wrapper's message is the SQL, which names "email" on
    // every users write — so any failure whose text said "unique" read as a taken
    // address (state §0.202; _lib.mjs's isUniqueViolation reads the same way).
    // Every save answers it alike: 409, field email.
    const isEmailTaken = (err) => {
        const pg = err?.cause || err;
        const unique = err?.code === '23505' || pg?.code === '23505' || /duplicate key value violates unique constraint/i.test(pg?.message || '');
        return unique && /email/i.test([pg?.constraint, pg?.detail, pg?.message].filter(Boolean).join(' '));
    };
    const EMAIL_TAKEN = 'A user with that email address already exists in this organization. Please use a different email.';

    // The one-name refusal (state §0.196): the screens show `error`; `field` says which.
    const nameTaken = (message) => ({ statusCode: 409, headers, body: JSON.stringify({ error: message, field: 'name', code: 'NAME_TAKEN' }) });

    // Preserve the stored role when updating an existing row, so an update that
    // does not carry a role cannot blank it (the column is notNull default 'User').
    const roleOf = async (id) => {
        if (!id) return null;
        const [row] = await db.select({ role: users.role }).from(users)
            .where(and(eq(users.id, id), eq(users.orgId, orgId)));
        return row?.role || null;
    };

    // THE PROFILE BLOB IS SPREAD FIRST, and the order is the whole point.
    //
    // It used to be spread LAST, and `profile` carries its own `userType` key, so
    // the blob silently overrode the column on every response. Two answers to one
    // question shipped to the client on every load:
    //
    //   role      users.role          maintained by user-role.mjs (and, before §0.163, the Clerk sync)
    //   userType  profile.userType    written once at row creation and never again
    //
    // Nothing updated the blob copy — not a role change, not a sync — so it was
    // frozen at whatever the row was created with, and the ENTIRE Users UI read it:
    // the badges, both seat counters, the profile header, the permissions summary
    // and the role select. That is where `member` and `admin` were displayed from.
    //
    // `userType` is kept as an alias because UserModal and the export columns send
    // and read it, but both fields now resolve to the column. The blob copy
    // self-heals on the next write of each row: mergeForUpdate re-flattens the
    // stored row, so sanitize() writes the column value back into profile.userType.
    //
    // `userType` is the ONLY key the two objects share — every other profile field
    // is absent from the scalars above — so this reordering changes exactly one
    // value and nothing else.
    const flatten = (row) => ({
        ...(row.profile || {}),
        id:            row.id,
        clerkUserId:   row.clerkUserId || null,
        name:          row.name,
        // Don't expose placeholder emails to the frontend
        email:         (row.email && row.email.endsWith('@placeholder.local')) ? '' : (row.email || ''),
        userType:      row.role,
        role:          row.role,
        team:          row.team,
        territory:     row.territory,
        quota:         row.quota,
        active:        row.active,
        teamJoinedAt:  row.teamJoinedAt || null,
    });

    // ── Partial-update merge (hard requirement) ──────────────────────────────
    // `sanitize()` REBUILDS the whole row — every top-level column and the entire
    // `profile` jsonb — from the request body, and `upsertUser` writes it with
    // `set: { ...updateData }`. There is no column-level merge anywhere below it.
    //
    // So a PUT carrying a partial payload does not update those fields, it
    // REPLACES THE ROW and nulls everything absent. Five call sites were doing
    // exactly that: TeamsDetail (78, 351, 402) and TerritoriesDetail (64, 213)
    // cascade a team/territory change by sending only
    //     { id, team, territory, vertical, teamId }
    // which sanitizes to name "Unnamed User", email "<id>@placeholder.local",
    // quota null, and 31 of 35 profile fields null — wiping the user's real name,
    // email, phone, email signature, notification prefs and all quota figures.
    // Every one of those calls sat in a `catch(e) {}` or a bare console.error, so
    // it had never reported anything. Same mechanism as the `mobile`-wiped-on-save
    // bug in §0A, with a far wider blast radius.
    //
    // Fixing the callers alone would not be enough: any future partial PUT would
    // do the same. The merge belongs here, once, where every caller inherits it.
    //
    // `flatten()` returns a stored row in the same flat shape `sanitize()` accepts,
    // so overlaying the incoming body on the flattened row gives exact
    // field-present semantics: a key sent is applied (including an explicit '' or
    // null, which is how TeamsDetail:351 clears a team), a key omitted keeps its
    // stored value. Unknown id -> nothing to merge (the PUT answers 404 first).
    // The login link and the status are the stored ones, whatever the body says
    // (state §0.202): a save naming another link unlinked the member — an Admin
    // then read as a rep — and a status sent as 'Invited' switched a deactivated
    // member back on at their first sign-in. A row is linked by a sign-in (GET
    // ?me, by the invited email; PUT ?me pins the caller's own), an Admin's Clerk
    // sync (users-sync.mjs, by email) or an Admin's restore — never by a save's
    // body. Its status is set by Deactivate / Reactivate (the PUT's access branch),
    // an invitation and the first sign-in. And its access (`active`) is the stored
    // one unless the save IS the Deactivate / Reactivate request — the member and
    // `active`, nothing else (Jeff, 15 Oct: "Server keeps access"): a whole row
    // sent as loaded — the Sales Manager tab's saves, the profile page's before
    // §0.202 — switched a member deactivated since back on, or deactivated one who
    // had joined since.
    const isAccessChange = (data) => 'active' in data && Object.keys(data).every((k) => k === 'id' || k === 'active');
    const mergeForUpdate = async (data) => {
        const [existing] = await db.select().from(users)
            .where(and(eq(users.id, data.id), eq(users.orgId, orgId)));
        if (!existing) return { ...data, clerkUserId: null, status: null };
        return {
            ...flatten(existing), ...data,
            clerkUserId: existing.clerkUserId || null,
            status:      existing.profile?.status || null,
            active:      isAccessChange(data) ? data.active : existing.active,
            // The quota figures are the stored ones (state §0.203): PUT ?quotas=true is
            // their one writer, and checks they add up. A whole row sent as loaded — the
            // profile page, a forecast call, an old tab's Save quotas — put back figures
            // saved since, and a hand-written body could store figures that do not add up.
            // The write itself takes the plans the row holds when it lands (keepQuotaPlans):
            // a quota save between this read and that write is kept.
            ...storedQuota(existing.profile),
        };
    };

    // ── GET ?me=true — any authenticated user can fetch their own record ──────
    //
    // Lookup order, all of it scoped to THIS org:
    //   1. clerkUserId match — the normal path once a user has accepted
    //   2. Email match       — an invited row that has not been linked yet
    // Nothing else (state §0.172). A third step linked an unlinked row whose NAME
    // matched the caller's Clerk display name — a name anyone types — so a member
    // who named themselves after an unlinked row took it over, and with it every
    // record it owns. No unlinked row but one invitation existed in any org (read
    // 5 Oct); a person no row is addressed to by email gets their own, below.
    //
    // On a match via email we LINK the row by setting clerkUserId. We do
    // NOT rewrite users.id, which is what this used to do. Rewriting the primary
    // key at acceptance is how an invited user's id changed underneath anything
    // already pointed at it.
    //
    // Every branch is org-scoped. The direct lookup was not, which was invisible
    // while a Clerk id could only ever appear in one row; with per-org rosters it
    // would return a row from whichever org happened to come back first.
    if (event.httpMethod === 'GET' && event.queryStringParameters?.me === 'true') {
        try {
            // 1. Direct Clerk-identity lookup, scoped to this org
            let [row] = await db.select().from(users)
                .where(and(eq(users.clerkUserId, userId), eq(users.orgId, orgId)));

            if (!row) {
                const { createClerkClient } = await import('@clerk/backend');
                const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
                const clerkUser = await clerk.users.getUser(userId);
                const clerkEmail = clerkUser.emailAddresses?.[0]?.emailAddress?.toLowerCase() || '';

                // 2. Email match — catches invited users whose DB row has a pending_ id
                if (clerkEmail) {
                    [row] = await db.select().from(users).where(
                        and(eq(users.email, clerkEmail), eq(users.orgId, orgId))
                    );
                }
                // A row the address names that is already linked to ANOTHER Clerk
                // identity is that member's — the address has moved to a new Clerk
                // user (a shared mailbox handed on). It was answered as the caller's
                // own profile (state §0.173); it is not the caller's to read or link.
                if (row && row.clerkUserId && row.clerkUserId !== userId) row = undefined;

                // Found by the invited email and not yet linked: LINK it. The row
                // keeps its id -- only clerkUserId, role and active are written.
                //
                // NOTE ON NAME. This deliberately does NOT refresh the display
                // name from Clerk. Ownership columns still store names, so
                // rewriting one here would detach every record this user owns,
                // on an ordinary page load, with no audit trail. users-sync.mjs
                // has the same hazard and is Admin-triggered; this path fires
                // for every user on every load and must not carry it.
                if (row && !row.clerkUserId) {
                    // The ROW's role — it is this org's, and it is what the server
                    // enforces (state §0.163) — for the row the invitation was
                    // addressed to, found by its email. Never Clerk's user-level
                    // role — one value for every org. Validated: a value that is not
                    // one of ours authorizes nothing, so it is not carried over.
                    const linkRole = isAppRole(row.role) ? row.role : 'User';
                    // A row an Admin DEACTIVATED stays off when its person first
                    // signs in (state §0.164): linking it must not switch it back
                    // on — an invited row (status Invited) is the one turned on here.
                    const stillOff = row.profile?.status === 'Deactivated';
                    try {
                        const [linked] = await db.update(users)
                            .set({
                                clerkUserId: userId,
                                role:        linkRole,
                                active:      !stillOff,
                                profile:     keepQuotaPlans({ ...(row.profile || {}), status: stillOff ? 'Deactivated' : 'Active', userType: linkRole }),
                                updatedAt:   new Date(),
                            })
                            .where(and(eq(users.id, row.id), eq(users.orgId, orgId)))
                            .returning();
                        // The row as stored (state §0.203): the copy read before the write
                        // answered plans a quota save had replaced since, and the old status.
                        row = linked || { ...row, clerkUserId: userId, role: linkRole, active: !stillOff };
                        // The caller cache keys on clerkUserId and has just been proved
                        // wrong by this very write: it holds a 30s 'no roster row' answer
                        // for this identity, which fails CLOSED — the user would own
                        // nothing for half a minute after their first load.
                        invalidateRoster(orgId);
                        console.log(`users.mjs: linked roster row ${row.id} → clerk ${userId} (${clerkEmail})`);
                    } catch (linkErr) {
                        console.warn('users.mjs: link update failed:', linkErr.message);
                    }
                }
                // Nothing matched: a member of this org with NO roster row — the first
                // sign-in into a fresh workspace (state §0.108). Provision one from Clerk
                // now, in the shape users-sync.mjs creates, so the user owns what they
                // create and is named on it from this request on.
                if (!row) row = await ensureRosterRow({ clerkUserId: userId, orgId, clerkUser, orgRole: auth.orgRole });
                // The row just linked was deactivated: no access, as from the next
                // request on (verifyAuth) — said now, not after a screen of failures.
                if (row && row.active === false && row.profile?.status === 'Deactivated') {
                    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Your access to this organization has been turned off. Ask an Admin of the organization to restore it.', code: 'deactivated' }) };
                }
            }

            return { statusCode: 200, headers, body: JSON.stringify({ user: row ? flatten(row) : null }) };
        } catch (err) {
            console.error('Users /me GET error:', err.message);
            return { statusCode: 500, headers, body: serverErrorBody(err, 'users') };
        }
    }

    // ── PUT ?me=true — any authenticated user can update their own profile/prefs ──
    if (event.httpMethod === 'PUT' && event.queryStringParameters?.me === 'true') {
        try {
            const data = JSON.parse(event.body || '{}');
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            // Security: only allow a user to update their own row.
            //
            // This compared data.id against the CLERK id, which worked only while
            // the two were the same string. They are not any more, so the check is
            // resolved against the roster instead: whatever row this Clerk identity
            // owns in this org is the only row it may write.
            //
            // A caller with no roster row resolves to null and is refused. That is
            // the fail-closed direction: an unlinked caller must not be able to
            // claim an arbitrary id by sending it.
            const me = await resolveCaller(userId, orgId);
            if (!me.id || data.id !== me.id) {
                return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: cannot update another user\'s profile' }) };
            }
            // Keep whatever role is already stored. A profile save must never
            // change it — previously omitting userType downgraded the user to
            // 'User', which is how Admins quietly lost their roster role.
            //
            // And only the keys a member may change about THEMSELVES reach the
            // merge (state §0.109, guide §18b34). The client sent the whole row it
            // held until §0.196, so before this every administrative field — quota,
            // team, territory, active, the quarterly quotas, the forecast calls —
            // was rewritten from the caller's own body on every preference
            // toggle, and could be set by a body written by hand. A key the
            // allowlist drops keeps its stored value (mergeForUpdate); the id is
            // the only raw key kept, and it was checked against the roster
            // above. The profile blob's userType copy is pinned to the stored
            // role too, so a body carrying `userType` cannot pollute the blob
            // that flatten() used to read the role from.
            const own  = { id: data.id, ...pickSelfEditable(data) };
            const storedRole = await roleOf(data.id) || 'User';
            const clean = withRole(sanitize({ ...(await mergeForUpdate(own)), userType: storedRole }), storedRole);
            // A pin names a saved report of this org (state §0.205 — "Any of this org's, refuse"; any of them, a
            // colleague's private one too — Home shows only those its reader may open): asked only of a pin named anew;
            // the pins the row holds are never asked again (one whose report was deleted since stands).
            if ('pinnedReports' in own) {
                const [stored] = await db.select({ profile: users.profile }).from(users).where(and(eq(users.orgId, orgId), eq(users.id, data.id)));
                const pinned = await checkLinks(PIN_LINKS, own, { pinnedReports: stored?.profile?.pinnedReports ?? null }, orgId);
                if (pinned.error) return { statusCode: pinned.status, headers, body: JSON.stringify({ error: pinned.error, field: pinned.field }) };
            }
            // One name per member of an org (state §0.196): a First/Last that spells
            // another member's name is refused — every assignment by it would be a 409.
            const selfNameTaken = nameRefusal(await memberNamesOf(orgId), clean.name, data.id);
            if (selfNameTaken) return nameTaken(selfNameTaken);
            const { id, ...updateData } = clean;
            // Update-only (state §0.202), the Clerk link pinned — a self-save must
            // never orphan it. It tried an insert first: the caller's id is read
            // through a 30 s cache, so a member an Admin had just removed came
            // back, as a rep, on their next preference toggle.
            let saved;
            try {
                [saved] = await db
                    .update(users)
                    .set({ ...updateData, profile: keepQuotaPlans(updateData.profile), clerkUserId: userId, updatedAt: new Date() })
                    .where(and(eq(users.id, data.id), eq(users.orgId, orgId)))
                    .returning();
            } catch (err) {
                // An address another member holds, said as every save says it (state
                // §0.202) — it was a 500, "Internal server error" on the profile panel.
                if (isEmailTaken(err)) return { statusCode: 409, headers, body: JSON.stringify({ error: EMAIL_TAKEN, field: 'email' }) };
                throw err;
            }
            invalidateRoster(orgId);
            if (!saved) {
                return { statusCode: 404, headers, body: JSON.stringify({ error: 'You are no longer a member of this organization\'s roster. Reload the page.' }) };
            }
            return { statusCode: 200, headers, body: JSON.stringify({ user: flatten(saved) }) };
        } catch (err) {
            console.error('Users /me PUT error:', err.message);
            return { statusCode: 500, headers, body: serverErrorBody(err, 'users') };
        }
    }

    // ── Directory read: any member of the org ────────────────────────────────
    //
    // A rep needs colleagues' NAMES to assign work. Blocking GET entirely meant
    // useSettings.js:196 silently left `settings.users` as [], so every user
    // picker in the app rendered an empty typeahead for a rep -- the Assigned To
    // field on a task looked broken when it simply had nothing to offer, and a
    // rep could not assign a task even to themselves.
    //
    // Names are not a secret here: task, opportunity, account and lead ownership
    // are all stored and displayed AS display names, so a rep already sees them
    // throughout the UI. What is withheld is the administrative record --
    // email, role, quota, team, territory and the whole profile blob -- none of
    // which a picker needs.
    //
    // Writes stay Admin/Manager-only: the gate below still guards POST, PUT and
    // DELETE, and this branch returns before reaching them.
    //
    // A Dispatcher reads the whole CRM (crmReadScope 'all', §0.151) and the
    // Reports tab over it, where the rosters count reps BY ROLE and the Team /
    // Territory slices group by team and territory. Without the role every name
    // in this directory counted as a rep — Admins included. So a whole-org reader
    // also gets role, team and territory; still no email, quota or profile.
    const wholeOrgReader = crmReadScope(userRole) === 'all';
    const DIRECTORY_FIELDS = (row) => (wholeOrgReader
        ? { id: row.id, name: row.name, active: row.active, role: row.role, userType: row.role, team: row.team, territory: row.territory }
        : { id: row.id, name: row.name, active: row.active });

    if (event.httpMethod === 'GET' && !ADMIN_ROLES.includes(userRole)) {
        try {
            const rows = await db.select({ id: users.id, name: users.name, active: users.active, role: users.role, team: users.team, territory: users.territory })
                .from(users).where(eq(users.orgId, orgId)).orderBy(asc(users.name));
            return {
                statusCode: 200,
                headers,
                // `directory: true` tells the client these rows are deliberately
                // partial, so an absent quota or email is not read as a blank one.
                body: JSON.stringify({ users: rows.map(DIRECTORY_FIELDS), directory: true }),
            };
        } catch (err) {
            return { statusCode: 500, headers, body: serverErrorBody(err, 'users') };
        }
    }

    // Everything else -- the full record, and all writes -- stays Admin/Manager.
    if (!ADMIN_ROLES.includes(userRole)) {
        console.warn('users.mjs: forbidden role', userRole);
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: insufficient role' }) };
    }

    console.log('users.mjs: userRole =', userRole, '| method =', event.httpMethod);

    try {
        // ── GET ?invitations=pending — this org's pending Clerk invitations ──
        // (state §0.165). The Pending invites page lists them beside the roster's
        // invited rows, with Clerk's own dates — it printed "Sent Recently" and
        // "in 7d" for every row. An Admin's, like every other part of access.
        if (event.httpMethod === 'GET' && event.queryStringParameters?.invitations === 'pending') {
            if (userRole !== 'Admin') {
                return { statusCode: 403, headers, body: JSON.stringify({ error: 'Only an Admin can see the pending invitations.' }) };
            }
            let pending;
            try {
                pending = await pendingInvitationsOf(await clerkClient(), orgId);
            } catch (e) {
                console.warn('users.mjs: could not list pending org invitations:', e.message);
                return { statusCode: 502, headers, body: JSON.stringify({ error: 'Could not read the invitations from Clerk.' }) };
            }
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ invitations: pending.map((inv) => ({
                    id: inv.id, email: inviteEmail(inv), clerkRole: inv.role || null,
                    createdAt: inv.createdAt ?? null, expiresAt: inv.expiresAt ?? null,
                })) }),
            };
        }

        // ── GET ?seats=true — this org's membership limit, from Clerk ─────────
        // (state §0.168). The Seat usage page and the Users rail printed a plan,
        // a per-seat price and a 50-seat cap that exist nowhere. The one limit
        // that is real is Clerk's: an organization allows maxAllowedMemberships
        // members — 0 means unlimited, 5 is Clerk's default (§0.153) — and Clerk
        // counts the members it compares with it. An Admin's, like invitations.
        if (event.httpMethod === 'GET' && event.queryStringParameters?.seats === 'true') {
            if (userRole !== 'Admin') {
                return { statusCode: 403, headers, body: JSON.stringify({ error: 'Only an Admin can see the membership limit.' }) };
            }
            try {
                const clerk = await clerkClient();
                const org = await clerk.organizations.getOrganization({ organizationId: orgId, includeMembersCount: true });
                const pending = await pendingInvitationsOf(clerk, orgId);
                const count = (n) => (Number.isFinite(n) ? n : null);
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ limit: count(org?.maxAllowedMemberships), members: count(org?.membersCount), pendingInvitations: pending.length }),
                };
            } catch (e) {
                console.warn('users.mjs: could not read the org membership limit:', e.message);
                return { statusCode: 502, headers, body: JSON.stringify({ error: 'Could not read the membership limit from Clerk.' }) };
            }
        }

        // ── GET ───────────────────────────────────────────────────────────────
        if (event.httpMethod === 'GET') {
            const rows = await db.select().from(users).where(eq(users.orgId, orgId)).orderBy(asc(users.name));
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ users: rows.map(flatten) }),
            };
        }

        // ── Upsert helper — returns the saved row, throws on email conflict ────
        // Every create and update funnels through here, which makes it the one
        // place the 30s roster cache in _lib.mjs has to be dropped. Without it,
        // inviting a user and immediately assigning them a record resolves against
        // the pre-write roster, finds no match, and stamps NULL — an UNASSIGNED
        // record, which by policy is editable org-wide.
        const upsertUser = async (clean, { updateOnly = false } = {}) => {
            // An EXISTING row's role is never changed here — a create that names
            // an id already in the org, or a PUT: the role on the row is what the
            // server enforces (state §0.163), and user-role.mjs, Admin-only, is
            // the one path that changes it. A new row is inserted with its role.
            // A PUT is update-only (state §0.202): a member removed while the save
            // was out is not inserted again — it answers no row.
            // The quota plans are the row's when the write lands (keepQuotaPlans, state §0.203).
            const { id, role: _keepStoredRole, ...updateData } = clean;
            try {
                const [row] = updateOnly
                    ? await db.update(users).set({ ...updateData, profile: keepQuotaPlans(updateData.profile), updatedAt: new Date() })
                        .where(and(eq(users.id, id), eq(users.orgId, orgId))).returning()
                    : await db
                    .insert(users)
                    .values({ ...clean, orgId })
                    .onConflictDoUpdate({
                        target: users.id, setWhere: eq(users.orgId, orgId),
                        set: { ...updateData, profile: keepQuotaPlans(updateData.profile), updatedAt: new Date() },
                    })
                    .returning();
                invalidateRoster(orgId);
                return row;
            } catch (err) {
                if (isEmailTaken(err)) {
                    const dupErr = new Error(EMAIL_TAKEN);
                    dupErr.code = 'EMAIL_DUPLICATE';
                    throw dupErr;
                }
                throw err;
            }
        };

        // ── POST (create) ─────────────────────────────────────────────────────
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body || '{}');

            // ── Revoke an invitation (state §0.165) ───────────────────────────
            // The Pending invites page's Revoke only hid the row on screen, and
            // Delete user removed the row but not the invitation: either way the
            // person could still accept and join. This revokes THIS org's pending
            // Clerk invitations for the email, then removes the invitation's row.
            // An Admin's, like every other change to who has access (§0.164).
            if (data.action === 'revoke-invite') {
                if (userRole !== 'Admin') {
                    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Only an Admin can revoke an invitation.' }) };
                }
                const email = String(data.email || '').trim().toLowerCase();
                if (!email) {
                    return { statusCode: 400, headers, body: JSON.stringify({ error: 'email is required' }) };
                }
                const [row] = await db.select().from(users)
                    .where(and(eq(users.orgId, orgId), sql`lower(${users.email}) = ${email}`)).limit(1);
                if (row && row.clerkUserId) {
                    return { statusCode: 409, headers, body: JSON.stringify({ error: 'They have already joined. Deactivate them instead.' }) };
                }
                const clerk = await clerkClient();
                let mine;
                try {
                    mine = (await pendingInvitationsOf(clerk, orgId)).filter((inv) => inviteEmail(inv) === email);
                } catch (e) {
                    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Could not reach Clerk. Nothing was revoked.' }) };
                }
                // Fails closed: a revoke Clerk refuses keeps the row, because the
                // invitation may still be live.
                for (const inv of mine) {
                    try {
                        await clerk.organizations.revokeOrganizationInvitation({ organizationId: orgId, invitationId: inv.id, requestingUserId: userId });
                    } catch (e) {
                        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Clerk did not revoke the invitation, so it may still be live. Try again.' }) };
                    }
                }
                const removeRow = isOpenInvitationRow(row);
                if (!mine.length && !removeRow) {
                    return { statusCode: 404, headers, body: JSON.stringify({ error: 'No pending invitation for that email in this organization.' }) };
                }
                if (removeRow) {
                    await db.delete(users).where(and(eq(users.id, row.id), eq(users.orgId, orgId)));
                    invalidateRoster(orgId);
                }
                await writeAudit(orgId, 'user.invite_revoked', row?.id || email, row?.name || email, userId, await getCallerName(userId, orgId));
                return { statusCode: 200, headers, body: JSON.stringify({ revoked: mine.length, removedRowId: removeRow ? row.id : null }) };
            }

            // ── Invite flow ───────────────────────────────────────────────────
            if (data.action === 'invite') {
                const invites = Array.isArray(data.invites) ? data.invites : [];
                if (invites.length === 0) {
                    return { statusCode: 400, headers, body: JSON.stringify({ error: 'No invites provided' }) };
                }
                // Only an Admin grants a role (state §0.163): the invited role is
                // the role the person will hold in this org — the roster row is
                // what the server enforces. A Manager invites reps.
                if (userRole !== 'Admin' && invites.some((i) => (i.role || 'User') !== 'User')) {
                    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Only an Admin can invite someone with a role other than Sales Rep.' }) };
                }

                // Initialise Clerk backend client once for this batch
                const clerk = await clerkClient();

                // Redirect URL — where Clerk sends the invitee after they accept.
                // Netlify sets URL to the site's primary domain in production.
                const appUrl = process.env.URL || process.env.DEPLOY_URL || 'https://salespipelinetracker.com';

                // Fetch this ORG's pending invitations once for the batch. Clerk rejects
                // a duplicate invitation outright, so a RE-invite must revoke the old one
                // first — that is what makes “Resend” actually send a fresh email.
                // NOTE: these are ORGANIZATION invitations (membership in this org on
                // acceptance), not application invitations — app-level invites create an
                // account with NO org, which strands invitees on Clerk's
                // “Setup your organization” screen.
                let pendingInvitations = [];
                try {
                    pendingInvitations = await pendingInvitationsOf(clerk, orgId);
                } catch (e) {
                    console.warn('users.mjs: could not list pending org invitations:', e.message);
                }

                const results = [];
                const errors  = [];
                const inviterName = await getCallerName(userId, orgId);
                // Every member's name in this org, kept current through the batch
                // (state §0.196): two invitations of one name are two members of it.
                const roster = await memberNamesOf(orgId);
                // The teams the batch names, read once (state §0.205): a new member's team is one of this org's.
                const liveTeams = await liveIdsInOrg('team', invites.map((i) => i?.teamId), orgId);

                for (const invite of invites) {
                    const email = (invite.email || '').trim().toLowerCase();
                    if (!email) { errors.push({ email: '', error: 'Email required' }); continue; }

                    // The invited role becomes the role on the person's row in this
                    // org, which the server enforces from their first request (state
                    // §0.163). An unvalidated value would persist as a role no gate knows:
                    // the invite screen seeded its rows with 'Sales Rep' (the LABEL for
                    // 'User'), so an untouched row created exactly that. Refuse the row
                    // rather than coercing it — the caller chose a role and is entitled
                    // to be told it was not one.
                    if (invite.role !== undefined && invite.role !== null && !isAppRole(invite.role)) {
                        errors.push({ email, error: `"${invite.role}" is not a valid role. Expected one of: ${APP_ROLES.join(', ')}.` });
                        continue;
                    }
                    // How long the link lasts — one of the screen's choices (state §0.165).
                    const days = invite.expiresInDays ?? DEFAULT_INVITE_EXPIRY_DAYS;
                    if (!INVITE_EXPIRY_DAYS.includes(days)) {
                        errors.push({ email, error: `An invitation lasts ${INVITE_EXPIRY_DAYS.join(', ')} days — not "${invite.expiresInDays}".` });
                        continue;
                    }

                    // The row's name, decided BEFORE Clerk is called (state §0.196) — a
                    // refused row never reaches Clerk. A name another member holds is
                    // refused: the Admin chose it and is told. None given, the address's
                    // front part, numbered when taken — "pat (2)" — as nobody can be
                    // asked. A re-invite keeps its row and its name. Cut to the column's
                    // 255: the row is written after Clerk has sent the invitation, so a
                    // name it cannot hold must never reach the insert (state §0.167).
                    const givenName = typeof invite.name === 'string' ? invite.name.trim().slice(0, 255) : '';
                    const localPart = email.split('@')[0] || email;
                    const newRow = !roster.some((u) => u.email === email);   // the row lookup below: this org, the exact address
                    const rowName = givenName ? (nameRefusal(roster, givenName) ? null : givenName) : firstFreeName(roster, numbered(localPart));
                    if (newRow && !rowName) { errors.push({ email, error: nameTakenMessage(givenName || localPart) }); continue; }
                    // A new member's team is one of this org's (state §0.205 — "Any of this org's, refuse"), refused before
                    // Clerk is called. A re-invitation stores no team (it keeps the row's), so it is not asked.
                    if (newRow && invite.teamId != null && invite.teamId !== '') {
                        if (typeof invite.teamId !== 'string') { errors.push({ email, error: NOT_AN_ID, field: 'teamId' }); continue; }
                        if (!liveTeams.has(invite.teamId)) { errors.push({ email, error: notInOrg('team'), field: 'teamId' }); continue; }
                    }
                    // A Manager's invitation to an address a member of this org already
                    // holds only resends a Sales Rep's open invitation (state §0.202 —
                    // Jeff, 15 Oct: "Close both in 4b-2a"). The row keeps its role and is
                    // marked Invited below, so re-inviting a deactivated member switched
                    // them back on at their first sign-in — an Admin's row as an Admin —
                    // and an address moved onto a Manager's row not yet joined handed its
                    // role to whoever had it. Asked before Clerk is called.
                    if (userRole !== 'Admin') {
                        const [held] = await db.select({ role: users.role, clerkUserId: users.clerkUserId, profile: users.profile }).from(users)
                            .where(and(eq(users.email, email), eq(users.orgId, orgId)));
                        if (held && !(isOpenInvitationRow(held) && held.role === 'User')) {
                            errors.push({ email, error: 'Only an Admin can invite an address a member of this organization already holds. A Manager can only resend a Sales Rep\'s open invitation.' });
                            continue;
                        }
                    }

                    try {
                        // 1. Revoke any existing pending invitation for this email so the
                        //    re-create below succeeds and sends a brand-new magic link.
                        const existingInv = pendingInvitations.find((inv) => inviteEmail(inv) === email);
                        if (existingInv) {
                            try { await clerk.organizations.revokeOrganizationInvitation({ organizationId: orgId, invitationId: existingInv.id, requestingUserId: userId }); }
                            catch (revErr) { console.warn(`users.mjs: revoke failed for ${email}:`, revErr.message); }
                        }

                        // 2. Create an ORGANIZATION invitation — Clerk emails a magic link,
                        //    and acceptance adds the user to THIS org (existing accounts
                        //    included), so they land in UKG instead of being asked to
                        //    create their own organization. App-specific role/team live in
                        //    the users table; the Clerk org role only needs membership
                        //    (admins get org:admin so they can manage members).
                        await clerk.organizations.createOrganizationInvitation({
                            organizationId: orgId,
                            inviterUserId:  userId,
                            emailAddress:   email,
                            role:           (invite.role === 'Admin') ? 'org:admin' : 'org:member',
                            expiresInDays:  days,
                            redirectUrl:    appUrl,
                            // No role here: the row below is the one place it lives.
                            publicMetadata: {
                                team:      invite.team      || null,
                                territory: invite.territory || null,
                            },
                        });

                        // 3. DB row. If this email already has a row (a migrated user or a
                        //    prior pending_ invite), KEEP it — merge status into the existing
                        //    profile rather than inserting a duplicate (which would violate
                        //    the unique-email constraint and clobber quotas/profile data).
                        const [existingRow] = await db
                            .select()
                            .from(users)
                            .where(and(eq(users.email, email), eq(users.orgId, orgId)));

                        if (existingRow) {
                            const mergedProfile = { ...(existingRow.profile || {}), status: 'Invited' };
                            const [row] = await db
                                .update(users)
                                .set({ profile: keepQuotaPlans(mergedProfile), updatedAt: new Date() })
                                .where(and(eq(users.id, existingRow.id), eq(users.orgId, orgId)))
                                .returning();
                            results.push(flatten(row || existingRow));
                        } else {
                            // A real, permanent id from the start. The row is simply
                            // not linked to a Clerk identity yet (clerkUserId null),
                            // and acceptance fills that in without touching the id.
                            // The old `pending_` id was a placeholder that later got
                            // overwritten -- the rewrite this batch removes.
                            // The name decided above, before Clerk (state §0.196; the
                            // team import sends each row's, §0.167): the first sign-in
                            // links this row and never renames it (GET ?me — ownership
                            // stores names), so it is the name the member keeps. Only a
                            // row removed between the roster read and the lookup above
                            // comes here undecided: its address, unique in the org, names it.
                            const row = await upsertUser(withRole(sanitize({
                                id:        newUserId(),
                                email,
                                name:      rowName ?? email,
                                userType:  invite.role      || 'User',
                                team:      invite.team      || null,
                                // The team's id with its name (state §0.168): teamId is
                                // what coaching notes read (the manager digest matches by
                                // the team's name), and the invite stored the name alone.
                                // The screen resolves it from the org's teams, as the team
                                // editor does. A new member's is checked above (state
                                // §0.205); a row removed mid-batch reaches here unchecked,
                                // so a team the batch's read did not find is stored as none.
                                teamId:    (typeof invite.teamId === 'string' && liveTeams.has(invite.teamId)) ? invite.teamId : null,
                                territory: invite.territory || null,
                                active:    false,
                                status:    'Invited',
                            }), invite.role || 'User'));
                            results.push(flatten(row));
                            roster.push({ id: row.id, name: row.name, email: row.email });
                        }
                        // Who invited whom, as what (state §0.165) — an invitation grants
                        // access and a role, and it was the one change to who has access
                        // the log never recorded. A resend is an invitation too.
                        await writeAudit(orgId, 'user.invited', results[results.length - 1]?.id || email,
                            `${email} as ${invite.role || 'User'}, ${days} days`, userId, inviterName);

                    } catch (err) {
                        // Clerk throws if the email already belongs to a signed-up member
                        // (no invitation needed) — surface that message per-email.
                        const clerkMsg = err?.errors?.[0]?.message || err.message || 'Invite failed';
                        errors.push({ email, error: clerkMsg });
                    }
                }

                return {
                    statusCode: errors.length === invites.length ? 400 : 201,
                    headers,
                    body: JSON.stringify({ invited: results, errors }),
                };
            }
            // ── Single user create ────────────────────────────────────────────
            // The id is minted here when the client does not supply one. It used
            // to be required, which pushed identity generation into the browser --
            // the client cannot know what is unique in this org, and any id it
            // invents is a guess.
            const createRole = data.userType || data.role || 'User';
            if (!isAppRole(createRole)) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: `"${createRole}" is not a valid role. Expected one of: ${APP_ROLES.join(', ')}.` }) };
            }
            // Only an Admin grants a role (state §0.163) — a Manager adds reps.
            if (createRole !== 'User' && userRole !== 'Admin') {
                return { statusCode: 403, headers, body: JSON.stringify({ error: 'Only an Admin can add someone with a role other than Sales Rep.' }) };
            }
            // A create never overwrites a row (state §0.164). sanitize() builds a
            // FULL row, so a body naming an id already in this org wiped what it
            // lacked — the Clerk link, team, quota, the profile — and an unlinked
            // row is no role at all to the server (a rep until the next sign-in
            // relinks it). Found when §0.163's suite did exactly that to a
            // Manager. Changing a member is PUT, which merges first.
            if (data.id) {
                const [taken] = await db.select({ id: users.id }).from(users)
                    .where(and(eq(users.id, data.id), eq(users.orgId, orgId)));
                if (taken) {
                    return { statusCode: 409, headers, body: JSON.stringify({ error: 'That member already exists — edit them instead.' }) };
                }
            }
            // The server mints every new id (state §0.166). The client's was taken,
            // so a create could adopt a deleted member's id — their personal inbound
            // address names only the id, so their mail would land here — or probe
            // another org's (it answered 500 when the id was held there). An id
            // naming this org's member is refused above (§0.164); any other is ignored.
            try {
                // No quota from the body either (state §0.203): PUT ?quotas=true sets it, checked.
                for (const k of QUOTA_KEYS) delete data[k];
                // No pins either (state §0.205 — Jeff, 15 Oct): a member's pins are their own, written by their own Pin.
                delete data.pinnedReports;
                // No login link, status or access from the body (state §0.202): a
                // create named any Clerk identity, a member to be, and a status
                // 'Deactivated' or `active` false kept them out once linked — a
                // deactivation, an Admin's (§0.164). A member starts on. A sign-in by
                // the row's email, or an Admin's Clerk sync, links it.
                const clean = withRole(sanitize({ ...data, status: null, active: true, id: newUserId(), clerkUserId: null }), createRole);
                // One name per member of an org (state §0.196): a name another member
                // holds is refused — the Admin chose it and is told.
                const newNameTaken = nameRefusal(await memberNamesOf(orgId), clean.name);
                if (newNameTaken) return nameTaken(newNameTaken);
                // A new member's team is one of this org's teams (state §0.205 — "Any of this org's, refuse"): another
                // org's, or one that names nothing, is 404 naming the field, and nothing is written.
                const teamed = await checkLinks(TEAM_LINK, data, null, orgId);
                if (teamed.error) return { statusCode: teamed.status, headers, body: JSON.stringify({ error: teamed.error, field: teamed.field }) };
                // A new member's manager is a member of this org (state §0.212): another org's, or an id no member holds, is
                // 404 naming the field. The row's own id is the one minted for it — the body's, if it names one, never is.
                const managed = await checkLinks(MANAGER_LINK, data, { id: clean.id, managerId: null }, orgId);
                if (managed.error) return { statusCode: managed.status, headers, body: JSON.stringify({ error: managed.error, field: managed.field }) };
                const result = await upsertUser(clean);
                if (!result) {
                    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Insert returned no row' }) };
                }
                // Actor name is the CALLER's, resolved — not the target's.
                // These three calls passed result.name as the actor for as
                // long as they existed, so every user.created/updated/deleted
                // row read as the subject acting on themselves (§0.54's queued
                // finding; the paired user.role.changed rows were always right).
                await writeAudit(orgId, 'user.created', result.id, result.name, userId, await getCallerName(userId, orgId));
                return { statusCode: 201, headers, body: JSON.stringify({ user: flatten(result) }) };
            } catch (err) {
                if (err.code === 'EMAIL_DUPLICATE') {
                    return { statusCode: 409, headers, body: JSON.stringify({ error: err.message, field: 'email' }) };
                }
                throw err;
            }
        }

        // ── PUT ?quotas=true — a fiscal year's quota plans for Sales Reps (state §0.203) ──
        // Jeff, 15 Oct: a rep's yearly quota is broken into the company's periods —
        // quarters, or months — which may ramp and must add up to the year; each fiscal
        // year has its own plan ("Per-year plans now"); Admins and Managers set them
        // ("Admins and Managers", the gate above). The one writer of a member's quota:
        // every other save keeps the stored figures (the merge). One request for the
        // board's whole save, refused whole when any member's figures do not add up.
        if (event.httpMethod === 'PUT' && event.queryStringParameters?.quotas === 'true') {
            const body = JSON.parse(event.body || '{}');
            const members = Array.isArray(body.members) ? body.members : null;
            const memberIds = members ? members.map((m) => m?.id) : [];
            if (!members || !members.length || members.length > 500
                || memberIds.some((mid) => typeof mid !== 'string' || !mid) || new Set(memberIds).size !== memberIds.length) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Send each member\'s id and quota, once.' }) };
            }
            const fy = body.fiscalYear;
            if (!Number.isInteger(fy)) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Name the fiscal year these quotas are for.' }) };
            }
            if (!QUOTA_PERIODS.includes(body.breakdown)) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Quota periods are quarters or months.' }) };
            }
            // The company's own setting decides — this org's row only (none: quarters, a January year).
            const [quotaSettings] = await db.select({ extra: settingsTable.extra, fiscalYearStart: settingsTable.fiscalYearStart })
                .from(settingsTable).where(eq(settingsTable.orgId, orgId)).limit(1);
            const breakdown = cleanQuotaPeriods(quotaSettings?.extra?.quotaPeriods);
            if (body.breakdown !== breakdown) {
                return { statusCode: 409, headers, body: JSON.stringify({ error: `This company now sets quotas by ${breakdown === 'months' ? 'month' : 'quarter'}. Reload the page to see its board.` }) };
            }
            const thisYear = currentFiscalYear(fiscalStartOf(quotaSettings?.fiscalYearStart));
            if (!quotaYearAllowed(fy, thisYear)) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: `FY${fy} is outside the years quotas can be set for (FY${thisYear - 2}–FY${thisYear + 2}).` }) };
            }
            const quotaRows = await db.select().from(users).where(and(eq(users.orgId, orgId), inArray(users.id, memberIds)));
            const rowById = new Map(quotaRows.map((r) => [r.id, r]));
            const notHere = memberIds.filter((mid) => !rowById.has(mid)).length;
            if (notHere) {
                return { statusCode: 404, headers, body: JSON.stringify({ error: `${notHere === 1 ? 'One of these members is' : `${notHere} of these members are`} not in your organization — they may have been removed. Reload and try again.` }) };
            }
            for (const r of quotaRows) {
                if (r.role !== 'User') {
                    return { statusCode: 400, headers, body: JSON.stringify({ error: `${r.name} is not a Sales Rep — quotas are set for Sales Reps.` }) };
                }
                if (r.profile != null && (typeof r.profile !== 'object' || Array.isArray(r.profile))) {
                    return { statusCode: 409, headers, body: JSON.stringify({ error: `${r.name}'s record could not be read — nothing was saved.` }) };
                }
            }
            const year = String(fy);
            const changes = [];
            for (const m of members) {
                const r = rowById.get(m.id);
                const check = checkQuotaSave({ breakdown, annual: m.annual, periods: m.periods });
                if (check) return { statusCode: 400, headers, body: JSON.stringify({ error: quotaRefusal(r.name, fy, check, breakdown) }) };
                const stored = cleanQuotaPlans(r.profile?.quotaPlans)?.[year] || null;
                const plan = planFromSave(breakdown, m.annual, m.periods, stored);
                if (!stored || !samePlan(stored, plan)) changes.push({ r, plan });
            }
            // One year merged into the stored plans: every other year and every other
            // profile key kept (a top-level || would replace the whole map).
            const written = changes.length ? (await db.batch(changes.map(({ r, plan }) => db.update(users)
                .set({
                    profile: sql`coalesce(${users.profile}, '{}'::jsonb) || jsonb_build_object('quotaPlans', (case when jsonb_typeof(${users.profile}->'quotaPlans') = 'object' then ${users.profile}->'quotaPlans' else '{}'::jsonb end) || jsonb_build_object(${year}::text, ${JSON.stringify(plan)}::jsonb))`,
                    updatedAt: new Date(),
                })
                .where(and(eq(users.id, r.id), eq(users.orgId, orgId), sql`jsonb_typeof(coalesce(${users.profile}, '{}'::jsonb)) = 'object'`))
                .returning()))).flat() : [];
            invalidateRoster(orgId);
            const writtenById = new Map(written.map((w) => [w.id, w]));
            const removed = changes.filter(({ r }) => !writtenById.has(r.id)).map(({ r }) => r.id);
            if (written.length) {
                // Every change's audit row in one insert, then each streamed in turn (state §0.203).
                // An insert-and-stream per member could outlast the function when an org's audit
                // destination hung — 4 s a member: the plans were in, the later members' audit rows
                // were not. In turn, not at once: each delivery counts on the last one's state.
                const setBy = await getCallerName(userId, orgId);
                const at = new Date();
                const audited = changes.filter(({ r }) => writtenById.has(r.id));
                try {
                    const auditRows = await db.insert(auditLog).values(audited.map(({ r, plan }, i) => ({
                        id:         'audit_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2, 7),
                        orgId,
                        action:     'user.quota_set',
                        entityType: 'user',
                        entityId:   String(r.id),
                        entityName: `${r.name} — FY${fy} $${plan.annual.toLocaleString('en-US')}`,
                        userId:     userId || null,
                        userName:   setBy  || null,
                        timestamp:  at,
                    }))).returning();
                    for (const row of auditRows) await streamAudit(orgId, row);   // state §0.87
                } catch (e) { console.warn('quota audit error:', e.message); }
            }
            const answer = quotaRows.filter((r) => !removed.includes(r.id)).map((r) => flatten(writtenById.get(r.id) || r));
            return { statusCode: 200, headers, body: JSON.stringify({ users: answer, removed }) };
        }

        // ── PUT (update) ──────────────────────────────────────────────────────
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body || '{}');
            if (!data.id || typeof data.id !== 'string') {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }
            // Access is true or false (state §0.202): a value Postgres reads as false —
            // "false", 0, "off" — was stored as a deactivation the access branch below
            // never saw (it asks `!== false`), so a Manager could switch a rep off and
            // an Admin themselves.
            if ('active' in data && typeof data.active !== 'boolean') {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'active must be true or false.' }) };
            }
            // A save changes a member this org holds and never creates one (state
            // §0.202): an unknown id was inserted as 'Unnamed User' — a screen loaded
            // before a delete brought the member back. And a Manager's save reaches
            // only a Sales Rep's row (Jeff, 15 Oct: "Close both in 4b-2a"), as a
            // Manager adds and invites only reps (§0.163) and delete and deactivate
            // are an Admin's (§0.164, §0.165): an Admin's row it could unlink, or
            // move the email of; a Manager's or Dispatcher's not yet joined it could
            // re-address, and the invitation then gave that role to whoever it chose.
            const [target] = await db.select({ role: users.role }).from(users)
                .where(and(eq(users.id, data.id), eq(users.orgId, orgId)));
            if (!target) {
                return { statusCode: 404, headers, body: JSON.stringify({ error: 'That member is not in your organization — they may have been removed. Reload and try again.' }) };
            }
            if (userRole !== 'Admin' && target.role !== 'User') {
                return { statusCode: 403, headers, body: JSON.stringify({ error: 'Only an Admin can change a member who is not a Sales Rep.' }) };
            }
            try {
                // Role is preserved, never taken from the body: the role on the row
                // is what the server enforces (state §0.163), and user-role.mjs is
                // the one path that changes it.
                const merged = await mergeForUpdate(data);
                const storedRole = await roleOf(data.id) || 'User';
                // The blob's userType copy follows the column (§0.109): a body
                // carrying a different userType changed the blob and not the
                // role, putting two answers to one question back in the row.
                const clean  = withRole(sanitize({ ...merged, userType: storedRole }), storedRole);
                // First day on a team (state §0.82): when profile.teamId changes, stamp
                // team_joined_at — the floor a team coaching note is read against.
                // Leaving a team clears it; an unchanged team leaves the column alone.
                const [before] = await db.select({ profile: users.profile, active: users.active, clerkUserId: users.clerkUserId }).from(users)
                    .where(and(eq(users.id, data.id), eq(users.orgId, orgId)));
                const prevTeam = before?.profile?.teamId || null, nextTeam = clean.profile?.teamId || null;
                if (before && prevTeam !== nextTeam) clean.teamJoinedAt = nextTeam ? new Date() : null;
                // Pins are the member's own (state §0.205 — Jeff, 15 Oct): written only by their own Pin (?me). An Admin's
                // or a Manager's save keeps the stored ones whatever it sends — not by dropping the key from the body, which
                // would make { id, active, pinnedReports } a Deactivate (isAccessChange).
                clean.profile = { ...clean.profile, pinnedReports: Array.isArray(before?.profile?.pinnedReports) ? before.profile.pinnedReports : null };
                // ACCESS (state §0.164 — Jeff: "Deactivated means no access"). Only
                // the Deactivate / Reactivate request reaches here with a change: the
                // merge keeps the stored `active` for any other save (§0.202).
                // Deactivating takes away every right in this org, so it is an
                // Admin's to give and take back — and never your own (a lockout).
                // The status says WHY a row is off, so the first-load link can tell
                // a deactivated row from an invitation not yet accepted.
                const wasActive = !before || before.active !== false;
                const nowActive = clean.active !== false;
                if (before && wasActive !== nowActive) {
                    if (userRole !== 'Admin') {
                        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Only an Admin can deactivate or reactivate a member.' }) };
                    }
                    if (!nowActive && before.clerkUserId && before.clerkUserId === userId) {
                        return { statusCode: 400, headers, body: JSON.stringify({ error: 'You cannot deactivate yourself. Ask another Admin.' }) };
                    }
                    clean.profile = { ...clean.profile, status: nowActive ? (before.clerkUserId ? 'Active' : 'Invited') : 'Deactivated' };
                }
                // The member's team is one of this org's teams (state §0.205 — "Any of this org's, refuse"): asked only when
                // the save names one anew — the team the row holds is never asked again, one deleted since too. A Manager's
                // save of a rep's team is the org check alone (Jeff, 16 Oct: "No, leave it").
                const teamed = await checkLinks(TEAM_LINK, data, { teamId: before?.profile?.teamId ?? null }, orgId);
                if (teamed.error) return { statusCode: teamed.status, headers, body: JSON.stringify({ error: teamed.error, field: teamed.field }) };
                // The member's manager is a member of this org, never themselves (state §0.212): asked only when the save names
                // one anew — the one the row holds is never asked again, one removed since too.
                const managed = await checkLinks(MANAGER_LINK, data, { id: data.id, managerId: before?.profile?.managerId ?? null }, orgId);
                if (managed.error) return { statusCode: managed.status, headers, body: JSON.stringify({ error: managed.error, field: managed.field }) };
                // One manager, their name and their id (state §0.212): a save that changes one and names not the other leaves
                // no stale other — the name alone unlinks the id (a page loaded before §0.212 sends the name alone), the id
                // alone drops the old name (the readers name the id's member).
                if ('manager' in data && !('managerId' in data) && !sameValue(data.manager, before?.profile?.manager)) clean.profile = { ...clean.profile, managerId: null };
                if ('managerId' in data && !('manager' in data) && !sameValue(data.managerId, before?.profile?.managerId)) clean.profile = { ...clean.profile, manager: null };
                // One name per member of an org (state §0.196) — after the access
                // checks, so a Manager's deactivate is still the 403 it was.
                const putNameTaken = nameRefusal(await memberNamesOf(orgId), clean.name, data.id);
                if (putNameTaken) return nameTaken(putNameTaken);
                const result = await upsertUser(clean, { updateOnly: true });
                if (!result) {
                    return { statusCode: 404, headers, body: JSON.stringify({ error: 'That member is not in your organization — they may have been removed. Reload and try again.' }) };
                }
                await writeAudit(orgId, 'user.updated', result.id, result.name, userId, await getCallerName(userId, orgId));
                return { statusCode: 200, headers, body: JSON.stringify({ user: flatten(result) }) };
            } catch (err) {
                if (err.code === 'EMAIL_DUPLICATE') {
                    return { statusCode: 409, headers, body: JSON.stringify({ error: err.message, field: 'email' }) };
                }
                throw err;
            }
        }

        // ── DELETE ────────────────────────────────────────────────────────────
        if (event.httpMethod === 'DELETE') {
            // clear=true — delete all users for this org. Nothing in the app calls
            // it since the Clear All Data button went (108a3e3, 26 Mar); an Admin's
            // session still can. Admin only: the method-level ADMIN_ROLES gate
            // above also admits Managers, but wiping every user is destructive
            // enough to require full Admin. Writes an audit row + returns the
            // deleted count.
            if (event.queryStringParameters?.clear === 'true') {
                const forbidden = requireRole(auth, ['Admin'], headers);
                if (forbidden) return forbidden;
                // The org's pending invitations are revoked FIRST (state §0.167):
                // deleting every row left them live, and accepting one signed its
                // person in to the emptied org — as a rep, no row naming a role.
                // Fails closed, like a single revoke: a list or a revoke Clerk
                // refuses stops the clear before any row is deleted.
                const clerk = await clerkClient();
                let pending;
                try {
                    pending = await pendingInvitationsOf(clerk, orgId);
                } catch (e) {
                    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Could not read the pending invitations from Clerk. No member was removed.' }) };
                }
                for (const inv of pending) {
                    try {
                        await clerk.organizations.revokeOrganizationInvitation({ organizationId: orgId, invitationId: inv.id, requestingUserId: userId });
                    } catch (e) {
                        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Clerk did not revoke a pending invitation, so it may still be live. No member was removed — try again.' }) };
                    }
                }
                const deleted = await db.delete(users).where(eq(users.orgId, orgId)).returning({ id: users.id });
                invalidateRoster(orgId);
                await writeAudit(orgId, 'user.cleared', 'ALL', `All users (${deleted.length}); ${pending.length} pending invitation(s) revoked`, userId, await getCallerName(userId, orgId));
                return { statusCode: 200, headers, body: JSON.stringify({ success: true, cleared: true, count: deleted.length, revoked: pending.length }) };
            }
            const id = event.queryStringParameters?.id;
            if (!id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }
            // Removing a member is an Admin's (state §0.165), like deactivating
            // (§0.164): the role lives on the row since §0.163, so a Manager who
            // deleted an Admin's row demoted them — the next sign-in re-provisions
            // a rep. Never your own row.
            if (userRole !== 'Admin') {
                return { statusCode: 403, headers, body: JSON.stringify({ error: 'Only an Admin can remove a member.' }) };
            }
            const [deletedRow] = await db.select().from(users).where(and(eq(users.id, id), eq(users.orgId, orgId)));
            if (deletedRow && deletedRow.clerkUserId && deletedRow.clerkUserId === userId) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'You cannot remove yourself. Ask another Admin.' }) };
            }
            // An invitation not yet accepted is REVOKED, not deleted: deleting the
            // row left the Clerk invitation live, and accepting it signed the
            // person in to a new rep row.
            if (isOpenInvitationRow(deletedRow)) {
                return { statusCode: 409, headers, body: JSON.stringify({ error: 'They have not joined yet. Revoke the invitation instead.', code: 'invitation' }) };
            }
            await db.delete(users).where(and(eq(users.id, id), eq(users.orgId, orgId)));
            invalidateRoster(orgId);
            await writeAudit(orgId, 'user.deleted', id, deletedRow?.name || id, userId, await getCallerName(userId, orgId));
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    } catch (err) {
        console.error('Users function error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'users') };
    }
};
