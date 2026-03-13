/**
 * send-email.mjs
 * Shared mailer utility — all email sending flows through this function.
 *
 * Setup:
 *   1. Sign up at resend.com and get an API key
 *   2. Add RESEND_API_KEY to your Netlify environment variables
 *   3. Add MAIL_FROM to your Netlify env (e.g. "Sales Pipeline <noreply@yourdomain.com>")
 *      — the sending domain must be verified in Resend
 *
 * Usage from other Netlify functions:
 *   import { sendEmail, emailTemplates } from './send-email.mjs';
 *
 *   await sendEmail({
 *     to: 'rep@company.com',
 *     ...emailTemplates.dealAssigned({ repName: 'Jane', dealName: 'Acme Corp', assignedBy: 'Admin' })
 *   });
 *
 * Or POST directly to /.netlify/functions/send-email with:
 *   { type, to, data }
 */

// ─── Resend API helper ───────────────────────────────────────────────────────

/**
 * Core send function. Call this from any Netlify function.
 * Returns { success: true } or throws with a descriptive message.
 *
 * @param {{ to: string|string[], subject: string, html: string, text?: string }} opts
 */
export async function sendEmail({ to, subject, html, text }) {
    const apiKey = process.env.RESEND_API_KEY;
    const from   = process.env.MAIL_FROM || 'Sales Pipeline <noreply@salespipeline.app>';

    if (!apiKey) {
        console.error('send-email: RESEND_API_KEY is not set');
        throw new Error('Email service is not configured (missing API key)');
    }

    const payload = {
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        ...(text ? { text } : {}),
    };

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type':  'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        const body = await res.text();
        console.error('send-email: Resend API error', res.status, body);
        throw new Error(`Resend API returned ${res.status}: ${body}`);
    }

    const result = await res.json();
    console.log('send-email: sent successfully', result.id, '→', payload.to.join(', '));
    return { success: true, id: result.id };
}

// ─── Shared layout wrapper ───────────────────────────────────────────────────

const appUrl = process.env.APP_URL || 'https://salespipelinetracker.com';

