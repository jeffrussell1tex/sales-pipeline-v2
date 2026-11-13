import { useState } from 'react';
import { dbFetch, requestOrg, stillOrg } from '../utils/storage';
// A removal's answer (state §0.222): the member off the roster and the lists as the server wrote them.
import { settingsAfterRemoval, removalNote } from '../utils/teamMembership.js';
import { readRefusal, failureWords } from '../utils/refusalWords.js';

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
                const answer = await res.json().catch(() => ({}));
                if (!stillOrg(askedOrg)) return;
                setSettings(prev => settingsAfterRemoval(prev, userId, answer));
                // This handler has no surface of its own (no screen calls it): it logs, as it logs a refusal.
                const left = removalNote(answer);
                if (left) console.error('Failed to delete user:', left);
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
            // Not what the form only shows (team, territory and vertical are Team Builder's), nor what is not its
            // own (the member's pins, the login link): sent as loaded, they undid a change made since (state §0.202).
            const { team: _t, teamId: _ti, territory: _tr, vertical: _v, pinnedReports: _p, clerkUserId: _c, ...fields } = userData;
            const payload = { ...fields, id: editingUser.id, email: userData.email || editingUser.email || '' };
            try {
                const res = await dbFetch('/.netlify/functions/users', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                // The ok check first, the house words (state §0.248, docs/design/refusal-sweep Part 10; Jeff's Q3).
                if (!res.ok) {
                    const why = await readRefusal(res);
                    if (!stillOrg(askedOrg)) return;
                    setUserModalError(why);
                    setUserModalSaving(false);
                    return;
                }
                const data = await res.json().catch(() => ({}));   // a landed answer that cannot be read: saved, the list as it was
                if (!stillOrg(askedOrg)) return;
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
                setUserModalError(failureWords(err));
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
                if (!res.ok) {   // as the edit's (§0.248)
                    const why = await readRefusal(res);
                    if (!stillOrg(askedOrg)) return;
                    setUserModalError(why);
                    setUserModalSaving(false);
                    return;
                }
                // The server mints the member's id: a landed answer that cannot be read is said (failureWords, below), never
                // "not saved" — the member may be on the server, and is not shown until a reload.
                const data = await res.json();
                if (!stillOrg(askedOrg)) return;
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
                setUserModalError(failureWords(err));
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
