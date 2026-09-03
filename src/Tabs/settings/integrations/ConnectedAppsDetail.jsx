// settings/integrations/ConnectedAppsDetail.jsx
//
// Honest by construction (state §0.90, handoff item 24 — Jeff: "option a").
// What was here: an INT_APPS catalogue of fifteen apps, a connect modal that
// showed "Morgan Reyes · morgan@accelerep.com" with a Switch that did nothing,
// a fixed scope list, "You'll be redirected to Google" and an Authorize that
// closed the dialog; "Browse marketplace" and "+ Request integration" with no
// handler; and a `connectedApps.gcal` flag nothing ever set, so Google Calendar
// read unconnected here even when it was connected. Underneath it, the one real
// integration's modal had been undefined since May (§0.89).
//
// What is here now is exactly what exists:
//   • Slack — an Incoming Webhook saved in settings.slackConfig, read by
//     send-slack.mjs for the five pipeline alerts.
//   • Google Calendar and Microsoft 365 Calendar — the real OAuth flow
//     (calendar-oauth-start → provider → calendar-oauth-callback), connections
//     read from calendar-connections (personal and company), Disconnect through
//     the same endpoint. A provider the site has no credentials for says so
//     instead of navigating into a 503.
//   • Email logging — the org's BCC address from email-inbound (a rep BCCs it;
//     the email lands as an activity on the matching contact). It existed with
//     no UI at all.
//   • Request an integration — the apps people ask for (integrationCatalog.js),
//     each a request recorded on the org and mailed to the product owner, never
//     a Connect.
import React, { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { dbFetch, dbWrite } from '../../../utils/storage';
import { putSettings } from '../shared/saveSettings.js';
import { T } from '../shared/tokens.js';
import { useApp } from '../../../AppContext';
import { REQUESTABLE_APPS } from '../../../utils/integrationCatalog.js';
import { IntCrumb, IntTitle, IntBtn, IntModal, IntModalHeader, IntModalFooter } from './shared.jsx';

const AppTile = ({ name, color='#3a5a7a', size=36, emoji }) => (
    <span style={{
        display:'inline-flex', alignItems:'center', justifyContent:'center',
        width:size, height:size, borderRadius:6,
        background:color, color:'#fff',
        fontSize: emoji ? size*0.55 : size*0.38, fontWeight:700, fontFamily:T.sans,
        flexShrink:0, letterSpacing:0, userSelect:'none',
    }}>{emoji || name.slice(0,2).toUpperCase()}</span>
);

const StatusDot = ({ tone='ok', label }) => {
    const c = { ok:T.ok, warn:T.warn, danger:T.danger, muted:T.inkMuted }[tone] || T.ok;
    return (
        <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11.5, color:c, fontFamily:T.sans }}>
            <span style={{ width:7, height:7, borderRadius:'50%', background:c, flexShrink:0 }}/>
            {label}
        </span>
    );
};

const Pill = ({ tone='ok', children }) => {
    const bg = { ok:'rgba(77,107,61,0.12)', muted:'rgba(138,131,120,0.14)', warn:'rgba(184,115,51,0.10)' }[tone];
    const fg = { ok:T.ok, muted:T.inkMuted, warn:T.warn }[tone];
    return <span style={{ padding:'2px 7px', borderRadius:10, background:bg, color:fg, fontSize:10.5, fontWeight:700, whiteSpace:'nowrap' }}>{children}</span>;
};

const linkBtn = (color) => ({ fontSize:12, fontWeight:600, color, background:'none', border:'none', cursor:'pointer', fontFamily:T.sans, padding:0 });

const fmtDay = (iso) => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? d.toLocaleDateString() : ''; };

// ── Slack configuration ──────────────────────────────────────────────────────
// This modal was defined in SettingsTab.jsx until `5772f63` (11 May 2026) deleted
// it in a cleanup while the panel kept rendering <SlackConfigModal/>. Vite bundles
// an unbound JSX name as a global read, so every build passed and every
// "Configure Slack" click threw "SlackConfigModal is not defined" into the
// Settings error boundary — no org could ever set the webhook that
// send-slack.mjs and pipeline-alerts.mjs read. Restored 3 Sep 2026 (state §0.89)
// from the pre-deletion source; `FL` is hoisted to module scope as SlackField,
// since a children-rendering wrapper declared per render remounts the input it
// wraps (check:inline, the AuditDetail FL bug).
const slackInputStyle = { width:'100%', padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace', outline:'none', background:T.surface, boxSizing:'border-box' };

const SlackField = ({ label, hint, children }) => (
    <div style={{ marginBottom:14 }}>
        <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5, fontFamily:T.sans }}>{label}</label>
        {children}
        {hint && <div style={{ fontSize:11, color:T.inkMuted, marginTop:4, fontFamily:T.sans }}>{hint}</div>}
    </div>
);

