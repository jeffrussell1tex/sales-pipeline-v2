import { useState } from 'react';
import { dbFetch, requestOrg, stillOrg } from '../utils/storage';

export function useUserHandlers({ setSettings, showConfirm, showModal, setLastCreatedRepName, editingUser, setEditingUser, setShowUserModal }) {
    const [userModalError, setUserModalError] = useState(null);
    const [userModalSaving, setUserModalSaving] = useState(false);

    const handleAddUser = () => {
        setEditingUser(null);
        setShowUserModal(true);
    };

    const handleEditUser = (user) => {
        setEditingUser(user);
        setShowUserModal(true);
    };

    const handleDeleteUser = (userId) => {
        showConfirm('Are you sure you want to delete this user?', async () => {
            const askedOrg = requestOrg();   // after an org switch its answer changes nothing (state §0.175)
            try {
                const res = await dbFetch(`/.netlify/functions/users?id=${userId}`, { method: 'DELETE' });
                if (!stillOrg(askedOrg)) return;
                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    console.error('Failed to delete user:', errData.error || res.status);
                    return; // Don't remove from local state if DB delete failed
                }
                setSettings(prev => ({
                    ...prev,
                    users: (prev.users || []).filter(u => u.id !== userId)
                }));
            } catch (err) {
                console.error('Failed to delete user:', err);
            }
        });
    };

    const handleSaveUser = async (userData) => {
        const askedOrg = requestOrg();   // after an org switch its answer changes nothing (state §0.175)
        setUserModalError(null);
        setUserModalSaving(true);
        if (editingUser) {
            const payload = { ...userData, id: editingUser.id, email: userData.email || editingUser.email || '' };
            try {
                const res = await dbFetch('/.netlify/functions/users', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                const data = await res.json();
                if (!stillOrg(askedOrg)) return;
                if (!res.ok) {
                    setUserModalError(data.error || 'Failed to save user. Please try again.');
                    setUserModalSaving(false);
                    return;
                }
                if (data.user) {
                    setSettings(prev => ({
                        ...prev,
                        users: (prev.users || []).map(u => u.id === data.user.id ? data.user : u)
                    }));
                }
                setShowUserModal(false);
                setEditingUser(null);
                setUserModalError(null);
            } catch (err) {
                if (!stillOrg(askedOrg)) return;
                console.error('Failed to update user:', err);
                setUserModalError('Failed to save user. Please check your connection and try again.');
            } finally {
                setUserModalSaving(false);
            }
        } else {
            // The server mints the id (state §0.166): the member is the row it
            // answers with. An id sent from here was adopted as given.
            const { id: _noClientId, ...fields } = userData;
            const payload = { ...fields, email: userData.email || '' };
            try {
                const res = await dbFetch('/.netlify/functions/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                const data = await res.json();
                if (!stillOrg(askedOrg)) return;
                if (!res.ok) {
                    setUserModalError(data.error || 'Failed to save user. Please try again.');
                    setUserModalSaving(false);
                    return;
                }
                const savedUser = data.user;
                if (!savedUser || !savedUser.id) {
                    setUserModalError('The member was not saved. Please try again.');
                    setUserModalSaving(false);
                    return;
                }
                setSettings(prev => ({
                    ...prev,
                    users: [...(prev.users || []), savedUser]
                }));
                if (showModal) {
                    setLastCreatedRepName(savedUser.name || payload.name);
                }
                setShowUserModal(false);
                setUserModalError(null);
            } catch (err) {
                if (!stillOrg(askedOrg)) return;
                console.error('Failed to create user:', err);
                setUserModalError('Failed to save user. Please check your connection and try again.');
            } finally {
                setUserModalSaving(false);
            }
        }
    };

    return {
        userModalError, setUserModalError,
        userModalSaving, setUserModalSaving,
        handleAddUser,
        handleEditUser,
        handleDeleteUser,
        handleSaveUser,
    };
}
