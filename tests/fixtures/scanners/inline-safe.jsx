// MUST NOT BE CAUGHT as user-visible. Panel renders {children} but no call site
// passes a form control — this is the ReportsTab <Panel> shape, 12 of them, and
// flagging those would have turned CI red over presentational wrappers.
const Report = () => {
    const Panel = ({ children }) => <div className="panel">{children}</div>;
    return <Panel><table><tbody><tr><td>data</td></tr></tbody></table></Panel>;
};
