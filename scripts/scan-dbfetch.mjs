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
    if (isDbFetchCall(n)) return [...new Set(bad)];
    return [];
  }
  return [];
};

// Third finding class: the Response landed in a VARIABLE and was read as JSON.
//
// Found live in TasksTab (Sep 2026) — four handlers shaped
//
//     const data = await dbFetch(url, { method: 'PUT', ... });
//     if (data?.task) { adopt server row } else { revert }
//
// `data` is a Response, `data?.task` is undefined forever, and the else branch
// REVERTED the optimistic update on every SUCCESSFUL save. Neither existing
// class saw it: the discarded/misuse classes walk ExpressionStatements and
// .then() callbacks, and a VariableDeclarator is neither — which is how the
// gate reported 0 while the defect sat in four places.
//
// The rule is a provable lower bound, like the others: flag a variable whose
// initializer unwraps to a bare dbFetch (await/.catch()/.finally() only — a
// .then() may transform the value, so it bails), wherever that variable's
// properties are read and the property is not a Response member. Declarators
// are collected per enclosing function scope; reads are sought through the
// whole subtree because closures legitimately read the outer variable. A
// nested redeclaration of the same name would misattribute — the deliberate
// safe direction: a false positive is visible and gets triaged.
const FUNCTION_TYPES = new Set([
  'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ObjectMethod', 'ClassMethod',
]);

const initIsUnparsedDbFetch = (init) => {
  let n = init;
  for (let i = 0; i < 12 && n; i++) {
    if (n.type === 'AwaitExpression') { n = n.argument; continue; }
    if (n.type === 'CallExpression' && n.callee?.type === 'MemberExpression' &&
        ['catch', 'finally'].includes(n.callee.property?.name)) {
      n = n.callee.object; continue;
    }
    if (isDbFetchCall(n)) return true;
    return false;
  }
  return false;
};

const varResponseMisuse = (root) => {
  const findings = [];
  const scopes = [root];
  // Collect every function scope first (Program included via root).
  const collectScopes = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(collectScopes);
    if (FUNCTION_TYPES.has(n.type)) scopes.push(n);
    for (const k of Object.keys(n)) if (!['loc', 'start', 'end'].includes(k)) collectScopes(n[k]);
  };
  collectScopes(root);

  for (const scope of scopes) {
    // Declarators DIRECT in this scope — stop at nested function boundaries so
    // each declarator is attributed to the scope that owns it.
    const decls = [];
    const findDecls = (n) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) return n.forEach(findDecls);
      if (n !== scope && FUNCTION_TYPES.has(n.type)) return;
      if (n.type === 'VariableDeclarator' && n.id?.type === 'Identifier' &&
          n.init && initIsUnparsedDbFetch(n.init)) {
        decls.push(n);
      }
      for (const k of Object.keys(n)) if (!['loc', 'start', 'end'].includes(k)) findDecls(n[k]);
    };
    findDecls(scope.body ?? scope);
    if (!decls.length) continue;

    for (const d of decls) {
      const name = d.id.name;
      const props = [];
      const findReads = (n) => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) return n.forEach(findReads);
        if ((n.type === 'MemberExpression' || n.type === 'OptionalMemberExpression') &&
            n.object?.type === 'Identifier' && n.object.name === name &&
            n.property?.type === 'Identifier' && !RESPONSE_MEMBERS.has(n.property.name)) {
          props.push(n.property.name);
        }
        for (const k of Object.keys(n)) if (!['loc', 'start', 'end'].includes(k)) findReads(n[k]);
      };
      findReads(scope.body ?? scope);
      if (props.length) findings.push({ line: d.loc.start.line, props: [...new Set(props)] });
    }
  }
  return findings;
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
    if (isDbFetchCall(n)) return !consumed;
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

