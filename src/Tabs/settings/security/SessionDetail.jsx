// settings/security/SessionDetail.jsx
//
// Honest by construction (state §0.86, handoff item 21 — the MfaDetail pattern
// of 0.59 / 0.65). What was here: a SEC_SESSION constant (idle timeout,
// lifetime, concurrent sessions, re-auth, password length / rotation / history
// / lockout, an IP allowlist with "HQ VPN" and "AWS prod NAT") behind a policy
// form whose "Save policy" PUT a `sessionPolicy` key that was in NEITHER half
// of settings.mjs — the server dropped it and answered 200, the toast said
// "Policy saved.", and the next load showed the typed defaults again. Nothing
// in this app enforced any of it: sessions, passwords and lockout are Clerk's,
// and Accelerep has no IP allowlist. The panel now says exactly that.
import React from 'react';
import { T } from '../shared/tokens.js';
import { SecCrumb, SecTitle, SecBtn, SecCallout, SecCard } from './shared.jsx';

const CLERK_DASHBOARD = 'https://dashboard.clerk.com';

export const SessionDetail = ({ onBack }) => (
    <div style={{ fontFamily:T.sans }}>
        <SecCrumb page="Session & password" onBack={onBack}/>
        <SecTitle
            title="Session & password"
            sub="Sessions, passwords and lockout are set in Clerk"
            actions={[
                <div key="managed" title="Session and password policy are configured in Clerk Dashboard" style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 14px', background:'rgba(138,131,120,0.12)', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, fontWeight:600, color:T.inkMuted, fontFamily:T.sans, cursor:'default', userSelect:'none' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                    Managed in Clerk
                </div>,
            ]}/>

        <SecCallout tone="info"
            text={<>
                Session lifetime, inactivity timeout, multi-session handling, password rules and account lockout are Clerk settings —
                User &amp; Authentication → <b>Sessions</b>, and → <b>Email, phone, username → Password</b> in your <a href={CLERK_DASHBOARD} target="_blank" rel="noopener noreferrer" style={{ color:T.info, fontWeight:600 }}>Clerk Dashboard</a>.
                Accelerep trusts a Clerk session while it is active and stops serving the user the moment Clerk ends it.
            </>}
            actions={[
                <a key="dash" href={CLERK_DASHBOARD} target="_blank" rel="noopener noreferrer"><SecBtn label="Open Clerk Dashboard →"/></a>,
            ]}
        />

        <SecCard title="What Accelerep adds on top" desc="Two things, both already in force.">
            <ul style={{ margin:0, paddingLeft:18, fontSize:13, color:T.inkMid, lineHeight:1.7, fontFamily:T.sans }}>
                <li>A session Clerk still considers <b>pending</b> — a user held at the multi-factor setup step — is refused by both the app and the API until it is active.</li>
                <li>Every API request is checked against the Clerk session and the user's roster role; there is no separate Accelerep password to manage.</li>
            </ul>
        </SecCard>

        <SecCard title="Not available in Accelerep" desc="Said plainly, so nothing here promises what the app does not do.">
            <ul style={{ margin:0, paddingLeft:18, fontSize:13, color:T.inkMid, lineHeight:1.7, fontFamily:T.sans }}>
                <li>An <b>IP allowlist</b>. Sign-in is not restricted by network address.</li>
                <li><b>Re-authentication for sensitive actions</b> (quote send, role edit, API key create). None of these ask for a second sign-in today.</li>
            </ul>
        </SecCard>
    </div>
);
