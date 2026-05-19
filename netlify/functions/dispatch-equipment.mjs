import { db } from '../../db/index.js';
import { dispatchEquipment } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function normalise(row) {
    return {
        id:                  row.id,
        orgId:               row.orgId                ?? row.org_id,
        name:                row.name                 ?? '',
        category:            row.category             ?? 'general',
        serialNumber:        row.serialNumber         ?? row.serial_number         ?? null,
        assetTag:            row.assetTag             ?? row.asset_tag             ?? null,
        make:                row.make                 ?? null,
        model:               row.model                ?? null,
        purchaseDate:        row.purchaseDate         ?? row.purchase_date         ?? null,
        purchasePrice:       row.purchasePrice        ?? row.purchase_price        ?? null,
        status:              row.status               ?? 'available',
        checkedOutToId:      row.checkedOutToId       ?? row.checked_out_to_id     ?? null,
        checkedOutJobId:     row.checkedOutJobId      ?? row.checked_out_job_id    ?? null,
        checkedOutAt:        row.checkedOutAt         ?? row.checked_out_at        ?? null,
        lastCalibrationDate: row.lastCalibrationDate  ?? row.last_calibration_date ?? null,
        nextCalibrationDate: row.nextCalibrationDate  ?? row.next_calibration_date ?? null,
        notes:               row.notes                ?? null,
        createdAt:           row.createdAt            ?? row.created_at,
        updatedAt:           row.updatedAt            ?? row.updated_at,
    };
}

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { orgId } = auth;

    try {
        // ── GET ───────────────────────────────────────────────────────────────
        if (event.httpMethod === 'GET') {
            const rows = await db.select().from(dispatchEquipment)
                .where(eq(dispatchEquipment.orgId, orgId));
            return { statusCode: 200, headers, body: JSON.stringify({ equipment: rows.map(normalise) }) };
        }

        // ── POST: create ──────────────────────────────────────────────────────
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body || '{}');
            if (!data.id)   return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
            if (!data.name) return { statusCode: 400, headers, body: JSON.stringify({ error: 'name required' }) };

            const row = {
                id:                  data.id,
                orgId,
                name:                data.name,
                category:            data.category            ?? 'general',
                serialNumber:        data.serialNumber        ?? null,
                assetTag:            data.assetTag            ?? null,
                make:                data.make                ?? null,
                model:               data.model               ?? null,
                purchaseDate:        data.purchaseDate        ?? null,
                purchasePrice:       data.purchasePrice       ?? null,
                status:              data.status              ?? 'available',
                checkedOutToId:      data.checkedOutToId      ?? null,
                checkedOutJobId:     data.checkedOutJobId     ?? null,
                checkedOutAt:        data.checkedOutAt        ? new Date(data.checkedOutAt) : null,
                lastCalibrationDate: data.lastCalibrationDate ?? null,
                nextCalibrationDate: data.nextCalibrationDate ?? null,
                notes:               data.notes               ?? null,
                createdAt:           new Date(),
                updatedAt:           new Date(),
            };

            await db.insert(dispatchEquipment).values(row)
                .onConflictDoUpdate({
                    target: dispatchEquipment.id,
                    set: { ...row, createdAt: undefined },
                });

            const [inserted] = await db.select().from(dispatchEquipment)
                .where(and(eq(dispatchEquipment.id, data.id), eq(dispatchEquipment.orgId, orgId)));

            return { statusCode: 201, headers, body: JSON.stringify({ item: normalise(inserted) }) };
        }

        // ── PUT: update or check-out/check-in ────────────────────────────────
        // Special actions via ?action=checkout or ?action=checkin
        if (event.httpMethod === 'PUT') {
            const params = event.queryStringParameters || {};
            const id     = params.id;
            const action = params.action; // 'checkout' | 'checkin' | undefined (general update)
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };

            const data    = JSON.parse(event.body || '{}');
            let updates   = { updatedAt: new Date() };

            if (action === 'checkout') {
                // Check out to a tech and/or job
                if (!data.checkedOutToId && !data.checkedOutJobId) {
                    return { statusCode: 400, headers, body: JSON.stringify({ error: 'checkedOutToId or checkedOutJobId required' }) };
                }
                updates.status         = 'checked_out';
                updates.checkedOutToId  = data.checkedOutToId  ?? null;
                updates.checkedOutJobId = data.checkedOutJobId ?? null;
                updates.checkedOutAt    = new Date();
            } else if (action === 'checkin') {
                // Return equipment
                updates.status          = 'available';
                updates.checkedOutToId  = null;
                updates.checkedOutJobId = null;
                updates.checkedOutAt    = null;
            } else {
                // General field update
                const fields = [
                    'name','category','serialNumber','assetTag','make','model',
                    'purchaseDate','purchasePrice','status','checkedOutToId',
                    'checkedOutJobId','lastCalibrationDate','nextCalibrationDate','notes',
                ];
                fields.forEach(f => { if (f in data) updates[f] = data[f]; });
                if ('checkedOutAt' in data) updates.checkedOutAt = data.checkedOutAt ? new Date(data.checkedOutAt) : null;
            }

            await db.update(dispatchEquipment).set(updates)
                .where(and(eq(dispatchEquipment.id, id), eq(dispatchEquipment.orgId, orgId)));

            const [updated] = await db.select().from(dispatchEquipment)
                .where(and(eq(dispatchEquipment.id, id), eq(dispatchEquipment.orgId, orgId)));

            if (!updated) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
            return { statusCode: 200, headers, body: JSON.stringify({ item: normalise(updated) }) };
        }

        // ── DELETE ────────────────────────────────────────────────────────────
        if (event.httpMethod === 'DELETE') {
            const id = (event.queryStringParameters || {}).id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
            await db.delete(dispatchEquipment)
                .where(and(eq(dispatchEquipment.id, id), eq(dispatchEquipment.orgId, orgId)));
            return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    } catch (err) {
        console.error('dispatch-equipment error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
