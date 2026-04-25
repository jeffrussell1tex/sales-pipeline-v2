import { useState } from 'react';
import { safeStorage } from '../utils/storage';

export function useUIState() {
    const [activeTab, setActiveTab] = useState('home');
    const [activePipelineId, setActivePipelineId] = useState('default');
    const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);

    // QuickLog
    const [quickLogOpen, setQuickLogOpen] = useState(false);
    const [quickLogForm, setQuickLogForm] = useState({ type: 'Call', notes: '', opportunityId: '', contactId: '', contactSearch: '', addToCalendar: false });
    const [quickLogContactResults, setQuickLogContactResults] = useState([]);
    const [followUpPrompt, setFollowUpPrompt] = useState(null);

    // Header
    const [notifications, setNotifications] = useState([]);
    const [showNotifications, setShowNotifications] = useState(false);
    const [globalSearch, setGlobalSearch] = useState('');
    const [showSearchResults, setShowSearchResults] = useState(false);
    const [showProfilePanel, setShowProfilePanel] = useState(false);
    const [myProfile, setMyProfile] = useState(null);
    const [profileForm, setProfileForm] = useState({ firstName: '', lastName: '', email: '', phone: '', title: '' });

    // Viewing/filtering (managers)
    const [viewingRep, setViewingRep] = useState(null);
    const [viewingTeam, setViewingTeam] = useState(null);
    const [viewingTerritory, setViewingTerritory] = useState(null);

    // Detail panels
    const [viewingContact, setViewingContact] = useState(null);
    const [contactShowAllDeals, setContactShowAllDeals] = useState(false);
    const [viewingAccount, setViewingAccount] = useState(null);
    const [accShowAllClosed, setAccShowAllClosed] = useState(false);
    const [accShowAllContacts, setAccShowAllContacts] = useState(false);
    const [viewingTask, setViewingTask] = useState(null);

    // Tab UI state
    const [expandedAccounts, setExpandedAccounts] = useState({});
    const [expandedIndustry, setExpandedIndustry] = useState(null);
    const [accountsSortDir, setAccountsSortDir] = useState('asc');
    const [accountsViewMode, setAccountsViewMode] = useState('compact');
    const [selectedAccounts, setSelectedAccounts] = useState([]);
    const [contactsSortBy, setContactsSortBy] = useState('lastName');
    const [selectedContacts, setSelectedContacts] = useState([]);
    const [feedFilter, setFeedFilter] = useState('all');
    const [feedLastRead, setFeedLastRead] = useState(() => {
        try { return safeStorage.getItem('feedLastRead') || new Date(0).toISOString(); } catch(e) { return new Date(0).toISOString(); }
    });

    // Pipeline/reports sort
    const [pipelineSortField, setPipelineSortField] = useState('closeDate');
    const [pipelineSortDir, setPipelineSortDir] = useState('asc');
    const [quotaForecastFilter, setQuotaForecastFilter] = useState([]);
    const [commissionsFilter, setCommissionsFilter] = useState([]);
    const [reportOppSortField, setReportOppSortField] = useState('closeDate');
    const [reportOppSortDir, setReportOppSortDir] = useState('asc');

    // Settings/misc UI
    const [settingsView, setSettingsView] = useState('menu');
    const [tasksExpandedSections, setTasksExpandedSections] = useState({
        inProcess: false, today: true, thisWeek: false, thisMonth: false, all: false, completed: false
    });
    const [newPainPointInput, setNewPainPointInput] = useState('');
    const [newVerticalMarketInput, setNewVerticalMarketInput] = useState('');
    const [auditSearch, setAuditSearch] = useState('');
    const [auditEntityFilter, setAuditEntityFilter] = useState('all');
    const [auditActionFilter, setAuditActionFilter] = useState('all');

    // Cross-tab deep link filters
    const [accountsDeepFilter, setAccountsDeepFilter] = useState(null); // e.g. { accountType: 'Enterprise' }

    // Export/import
    const [exportingCSV, setExportingCSV] = useState(null);
    const [exportingBackup, setExportingBackup] = useState(false);
    const [restoringBackup, setRestoringBackup] = useState(false);
    const [dbOffline, setDbOffline] = useState(false);

    return {
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
        viewingContact, setViewingContact,
        contactShowAllDeals, setContactShowAllDeals,
        viewingAccount, setViewingAccount,
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
