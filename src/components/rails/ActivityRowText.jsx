// ActivityRowText — what an activity row shows in a rail's Activity History
// (state §0.93, item 26): a bold one-line title when the activity has a subject
// (every logged email does), and the snippet clamped to two lines. Before this
// the rails rendered the whole notes field unclamped — a long email was a wall
// of 12px text — and the row was not clickable. Module scope, data as props.
import React from 'react';
import { previewOf } from '../../utils/activityView';

const INK = '#2a2622', INK2 = '#5a544c';
const CLAMP2 = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' };

export default function ActivityRowText({ activity }) {
    const { title, snippet } = previewOf(activity);
    return (
        <>
            {title && <div style={{ fontSize: 12, fontWeight: 600, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>}
            <div style={{ fontSize: 12, color: INK2, ...CLAMP2 }}>{snippet || (title ? '' : 'No details')}</div>
        </>
    );
}
