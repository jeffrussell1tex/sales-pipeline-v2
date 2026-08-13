// MUST NOT BE CAUGHT. Correct declaration order, and IMPORTED_CONST is genuinely
// external — all-caps and bound nowhere in this file, so the shouty-constant
// escape should still apply to it. Everything else is declared or imported, so any
// finding here is a false positive.
import { IMPORTED_CONST } from './elsewhere';
import { build } from './builder';

function Tab() {
    const [servicePlans, setServicePlans] = React.useState([]);
    const visitQueue = React.useMemo(() => build(servicePlans), [servicePlans]);
    return <div style={{ color: IMPORTED_CONST }}>{visitQueue.length}</div>;
}
