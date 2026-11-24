// src/components/ui/PanelGate.jsx
// A Settings panel that counts a list, lets a Delete by its count, or writes to the team (state §0.294, §0.295; listLoads.js
// PANEL_LISTS), by its id:
// drawn once that list was read, with its Back until then.
import React from 'react';
import { useApp } from '../../AppContext';
import { PANEL_LISTS } from '../../utils/listLoads.js';
import ListsGate from './ListsGate.jsx';

export default function PanelGate({ id, onBack, children }) {
    const { loads, retryLoads } = useApp();
    return <ListsGate loads={loads} lists={PANEL_LISTS[id]} onRetry={retryLoads} onBack={onBack}>{children}</ListsGate>;
}
