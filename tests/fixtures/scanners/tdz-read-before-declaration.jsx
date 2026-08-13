// MUST BE CAUGHT — the original TDZ class. A useMemo dependency array evaluates
// during render, so servicePlans is read before its useState runs. Legal syntax,
// runtime ReferenceError, and only in the minified production bundle.
// `build` is imported so the ONLY finding is the ordering one.
import { build } from './builder';

function Tab() {
    const visitQueue = React.useMemo(() => build(servicePlans), [servicePlans]);
    const [servicePlans, setServicePlans] = React.useState([]);
    return <div>{visitQueue.length}</div>;
}
