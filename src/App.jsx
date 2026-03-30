import React, { useState, useEffect, useRef } from 'react';
import { useUser, useClerk, useAuth, useOrganization, useOrganizationList, OrganizationSwitcher, SignIn } from '@clerk/clerk-react';
import { safeStorage, dbFetch, waitForToken } from './utils/storage';
import { initialOpportunities, stages, productOptions } from './utils/constants';
import CsvImportModal from './components/modals/CsvImportModal';
import { useSettings } from './hooks/useSettings';
import { useOpportunities } from './hooks/useOpportunities';
import { useAccounts } from './hooks/useAccounts';
import { useContacts } from './hooks/useContacts';
import { useTasks } from './hooks/useTasks';
import { useActivities } from './hooks/useActivities';
import { AppProvider, useApp } from './AppContext';
import SalesManagerTab from './Tabs/SalesManagerTab';
import ReportsTab from './Tabs/ReportsTab';
import ContactsTab from './Tabs/ContactsTab';
import LeadsTab from './Tabs/LeadsTab';
import AccountsTab from './Tabs/AccountsTab';
import OpportunitiesTab from './Tabs/OpportunitiesTab';
import PipelineTab from './Tabs/PipelineTab';
import TasksTab from './Tabs/TasksTab';
import HomeTab from './Tabs/HomeTab';
import ViewingContactPanel from './components/panels/ViewingContactPanel';
import ViewingAccountPanel from './components/panels/ViewingAccountPanel';
import ViewingTaskPanel from './components/panels/ViewingTaskPanel';
import SettingsTab from './Tabs/SettingsTab';
import LeadImportModal from './components/modals/LeadImportModal';
import OutlookImportModal from './components/modals/OutlookImportModal';
import PipelinesSettingsPanel from './components/modals/PipelinesSettingsPanel';
import LostReasonModal from './components/modals/LostReasonModal';
import ActivityModal from './components/modals/ActivityModal';
import OpportunityModal from './components/modals/OpportunityModal';
import ContactModal, { NestedNewContactForm, NestedNewAccountForm } from './components/modals/ContactModal';
import AccountModal from './components/modals/AccountModal';
import TaskModal from './components/modals/TaskModal';
import UserModal from './components/modals/UserModal';
import TaskItem from './components/ui/TaskItem';
import TimePicker from './components/ui/TimePicker';
import ViewingBar, { SliceDropdown } from './components/ui/ViewingBar';
import AnalyticsDashboard from './components/ui/AnalyticsDashboard';
import AppHeader from './components/layout/AppHeader';
import QuickLogFab from './components/layout/QuickLogFab';
import ModalLayer from './components/layout/ModalLayer';
import LeadForm from './components/LeadForm';
import FunnelView from './components/FunnelView';
import KanbanView from './components/KanbanView';
import QuotaRepCard from './components/QuotaRepCard';
import { useModalState } from './hooks/useModalState';
import { useUIState } from './hooks/useUIState';
import { useCalendarState } from './hooks/useCalendarState';
import { useUserHandlers } from './hooks/useUserHandlers';
import ErrorBoundary from './components/ErrorBoundary';