const SlackConfigModal = ({ existing, onClose, onSave }) => {
    const [webhookUrl, setWebhookUrl] = useState(existing?.webhookUrl || '');
    const [channel,    setChannel]    = useState(existing?.channel    || '#sales-alerts');
    const [testing,    setTesting]    = useState(false);
    const [testMsg,    setTestMsg]    = useState(null);
    const [saving,     setSaving]     = useState(false);

    // send-slack.mjs posts to an explicit webhookUrl when one is in the body —
    // the org's stored one is not touched until Save.
    const handleTest = async () => {
        if (!webhookUrl.trim()) return;
        setTesting(true); setTestMsg(null);
        try {
            const res  = await dbFetch('/.netlify/functions/send-slack', {
                method: 'POST',
                body: JSON.stringify({ webhookUrl: webhookUrl.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Test failed');
            setTestMsg({ ok: true, text: 'Message sent — check your Slack channel.' });
        } catch (e) {
            setTestMsg({ ok: false, text: e.message });
        } finally { setTesting(false); }
    };

    const handleSave = async () => {
        if (!webhookUrl.trim()) return;
        setSaving(true);
        await onSave({ webhookUrl: webhookUrl.trim(), channel: channel.trim(), enabled: true });
        setSaving(false);
    };

    return (
        <IntModal width={560} onClose={onClose}>
            <IntModalHeader onClose={onClose}
                left={<AppTile name="Slack" color="#4a154b" emoji="💬" size={36}/>}
                title="Configure Slack"
                sub="Incoming Webhook · pipeline alerts and digests"/>
            <div style={{ flex:1, overflowY:'auto', padding:'18px 22px' }}>
                <SlackField label="Incoming Webhook URL"
                    hint="Create one at api.slack.com/apps → your app → Incoming Webhooks → Add New Webhook">
                    <input value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)}
                        placeholder="https://hooks.slack.com/services/T.../B.../..."
                        style={slackInputStyle}/>
                </SlackField>
                <SlackField label="Default channel" hint="The channel the webhook posts to — set when you create the webhook; shown here for reference">
                    <input value={channel} onChange={e => setChannel(e.target.value)}
                        placeholder="#sales-alerts"
                        style={{ ...slackInputStyle, fontFamily: T.sans }}/>
                </SlackField>
                <div style={{ padding:'12px 14px', background:'rgba(58,90,122,0.07)', borderLeft:`3px solid ${T.info}`, borderRadius:4, fontSize:12, color:T.inkMid, fontFamily:T.sans, marginBottom:14 }}>
                    <b style={{ color:T.info }}>What posts to Slack:</b> the pipeline alerts this workspace has on — deal silent, stuck in stage, close date lapsed, deal momentum, score drop — alongside their emails.
                </div>
                {testMsg && (
                    <div style={{ padding:'10px 14px', background: testMsg.ok ? 'rgba(77,107,61,0.08)' : 'rgba(156,58,46,0.08)', borderLeft:`3px solid ${testMsg.ok ? T.ok : T.danger}`, borderRadius:4, fontSize:12, color: testMsg.ok ? T.ok : T.danger, fontFamily:T.sans, marginBottom:14 }}>
                        {testMsg.text}
                    </div>
                )}
            </div>
            <IntModalFooter left={<IntBtn label={testing ? 'Sending…' : 'Send test message'} onClick={handleTest} disabled={!webhookUrl.trim() || testing}/>}>
                <IntBtn label="Cancel" onClick={onClose}/>
                <IntBtn label={saving ? 'Saving…' : 'Save configuration'} primary onClick={handleSave} disabled={!webhookUrl.trim() || saving}/>
            </IntModalFooter>
        </IntModal>
    );
};

// ── A real integration's card ────────────────────────────────────────────────
const IntegrationCard = ({ tile, name, category, desc, pill, foot, children }) => (
    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:16, display:'flex', flexDirection:'column', gap:10 }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
            {tile}
            <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13.5, fontWeight:700, color:T.ink }}>{name}</div>
                <div style={{ fontSize:11, color:T.inkMuted }}>{category}</div>
            </div>
            {pill}
        </div>
        <div style={{ fontSize:12, color:T.inkMid, lineHeight:1.4 }}>{desc}</div>
        {children}
        {foot && <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:8, borderTop:`1px solid ${T.border}`, gap:8, flexWrap:'wrap' }}>{foot}</div>}
    </div>
);

