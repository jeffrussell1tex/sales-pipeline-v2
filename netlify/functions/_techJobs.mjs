// _techJobs.mjs — which dispatch jobs are a Technician's, and what of the org
// they reach through them (state §0.169). Pure: the rules run under node --test;
// the database reads are _techScope.mjs's.
//
// A Technician is a field user scoped to the jobs they are on (roles.js: "Field
// jobs assigned to them only"). The job list and a single job were scoped; a
// job's line items and history, every customer and location, and every
// technician's time off were not. Those reads use these rules now, so "their
// jobs" means one thing everywhere.

// The co-technicians on a job. The column is jsonb, but the job writes JSON TEXT
// into it, so most rows hold a jsonb STRING ('["tech_005"]') rather than an array
// — 22 of 26 in the shared database, read 5 Oct — and a string read as an array
// matched nobody: a co-tech never saw a job they were on. Both shapes are read.
export function coTechIdsOf(job) {
    const v = job?.coTechIds ?? job?.co_tech_ids;
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') {
        try {
            const parsed = JSON.parse(v);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
}

// A technician is on a job if they are the lead or a co-tech.
export const techOnJob = (job, techId) =>
    !!techId && (job?.assignedTechId === techId || coTechIdsOf(job).includes(techId));

// The jobs, customers and service locations a technician reaches through their jobs.
export function techJobRefs(jobs, techId) {
    const mine = (jobs || []).filter((j) => techOnJob(j, techId));
    return {
        jobIds:      new Set(mine.map((j) => j.id)),
        customerIds: new Set(mine.map((j) => j.customerId).filter(Boolean)),
        locationIds: new Set(mine.map((j) => j.locationId).filter(Boolean)),
    };
}
