import { useOrgBoundState, resetAllOf } from './useOrgBoundState';

export function useModalState() {
    // Every value here — each modal, rail, confirm, undo and reminder — belongs
    // to the org on screen (state §0.174): registered with useOrgBoundState, and
    // put back by resetOnOrgSwitch when the org switches.
    const resets = [];
    const [showModal, setShowModal] = useOrgBoundState(resets, false);
    const [showSpiffClaimModal, setShowSpiffClaimModal] = useOrgBoundState(resets, false);
    const [spiffClaimContext, setSpiffClaimContext] = useOrgBoundState(resets, null);
    const [showAccountModal, setShowAccountModal] = useOrgBoundState(resets, false);
    const [showUserModal, setShowUserModal] = useOrgBoundState(resets, false);
    const [showTaskModal, setShowTaskModal] = useOrgBoundState(resets, false);
    const [showContactModal, setShowContactModal] = useOrgBoundState(resets, false);
    const [showActivityModal, setShowActivityModal] = useOrgBoundState(resets, false);
    const [showShortcuts, setShowShortcuts] = useOrgBoundState(resets, false);
    const [showCsvImportModal, setShowCsvImportModal] = useOrgBoundState(resets, false);
    const [showLeadImportModal, setShowLeadImportModal] = useOrgBoundState(resets, false);
    const [showLeadModal, setShowLeadModal] = useOrgBoundState(resets, false);
    const [showOutlookImportModal, setShowOutlookImportModal] = useOrgBoundState(resets, false);
    const [csvImportType, setCsvImportType] = useOrgBoundState(resets, 'contacts');
    const [mergeModal, setMergeModal] = useOrgBoundState(resets, null); // { aId, bId } | null
    const [contactMergeModal, setContactMergeModal] = useOrgBoundState(resets, null); // { aId, bId } | null
    // A Settings catalogue id to open on the next Settings render (state §0.97):
    // App.jsx sets it when the calendar OAuth callback lands the user back on
    // a Settings panel; AdminView opens that item and clears it.
    const [settingsOpenPanel, setSettingsOpenPanel] = useOrgBoundState(resets, null);

    // ── Contact Rail ──────────────────────────────────────────────────────────
    // contactRailId: null (closed) | string id (view/edit existing) | 'new' (create)
    // contactRailMode: 'view' | 'edit' | 'new'
    const [contactRailId,   setContactRailId]   = useOrgBoundState(resets, null);
    const [contactRailMode, setContactRailMode] = useOrgBoundState(resets, 'view');

    // ── Account Rail ──────────────────────────────────────────────────────────
    // accountRailId: null (closed) | string id (view/edit existing) | 'new' (create)
    // accountRailMode: 'view' | 'edit' | 'new'
    const [accountRailId,   setAccountRailId]   = useOrgBoundState(resets, null);
    const [accountRailMode, setAccountRailMode] = useOrgBoundState(resets, 'view');

    // ── Task Rail ───────────────────────────────────────────────────────────────
    // taskRailId: null (closed) | string id (view/edit) | 'new' (create)
    // taskRailMode: 'view' | 'edit' | 'new'
    const [taskRailId,   setTaskRailId]   = useOrgBoundState(resets, null);
    const [taskRailMode, setTaskRailMode] = useOrgBoundState(resets, 'view');

    // ── Rail stack — supports Option B stacking (Contact → Account → back) ───
    // Each entry: { type: 'contact'|'account', id: string|'new', mode: string }
    const [railStack, setRailStack] = useOrgBoundState(resets, []);

    // ── Document Rail / Upload / Link picker ──────────────────────────────────
    const [documentRailId,       setDocumentRailId]       = useOrgBoundState(resets, null);
    const [showUploadRail,       setShowUploadRail]       = useOrgBoundState(resets, false);
    const [uploadRailContext,    setUploadRailContext]    = useOrgBoundState(resets, null);
    const [showDocLinkPicker,    setShowDocLinkPicker]    = useOrgBoundState(resets, false);
    const [docLinkPickerContext, setDocLinkPickerContext] = useOrgBoundState(resets, null);

    const [editingOpp, setEditingOpp] = useOrgBoundState(resets, null);
    const [editingAccount, setEditingAccount] = useOrgBoundState(resets, null);
    const [editingSubAccount, setEditingSubAccount] = useOrgBoundState(resets, null);
    const [editingUser, setEditingUser] = useOrgBoundState(resets, null);
    const [editingTask, setEditingTask] = useOrgBoundState(resets, null);
    const [editingContact, setEditingContact] = useOrgBoundState(resets, null);
    const [editingActivity, setEditingActivity] = useOrgBoundState(resets, null);
    // The read-only activity viewer (state §0.93): the row being read, or null.
    // Rendered by ActivityDetailDialogHost in ModalLayer; Edit hands the row to
    // editingActivity + showActivityModal.
    const [viewingActivity, setViewingActivity] = useOrgBoundState(resets, null);
    const [activityInitialContext, setActivityInitialContext] = useOrgBoundState(resets, null);

    const [parentAccountForSub, setParentAccountForSub] = useOrgBoundState(resets, null);
    const [lastCreatedAccountName, setLastCreatedAccountName] = useOrgBoundState(resets, null);
    const [accountCreatedFromOppForm, setAccountCreatedFromOppForm] = useOrgBoundState(resets, false);
    const [pendingOppFormData, setPendingOppFormData] = useOrgBoundState(resets, null);
    const [lastCreatedRepName, setLastCreatedRepName] = useOrgBoundState(resets, null);

    const [confirmModal, setConfirmModal] = useOrgBoundState(resets, null);
    // { title, label, help, placeholder, initial, submitLabel, value, onSubmit } — the
    // app's own prompt dialog; opened through showPrompt in App.jsx (state §0.79).
    const [promptModal, setPromptModal] = useOrgBoundState(resets, null);
    // {} while the coaching-note dialog is open (state §0.82); opened through
    // showCoachingNote in App.jsx, rendered by CoachingNoteDialogHost in ModalLayer.
    const [coachingNoteModal, setCoachingNoteModal] = useOrgBoundState(resets, null);
    const [blockedDeleteModal, setBlockedDeleteModal] = useOrgBoundState(resets, null);
    const [lostReasonModal, setLostReasonModal] = useOrgBoundState(resets, null);
    const [notesPopover, setNotesPopover] = useOrgBoundState(resets, null);
    const [undoToast, setUndoToast] = useOrgBoundState(resets, null);

    const [taskReminderPopup, setTaskReminderPopup] = useOrgBoundState(resets, null);
    const [taskReminderSnoozeH, setTaskReminderSnoozeH] = useOrgBoundState(resets, 0);
    const [taskReminderSnoozeM, setTaskReminderSnoozeM] = useOrgBoundState(resets, 15);
    const [taskDuePopup, setTaskDuePopup] = useOrgBoundState(resets, null);
    const [taskDueQueue, setTaskDueQueue] = useOrgBoundState(resets, []);
    const [taskDueSnoozeH, setTaskDueSnoozeH] = useOrgBoundState(resets, 0);
    const [taskDueSnoozeM, setTaskDueSnoozeM] = useOrgBoundState(resets, 15);
    const [dismissedDueTodayAlerts, setDismissedDueTodayAlerts] = useOrgBoundState(resets, []);
    const [snoozedDueAlerts, setSnoozedDueAlerts] = useOrgBoundState(resets, {}); // { [taskId]: re-alert-at timestamp (ms) }
    const [dismissedReminders, setDismissedReminders] = useOrgBoundState(resets, []);

    return {
        resetOnOrgSwitch: resetAllOf(resets),
        showModal, setShowModal,
        showSpiffClaimModal, setShowSpiffClaimModal,
        spiffClaimContext, setSpiffClaimContext,
        showAccountModal, setShowAccountModal,
        showUserModal, setShowUserModal,
        showTaskModal, setShowTaskModal,
        showContactModal, setShowContactModal,
        showActivityModal, setShowActivityModal,
        showShortcuts, setShowShortcuts,
        showCsvImportModal, setShowCsvImportModal,
        showLeadImportModal, setShowLeadImportModal,
        showLeadModal, setShowLeadModal,
        showOutlookImportModal, setShowOutlookImportModal,
        csvImportType, setCsvImportType,
        mergeModal, setMergeModal,
        contactMergeModal, setContactMergeModal,
        settingsOpenPanel, setSettingsOpenPanel,
        // Rail state
        taskRailId,      setTaskRailId,
        taskRailMode,    setTaskRailMode,
        contactRailId,   setContactRailId,
        contactRailMode, setContactRailMode,
        accountRailId,   setAccountRailId,
        accountRailMode, setAccountRailMode,
        railStack,       setRailStack,
        documentRailId, setDocumentRailId,
        showUploadRail, setShowUploadRail, uploadRailContext, setUploadRailContext,
        showDocLinkPicker, setShowDocLinkPicker, docLinkPickerContext, setDocLinkPickerContext,
        editingOpp, setEditingOpp,
        editingAccount, setEditingAccount,
        editingSubAccount, setEditingSubAccount,
        editingUser, setEditingUser,
        editingTask, setEditingTask,
        editingContact, setEditingContact,
        editingActivity, setEditingActivity,
        viewingActivity, setViewingActivity,
        activityInitialContext, setActivityInitialContext,
        parentAccountForSub, setParentAccountForSub,
        lastCreatedAccountName, setLastCreatedAccountName,
        accountCreatedFromOppForm, setAccountCreatedFromOppForm,
        pendingOppFormData, setPendingOppFormData,
        lastCreatedRepName, setLastCreatedRepName,
        confirmModal, setConfirmModal,
        promptModal, setPromptModal,
        coachingNoteModal, setCoachingNoteModal,
        blockedDeleteModal, setBlockedDeleteModal,
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
        dismissedDueTodayAlerts, setDismissedDueTodayAlerts,
        snoozedDueAlerts, setSnoozedDueAlerts,
        dismissedReminders, setDismissedReminders,
    };
}
