// MUST BE CAUGHT — the ReportsTab crash, Aug 2026.
// EntitySelector was hoisted to module scope (it owns an <input autoFocus>, so it
// must not be redeclared per render) but kept reading T from its old parent scope.
// Threw "T is not defined" and took down the whole Reports tab.
// check-tdz skipped it: /^[A-Z_]+$/ matched the single capital and treated T as an
// imported SCREAMING_CASE constant.
const Stranded = ({ label }) => (
    <div style={{ background: T.surface, color: T.ink }}>{label}</div>
);

function Parent() {
    const T = { surface: '#fff', ink: '#000' };
    return <Stranded label="x" />;
}
