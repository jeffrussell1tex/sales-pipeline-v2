import { useState } from 'react';

export function useModalState() {
    const [showModal, setShowModal] = useState(false);
    const [showSpiffClaimModal, setShowSpiffClaimModal] = useState(false);
    const [spiffClaimContext, setSpiffClaimContext] = useState(null);
    const [showAccountModal, setShowAccountModal] = useState(false);
    const [showUserModal, setShowUserModal] = useState(false);
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [showContactModal, setShowContactModal] = useState(false);
    const [showActivityModal, setShowActivityModal] = useState(false);
    const [showShortcuts, setShowShortcuts] = useState(false);
    const [showCsvImportModal, setShowCsvImportModal] = useState(false);
    const [showLeadImportModal, setShowLeadImportModal] = useState(false);
    const [showLeadModal, setShowLeadModal] = useState(false);
    const [showOutlookImportModal, setShowOutlookImportModal] = useState(false);
    const [csvImportType, setCsvImportType] = useState('contacts');
    const [mergeModal, setMergeModal] = useState(null); // { aId, bId } | null
    const [contactMergeModal, setContactMergeModal] = useState(null); // { aId, bId } | null

    // ── Contact Rail ──────────────────────────────────────────────────────────
    // contactRailId: null (closed) | string id (view/edit existing) | 'new' (create)
    // contactRailMode: 'view' | 'edit' | 'new'
    const [contactRailId,   setContactRailId]   = useState(null);
    const [contactRailMode, setContactRailMode] = useState('view');

    // ── Account Rail ──────────────────────────────────────────────────────────
    // accountRailId: null (closed) | string id (view/edit existing) | 'new' (create)
    // accountRailMode: 'view' | 'edit' | 'new'
    const [accountRailId,   setAccountRailId]   = useState(null);
    const [accountRailMode, setAccountRailMode] = useState('view');

    // ── Task Rail ───────────────────────────────────────────────────────────────
    // taskRailId: null (closed) | string id (view/edit) | 'new' (create)
    // taskRailMode: 'view' | 'edit' | 'new'
    const [taskRailId,   setTaskRailId]   = useState(null);
    const [taskRailMode, setTaskRailMode] = useState('view');

    // ── Rail stack — supports Option B stacking (Contact → Account → back) ───
    // Each entry: { type: 'contact'|'account', id: string|'new', mode: string }
    const [railStack, setRailStack] = useState([]);

    // ── Document Rail / Upload / Link picker ──────────────────────────────────
    const [documentRailId,       setDocumentRailId]       = useState(null);
    const [showUploadRail,       setShowUploadRail]       = useState(false);
    const [uploadRailContext,    setUploadRailContext]    = useState(null);
    const [showDocLinkPicker,    setShowDocLinkPicker]    = useState(false);
    const [docLinkPickerContext, setDocLinkPickerContext] = useState(null);

    const [editingOpp, setEditingOpp] = useState(null);
    const [editingAccount, setEditingAccount] = useState(null);
    const [editingSubAccount, setEditingSubAccount] = useState(null);
    const [editingUser, setEditingUser] = useState(null);
    const [editingTask, setEditingTask] = useState(null);
    const [editingContact, setEditingContact] = useState(null);
    const [editingActivity, setEditingActivity] = useState(null);
    const [activityInitialContext, setActivityInitialContext] = useState(null);

    const [parentAccountForSub, setParentAccountForSub] = useState(null);
    const [lastCreatedAccountName, setLastCreatedAccountName] = useState(null);
    const [accountCreatedFromOppForm, setAccountCreatedFromOppForm] = useState(false);
    const [pendingOppFormData, setPendingOppFormData] = useState(null);
    const [lastCreatedRepName, setLastCreatedRepName] = useState(null);

    const [confirmModal, setConfirmModal] = useState(null);
    // { title, label, help, placeholder, initial, submitLabel, value, onSubmit } — the
    // app's own prompt dialog; opened through showPrompt in App.jsx (state §0.79).
    const [promptModal, setPromptModal] = useState(null);
    const [blockedDeleteModal, setBlockedDeleteModal] = useState(null);
    const [lostReasonModal, setLostReasonModal] = useState(null);
    const [notesPopover, setNotesPopover] = useState(null);
    const [undoToast, setUndoToast] = useState(null);

    const [taskReminderPopup, setTaskReminderPopup] = useState(null);
    const [taskReminderSnoozeH, setTaskReminderSnoozeH] = useState(0);
    const [taskReminderSnoozeM, setTaskReminderSnoozeM] = useState(15);
    const [taskDuePopup, setTaskDuePopup] = useState(null);
    const [taskDueQueue, setTaskDueQueue] = useState([]);
    const [taskDueSnoozeH, setTaskDueSnoozeH] = useState(0);
    const [taskDueSnoozeM, setTaskDueSnoozeM] = useState(15);
    const [dismissedDueTodayAlerts, setDismissedDueTodayAlerts] = useState([]);
    const [snoozedDueAlerts, setSnoozedDueAlerts] = useState({}); // { [taskId]: re-alert-at timestamp (ms) }
    const [dismissedReminders, setDismissedReminders] = useState([]);

    return {
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
        activityInitialContext, setActivityInitialContext,
        parentAccountForSub, setParentAccountForSub,
        lastCreatedAccountName, setLastCreatedAccountName,
        accountCreatedFromOppForm, setAccountCreatedFromOppForm,
        pendingOppFormData, setPendingOppFormData,
        lastCreatedRepName, setLastCreatedRepName,
        confirmModal, setConfirmModal,
        promptModal, setPromptModal,
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
