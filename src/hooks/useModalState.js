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
    const [showOutlookImportModal, setShowOutlookImportModal] = useState(false);
    const [csvImportType, setCsvImportType] = useState('contacts');

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
        showOutlookImportModal, setShowOutlookImportModal,
        csvImportType, setCsvImportType,
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
        dismissedReminders, setDismissedReminders,
    };
}
