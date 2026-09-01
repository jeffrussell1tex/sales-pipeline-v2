import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { eq, asc, and } from 'drizzle-orm';
import { verifyAuth, requireRole, isAppRole, APP_ROLES } from './auth.mjs';
import { auditLog } from '../../db/schema.js';
import { serverErrorBody, resolveCaller, invalidateRoster, getCallerName } from './_lib.mjs';
import { randomUUID } from 'crypto';

const ADMIN_ROLES = ['Admin', 'Manager'];

// Roster ids are ours and permanent. This function is the ONLY place a new one
// is minted. Nothing derives an id from Clerk, from an email, or from a name:
// all three can change, and a primary key that changes is not a primary key.
const newUserId = () => 'usr_' + randomUUID();

const writeAudit = async (orgId, action, entityId, entityName, actorId, actorName) => {
    try {
        await db.insert(auditLog).values({
            id:         'audit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            orgId,
            action,
            entityType: 'user',
            entityId:   String(entityId || ''),
            entityName: entityName || null,
            userId:     actorId    || null,
            userName:   actorName  || null,
            timestamp:  new Date(),
        });
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
        return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    }

    const { userId, orgId, userRole } = auth;

    // ── Helpers (hoisted above all early-exit handlers so they're available everywhere) ──

    // ROLE IS DELIBERATELY ABSENT from sanitize.
    //
    // Clerk publicMetadata.role is the source of truth — auth.mjs reads it on
    // every request and this table is only a mirror. Taking role from the request
    // body caused two problems that produced the drift between the Accelerep user
    // list and Clerk:
    //   1. `PUT ?me=true` let any user rewrite their own mirror role, and a save
    //      that simply omitted userType silently downgraded them to 'User'.
    //   2. An admin editing a user wrote the new role to the mirror only, so the
    //      roster and actual authorization disagreed with no warning.
    // Role changes go through user-role.mjs, which writes Clerk first. Callers
    // that legitimately set role (invite, Clerk sync, user-role) pass it
    // explicitly via withRole() below.
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
            status:           data.status            || null,
            // Quota fields — stored in profile jsonb so they survive DB round-trips
            annualQuota:   data.annualQuota   ?? null,
            q1Quota:       data.q1Quota       ?? null,
            q2Quota:       data.q2Quota       ?? null,
            q3Quota:       data.q3Quota       ?? null,
            q4Quota:       data.q4Quota       ?? null,
            quotaType:     data.quotaType     || null,
        },
    });

    // Flatten a DB row back into the shape the frontend expects
    // Attach a role explicitly. `known` should come from Clerk (sync/invite) or
    // from the existing row — never from a client request body.
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
    //   role      users.role          maintained by user-role.mjs and the Clerk sync
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
                    // Validated, not copied. auth.mjs refuses a role it does not
                    // recognise, so mirroring one here would only make the roster
                    // agree with a value that authorizes nothing.
                    const clerkRole = clerkUser.publicMetadata?.role;
                    const realRole = isAppRole(clerkRole) ? clerkRole
                                   : isAppRole(row.role)  ? row.role
                                   : 'User';
                    try {
                        await db.update(users)
                            .set({
                                clerkUserId: userId,
                                role:        realRole,
                                active:      true,
                                profile:     { ...(row.profile || {}), status: 'Active', userType: realRole },
                                updatedAt:   new Date(),
                            })
                            .where(and(eq(users.id, row.id), eq(users.orgId, orgId)));
                        row = { ...row, clerkUserId: userId, role: realRole, active: true };
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
            const clean = withRole(sanitize(await mergeForUpdate(data)), await roleOf(data.id) || 'User');
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
    const DIRECTORY_FIELDS = (row) => ({ id: row.id, name: row.name, active: row.active });

    if (event.httpMethod === 'GET' && !ADMIN_ROLES.includes(userRole)) {
        try {
            const rows = await db.select({ id: users.id, name: users.name, active: users.active })
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
            const { id, ...updateData } = clean;
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

            // ── Invite flow ───────────────────────────────────────────────────
            if (data.action === 'invite') {
                const invites = Array.isArray(data.invites) ? data.invites : [];
                if (invites.length === 0) {
                    return { statusCode: 400, headers, body: JSON.stringify({ error: 'No invites provided' }) };
                }

                // Initialise Clerk backend client once for this batch
                const { createClerkClient } = await import('@clerk/backend');
                const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

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
                    const list = await clerk.organizations.getOrganizationInvitationList({ organizationId: orgId, status: ['pending'], limit: 500 });
                    pendingInvitations = list?.data || (Array.isArray(list) ? list : []);
                } catch (e) {
                    console.warn('users.mjs: could not list pending org invitations:', e.message);
                }

                const results = [];
                const errors  = [];

                for (const invite of invites) {
                    const email = (invite.email || '').trim().toLowerCase();
                    if (!email) { errors.push({ email: '', error: 'Email required' }); continue; }

                    // The invited role is written into Clerk publicMetadata below, and
                    // auth.mjs reads that on every request for the life of the account.
                    // An unvalidated value therefore persists as a role no gate knows:
                    // the invite screen seeded its rows with 'Sales Rep' (the LABEL for
                    // 'User'), so an untouched row created exactly that. Refuse the row
                    // rather than coercing it — the caller chose a role and is entitled
                    // to be told it was not one.
                    if (invite.role !== undefined && invite.role !== null && !isAppRole(invite.role)) {
                        errors.push({ email, error: `"${invite.role}" is not a valid role. Expected one of: ${APP_ROLES.join(', ')}.` });
                        continue;
                    }

                    try {
                        // 1. Revoke any existing pending invitation for this email so the
                        //    re-create below succeeds and sends a brand-new magic link.
                        const existingInv = pendingInvitations.find(
                            (inv) => (inv.emailAddress || inv.email_address || '').toLowerCase() === email
                        );
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
                            redirectUrl:    appUrl,
                            publicMetadata: {
                                role:      invite.role      || 'User',
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
                            const row = await upsertUser(withRole(sanitize({
                                id:        newUserId(),
                                email,
                                name:      email.split('@')[0],
                                userType:  invite.role      || 'User',
                                team:      invite.team      || null,
                                territory: invite.territory || null,
                                active:    false,
                                status:    'Invited',
                            }), invite.role || 'User'));
                            results.push(flatten(row));
                        }

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
            try {
                const result = await upsertUser(withRole(sanitize({ ...data, id: data.id || newUserId() }), createRole));
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
                // Role is preserved, never taken from the body: writing it here
                // would change the roster without changing Clerk, which is what
                // auth.mjs actually reads. Role changes go through user-role.mjs.
                const merged = await mergeForUpdate(data);
                const result = await upsertUser(withRole(sanitize(merged), await roleOf(data.id) || 'User'));
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
            // clear=true — delete all users for this org (used by Clear All Data).
            // Admin only: the method-level ADMIN_ROLES gate above also admits
            // Managers, but wiping every user is destructive enough to require
            // full Admin. Writes an audit row + returns the deleted count.
            if (event.queryStringParameters?.clear === 'true') {
                const forbidden = requireRole(auth, ['Admin'], headers);
                if (forbidden) return forbidden;
                const deleted = await db.delete(users).where(eq(users.orgId, orgId)).returning({ id: users.id });
                invalidateRoster(orgId);
                await writeAudit(orgId, 'user.cleared', 'ALL', `All users (${deleted.length})`, userId, await getCallerName(userId, orgId));
                return { statusCode: 200, headers, body: JSON.stringify({ success: true, cleared: true, count: deleted.length }) };
            }
            const id = event.queryStringParameters?.id;
            if (!id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }
            const [deletedRow] = await db.select().from(users).where(and(eq(users.id, id), eq(users.orgId, orgId)));
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
