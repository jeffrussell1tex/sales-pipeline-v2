// src/utils/legacyDispatchImport.js
// The "Import from the old settings list" card (Settings → Dispatch → Vehicles & equipment;
// state §0.243, docs/design/save-cleanup Part 6; Jeff, 10 Nov, Q7: "Send only what's missing
// (Recommended)"). Vehicles and equipment once lived in settings.dispatchVehicles /
// settings.dispatchEquipment; the card carries those entries into the dispatch_vehicles and
// dispatch_equipment tables.
//
// Each row's id is derived from its old entry's (`imp_<id>`, an equipment unit `imp_<id>_u<n>`),
// and the two POSTs are designed upserts (§0.201): a row sent again REPLACES the stored one —
// its make, VIN, service dates, a unit's check-out — with what the old list says. So the import
// sends only the rows the tables do not hold yet: what the tables hold is never sent, and a
// re-press changes nothing already imported. A row deleted after an import is missing again,
// so it counts again and a press makes it again (the answer's own words).
//
// What the tables hold is known only from a read that answered: with no read (a failed load,
// or one not yet answered) every row would look missing, so the plan is not known and the
// import refuses (`known: false`). Pure: the screen reads, this decides.

// The old vehicle list → the vehicle rows it makes (an entry with no name makes none).
export const plannedVehicleImports = (blob) => (Array.isArray(blob) ? blob : [])
    .filter(v => v && (v.name || '').trim())
    .map(v => ({
        id:           'imp_' + v.id,
        name:         v.name.trim(),
        type:         String(v.type || v.kind || 'van').toLowerCase(),
        licensePlate: v.plate || v.licensePlate || null,
        notes:        v.notes || null,
    }));

// The old equipment list → one row per physical unit: an entry with a quantity makes that many,
// all sharing its name as their category.
export const plannedEquipmentImports = (blob) => {
    const out = [];
    (Array.isArray(blob) ? blob : []).filter(e => e && (e.name || '').trim()).forEach(e => {
        const q = parseInt(e.qty, 10);
        const units = q > 0 ? q : 1;
        for (let i = 1; i <= units; i++) {
            out.push({
                id:       'imp_' + e.id + '_u' + i,
                name:     units > 1 ? `${e.name.trim()} #${i}` : e.name.trim(),
                category: e.name.trim(),
                notes:    e.notes || null,
            });
        }
    });
    return out;
};

const idsOf = (rows) => new Set(rows.map(r => (r && r.id) || null).filter(Boolean));

// legacy: { vehicles, equipment } — the old settings lists.
// held:   { vehicles, equipment } — the tables as a read answered them, or null when no read did.
// Answers { known, vehicles, equipment, count, total }: the rows still to send (only those),
// their count, and how many rows the old lists make in all. Not known: nothing to send.
export const planImport = (legacy, held) => {
    const allVehicles  = plannedVehicleImports(legacy && legacy.vehicles);
    const allEquipment = plannedEquipmentImports(legacy && legacy.equipment);
    const total = allVehicles.length + allEquipment.length;
    if (!held || !Array.isArray(held.vehicles) || !Array.isArray(held.equipment)) {
        return { known: false, vehicles: [], equipment: [], count: 0, total };
    }
    const heldVehicles  = idsOf(held.vehicles);
    const heldEquipment = idsOf(held.equipment);
    const vehicles  = allVehicles.filter(r => !heldVehicles.has(r.id));
    const equipment = allEquipment.filter(r => !heldEquipment.has(r.id));
    return { known: true, vehicles, equipment, count: vehicles.length + equipment.length, total };
};

// Whether the card is drawn: while rows are still to import; while the tables' read failed and the
// old lists make any row (it says what is not known); and while an import runs or its words are
// open (kept until closed). Not while the first load is still out, and never once all are in.
export const importCardShows = (plan, { importing = false, said = false, loadFailed = false } = {}) =>
    !!importing || !!said || (plan && plan.known ? plan.count > 0 : (!!loadFailed && !!plan && plan.total > 0));

// Said when the import is pressed while what the tables hold is not known.
export const IMPORT_UNREAD = "The import didn't run: the vehicles and equipment couldn't be read, so what is still to import can't be told apart from what is already in. Refresh, then try again.";
