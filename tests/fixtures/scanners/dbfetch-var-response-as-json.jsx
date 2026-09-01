// MUST BE CAUGHT — the third class. Found live in TasksTab, Sep 2026 (four
// sites) and ReportsTab (two more the new class surfaced on its first run):
// the Response is captured in a VARIABLE and its properties read as if it were
// parsed JSON. `data?.task` is undefined forever, so the else branch REVERTED
// the optimistic update on every SUCCESSFUL save. A VariableDeclarator is not
// an ExpressionStatement and not a .then() callback, so the first two classes
// walked straight past it and the gate reported 0.
const snooze = async (task, updated) => {
    setTasks(prev => prev.map(t => t.id === task.id ? updated : t));
    try {
        const data = await dbFetch('/.netlify/functions/tasks', { method: 'PUT', body: JSON.stringify(updated) });
        if (data?.task) {
            setTasks(prev => prev.map(t => t.id === task.id ? data.task : t));
        } else {
            setTasks(prev => prev.map(t => t.id === task.id ? task : t));
        }
    } catch {
        setTasks(prev => prev.map(t => t.id === task.id ? task : t));
    }
};

// The ReportsTab variant: non-optional member read, .catch() in the chain
// (which still yields the Response), and the fallback masking the undefined.
const saveReport = async (payload) => {
    const data = await dbFetch('/.netlify/functions/saved-reports', { method: 'POST', body: JSON.stringify(payload) }).catch(() => null);
    setList(prev => [data.report || payload, ...prev]);
};
