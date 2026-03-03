import React, { useState, useEffect, useRef } from 'react';

export default function TimePicker({ value, onChange }) {
    const parseTime = (val) => {
        if (!val) return { hour: '', minute: '', period: 'AM' };
        const [h, m] = val.split(':').map(Number);
        return { hour: h === 0 ? 12 : h > 12 ? h - 12 : h, minute: m, period: h >= 12 ? 'PM' : 'AM' };
    };
    const { hour, minute, period } = parseTime(value);
    
    const toValue = (h, m, p) => {
        if (!h) return '';
        let hr = parseInt(h);
        if (p === 'AM' && hr === 12) hr = 0;
        else if (p === 'PM' && hr !== 12) hr += 12;
        return String(hr).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    };
    
    const update = (newH, newM, newP) => {
        onChange(toValue(newH || hour, newM !== undefined ? newM : minute, newP || period));
    };
    
    const selStyle = { flex: 1, padding: '0.5rem 0.25rem', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '0.875rem', fontFamily: 'inherit', background: '#fff', cursor: 'pointer', textAlign: 'center' };
    
    return (
        <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
            <select value={hour || ''} onChange={e => { if (e.target.value === '') { onChange(''); update(parseInt(e.target.value), minute || 0, period); }}} style={selStyle}>
                <option value="">--</option>
                {[1,2,3,4,5,6,7,8,9,10,11,12].map(h => <option key={h} value={h}>{h}</option>)}
            </select>
            <span style={{ color: '#64748b', fontWeight: '700', fontSize: '1rem' }}>:</span>
            <select value={minute !== '' && minute !== undefined ? minute : ''} onChange={e => update(hour || 9, parseInt(e.target.value), period)} style={selStyle}>
                {[0,5,10,15,20,25,30,35,40,45,50,55].map(m => <option key={m} value={m}>{String(m).padStart(2,'0')}</option>)}
            </select>
            <select value={period} onChange={e => update(hour || 9, minute || 0, e.target.value)} style={{ ...selStyle, flex: 'none', width: '60px' }}>
                <option value="AM">AM</option>
                <option value="PM">PM</option>
            </select>
        </div>
    );
}

