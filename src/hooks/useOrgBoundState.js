// useOrgBoundState — useState for a value that belongs to the org on screen
// (state §0.174). Each call registers how to put its value back; the hook that
// holds it hands App one reset for all of them (resetAllOf), and App runs it when
// the org switches. A record open in a modal, a selection, a rep's drill-down, a
// half-filled form or a pending confirm is the last org's after a switch — acted
// on, it names ids the new org does not have.
import { useState } from 'react';

export function useOrgBoundState(resets, initial) {
    const [value, setValue] = useState(initial);
    // A lazy initial is computed again, not handed to setValue as an updater.
    resets.push(() => setValue(typeof initial === 'function' ? initial() : initial));
    return [value, setValue];
}

// One reset for every value registered in `resets`.
export const resetAllOf = (resets) => () => {
    for (const reset of resets) reset();
};
