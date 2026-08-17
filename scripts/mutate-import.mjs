// One-shot mutation harness for the import-receipt batch (guide 18b10).
//
// Each entry breaks exactly one rule the new suites claim to enforce and asserts
// the suites go red. A test that has never failed is not evidence. Files are
// saved and restored in memory — never via `git checkout`, which has reverted
// unrelated fixes mid-session before.
//
// Run: node scripts/mutate-import.mjs
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const SUITES = 'tests/bulk-client.test.mjs tests/import-receipt.test.mjs tests/csv-mapping.test.mjs tests/partial-sanitize.test.mjs tests/bulk-upsert.test.mjs tests/function-imports.test.mjs tests/import-rows.test.mjs tests/delete-and-stage.test.mjs';

const mutations = [
    ['bulkClient: chunking disabled',
        'src/utils/bulkClient.js', 'export const BULK_CHUNK = 400;', 'export const BULK_CHUNK = 100000;'],

    ['bulkClient: putBulk throws from inside its loop (the original defect)',
        'src/utils/bulkClient.js',
        "if (!r.ok) { error = errorFrom(r.status, body, 'Bulk update failed'); break; }",
        "if (!r.ok) { throw new Error(errorFrom(r.status, body, 'Bulk update failed')); }"],

    ['bulkClient: appliedIds ignores notFound/forbidden',
        'src/utils/bulkClient.js',
        'const applied  = chunk.map(row => row.id).filter(id => !rejected.has(id));',
        'const applied  = chunk.map(row => row.id);'],

    ['bulkClient: an inconsistent chunk is applied anyway',
        'src/utils/bulkClient.js',
        `if (applied.length === chunkUpdated) {
                appliedIds.push(...applied);
            } else {
                discrepancy += Math.abs(applied.length - chunkUpdated);
            }`,
        'appliedIds.push(...applied);'],

    ['bulkClient: progress ticks for a failed chunk',
        'src/utils/bulkClient.js',
        "if (!r.ok) { error = errorFrom(r.status, body, 'Bulk update failed'); break; }",
        "if (!r.ok) { error = errorFrom(r.status, body, 'Bulk update failed'); report(onProgress, progressOffset, done + chunk.length, progressTotal); break; }"],

    ['bulkClient: postNew partitions by count instead of insertedIds',
        'src/utils/bulkClient.js',
        'const ids = new Set(body.insertedIds);\n                for (const row of chunk) (ids.has(row.id) ? landed : failed).push(row);',
        'landed.push(...chunk.slice(0, body.insertedIds.length));\n                failed.push(...chunk.slice(body.insertedIds.length));'],

    ['importReceipt: unsent rows are not counted as failed',
        'src/utils/importReceipt.js',
        'failed: Math.max(0, attempted - created),',
        'failed: 0,'],

    ['importReceipt: isClean ignores dropped rows (the green-tick bug)',
        'src/utils/importReceipt.js',
        "export const isClean = (r) => !r.error && r.failed === 0 && r.dropped === 0;",
        "export const isClean = (r) => !r.error && r.failed === 0;"],

    ['importReceipt: mergeReceipts lets a later error overwrite the first',
        'src/utils/importReceipt.js',
        'if (!out.error && p.error) out.error = p.error;',
        'if (p.error) out.error = p.error;'],

    ['importReceipt: receiptFromError trusts anything with a .receipt',
        'src/utils/importReceipt.js',
        "(err && err.receipt && typeof err.receipt === 'object') ? err.receipt : null;",
        'err ? err.receipt : null;'],

    ['csvMapping: drop rule tightened to .every',
        'src/utils/csvMapping.js',
        "requiredFields.length === 0 || requiredFields.some(f => (record[f.key] || '').trim() !== '');",
        "requiredFields.length === 0 || requiredFields.every(f => (record[f.key] || '').trim() !== '');"],

    ['csvMapping: drops are silent again (the original defect)',
        'src/utils/csvMapping.js',
        `dropped.push({
                // +2, not +1: row 1 of the file is the header, so this is the
                // number the user will see in Excel when they go to fix it.
                rowNumber: idx + 2,
                sample: (row || []).filter(Boolean).slice(0, 3).join(', ').slice(0, 60),
            });`,
        '/* silently discarded */'],

    ['csvMapping: row numbers are 0-based against the file',
        'src/utils/csvMapping.js', 'rowNumber: idx + 2,', 'rowNumber: idx + 1,'],

    ['csvMapping: the cause is no longer diagnosed',
        'src/utils/csvMapping.js',
        '.filter(f => !isMapped(fieldMapping?.[f.key]))\n        .map(f => f.label);',
        '.filter(() => false)\n        .map(f => f.label);'],

    ['_sanitize: the union is computed per row, breaking INSERT uniformity',
        'netlify/functions/_sanitize.mjs',
        'for (const row of rows) {\n        if (!row || typeof row !== \'object\') continue;\n        for (const key of Object.keys(row)) supplied.add(key);\n    }',
        'const firstRow = rows[0] || {};\n    for (const key of Object.keys(firstRow)) supplied.add(key);'],

    ['_sanitize: narrowing removed entirely (the original defect)',
        'netlify/functions/_sanitize.mjs',
        'if (supplied.has(key)) out[key] = full[key];',
        'out[key] = full[key];'],

    ['_sanitize: a missing sanitize function passes raw rows through',
        'netlify/functions/_sanitize.mjs',
        "throw new TypeError('partialRows requires the endpoint sanitize function');",
        'return rows;'],
    ['bulkUpsert: NOT NULL backfill removed (the 500)',
        'netlify/functions/_bulk.mjs',
        'if (!(k in out) && prior && prior[k] !== undefined) out[k] = prior[k];',
        '/* no backfill */'],

    ['bulkUpsert: backfilled columns leak into the SET clause (data loss)',
        'netlify/functions/_bulk.mjs',
        'const cols = [...new Set(eligible.flatMap(Object.keys))]',
        'const cols = [...new Set(eligible.map(backfill).flatMap(Object.keys))]'],

    ['bulkUpsert: required columns not requested in the projection',
        'netlify/functions/_bulk.mjs',
        'for (const k of required) projection[k] = table[k];',
        '/* projection unchanged */'],

    ['bulkUpsert: hasDefault columns are backfilled too',
        'netlify/functions/_bulk.mjs',
        'return c && c.name && c.notNull && !c.hasDefault && !BULK_IMMUTABLE.has(k);',
        'return c && c.name && c.notNull && !BULK_IMMUTABLE.has(k);'],
    ['deploy graph: _lib.mjs stops re-exporting bulkInsert (the failed deploy)',
        'netlify/functions/_lib.mjs',
        'export const bulkInsert = (args) => coreBulkInsert({ client: db, ...args });', ''],

    ['deploy graph: _lib.mjs stops re-exporting bulkUpsert (the failed deploy)',
        'netlify/functions/_lib.mjs',
        'export const bulkUpsert = (args) => coreBulkUpsert({ client: db, ...args });', ''],
    ['csvMapping: unmapped fields emit \'\' again (the Next Steps wipe)',
        'src/utils/csvMapping.js',
        'if (isMapped(colIdx)) record[field.key] = row[colIdx] || \'\';',
        'record[field.key] = isMapped(colIdx) ? (row[colIdx] || \'\') : \'\';'],

    ['csvMapping: a mapped-but-empty column is dropped too',
        'src/utils/csvMapping.js',
        'if (isMapped(colIdx)) record[field.key] = row[colIdx] || \'\';',
        'if (isMapped(colIdx) && row[colIdx]) record[field.key] = row[colIdx];'],
    ['importRows: an overwrite re-materialises every column (the Next Steps wipe)',
        'src/utils/importRows.js',
        'if (Object.prototype.hasOwnProperty.call(row || {}, key)) out[key] = coerce(row[key]);',
        'out[key] = coerce((row || {})[key]);'],

    ['importRows: an overwrite rewrites createdDate',
        'src/utils/importRows.js',
        'const { createdDate: _drop, ...rest } = fromCsv;\n        return { id: existingId, ...rest };',
        'return { id: existingId, ...fromCsv };'],

    ['importRows: a create no longer fills defaults',
        'src/utils/importRows.js',
        'const merged = { ...CREATE_DEFAULTS, ...csvColumns };',
        'const merged = { ...csvColumns };'],

    ['importRows: stageChangedDate unset on create (the NaNd / never-stale bug)',
        'src/utils/importRows.js',
        'stageChangedDate: backdate(today, parseDaysInStage(daysInStage) || 0),', 'stageChangedDate: undefined,'],
    ['stage: an unchanged stage resets the clock anyway (the re-import trap)',
        'netlify/functions/_stage.mjs',
        '    } else if (changed) {\n        patch.stageChangedDate = importDate;\n    }',
        '    } else {\n        patch.stageChangedDate = importDate;\n    }'],

    ['stage: history is replaced rather than appended (0A0000.1 again)',
        'netlify/functions/_stage.mjs',
        'patch.stageHistory = [...existing, {',
        'patch.stageHistory = [{'],

    ['stage: the history entry uses the import date, not the derived one',
        'netlify/functions/_stage.mjs',
        'date:      patch.stageChangedDate || importDate,',
        'date:      importDate,'],

    ['stage: a negative daysInStage is not clamped (future date, never stale)',
        'src/utils/stageClock.js',
        'if (n < 0) return 0;', 'if (n < 0) return n;'],

    ['stage: daysInStage leaks through as a column',
        'netlify/functions/_stage.mjs',
        'const { daysInStage: _transport, ...rest } = row;\n        return { ...rest, ...patch };',
        'return { ...row, ...patch };'],

    ['audit: values are no longer truncated',
        'netlify/functions/_audit.mjs',
        'parts.push(`${k}=${String(v).slice(0, 60)}`);',
        'parts.push(`${k}=${String(v)}`);'],

    ['audit: empty fields are rendered instead of omitted',
        'netlify/functions/_audit.mjs',
        "if (v === null || v === undefined || String(v).trim() === '') continue;",
        'if (false) continue;'],
];

let survived = 0;
for (const [name, file, from, to] of mutations) {
    const original = readFileSync(file, 'utf8');
    if (!original.includes(from)) {
        console.log(`SKIP  ${name}\n      target string not found in ${file} — the harness is stale`);
        survived++;
        continue;
    }
    writeFileSync(file, original.replace(from, to));
    let failed = false;
    try {
        execSync(`node --test ${SUITES}`, { stdio: 'pipe' });
    } catch {
        failed = true;
    }
    writeFileSync(file, original);
    console.log(`${failed ? 'CAUGHT' : 'SURVIVED'}  ${name}`);
    if (!failed) survived++;
}

console.log(`\n${mutations.length - survived}/${mutations.length} mutations caught.`);
process.exit(survived ? 1 : 0);
