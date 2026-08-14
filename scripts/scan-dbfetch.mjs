// dbFetch returns a Response and does not throw on 4xx/5xx.
// A call whose result is DISCARDED (used as a statement, or only .catch()ed)
// can never check res.ok -> a 403/500 is silently invisible.
// This is a provable lower bound, not a guess: it flags only call sites where
// the Response value goes nowhere at all.
import { parse } from '@babel/parser';
import fs from 'fs';
import path from 'path';

const files = [];
const walkDir = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walkDir(p);
    else if (/\.(jsx?|mjs)$/.test(e.name)) files.push(p);
  }
};
// Accept explicit paths so the scanner can be pointed at a fixture. Without this
// it always walked src/ and silently ignored its arguments, which made it
// untestable — the reason it ran at a 59% false-positive rate unnoticed.
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (args.length) {
  for (const a of args) {
    if (fs.statSync(a).isDirectory()) walkDir(a); else files.push(a);
  }
} else {
  walkDir('src');
}

// Does this callback actually CONSUME the Response it is handed?
//
// The original scanner unwrapped .then()/.catch() chains without ever looking at
// the callbacks, so
//
//     dbFetch(url).then(r => { if (!r.ok) throw ... }).then(r => r.json())
//
// unwrapped to a bare dbFetch and was reported as a discarded Response even
// though it is fully checked. That was the entire false-positive class: hand
// triage of 63 of the original 78 sites found 59% of the hook findings were this
// exact shape (10 of 17), against the 17% first recorded.
//
// A bare identifier callback — `.then(checkOk)` — is assumed to consume it, which
// is what App.jsx does.
const consumesResponse = (cb) => {
  if (!cb) return false;
  if (cb.type === 'Identifier') return true;           // .then(checkOk)
  if (cb.type !== 'ArrowFunctionExpression' && cb.type !== 'FunctionExpression') return false;
  const param = cb.params?.[0];
  if (!param || param.type !== 'Identifier') return false;
  const name = param.name;
  let used = false;
  const walk = (n) => {
    if (used || !n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.type === 'Identifier' && n.name === name) { used = true; return; }
    for (const k of Object.keys(n)) if (!['loc','start','end'].includes(k)) walk(n[k]);
  };
  walk(cb.body);
  return used;
};

// Second finding class: the Response used AS IF it were parsed JSON.
//
// Guide 18b3. Found live in ReportsTab while fixing the false-positive class:
//
//     dbFetch('/.netlify/functions/saved-reports')
//         .then(data => setSavedReportsList(data?.reports || []))
//
// The parameter is NAMED data but holds a Response, and nothing in the chain calls
// .json(). `data.reports` is therefore always undefined and the list is silently
// empty forever. Consuming the parameter is not the same as reading it correctly,
// so the consumesResponse() check above would wave this through.
const RESPONSE_MEMBERS = new Set([
  'ok','status','statusText','headers','url','redirected','type','bodyUsed','body',
  'json','text','blob','clone','arrayBuffer','formData',
]);

// Property reads on the callback parameter that are NOT Response members.
const nonResponseProps = (cb) => {
  const out = [];
  if (!cb || (cb.type !== 'ArrowFunctionExpression' && cb.type !== 'FunctionExpression')) return out;
  const param = cb.params?.[0];
  if (!param || param.type !== 'Identifier') return out;
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    // OptionalMemberExpression too: `data?.reports` is the shape that actually
    // shipped, and matching only MemberExpression missed it entirely.
    if ((n.type === 'MemberExpression' || n.type === 'OptionalMemberExpression') &&
        n.object?.type === 'Identifier' &&
        n.object.name === param.name && n.property?.type === 'Identifier' &&
        !RESPONSE_MEMBERS.has(n.property.name)) {
      out.push(n.property.name);
    }
    for (const k of Object.keys(n)) if (!['loc','start','end'].includes(k)) walk(n[k]);
  };
  walk(cb.body);
  return out;
};

// Does any link in the chain call .json()/.text()?
const chainParses = (node) => {
  let n = node, found = false;
  for (let i = 0; i < 12 && n; i++) {
    if (n.type === 'AwaitExpression') { n = n.argument; continue; }
    if (n.type === 'CallExpression' && n.callee?.type === 'MemberExpression' &&
        ['catch','then','finally'].includes(n.callee.property?.name)) {
      // Walk for a real .json()/.text() call. An earlier version stringified the
      // callback and truncated at 4000 chars, which silently missed the parse in
      // any long handler and produced five false positives on the hooks.
      const cb = n.arguments?.[0];
      const seek = (x) => {
        if (found || !x || typeof x !== 'object') return;
        if (Array.isArray(x)) return x.forEach(seek);
        if ((x.type === 'CallExpression' || x.type === 'OptionalCallExpression') &&
            (x.callee?.type === 'MemberExpression' || x.callee?.type === 'OptionalMemberExpression') &&
            ['json','text'].includes(x.callee.property?.name)) { found = true; return; }
        for (const k of Object.keys(x)) if (!['loc','start','end'].includes(k)) seek(x[k]);
      };
      seek(cb);
      n = n.callee.object; continue;
    }
    break;
  }
  return found;
};

