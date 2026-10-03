// settings/shared/useRegisterSave.js — hand the leave guard this panel's save.
//
// AdminView's leave guard ("Save changes and continue") runs whatever save the
// open panel last put in settingsSaveRef. Panels put it there in an effect
// keyed on [dirty], which froze it at the FIRST edit: the save closes over the
// form, so the guard saved the form as it was then — "AB" typed, "A" saved
// (state §0.164, observed in Accelerep QA). Three panels set it during render
// and never took it back, so a later panel with no save of its own could have
// the guard run the earlier panel's save and drop the edit on screen.
//
// Now every render hands over the save that render built — the one that sees
// what is on screen — and unmounting takes it back. No dependency list, on
// purpose: the save is a new function on every render.
import { useEffect } from 'react';

export function useRegisterSave(settingsSaveRef, dirty, save) {
    useEffect(() => {
        if (!settingsSaveRef) return undefined;
        settingsSaveRef.current = dirty ? save : null;
        return () => { if (settingsSaveRef) settingsSaveRef.current = null; };
    });
}
