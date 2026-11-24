// src/hooks/useListLoads.js
// Holds how each of the app's record lists loaded (state §0.294; src/utils/listLoads.js, guide §18b139). `reportLoad`
// is stable, so the data hooks read it through their deps and a load reports to it whenever it ends. `loads` is the
// org on screen's alone, from the switch's own render: what the last org's lists did says nothing of this one's.
import { useCallback, useReducer } from 'react';
import { loadsReducer, loadsOf, NO_LOADS } from '../utils/listLoads.js';

export function useListLoads(activeOrgId) {
    const [state, dispatch] = useReducer(loadsReducer, NO_LOADS);
    const reportLoad = useCallback((ev) => dispatch(ev), []);
    const resetLoads = useCallback((org) => dispatch({ type: 'reset', org }), []);
    return { loads: loadsOf(state, activeOrgId), reportLoad, resetLoads };
}
