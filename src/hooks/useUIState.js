import { useState } from 'react';
import { useOrgBoundState, resetAllOf } from './useOrgBoundState';
import { safeStorage } from '../utils/storage';

export function useUIState() {
    // The values below that hold a record, an id, a name or a form belong to the
    // org on screen (state §0.174): registered with useOrgBoundState, and put
    // back by resetOnOrgSwitch when the org switches. The tab, the device and the
    // view preferences (sorts, view modes, the feed's filter) stay plain useState.
    const resets = [];
    const [activeTab, setActiveTab] = useState('home');
    const [activePipelineId, setActivePipelineId] = useOrgBoundState(resets, 'default');
    const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);

    // QuickLog
    const [quickLogOpen, setQuickLogOpen] = useOrgBoundState(resets, false);
    const [quickLogForm, setQuickLogForm] = useOrgBoundState(resets, { type: 'Call', notes: '', opportunityId: '', contactId: '', contactSearch: '', addToCalendar: false });
    const [quickLogContactResults, setQuickLogContactResults] = useOrgBoundState(resets, []);
    const [followUpPrompt, setFollowUpPrompt] = useOrgBoundState(resets, null);

    // Header
    const [notifications, setNotifications] = useOrgBoundState(resets, []);
    const [showNotifications, setShowNotifications] = useOrgBoundState(resets, false);
    const [globalSearch, setGlobalSearch] = useOrgBoundState(resets, '');
    const [showSearchResults, setShowSearchResults] = useOrgBoundState(resets, false);
    const [showProfilePanel, setShowProfilePanel] = useState(false);
    const [myProfile, setMyProfile] = useOrgBoundState(resets, null);
    const [profileForm, setProfileForm] = useOrgBoundState(resets, { firstName: '', lastName: '', email: '', phone: '', title: '' });

    // Viewing/filtering (managers)
    const [viewingRep, setViewingRep] = useOrgBoundState(resets, null);
    const [viewingTeam, setViewingTeam] = useOrgBoundState(resets, null);
    const [viewingTerritory, setViewingTerritory] = useOrgBoundState(resets, null);

    // Detail panels
    const [contactShowAllDeals, setContactShowAllDeals] = useOrgBoundState(resets, false);
    const [accShowAllClosed, setAccShowAllClosed] = useOrgBoundState(resets, false);
    const [accShowAllContacts, setAccShowAllContacts] = useOrgBoundState(resets, false);
    const [viewingTask, setViewingTask] = useOrgBoundState(resets, null);

    // Tab UI state
    const [expandedAccounts, setExpandedAccounts] = useOrgBoundState(resets, {});
    const [expandedIndustry, setExpandedIndustry] = useOrgBoundState(resets, null);
    const [accountsSortDir, setAccountsSortDir] = useState('asc');
    const [accountsViewMode, setAccountsViewMode] = useState('compact');
    const [selectedAccounts, setSelectedAccounts] = useOrgBoundState(resets, []);
    const [contactsSortBy, setContactsSortBy] = useState('lastName');
    const [selectedContacts, setSelectedContacts] = useOrgBoundState(resets, []);
    const [feedFilter, setFeedFilter] = useState('all');
    const [feedLastRead, setFeedLastRead] = useState(() => {
        try { return safeStorage.getItem('feedLastRead') || new Date(0).toISOString(); } catch(e) { return new Date(0).toISOString(); }
    });

    // Pipeline/reports sort
    const [pipelineSortField, setPipelineSortField] = useState('closeDate');
    const [pipelineSortDir, setPipelineSortDir] = useState('asc');
    const [quotaForecastFilter, setQuotaForecastFilter] = useOrgBoundState(resets, []);
    const [commissionsFilter, setCommissionsFilter] = useOrgBoundState(resets, []);
    const [reportOppSortField, setReportOppSortField] = useState('closeDate');
    const [reportOppSortDir, setReportOppSortDir] = useState('asc');

    // Settings/misc UI
    const [settingsView, setSettingsView] = useOrgBoundState(resets, 'menu');
    const [tasksExpandedSections, setTasksExpandedSections] = useState({
        inProcess: false, today: true, thisWeek: false, thisMonth: false, all: false, completed: false
    });
    const [newPainPointInput, setNewPainPointInput] = useOrgBoundState(resets, '');
    const [newVerticalMarketInput, setNewVerticalMarketInput] = useOrgBoundState(resets, '');
    const [auditSearch, setAuditSearch] = useOrgBoundState(resets, '');
    const [auditEntityFilter, setAuditEntityFilter] = useOrgBoundState(resets, 'all');
    const [auditActionFilter, setAuditActionFilter] = useOrgBoundState(resets, 'all');

    // Cross-tab deep link filters
    const [accountsDeepFilter, setAccountsDeepFilter] = useOrgBoundState(resets, null); // e.g. { accountType: 'Enterprise' }

    // Export/import
    const [exportingCSV, setExportingCSV] = useState(null);
    const [exportingBackup, setExportingBackup] = useState(false);
    const [restoringBackup, setRestoringBackup] = useState(false);
    const [dbOffline, setDbOffline] = useOrgBoundState(resets, false);

    return {
        resetOnOrgSwitch: resetAllOf(resets),
        activeTab, setActiveTab,
        activePipelineId, setActivePipelineId,
        isMobile, setIsMobile,
        quickLogOpen, setQuickLogOpen,
        quickLogForm, setQuickLogForm,
        quickLogContactResults, setQuickLogContactResults,
        followUpPrompt, setFollowUpPrompt,
        notifications, setNotifications,
        showNotifications, setShowNotifications,
        globalSearch, setGlobalSearch,
        showSearchResults, setShowSearchResults,
        showProfilePanel, setShowProfilePanel,
        myProfile, setMyProfile,
        profileForm, setProfileForm,
        viewingRep, setViewingRep,
        viewingTeam, setViewingTeam,
        viewingTerritory, setViewingTerritory,
        contactShowAllDeals, setContactShowAllDeals,
        accShowAllClosed, setAccShowAllClosed,
        accShowAllContacts, setAccShowAllContacts,
        viewingTask, setViewingTask,
        expandedAccounts, setExpandedAccounts,
        expandedIndustry, setExpandedIndustry,
        accountsSortDir, setAccountsSortDir,
        accountsViewMode, setAccountsViewMode,
        selectedAccounts, setSelectedAccounts,
        contactsSortBy, setContactsSortBy,
        selectedContacts, setSelectedContacts,
        feedFilter, setFeedFilter,
        feedLastRead, setFeedLastRead,
        pipelineSortField, setPipelineSortField,
        pipelineSortDir, setPipelineSortDir,
        quotaForecastFilter, setQuotaForecastFilter,
        commissionsFilter, setCommissionsFilter,
        reportOppSortField, setReportOppSortField,
        reportOppSortDir, setReportOppSortDir,
        settingsView, setSettingsView,
        tasksExpandedSections, setTasksExpandedSections,
        newPainPointInput, setNewPainPointInput,
        newVerticalMarketInput, setNewVerticalMarketInput,
        auditSearch, setAuditSearch,
        auditEntityFilter, setAuditEntityFilter,
        auditActionFilter, setAuditActionFilter,
        accountsDeepFilter, setAccountsDeepFilter,
        exportingCSV, setExportingCSV,
        exportingBackup, setExportingBackup,
        restoringBackup, setRestoringBackup,
        dbOffline, setDbOffline,
    };
}
