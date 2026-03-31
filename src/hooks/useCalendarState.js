import { useState } from 'react';

export function useCalendarState() {
    // Calendar strip
    const [calendarEvents, setCalendarEvents] = useState([]);
    const [calendarLoading, setCalendarLoading] = useState(false);
    const [calendarError, setCalendarError] = useState(null);
    const [calendarConnected, setCalendarConnected] = useState(false);

    // Calendar view
    const [calView, setCalView] = useState('week');
    const [calOffset, setCalOffset] = useState(0);
    const [showCalConfig, setShowCalConfig] = useState(false);
    const [calShowGcal, setCalShowGcal] = useState(true);
    const [calShowCalls, setCalShowCalls] = useState(true);
    const [calShowMeetings, setCalShowMeetings] = useState(true);
    const [calShowWeekends, setCalShowWeekends] = useState(true);
    const [calRepFilter, setCalRepFilter] = useState('all');
    const [calProvider, setCalProvider] = useState('google');

    // Log from Calendar
    const [logFromCalOpen, setLogFromCalOpen] = useState(false);
    const [logFromCalDateFrom, setLogFromCalDateFrom] = useState(() => {
        const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0];
    });
    const [logFromCalDateTo, setLogFromCalDateTo] = useState(() =>
        [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-')
    );
    const [logFromCalEvents, setLogFromCalEvents] = useState([]);
    const [logFromCalLoading, setLogFromCalLoading] = useState(false);
    const [logFromCalError, setLogFromCalError] = useState(null);
    const [loggedCalendarIds, setLoggedCalendarIds] = useState(new Set());
    const [logFromCalLinkingId, setLogFromCalLinkingId] = useState(null);
    const [logFromCalOppMap, setLogFromCalOppMap] = useState({});

    // Meeting prep
    const [meetingPrepEvent, setMeetingPrepEvent] = useState(null);
    const [meetingPrepOpen, setMeetingPrepOpen] = useState(false);
    const [meetingPrepOppId, setMeetingPrepOppId] = useState(null);

    // ── Calendar connections (loaded from /calendar-connections on mount) ──────
    // userConnections: array of { id, provider, calendarEmail, connectedAt }
    // orgConnections:  array of { id, provider, calendarName, calendarEmail, connectedAt }
    const [userCalConnections, setUserCalConnections] = useState([]);
    const [orgCalConnections, setOrgCalConnections] = useState([]);
    const [calConnectionsLoading, setCalConnectionsLoading] = useState(false);
    const [calConnectionsError, setCalConnectionsError] = useState(null);

    // Tracks which provider + scope is currently being disconnected (for spinner state)
    // e.g. { id: 'ucal_123', scope: 'user' } or null
    const [calDisconnecting, setCalDisconnecting] = useState(null);

    // Set when the app lands back from the OAuth callback redirect
    // (?calconnect=success|error) — used to show a toast/banner in the Calendar tab
    const [calConnectResult, setCalConnectResult] = useState(null); // 'success' | 'error' | null

    return {
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
