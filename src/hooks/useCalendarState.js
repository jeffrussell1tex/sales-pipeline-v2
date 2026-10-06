import { useState } from 'react';
import { useOrgBoundState, resetAllOf } from './useOrgBoundState';
import { isoLocal, todayLocal } from '../utils/dateLocal';

export function useCalendarState() {
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
    // (?calconnect=success|error) — used to show a toast/banner in the Calendar tab
    const [calConnectResult, setCalConnectResult] = useOrgBoundState(resets, null); // 'success' | 'error' | null

    return {
        resetOnOrgSwitch: resetAllOf(resets),
        calendarEvents, setCalendarEvents,
        calendarLoading, setCalendarLoading,
        calendarError, setCalendarError,
        calendarConnected, setCalendarConnected,
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
        calConnectResult, setCalConnectResult,
    };
}
