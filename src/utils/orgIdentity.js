// src/utils/orgIdentity.js — who an org is on what its customers receive (state §0.234; guide §18b117;
// docs/design/quote-branding). One rule for the screen and the server: the Company profile's display name, else the
// org's own name in Clerk (Jeff, 9 Nov, Q1: "Clerk org name"); never the app's name. The address, phone and support
// email as the Company profile holds them. Pure — no fetch, no Clerk call: each side hands it what it has.

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

// A plain address: something@something.tld, no spaces or angle brackets. Anything else is not used as a reply
// address — Resend refuses a malformed reply_to, and the email would not go out.
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
export const emailOrNull = (v) => { const s = clean(v); return EMAIL_RE.test(s) ? s : null; };

/**
 * @param {{ displayName?, address?, city?, state?, zip?, phone?, supportEmail? }} profile  the Company profile
 * @param {string} [clerkOrgName]  the org's name in Clerk — used only when the profile has no display name
 * @returns {{ name: string, addressLines: string[], phone: string, email: string }}  empty strings, never the app's
 */
export function orgIdentityOf(profile, clerkOrgName = '') {
    const p = profile || {};
    const stateZip = [clean(p.state), clean(p.zip)].filter(Boolean).join(' ');
    const place = [clean(p.city), stateZip].filter(Boolean).join(', ');
    return {
        name: clean(p.displayName) || clean(clerkOrgName),
        addressLines: [clean(p.address), place].filter(Boolean),
        phone: clean(p.phone),
        email: clean(p.supportEmail),
    };
}

// The Company profile's keys as the settings GET answers them (settings.mjs — companyDisplayName already falls back
// to the company_name column there).
export const profileOfSettings = (s) => ({
    displayName: s?.companyDisplayName, address: s?.companyAddress, city: s?.companyCity, state: s?.companyState,
    zip: s?.companyZip, phone: s?.companyPhone, supportEmail: s?.companySupportEmail,
});

// The same from a stored settings row (the server): the keys live in `extra`, and the display name falls back to the
// company_name column as the GET's does.
export const profileOfRow = (row) => ({
    ...profileOfSettings(row?.extra),
    displayName: clean(row?.extra?.companyDisplayName) || clean(row?.companyName),
});

// A quote brand (settings.quoteBrand) as a LOOK only: without the name and contact line Edit brand no longer edits
// (Jeff, 9 Nov, Q2: "Remove, link out") — a brand saved before §0.234 may hold them, the app's own among them.
export const brandLook = (b) => {
    const look = { ...(b || {}) };
    delete look.companyName;
    delete look.contactLine;
    return look;
};

// The one contact line under the name: phone · email.
export const contactLineOf = (id) => [id?.phone, id?.email].map(clean).filter(Boolean).join(' · ');

// The From header for an email sent as the org (Q3): the org's name shown, the address the one verified sender's
// (MAIL_FROM, "Name <address>" or a bare address). No name: MAIL_FROM as it stands. The name loses the characters
// that would break the header — quotes, angle brackets, backslashes, line breaks — and is cut to 70.
export function mailFromAs(mailFrom, name) {
    const from = clean(mailFrom);
    const addr = (from.match(/<([^<>]+)>\s*$/) || [null, from])[1].trim();
    const shown = clean(String(name ?? '').replace(/["<>\\\r\n]/g, ' ')).slice(0, 70).trim();
    if (!shown || !addr) return from;
    return `"${shown}" <${addr}>`;
}
