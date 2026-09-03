// MUST BE CAUGHT — the Connected Apps crash, May–Sep 2026.
// `5772f63` deleted SlackConfigModal from SettingsTab.jsx while the panel kept
// rendering it. esbuild bundles an unbound JSX name as a global read, so the build
// stayed green and "Configure Slack" threw "SlackConfigModal is not defined" into
// the Settings error boundary for four months. check-tdz walked Identifier nodes
// only; a JSX element name is a JSXIdentifier and was never counted as a read.
import React from 'react';

export const Panel = ({ onBack }) => {
    const [open, setOpen] = React.useState(false);
    return (
        <div>
            {open && <SlackConfigModal onClose={() => setOpen(false)}/>}
            <button onClick={onBack}>Back</button>
        </div>
    );
};

// Rendered outside any top-level component: still a name bound nowhere.
const rows = [1, 2].map(i => <RowFromNowhere key={i}/>);
export const count = rows.length;
