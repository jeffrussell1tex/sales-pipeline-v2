// _stageRename.mjs — what a stage's rename carries with it (state §0.302; guide §18b145; Jeff, 25 Nov: "yes").
//
// A deal holds its stage by NAME, and so does everything that names one: the deal's stage history, an automation's
// conditions, a saved report's stage filter, the deal model's usual days. A settings save that renames a stage
// (src/utils/stages.js stageRenames) runs these statements in its own batch, after the list: every stage at once, so two
// that exchange names never meet; this org's rows alone; and only while the list as stored is the one THIS save wrote —
// its own funnelStages token — so a save refused in its write renames nothing. No deal moves: its probability, its stage
// clock and its history's dates stand, and nothing is sent.
import { db } from '../../db/index.js';
import { opportunities, automations, savedReports, settings } from '../../db/schema.js';
import { and, eq, sql } from 'drizzle-orm';
import { containedRenames } from '../../src/utils/stages.js';

// A jsonb value as a list — none where it is not one. Its entries in order: e, at n.
const listOf = (v) => sql`(case when jsonb_typeof(${v}) = 'array' then ${v} else '[]'::jsonb end)`;
const entries = (list) => sql`generate_series(0, jsonb_array_length(${list}) - 1) as g(n), lateral (select ${list} -> g.n as e) as t`;

// renames: [{ from, to }]; rest: the stages it leaves; rev: the token the save minted for the list.
// → the five statements, each answering its rows' ids: the deals, their histories, the automations, the reports, the model.
export function stageRenameStatements({ orgId, renames, rest, rev }) {
    const exact = sql`${JSON.stringify(Object.fromEntries(renames.map((r) => [r.from, r.to])))}::jsonb`;
    // A condition and a report's filter are compared without case (dispatch-automations.mjs, reportQuery.js): so are they here,
    // but where a stage it leaves has the same name in another case.
    const taken = new Set(rest.map((s) => s.toLowerCase()));
    const folded = sql`${JSON.stringify(Object.fromEntries(renames.filter((r) => !taken.has(r.from.toLowerCase())).map((r) => [r.from.toLowerCase(), r.to])))}::jsonb`;
    const part = sql`${JSON.stringify(Object.fromEntries(containedRenames(renames, rest).map((r) => [r.from.toLowerCase(), r.to])))}::jsonb`;
    const targets = sql`${JSON.stringify(Object.fromEntries(renames.map((r) => [r.to, 1])))}::jsonb`;
    const written = sql`exists (select 1 from ${settings} where ${settings.orgId} = ${orgId} and ${settings.extra}->'revs'->>'funnelStages' = ${rev}::text)`;
    const names = (v) => sql`coalesce(${exact}->>(${v}), ${folded}->>lower(btrim(${v})))`;

    const history = listOf(opportunities.stageHistory);
    const isMove = sql`(jsonb_typeof(e) = 'object' and (jsonb_exists(${exact}, e->>'stage') or jsonb_exists(${exact}, e->>'prevStage')))`;
    const key = (k) => sql`(case when jsonb_exists(${exact}, e->>${sql.raw(`'${k}'`)}) then jsonb_build_object(${sql.raw(`'${k}'`)}, ${exact}->>(e->>${sql.raw(`'${k}'`)})) else '{}'::jsonb end)`;

    const asked = sql`(case when e->>'operator' = 'contains' then ${part}->>lower(e->>'value') else coalesce(${exact}->>(e->>'value'), ${folded}->>lower(e->>'value')) end)`;
    const condition = sql`(jsonb_typeof(e) = 'object' and e->>'field' in ('stage', 'from_stage', 'to_stage') and e->>'operator' in ('eq', 'neq', 'contains')
        and jsonb_typeof(e->'value') = 'string' and ${asked} is not null)`;

    const where = sql`${savedReports.filters}->'where'`;
    const oneName = sql`(jsonb_typeof(e->'value') = 'string' and ${names(sql`e->>'value'`)} is not null)`;
    const inList = sql`(jsonb_typeof(e->'value') = 'array' and exists (select 1 from jsonb_array_elements(${listOf(sql`e->'value'`)}) as i(v) where jsonb_typeof(i.v) = 'string' and ${names(sql`i.v #>> '{}'`)} is not null))`;
    const filter = sql`(jsonb_typeof(e) = 'object' and e->>'id' = 'stage' and (${oneName} or ${inList}))`;

    const days = sql`${settings.extra} #> '{dealModel,usual,stageDays}'`;
    return [
        db.update(opportunities).set({ stage: sql`${exact}->>(${opportunities.stage})` })
            .where(and(eq(opportunities.orgId, orgId), written, sql`jsonb_exists(${exact}, ${opportunities.stage})`)).returning({ id: opportunities.id }),
        db.update(opportunities).set({ stageHistory: sql`(select jsonb_agg(case when ${isMove} then e || ${key('stage')} || ${key('prevStage')} else e end order by g.n) from ${entries(history)})` })
            .where(and(eq(opportunities.orgId, orgId), written, sql`exists (select 1 from jsonb_array_elements(${history}) as t(e) where ${isMove})`)).returning({ id: opportunities.id }),
        db.update(automations).set({ conditions: sql`(select jsonb_agg(case when ${condition} then jsonb_set(e, '{value}', to_jsonb(${asked})) else e end order by g.n) from ${entries(listOf(automations.conditions))})` })
            .where(and(eq(automations.orgId, orgId), written, sql`exists (select 1 from jsonb_array_elements(${listOf(automations.conditions)}) as t(e) where ${condition})`)).returning({ id: automations.id }),
        db.update(savedReports).set({ filters: sql`jsonb_set(${savedReports.filters}, '{where}', (select jsonb_agg(case when ${filter} and jsonb_typeof(e->'value') = 'string' then jsonb_set(e, '{value}', to_jsonb(${names(sql`e->>'value'`)}))
                when ${filter} then jsonb_set(e, '{value}', (select jsonb_agg(case when jsonb_typeof(i.v) = 'string' then to_jsonb(coalesce(${names(sql`i.v #>> '{}'`)}, i.v #>> '{}')) else i.v end order by i.k) from generate_series(0, jsonb_array_length(${listOf(sql`e->'value'`)}) - 1) as j(k), lateral (select ${listOf(sql`e->'value'`)} -> j.k as v, j.k as k) as i)) else e end order by g.n)
            from ${entries(listOf(where))}))` })
            .where(and(eq(savedReports.orgId, orgId), written, sql`exists (select 1 from jsonb_array_elements(${listOf(where)}) as t(e) where ${filter})`)).returning({ id: savedReports.id }),
        db.update(settings).set({ extra: sql`jsonb_set(${settings.extra}, '{dealModel,usual,stageDays}', (select jsonb_object_agg(coalesce(${exact}->>d.k, d.k), d.v) from jsonb_each(${days}) as d(k, v) where jsonb_exists(${exact}, d.k) or not jsonb_exists(${targets}, d.k)))` })
            .where(and(eq(settings.orgId, orgId), sql`${settings.extra}->'revs'->>'funnelStages' = ${rev}::text`, sql`jsonb_typeof(${days}) = 'object'`,
                sql`exists (select 1 from jsonb_each(case when jsonb_typeof(${days}) = 'object' then ${days} else '{}'::jsonb end) as d(k, v) where jsonb_exists(${exact}, d.k))`)).returning({ id: settings.id }),
    ];
}
