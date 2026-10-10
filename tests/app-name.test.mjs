// tests/app-name.test.mjs
//
// Google's branding check (10 Oct, state §0.195) found two things on the Google Auth
// Platform: the home page did not say what the app is for, and the consent screen's app
// name did not match it. A signed-out visitor to salespipelinetracker.com saw only "Sales
// Pipeline Tracker — Sign in to continue". Jeff, 10 Oct: the name is "AcceleRep", and
// the purpose goes "on the sign-in page". These hold it:
//   HOME   the signed-out screen names AcceleRep, says what the app does (Google
//          Calendar included, the one Google data it reads), and links the privacy
//          policy and the terms, both served from public/
//   NAME   no screen or email the app sends still says "Sales Pipeline Tracker"
//   LAYER  the screen's content sits above .login-page's decorative ::before, so its
//          links take the click
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const between = (src, from, to) => { const a = src.indexOf(from); assert.ok(a >= 0, from); const b = src.indexOf(to, a + from.length); assert.ok(b > a, to); return src.slice(a, b); };

const app = read('src/App.jsx');
const signedOut = between(app, '    if (!clerkUser) {', '    if (!organization) {');

test('HOME: the signed-out screen names AcceleRep and says what the app does', () => {
    assert.match(signedOut, /<h1 [^>]*>AcceleRep<\/h1>/, 'the heading is the app name Jeff chose');
    assert.ok(signedOut.includes('CRM and crew-dispatching software for field-service businesses'), 'it says what the app is');
    for (const part of ['sales pipeline', 'accounts and contacts', 'quotes', 'scheduling and dispatch', 'documents and reports']) {
        assert.ok(signedOut.includes(part), `it names ${part}`);
    }
    assert.ok(signedOut.includes('Connect your Google Calendar to see your meetings beside your deals and tasks.'),
        'it says what the Google data is for (calendar is the scope Google checks)');
    assert.ok(signedOut.indexOf('CRM and crew-dispatching software') < signedOut.indexOf('<SignIn '),
        'the purpose is above the sign-in box, seen without scrolling');
});

test('HOME: the signed-out screen links the privacy policy and the terms, and both pages exist', () => {
    assert.ok(signedOut.includes('<a href="/privacy-policy.html"'), 'the privacy policy link');
    assert.ok(signedOut.includes('<a href="/terms-and-conditions.html"'), 'the terms link');
    assert.ok(signedOut.includes('>Privacy Policy</a>') && signedOut.includes('>Terms and Conditions</a>'), 'the links say what they open');
    for (const page of ['public/privacy-policy.html', 'public/terms-and-conditions.html']) {
        assert.ok(existsSync(new URL(page, ROOT)), `${page} is served`);
    }
    assert.match(read('public/privacy-policy.html'), /Google Calendar/, 'the privacy policy covers the Google Calendar data');
});

test('LAYER: the content sits above the decorative layer, so its links take the click', () => {
    assert.ok(signedOut.includes("gap: '2rem', position: 'relative', zIndex: 1 }}"), 'the content container is positioned above .login-page::before');
    assert.match(read('src/index.css'), /\.login-page::before \{[^}]*position: absolute;/, 'the layer it must sit above');
});

test('NAME: no screen or email still says "Sales Pipeline Tracker"', () => {
    const hits = [];
    const walk = (dir) => {
        for (const name of readdirSync(new URL(dir, ROOT))) {
            const rel = dir + name;
            if (statSync(new URL(rel, ROOT)).isDirectory()) { walk(rel + '/'); continue; }
            if (!/\.(jsx?|mjs|html)$/.test(name)) continue;
            if (read(rel).includes('Sales Pipeline Tracker')) hits.push(rel);
        }
    };
    walk('src/'); walk('netlify/functions/');
    assert.deepEqual(hits, [], 'the old name is gone from every screen and email');
    assert.ok(read('netlify/functions/send-email.mjs').includes('<p class="header-title">AcceleRep</p>'), "the notification email's header");
    assert.ok(read('netlify/functions/send-email.mjs').includes('an account on <a href="${appUrl}">AcceleRep</a>'), "the notification email's footer");
    assert.ok(read('netlify/functions/digest.mjs').includes('<p class="header-title">AcceleRep</p>'), "the digest email's header");
});

test('the suites: this file is graded by the harness', () => {
    assert.ok(read('scripts/mutate-import.mjs').includes(' tests/app-name.test.mjs'), 'SUITES runs this file');
});