const CALENDARS = [
    { provider:'google',  name:'Google Calendar',       color:'#4285f4', emoji:'📅', vendor:'Google' },
    { provider:'outlook', name:'Microsoft 365 Calendar', color:'#0078d4', emoji:'📆', vendor:'Microsoft' },
];

// One provider: the company connection (Admin) and the caller's own. Connect is
// the existing OAuth start — a browser redirect, so the identity goes in the
// query the same way HomeTab and CompanyCalendarDetail send it; the callback
// re-checks the Admin claim before storing an org connection.
const CalendarCard = ({ cal, configured, orgConn, userConn, isAdmin, onConnect, onDisconnect, busy }) => {
    const any = !!(orgConn || userConn);
    return (
        <IntegrationCard
            tile={<AppTile name={cal.name} color={cal.color} emoji={cal.emoji} size={36}/>}
            name={cal.name} category="Calendar"
            desc={`Meetings from a connected ${cal.vendor} calendar show on Home. A company calendar is visible to everyone; a personal one only to you.`}
            pill={configured === false ? <Pill tone="muted">Not available on this site</Pill> : any ? <Pill tone="ok">Live</Pill> : null}
            foot={configured === false ? (
                <span style={{ fontSize:11.5, color:T.inkMuted, fontFamily:T.sans }}>This site has no {cal.vendor} sign-in credentials configured. Nothing to do here until it does.</span>
            ) : (
                <>
                    <StatusDot tone={any ? 'ok' : 'muted'} label={any ? 'Connected' : 'Not connected'}/>
                    <div style={{ display:'flex', gap:12 }}>
                        {!userConn && <button onClick={() => onConnect(cal.provider, 'user')} style={linkBtn(T.info)}>Connect my calendar</button>}
                        {isAdmin && !orgConn && <button onClick={() => onConnect(cal.provider, 'org')} style={linkBtn(T.info)}>Connect company calendar</button>}
                    </div>
                </>
            )}>
            {configured !== false && (orgConn || userConn) && (
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {orgConn && (
                        <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, fontFamily:T.sans }}>
                            <span style={{ flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}><b style={{ color:T.ink }}>Company</b> · <span style={{ color:T.inkMid }}>{orgConn.calendarEmail || orgConn.calendarName || 'connected'}</span>{orgConn.connectedAt && <span style={{ color:T.inkMuted }}> · {fmtDay(orgConn.connectedAt)}</span>}</span>
                            {isAdmin && <button disabled={busy} onClick={() => onDisconnect(orgConn.id, 'org')} style={{ ...linkBtn(T.danger), opacity: busy ? 0.5 : 1 }}>Disconnect</button>}
                        </div>
                    )}
                    {userConn && (
                        <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, fontFamily:T.sans }}>
                            <span style={{ flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}><b style={{ color:T.ink }}>Mine</b> · <span style={{ color:T.inkMid }}>{userConn.calendarEmail || 'connected'}</span>{userConn.connectedAt && <span style={{ color:T.inkMuted }}> · {fmtDay(userConn.connectedAt)}</span>}</span>
                            <button disabled={busy} onClick={() => onDisconnect(userConn.id, 'user')} style={{ ...linkBtn(T.danger), opacity: busy ? 0.5 : 1 }}>Disconnect</button>
                        </div>
                    )}
                </div>
            )}
        </IntegrationCard>
    );
};

