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
walkDir('src');

// unwrap await / .catch() / .then() chains to see if a dbFetch sits underneath
const underlyingDbFetch = (node) => {
  let n = node;
  for (let i = 0; i < 8 && n; i++) {
    if (n.type === 'AwaitExpression') { n = n.argument; continue; }
    if (n.type === 'CallExpression' && n.callee?.type === 'MemberExpression' &&
        ['catch', 'then', 'finally'].includes(n.callee.property?.name)) {
      n = n.callee.object; continue;
    }
    if (n.type === 'CallExpression' && n.callee?.name === 'dbFetch') return true;
    return false;
  }
  return false;
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
let total = 0;
for (const f of files) {
  let ast;
  try { ast = parse(fs.readFileSync(f, 'utf8'), { sourceType: 'module', plugins: ['jsx'] }); }
  catch { continue; }
  const hits = findStatements(ast.program)
    .filter(s => underlyingDbFetch(s.expression))
    .map(s => s.loc.start.line);
  if (hits.length) { byFile.set(f, hits); total += hits.length; }
}

const sorted = [...byFile].sort((a, b) => b[1].length - a[1].length);
for (const [f, lines] of sorted.slice(0, 15)) {
  console.log(String(lines.length).padStart(3) + '  ' + f.replace('src/', '') +
              '   lines ' + lines.slice(0, 6).join(', ') + (lines.length > 6 ? ' …' : ''));
}
console.log(`\n${total} discarded-Response dbFetch call site(s) across ${byFile.size} file(s).`);
