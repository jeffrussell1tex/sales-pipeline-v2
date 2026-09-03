// coaching-notes.mjs — coaching notes addressed to a person, several people, or
// a team (state §0.82, handoff item 17).
//
// WHY ITS OWN TABLE. A note used to be a row in settings.extra.coachingNotes:
// one org-wide JSON blob that every Admin settings PUT rewrote, that a Manager
// could write only through a carve-out in the settings gate (§0.79), and that a
// rep could never see — the "rep" was a free-text name parsed from "rep: text",
// with no recipient, no read state and no delivery. Addressed, per-person
// content does not belong in an org-wide settings blob.
//
// Identity: authorId and every recipient id are users.id (usr_<uuid>);
// authorId is stamped from the caller, never taken from the payload. Visibility
// is decided in _coaching.mjs (pure, unit-tested) from the same rows the
// server reads — the client never filters.
//
// Methods:
//   GET               the notes the caller may see, newest first
//   POST              create (Admin | Manager). body: { id, text, date, recipientIds? | teamId? }
//                     legacy import (Admin): { ..., legacy:true, authorName } — upsert-on-id,
//                     so re-running the import is harmless (guide §18c)
//   PUT               { id, action:'read' } — the caller marks a note they can see as read
//   DELETE ?id=       author or Admin
import { db } from '../../db/index.js';
import { coachingNotes, users, settings } from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { verifyAuth, requireRole, requireWrite } from './auth.mjs';
import { serverErrorBody, writeAudit } from './_lib.mjs';
import { noteVisibleTo, canDeleteNote, audienceOf, isDay } from './_coaching.mjs';

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

/** The caller's roster row (id, role, team, first-day fields) — null when not in this org's roster. */
async function callerRow(clerkUserId, orgId, userRole) {
    const [row] = await db.select().from(users)
        .where(and(eq(users.clerkUserId, clerkUserId), eq(users.orgId, orgId)));
    if (!row) return null;
    // The role that authorizes is the verified one (Clerk metadata), not the mirror column.
    return { ...row, role: userRole };
}

