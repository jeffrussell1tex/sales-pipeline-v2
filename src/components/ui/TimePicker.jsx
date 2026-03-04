import React, { useState, useEffect } from 'react';

export default function TimePicker({ value, onChange }) {
    const parse = (val) => {
        if (!val) return { hour: '', minute: '00', period: 'AM' };
        const [h, m] = val.split(':').map(Number);
        return {
            hour: String(h === 0 ? 12 : h > 12 ? h - 12 : h),
            minute: String(m).padStart(2, '0'),
            period: h >= 12 ? 'PM' : 'AM'
        };
    };

    const [hour, setHour] = useState(() => parse(value).hour);
    const [minute, setMinute] = useState(() => parse(value).minute);
    const [period, setPeriod] = useState(() => parse(value).period);

    // Sync internal state when value prop changes externally
    useEffect(() => {
        const p = parse(value);
        setHour(p.hour);
        setMinute(p.minute);
        setPeriod(p.period);
    }, [value]);

    const emit = (h, m, p) => {
        if (!h) { onChange(''); return; }
        let hr = parseInt(h);
        if (p === 'AM' && hr === 12) hr = 0;
        else if (p === 'PM' && hr !== 12) hr += 12;
        onChange(String(hr).padStart(2, '0') + ':' + String(m).padStart(2, '0'));
    };

    const selStyle = {
        flex: 1, padding: '0.5rem 0.25rem', border: '1px solid #e2e8f0',
        borderRadius: '4px', fontSize: '0.875rem', fontFamily: 'inherit',
        background: '#fff', cursor: 'pointer', textAlign: 'center'
    };

    return (
        <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
            <select value={hour} onChange={e => { setHour(e.target.value); emit(e.target.value, minute, period); }} style={selStyle}>
                <option value="">--</option>
                {[1,2,3,4,5,6,7,8,9,10,11,12].map(h => <option key={h} value={String(h)}>{h}</option>)}
            </select>
            <span style={{ color: '#64748b', fontWeight: '700', fontSize: '1rem' }}>:</span>
            <select value={minute} onChange={e => { setMinute(e.target.value); emit(hour, e.target.value, period); }} style={selStyle}>
                {[0,5,10,15,20,25,30,35,40,45,50,55].map(m => (
                    <option key={m} value={String(m).padStart(2,'0')}>{String(m).padStart(2,'0')}</option>
                ))}
            </select>
            <select value={period} onChange={e => { setPeriod(e.target.value); emit(hour, minute, e.target.value); }} style={{ ...selStyle, flex: 'none', width: '60px' }}>
                <option value="AM">AM</option>
                <option value="PM">PM</option>
            </select>
        </div>
    );
}
