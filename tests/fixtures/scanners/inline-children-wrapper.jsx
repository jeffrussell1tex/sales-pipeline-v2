// MUST BE CAUGHT — the AddDestinationModal focus bug, Aug 2026.
// FL owns no form control of its own; the <input> lives in the parent and is
// passed as children. riskOf() therefore scored it harmless and it shipped.
// Every keystroke gave FL a new identity, React remounted the subtree, the field
// lost focus after one character, and the next keystroke escaped to App.jsx's
// global hotkey handler and opened the New Task rail.
const Modal = () => {
    const [v, setV] = React.useState('');
    const FL = ({ label, children }) => (<div><label>{label}</label>{children}</div>);
    return <FL label="Name"><input value={v} onChange={e => setV(e.target.value)} /></FL>;
};