// The org's BCC address. Stateless on the server: the address both identifies
// and authenticates the org (email-inbound.mjs), so there is nothing to
// connect — only something to copy.
const BccCard = ({ bcc }) => {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try { await navigator.clipboard.writeText(bcc.address); setCopied(true); setTimeout(() => setCopied(false), 1800); }
        catch { setCopied(false); }
    };
    const configured = bcc?.configured === true && !!bcc.address;
    return (
        <IntegrationCard
            tile={<AppTile name="Email logging" color="#5b6b3a" emoji="📨" size={36}/>}
            name="Email logging" category="Email"
            desc="BCC this address on any email you send and it is logged as an Email activity on the matching contact and their account. Works from any mail client — nothing to install."
            pill={bcc == null ? null : configured ? <Pill tone="ok">Live</Pill> : <Pill tone="muted">Not available on this site</Pill>}
            foot={bcc == null ? <span style={{ fontSize:11.5, color:T.inkMuted }}>Loading…</span> : configured ? (
                <>
                    <code style={{ fontSize:11.5, color:T.ink, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:4, padding:'3px 7px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'100%' }}>{bcc.address}</code>
                    <button onClick={copy} style={linkBtn(T.info)}>{copied ? 'Copied' : 'Copy address'}</button>
                </>
            ) : (
                <span style={{ fontSize:11.5, color:T.inkMuted, fontFamily:T.sans }}>This site has no inbound mail domain configured. Nothing to do here until it does.</span>
            )}/>
    );
};

// A catalogue row is a REQUEST. It never says Connect and never opens a modal.
const RequestRow = ({ app, request, onRequest, busy, last }) => (
    <div style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 16px', borderBottom: last ? 'none' : `1px solid ${T.border}` }}>
        <AppTile name={app.name} color={app.color} emoji={app.emoji} size={32}/>
        <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:600, color:T.ink }}>{app.name}</div>
            <div style={{ fontSize:11.5, color:T.inkMuted }}>{app.desc}</div>
        </div>
        <span style={{ fontSize:11.5, color:T.inkMuted, marginRight:8, whiteSpace:'nowrap' }}>{app.category}</span>
        {request?.requestedAt
            ? <span title={request.byName ? `Requested by ${request.byName}` : undefined} style={{ fontSize:11.5, fontWeight:600, color:T.inkMuted, whiteSpace:'nowrap', fontFamily:T.sans }}>Requested · {fmtDay(request.requestedAt)}</span>
            : <button onClick={() => onRequest(app)} disabled={busy === app.id}
                style={{ padding:'6px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12, fontWeight:600, cursor: busy === app.id ? 'default' : 'pointer', fontFamily:T.sans, opacity: busy === app.id ? 0.5 : 1, whiteSpace:'nowrap' }}>
                {busy === app.id ? 'Sending…' : 'Request'}
              </button>}
    </div>
);

export const ConnectedAppsDetail = ({ onBack }) => {
    const { userRole } = useApp();
    const { userId, orgId } = useAuth();
    const isAdmin = userRole === 'Admin';

    const [slackModal,    setSlackModal]    = useState(false);
    const [connectedApps, setConnectedApps] = useState({});   // { slack: true }
    const [slackConfig,   setSlackConfig]   = useState({});   // { webhookUrl, channel, enabled }
    const [requests,      setRequests]      = useState({});   // { [appId]: { requestedAt, byUserId, byName, note } }
    const [cal,           setCal]           = useState(null); // { userConnections, orgConnections, providers }
    const [bcc,           setBcc]           = useState(null); // { address, configured }
    const [loading,       setLoading]       = useState(true);
    const [error,         setError]         = useState('');
    const [busy,          setBusy]          = useState(null); // 'slack' | 'cal' | appId

    // Three reads, one panel. Settings carries Slack and the requests;
    // calendar-connections the real calendar state; email-inbound the address.
    // (This panel self-fetches settings — pre-existing, and its other two
    // sources are not settings at all.)
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const res  = await dbFetch('/.netlify/functions/settings');
                const data = await res.json();
                if (cancelled) return;
                if (!res.ok) throw new Error(data.error || 'Failed to load settings');
                setConnectedApps(data.settings?.connectedApps || {});
                setSlackConfig(data.settings?.slackConfig || {});
                setRequests(data.settings?.integrationRequests || {});
            } catch (e) {
                if (!cancelled) setError(e.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        const loadCal = async () => {
            try {
                const res = await dbFetch('/.netlify/functions/calendar-connections');
                const data = await res.json();
                if (cancelled) return;
                if (!res.ok) throw new Error(data.error || 'Failed to load calendar connections');
                setCal({ userConnections: data.userConnections || [], orgConnections: data.orgConnections || [], providers: data.providers || null });
            } catch (e) {
                if (!cancelled) setCal({ userConnections: [], orgConnections: [], providers: null, error: e.message });
            }
        };
        const loadBcc = async () => {
            try {
                const res = await dbFetch('/.netlify/functions/email-inbound');
                const data = await res.json();
                if (cancelled) return;
                if (!res.ok) throw new Error(data.error || 'Failed to load the email logging address');
                setBcc({ address: data.address || null, configured: data.configured === true });
            } catch {
                if (!cancelled) setBcc({ address: null, configured: false });
            }
        };
        load(); loadCal(); loadBcc();
        return () => { cancelled = true; };
    }, []);

    const reloadCal = async () => {
        const res = await dbFetch('/.netlify/functions/calendar-connections');
        const data = await res.json().catch(() => ({}));
        if (res.ok) setCal({ userConnections: data.userConnections || [], orgConnections: data.orgConnections || [], providers: data.providers || null });
    };

    // ── Slack ──────────────────────────────────────────────────────────────
    // dbFetch resolves for ANY status (guide 18b1); putSettings throws on a
    // non-2xx so a 403 lands in the error path, not the success path.
    const handleSaveSlack = async (config) => {
        const cfgSnap = slackConfig, appSnap = connectedApps;
        const nextApps = { ...connectedApps, slack: true };
        setSlackConfig(config);
        setConnectedApps(nextApps);
        setError('');
        try {
            await putSettings({ slackConfig: config, connectedApps: nextApps });
            setSlackModal(false);          // only close once the write has landed
        } catch (e) {
            setSlackConfig(cfgSnap);
            setConnectedApps(appSnap);
            setError(`Slack settings not saved — ${e.message}`);
        }
    };
    const handleDisconnectSlack = async () => {
        const appSnap = connectedApps, cfgSnap = slackConfig;
        setBusy('slack'); setError('');
        setConnectedApps({ ...connectedApps, slack: false });
        setSlackConfig({});
        try {
            await putSettings({ connectedApps: { ...connectedApps, slack: false }, slackConfig: {} });
        } catch (e) {
            setConnectedApps(appSnap); setSlackConfig(cfgSnap);
            setError(`Slack not disconnected — ${e.message}`);
        }
        setBusy(null);
    };
    const slackConnected = connectedApps.slack === true && !!slackConfig?.webhookUrl;

    // ── Calendars ──────────────────────────────────────────────────────────
    const connectCalendar = (provider, scope) => {
        const qs = new URLSearchParams({ provider, scope, userId: userId || '', orgId: orgId || '', userRole: userRole || 'User' });
        window.location.href = '/.netlify/functions/calendar-oauth-start?' + qs.toString();
    };
    const disconnectCalendar = async (id, scope) => {
        setBusy('cal'); setError('');
        const r = await dbWrite(`/.netlify/functions/calendar-connections?id=${encodeURIComponent(id)}&scope=${scope}`, { method: 'DELETE' });
        if (!r.ok) setError(`Calendar not disconnected — ${r.error}`);
        await reloadCal();
        setBusy(null);
    };

    // ── Requests ───────────────────────────────────────────────────────────
    const requestApp = async (app) => {
        setBusy(app.id); setError('');
        try {
            const res  = await dbFetch('/.netlify/functions/integration-requests', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ appId: app.id }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `The server returned ${res.status}.`);
            setRequests(prev => ({ ...prev, [app.id]: data.request }));
        } catch (e) {
            setError(`${app.name} not requested — ${e.message}`);
        }
        setBusy(null);
    };

    const connByProvider = (list, provider) => (list || []).find(c => c.provider === provider) || null;
    const liveCount = (slackConnected ? 1 : 0)
        + CALENDARS.filter(c => connByProvider(cal?.orgConnections, c.provider) || connByProvider(cal?.userConnections, c.provider)).length
        + (bcc?.configured ? 1 : 0);
    const requestedCount = Object.values(requests).filter(r => r?.requestedAt).length;

    if (loading) return (
        <div style={{ fontFamily:T.sans }}>
            <IntCrumb page="Connected apps" onBack={onBack}/>
            <div style={{ padding:'60px 0', textAlign:'center', color:T.inkMuted, fontSize:13 }}>Loading…</div>
        </div>
    );

    return (
        <div style={{ fontFamily:T.sans }}>
            {slackModal && <SlackConfigModal existing={slackConfig} onClose={() => setSlackModal(false)} onSave={handleSaveSlack}/>}

            <IntCrumb page="Connected apps" onBack={onBack}/>
            <IntTitle title="Connected apps"
                sub={`${liveCount} live · Slack, calendars and email logging are the integrations that exist; anything else can be requested below`}/>

            {error && <div style={{ padding:'11px 16px', background:'rgba(156,58,46,0.08)', borderLeft:`3px solid ${T.danger}`, borderRadius:4, marginBottom:16, fontSize:12.5, color:T.danger }}>{error}</div>}

            {/* ── Integrations that exist ── */}
            <div style={{ marginBottom:24 }}>
                <div style={{ fontSize:14, fontWeight:700, color:T.ink, marginBottom:12 }}>Integrations</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:14 }}>
                    <IntegrationCard
                        tile={<AppTile name="Slack" color="#4a154b" emoji="💬" size={36}/>}
                        name="Slack" category="Messaging"
                        desc="Pipeline alerts — deal silent, stuck in stage, close date lapsed, deal momentum, score drop — posted to a channel through an Incoming Webhook, alongside their emails."
                        pill={slackConnected ? <Pill tone="ok">Live</Pill> : null}
                        foot={<>
                            <StatusDot tone={slackConnected ? 'ok' : 'muted'} label={slackConnected ? `Connected${slackConfig.channel ? ' · ' + slackConfig.channel : ''}` : 'Not connected'}/>
                            <div style={{ display:'flex', gap:12 }}>
                                {isAdmin && <button onClick={() => setSlackModal(true)} style={linkBtn(T.info)}>{slackConnected ? 'Configure' : 'Configure Slack'}</button>}
                                {isAdmin && slackConnected && <button disabled={busy === 'slack'} onClick={handleDisconnectSlack} style={{ ...linkBtn(T.danger), opacity: busy === 'slack' ? 0.5 : 1 }}>{busy === 'slack' ? 'Disconnecting…' : 'Disconnect'}</button>}
                                {!isAdmin && <span style={{ fontSize:11.5, color:T.inkMuted }}>An Admin configures Slack</span>}
                            </div>
                        </>}/>
                    {CALENDARS.map(c => (
                        <CalendarCard key={c.provider} cal={c}
                            configured={cal?.providers ? cal.providers[c.provider] !== false : undefined}
                            orgConn={connByProvider(cal?.orgConnections, c.provider)}
                            userConn={connByProvider(cal?.userConnections, c.provider)}
                            isAdmin={isAdmin} busy={busy === 'cal'}
                            onConnect={connectCalendar} onDisconnect={disconnectCalendar}/>
                    ))}
                    <BccCard bcc={bcc}/>
                </div>
                {cal?.error && <div style={{ marginTop:10, fontSize:11.5, color:T.inkMuted }}>Calendar connections could not be loaded — {cal.error}</div>}
            </div>

            {/* ── Request an integration ── */}
            <div>
                <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:10, gap:12 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:T.ink }}>Request an integration</div>
                    <div style={{ fontSize:11.5, color:T.inkMuted }}>{requestedCount ? `${requestedCount} requested by this workspace` : 'None requested yet'}</div>
                </div>
                <div style={{ fontSize:12, color:T.inkMid, lineHeight:1.5, marginBottom:12 }}>
                    These are not connected and cannot be yet. A request is recorded for this workspace and sent to the people who build Accelerep — what gets built next follows what workspaces ask for.
                </div>
                <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, overflow:'hidden' }}>
                    {REQUESTABLE_APPS.map((app, i) => (
                        <RequestRow key={app.id} app={app} request={requests[app.id]} onRequest={requestApp} busy={busy} last={i === REQUESTABLE_APPS.length - 1}/>
                    ))}
                </div>
            </div>
        </div>
    );
};
