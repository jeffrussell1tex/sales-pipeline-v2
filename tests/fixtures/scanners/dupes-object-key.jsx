// MUST BE CAUGHT — DispatchTab:5080. A serif page title declared bold, rendering
// light. The first value is dead; esbuild warned on every build and nobody saw it.
const Header = () => (
    <div style={{ fontSize: 24, fontWeight: 700, fontStyle: 'italic', fontWeight: 300 }}>Dispatch</div>
);
