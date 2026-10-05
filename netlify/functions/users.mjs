import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { eq, asc, and, sql } from 'drizzle-orm';
import { verifyAuth, requireRole, isAppRole, APP_ROLES } from './auth.mjs';
import { auditLog } from '../../db/schema.js';
import { serverErrorBody, resolveCaller, invalidateRoster, getCallerName, ensureRosterRow, isOpenInvitationRow } from './_lib.mjs';
import { pickSelfEditable } from './_selfProfile.mjs';
import { randomUUID } from 'crypto';
// Pure, shared with the Sales Manager tab (the _stage.mjs / stageClock.js
// arrangement): one validator decides the forecast-call shape on both sides.
import { cleanForecastCalls } from '../../src/utils/forecastCall.js';
import { streamAudit } from './_auditStream.mjs';
import { crmReadScope } from '../../src/utils/roles.js';
import { INVITE_EXPIRY_DAYS, DEFAULT_INVITE_EXPIRY_DAYS } from '../../src/utils/inviteExpiry.js';

const ADMIN_ROLES = ['Admin', 'Manager'];

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
        name:         ((data.firstName || '') + ' ' + (data.lastName || '')).trim() || data.name || 'Unnamed User',
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
    // stored value. Unknown id -> nothing to merge, and the upsert still inserts.
    const mergeForUpdate = async (data) => {
        const [existing] = await db.select().from(users)
            .where(and(eq(users.id, data.id), eq(users.orgId, orgId)));
        if (!existing) return data;
        return { ...flatten(existing), ...data };
    };

    // ── GET ?me=true — any authenticated user can fetch their own record ──────
    //
    // Lookup order, all of it scoped to THIS org:
    //   1. clerkUserId match — the normal path once a user has accepted
    //   2. Email match       — an invited row that has not been linked yet
    //   3. Display name      — legacy fallback for hand-created rows
    //
    // On a match via email or name we LINK the row by setting clerkUserId. We do
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
                const displayName = ((clerkUser.firstName || '') + ' ' + (clerkUser.lastName || '')).trim();

                // 2. Email match — catches invited users whose DB row has a pending_ id
                if (clerkEmail) {
                    [row] = await db.select().from(users).where(
                        and(eq(users.email, clerkEmail), eq(users.orgId, orgId))
                    );
                }
                const matchedByEmail = !!row;

                // 3. Display name fallback
                if (!row && displayName) {
                    [row] = await db.select().from(users).where(
                        and(eq(users.name, displayName), eq(users.orgId, orgId))
                    );
                }

                // Found by email or name and not yet linked: LINK it. The row keeps
                // its id -- only clerkUserId, role and active are written.
                //
                // NOTE ON NAME. This deliberately does NOT refresh the display
                // name from Clerk. Ownership columns still store names, so
                // rewriting one here would detach every record this user owns,
                // on an ordinary page load, with no audit trail. users-sync.mjs
                // has the same hazard and is Admin-triggered; this path fires
                // for every user on every load and must not carry it.
                if (row && !row.clerkUserId) {
                    // The ROW's role — it is this org's, and it is what the server
                    // enforces (state §0.163) — and only when the row was found by
                    // the invited EMAIL: the invitation was addressed to this
                    // person. A row found by display name alone was not, so its
                    // role does not come with it: the caller links as a rep and an
                    // Admin grants anything more. Never Clerk's user-level role —
                    // one value for every org. Validated: a value that is not one
                    // of ours authorizes nothing, so it is not carried over.
                    const linkRole = matchedByEmail && isAppRole(row.role) ? row.role : 'User';
                    // A row an Admin DEACTIVATED stays off when its person first
                    // signs in (state §0.164): linking it must not switch it back
                    // on — an invited row (status Invited) is the one turned on here.
                    const stillOff = row.profile?.status === 'Deactivated';
                    try {
                        await db.update(users)
                            .set({
                                clerkUserId: userId,
                                role:        linkRole,
                                active:      !stillOff,
                                profile:     { ...(row.profile || {}), status: stillOff ? 'Deactivated' : 'Active', userType: linkRole },
                                updatedAt:   new Date(),
                            })
                            .where(and(eq(users.id, row.id), eq(users.orgId, orgId)));
                        row = { ...row, clerkUserId: userId, role: linkRole, active: !stillOff };
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
            // merge (state §0.109, guide §18b34). The client sends the whole row
            // it holds, so before this every administrative field on it — quota,
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
            const { id, ...updateData } = clean;
            let upsertResult;
            try {
                // Include orgId so the row is properly scoped to this tenant, and
                // pin the Clerk link -- a self-save must never orphan it.
                const [ins] = await db.insert(users).values({ ...clean, clerkUserId: userId, orgId }).returning();
                upsertResult = ins;
            } catch {
                const [upd] = await db
                    .update(users)
                    .set({ ...updateData, clerkUserId: userId, updatedAt: new Date() })
                    .where(and(eq(users.id, data.id), eq(users.orgId, orgId)))
                    .returning();
                upsertResult = upd;
            }
            invalidateRoster(orgId);
            return { statusCode: 200, headers, body: JSON.stringify({ user: flatten(upsertResult) }) };
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
        const upsertUser = async (clean) => {
            // An EXISTING row's role is never changed here — a create that names
            // an id already in the org, or a PUT: the role on the row is what the
            // server enforces (state §0.163), and user-role.mjs, Admin-only, is
            // the one path that changes it. A new row is inserted with its role.
            const { id, role: _keepStoredRole, ...updateData } = clean;
            try {
                const [row] = await db
                    .insert(users)
                    .values({ ...clean, orgId })
                    .onConflictDoUpdate({
                        target: users.id, setWhere: eq(users.orgId, orgId),
                        set: { ...updateData, updatedAt: new Date() },
                    })
                    .returning();
                invalidateRoster(orgId);
                return row;
            } catch (err) {
                // Postgres unique_violation = code 23505
                // The Neon serverless driver may surface the constraint info in
                // err.message, err.detail, err.constraint, or err.cause — check all.
                const errStr = [err.message, err.detail, err.constraint, err.cause?.message]
                    .filter(Boolean).join(' ').toLowerCase();
                const isUniqueViolation = err.code === '23505' || errStr.includes('unique');
                const isEmailField = errStr.includes('email');
                if (isUniqueViolation && isEmailField) {
                    const dupErr = new Error('A user with that email address already exists in this organization. Please use a different email.');
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
                                .set({ profile: mergedProfile, updatedAt: new Date() })
                                .where(and(eq(users.id, existingRow.id), eq(users.orgId, orgId)))
                                .returning();
                            results.push(flatten(row || existingRow));
                        } else {
                            // A real, permanent id from the start. The row is simply
                            // not linked to a Clerk identity yet (clerkUserId null),
                            // and acceptance fills that in without touching the id.
                            // The old `pending_` id was a placeholder that later got
                            // overwritten -- the rewrite this batch removes.
                            // The name the invitation carries (state §0.167 — the
                            // team import sends each row's): the first sign-in links
                            // this row and never renames it (GET ?me — ownership stores
                            // names), so it is the name the member keeps. Cut to the
                            // column's 255 here: the row is written after Clerk has sent
                            // the invitation, so a name the column cannot hold must never
                            // reach the insert. None given, the address's local part, as before.
                            const givenName = typeof invite.name === 'string' ? invite.name.trim().slice(0, 255) : '';
                            const row = await upsertUser(withRole(sanitize({
                                id:        newUserId(),
                                email,
                                name:      givenName || email.split('@')[0],
                                userType:  invite.role      || 'User',
                                team:      invite.team      || null,
                                // The team's id with its name (state §0.168): teamId is
                                // what coaching notes and the manager digest read, and
                                // the invite stored the name alone. The screen resolves
                                // it from the org's teams, as the team editor does.
                                teamId:    (typeof invite.teamId === 'string' && invite.teamId) ? invite.teamId : null,
                                territory: invite.territory || null,
                                active:    false,
                                status:    'Invited',
                            }), invite.role || 'User'));
                            results.push(flatten(row));
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
                const result = await upsertUser(withRole(sanitize({ ...data, id: newUserId() }), createRole));
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

        // ── PUT (update) ──────────────────────────────────────────────────────
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body || '{}');
            if (!data.id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
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
                // ACCESS (state §0.164 — Jeff: "Deactivated means no access").
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
                const result = await upsertUser(clean);
                if (!result) {
                    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Update returned no row' }) };
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
