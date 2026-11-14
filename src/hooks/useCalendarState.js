import { useState, useEffect } from 'react';
import { useOrgBoundState, resetAllOf } from './useOrgBoundState';
import { isoLocal, todayLocal } from '../utils/dateLocal';

// The events of a calendar not read in the org on screen: one list, the same every render, so nothing that depends on
// the events runs again for it.
const NO_EVENTS = [];

export function useCalendarState(activeOrgId) {
    // The values below that hold the org's events, connections, deals or a rep
    // belong to the org on screen (state §0.174): registered with
    // useOrgBoundState, and put back by resetOnOrgSwitch when the org switches.
    // The view's choices (the view, the offset, the toggles, the provider and the
    // log-from-calendar dates) stay plain useState.
    const resets = [];
    // Calendar strip
    const [calendarEvents, setCalendarEvents] = useOrgBoundState(resets, []);
    const [calendarLoading, setCalendarLoading] = useOrgBoundState(resets, false);
    const [calendarError, setCalendarError] = useOrgBoundState(resets, null);
    const [calendarConnected, setCalendarConnected] = useOrgBoundState(resets, false);
    // A read landed in this org (state §0.249, review fixes, round 3): until one has, no screen draws "not connected" —
    // calendarConnected's false is only its starting value. Put back with it on a switch.
    const [calendarRead, setCalendarRead] = useOrgBoundState(resets, false);
    // The org the strip above was put back for (state §0.249, review fixes, round 4). App's switch effect puts the strip
    // back only after the switch's own render has painted, so that render still holds the last org's read: its "not
    // connected", its events, its error, its read in flight. Until this names the org on screen, every screen gets a
    // calendar not read in it ("Checking…", never Connect, no events, no Connected). It moves in this hook's effect,
    // in the same commit as the reset. The reset never puts it back.
    const [calendarStripOrg, setCalendarStripOrg] = useState(activeOrgId);
    useEffect(() => { setCalendarStripOrg(activeOrgId); }, [activeOrgId]);
    const calendarHere = !!activeOrgId && calendarStripOrg === activeOrgId;

    // Calendar view
    const [calView, setCalView] = useState('week');
    const [calOffset, setCalOffset] = useState(0);
    const [showCalConfig, setShowCalConfig] = useOrgBoundState(resets, false);
    const [calShowGcal, setCalShowGcal] = useState(true);
    const [calShowCalls, setCalShowCalls] = useState(true);
    const [calShowMeetings, setCalShowMeetings] = useState(true);
    const [calShowWeekends, setCalShowWeekends] = useState(true);
    const [calRepFilter, setCalRepFilter] = useOrgBoundState(resets, 'all');
    const [calProvider, setCalProvider] = useState('google');

    // Log from Calendar
    const [logFromCalOpen, setLogFromCalOpen] = useOrgBoundState(resets, false);
    const [logFromCalDateFrom, setLogFromCalDateFrom] = useState(() => {
        const d = new Date(); d.setDate(d.getDate() - 7); return isoLocal(d);
    });
    const [logFromCalDateTo, setLogFromCalDateTo] = useState(() => todayLocal());
    const [logFromCalEvents, setLogFromCalEvents] = useOrgBoundState(resets, []);
    const [logFromCalLoading, setLogFromCalLoading] = useOrgBoundState(resets, false);
    const [logFromCalError, setLogFromCalError] = useOrgBoundState(resets, null);
    const [loggedCalendarIds, setLoggedCalendarIds] = useOrgBoundState(resets, new Set());
    const [logFromCalLinkingId, setLogFromCalLinkingId] = useOrgBoundState(resets, null);
    const [logFromCalOppMap, setLogFromCalOppMap] = useOrgBoundState(resets, {});

    // Meeting prep
    const [meetingPrepEvent, setMeetingPrepEvent] = useOrgBoundState(resets, null);
    const [meetingPrepOpen, setMeetingPrepOpen] = useOrgBoundState(resets, false);
    const [meetingPrepOppId, setMeetingPrepOppId] = useOrgBoundState(resets, null);

    // ── Calendar connections (loaded from /calendar-connections on mount) ──────
    // userConnections: array of { id, provider, calendarEmail, connectedAt }
    // orgConnections:  array of { id, provider, calendarName, calendarEmail, connectedAt }
    const [userCalConnections, setUserCalConnections] = useOrgBoundState(resets, []);
    const [orgCalConnections, setOrgCalConnections] = useOrgBoundState(resets, []);
    const [calConnectionsLoading, setCalConnectionsLoading] = useOrgBoundState(resets, false);
    const [calConnectionsError, setCalConnectionsError] = useOrgBoundState(resets, null);

    // Tracks which provider + scope is currently being disconnected (for spinner state)
    // e.g. { id: 'ucal_123', scope: 'user' } or null
    const [calDisconnecting, setCalDisconnecting] = useOrgBoundState(resets, null);

    // Set when the app lands back from the OAuth callback redirect
    // (?calconnect=success|error) — used to show a toast/banner in the Calendar tab. Handed out under the strip's tag
    // (state §0.249, review fixes, last pass): the switch's own render never draws the last org's outcome.
    const [calConnectResult, setCalConnectResult] = useOrgBoundState(resets, null); // 'success' | 'error' | null

    return {
        resetOnOrgSwitch: resetAllOf(resets),
        // The strip as the screens see it: the org's own, or a calendar not read in it (round 4).
        calendarEvents: calendarHere ? calendarEvents : NO_EVENTS, setCalendarEvents,
        calendarLoading: calendarHere && calendarLoading, setCalendarLoading,
        calendarError: calendarHere ? calendarError : null, setCalendarError,
        calendarConnected: calendarHere && calendarConnected, setCalendarConnected,
        calendarRead: calendarHere && calendarRead, setCalendarRead,
        calView, setCalView,
        calOffset, setCalOffset,
        showCalConfig, setShowCalConfig,
        calShowGcal, setCalShowGcal,
        calShowCalls, setCalShowCalls,
        calShowMeetings, setCalShowMeetings,
        calShowWeekends, setCalShowWeekends,
        calRepFilter, setCalRepFilter,
        calProvider, setCalProvider,
        logFromCalOpen, setLogFromCalOpen,
        logFromCalDateFrom, setLogFromCalDateFrom,
        logFromCalDateTo, setLogFromCalDateTo,
        logFromCalEvents, setLogFromCalEvents,
        logFromCalLoading, setLogFromCalLoading,
        logFromCalError, setLogFromCalError,
        loggedCalendarIds, setLoggedCalendarIds,
        logFromCalLinkingId, setLogFromCalLinkingId,
        logFromCalOppMap, setLogFromCalOppMap,
        meetingPrepEvent, setMeetingPrepEvent,
        meetingPrepOpen, setMeetingPrepOpen,
        meetingPrepOppId, setMeetingPrepOppId,
        // Connections
        userCalConnections, setUserCalConnections,
        orgCalConnections, setOrgCalConnections,
        calConnectionsLoading, setCalConnectionsLoading,
        calConnectionsError, setCalConnectionsError,
        calDisconnecting, setCalDisconnecting,
        // The connect-return outcome as the screens see it: the org's own, or none (last pass) — the panel's line,
        // Company calendar and Connected apps never say the last org's Connect in the new org's first frame.
        calConnectResult: calendarHere ? calConnectResult : null, setCalConnectResult,
    };
}
