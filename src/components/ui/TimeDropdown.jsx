import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';

// ── Design tokens (Option D handoff — warm stone/ink) ─────────────────────────
const T = {
    sans:         '"Plus Jakarta Sans", system-ui, sans-serif',
    bg:           '#f0ece4',
    surface:      '#fbf8f3',
    border:       '#e6ddd0',
    borderStrong: '#d4c8b4',
    ink:          '#2a2622',
    inkMid:       '#5a544c',
    inkMuted:     '#8a8378',
    goldInk:      '#7a6a48',
    tint:         'rgba(200,185,154,0.20)',
    radiusMd:     4,
};

const MENU_MAX_H = 214;

// ── Small inline icons (stroke inherits via color prop) ───────────────────────
function ClockIcon({ size = 13, color = T.inkMid }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
    );
}
function ChevDownIcon({ size = 13, color = T.inkMuted }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <polyline points="6 9 12 15 18 9"/>
        </svg>
    );
}
function CheckIcon({ size = 12, color = T.goldInk }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <polyline points="20 6 9 17 4 12"/>
        </svg>
    );
}

// ── Time helpers — canonical storage is 24h 'HH:mm' ('' = unset) ──────────────
const pad2 = (n) => String(n).padStart(2, '0');

function toLabel(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${pad2(m)} ${period}`;
}

function buildTimes(stepMinutes) {
    const out = [];
    for (let mins = 0; mins < 24 * 60; mins += stepMinutes) {
        out.push(pad2(Math.floor(mins / 60)) + ':' + pad2(mins % 60));
    }
    return out;
}

// Type-to-search: digits (with optional a/p suffix) and a few cheap aliases.
// '3' → 3:00 PM, '93' → 9:30 AM, '930' → 9:30 AM, '3p' → 3:00 PM,
// 'noon' → 12:00 PM, 'eod' → 5:00 PM, 'mid…' → 12:00 AM.
function resolveTypeahead(buf, options) {
    const q = buf.toLowerCase();
    if ('noon'.startsWith(q)) return options.indexOf('12:00');
    if ('eod'.startsWith(q)) return options.indexOf('17:00');
    if ('midnight'.startsWith(q)) return options.indexOf('00:00');

    const m = q.match(/^(\d{1,4})(a|p)?m?$/);
    if (!m) {
        // Fallback: plain prefix match on the formatted label
        const idx = options.findIndex((t) => toLabel(t).toLowerCase().startsWith(q));
        return idx;
    }
    const digits = m[1];
    const suffix = m[2] || null;
    let h, min;
    if (digits.length <= 2) {
        const asNum = parseInt(digits, 10);
        if (digits.length === 2 && asNum > 23) {
            // '93' → hour 9, minute-tens 3 → 9:30
            h = parseInt(digits[0], 10);
            min = parseInt(digits[1], 10) * 10;
        } else {
            h = asNum;
            min = 0;
        }
    } else {
        // '930' / '1530' → last two digits are minutes
        h = parseInt(digits.slice(0, -2), 10);
        min = parseInt(digits.slice(-2), 10);
    }
    if (Number.isNaN(h) || h > 23 || min > 59) return -1;

    // Period: explicit suffix wins; otherwise assume the workday reading
    // (1–7 → PM, 8–11 → AM, 12 → PM). 0 or 13–23 are taken as 24h literals.
    if (suffix === 'p' && h < 12) h += 12;
    else if (suffix === 'a' && h === 12) h = 0;
    else if (!suffix && h >= 1 && h <= 7) h += 12;

    // Snap to the nearest option at or after the requested minute
    const targetMins = h * 60 + min;
    let best = -1, bestDist = Infinity;
    options.forEach((t, i) => {
        const [oh, om] = t.split(':').map(Number);
        const d = Math.abs(oh * 60 + om - targetMins);
        if (d < bestDist) { bestDist = d; best = i; }
    });
    return best;
}

/**
 * TimeDropdown — Option D from the due-time design handoff.
 *
 * A compact trigger + portaled, scrollable, keyboard-navigable listbox of
 * 30-minute increments. Replaces native <input type="time"> everywhere a
 * time-of-day is picked.
 *
 * Value contract: 24h 'HH:mm' string for storage; '' (empty string) = unset.
 * Display formatting (h:mm AM/PM) happens only inside this component.
 *
 * The menu portals to document.body with fixed positioning (viewport-aware
 * up/down flip) so it can never be clipped by a rail/panel scroll container.
 */
export default function TimeDropdown({ value, onChange, stepMinutes = 30, disabled = false, ariaLabel = 'Time' }) {
    const [open, setOpen] = useState(false);
    const [highlight, setHighlight] = useState(-1);
    const [pos, setPos] = useState(null); // { top, left, width, dropUp }
    const triggerRef = useRef(null);
    const menuRef = useRef(null);
    const typeBufRef = useRef('');
    const typeTimerRef = useRef(null);
    const uid = useRef('td_' + Math.random().toString(36).slice(2, 8)).current;

    const baseTimes = useMemo(() => buildTimes(stepMinutes), [stepMinutes]);
    // Legacy off-grid values (e.g. 09:15 saved via the old native input) are
    // inserted in sorted position so the saved time stays visible + selectable.
    const options = useMemo(() => {
        if (!value || baseTimes.includes(value)) return baseTimes;
        const merged = [...baseTimes, value];
        merged.sort();
        return merged;
    }, [baseTimes, value]);

    const selectedIndex = value ? options.indexOf(value) : -1;

    const scrollRowIntoView = useCallback((idx) => {
        const menu = menuRef.current;
        if (!menu) return;
        const row = menu.children[idx];
        if (!row) return;
        // Spec: set scrollTop directly — no scrollIntoView (it scrolls ancestors too)
        if (row.offsetTop < menu.scrollTop) {
            menu.scrollTop = row.offsetTop;
        } else if (row.offsetTop + row.offsetHeight > menu.scrollTop + menu.clientHeight) {
            menu.scrollTop = row.offsetTop + row.offsetHeight - menu.clientHeight;
        }
    }, []);

    const openMenu = useCallback(() => {
        if (disabled) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const dropUp = spaceBelow < MENU_MAX_H + 12 && rect.top > MENU_MAX_H + 12;
        setPos({
            left: rect.left,
            width: rect.width,
            top: dropUp ? rect.top - 5 : rect.bottom + 5,
            dropUp,
        });
        const start = selectedIndex >= 0 ? selectedIndex : options.indexOf('09:00');
        setHighlight(start >= 0 ? start : 0);
        setOpen(true);
    }, [disabled, selectedIndex, options]);

    const closeMenu = useCallback(() => {
        setOpen(false);
        setPos(null);
        typeBufRef.current = '';
    }, []);

    const select = useCallback((t) => {
        onChange(t);
        closeMenu();
        triggerRef.current?.focus();
    }, [onChange, closeMenu]);

    // On open: bring the highlighted row into view
    useEffect(() => {
        if (open && highlight >= 0) scrollRowIntoView(highlight);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Close on outside click, outside scroll, and resize
    useEffect(() => {
        if (!open) return;
        const onDown = (e) => {
            if (triggerRef.current?.contains(e.target)) return;
            if (menuRef.current?.contains(e.target)) return;
            closeMenu();
        };
        const onScroll = (e) => {
            // Ignore the menu's own internal scrollbar
            if (menuRef.current?.contains(e.target)) return;
            closeMenu();
        };
        const onResize = () => closeMenu();
        document.addEventListener('mousedown', onDown);
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onResize);
        return () => {
            document.removeEventListener('mousedown', onDown);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onResize);
        };
    }, [open, closeMenu]);

    const moveHighlight = useCallback((next) => {
        const clamped = Math.max(0, Math.min(options.length - 1, next));
        setHighlight(clamped);
        scrollRowIntoView(clamped);
    }, [options.length, scrollRowIntoView]);

    const onKeyDown = (e) => {
        if (disabled) return;
        if (!open) {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                openMenu();
            }
            return;
        }
        if (e.key === 'Escape') { e.preventDefault(); closeMenu(); return; }
        if (e.key === 'Tab') { closeMenu(); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); moveHighlight(highlight + 1); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); moveHighlight(highlight - 1); return; }
        if (e.key === 'Home') { e.preventDefault(); moveHighlight(0); return; }
        if (e.key === 'End') { e.preventDefault(); moveHighlight(options.length - 1); return; }
        if (e.key === 'Enter') {
            e.preventDefault();
            if (highlight >= 0 && options[highlight]) select(options[highlight]);
            return;
        }
        // Type-to-search
        if (/^[a-z0-9]$/i.test(e.key)) {
            e.preventDefault();
            typeBufRef.current += e.key.toLowerCase();
            clearTimeout(typeTimerRef.current);
            typeTimerRef.current = setTimeout(() => { typeBufRef.current = ''; }, 900);
            const idx = resolveTypeahead(typeBufRef.current, options);
            if (idx >= 0) moveHighlight(idx);
        }
    };

    useEffect(() => () => clearTimeout(typeTimerRef.current), []);

    const clear = (e) => {
        e.stopPropagation();
        e.preventDefault();
        onChange('');
        closeMenu();
        triggerRef.current?.focus();
    };

    const hasValue = !!value;

    return (
        <>
            <button
                type="button"
                ref={triggerRef}
                onClick={() => (open ? closeMenu() : openMenu())}
                onKeyDown={onKeyDown}
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={ariaLabel}
                aria-activedescendant={open && highlight >= 0 ? `${uid}-opt-${highlight}` : undefined}
                style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', boxSizing: 'border-box',
                    padding: '8px 10px', background: T.bg,
                    border: open ? `1.5px solid ${T.goldInk}` : `1px solid ${T.border}`,
                    // Compensate the 0.5px border delta so the field doesn't shift when opened
                    margin: open ? '-0.5px' : 0,
                    borderRadius: T.radiusMd, cursor: disabled ? 'default' : 'pointer',
                    fontFamily: T.sans, textAlign: 'left', opacity: disabled ? 0.55 : 1,
                }}
            >
                <ClockIcon size={13} color={T.inkMid}/>
                <span style={{ fontSize: 13, fontWeight: 600, color: hasValue ? T.ink : T.inkMuted, whiteSpace: 'nowrap' }}>
                    {hasValue ? toLabel(value) : 'Select time'}
                </span>
                <span style={{ flex: 1 }}/>
                {hasValue && !disabled && (
                    <span
                        role="button"
                        aria-label="Clear time"
                        tabIndex={-1}
                        onClick={clear}
                        style={{ fontSize: 14, lineHeight: 1, color: T.inkMuted, padding: '0 2px', cursor: 'pointer' }}
                    >×</span>
                )}
                <ChevDownIcon size={13} color={T.inkMuted}/>
            </button>

            {open && pos && createPortal(
                <div
                    ref={menuRef}
                    role="listbox"
                    aria-label={ariaLabel}
                    style={{
                        position: 'fixed', left: pos.left, width: pos.width, zIndex: 400,
                        top: pos.dropUp ? undefined : pos.top,
                        bottom: pos.dropUp ? window.innerHeight - pos.top : undefined,
                        background: T.surface, border: `1px solid ${T.borderStrong}`,
                        borderRadius: T.radiusMd, boxShadow: '0 10px 28px rgba(0,0,0,0.14)',
                        maxHeight: MENU_MAX_H, overflow: 'auto', padding: 4, boxSizing: 'border-box',
                        fontFamily: T.sans,
                    }}
                >
                    {options.map((t, i) => {
                        const on = t === value;
                        const hi = i === highlight;
                        return (
                            <div
                                key={t}
                                id={`${uid}-opt-${i}`}
                                role="option"
                                aria-selected={on}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => select(t)}
                                onMouseEnter={() => setHighlight(i)}
                                style={{
                                    padding: '6px 9px', borderRadius: 4, cursor: 'pointer', fontSize: 12.5,
                                    fontWeight: on ? 700 : 500,
                                    color: on ? T.goldInk : T.ink,
                                    background: on || hi ? T.tint : 'transparent',
                                    display: 'flex', alignItems: 'center', gap: 6,
                                }}
                            >
                                {toLabel(t)}
                                {on && <span style={{ marginLeft: 'auto', display: 'flex' }}><CheckIcon size={12} color={T.goldInk}/></span>}
                            </div>
                        );
                    })}
                </div>,
                document.body
            )}
        </>
    );
}