/** settings.extra.teams for the org — [{ id, name, managerId, repIds }] or []. */
async function teamsOf(orgId) {
    const [row] = await db.select({ extra: settings.extra }).from(settings)
        .where(eq(settings.orgId, orgId)).orderBy(desc(settings.updatedAt)).limit(1);
    const teams = row?.extra?.teams;
    return Array.isArray(teams) ? teams : [];
}

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return reply(auth.status || 401, { error: auth.error });
    const { userId, orgId, userRole } = auth;

    const forbidden = requireWrite(auth, event, headers);
    if (forbidden) return forbidden;

    try {
        const me = await callerRow(userId, orgId, userRole);

        if (event.httpMethod === 'GET') {
            // An unresolvable caller sees nothing — noteVisibleTo refuses a null id (18b22).
            if (!me) return reply(200, { coachingNotes: [] });
            const [rows, teams] = await Promise.all([
                db.select().from(coachingNotes).where(eq(coachingNotes.orgId, orgId)).orderBy(desc(coachingNotes.createdAt)),
                teamsOf(orgId),
            ]);
            return reply(200, { coachingNotes: rows.filter(n => noteVisibleTo(n, me, teams)) });
        }

        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body || '{}');
            const legacy = data.legacy === true;
            const forbiddenRole = requireRole(auth, legacy ? ['Admin'] : ['Admin', 'Manager'], headers);
            if (forbiddenRole) return forbiddenRole;
            if (!me) return reply(403, { error: 'Your account is not in this organization\'s roster.' });

            if (!data.id || typeof data.id !== 'string') return reply(400, { error: 'id is required' });
            const text = String(data.text ?? '').trim();
            if (!text) return reply(400, { error: 'The note is empty.' });
            if (!isDay(data.date)) return reply(400, { error: 'date must be yyyy-mm-dd (the author\'s local day)' });
            const audience = audienceOf(data, { legacy });
            if (!audience.ok) return reply(400, { error: audience.error });

            // Recipients must be roster rows of THIS org; a team must exist in this org's settings.
            if (audience.recipientIds.length) {
                const rows = await db.select({ id: users.id }).from(users).where(eq(users.orgId, orgId));
                const known = new Set(rows.map(r => r.id));
                const unknown = audience.recipientIds.filter(id => !known.has(id));
                if (unknown.length) return reply(400, { error: `Unknown recipient${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}` });
            }
            if (audience.teamId) {
                const teams = await teamsOf(orgId);
                if (!teams.some(t => t && t.id === audience.teamId)) return reply(400, { error: 'Unknown team' });
            }

            const values = {
                id:           data.id,
                orgId,
                authorId:     me.id,                                                    // server-stamped, never the payload
                authorName:   legacy ? (String(data.authorName || '').trim() || me.name) : me.name,
                text,
                date:         data.date,
                recipientIds: audience.recipientIds,
                teamId:       audience.teamId,
                readBy:       {},
                legacy,
            };
            let inserted, created = true;
            if (legacy) {
                // Idempotent: the id is derived from the old blob row, so a second import is a no-op.
                const rows = await db.insert(coachingNotes).values(values).onConflictDoNothing({ target: coachingNotes.id }).returning();
                if (rows.length) inserted = rows[0];
                else {
                    created = false;
                    [inserted] = await db.select().from(coachingNotes).where(and(eq(coachingNotes.id, data.id), eq(coachingNotes.orgId, orgId)));
                    if (!inserted) return reply(409, { error: 'That id already exists in another organization.' });
                }
            } else {
                [inserted] = await db.insert(coachingNotes).values(values).returning();
            }
            if (created) {
                await writeAudit(orgId, {
                    action: legacy ? 'coaching_note.imported' : 'coaching_note.created', entityType: 'coaching_note', entityId: inserted.id,
                    entityName: audience.teamId ? `team ${audience.teamId}` : `${audience.recipientIds.length} recipient(s)`,
                    detail: text.slice(0, 120), userId,
                });
            }
            return reply(created ? 201 : 200, { coachingNote: inserted });
        }

        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body || '{}');
            if (!data.id || data.action !== 'read') return reply(400, { error: 'id and action "read" are required' });
            if (!me) return reply(403, { error: 'Your account is not in this organization\'s roster.' });
            const [note] = await db.select().from(coachingNotes)
                .where(and(eq(coachingNotes.id, data.id), eq(coachingNotes.orgId, orgId)));
            if (!note) return reply(404, { error: 'Not found' });
            const teams = await teamsOf(orgId);
            if (!noteVisibleTo(note, me, teams)) return reply(404, { error: 'Not found' });   // not 403: do not confirm the note exists
            const readBy = { ...(note.readBy && typeof note.readBy === 'object' ? note.readBy : {}), [me.id]: new Date().toISOString() };
            const [updated] = await db.update(coachingNotes).set({ readBy, updatedAt: new Date() })
                .where(and(eq(coachingNotes.id, data.id), eq(coachingNotes.orgId, orgId))).returning();
            return reply(200, { coachingNote: updated });
        }

        if (event.httpMethod === 'DELETE') {
            const id = event.queryStringParameters?.id;
            if (!id) return reply(400, { error: 'id is required' });
            if (!me) return reply(403, { error: 'Your account is not in this organization\'s roster.' });
            const [note] = await db.select().from(coachingNotes)
                .where(and(eq(coachingNotes.id, id), eq(coachingNotes.orgId, orgId)));
            if (!note) return reply(404, { error: 'Not found' });
            if (!canDeleteNote(note, me)) return reply(403, { error: 'Only the note\'s author or an Admin can delete it.' });
            await db.delete(coachingNotes).where(and(eq(coachingNotes.id, id), eq(coachingNotes.orgId, orgId)));
            await writeAudit(orgId, { action: 'coaching_note.deleted', entityType: 'coaching_note', entityId: id, entityName: null, detail: null, userId });
            return reply(200, { success: true });
        }

        return reply(405, { error: 'Method not allowed' });
    } catch (err) {
        console.error('coaching-notes error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'coaching-notes') };
    }
};
