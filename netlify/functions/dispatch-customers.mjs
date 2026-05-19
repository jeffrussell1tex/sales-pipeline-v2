import { db } from '../../db/index.js';
import { dispatchCustomers, dispatchServiceLocations } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function normaliseCust(row) {
    return {
        id:                 row.id,
        orgId:              row.orgId               ?? row.org_id,
        accountId:          row.accountId           ?? row.account_id           ?? null,
        name:               row.name                ?? '',
        contactName:        row.contactName         ?? row.contact_name         ?? null,
        contactPhone:       row.contactPhone        ?? row.contact_phone        ?? null,
        contactEmail:       row.contactEmail        ?? row.contact_email        ?? null,
        customerType:       row.customerType        ?? row.customer_type        ?? 'commercial',
        billingAddress:     row.billingAddress      ?? row.billing_address      ?? null,
        billingCity:        row.billingCity         ?? row.billing_city         ?? null,
        billingState:       row.billingState        ?? row.billing_state        ?? null,
        billingZip:         row.billingZip          ?? row.billing_zip          ?? null,
        serviceAddress:     row.serviceAddress      ?? row.service_address      ?? null,
        serviceCity:        row.serviceCity         ?? row.service_city         ?? null,
        serviceState:       row.serviceState        ?? row.service_state        ?? null,
        serviceZip:         row.serviceZip          ?? row.service_zip          ?? null,
        serviceAgreement:   row.serviceAgreement    ?? row.service_agreement    ?? 'none',
        agreementExpiry:    row.agreementExpiry     ?? row.agreement_expiry     ?? null,
        preferredTechId:    row.preferredTechId     ?? row.preferred_tech_id    ?? null,
        doNotService:       row.doNotService        ?? row.do_not_service       ?? false,
        doNotServiceReason: row.doNotServiceReason  ?? row.do_not_service_reason ?? null,
        taxExempt:          row.taxExempt           ?? row.tax_exempt           ?? false,
        taxExemptId:        row.taxExemptId         ?? row.tax_exempt_id        ?? null,
        paymentMethod:      row.paymentMethod       ?? row.payment_method       ?? null,
        creditLimit:        row.creditLimit         ?? row.credit_limit         ?? null,
        notes:              row.notes               ?? null,
        tags:               row.tags                ?? [],
        createdAt:          row.createdAt           ?? row.created_at,
        updatedAt:          row.updatedAt           ?? row.updated_at,
    };
}

