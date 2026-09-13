// popoverPlacement — where a position: fixed popover goes, from its trigger's
// bounding rect (state §0.128). The popover rule (CLAUDE.md): getBoundingClientRect()
// + position: fixed, so no overflow container clips the popover or grows a
// scrollbar to fit it — the lead score's "Why this score" card did both inside
// the Triage rows (Call today / Needs first touch / Working scroll sideways).
// Below the trigger when the height fits the viewport, above it otherwise;
// left-aligned to the trigger and kept `margin` px inside the viewport.
// Pure: the viewport is injectable, so the arithmetic is unit-tested.
export function popoverPlacement(rect, { width, height, gap = 6, margin = 8, viewport } = {}) {
    const vw = viewport?.width  ?? (typeof window !== 'undefined' ? window.innerWidth  : 0);
    const vh = viewport?.height ?? (typeof window !== 'undefined' ? window.innerHeight : 0);
    const r = rect || { top: 0, bottom: 0, left: 0, right: 0 };
    const left = Math.max(margin, Math.min(r.left, vw - width - margin));
    const below = r.bottom + gap + height <= vh;
    if (below) return { left, top: r.bottom + gap };
    const above = r.top - gap - height >= margin;
    if (above) return { left, bottom: vh - r.top + gap };
    // Fits neither way: as high as it needs to be for its bottom edge to stay
    // on screen, and never above the top margin (a box taller than the
    // viewport shows its head, not its feet).
    return { left, top: Math.max(margin, vh - height - margin) };
}
