// src/components/layout/MeetingPrepPanel.jsx
//
// The meeting prep panel: a calendar event's deal — its health, account, contacts,
// recent activities and open tasks — opened from Home's plate ("Open prep"). App
// worked it out and drew it in its own render, where no boundary can catch what
// throws, so a crash in it took the page (state §0.184's found (b)). Cut out as it
// was (state §0.185), it renders below the LayerBoundary App wraps it in: a crash
// closes it, says so, and keeps the page.
import React from 'react';
import { useApp } from '../../AppContext';
import { T } from '../../tokens.js';
import { useEscapeLayer } from '../../hooks/useEscapeLayer';

export default function MeetingPrepPanel() {
    const {
        meetingPrepOpen, meetingPrepEvent, meetingPrepOppId, setMeetingPrepOpen, setMeetingPrepOppId,
        opportunities, contacts, accounts, activities, tasks, calculateDealHealth,
        handleAddActivity, setTaskRailId, setTaskRailMode, setEditingTask,
        escapeBlocked,
    } = useApp();
    // Escape closes it, as its ✕ and its backdrop do (state §0.186), while no layer above it is open.
    useEscapeLayer(!!(meetingPrepOpen && meetingPrepEvent), () => { setMeetingPrepOpen(false); setMeetingPrepOppId(null); }, escapeBlocked('meetingPrep'));
    if (!meetingPrepOpen || !meetingPrepEvent) return null;

    const ev = meetingPrepEvent;
    const evTitle = ev.summary || 'Untitled Event';
    const evDate = ev.start?.date || (ev.start?.dateTime ? ev.start.dateTime.split('T')[0] : '');
    const evTime = ev.start?.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'All day';
    const evEnd = ev.end?.dateTime ? new Date(ev.end.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null;

    // Use forced opp ID if provided (e.g. from task), otherwise fuzzy-match by title
    const titleWords = evTitle.toLowerCase().split(/[\s\-–—,]+/).filter(w => w.length > 2);
    const matchedOpp = meetingPrepOppId
        ? (opportunities || []).find(o => o.id === meetingPrepOppId)
        : (opportunities || []).find(o => {
            const haystack = ((o.opportunityName || '') + ' ' + (o.account || '')).toLowerCase();
            return titleWords.some(w => haystack.includes(w));
        });

    // Get contacts linked to this account
    const matchedContacts = matchedOpp
        ? (contacts || []).filter(c => c.company?.toLowerCase() === (matchedOpp.account || '').toLowerCase() || c.accountId === (matchedOpp.accountId || ''))
            .slice(0, 5)
        : [];

    // Get account
    const matchedAccount = matchedOpp
        ? (accounts || []).find(a => a.name?.toLowerCase() === (matchedOpp.account || '').toLowerCase())
        : null;

    // Get recent activities
    const recentActivities = matchedOpp
        ? (activities || []).filter(a => a.opportunityId === matchedOpp.id)
            .sort((a, b) => new Date(b.date + 'T12:00:00') - new Date(a.date + 'T12:00:00'))
            .slice(0, 5)
        : [];

    // Get open tasks
    const openTasks = matchedOpp
        ? (tasks || []).filter(t => t.opportunityId === matchedOpp.id && (t.status || (t.completed ? 'Completed' : 'Open')) !== 'Completed')
            .sort((a, b) => new Date(a.dueDate || '9999') - new Date(b.dueDate || '9999'))
            .slice(0, 5)
        : [];

    // Deal health
    const health = matchedOpp ? calculateDealHealth(matchedOpp) : null;
    const healthColor = health ? (health.score >= 70 ? T.ok : health.score >= 40 ? T.warn : T.danger) : T.inkMuted;
    const healthBg = health ? (health.score >= 70 ? `${T.ok}18` : health.score >= 40 ? `${T.warn}18` : `${T.danger}14`) : T.surface2;

    return (
        <>
            {/* Backdrop */}
            <div onClick={() => { setMeetingPrepOpen(false); setMeetingPrepOppId(null); }}
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 11020 }} />

            {/* Slide-in panel */}
            {/* Above the rails and the deal window it is opened from (state §0.187); under the document layers. */}
            <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '420px', background: T.surface, zIndex: 11021, boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

                {/* Header */}
                <div style={{ background: '#1c1917', padding: '1.25rem 1.5rem', color: T.surface, flexShrink: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: '3px', height: '16px', background: T.gold, borderRadius: '2px' }} />
                            <div style={{ fontSize: '0.625rem', fontWeight: '700', color: T.gold, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Meeting Prep</div>
                        </div>
                        <button onClick={() => setMeetingPrepOpen(false)}
                            style={{ background: 'rgba(245,241,235,0.1)', border: '1px solid rgba(245,241,235,0.15)', color: T.surface, borderRadius: '6px', width: '28px', height: '28px', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'inherit' }}>✕</button>
                    </div>
                    <div style={{ fontWeight: '700', fontSize: '1rem', lineHeight: 1.3, marginBottom: '0.375rem', color: T.surface }}>{evTitle}</div>
                    <div style={{ fontSize: '0.8125rem', color: T.inkMuted }}>
                        {evDate} · {evTime}{evEnd ? ' – ' + evEnd : ''}{ev.attendeeCount > 0 ? ` · ${ev.attendeeCount} attendees` : ''}
                    </div>
                </div>

                <div style={{ flex: 1, padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', overflowY: 'auto', background: T.bg }}>

                    {/* Opportunity match */}
                    {matchedOpp ? (
                        <div>
                            <div style={{ fontSize: '0.625rem', fontWeight: '700', color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Linked Opportunity</div>
                            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '0.75rem 1rem' }}>
                                <div style={{ fontWeight: '700', fontSize: '0.9375rem', color: '#1c1917', marginBottom: '0.25rem' }}>{matchedOpp.opportunityName || matchedOpp.account}</div>
                                <div style={{ fontSize: '0.8125rem', color: T.inkMid }}>{matchedOpp.account} · {matchedOpp.stage}</div>
                                <div style={{ fontWeight: '700', fontSize: '0.875rem', color: T.info, marginTop: '0.25rem' }}>${(matchedOpp.arr || 0).toLocaleString()} Revenue</div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ background: `${T.warn}18`, border: `1px solid ${T.warn}40`, borderRadius: '8px', padding: '0.75rem 1rem', fontSize: '0.8125rem', color: T.warn }}>
                            No matching opportunity found. Link this event to a deal by logging it as an activity.
                        </div>
                    )}

                    {/* Deal Health */}
                    {health && (
                        <div>
                            <div style={{ fontSize: '0.625rem', fontWeight: '700', color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Deal Health</div>
                            <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '0.75rem 1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                    <span style={{ fontWeight: '800', fontSize: '1.5rem', color: healthColor }}>{health.score}</span>
                                    <span style={{ background: healthBg, color: healthColor, fontSize: '0.75rem', fontWeight: '700', padding: '0.2rem 0.625rem', borderRadius: '999px' }}>{health.score >= 70 ? 'Healthy' : health.score >= 40 ? 'At Risk' : 'Critical'}</span>
                                </div>
                                <div style={{ height: '6px', background: T.border, borderRadius: '3px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                                    <div style={{ height: '100%', width: health.score + '%', background: healthColor, borderRadius: '3px', transition: 'width 0.4s ease' }} />
                                </div>
                                {health.reasons.slice(0, 2).map((r, i) => (
                                    <div key={i} style={{ fontSize: '0.75rem', color: T.inkMid, marginTop: '0.25rem' }}>· {r}</div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Account details */}
                    {matchedAccount && (
                        <div>
                            <div style={{ fontSize: '0.625rem', fontWeight: '700', color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Account</div>
                            <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '0.75rem 1rem', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '0.5rem' }}>{/* minmax(0, …): a long value is cut off with "…", not widened past the panel (state §0.187) */}
                                {[
                                    ['Industry', matchedAccount.industry],
                                    ['Owner', matchedAccount.accountOwner],
                                    ['Size', matchedAccount.employeeCount ? matchedAccount.employeeCount + ' employees' : null],
                                    ['Website', matchedAccount.website],
                                ].filter(([, v]) => v).map(([label, value]) => (
                                    <div key={label}>
                                        <div style={{ fontSize: '0.625rem', fontWeight: '700', color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                                        <div style={{ fontSize: '0.8125rem', color: T.ink, fontWeight: '500', marginTop: '0.1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Contacts */}
                    {matchedOpp && (
                        <div>
                            <div style={{ fontSize: '0.625rem', fontWeight: '700', color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Contacts</div>
                            {matchedContacts.length === 0 ? (
                                <div style={{ fontSize: '0.8125rem', color: T.inkMuted, fontStyle: 'italic' }}>No contacts found for this account</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                                    {matchedContacts.map(c => (
                                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.5rem 0.75rem', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: '6px' }}>
                                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: `${T.info}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: '700', color: T.info, flexShrink: 0 }}>
                                                {(c.firstName?.[0] || '') + (c.lastName?.[0] || '')}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: T.ink }}>{c.firstName} {c.lastName}</div>
                                                <div style={{ fontSize: '0.6875rem', color: T.inkMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[c.title, c.email].filter(Boolean).join(' · ')}</div>
                                            </div>
                                            {c.phone && <div style={{ fontSize: '0.6875rem', color: T.inkMuted, flexShrink: 0 }}>{c.phone}</div>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Recent Activities */}
                    {matchedOpp && (
                        <div>
                            <div style={{ fontSize: '0.625rem', fontWeight: '700', color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Recent Activities</div>
                            {recentActivities.length === 0 ? (
                                <div style={{ fontSize: '0.8125rem', color: T.inkMuted, fontStyle: 'italic' }}>No activities logged yet</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                                    {recentActivities.map(a => (
                                        <div key={a.id} style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start', padding: '0.5rem 0.75rem', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: '6px' }}>
                                            <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: T.info, background: `${T.info}14`, padding: '0.15rem 0.375rem', borderRadius: '4px', whiteSpace: 'nowrap', flexShrink: 0 }}>{a.type}</div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '0.75rem', color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.notes || '—'}</div>
                                                <div style={{ fontSize: '0.6875rem', color: T.inkMuted, marginTop: '0.1rem' }}>{a.date}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Open Tasks */}
                    {matchedOpp && (
                        <div>
                            <div style={{ fontSize: '0.625rem', fontWeight: '700', color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Open Tasks</div>
                            {openTasks.length === 0 ? (
                                <div style={{ fontSize: '0.8125rem', color: T.inkMuted, fontStyle: 'italic' }}>No open tasks</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                                    {openTasks.map(t => (
                                        <div key={t.id} style={{ display: 'flex', gap: '0.625rem', alignItems: 'center', padding: '0.5rem 0.75rem', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: '6px' }}>
                                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: t.priority === 'High' ? T.danger : t.priority === 'Low' ? T.ok : T.warn, flexShrink: 0 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                                                <div style={{ fontSize: '0.6875rem', color: T.inkMuted }}>Due {t.dueDate || '—'}</div>
                                            </div>
                                            <span style={{ fontSize: '0.6875rem', color: T.inkMid, background: T.border, padding: '0.1rem 0.375rem', borderRadius: '4px', flexShrink: 0 }}>{t.type}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer actions */}
                <div style={{ padding: '1rem 1.5rem', borderTop: `1px solid ${T.border}`, display: 'flex', gap: '0.5rem', flexShrink: 0, background: T.surface }}>
                    <button onClick={() => { setMeetingPrepOpen(false); handleAddActivity(matchedOpp?.id || null); }}
                        style={{ flex: 1, padding: '0.5rem', border: 'none', borderRadius: '8px', background: '#1c1917', color: T.surface, fontSize: '0.8125rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                        + Log Activity
                    </button>
                    <button onClick={() => { setMeetingPrepOpen(false); setTaskRailId('new'); setTaskRailMode('new'); setEditingTask({ opportunityId: matchedOpp?.id || '', relatedTo: matchedOpp?.id || '' }); }}
                        style={{ flex: 1, padding: '0.5rem', border: `1px solid ${T.border}`, borderRadius: '8px', background: T.border, color: T.inkMuted, fontSize: '0.8125rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                        + Add Task
                    </button>
                </div>
            </div>
        </>
    );
}
