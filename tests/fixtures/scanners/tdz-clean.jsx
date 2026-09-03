// MUST NOT BE CAUGHT. Correct declaration order, and IMPORTED_CONST is genuinely
// external — all-caps and bound nowhere in this file, so the shouty-constant
// escape should still apply to it. Everything else is declared or imported, so any
// finding here is a false positive.
import { IMPORTED_CONST } from './elsewhere';
import { build } from './builder';
import Imported, { Named } from './components';

// Every way a JSX element name can be legitimately bound: an import (default and
// named), a module-scope declaration, a prop parameter, a destructured local, a
// member root (React.Fragment), and lower-case intrinsic elements. None of these
// is a finding.
const Local = ({ children }) => <span>{children}</span>;

// A default-exported declaration is module scope; a sibling export may render it.
export default function Dialog() { return <Local>d</Local>; }
export function DialogHost() { return <Dialog/>; }

function Tab({ Icon }) {
    const [servicePlans, setServicePlans] = React.useState([]);
    const visitQueue = React.useMemo(() => build(servicePlans), [servicePlans]);
    const { Slot } = { Slot: Local };
    return (
        <React.Fragment>
            <Imported/>
            <Named/>
            <Local><Icon/></Local>
            <Slot>x</Slot>
            <div style={{ color: IMPORTED_CONST }}>{visitQueue.length}</div>
        </React.Fragment>
    );
}
