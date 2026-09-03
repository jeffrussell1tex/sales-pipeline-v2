// settings/security/SsoDetail.jsx
//
// Honest by construction (state §0.86, handoff item 21 — the MfaDetail pattern
// of 0.59 / 0.65). What was here: a SEC_SSO constant — Okta URLs, a verified
// domain "acme-corp.com", an "Active · 412 logins / 30d" badge, a four-step
// wizard frozen on step 2, Download metadata / Test login / Add domain buttons
// with no handler — and a Save that wrote settings.ssoConfig, which nothing in
// sign-in ever read. Sign-in is Clerk's: SAML 2.0 or OIDC single sign-on is a
// Clerk enterprise connection, configured and domain-verified in the Clerk
// Dashboard, and this app has no SSO configuration of its own to offer. The
// panel now says exactly that and nothing else. A control that promises an
// action and does nothing certifies (guide).
import React from 'react';
import { T } from '../shared/tokens.js';
import { SecCrumb, SecTitle, SecBtn, SecCallout, SecCard } from './shared.jsx';

const CLERK_DASHBOARD = 'https://dashboard.clerk.com';
const CLERK_SSO_DOCS  = 'https://clerk.com/docs/authentication/enterprise-connections/overview';

export const SsoDetail = ({ onBack }) => (
    <div style={{ fontFamily:T.sans }}>
        <SecCrumb page="Single sign-on (SSO)" onBack={onBack}/>
        <SecTitle
            title="Single sign-on (SSO)"
            sub="SAML 2.0 / OIDC through Clerk · configured in the Clerk Dashboard"
            actions={[
                <div key="managed" title="SSO connections are configured in Clerk Dashboard" style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 14px', background:'rgba(138,131,120,0.12)', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, fontWeight:600, color:T.inkMuted, fontFamily:T.sans, cursor:'default', userSelect:'none' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                    Managed in Clerk
                </div>,
            ]}/>

        <SecCallout tone="info"
            text={<>
                Sign-in is handled by Clerk. SAML 2.0 or OIDC single sign-on is a Clerk <b>enterprise connection</b>:
                set it up in your <a href={CLERK_DASHBOARD} target="_blank" rel="noopener noreferrer" style={{ color:T.info, fontWeight:600 }}>Clerk Dashboard</a> under
                User &amp; Authentication → SSO connections, verify your email domain there, and users on that domain are sent to your identity provider when they sign in.
                There is nothing to configure in Accelerep.
            </>}
            actions={[
                <a key="dash" href={CLERK_DASHBOARD} target="_blank" rel="noopener noreferrer"><SecBtn label="Open Clerk Dashboard →"/></a>,
                <a key="docs" href={CLERK_SSO_DOCS} target="_blank" rel="noopener noreferrer"><SecBtn label="Clerk SSO docs →"/></a>,
            ]}
        />

        <SecCard title="What Accelerep does with an SSO sign-in" desc="The same as with any other sign-in.">
            <ul style={{ margin:0, paddingLeft:18, fontSize:13, color:T.inkMid, lineHeight:1.7, fontFamily:T.sans }}>
                <li>Accelerep trusts an active Clerk session and nothing else. How the user reached it — password, passkey, or your identity provider — makes no difference here.</li>
                <li>A user's role, team and territory come from Settings → Team, not from the identity provider. An attribute mapping is not something this app reads.</li>
                <li>Accelerep cannot tell whether an SSO connection exists or how many people signed in through it. Clerk's dashboard shows both.</li>
            </ul>
        </SecCard>
    </div>
);
