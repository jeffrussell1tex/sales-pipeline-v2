import React, { useState, useEffect, useRef } from 'react';

export default function TaskItem({ task, opportunities, contacts, accounts, onEdit, onComplete, onDelete, onView, onPrep, rowIndex }) {
    const relatedOpp = task.opportunityId ? (opportunities || []).find(o => o.id === task.opportunityId) : null;
    const relatedContact = task.contactId ? (contacts || []).find(c => c.id === task.contactId) : null;
    const relatedAccount = task.accountId ? (accounts || []).find(a => a.id === task.accountId) : null;
    
    const status = task.status || (task.completed ? 'Completed' : 'Open');
    const isOverdue = status !== 'Completed' && task.dueDate && new Date(task.dueDate) < new Date(new Date().toISOString().split('T')[0]);
    const statusColors = { 'Open': { bg: '#dbeafe', color: '#1e40af' }, 'In-Process': { bg: '#fef3c7', color: '#92400e' }, 'Completed': { bg: '#dcfce7', color: '#166534' } };
    const sc = statusColors[status] || statusColors['Open'];
    
    return (
        <div style={{ 
            padding: '0.875rem 1rem', 
            marginBottom: '0.375rem',
            border: '1px solid ' + (isOverdue ? 'var(--accent-danger)' : 'var(--border-color)'),
            borderRadius: '6px',
            background: status === 'Completed' ? 'var(--bg-tertiary)' : (rowIndex != null && rowIndex % 2 !== 0 ? '#f8fafc' : 'white'),
            opacity: status === 'Completed' ? 0.7 : 1,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            transition: 'all 0.2s ease',
            cursor: onView ? 'pointer' : 'default'
        }}
        onClick={(e) => {
            if (onView && !e.target.closest('select') && !e.target.closest('.action-buttons') && !e.target.closest('button')) {
                onView(task);
            }
        }}
        onMouseEnter={e => { if (onView) e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.08)'; }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
        >
            <div style={{ flex: 1, display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <select
                    value={status}
                    onChange={e => { e.stopPropagation(); onComplete(task.id, e.target.value); }}
                    style={{
                        padding: '0.25rem 0.375rem', border: '1px solid #e2e8f0', borderRadius: '4px',
                        fontSize: '0.6875rem', fontWeight: '700', cursor: 'pointer', flexShrink: 0,
                        background: sc.bg, color: sc.color, fontFamily: 'inherit', width: '90px'
                    }}
                >
                    <option value="Open">Open</option>
                    <option value="In-Process">In-Process</option>
                    <option value="Completed">Completed</option>
                </select>
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                        <h4 style={{ 
                            fontWeight: '700', 
                            fontSize: '0.9375rem', 
                            margin: 0,
                            textDecoration: status === 'Completed' ? 'line-through' : 'none',
                            color: status === 'Completed' ? 'var(--text-secondary)' : 'var(--text-primary)'
                        }}>{task.title}</h4>
                        <span style={{ 
                            background: '#2563eb', color: 'white', padding: '0.125rem 0.5rem', 
                            borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '600'
                        }}>{task.type}</span>
                        {isOverdue && (
                            <span style={{ 
                                background: '#ef4444', color: 'white', padding: '0.125rem 0.5rem', 
                                borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '600'
                            }}>OVERDUE</span>
                        )}
                    </div>
                    {task.description && (
                        <p style={{ color: '#64748b', fontSize: '0.8125rem', margin: '0 0 0.25rem 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: '1.4' }}>{task.description}</p>
                    )}
                    <div style={{ fontSize: '0.8125rem', color: '#64748b', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        <span>Due: {new Date(task.dueDate).toLocaleDateString()} {task.dueTime && 'at ' + task.dueTime}</span>
                        {relatedOpp && <span>Opp: <strong>{relatedOpp.opportunityName || relatedOpp.account}</strong></span>}
                        {relatedContact && <span>Contact: <strong>{relatedContact.firstName} {relatedContact.lastName}</strong></span>}
                        {relatedAccount && <span>Account: <strong>{relatedAccount.name}</strong></span>}
                        {!relatedOpp && !relatedContact && !relatedAccount && task.relatedTo && <span>Related: {task.relatedTo}</span>}
                    </div>
                </div>
            </div>
            <div style={{ flexShrink: 0, display: 'flex', gap: '4px' }}>
                {onPrep && task.opportunityId && (
                    <button onClick={(e) => { e.stopPropagation(); onPrep(task); }} style={{ padding: '4px 8px', borderRadius: '999px', border: '0.5px solid #7c3aed', background: '#f5f3ff', color: '#6d28d9', fontWeight: '600', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Prep</button>
                )}
                <button onClick={(e) => { e.stopPropagation(); onEdit(task); }} style={{ padding: '4px 10px', borderRadius: '999px', border: '0.5px solid #94a3b8', background: 'transparent', color: '#475569', fontWeight: '500', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Edit</button>
                <button onClick={(e) => { e.stopPropagation(); onDelete(task.id); }} style={{ padding: '4px 10px', borderRadius: '999px', border: '0.5px solid #fca5a5', background: 'transparent', color: '#dc2626', fontWeight: '500', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Delete</button>
            </div>
        </div>
    );
}

// Simple three-dropdown time picker (Hour | Minute | AM/PM)
