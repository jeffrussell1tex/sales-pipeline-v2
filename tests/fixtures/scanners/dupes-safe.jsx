// MUST NOT BE CAUGHT. Computed keys may or may not collide at runtime, and a
// spread deliberately lets the later value win — that is the documented way to do
// conditional style overrides here. Neither is a duplicate literal key.
const k = 'padding';
const A = () => <div style={{ [k]: 1, [k]: 2, ...rest, padding: 3 }}>ok</div>;
const B = () => <div {...props} style={{ margin: 0 }}>ok</div>;
