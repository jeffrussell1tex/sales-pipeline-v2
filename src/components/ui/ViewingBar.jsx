import React, { useState, useEffect, useRef } from 'react';

export default function ViewingBar({
    // Pipeline
    allPipelines, activePipeline, setActivePipelineId,
    // Rep/Team/Territory — only shown when canSeeAll
    canSeeAll, allRepNames, allTeamNames, allTerritoryNames,
    viewingRep, setViewingRep,
    viewingTeam, setViewingTeam,
    viewingTerritory, setViewingTerritory,
    // Counts for status text
    visibleCount, totalCount, countLabel,
    isAdmin,
}) {
    const hasPipelineChoice = allPipelines.length > 1;
    const hasSlicers = canSeeAll && (allRepNames.length > 1 || allTeamNames.length > 0 || allTerritoryNames.length > 0);
    if (!hasPipelineChoice && !hasSlicers) return null;

    const isFiltered = viewingRep || viewingTeam || viewingTerritory;
    const clearAll = () => { setViewingRep(null); setViewingTeam(null); setViewingTerritory(null); };

    return (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.65rem 1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0, marginRight: '0.125rem' }}>Viewing:</span>

            {/* Pipeline dropdown */}
            {hasPipelineChoice && (
                <SliceDropdown
                    label="Pipeline"
                    icon="🔀"
                    options={allPipelines.map(p => p.name)}
                    selected={activePipeline.name}
                    colorMap={Object.fromEntries(allPipelines.map(p => [p.name, p.color]))}
                    activeColor={activePipeline.color}
                    onSelect={name => {
                        const p = allPipelines.find(pl => pl.name === name);
                        if (p) setActivePipelineId(p.id);
                    }}
                    alwaysActive
                />
            )}

            {/* Separator if both pipeline + slicers */}
            {hasPipelineChoice && hasSlicers && (
                <span style={{ color: '#e2e8f0', fontSize: '1rem', userSelect: 'none' }}>│</span>
            )}

            {/* Rep / Team / Territory slicers */}
            {hasSlicers && allRepNames.length > 1 && (
                <SliceDropdown label="Rep" icon="👤" options={allRepNames} selected={viewingRep}
                    onSelect={v => { setViewingRep(v); if (v) { setViewingTeam(null); setViewingTerritory(null); } }} />
            )}
            {hasSlicers && allTeamNames.length > 0 && (
                <SliceDropdown label="Team" icon="👥" options={allTeamNames} selected={viewingTeam}
                    onSelect={v => { setViewingTeam(v); if (v) { setViewingRep(null); setViewingTerritory(null); } }} />
            )}
            {hasSlicers && allTerritoryNames.length > 0 && (
                <SliceDropdown label="Territory" icon="📍" options={allTerritoryNames} selected={viewingTerritory}
                    onSelect={v => { setViewingTerritory(v); if (v) { setViewingRep(null); setViewingTeam(null); } }} />
            )}

            {/* Count + Clear */}
            {isFiltered && (
                <>
                    <span style={{ fontSize: '0.6875rem', color: '#94a3b8', marginLeft: '0.25rem' }}>
                        {visibleCount} of {totalCount} {countLabel || 'items'}
                    </span>
                    <button onClick={clearAll}
                        style={{ marginLeft: 'auto', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid #e2e8f0', background: '#fff', color: '#94a3b8', fontSize: '0.625rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                        ✕ Clear
                    </button>
                </>
            )}
        </div>
    );
}

// ── SliceDropdown ─────────────────────────────────────────────────
// A compact dropdown button that opens a floating checklist of options.
// props: label, icon, options (array of strings), selected (string|null),
//        onSelect(value|null) — single-select; null means "clear"
//        alwaysActive — button stays colored even with no selection (pipeline use)
//        activeColor — override the active blue with a custom color
//        colorMap — optional {optionName: color} to show color dots per option
export function SliceDropdown({ label, icon, options, selected, onSelect, alwaysActive, activeColor, colorMap }) {
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef(null);

    // Close on outside click
    React.useEffect(() => {
        if (!open) return;
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const isActive = !!selected || alwaysActive;
    const btnColor = activeColor || '#2563eb';
    const btnStyle = {
        display: 'flex', alignItems: 'center', gap: '0.375rem',
        padding: '0.3rem 0.625rem', borderRadius: '6px', cursor: 'pointer',
        fontFamily: 'inherit', fontSize: '0.6875rem', fontWeight: '700',
        transition: 'all 0.15s', whiteSpace: 'nowrap',
        border: '1px solid ' + (isActive ? btnColor : '#e2e8f0'),
        background: isActive ? btnColor : '#fff',
        color: isActive ? '#fff' : '#64748b',
    };
    const dropStyle = {
        position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200,
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: '170px', overflow: 'hidden',
    };
    const rowStyle = (isSelected) => ({
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.8125rem',
        color: isSelected ? '#2563eb' : '#1e293b', fontWeight: isSelected ? '700' : '400',
        background: isSelected ? '#eff6ff' : 'transparent',
        transition: 'background 0.1s',
    });

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button onClick={() => setOpen(o => !o)} style={btnStyle}>
                {icon && <span>{icon}</span>}
                <span>{selected ? `${label}: ${selected}` : label}</span>
                <span style={{ fontSize: '0.5625rem', opacity: 0.7 }}>{open ? '▲' : '▼'}</span>
            </button>
            {open && (
                <div style={dropStyle}>
                    {/* Clear / All option — hidden when alwaysActive (pipeline must always have a selection) */}
                    {!alwaysActive && (
                    <div
                        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        onClick={() => { onSelect(null); setOpen(false); }}
                        style={{ ...rowStyle(!selected), borderBottom: '1px solid #f1f5f9' }}
                    >
                        <span style={{ width: '14px', textAlign: 'center', fontSize: '0.75rem' }}>{!selected ? '✓' : ''}</span>
                        <span>All</span>
                    </div>
                    )}
                    {options.map(opt => (
                        <div key={opt}
                            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                            onMouseLeave={e => e.currentTarget.style.background = selected === opt ? '#eff6ff' : 'transparent'}
                            onClick={() => { onSelect(selected === opt && !alwaysActive ? null : opt); setOpen(false); }}
                            style={rowStyle(selected === opt)}
                        >
                            {colorMap && colorMap[opt]
                                ? <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: colorMap[opt], display: 'inline-block', flexShrink: 0 }} />
                                : <span style={{ width: '14px', textAlign: 'center', fontSize: '0.75rem' }}>{selected === opt ? '✓' : ''}</span>
                            }
                            <span>{opt}</span>
                            {colorMap && selected === opt && <span style={{ marginLeft: 'auto', fontSize: '0.75rem' }}>✓</span>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

