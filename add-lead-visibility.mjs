import { readFileSync, writeFileSync } from 'fs';
const p = 'src/Tabs/settings/catalogue.js';
let src = readFileSync(p, 'utf8');
const eol = src.includes('\r\n') ? '\r\n' : '\n';
const anchor = `{ id:'lead-scoring', scope:'workspace', category:'Sales process', name:'Lead scoring', desc:'Rule-based Fit + Engagement scoring for leads (sources, deal size, status, recency)', status:'ok', statusDetail:'Fit + Engagement', updatedBy:'Admin', updatedAt:'just now' },`;
const addition = `    { id:'lead-visibility', scope:'workspace', category:'Sales process', name:'Lead visibility', desc:'Whether sales reps can see unassigned leads — Admins and Managers always see all', status:'ok', statusDetail:'Unassigned visible to reps', updatedBy:'Admin', updatedAt:'never', isNew:true },`;
const hits = src.split(anchor).length - 1;
if (hits !== 1) { console.error(`REFUSING: anchor matched ${hits} times, expected exactly 1`); process.exit(1); }
if (src.includes("id:'lead-visibility'")) { console.error('REFUSING: already present'); process.exit(1); }
writeFileSync(p, src.replace(anchor, anchor + eol + addition));
const n = (readFileSync(p, 'utf8').match(/id:'lead-visibility'/g) || []).length;
console.log(n === 1 ? 'OK — verified from disk' : `FAILED post-check — found ${n}`);