// dbFetch is not always CALLED `dbFetch`. AppHeader had:
//
//     import('../../utils/storage').then(({ dbFetch: df }) =>
//         df('/.netlify/functions/users?me=true', { … }).catch(() => {}));
//
// a real discarded Response that this scanner walked straight past, because it
// matched the callee NAME. A gate reporting 0 is a claim about its matching as
// much as about the code (18b11), so resolve every local binding of dbFetch:
//
//   import { dbFetch } from …            import { dbFetch as df } from …
//   const { dbFetch: df } = await import(…)   .then(({ dbFetch: df }) => …)
//   const df = dbFetch
//
// FILE-SCOPED, not lexically scoped. A different `df` elsewhere in the same file
// would be checked too — deliberately the safe direction: a false positive is
// visible and gets triaged, a false negative reads as "clean" forever.
const collectAliases = (root) => {
  const names = new Set(['dbFetch']);
  const nodes = [];
  const stack = [root], seen = new Set();
  while (stack.length) {
    const n = stack.pop();
    if (!n || typeof n !== 'object' || seen.has(n)) continue;
    seen.add(n);
    if (Array.isArray(n)) { n.forEach(c => stack.push(c)); continue; }
    nodes.push(n);
    for (const k of Object.keys(n)) {
      if (['loc', 'start', 'end'].includes(k)) continue;
      const c = n[k];
      if (c && typeof c === 'object') stack.push(c);
    }
  }
  for (const n of nodes) {
    // import { dbFetch as df } from '…'
    if (n.type === 'ImportSpecifier' && n.imported?.name === 'dbFetch' && n.local?.name) {
      names.add(n.local.name);
    }
    // { dbFetch: df } — destructured from a dynamic import, an await, or a param.
    if (n.type === 'ObjectPattern') {
      for (const prop of n.properties || []) {
        if (prop.type === 'ObjectProperty' && prop.key?.name === 'dbFetch' &&
            prop.value?.type === 'Identifier') names.add(prop.value.name);
      }
    }
  }
  // const df = dbFetch — resolve transitively; two passes settles any realistic
  // chain and cannot loop.
  for (let pass = 0; pass < 2; pass++) {
    for (const n of nodes) {
      if (n.type === 'VariableDeclarator' && n.id?.type === 'Identifier' &&
          n.init?.type === 'Identifier' && names.has(n.init.name)) names.add(n.id.name);
    }
  }
  return names;
};

let ALIASES = new Set(['dbFetch']);
const isDbFetchCall = (n) =>
  (n?.type === 'CallExpression' || n?.type === 'OptionalCallExpression') &&
  n.callee?.type === 'Identifier' && ALIASES.has(n.callee.name);

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

// The second half of the AppHeader blind spot, and the same shape that made
// check-tdz crash on concise arrows: `x => df(…)` has no ExpressionStatement
// anywhere, so findStatements never saw it.
//
// The rule is narrow and provable. Inside an expression STATEMENT the value is
// already thrown away, so anything a .then()/.catch()/.finally() callback returns
// into that chain is thrown away with it — there is no caller left to check it.
// Only concise (non-block) bodies qualify; block bodies contain real statements
// and are already covered above.
const findDiscardedBodies = (stmt) => {
  const out = [], stack = [stmt], seen = new Set();
  while (stack.length) {
    const n = stack.pop();
    if (!n || typeof n !== 'object' || seen.has(n)) continue;
    seen.add(n);
    if (Array.isArray(n)) { n.forEach(c => stack.push(c)); continue; }
    if ((n.type === 'CallExpression' || n.type === 'OptionalCallExpression') &&
        (n.callee?.type === 'MemberExpression' || n.callee?.type === 'OptionalMemberExpression') &&
        ['then', 'catch', 'finally'].includes(n.callee.property?.name)) {
      for (const cb of n.arguments || []) {
        if (cb?.type === 'ArrowFunctionExpression' && cb.body && cb.body.type !== 'BlockStatement') {
          out.push(cb.body);
        }
      }
    }
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
  ALIASES = collectAliases(ast.program);
  const stmts = findStatements(ast.program);
  const skip = ignoredLines(fs.readFileSync(f, 'utf8'));

  // Every position whose value is discarded: the statement itself, plus any
  // concise arrow body returning into a chain that statement throws away.
  // Deduped by line — one statement must not report the same defect twice.
  const positions = [];
  for (const st of stmts) {
    positions.push(st.expression);
    positions.push(...findDiscardedBodies(st));
  }

  const hits = [...new Set(positions
    .filter(e => underlyingDbFetch(e) && !skip.has(e.loc.start.line))
    .map(e => e.loc.start.line))].sort((a, b) => a - b);
  if (hits.length) { byFile.set(f, hits); total += hits.length; }

  // Second class, reported separately: the Response read as if it were JSON.
  const seenMisuse = new Set();
  for (const e of positions) {
    const props = responseUsedAsJson(e);
    if (props.length && !seenMisuse.has(e.loc.start.line)) {
      seenMisuse.add(e.loc.start.line);
      jsonMisuse.push({ file: f, line: e.loc.start.line, props });
    }
  }

  // Third class: the Response assigned to a variable and read as JSON. Reported
  // at the DECLARATOR line — the fix belongs where the Response was captured.
  for (const v of varResponseMisuse(ast.program)) {
    if (!seenMisuse.has(v.line) && !skip.has(v.line)) {
      seenMisuse.add(v.line);
      jsonMisuse.push({ file: f, line: v.line, props: v.props });
    }
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