function normaliseLoc(row) {
    return {
        id:            row.id,
        orgId:         row.orgId         ?? row.org_id,
        customerId:    row.customerId    ?? row.customer_id,
        name:          row.name          ?? '',
        address:       row.address       ?? '',
        city:          row.city          ?? '',
        state:         row.state         ?? null,
        zip:           row.zip           ?? null,
        accessNotes:   row.accessNotes   ?? row.access_notes   ?? null,
        locationType:  row.locationType  ?? row.location_type  ?? null,
        squareFeet:    row.squareFeet    ?? row.square_feet    ?? null,
        floors:        row.floors        ?? null,
        isDefault:     row.isDefault     ?? row.is_default     ?? false,
        gateCode:      row.gateCode      ?? row.gate_code      ?? null,
        contactOnSite: row.contactOnSite ?? row.contact_on_site ?? null,
        contactPhone:  row.contactPhone  ?? row.contact_phone  ?? null,
        notes:         row.notes         ?? null,
        createdAt:     row.createdAt     ?? row.created_at,
        updatedAt:     row.updatedAt     ?? row.updated_at,
    };
}

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { orgId } = auth;

    const params  = event.queryStringParameters || {};
    // ?resource=locations routes to service locations sub-resource
    const resource = params.resource; // 'locations' | undefined

    try {
        // ════════════════════════════════════════════════════
        // SERVICE LOCATIONS sub-resource
        // ════════════════════════════════════════════════════
        if (resource === 'locations') {
            if (event.httpMethod === 'GET') {
                const where = params.customerId
                    ? and(eq(dispatchServiceLocations.orgId, orgId), eq(dispatchServiceLocations.customerId, params.customerId))
                    : eq(dispatchServiceLocations.orgId, orgId);
                const rows = await db.select().from(dispatchServiceLocations).where(where);
                return { statusCode: 200, headers, body: JSON.stringify({ locations: rows.map(normaliseLoc) }) };
            }

            if (event.httpMethod === 'POST') {
                const data = JSON.parse(event.body || '{}');
                if (!data.id || !data.customerId || !data.name || !data.address || !data.city) {
                    return { statusCode: 400, headers, body: JSON.stringify({ error: 'id, customerId, name, address, city required' }) };
                }
                const row = {
                    id:            data.id,
                    orgId,
                    customerId:    data.customerId,
                    name:          data.name,
                    address:       data.address,
                    city:          data.city,
                    state:         data.state         ?? null,
                    zip:           data.zip           ?? null,
                    accessNotes:   data.accessNotes   ?? null,
                    locationType:  data.locationType  ?? null,
                    squareFeet:    data.squareFeet    ?? null,
                    floors:        data.floors        ?? null,
                    isDefault:     data.isDefault     ?? false,
                    gateCode:      data.gateCode      ?? null,
                    contactOnSite: data.contactOnSite ?? null,
                    contactPhone:  data.contactPhone  ?? null,
                    notes:         data.notes         ?? null,
                    createdAt:     new Date(),
                    updatedAt:     new Date(),
                };
                await db.insert(dispatchServiceLocations).values(row)
                    .onConflictDoUpdate({ target: dispatchServiceLocations.id, set: { ...row, createdAt: undefined } });
                const [inserted] = await db.select().from(dispatchServiceLocations)
                    .where(and(eq(dispatchServiceLocations.id, data.id), eq(dispatchServiceLocations.orgId, orgId)));
                return { statusCode: 201, headers, body: JSON.stringify({ location: normaliseLoc(inserted) }) };
            }

            if (event.httpMethod === 'PUT') {
                const id = params.id;
                if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
                const data = JSON.parse(event.body || '{}');
                const updates = { updatedAt: new Date() };
                ['name','address','city','state','zip','accessNotes','locationType',
                 'squareFeet','floors','isDefault','gateCode','contactOnSite','contactPhone','notes',
                ].forEach(f => { if (f in data) updates[f] = data[f]; });
                await db.update(dispatchServiceLocations).set(updates)
                    .where(and(eq(dispatchServiceLocations.id, id), eq(dispatchServiceLocations.orgId, orgId)));
                const [updated] = await db.select().from(dispatchServiceLocations)
                    .where(and(eq(dispatchServiceLocations.id, id), eq(dispatchServiceLocations.orgId, orgId)));
                if (!updated) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
                return { statusCode: 200, headers, body: JSON.stringify({ location: normaliseLoc(updated) }) };
            }

            if (event.httpMethod === 'DELETE') {
                const id = params.id;
                if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
                await db.delete(dispatchServiceLocations)
                    .where(and(eq(dispatchServiceLocations.id, id), eq(dispatchServiceLocations.orgId, orgId)));
                return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
            }
        }

        // ════════════════════════════════════════════════════
        // CUSTOMERS resource (default)
        // ════════════════════════════════════════════════════
        if (event.httpMethod === 'GET') {
            const rows = await db.select().from(dispatchCustomers)
                .where(eq(dispatchCustomers.orgId, orgId));
            return { statusCode: 200, headers, body: JSON.stringify({ customers: rows.map(normaliseCust) }) };
        }

        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body || '{}');
            if (!data.id || !data.name) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id and name required' }) };
            }
            const row = {
                id:                 data.id,
                orgId,
                accountId:          data.accountId          ?? null,
                name:               data.name,
                contactName:        data.contactName        ?? null,
                contactPhone:       data.contactPhone       ?? null,
                contactEmail:       data.contactEmail       ?? null,
                customerType:       data.customerType       ?? 'commercial',
                billingAddress:     data.billingAddress     ?? null,
                billingCity:        data.billingCity        ?? null,
                billingState:       data.billingState       ?? null,
                billingZip:         data.billingZip         ?? null,
                serviceAddress:     data.serviceAddress     ?? null,
                serviceCity:        data.serviceCity        ?? null,
                serviceState:       data.serviceState       ?? null,
                serviceZip:         data.serviceZip         ?? null,
                serviceAgreement:   data.serviceAgreement   ?? 'none',
                agreementExpiry:    data.agreementExpiry    ?? null,
                preferredTechId:    data.preferredTechId    ?? null,
                doNotService:       data.doNotService       ?? false,
                doNotServiceReason: data.doNotServiceReason ?? null,
                taxExempt:          data.taxExempt          ?? false,
                taxExemptId:        data.taxExemptId        ?? null,
                paymentMethod:      data.paymentMethod      ?? null,
                creditLimit:        data.creditLimit        ?? null,
                notes:              data.notes              ?? null,
                tags:               JSON.stringify(data.tags ?? []),
                createdAt:          new Date(),
                updatedAt:          new Date(),
            };
            await db.insert(dispatchCustomers).values(row)
                .onConflictDoUpdate({ target: dispatchCustomers.id, set: { ...row, createdAt: undefined } });
            const [inserted] = await db.select().from(dispatchCustomers)
                .where(and(eq(dispatchCustomers.id, data.id), eq(dispatchCustomers.orgId, orgId)));
            return { statusCode: 201, headers, body: JSON.stringify({ customer: normaliseCust(inserted) }) };
        }

        if (event.httpMethod === 'PUT') {
            const id = params.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
            const data = JSON.parse(event.body || '{}');
            const updates = { updatedAt: new Date() };
            ['accountId','name','contactName','contactPhone','contactEmail','customerType',
             'billingAddress','billingCity','billingState','billingZip',
             'serviceAddress','serviceCity','serviceState','serviceZip',
             'serviceAgreement','agreementExpiry','preferredTechId',
             'doNotService','doNotServiceReason','taxExempt','taxExemptId',
             'paymentMethod','creditLimit','notes',
            ].forEach(f => { if (f in data) updates[f] = data[f]; });
            if ('tags' in data) updates.tags = JSON.stringify(data.tags);
            await db.update(dispatchCustomers).set(updates)
                .where(and(eq(dispatchCustomers.id, id), eq(dispatchCustomers.orgId, orgId)));
            const [updated] = await db.select().from(dispatchCustomers)
                .where(and(eq(dispatchCustomers.id, id), eq(dispatchCustomers.orgId, orgId)));
            if (!updated) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
            return { statusCode: 200, headers, body: JSON.stringify({ customer: normaliseCust(updated) }) };
        }

        if (event.httpMethod === 'DELETE') {
            const id = params.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
            await db.delete(dispatchCustomers)
                .where(and(eq(dispatchCustomers.id, id), eq(dispatchCustomers.orgId, orgId)));
            return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    } catch (err) {
        console.error('dispatch-customers error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
