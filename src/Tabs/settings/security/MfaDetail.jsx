// settings/security/MfaDetail.jsx
//
// Honest by construction (0.59, 0.65). Everything rendered here is either live
// from Clerk (enrollment, via clerk-mfa-status) or a statement about where the
// policy lives. Three things were removed in 0.65 because they promised what
// they could not do: an "Enforce MFA" modal with fabricated counts that no
// button opened, a "Send reminders" button with no handler, and an "Allowed
// factors" grid of hardcoded on/off tiles that contradicted the real Clerk
// config (it said TOTP on / SMS off while the instance had SMS on / TOTP off).
// A control that promises an action and does nothing certifies (guide).
import React from 'react';
import { dbFetch } from '../../../utils/storage';
import { readRefusal, failureWords } from '../../../utils/refusalWords.js';
import { mfaAnswerRead } from '../../../utils/settingsCards.js';
import { T } from '../shared/tokens.js';
import { SecCrumb, SecTitle, SecBtn, SecCallout, SecCard } from './shared.jsx';

const CLERK_DASHBOARD = 'https://dashboard.clerk.com';

export const MfaDetail = ({ onBack }) => {
    const [mfaData, setMfaData] = React.useState(null);
    const [loading, setLoading] = React.useState(true);
    const [error,   setError]   = React.useState(null);

    // ── Load real MFA enrollment from Clerk via backend ───────────
    // The ok check before the body (docs/design/refusal-sweep Part 12): a refusal is said in the server's words with
    // its ref, else "The server returned N."; a failure in plain words (failureWords) — never "Unexpected token '<'".
    // A read that failed draws no count and no "none" below: the cards stay blank under the error.
    React.useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const res  = await dbFetch('/.netlify/functions/clerk-mfa-status');
                if (cancelled) return;
                if (!res.ok) throw new Error(await readRefusal(res));
                const enrollment = await res.json();
                if (cancelled) return;
                // A landed answer without the shape the cards draw from (the two numbers, the lists, each entry with the
                // fields the server sends) is a read that failed — never "0/0 enrolled", "No users found", "All users have
                // MFA enrolled" or a render crash. One rule with the overview's MFA tile and Settings → Users
                // (settingsCards.js mfaAnswerRead, §0.249).
                if (!mfaAnswerRead(enrollment)) throw new Error('Its answer could not be read.');
                setMfaData(enrollment);
            } catch (e) {
                if (!cancelled) setError(`MFA enrollment could not be read — ${failureWords(e)}`);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, []);

    const enrolled         = mfaData?.enrolled    ?? 0;
    const total            = mfaData?.total       ?? 0;
    const notEnrolled      = mfaData?.notEnrolled ?? [];
    const byRole           = mfaData?.byRole      ?? [];
    const notEnrolledCount = total - enrolled;
    const enrollPct        = total > 0 ? Math.round(enrolled / total * 100) : 0;

    return (
        <div style={{ fontFamily:T.sans }}>
            <SecCrumb page="Multi-factor auth" onBack={onBack}/>
            <SecTitle
                title="Multi-factor auth"
                sub="A second factor on sign-in · policy and factors are set in Clerk"
                badge={loading ? 'Loading…' : error ? undefined : `${enrolled}/${total} enrolled · ${enrollPct}%`}
                updatedAt="Enrollment is live from Clerk"
                actions={[
                    <div key="enf" title="MFA policy is set in Clerk Dashboard" style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 14px', background:'rgba(138,131,120,0.12)', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, fontWeight:600, color:T.inkMuted, fontFamily:T.sans, cursor:'default', userSelect:'none' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                        Managed in Clerk
                    </div>,
                ]}/>

            {/* Where the policy lives, and what this app does with it */}
            <SecCallout tone="info"
                text={<>
                    MFA policy and the allowed factors are configured in your <a href={CLERK_DASHBOARD} target="_blank" rel="noopener noreferrer" style={{ color:T.info, fontWeight:600 }}>Clerk Dashboard</a> under
                    User &amp; Authentication → Multi-factor. Turning on <b>Require multi-factor authentication</b> there holds any user without
                    a second factor at sign-in until they enrol; this app honours that on both the sign-in screen and the API.
                    Enrollment below is live from Clerk.
                </>}
            />

            {error && (
                <div style={{ padding:'11px 16px', background:'rgba(156,58,46,0.08)', borderLeft:`3px solid ${T.danger}`, borderRadius:4, marginBottom:16, fontSize:12.5, color:T.danger, fontFamily:T.sans }}>
                    {error}
                </div>
            )}

            {!loading && notEnrolledCount > 0 && (
                <SecCallout tone="warn"
                    text={<>MFA is not fully enrolled. <b>{notEnrolledCount} user{notEnrolledCount !== 1 ? 's' : ''} haven't set up a second factor.</b> With Require multi-factor authentication on in Clerk, they are held at sign-in until they enrol. This app cannot read that setting — check it in Clerk Dashboard.</>}
                    actions={[
                        <a key="dash" href={CLERK_DASHBOARD} target="_blank" rel="noopener noreferrer">
                            <SecBtn label="Open Clerk Dashboard →"/>
                        </a>,
                    ]}
                />
            )}

            {/* ── Enrollment by role ── */}
            <SecCard title={loading || error ? 'Enrollment by role' : `Enrollment by role (${enrolled}/${total} · ${enrollPct}%)`}>
                {loading ? (
                    <div style={{ padding:'24px 0', textAlign:'center', fontSize:12.5, color:T.inkMuted, fontFamily:T.sans }}>Loading enrollment data…</div>
                ) : error ? null : byRole.length === 0 ? (
                    <div style={{ padding:'24px 0', textAlign:'center', fontSize:12.5, color:T.inkMuted, fontFamily:T.sans }}>No users found in this organization.</div>
                ) : (
                    <div style={{ border:`1px solid ${T.border}`, borderRadius:6, overflow:'hidden' }}>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 80px', gap:8, padding:'7px 14px', background:T.surface2, borderBottom:`1px solid ${T.border}` }}>
                            {['ROLE','ENROLLMENT',''].map((h,i) => (
                                <div key={i} style={{ fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', fontFamily:T.sans }}>{h}</div>
                            ))}
                        </div>
                        {byRole.map((r, i) => {
                            const pct  = r.total > 0 ? Math.round(r.enrolled / r.total * 100) : 0;
                            const full = pct === 100;
                            const pending = r.total - r.enrolled;
                            return (
                                <div key={r.role} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 80px', gap:8, padding:'10px 14px', borderBottom:i<byRole.length-1?`1px solid ${T.border}`:'none', alignItems:'center' }}>
                                    <span style={{ fontSize:13, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{r.role}</span>
                                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                        <div style={{ width:100, height:6, background:T.border, borderRadius:3, overflow:'hidden', flexShrink:0 }}>
                                            <div style={{ width:`${pct}%`, height:'100%', background: full ? T.ok : T.warn, borderRadius:3 }}/>
                                        </div>
                                        <span style={{ fontSize:11.5, color:T.inkMid, fontFamily:'ui-monospace,Menlo,monospace' }}>{r.enrolled}/{r.total}</span>
                                        <span style={{ display:'inline-block', padding:'2px 7px', borderRadius:10, fontSize:11, fontWeight:700,
                                            background: full ? 'rgba(77,107,61,0.12)' : 'rgba(184,115,51,0.12)',
                                            color: full ? T.ok : T.warn }}>
                                            {full ? 'Complete' : `${pending} pending`}
                                        </span>
                                    </div>
                                    <a href={CLERK_DASHBOARD} target="_blank" rel="noopener noreferrer" style={{ fontSize:12, color:T.info, textDecoration:'none', fontFamily:T.sans }}>Manage →</a>
                                </div>
                            );
                        })}
                    </div>
                )}
            </SecCard>

            {/* ── Not yet enrolled ── */}
            <SecCard title={error ? 'Not yet enrolled' : `Not yet enrolled (${notEnrolledCount})`} desc="Users who have not set up any MFA factor. Enrollment happens in Clerk.">
                {loading ? (
                    <div style={{ padding:'24px 0', textAlign:'center', fontSize:12.5, color:T.inkMuted, fontFamily:T.sans }}>Loading…</div>
                ) : error ? null : notEnrolled.length === 0 ? (
                    <div style={{ padding:'18px 0', textAlign:'center', fontSize:12.5, color:T.ok, fontFamily:T.sans }}>
                        ✓ All users have MFA enrolled.
                    </div>
                ) : (
                    <div style={{ border:`1px solid ${T.border}`, borderRadius:6, overflow:'hidden' }}>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 120px 80px', gap:8, padding:'7px 14px', background:T.surface2, borderBottom:`1px solid ${T.border}` }}>
                            {['USER','ROLE','NAME',''].map((h,i) => (
                                <div key={i} style={{ fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', fontFamily:T.sans }}>{h}</div>
                            ))}
                        </div>
                        {notEnrolled.map((u, i) => (
                            <div key={u.userId} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 120px 80px', gap:8, padding:'9px 14px', borderBottom:i<notEnrolled.length-1?`1px solid ${T.border}`:'none', alignItems:'center' }}>
                                <span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:12, color:T.ink, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.email}</span>
                                <span style={{ fontSize:12.5, color:T.inkMid, fontFamily:T.sans }}>{u.role}</span>
                                <span style={{ fontSize:12.5, color:T.inkMid, fontFamily:T.sans }}>{u.name}</span>
                                <a href={CLERK_DASHBOARD} target="_blank" rel="noopener noreferrer"
                                    style={{ fontSize:12, color:T.info, textDecoration:'none', fontFamily:T.sans }}>Manage →</a>
                            </div>
                        ))}
                    </div>
                )}
            </SecCard>

            {/* ── Allowed factors — a pointer, not a claim ── */}
            <SecCard title="Allowed factors" desc="Which factors users may enrol — authenticator app, SMS code, backup codes — is set in Clerk Dashboard → User & Authentication → Multi-factor.">
                <div style={{ fontSize:12.5, color:T.inkMid, fontFamily:T.sans, lineHeight:1.6 }}>
                    This app does not read that configuration, so it is not shown here. Check or change it in your{' '}
                    <a href={CLERK_DASHBOARD} target="_blank" rel="noopener noreferrer" style={{ color:T.info, fontWeight:600 }}>Clerk Dashboard</a>.
                </div>
            </SecCard>
        </div>
    );
};
