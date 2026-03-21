import React, { useState } from 'react';

function QuotaRepCard({ u, quotaMode, quarters, dotBg, dotTxt, inputSt, updateRepField, compactInput }) {
    const initials = (name) => (name||'').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
    const cardStyle = { background:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', overflow:'hidden' };
    const topStyle  = { display:'flex', alignItems:'center', gap:'10px', padding:'0.75rem 1rem', borderBottom:'1px solid #f1f5f9' };
    const bodyStyle = { padding:'0.875rem 1rem', display:'flex', flexDirection:'column', gap:'8px' };
    const lblStyle  = { fontSize:'0.625rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'3px' };
    const qGridStyle = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px' };

    // Use local state for the input values so typing feels instant.
    // Only persist to DB on blur (when user leaves the field) to avoid
    // writing partial/zero values on every keystroke.
    const [localAnnual, setLocalAnnual] = React.useState(u.annualQuota != null ? String(u.annualQuota) : '');
    const [localQ, setLocalQ] = React.useState(() => {
        const out = {};
        ['q1','q2','q3','q4'].forEach(q => { out[q] = u[q+'Quota'] != null ? String(u[q+'Quota']) : ''; });
        return out;
    });

    // Sync local state when the user record updates from outside (e.g. initial DB load)
    React.useEffect(() => { setLocalAnnual(u.annualQuota != null ? String(u.annualQuota) : ''); }, [u.annualQuota]);
    React.useEffect(() => {
        setLocalQ(prev => {
            const out = { ...prev };
            ['q1','q2','q3','q4'].forEach(q => { out[q] = u[q+'Quota'] != null ? String(u[q+'Quota']) : ''; });
            return out;
        });
    }, [u.q1Quota, u.q2Quota, u.q3Quota, u.q4Quota]);

    const commitAnnual = (rawVal) => {
        const val = parseFloat(rawVal);
        if (!isNaN(val) && val >= 0) updateRepField(u.id, 'annualQuota', val);
    };
    const commitQ = (qKey, rawVal) => {
        const val = parseFloat(rawVal);
        if (!isNaN(val) && val >= 0) updateRepField(u.id, qKey + 'Quota', val);
    };

    // compactInput mode — renders only the input(s), no card wrapper
    // Used by the Option C list layout where the card chrome is handled by the row
    if (compactInput) {
        if (quotaMode === 'annual') {
            return (
                <input type="number" value={localAnnual} placeholder="0"
                    onChange={e => setLocalAnnual(e.target.value)}
                    onBlur={e => { e.target.style.borderColor='#e2e8f0'; commitAnnual(e.target.value); }}
                    onFocus={e => e.target.style.borderColor='#2563eb'}
                    style={inputSt} />
            );
        }
        return (
            <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                {[['Q1','Q2'],['Q3','Q4']].map((pair, pi) => (
                    <div key={pi} style={{ display:'flex', gap:'4px' }}>
                        {pair.map(q => {
                            const qKey = q.toLowerCase();
                            return (
                                <div key={q} style={{ display:'flex', flexDirection:'column', gap:'1px' }}>
                                    <div style={{ fontSize:'0.5rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase' }}>{q}</div>
                                    <input type="number" value={localQ[qKey]||''} placeholder="0"
                                        onChange={e => setLocalQ(prev => ({ ...prev, [qKey]: e.target.value }))}
                                        onBlur={e => { e.target.style.borderColor='#e2e8f0'; commitQ(qKey, e.target.value); }}
                                        onFocus={e => e.target.style.borderColor='#2563eb'}
                                        style={inputSt} />
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div style={cardStyle}>
            <div style={topStyle}>
                <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:dotBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.6875rem', fontWeight:'700', color:dotTxt, flexShrink:0 }}>
                    {initials(u.name)}
                </div>
                <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:'0.8125rem', fontWeight:'700', color:'#1e293b', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{u.name}</div>
                    <div style={{ fontSize:'0.6875rem', color:'#94a3b8', marginTop:'1px' }}>{u.team || u.territory || 'No team'}</div>
                </div>
            </div>
            <div style={bodyStyle}>
                {quotaMode === 'annual' ? (
                    <div>
                        <div style={lblStyle}>Annual quota</div>
                        <input type="number" value={localAnnual} placeholder="0"
                            onChange={e => setLocalAnnual(e.target.value)}
                            onBlur={e => { e.target.style.borderColor='#e2e8f0'; commitAnnual(e.target.value); }}
                            onFocus={e => e.target.style.borderColor='#2563eb'}
                            style={inputSt} />
                    </div>
                ) : (
                    <div style={qGridStyle}>
                        {quarters.map(q => {
                            const qKey = q.toLowerCase();
                            return (
                                <div key={q}>
                                    <div style={lblStyle}>{q}</div>
                                    <input type="number" value={localQ[qKey]||''} placeholder="0"
                                        onChange={e => setLocalQ(prev => ({ ...prev, [qKey]: e.target.value }))}
                                        onBlur={e => { e.target.style.borderColor='#e2e8f0'; commitQ(qKey, e.target.value); }}
                                        onFocus={e => e.target.style.borderColor='#2563eb'}
                                        style={{ ...inputSt, fontSize:'0.8125rem' }} />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}