function layout(title, bodyHtml) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background: #f4f6f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1a1a2e; }
    .wrapper { max-width: 600px; margin: 32px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #1a1a2e; padding: 24px 32px; }
    .header-title { color: #ffffff; font-size: 16px; font-weight: 600; margin: 0; letter-spacing: 0.5px; }
    .header-sub { color: #8b92a9; font-size: 12px; margin: 4px 0 0; }
    .body { padding: 32px; }
    .body h2 { font-size: 20px; font-weight: 700; margin: 0 0 8px; color: #1a1a2e; }
    .body p { font-size: 14px; line-height: 1.6; color: #4a4a6a; margin: 0 0 16px; }
    .detail-box { background: #f4f6f8; border-radius: 6px; padding: 16px 20px; margin: 20px 0; }
    .detail-row { display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0; color: #4a4a6a; }
    .detail-label { font-weight: 600; color: #1a1a2e; min-width: 140px; }
    .btn { display: inline-block; background: #3b82f6; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 600; margin-top: 8px; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .badge-green  { background: #d1fae5; color: #065f46; }
    .badge-red    { background: #fee2e2; color: #991b1b; }
    .badge-yellow { background: #fef3c7; color: #92400e; }
    .badge-blue   { background: #dbeafe; color: #1e40af; }
    .badge-gray   { background: #f3f4f6; color: #374151; }
    .task-list { list-style: none; padding: 0; margin: 16px 0; }
    .task-list li { display: flex; align-items: flex-start; gap: 10px; padding: 10px 0; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #4a4a6a; }
    .task-list li:last-child { border-bottom: none; }
    .task-icon { flex-shrink: 0; width: 20px; height: 20px; border-radius: 50%; background: #fef3c7; display: flex; align-items: center; justify-content: center; font-size: 10px; }
    .task-overdue .task-icon { background: #fee2e2; }
    .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 20px 0; }
    .summary-card { background: #f4f6f8; border-radius: 6px; padding: 16px; text-align: center; }
    .summary-card .value { font-size: 24px; font-weight: 700; color: #1a1a2e; }
    .summary-card .label { font-size: 11px; color: #8b92a9; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
    .footer { background: #f4f6f8; padding: 16px 32px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #8b92a9; text-align: center; }
    .footer a { color: #3b82f6; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <p class="header-title">Sales Pipeline Tracker</p>
      <p class="header-sub">Automated notification</p>
    </div>
    <div class="body">
      ${bodyHtml}
    </div>
    <div class="footer">
      <p>You're receiving this because you have an account on <a href="${appUrl}">Sales Pipeline Tracker</a>.</p>
      <p><a href="${appUrl}/settings">Manage notification preferences</a></p>
    </div>
  </div>
</body>
</html>`;
}

function stageBadge(stage) {
    const map = {
        'Closed Won':  'badge-green',
        'Closed Lost': 'badge-red',
        'Proposal':    'badge-blue',
        'Negotiation': 'badge-yellow',
    };
    const cls = map[stage] || 'badge-gray';
    return `<span class="badge ${cls}">${stage}</span>`;
}

function formatCurrency(val) {
    if (val == null) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
}

// ─── Email templates ─────────────────────────────────────────────────────────

export const emailTemplates = {

    /**
     * Sent when a deal is assigned to a rep.
     * @param {{ repName, dealName, account, arr, stage, assignedBy, opportunityId }} data
     */
    dealAssigned({ repName, dealName, account, arr, stage, assignedBy, opportunityId }) {
        const subject = `Deal assigned to you: ${dealName}`;
        const html = layout(subject, `
            <h2>You've been assigned a deal</h2>
            <p>Hi ${repName}, <strong>${assignedBy}</strong> has assigned the following opportunity to you.</p>
            <div class="detail-box">
                <div class="detail-row"><span class="detail-label">Deal</span><span>${dealName}</span></div>
                <div class="detail-row"><span class="detail-label">Account</span><span>${account || '—'}</span></div>
                <div class="detail-row"><span class="detail-label">ARR</span><span>${formatCurrency(arr)}</span></div>
                <div class="detail-row"><span class="detail-label">Stage</span><span>${stageBadge(stage || 'Discovery')}</span></div>
            </div>
            <a class="btn" href="${appUrl}?deal=${opportunityId}">View Deal →</a>
        `);
        return { subject, html };
    },

    /**
     * Sent when a deal moves to a new stage.
     * @param {{ repName, dealName, account, arr, fromStage, toStage, changedBy, opportunityId }} data
     */
    stageChanged({ repName, dealName, account, arr, fromStage, toStage, changedBy, opportunityId }) {
        const isWon  = toStage === 'Closed Won';
        const isLost = toStage === 'Closed Lost';
        const emoji  = isWon ? '🎉' : isLost ? '' : '📋';
        const subject = `${emoji} ${dealName} moved to ${toStage}`;
        const html = layout(subject, `
            <h2>${isWon ? 'Deal closed — well done!' : isLost ? 'Deal marked as lost' : 'Deal stage updated'}</h2>
            <p>Hi ${repName}, <strong>${changedBy}</strong> updated the stage on one of your deals.</p>
            <div class="detail-box">
                <div class="detail-row"><span class="detail-label">Deal</span><span>${dealName}</span></div>
                <div class="detail-row"><span class="detail-label">Account</span><span>${account || '—'}</span></div>
                <div class="detail-row"><span class="detail-label">ARR</span><span>${formatCurrency(arr)}</span></div>
                <div class="detail-row"><span class="detail-label">Previous Stage</span><span>${stageBadge(fromStage)}</span></div>
                <div class="detail-row"><span class="detail-label">New Stage</span><span>${stageBadge(toStage)}</span></div>
            </div>
            <a class="btn" href="${appUrl}?deal=${opportunityId}">View Deal →</a>
        `);
        return { subject, html };
    },

    /**
     * Daily morning digest of tasks due today (sent to individual reps).
     * @param {{ repName, tasks: Array<{ title, opportunityName, dueTime, priority }> }} data
     */
    taskDigest({ repName, tasks: taskList }) {
        const subject = `Your tasks for today (${taskList.length})`;
        const taskItems = taskList.map(t => `
            <li>
                <span class="task-icon">📌</span>
                <div>
                    <strong>${t.title}</strong>
                    ${t.opportunityName ? `<br><span style="color:#8b92a9">${t.opportunityName}</span>` : ''}
                    ${t.dueTime ? `<br><span style="color:#8b92a9">${t.dueTime}</span>` : ''}
                    ${t.priority === 'High' ? ' <span class="badge badge-red" style="font-size:10px">High priority</span>' : ''}
                </div>
            </li>
        `).join('');
        const html = layout(subject, `
            <h2>Good morning, ${repName} 👋</h2>
            <p>You have <strong>${taskList.length} task${taskList.length !== 1 ? 's' : ''}</strong> due today.</p>
            <ul class="task-list">${taskItems}</ul>
            <a class="btn" href="${appUrl}?tab=tasks">View All Tasks →</a>
        `);
        return { subject, html };
    },

    /**
     * Daily nudge for overdue tasks (sent to individual reps).
     * @param {{ repName, tasks: Array<{ title, opportunityName, dueDate, daysOverdue }> }} data
     */
    overdueTaskNudge({ repName, tasks: taskList }) {
        const subject = `You have ${taskList.length} overdue task${taskList.length !== 1 ? 's' : ''}`;
        const taskItems = taskList.map(t => `
            <li class="task-overdue">
                <span class="task-icon">⚠</span>
                <div>
                    <strong>${t.title}</strong>
                    ${t.opportunityName ? `<br><span style="color:#8b92a9">${t.opportunityName}</span>` : ''}
                    <br><span style="color:#dc2626">Due ${t.dueDate} · ${t.daysOverdue} day${t.daysOverdue !== 1 ? 's' : ''} overdue</span>
                </div>
            </li>
        `).join('');
        const html = layout(subject, `
            <h2>Overdue tasks need your attention</h2>
            <p>Hi ${repName}, the following tasks are past their due date.</p>
            <ul class="task-list">${taskItems}</ul>
            <a class="btn" href="${appUrl}?tab=tasks">Resolve Tasks →</a>
        `);
        return { subject, html };
    },

    /**
     * Sent to managers when a new activity is logged on one of their deals.
     * @param {{ managerName, repName, activityType, dealName, account, note, opportunityId }} data
     */
    activityLogged({ managerName, repName, activityType, dealName, account, note, opportunityId }) {
        const subject = `New activity on ${dealName}`;
        const html = layout(subject, `
            <h2>Activity logged on your deal</h2>
            <p>Hi ${managerName}, <strong>${repName}</strong> logged a new activity.</p>
            <div class="detail-box">
                <div class="detail-row"><span class="detail-label">Deal</span><span>${dealName}</span></div>
                <div class="detail-row"><span class="detail-label">Account</span><span>${account || '—'}</span></div>
                <div class="detail-row"><span class="detail-label">Activity Type</span><span>${activityType}</span></div>
                ${note ? `<div class="detail-row" style="flex-direction:column; gap:4px"><span class="detail-label">Note</span><span style="color:#4a4a6a;margin-top:4px">${note}</span></div>` : ''}
            </div>
            <a class="btn" href="${appUrl}?deal=${opportunityId}">View Deal →</a>
        `);
        return { subject, html };
    },

    /**
     * Weekly pipeline summary sent to managers every Monday morning.
     * @param {{ managerName, weekOf, totalArr, dealsOpen, dealsWonThisWeek, dealsLostThisWeek, arrWonThisWeek, topMovers: Array<{ name, account, fromStage, toStage, arr }> }} data
     */
    weeklyManagerSummary({ managerName, weekOf, totalArr, dealsOpen, dealsWonThisWeek, dealsLostThisWeek, arrWonThisWeek, topMovers }) {
        const subject = `Weekly pipeline summary — week of ${weekOf}`;
        const moverRows = (topMovers || []).map(d => `
            <div class="detail-row">
                <span class="detail-label">${d.name}</span>
                <span>${stageBadge(d.fromStage)} → ${stageBadge(d.toStage)} · ${formatCurrency(d.arr)}</span>
            </div>
        `).join('');
        const html = layout(subject, `
            <h2>Your weekly pipeline summary</h2>
            <p>Hi ${managerName}, here's a snapshot of your pipeline for the week of <strong>${weekOf}</strong>.</p>
            <div class="summary-grid">
                <div class="summary-card"><div class="value">${formatCurrency(totalArr)}</div><div class="label">Total Pipeline ARR</div></div>
                <div class="summary-card"><div class="value">${dealsOpen}</div><div class="label">Open Deals</div></div>
                <div class="summary-card"><div class="value">${dealsWonThisWeek}</div><div class="label">Won This Week</div></div>
                <div class="summary-card"><div class="value">${formatCurrency(arrWonThisWeek)}</div><div class="label">ARR Won This Week</div></div>
            </div>
            ${topMovers?.length ? `
                <p style="font-weight:600; margin-bottom:8px;">Top movers this week</p>
                <div class="detail-box">${moverRows}</div>
            ` : ''}
            <a class="btn" href="${appUrl}?tab=reports">View Full Pipeline →</a>
        `);
        return { subject, html };
    },
};

// ─── Netlify function handler ────────────────────────────────────────────────
//
// This handler allows other parts of the app (or future scheduled functions)
// to trigger emails by POSTing to /.netlify/functions/send-email.
//
// Body shape:  { type: string, to: string, data: object }
//
// Where `type` matches a key in emailTemplates and `data` is the matching arg.

export const handler = async (event) => {
    const headers = {
        'Content-Type':                'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    // Internal-only: accept calls from other Netlify functions without a
    // Clerk token (they pass the shared secret instead), or from the frontend
    // with a Clerk token for user-initiated sends.
    const internalSecret = process.env.INTERNAL_API_SECRET;
    const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
    const isInternal = internalSecret && authHeader === `Bearer ${internalSecret}`;

    if (!isInternal) {
        // If not an internal call, you may want to add Clerk auth here.
        // For now we restrict to internal-only to prevent email abuse.
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: use INTERNAL_API_SECRET' }) };
    }

    try {
        const { type, to, data } = JSON.parse(event.body || '{}');

        if (!type || !to || !data) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'type, to, and data are required' }) };
        }

        const templateFn = emailTemplates[type];
        if (!templateFn) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    error: `Unknown template type: ${type}`,
                    available: Object.keys(emailTemplates),
                }),
            };
        }

        const { subject, html } = templateFn(data);
        const result = await sendEmail({ to, subject, html });

        return { statusCode: 200, headers, body: JSON.stringify(result) };

    } catch (err) {
        console.error('send-email handler error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