function App() {
    // Clerk auth — powered by @clerk/clerk-react
    const { user: clerkUser, isLoaded: clerkLoaded } = useUser();
    const { signOut } = useClerk();
    const { getToken } = useAuth();
    const { organization, isLoaded: orgLoaded } = useOrganization();
    const prevOrgIdRef = React.useRef(null);
    const { userMemberships, setActive, isLoaded: orgListLoaded } = useOrganizationList({
        userMemberships: { infinite: true },
    });

    // Auto-activate the user's first org if none is active
    React.useEffect(() => {
        if (!orgListLoaded || !clerkLoaded) return;
        if (organization) return; // already active
        const firstMembership = userMemberships?.data?.[0];
        if (firstMembership?.organization?.id) {
            setActive({ organization: firstMembership.organization.id });
        }
    }, [orgListLoaded, clerkLoaded, organization, userMemberships?.data]);

    // Guard: prevents settings useEffect from writing to DB before DB data has loaded.
    // Without this, the effect fires on mount with localStorage/default values and
    // overwrites the DB — the #1 cause of data loss / "self-deleting" content.
    // settingsReady managed by useSettings hook

    // Make getToken available to dbFetch utility ONLY when org is active
    // organizationId in getToken ensures Clerk includes org_id in the JWT
    useEffect(() => {
        if (!organization?.id) {
            // Clear token getter so dbFetch won't fire without an org
            window.__getClerkToken = null;
            return;
        }
        window.__getClerkToken = () => getToken({ organizationId: organization.id });
    }, [getToken, organization]);
    const clerkUserMeta = clerkUser?.publicMetadata || {};
    const currentUser = clerkUser
        ? (((clerkUser.firstName || '') + ' ' + (clerkUser.lastName || '')).trim() || clerkUser.emailAddresses?.[0]?.emailAddress || 'User')
        : '';
    const [userRole, setUserRole] = React.useState('User');

    React.useEffect(() => {
        if (clerkUser) {
            const meta = clerkUser.publicMetadata || {};
            setUserRole(meta.role || 'User');
            window.clerkCurrentUser = currentUser;
            window.clerkUserRole = meta.role || 'User';
            window.clerkManagedReps = meta.managedReps || [];
        }
    }, [clerkUser]);
    // ── State hooks ──
    const modalState = useModalState();
    const uiState = useUIState();
    const calState = useCalendarState();

    // Destructure for use in this component
    const {
        activeTab, setActiveTab, activePipelineId, setActivePipelineId,
        isMobile, setIsMobile,
        quickLogOpen, setQuickLogOpen, quickLogForm, setQuickLogForm,
        quickLogContactResults, setQuickLogContactResults,
        followUpPrompt, setFollowUpPrompt,
        notifications, setNotifications,
        showNotifications, setShowNotifications,
        globalSearch, setGlobalSearch, showSearchResults, setShowSearchResults,
        showProfilePanel, setShowProfilePanel, myProfile, setMyProfile,
        profileForm, setProfileForm,
        viewingRep, setViewingRep, viewingTeam, setViewingTeam, viewingTerritory, setViewingTerritory,
        viewingContact, setViewingContact, contactShowAllDeals, setContactShowAllDeals,
        viewingAccount, setViewingAccount, accShowAllClosed, setAccShowAllClosed, accShowAllContacts, setAccShowAllContacts,
        viewingTask, setViewingTask,
        expandedAccounts, setExpandedAccounts, expandedIndustry, setExpandedIndustry,
        accountsSortDir, setAccountsSortDir, accountsViewMode, setAccountsViewMode, selectedAccounts, setSelectedAccounts,
        contactsSortBy, setContactsSortBy, selectedContacts, setSelectedContacts,
        feedFilter, setFeedFilter, feedLastRead, setFeedLastRead,
        pipelineSortField, setPipelineSortField, pipelineSortDir, setPipelineSortDir,
        quotaForecastFilter, setQuotaForecastFilter, commissionsFilter, setCommissionsFilter,
        reportOppSortField, setReportOppSortField, reportOppSortDir, setReportOppSortDir,
        settingsView, setSettingsView, tasksExpandedSections, setTasksExpandedSections,
        newPainPointInput, setNewPainPointInput, newVerticalMarketInput, setNewVerticalMarketInput,
        auditSearch, setAuditSearch, auditEntityFilter, setAuditEntityFilter, auditActionFilter, setAuditActionFilter,
        exportingCSV, setExportingCSV, exportingBackup, setExportingBackup, restoringBackup, setRestoringBackup,
        dbOffline, setDbOffline,
    } = uiState;

    const {
        showModal, setShowModal, showSpiffClaimModal, setShowSpiffClaimModal,
        spiffClaimContext, setSpiffClaimContext,
        showAccountModal, setShowAccountModal, showUserModal, setShowUserModal,
        showTaskModal, setShowTaskModal, showContactModal, setShowContactModal,
        showActivityModal, setShowActivityModal, showShortcuts, setShowShortcuts,
        showCsvImportModal, setShowCsvImportModal, showLeadImportModal, setShowLeadImportModal,
        showOutlookImportModal, setShowOutlookImportModal, csvImportType, setCsvImportType,
        editingOpp, setEditingOpp, editingAccount, setEditingAccount, editingSubAccount, setEditingSubAccount,
        editingUser, setEditingUser, editingTask, setEditingTask, editingContact, setEditingContact,
        editingActivity, setEditingActivity, activityInitialContext, setActivityInitialContext,
        parentAccountForSub, setParentAccountForSub,
        lastCreatedAccountName, setLastCreatedAccountName,
        accountCreatedFromOppForm, setAccountCreatedFromOppForm,
        pendingOppFormData, setPendingOppFormData,
        lastCreatedRepName, setLastCreatedRepName,
        confirmModal, setConfirmModal, lostReasonModal, setLostReasonModal,
        notesPopover, setNotesPopover, undoToast, setUndoToast,
        taskReminderPopup, setTaskReminderPopup,
        taskReminderSnoozeH, setTaskReminderSnoozeH, taskReminderSnoozeM, setTaskReminderSnoozeM,
        taskDuePopup, setTaskDuePopup, taskDueQueue, setTaskDueQueue,
        taskDueSnoozeH, setTaskDueSnoozeH, taskDueSnoozeM, setTaskDueSnoozeM,
        dismissedDueTodayAlerts, setDismissedDueTodayAlerts,
        dismissedReminders, setDismissedReminders,
    } = modalState;

    const {
        calendarEvents, setCalendarEvents, calendarLoading, setCalendarLoading,
        calendarError, setCalendarError, calendarConnected, setCalendarConnected,
        calView, setCalView, calOffset, setCalOffset, showCalConfig, setShowCalConfig,
        calShowGcal, setCalShowGcal, calShowCalls, setCalShowCalls,
        calShowMeetings, setCalShowMeetings, calShowWeekends, setCalShowWeekends,
        calRepFilter, setCalRepFilter, calProvider, setCalProvider,
        logFromCalOpen, setLogFromCalOpen, logFromCalDateFrom, setLogFromCalDateFrom,
        logFromCalDateTo, setLogFromCalDateTo, logFromCalEvents, setLogFromCalEvents,
        logFromCalLoading, setLogFromCalLoading, logFromCalError, setLogFromCalError,
        loggedCalendarIds, setLoggedCalendarIds, logFromCalLinkingId, setLogFromCalLinkingId,
        logFromCalOppMap, setLogFromCalOppMap,
        meetingPrepEvent, setMeetingPrepEvent, meetingPrepOpen, setMeetingPrepOpen,
        meetingPrepOppId, setMeetingPrepOppId,
    } = calState;
    useEffect(() => {
        const onResize = () => setIsMobile(window.innerWidth < 640);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // ── Phase 1: Custom Hooks ─────────────────────────────────────────
    const {
        settings, setSettings, settingsReady,
        loadSettings, handleUpdateFiscalYearStart, handleAddTaskType,
    } = useSettings();

    // Dependency refs — populated after showConfirm/softDelete/addAudit are defined below
    const _addAuditRef    = useRef(null);
    const _showConfirmRef = useRef(null);
    const _softDeleteRef  = useRef(null);
    const _setUndoRef     = useRef(null);
    const _getQuarterRef    = useRef(null);
    const _getQuarterLabelRef = useRef(null);
    const _deps = {
        get addAudit()         { return _addAuditRef.current; },
        get showConfirm()      { return _showConfirmRef.current; },
        get softDelete()       { return _softDeleteRef.current; },
        get setUndoToast()     { return _setUndoRef.current; },
        get getQuarter()       { return _getQuarterRef.current; },
        get getQuarterLabel()  { return _getQuarterLabelRef.current; },
    };

    const {
        opportunities, setOpportunities,
        oppModalError, setOppModalError,
        oppModalSaving, setOppModalSaving,
        loadOpportunities,
        handleDelete, handleSave, completeLostSave,
    } = useOpportunities(_deps);

    const {
        accounts, setAccounts,
        accountModalError, setAccountModalError,
        accountModalSaving,
        setAccountModalSaving,
        loadAccounts, getSubAccounts,
        handleDeleteAccount, handleDeleteSubAccount, handleSaveAccount,
    } = useAccounts(_deps);

    const {
        contacts, setContacts,
        contactModalError, setContactModalError,
        contactModalSaving,
        setContactModalSaving,
        loadContacts,
        handleDeleteContact, handleSaveContact,
    } = useContacts(_deps);

    const {
        tasks, setTasks,
        taskModalError, setTaskModalError,
        taskModalSaving,
        setTaskModalSaving,
        calendarAddingTaskId, calendarAddFeedback,
        loadTasks,
        handleDeleteTask, handleSaveTask,
        handleCompleteTask, handleAddTaskToCalendar,
    } = useTasks(_deps);

    const {
        activities, setActivities,
        activityModalError, setActivityModalError,
        activityModalSaving,
        setActivityModalSaving,
        loadActivities,
        handleDeleteActivity, handleSaveActivity,
    } = useActivities({ showConfirm: (...a) => _showConfirmRef.current?.(...a) });

    const [leads, setLeads] = React.useState([]);
    const [spiffClaims, setSpiffClaims] = React.useState([]);

    // ── Core utility functions ──
    const showConfirm = (message, onConfirm, danger = true) => {
        setConfirmModal({ message, onConfirm, danger });
    };

    const addAudit = (action, entity, entityId, label, detail = '') => {
        const entry = {
            id: 'audit_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
            action, entity, entityId, label, detail,
            timestamp: new Date().toISOString(),
            author: currentUser || 'Unknown',
        };
        setSettings(prev => ({ ...prev, auditLog: [...(prev.auditLog || []), entry] }));
    };

    const softDelete = (label, deleteFunc, restoreFunc) => {
        if (undoToast) clearTimeout(undoToast.timerId);
        deleteFunc();
        const timerId = setTimeout(() => setUndoToast(null), 5000);
        setUndoToast({ label, restore: restoreFunc, timerId });
    };

    // Populate refs so data hooks can call these safely
    _addAuditRef.current    = addAudit;
    _showConfirmRef.current = showConfirm;
    _softDeleteRef.current  = softDelete;
    _setUndoRef.current     = setUndoToast;

    // Quota & Commission

      useEffect(() => {
    if (!clerkUser || !organization?.id) return; // Don't load until authenticated + org active
    const loadData = async () => {
        const checkOk = (r) => { if (!r.ok) { setDbOffline(true); throw new Error('HTTP ' + r.status); } setDbOffline(false); return r; };

        // Wait for Clerk token to be available before firing any DB calls
        await waitForToken();

        // ── Data loading delegated to hooks ──────────────────────────────
        loadOpportunities(setDbOffline);
        loadAccounts(setDbOffline);
        loadContacts(setDbOffline);
        loadTasks(setDbOffline);
        loadActivities(setDbOffline);

dbFetch('/.netlify/functions/leads')
    .then(checkOk).then(r => r.json())
    .then(data => setLeads(data.leads || []))
    .catch(err => console.error('Failed to load leads:', err));

// Settings + users loading delegated to useSettings hook
const orgSwitched = prevOrgIdRef.current && prevOrgIdRef.current !== organization?.id;
prevOrgIdRef.current = organization?.id || null;
loadSettings(clerkUser, orgSwitched);

// Load current user's own profile (notification prefs, etc.)
dbFetch('/.netlify/functions/users?me=true')
    .then(r => r.ok ? r.json() : null)
    .then(data => {
        if (data?.user) {
            setMyProfile(data.user);
            setProfileForm({
                firstName: data.user.firstName || '',
                lastName:  data.user.lastName  || '',
                email:     data.user.email     || '',
                phone:     data.user.phone     || '',
                title:     data.user.title     || '',
            });
        }
    })
    .catch(() => {});
    };
    loadData();
}, [clerkUser, organization]);

           

    // ── Global keyboard shortcuts ─────────────────────────────
    useEffect(() => {
        const handler = (e) => {
            const tag = document.activeElement?.tagName?.toLowerCase();
            const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || document.activeElement?.isContentEditable;

            // Escape — close topmost open thing
            if (e.key === 'Escape') {
                if (showShortcuts) { setShowShortcuts(false); return; }
                if (showActivityModal) { setShowActivityModal(false); return; }
                if (showModal) { setShowModal(false); setEditingOpp(null); return; }
                if (showAccountModal) { setShowAccountModal(false); setEditingAccount(null); return; }
                if (showContactModal) { setShowContactModal(false); setEditingContact(null); return; }
                if (showTaskModal) { setShowTaskModal(false); setEditingTask(null); return; }
                if (showUserModal) { setShowUserModal(false); setEditingUser(null); return; }
                if (showProfilePanel) { setShowProfilePanel(false); return; }
                if (confirmModal) { setConfirmModal(null); return; }
                if (notesPopover) { setNotesPopover(null); return; }
                if (undoToast) { clearTimeout(undoToast.timerId); setUndoToast(null); return; }
                if (showNotifications) { setShowNotifications(false); return; }
                if (showSearchResults) { setShowSearchResults(false); setGlobalSearch(''); return; }
                return;
            }

            // Don't fire shortcuts while typing
            if (isTyping) return;
            // Don't fire if any modal is open (except ? for help)
            const anyModalOpen = showModal || showAccountModal || showContactModal || showTaskModal || showUserModal || showActivityModal || confirmModal;

            if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
                e.preventDefault();
                setShowShortcuts(v => !v);
                return;
            }

            if (anyModalOpen) return;

            switch (e.key) {
                case 'n': case 'N':
                    e.preventDefault();
                    setEditingOpp(null); setShowModal(true);
                    break;
                case 'a': case 'A':
                    e.preventDefault();
                    setEditingAccount(null); setShowAccountModal(true);
                    break;
                case 'c': case 'C':
                    e.preventDefault();
                    setEditingContact(null); setShowContactModal(true);
                    break;
                case 't': case 'T':
                    e.preventDefault();
                    setEditingTask(null); setShowTaskModal(true);
                    break;
                case '1':
                    e.preventDefault(); setActiveTab('home'); break;
                case '2':
                    e.preventDefault(); setActiveTab('pipeline'); break;
                case '3':
                    e.preventDefault(); setActiveTab('opportunities'); break;
                case '4':
                    e.preventDefault(); setActiveTab('tasks'); break;
                case '5':
                    e.preventDefault(); setActiveTab('accounts'); break;
                case '6':
                    e.preventDefault(); setActiveTab('contacts'); break;
                case '7':
                    e.preventDefault(); setActiveTab('leads'); break;
                case '8':
                    e.preventDefault(); setActiveTab('reports'); break;
                case 'o': case 'O':
                    if (!['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) {
                        e.preventDefault(); setActiveTab('pipeline'); setTimeout(() => { setEditingOpp(null); setShowModal(true); }, 100);
                    }
                    break;
                case '/':
                    if (!e.metaKey && !e.ctrlKey && !['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) {
                        e.preventDefault();
                        setShowSearchResults(false);
                        setTimeout(() => { const el = document.querySelector('.global-search-input'); if (el) { el.focus(); el.select(); } }, 50);
                    }
                    break;
                case 'f': case 'F':
                    if (e.metaKey || e.ctrlKey) return; // let browser search through
                    e.preventDefault();
                    setShowSearchResults(false);
                    setTimeout(() => { const el = document.querySelector('.global-search-input'); if (el) { el.focus(); el.select(); } }, 50);
                    break;
                default: break;
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [showModal, showAccountModal, showContactModal, showTaskModal, showUserModal, showActivityModal,
        confirmModal, notesPopover, undoToast, showNotifications, showSearchResults, showShortcuts]);



    // Settings save effect managed by useSettings hook

    // Load spiff claims from DB on mount
    useEffect(() => {
        const load = async () => {
            await waitForToken();
            dbFetch('/.netlify/functions/spiff-claims')
                .then(r => r.json())
                .then(data => { if (data?.spiffClaims) setSpiffClaims(data.spiffClaims); })
                .catch(err => console.warn('spiff-claims load error:', err.message));
        };
        load();
    }, []);







    // Auto-fetch calendar events when the home tab is active and calendar is not yet loaded.
    // Uses a ref to ensure we only attempt once per session, not on every tab switch.
    const calendarFetchAttempted = useRef(false);
    useEffect(() => {
        if (activeTab === 'home' && !calendarFetchAttempted.current && !calendarLoading) {
            calendarFetchAttempted.current = true;
            fetchCalendarEvents();
        }
    }, [activeTab]);

    // Security: determine user role
    // Role derived from Clerk user metadata (set via Clerk dashboard)
    // Roles: Admin | Manager | User | ReadOnly
    const isAdmin = userRole === 'Admin';
    const isManager = userRole === 'Manager';
    const isReadOnly = userRole === 'ReadOnly';
    const canEdit = !isReadOnly;
    const canSeeAll = isAdmin || isManager;
    const canManageSettings = isAdmin;
    const canManageUsers = isAdmin;
    const canDeleteData = isAdmin || isManager;
    // Manager can see only reps assigned to them (stored in Clerk publicMetadata.managedReps)
    const managedReps = new Set(clerkUserMeta.managedReps || []);
    const isRepVisible = (repName) => {
        if (isAdmin) return true;
        if (isManager) return managedReps.size === 0 || managedReps.has(repName);
        return !repName || repName === currentUser;
    };

    // Field-level visibility helper
    const canViewField = (fieldKey) => {
        const fv = settings.fieldVisibility || {};
        const fieldRules = fv[fieldKey];
        if (!fieldRules) return true; // not configured = visible
        const role = userRole || 'User';
        return fieldRules[role] !== false;
    };

    // Filtered data based on role
    // ── Pipeline helpers ──────────────────────────────────────────────
    const allPipelines = (settings.pipelines && settings.pipelines.length > 0)
        ? settings.pipelines
        : [{ id: 'default', name: 'New Business', color: '#2563eb' }];
    const activePipeline = allPipelines.find(p => p.id === activePipelineId) || allPipelines[0];

    // Shared Viewing bar helpers — build option lists for Rep/Team/Territory
    const allRepNames = [...new Set((settings.users || []).filter(u => u.userType !== 'Manager' && u.userType !== 'Admin').map(u => u.name).filter(Boolean))].sort();
    const allTeamNames = [...new Set((settings.users || []).filter(u => u.team).map(u => u.team))].sort();
    const allTerritoryNames = [...new Set((settings.users || []).filter(u => u.territory).map(u => u.territory))].sort();
    const hasViewingSlicing = canSeeAll && (allRepNames.length > 1 || allTeamNames.length > 0 || allTerritoryNames.length > 0 || allPipelines.length > 1);

    // Apply Viewing bar rep/team/territory filter on top of role-based access
    const applyViewingFilter = (opps) => {
        if (viewingRep) return opps.filter(o => o.salesRep === viewingRep || o.assignedTo === viewingRep);
        if (viewingTeam) {
            const names = new Set((settings.users || []).filter(u => u.team === viewingTeam).map(u => u.name));
            return opps.filter(o => names.has(o.salesRep) || names.has(o.assignedTo));
        }
        if (viewingTerritory) {
            const names = new Set((settings.users || []).filter(u => u.territory === viewingTerritory).map(u => u.name));
            return opps.filter(o => names.has(o.salesRep) || names.has(o.assignedTo));
        }
        return opps;
    };

    const visibleOpportunities = applyViewingFilter(
        (opportunities || [])
        .filter(opp => isRepVisible(opp.salesRep))
        .filter(opp => (opp.pipelineId || 'default') === activePipeline.id)
    );
    const visibleAccounts = (accounts || [])
        .filter(acc => isRepVisible(acc.accountOwner))
        .filter(acc => !acc.parentAccountId && !acc.parentId);
    const visibleContacts = (contacts || []).filter(c => isRepVisible(c.assignedRep));
    const visibleTasks = (() => {
        let base = (tasks || []).filter(t => isRepVisible(t.assignedTo));
        if (viewingRep) base = base.filter(t => t.assignedTo === viewingRep);
        else if (viewingTeam) {
            const names = new Set((settings.users || []).filter(u => u.team === viewingTeam).map(u => u.name));
            base = base.filter(t => names.has(t.assignedTo));
        } else if (viewingTerritory) {
            const names = new Set((settings.users || []).filter(u => u.territory === viewingTerritory).map(u => u.name));
            base = base.filter(t => names.has(t.assignedTo));
        }
        return base;
    })();
    const visibleActivities = (activities || []).filter(a => {
        if (!a.opportunityId) return true;
        const opp = (opportunities || []).find(o => o.id === a.opportunityId);
        return !opp || isRepVisible(opp.salesRep);
    });

    const totalARR = visibleOpportunities.reduce((sum, opp) => sum + (parseFloat(opp.arr) || 0), 0);
    const activeOpps = visibleOpportunities.length;
    const avgARR = activeOpps > 0 ? totalARR / activeOpps : 0;
    
    // Calculate forecasted revenue by quarter
    const getQuarter = (dateString) => {
        const date = new Date(dateString);
        const month = date.getMonth() + 1; // 1-12
        const fiscalStart = parseInt(settings.fiscalYearStart) || 10;
        // How many months into the fiscal year is this date?
        // monthsIn = 0 means first month of FY, 1 = second, etc.
        const monthsIn = ((month - fiscalStart + 12) % 12);
        if (monthsIn < 3) return 'Q1';
        if (monthsIn < 6) return 'Q2';
        if (monthsIn < 9) return 'Q3';
        return 'Q4';
    };

    const getQuarterLabel = (quarter, dateString) => {
        const date = new Date(dateString);
        const month = date.getMonth() + 1;
        const year = date.getFullYear();
        const fiscalStart = parseInt(settings.fiscalYearStart) || 10;
        // Fiscal year number = calendar year of the fiscal year END
        // If fiscal starts Oct, then Oct 2025 → FY2026, Jan 2026 → FY2026
        // monthsIn tells how far into the FY we are
        const monthsIn = ((month - fiscalStart + 12) % 12);
        // The fiscal year "ends" 12 - fiscalStart months after Jan 1
        // If monthsIn puts us in the first part of the FY that spans into next cal year:
        // fiscalStart > 1 means the FY starts partway through the calendar year
        // months before fiscalStart belong to FY that started in PREVIOUS calendar year
        let fiscalYear;
        if (fiscalStart === 1) {
            fiscalYear = year; // Jan start = simple calendar year
        } else if (month >= fiscalStart) {
            fiscalYear = year + 1; // e.g. Oct 2025 → FY2026
        } else {
            fiscalYear = year; // e.g. Jan 2026 → FY2026 (same year as end)
        }
        return `FY${fiscalYear} ${quarter}`;
    };

    // Populate getQuarter refs now that the functions are defined
    _getQuarterRef.current      = getQuarter;
    _getQuarterLabelRef.current = getQuarterLabel;




    // KPI color helper - returns CSS class and tolerance color based on value
    const getKpiColor = (kpiId, value) => {
        const kpiDefs = settings.kpiConfig || [];
        const kpi = kpiDefs.find(k => k.id === kpiId);
        if (!kpi) return { className: 'primary', toleranceColor: null };
        const className = kpi.color || 'primary';
        if (kpi.tolerances && kpi.tolerances.length > 0) {
            const sorted = [...kpi.tolerances].sort((a, b) => b.min - a.min);
            for (const t of sorted) {
                if (value >= t.min) return { className, toleranceColor: t.color, toleranceLabel: t.label };
            }
            return { className, toleranceColor: sorted[sorted.length - 1].color };
        }
        return { className, toleranceColor: null };
    };

    const handleAddNew = () => {
        setEditingOpp(null);
        setShowModal(true);
    };

    const handleAddAccountFromOpportunity = (currentFormData) => {
        setShowModal(false);
        setShowAccountModal(true);
        setAccountCreatedFromOppForm(true);
        setPendingOppFormData(currentFormData || null);
        setEditingAccount(null);
        setEditingSubAccount(null);
        setParentAccountForSub(null);
        setLastCreatedAccountName(null);
    };

    const {
        userModalError, setUserModalError,
        userModalSaving, setUserModalSaving,
        handleAddUser, handleEditUser, handleDeleteUser, handleSaveUser,
    } = useUserHandlers({ setSettings, showConfirm: (...a) => _showConfirmRef.current?.(...a), showModal, setLastCreatedRepName, editingUser, setEditingUser, setShowUserModal });

    // handleUpdateFiscalYearStart managed by useSettings hook

    const toggleAccountExpanded = (accountId) => {
        setExpandedAccounts({
            ...expandedAccounts,
            [accountId]: !expandedAccounts[accountId]
        });
    };

    const handleAddTask = () => {
        setEditingTask(null);
        setShowTaskModal(true);
    };

    const handleEditTask = (task) => {
        setEditingTask(task);
        setShowTaskModal(true);
    };

    // handleDeleteTask managed by useTasks hook


    // handleSaveTask managed by useTasks hook

    // handleCompleteTask managed by useTasks hook

    // handleAddTaskType managed by useSettings hook


    // handleAddTaskToCalendar managed by useTasks hook

    const handleAddContact = () => {
        setEditingContact(null);
        setShowContactModal(true);
    };

    const handleEditContact = (contact) => {
        setEditingContact(contact);
        setShowContactModal(true);
    };

    // handleDeleteContact managed by useContacts hook


    // handleSaveContact managed by useContacts hook

    const handleEdit = (opp) => {
        setEditingOpp(opp);
        setShowModal(true);
    };

    // handleDelete (opportunities) managed by useOpportunities hook


        // handleSave managed by useOpportunities hook

    // completeLostSave managed by useOpportunities hook

    const handleAddAccount = () => {
        setEditingAccount(null);
        setEditingSubAccount(null);
        setParentAccountForSub(null);
        setShowAccountModal(true);
    };

    const handleAddSubAccount = (parentAccount) => {
        setEditingAccount(null);
        setEditingSubAccount(null);
        setParentAccountForSub(parentAccount);
        setShowAccountModal(true);
    };
    // getSubAccounts managed by useAccounts hook

    const handleEditAccount = (account, isSubAccount = false) => {
        if (isSubAccount) {
            setEditingSubAccount(account);
            setEditingAccount(null);
        } else {
            setEditingAccount(account);
            setEditingSubAccount(null);
        }
        setParentAccountForSub(null);
        setShowAccountModal(true);
    };

    // handleDeleteAccount managed by useAccounts hook

    // handleDeleteSubAccount managed by useAccounts hook


    // handleSaveAccount managed by useAccounts hook

    const stageColorPalette = [
        { bg: '#dbeafe', text: '#1e40af' },   // blue
        { bg: '#e9d5ff', text: '#7c3aed' },   // purple
        { bg: '#d1fae5', text: '#059669' },   // green
        { bg: '#fed7aa', text: '#c2410c' },   // orange
        { bg: '#fecaca', text: '#dc2626' },   // red
        { bg: '#fef3c7', text: '#d97706' },   // amber
        { bg: '#cffafe', text: '#0e7490' },   // cyan
        { bg: '#fce7f3', text: '#be185d' },   // pink
    ];
    const closedWonColor = { bg: '#d1fae5', text: '#047857' };
    const closedLostColor = { bg: '#fee2e2', text: '#b91c1c' };

    const getStageColor = (stage) => {
        if (stage === 'Closed Won') return closedWonColor;
        if (stage === 'Closed Lost') return closedLostColor;
        const openStages = stages.filter(s => s !== 'Closed Won' && s !== 'Closed Lost');
        const idx = openStages.indexOf(stage);
        if (idx >= 0) return stageColorPalette[idx % stageColorPalette.length];
        return stageColorPalette[0];
    };

    // ── CSV Export utility ──────────────────────────────────────────────
    const exportToCSV = (filename, headers, rows, exportKey = 'default') => {
        setExportingCSV(exportKey);
        try {
            const escape = (v) => {
                if (v === null || v === undefined) return '';
                const s = String(v).replace(/"/g, '""');
                return /[",\n\r]/.test(s) ? `"${s}"` : s;
            };
            const lines = [
                headers.map(escape).join(','),
                ...rows.map(row => row.map(escape).join(','))
            ];
            const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        } finally {
            setTimeout(() => setExportingCSV(null), 1000);
        }
    };

    const getStageClass = (stage) => {
        // Keep for backward compat but prefer getStageColor for inline styles
        const stageMap = {
            'Qualification': 'stage-qualification',
            'Discovery': 'stage-discovery',
            'Evaluation (Demo)': 'stage-evaluation',
            'Proposal': 'stage-proposal',
            'Negotiation/Review': 'stage-negotiation',
            'Contracts': 'stage-contracts',
            'Closed Won': 'stage-won',
            'Closed Lost': 'stage-lost'
        };
        if (stageMap[stage]) return stageMap[stage];
        const idx = stages.indexOf(stage);
        const classes = ['stage-qualification', 'stage-discovery', 'stage-evaluation', 'stage-proposal', 'stage-negotiation', 'stage-contracts', 'stage-won', 'stage-lost'];
        if (idx >= 0 && idx < classes.length) return classes[idx];
        return 'stage-qualification';
    };

    // Account hierarchy rollup helper — returns combined stats for a parent + all its sub-accounts
    const getAccountRollup = (acc) => {
        const subs = getSubAccounts(acc.id);
        const names = [acc.name.toLowerCase(), ...subs.map(s => s.name.toLowerCase())];
        const allOpps = opportunities.filter(o => o.account && names.includes(o.account.toLowerCase()));
        const openOpps = allOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
        const wonOpps = allOpps.filter(o => o.stage === 'Closed Won');
        const pipeline = openOpps.reduce((s, o) => s + (parseFloat(o.arr) || 0), 0);
        const wonArr = wonOpps.reduce((s, o) => s + (parseFloat(o.arr) || 0) + (parseFloat(o.implementationCost) || 0), 0);
        const allContacts = contacts.filter(c => c.company && names.includes(c.company.toLowerCase()));
        const hasSubs = subs.length > 0;
        return { allOpps, openOpps, wonOpps, pipeline, wonArr, allContacts, hasSubs, subCount: subs.length };
    };
    // Activity Management Handlers
    const handleAddActivity = (opportunityId = null, contactId = null) => {
        setEditingActivity(null);
        setActivityInitialContext({ opportunityId, contactId });
        setShowActivityModal(true);
    };

    const handleEditActivity = (activity) => {
        setEditingActivity(activity);
        setShowActivityModal(true);
    };

    // handleDeleteActivity managed by useActivities hook


    // handleSaveActivity managed by useActivities hook

    // ── Calendar strip auto-fetch (hoisted so useEffect can call it) ──────────
    const fetchCalendarEvents = async () => {
        setCalendarLoading(true);
        setCalendarError(null);
        try {
            await waitForToken();
            const now = new Date();
            const weekStart = new Date(now);
            weekStart.setHours(0, 0, 0, 0);
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 7);
            const res = await dbFetch('/.netlify/functions/calendar-events?timeMin=' + weekStart.toISOString() + '&timeMax=' + weekEnd.toISOString());
            if (!res.ok) throw new Error('Failed to load calendar');
            const data = await res.json();
            if (data.connected === false) {
                // No calendar connected yet — don't show error, just show connect prompt
                setCalendarConnected(false);
                setCalendarEvents([]);
            } else {
                setCalendarEvents(data.events || []);
                setCalendarConnected(true);
            }
        } catch (err) {
            setCalendarError(err.message);
            setCalendarConnected(false);
        } finally {
            setCalendarLoading(false);
        }
    };

    // Log from Calendar handlers
    const fetchLogFromCalEvents = async () => {
        setLogFromCalLoading(true);
        setLogFromCalError(null);
        try {
            const res = await dbFetch('/.netlify/functions/calendar-events?timeMin=' + logFromCalDateFrom + 'T00:00:00Z&timeMax=' + logFromCalDateTo + 'T23:59:59Z');
            if (!res.ok) throw new Error('Failed to load calendar events');
            const data = await res.json();
            setLogFromCalEvents(data.events || []);
            setLogFromCalOpen(true);
        } catch (err) {
            setLogFromCalError(err.message);
        } finally {
            setLogFromCalLoading(false);
        }
    };

    const handleLogFromCalendar = async (ev, opportunityId) => {
        const eventDate = ev.start?.date || (ev.start?.dateTime ? ev.start.dateTime.split('T')[0] : [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-'));
        const relatedOpp = opportunityId ? (opportunities || []).find(o => o.id === opportunityId) : null;
        const activityData = {
            type: 'Meeting',
            date: eventDate,
            notes: [ev.summary || '', ev.description || ''].filter(Boolean).join('\n'),
            opportunityId: opportunityId || '',
            companyName: relatedOpp?.account || '',
            addToCalendar: false,
        };
        await handleSaveActivity(activityData, { editingActivity, currentUser, opportunities, setShowActivityModal, setFollowUpPrompt, setQuickLogOpen, setQuickLogForm, setQuickLogContactResults });
        setLoggedCalendarIds(prev => new Set([...prev, ev.id]));
        setLogFromCalOppMap(prev => ({ ...prev, [ev.id]: opportunityId || '' }));
        setLogFromCalLinkingId(null);
    };

    // Deal Health Calculation
    const calculateDealHealth = (opportunity) => {
        if (!opportunity) return { score: 0, status: 'unknown', color: 'gray', reasons: [] };
        
        let score = 100;
        const reasons = [];
        const now = new Date();
        
        // Check last activity
        const oppActivities = activities.filter(a => a.opportunityId === opportunity.id);
        if (oppActivities.length > 0) {
            const lastActivity = new Date(Math.max(...oppActivities.map(a => new Date(a.date + 'T12:00:00'))));
            const daysSinceActivity = Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24));
            
            if (daysSinceActivity > 30) { score -= 40; reasons.push('No activity in over 30 days (' + daysSinceActivity + ' days)'); }
            else if (daysSinceActivity > 14) { score -= 25; reasons.push('No activity in over 14 days (' + daysSinceActivity + ' days)'); }
            else if (daysSinceActivity > 7) { score -= 10; reasons.push('No activity in over 7 days (' + daysSinceActivity + ' days)'); }
            else { reasons.push('Recent activity ' + daysSinceActivity + ' day' + (daysSinceActivity !== 1 ? 's' : '') + ' ago'); }
        } else {
            score -= 30;
            reasons.push('No activities logged for this opportunity');
        }
        
        // Check time in current stage
        if (opportunity.stageChangedDate) {
            const stageDate = new Date(opportunity.stageChangedDate);
            const daysInStage = Math.floor((now - stageDate) / (1000 * 60 * 60 * 24));
            
            if (daysInStage > 60) { score -= 30; reasons.push('Stuck in current stage for ' + daysInStage + ' days'); }
            else if (daysInStage > 30) { score -= 15; reasons.push('In current stage for ' + daysInStage + ' days'); }
            else { reasons.push('In current stage for ' + daysInStage + ' days'); }
        }
        
        // Check close date proximity
        if (opportunity.forecastedCloseDate) {
            const closeDate = new Date(opportunity.forecastedCloseDate);
            const daysToClose = Math.floor((closeDate - now) / (1000 * 60 * 60 * 24));
            
            if (daysToClose < 0) { score -= 35; reasons.push('Close date is ' + Math.abs(daysToClose) + ' days overdue'); }
            else if (daysToClose < 7 && oppActivities.length === 0) { score -= 20; reasons.push('Closing in ' + daysToClose + ' days with no activities'); }
            else if (daysToClose < 14) { reasons.push('Close date approaching in ' + daysToClose + ' days'); }
        }
        
        // Determine status and color
        let status, color;
        if (score >= 75) {
            status = 'Healthy';
            color = 'var(--accent-success)';
        } else if (score >= 50) {
            status = 'At Risk';
            color = 'var(--accent-warning)';
        } else {
            status = 'Critical';
            color = 'var(--accent-danger)';
        }
        
        return { score, status, color, reasons };
    };

    // Win Probability Helper (used by analytics)
    const getWinProbability = (stage) => {
        const fStage = (settings.funnelStages || []).find(s => s.name === stage);
        if (fStage) return fStage.weight / 100;
        return 0.3;
    };

    // Notification Generation
    useEffect(() => {
        const generateNotifications = () => {
            const newNotifications = [];
            const now = new Date();
            
            opportunities.forEach(opp => {
                // Stale deal alerts
                const oppActivities = activities.filter(a => a.opportunityId === opp.id);
                if (oppActivities.length > 0) {
                    const lastActivity = new Date(Math.max(...oppActivities.map(a => new Date(a.date + 'T12:00:00'))));
                    const daysSinceActivity = Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24));
                    
                    if (daysSinceActivity > 14 && opp.stage !== 'Closed Won' && opp.stage !== 'Closed Lost') {
                        newNotifications.push({
                            id: `stale-${opp.id}`,
                            type: 'warning',
                            message: `${opp.account} - ${daysSinceActivity} days since last activity`,
                            opportunityId: opp.id,
                            date: now.toISOString()
                        });
                    }
                }
                
                // Close date reminders
                if (opp.forecastedCloseDate && opp.stage !== 'Closed Won' && opp.stage !== 'Closed Lost') {
                    const closeDate = new Date(opp.forecastedCloseDate + 'T12:00:00');
                    const daysToClose = Math.floor((closeDate - now) / (1000 * 60 * 60 * 24));
                    
                    if (daysToClose >= 0 && daysToClose <= 7) {
                        newNotifications.push({
                            id: `closing-${opp.id}`,
                            type: 'info',
                            message: `${opp.account} closing in ${daysToClose} days`,
                            opportunityId: opp.id,
                            date: now.toISOString()
                        });
                    } else if (daysToClose < 0) {
                        newNotifications.push({
                            id: `overdue-${opp.id}`,
                            type: 'danger',
                            message: `${opp.account} is ${Math.abs(daysToClose)} days overdue`,
                            opportunityId: opp.id,
                            date: now.toISOString()
                        });
                    }
                }
            });
            
            // Task reminders
            tasks.forEach(task => {
                if (!task.completed && task.dueDate) {
                    const dueDate = new Date(task.dueDate + 'T12:00:00');
                    const daysUntilDue = Math.floor((dueDate - now) / (1000 * 60 * 60 * 24));
                    
                    if (daysUntilDue === 0) {
                        newNotifications.push({
                            id: `task-${task.id}`,
                            type: 'warning',
                            message: `Task due today: ${task.title}`,
                            taskId: task.id,
                            date: now.toISOString()
                        });
                    }
                }
            });
            
            setNotifications(newNotifications);
        };
        
        generateNotifications();
        const interval = setInterval(generateNotifications, 60000); // Check every minute
        
        return () => clearInterval(interval);
    }, [opportunities, activities, tasks]);

    // Task reminder popup checker
    useEffect(() => {
        const checkReminders = () => {
            const now = new Date();
            const nowDate = now.toISOString().split('T')[0];
            const nowHour = now.getHours();
            const nowMin = now.getMinutes();
            
            tasks.forEach(task => {
                if (task.completed || !task.reminderDate || !task.reminderTime) return;
                if (dismissedReminders.includes(task.id)) return;
                
                const rDate = task.reminderDate;
                const rTime = task.reminderTime;
                
                if (rDate !== nowDate) return;
                
                // Parse reminder time (could be "9:00 AM", "14:00", etc)
                let rHour, rMin;
                const ampmMatch = rTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
                if (ampmMatch) {
                    rHour = parseInt(ampmMatch[1]);
                    rMin = parseInt(ampmMatch[2]);
                    const isPM = ampmMatch[3].toUpperCase() === 'PM';
                    if (isPM && rHour !== 12) rHour += 12;
                    if (!isPM && rHour === 12) rHour = 0;
                } else {
                    const parts = rTime.split(':');
                    rHour = parseInt(parts[0]) || 0;
                    rMin = parseInt(parts[1]) || 0;
                }
                
                if (nowHour === rHour && Math.abs(nowMin - rMin) <= 1) {
                    // Fire reminder
                    setTaskReminderPopup(task);
                    setDismissedReminders(prev => [...prev, task.id]);
                    
                    // Play audio chime
                    try {
                        const ctx = new (window.AudioContext || window.webkitAudioContext)();
                        const playTone = (freq, start, dur) => {
                            const osc = ctx.createOscillator();
                            const gain = ctx.createGain();
                            osc.connect(gain);
                            gain.connect(ctx.destination);
                            osc.type = 'sine';
                            osc.frequency.value = freq;
                            gain.gain.setValueAtTime(0.3, ctx.currentTime + start);
                            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + dur);
                            osc.start(ctx.currentTime + start);
                            osc.stop(ctx.currentTime + start + dur);
                        };
                        playTone(523, 0, 0.2);
                        playTone(659, 0.2, 0.2);
                        playTone(784, 0.4, 0.3);
                        playTone(784, 0.8, 0.2);
                        playTone(659, 1.0, 0.2);
                        playTone(784, 1.2, 0.4);
                    } catch(e) {}
                }
            });
        };
        
        checkReminders();
        const interval = setInterval(checkReminders, 30000); // Check every 30 seconds
        return () => clearInterval(interval);
    }, [tasks, dismissedReminders]);

    // Task due-today popup checker
    useEffect(() => {
        const checkDueToday = () => {
            const todayStr = [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-');
            const dueTodayTasks = tasks.filter(task => {
                if (task.completed) return false;
                const status = task.status || (task.completed ? 'Completed' : 'Open');
                if (status === 'Completed') return false;
                if (!task.dueDate) return false;
                if (dismissedDueTodayAlerts.includes(task.id)) return false;
                return task.dueDate === todayStr;
            });
            if (dueTodayTasks.length === 0) return;
            // Queue all due-today tasks and show the first one
            setTaskDueQueue(dueTodayTasks.slice(1));
            setTaskDuePopup(dueTodayTasks[0]);
            setDismissedDueTodayAlerts(prev => [...prev, ...dueTodayTasks.map(t => t.id)]);
            // Play a distinct alert sound (two-tone urgent chime)
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const playTone = (freq, start, dur, vol) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.connect(gain); gain.connect(ctx.destination);
                    osc.type = 'sine'; osc.frequency.value = freq;
                    gain.gain.setValueAtTime(vol || 0.3, ctx.currentTime + start);
                    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + dur);
                    osc.start(ctx.currentTime + start);
                    osc.stop(ctx.currentTime + start + dur);
                };
                playTone(440, 0,   0.15, 0.35);
                playTone(440, 0.2, 0.15, 0.35);
                playTone(550, 0.45, 0.25, 0.4);
                playTone(660, 0.75, 0.35, 0.45);
            } catch(e) {}
        };
        checkDueToday();
        const interval = setInterval(checkDueToday, 60000);
        return () => clearInterval(interval);
    }, [tasks, dismissedDueTodayAlerts]);

    const handleLogout = () => signOut();

    // Redirect away from leads tab if leads is disabled — must be before early returns
    useEffect(() => {
        if (settings.leadsEnabled === false && activeTab === 'leads') {
            setActiveTab('home');
        }
    }, [settings.leadsEnabled]);

    if (!clerkLoaded || !orgLoaded) {
        return (
            <div className="login-page">
                <div className="login-card" style={{ textAlign: 'center', padding: '3rem' }}>
                    <div style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Loading…</div>
                </div>
            </div>
        );
    }

    if (!clerkUser) {
        return (
            <div className="login-page">
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '2rem' }}>
                    <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style={{ width: '56px', height: '56px', display: 'block', margin: '0 auto 0.75rem' }}>
                            <rect width="100" height="100" rx="20" fill="#2563eb"/>
                            <path d="M25 65 L25 45 L35 45 L35 65Z M42 65 L42 35 L52 35 L52 65Z M59 65 L59 50 L69 50 L69 65Z" fill="white"/>
                            <path d="M22 40 L45 25 L68 32 L80 20" stroke="#34d399" strokeWidth="4" fill="none" strokeLinecap="round"/>
                            <circle cx="80" cy="20" r="4" fill="#34d399"/>
                        </svg>
                        <h1 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: '700', margin: '0 0 0.25rem' }}>Sales Pipeline Tracker</h1>
                        <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: 0 }}>Sign in to continue</p>
                    </div>
                    <SignIn routing="hash" />
                </div>
            </div>
        );
    }

    if (!organization) {
        return (
            <div className="login-page">
                <div className="login-card" style={{ textAlign: 'center', padding: '3rem', maxWidth: '420px', margin: '10vh auto' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏢</div>
                    <h2 style={{ color: '#1e293b', fontSize: '1.25rem', fontWeight: '700', marginBottom: '0.75rem' }}>No Organization Found</h2>
                    <p style={{ color: '#64748b', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                        You haven't been added to a company yet. Contact your administrator to be invited to your organization.
                    </p>
                    <button onClick={() => signOut()} style={{ padding: '0.5rem 1.5rem', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', color: '#475569' }}>
                        Sign Out
                    </button>
                </div>
            </div>
        );
    }


    // ── AppContext value ─────────────────────────────────────────────
    const appContextValue = {
        // Data
        settings, setSettings,
        opportunities, setOpportunities,
        accounts, setAccounts,
        contacts, setContacts,
        tasks, setTasks,
        activities, setActivities,
        leads, setLeads,
        // Auth
        currentUser,
        userRole,
        clerkUser,
        canSeeAll: userRole === 'Admin' || userRole === 'Manager',
        // Utility functions
        getQuarter,
        getQuarterLabel,
        getStageColor,
        calculateDealHealth,
        exportToCSV,
        showConfirm,
        softDelete,
        addAudit,
        canViewField,
        isRepVisible,
        // Derived
        stages,
        dbOffline,
        // Hook handlers
        handleDelete,
        handleSave,
        completeLostSave,
        handleAddAccountFromOpportunity,
        handleDeleteAccount,
        handleDeleteSubAccount,
        handleSaveAccount,
        handleDeleteContact,
        getSubAccounts,
        getAccountRollup,
        handleSaveContact,
        handleDeleteTask,
        handleSaveTask,
        handleCompleteTask,
        handleAddTaskToCalendar,
        handleDeleteActivity,
        handleSaveActivity,
        handleUpdateFiscalYearStart,
        handleAddTaskType,
        loadOpportunities,
        loadAccounts,
        loadContacts,
        loadTasks,
        loadActivities,
        // Detail panel state
        viewingContact, setViewingContact,
        viewingAccount, setViewingAccount,
        viewingTask, setViewingTask,
        contactShowAllDeals, setContactShowAllDeals,
        accShowAllClosed, setAccShowAllClosed,
        accShowAllContacts, setAccShowAllContacts,
        // Viewing/filtering (managers)
        viewingRep, setViewingRep,
        viewingTeam, setViewingTeam,
        viewingTerritory, setViewingTerritory,
        // UI state
        exportingCSV, setExportingCSV,
        setUndoToast,
        getKpiColor,
        // Calendar log-from-cal
        logFromCalOpen, setLogFromCalOpen,
        logFromCalDateFrom, setLogFromCalDateFrom,
        logFromCalDateTo, setLogFromCalDateTo,
        logFromCalEvents, setLogFromCalEvents,
        logFromCalLoading, setLogFromCalLoading,
        logFromCalError, setLogFromCalError,
        loggedCalendarIds, setLoggedCalendarIds,
        logFromCalLinkingId, setLogFromCalLinkingId,
        logFromCalOppMap, setLogFromCalOppMap,
        fetchLogFromCalEvents,
        meetingPrepEvent, setMeetingPrepEvent,
        meetingPrepOpen, setMeetingPrepOpen,
        meetingPrepOppId, setMeetingPrepOppId,
        calendarEvents, setCalendarEvents, calendarConnected, setCalendarConnected, calendarLoading, setCalendarLoading, calendarError, setCalendarError,
        fetchCalendarEvents,
        // Navigation
        activeTab, setActiveTab,
        activePipelineId, setActivePipelineId,
        allRepNames,
        allTeamNames,
        allTerritoryNames,
        // SPIFF
        spiffClaims, setSpiffClaims,
        // Derived/filtered lists
        visibleOpportunities,
        visibleAccounts,
        visibleContacts,
        visibleTasks,
        activePipeline,
        allPipelines,
        // Modal state
        showModal, setShowModal,
        editingOpp, setEditingOpp,
        oppModalError, setOppModalError,
        oppModalSaving, setOppModalSaving,
        showAccountModal, setShowAccountModal,
        editingAccount, setEditingAccount,
        editingSubAccount, setEditingSubAccount,
        accountModalError, setAccountModalError,
        accountModalSaving, setAccountModalSaving,
        accountCreatedFromOppForm, setAccountCreatedFromOppForm,
        lastCreatedAccountName, setLastCreatedAccountName,
        lastCreatedRepName, setLastCreatedRepName,
        parentAccountForSub, setParentAccountForSub,
        showContactModal, setShowContactModal,
        editingContact, setEditingContact,
        contactModalError, setContactModalError,
        contactModalSaving, setContactModalSaving,
        showTaskModal, setShowTaskModal,
        editingTask, setEditingTask,
        taskModalError, setTaskModalError,
        taskModalSaving, setTaskModalSaving,
        showUserModal, setShowUserModal,
        editingUser, setEditingUser,
        userModalError, setUserModalError,
        userModalSaving, setUserModalSaving,
        handleSaveUser,
        handleAddUser, handleEditUser, handleDeleteUser,
        showActivityModal, setShowActivityModal,
        editingActivity, setEditingActivity,
        activityInitialContext, setActivityInitialContext,
        activityModalError, setActivityModalError,
        activityModalSaving, setActivityModalSaving,
        showCsvImportModal, setShowCsvImportModal,
        showLeadImportModal, setShowLeadImportModal,
        showOutlookImportModal, setShowOutlookImportModal,
        showSpiffClaimModal, setShowSpiffClaimModal,
        spiffClaimContext, setSpiffClaimContext,
        confirmModal, setConfirmModal,
        lostReasonModal, setLostReasonModal,
        notesPopover, setNotesPopover,
        undoToast, setUndoToast,
        taskReminderPopup, setTaskReminderPopup,
        taskReminderSnoozeH, setTaskReminderSnoozeH,
        taskReminderSnoozeM, setTaskReminderSnoozeM,
        taskDuePopup, setTaskDuePopup,
        taskDueQueue, setTaskDueQueue,
        taskDueSnoozeH, setTaskDueSnoozeH,
        taskDueSnoozeM, setTaskDueSnoozeM,
        showShortcuts, setShowShortcuts,
        csvImportType, setCsvImportType,
        pendingOppFormData, setPendingOppFormData,
        // QuickLog
        followUpPrompt, setFollowUpPrompt,
        quickLogOpen, setQuickLogOpen,
        quickLogForm, setQuickLogForm,
        quickLogContactResults, setQuickLogContactResults,
        // Tab UI state (persists across tab switches)
        feedFilter, setFeedFilter,
        feedLastRead, setFeedLastRead,
        expandedAccounts, setExpandedAccounts,
        accountsSortDir, setAccountsSortDir,
        accountsViewMode, setAccountsViewMode,
        selectedAccounts, setSelectedAccounts,
        contactsSortBy, setContactsSortBy,
        selectedContacts, setSelectedContacts,
    };

    return (
        <AppProvider value={appContextValue}>
        <div className="app-container">
            <AppHeader
                globalSearch={globalSearch}
                setGlobalSearch={setGlobalSearch}
                showSearchResults={showSearchResults}
                setShowSearchResults={setShowSearchResults}
                showProfilePanel={showProfilePanel}
                setShowProfilePanel={setShowProfilePanel}
                profileForm={profileForm}
                setProfileForm={setProfileForm}
                myProfile={myProfile}
                setMyProfile={setMyProfile}
                notifications={notifications}
                showNotifications={showNotifications}
                setShowNotifications={setShowNotifications}
                showShortcuts={showShortcuts}
                setShowShortcuts={setShowShortcuts}
                handleLogout={handleLogout}
                setShowModal={setShowModal}
                setEditingOpp={setEditingOpp}
                setViewingAccount={setViewingAccount}
                setViewingContact={setViewingContact}
                dbOffline={dbOffline}
                setDbOffline={setDbOffline}
            />

            {/* ── DB OFFLINE BANNER ── */}
            {dbOffline && (
                <div style={{ background:'#dc2626', color:'#fff', padding:'0.5rem 1.25rem', display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:'0.8125rem', fontWeight:'600', zIndex:9999 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.625rem' }}>
                        <span style={{ fontSize:'1rem' }}>⚠️</span>
                        <span>Database connection lost — changes may not be saving. Check your connection and refresh.</span>
                    </div>
                    <button onClick={() => setDbOffline(false)} style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'#fff', borderRadius:'4px', padding:'2px 8px', cursor:'pointer', fontSize:'0.75rem', fontWeight:'700', fontFamily:'inherit' }}>✕</button>
                </div>
            )}

            <nav className="nav-tabs">
                <button 
                    className={`nav-tab ${activeTab === 'home' ? 'active' : ''}`}
                    onClick={() => setActiveTab('home')}
                >
                    HOME
                </button>
                <button 
                    className={`nav-tab ${activeTab === 'pipeline' ? 'active' : ''}`}
                    onClick={() => setActiveTab('pipeline')}
                >
                    PIPELINE
                </button>
                <button 
                    className={`nav-tab ${activeTab === 'opportunities' ? 'active' : ''}`}
                    onClick={() => setActiveTab('opportunities')}
                >
                    OPPORTUNITIES
                </button>
                <button 
                    className={`nav-tab ${activeTab === 'tasks' ? 'active' : ''}`}
                    onClick={() => setActiveTab('tasks')}
                    style={{ position: 'relative' }}
                >
                    TASKS
                    {(() => {
                        const now = new Date(); now.setHours(0,0,0,0);
                        const overdueCount = visibleTasks.filter(t => {
                            const s = t.status || (t.completed ? 'Completed' : 'Open');
                            return (s === 'Open' || s === 'In-Process') && t.dueDate && new Date(t.dueDate + 'T12:00:00') < now;
                        }).length;
                        return overdueCount > 0 ? (
                            <span style={{ position: 'absolute', top: '3px', right: '3px', background: '#ef4444', color: '#fff', borderRadius: '999px', fontSize: '0.5rem', fontWeight: '800', minWidth: '14px', height: '14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', lineHeight: 1 }}>
                                {overdueCount > 99 ? '99+' : overdueCount}
                            </span>
                        ) : null;
                    })()}
                    {(opportunities || []).reduce((acc, opp) => acc + (opp.comments || []).filter(c => c.timestamp > feedLastRead && c.author !== currentUser && (c.mentions || []).includes(currentUser)).length, 0) > 0 && (
                        <span style={{ position: 'absolute', top: '4px', right: '4px', background: '#ef4444', color: '#fff', borderRadius: '999px', fontSize: '0.5rem', fontWeight: '800', minWidth: '13px', height: '13px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 2px', lineHeight: 1 }}>!</span>
                    )}
                </button>
                <button 
                    className={`nav-tab ${activeTab === 'accounts' ? 'active' : ''}`}
                    onClick={() => setActiveTab('accounts')}
                >
                    ACCOUNTS
                </button>
                <button 
                    className={`nav-tab ${activeTab === 'contacts' ? 'active' : ''}`}
                    onClick={() => setActiveTab('contacts')}
                >
                    CONTACTS
                </button>
                <button 
                    className={`nav-tab ${activeTab === 'leads' ? 'active' : ''}`}
                    onClick={() => setActiveTab('leads')}
                    style={{ display: settings.leadsEnabled === false ? 'none' : '' }}
                >
                    LEADS
                </button>
                <button 
                    className={`nav-tab ${activeTab === 'reports' ? 'active' : ''}`}
                    onClick={() => setActiveTab('reports')}
                >
                    REPORTS
                </button>
                {(isAdmin || isManager) && (
                    <button
                        className={`nav-tab ${activeTab === 'salesManager' ? 'active' : ''}`}
                        onClick={() => setActiveTab('salesManager')}
                    >
                        SALES MANAGER
                    </button>
                )}
                {isAdmin && (
                    <button 
                        className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`}
                        onClick={() => setActiveTab('settings')}
                    >
                        SETTINGS
                    </button>
                )}
                {isReadOnly && (
                    <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto', padding: '0 0.75rem', fontSize: '0.6875rem', color: 'rgba(255,255,255,0.6)', fontWeight: '600', fontStyle: 'italic' }}>
                        👁 View Only Mode
                    </div>
                )}
            </nav>

            {activeTab === 'home' && (
                <ErrorBoundary tabName="Home">
                    <HomeTab />
                </ErrorBoundary>
            )}

            {activeTab === 'pipeline' && (
                <ErrorBoundary tabName="Pipeline">
                    <PipelineTab />
                </ErrorBoundary>
            )}

            {activeTab === 'opportunities' && (
                <ErrorBoundary tabName="Opportunities">
                    <OpportunitiesTab />
                </ErrorBoundary>
            )}

            {activeTab === 'tasks' && (
                <ErrorBoundary tabName="Tasks">
                    <TasksTab />
                </ErrorBoundary>
            )}

            {activeTab === 'accounts' && (
                <ErrorBoundary tabName="Accounts">
                    <AccountsTab />
                </ErrorBoundary>
            )}

            {activeTab === 'contacts' && (
                <ErrorBoundary tabName="Contacts">
                    <ContactsTab />
                </ErrorBoundary>
            )}

            {activeTab === 'leads' && settings.leadsEnabled !== false && (
                <ErrorBoundary tabName="Leads">
                    <LeadsTab />
                </ErrorBoundary>
            )}

            {activeTab === 'reports' && (
                <ErrorBoundary tabName="Reports">
                    <ReportsTab leadsEnabled={settings.leadsEnabled !== false} />
                </ErrorBoundary>
            )}

            {activeTab === 'salesManager' && (
                <ErrorBoundary tabName="Sales Manager">
                    <SalesManagerTab />
                </ErrorBoundary>
            )}

            {activeTab === 'settings' && isAdmin && (
                <ErrorBoundary tabName="Settings">
                    <SettingsTab />
                </ErrorBoundary>
            )}

            {/* ════ MEETING PREP PANEL ════ */}
            {meetingPrepOpen && meetingPrepEvent && (() => {
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
                const healthColor = health ? (health.score >= 70 ? '#10b981' : health.score >= 40 ? '#f59e0b' : '#ef4444') : '#94a3b8';
                const healthBg = health ? (health.score >= 70 ? '#d1fae5' : health.score >= 40 ? '#fef3c7' : '#fee2e2') : '#f1f5f9';

                return (
                    <>
                        {/* Backdrop */}
                        <div onClick={() => { setMeetingPrepOpen(false); setMeetingPrepOppId(null); }}
                            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 9000 }} />

                        {/* Slide-in panel */}
                        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '420px', background: '#fff', zIndex: 9001, boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

                            {/* Header */}
                            <div style={{ background: 'linear-gradient(135deg, #1e40af, #2563eb)', padding: '1.25rem 1.5rem', color: '#fff', flexShrink: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ fontSize: '0.625rem', fontWeight: '700', color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.375rem' }}>Meeting Prep</div>
                                    <button onClick={() => setMeetingPrepOpen(false)}
                                        style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: '6px', width: '28px', height: '28px', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
                                </div>
                                <div style={{ fontWeight: '800', fontSize: '1rem', lineHeight: 1.3, marginBottom: '0.375rem' }}>{evTitle}</div>
                                <div style={{ fontSize: '0.8125rem', color: '#bfdbfe' }}>
                                    {evDate} · {evTime}{evEnd ? ' – ' + evEnd : ''}{ev.attendeeCount > 0 ? ` · ${ev.attendeeCount} attendees` : ''}
                                </div>
                            </div>

                            <div style={{ flex: 1, padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', overflowY: 'auto' }}>

                                {/* Opportunity match */}
                                {matchedOpp ? (
                                    <div>
                                        <div style={{ fontSize: '0.625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Linked Opportunity</div>
                                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem 1rem' }}>
                                            <div style={{ fontWeight: '700', fontSize: '0.9375rem', color: '#1e293b', marginBottom: '0.25rem' }}>{matchedOpp.opportunityName || matchedOpp.account}</div>
                                            <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>{matchedOpp.account} · {matchedOpp.stage}</div>
                                            <div style={{ fontWeight: '700', fontSize: '0.875rem', color: '#2563eb', marginTop: '0.25rem' }}>${(matchedOpp.arr || 0).toLocaleString()} ARR</div>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '0.75rem 1rem', fontSize: '0.8125rem', color: '#92400e' }}>
                                        No matching opportunity found. Link this event to a deal by logging it as an activity.
                                    </div>
                                )}

                                {/* Deal Health */}
                                {health && (
                                    <div>
                                        <div style={{ fontSize: '0.625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Deal Health</div>
                                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem 1rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                                <span style={{ fontWeight: '800', fontSize: '1.5rem', color: healthColor }}>{health.score}</span>
                                                <span style={{ background: healthBg, color: healthColor, fontSize: '0.75rem', fontWeight: '700', padding: '0.2rem 0.625rem', borderRadius: '999px' }}>{health.score >= 70 ? 'Healthy' : health.score >= 40 ? 'At Risk' : 'Critical'}</span>
                                            </div>
                                            <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                                                <div style={{ height: '100%', width: health.score + '%', background: healthColor, borderRadius: '3px', transition: 'width 0.4s ease' }} />
                                            </div>
                                            {health.reasons.slice(0, 2).map((r, i) => (
                                                <div key={i} style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>· {r}</div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Account details */}
                                {matchedAccount && (
                                    <div>
                                        <div style={{ fontSize: '0.625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Account</div>
                                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem 1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                            {[
                                                ['Industry', matchedAccount.industry],
                                                ['Owner', matchedAccount.accountOwner],
                                                ['Size', matchedAccount.employeeCount ? matchedAccount.employeeCount + ' employees' : null],
                                                ['Website', matchedAccount.website],
                                            ].filter(([, v]) => v).map(([label, value]) => (
                                                <div key={label}>
                                                    <div style={{ fontSize: '0.625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                                                    <div style={{ fontSize: '0.8125rem', color: '#1e293b', fontWeight: '500', marginTop: '0.1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Contacts */}
                                {matchedOpp && (
                                    <div>
                                        <div style={{ fontSize: '0.625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Contacts</div>
                                        {matchedContacts.length === 0 ? (
                                            <div style={{ fontSize: '0.8125rem', color: '#94a3b8', fontStyle: 'italic' }}>No contacts found for this account</div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                                                {matchedContacts.map(c => (
                                                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.5rem 0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                                                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: '700', color: '#2563eb', flexShrink: 0 }}>
                                                            {(c.firstName?.[0] || '') + (c.lastName?.[0] || '')}
                                                        </div>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b' }}>{c.firstName} {c.lastName}</div>
                                                            <div style={{ fontSize: '0.6875rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[c.title, c.email].filter(Boolean).join(' · ')}</div>
                                                        </div>
                                                        {c.phone && <div style={{ fontSize: '0.6875rem', color: '#94a3b8', flexShrink: 0 }}>{c.phone}</div>}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Recent Activities */}
                                {matchedOpp && (
                                    <div>
                                        <div style={{ fontSize: '0.625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Recent Activities</div>
                                        {recentActivities.length === 0 ? (
                                            <div style={{ fontSize: '0.8125rem', color: '#94a3b8', fontStyle: 'italic' }}>No activities logged yet</div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                                                {recentActivities.map(a => (
                                                    <div key={a.id} style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start', padding: '0.5rem 0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                                                        <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#2563eb', background: '#eff6ff', padding: '0.15rem 0.375rem', borderRadius: '4px', whiteSpace: 'nowrap', flexShrink: 0 }}>{a.type}</div>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: '0.75rem', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.notes || '—'}</div>
                                                            <div style={{ fontSize: '0.6875rem', color: '#94a3b8', marginTop: '0.1rem' }}>{a.date}</div>
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
                                        <div style={{ fontSize: '0.625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Open Tasks</div>
                                        {openTasks.length === 0 ? (
                                            <div style={{ fontSize: '0.8125rem', color: '#94a3b8', fontStyle: 'italic' }}>No open tasks</div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                                                {openTasks.map(t => (
                                                    <div key={t.id} style={{ display: 'flex', gap: '0.625rem', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: t.priority === 'High' ? '#ef4444' : t.priority === 'Low' ? '#10b981' : '#f59e0b', flexShrink: 0 }} />
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                                                            <div style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>Due {t.dueDate || '—'}</div>
                                                        </div>
                                                        <span style={{ fontSize: '0.6875rem', color: '#64748b', background: '#e2e8f0', padding: '0.1rem 0.375rem', borderRadius: '4px', flexShrink: 0 }}>{t.type}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Footer actions */}
                            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                                <button onClick={() => { setMeetingPrepOpen(false); handleAddActivity(matchedOpp?.id || null); }}
                                    style={{ flex: 1, padding: '0.5rem', border: 'none', borderRadius: '8px', background: '#2563eb', color: '#fff', fontSize: '0.8125rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                                    + Log Activity
                                </button>
                                <button onClick={() => { setMeetingPrepOpen(false); setEditingTask({ opportunityId: matchedOpp?.id || '', relatedTo: matchedOpp?.id || '' }); setShowTaskModal(true); }}
                                    style={{ flex: 1, padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f8fafc', color: '#475569', fontSize: '0.8125rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                                    + Add Task
                                </button>
                            </div>
                        </div>
                    </>
                );
            })()}

            <ModalLayer />
            <QuickLogFab />
        </div>
        </AppProvider>
    );
}

// CSV Import Modal with Field Mapping

export default App;
// build Wed, Mar  4, 2026  2:57:23 PM