// Returns the misused property names, or [] when the chain is fine.
const responseUsedAsJson = (node) => {
  if (chainParses(node)) return [];
  let n = node;
  const bad = [];
  for (let i = 0; i < 12 && n; i++) {
    if (n.type === 'AwaitExpression') { n = n.argument; continue; }
    if (n.type === 'CallExpression' && n.callee?.type === 'MemberExpression' &&
        ['catch','then','finally'].includes(n.callee.property?.name)) {
      if (n.callee.property.name === 'then') bad.push(...nonResponseProps(n.arguments?.[0]));
      n = n.callee.object; continue;
    }
    if (n.type === 'CallExpression' && n.callee?.name === 'dbFetch') return [...new Set(bad)];
    return [];
  }
  return [];
};

// unwrap await / .catch() / .then() chains to see if a dbFetch sits underneath
// AND whether the Response is consumed anywhere along the way.
//
// .catch() does NOT count: dbFetch resolves for 4xx/5xx (guide 18b1), so a catch
// only ever sees a network failure. That is the whole reason this scanner exists.
const underlyingDbFetch = (node) => {
  let n = node;
  let consumed = false;
  for (let i = 0; i < 12 && n; i++) {
    if (n.type === 'AwaitExpression') { n = n.argument; continue; }
    if (n.type === 'CallExpression' && n.callee?.type === 'MemberExpression' &&
        ['catch', 'then', 'finally'].includes(n.callee.property?.name)) {
      if (n.callee.property.name === 'then' && consumesResponse(n.arguments?.[0])) consumed = true;
      n = n.callee.object; continue;
    }
    if (n.type === 'CallExpression' && n.callee?.name === 'dbFetch') return !consumed;
    return false;
  }
  return false;
};

// Deliberate fire-and-forget, opted out at the call site with a comment:
//
//     // dbfetch-ignore: <reason>
//     dbFetch(...)
//
// Three sites qualify and no more should without discussion: addAudit (matches the
// server's writeAudit, which is best-effort by design so an audit failure cannot
// roll back the operation being audited) and the two fireMentionSms calls (an SMS
// notification must never block or fail a save). Everything else must check.
const IGNORE_RE = /dbfetch-ignore/;
const ignoredLines = (src) => {
  const out = new Set();
  const lines = src.split('\n');
  lines.forEach((l, i) => { if (IGNORE_RE.test(l)) { out.add(i + 2); out.add(i + 3); } });
  return out;
};

const findStatements = (root) => {
  const out = [], stack = [root], seen = new Set();
  while (stack.length) {
    const n = stack.pop();
    if (!n || typeof n !== 'object' || seen.has(n)) continue;
    seen.add(n);
    if (Array.isArray(n)) { n.forEach(c => stack.push(c)); continue; }
    if (n.type === 'ExpressionStatement') out.push(n);
    for (const k of Object.keys(n)) {
      if (['loc', 'start', 'end'].includes(k)) continue;
      const c = n[k];
      if (c && typeof c === 'object') stack.push(c);
    }
  }
  return out;
};

const byFile = new Map();
const jsonMisuse = [];
let total = 0;
for (const f of files) {
  let ast;
  try { ast = parse(fs.readFileSync(f, 'utf8'), { sourceType: 'module', plugins: ['jsx'] }); }
  catch { continue; }
  const stmts = findStatements(ast.program);
  const skip = ignoredLines(fs.readFileSync(f, 'utf8'));
  const hits = stmts.filter(s => underlyingDbFetch(s.expression) && !skip.has(s.loc.start.line))
    .map(s => s.loc.start.line);
  if (hits.length) { byFile.set(f, hits); total += hits.length; }

  // Second class, reported separately: the Response read as if it were JSON.
  for (const st of stmts) {
    const props = responseUsedAsJson(st.expression);
    if (props.length) jsonMisuse.push({ file: f, line: st.loc.start.line, props });
  }
}

const sorted = [...byFile].sort((a, b) => b[1].length - a[1].length);
for (const [f, lines] of sorted.slice(0, 15)) {
  console.log(String(lines.length).padStart(3) + '  ' + f.replace('src/', '') +
              '   lines ' + lines.slice(0, 6).join(', ') + (lines.length > 6 ? ' …' : ''));
}
console.log(`\n${total} discarded-Response dbFetch call site(s) across ${byFile.size} file(s).`);
if (jsonMisuse.length) {
  console.log('\n\u2014 Response used as JSON (guide 18b3) \u2014');
  for (const m of jsonMisuse) {
    console.log(`  ${m.file}:${m.line}  reads .${m.props.join(', .')} on a Response \u2014 no .json() in the chain`);
  }
  console.log(`  ${jsonMisuse.length} site(s). These read undefined forever and fail silently.`);
}

// Promoted to a gate. It ran as a diagnostic only for as long as its accuracy was
// unproven: the original version reported a 59% false-positive rate on the hooks
// because it unwrapped .then() chains without reading the callbacks. That is fixed,
// the behaviour is pinned by tests/scanners.test.mjs, and all 78 original sites are
// resolved — so a new finding now means new code, not old noise.
process.exit(total + jsonMisuse.length ? 1 : 0);
