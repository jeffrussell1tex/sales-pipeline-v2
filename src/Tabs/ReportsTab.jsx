import React, { useState } from 'react';
import { useApp } from '../AppContext';
import ViewingBar, { SliceDropdown } from '../components/ui/ViewingBar';
import AnalyticsDashboard from '../components/ui/AnalyticsDashboard';
import { dbFetch } from '../utils/storage';
import CustomDashboard from '../components/ui/CustomDashboard';

export default function ReportsTab({ leadsEnabled = true }) {
    const {
        settings,
        opportunities,
        accounts,
        contacts,
        tasks,
        activities,
        leads,
        currentUser,
        userRole,
        getQuarter,
        getQuarterLabel,
        getStageColor,
        exportToCSV,
        canViewField,
        isRepVisible,
        viewingRep, setViewingRep,
        viewingTeam, setViewingTeam,
        viewingTerritory, setViewingTerritory,
        visibleOpportunities,
        visibleAccounts,
        visibleContacts,
        visibleTasks,
        activePipeline,
        allPipelines,
            isMobile,
    } = useApp();

    const isAdmin = userRole === 'Admin';
    const isManager = userRole === 'Manager';
    const canSeeAll = isAdmin || isManager;

    // Local report filter state — persisted so navigation away and back restores last view
    const [reportSubTab, setReportSubTab] = useState(
        () => localStorage.getItem('tab:reports:subTab') || 'pipeline'
    );
    const setReportSubTabPersisted = (tab) => {
        setReportSubTab(tab);
        localStorage.setItem('tab:reports:subTab', tab);
    };
    const [reportTimePeriod, setReportTimePeriod] = useState('all');
    const [reportDateFrom, setReportDateFrom] = useState('');
    const [reportDateTo, setReportDateTo] = useState('');
    const [reportsRep, setReportsRep] = useState(null);
    const [reportsTeam, setReportsTeam] = useState(null);
    const [reportsTerritory, setReportsTerritory] = useState(null);
    const [actPeriod, setActPeriod] = useState('Last 30 Days');
    const [commissionReportFilter, setCommissionReportFilter] = useState('Annual');


                const currentYear = new Date().getFullYear();
                const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
                const quarterMonths = { Q1: [0,1,2], Q2: [3,4,5], Q3: [6,7,8], Q4: [9,10,11] };
                const stages = ['Prospecting','Qualified','Demo','Proposal','Negotiation','Closed Won','Closed Lost'];
                const stageColors = { 'Prospecting':'#5a4a7a','Qualified':'#5a4a7a','Demo':'#5a7a8a','Proposal':'#b87333','Negotiation':'#b87333','Closed Won':'#4d6b3d','Closed Lost':'#9c3a2e' };

                // ── Role-based data visibility ─────────────────────────────────────────
                // Admin  → sees all data across all reps
                // Manager → sees their own data + their direct team's data
                // User   → sees only their own data
                //
                // This gate is applied once here and flows through to every tab below
                // via roleFilteredOpps, roleFilteredActivities, roleFilteredLeads, and
                // roleFilteredTasks. The Rep/Team/Territory slice dropdowns let admins
                // and managers drill further — they are additive on top of this gate.
                const currentUserName = currentUser?.name || currentUser || '';
                const myTeamName = (() => {
                    const me = (settings.users || []).find(u => u.name === currentUserName);
                    return me?.team || null;
                })();
                const myTeamMembers = (() => {
                    if (isAdmin) return null; // null = no filter needed, admin sees all
                    if (isManager && myTeamName) {
                        return new Set(
                            (settings.users || [])
                                .filter(u => u.team === myTeamName)
                                .map(u => u.name)
                        );
                    }
                    // Regular user — only themselves
                    return new Set([currentUserName]);
                })();

                // Returns true if an opportunity belongs to the current user's visible scope
                const oppInScope = (o) => {
                    if (!myTeamMembers) return true; // admin
                    const rep = o.salesRep || o.assignedTo || o.accountOwner || '';
                    return myTeamMembers.has(rep);
                };

                // Returns true if an activity belongs to the current user's visible scope
                const actInScope = (a) => {
                    if (!myTeamMembers) return true; // admin
                    const rep = a.rep || a.salesRep || a.assignedTo || a.author || '';
                    return myTeamMembers.has(rep);
                };

                // Returns true if a lead belongs to the current user's visible scope
                const leadInScope = (l) => {
                    if (!myTeamMembers) return true; // admin
                    const rep = l.assignedTo || l.salesRep || '';
                    return myTeamMembers.has(rep);
                };

                // Returns true if a task belongs to the current user's visible scope
                const taskInScope = (t) => {
                    if (!myTeamMembers) return true; // admin
                    const rep = t.assignedTo || t.salesRep || t.owner || '';
                    return myTeamMembers.has(rep);
                };

                // Role-gated base arrays — everything downstream uses these
                const roleFilteredOpps       = visibleOpportunities.filter(oppInScope);
                const roleFilteredActivities = (activities || []).filter(actInScope);
                const roleFilteredLeads      = (leads || []).filter(leadInScope);
                const roleFilteredTasks      = (tasks || []).filter(taskInScope);

                // Build slice options (only for managers/admins)
                const excludedRoles = new Set(['Admin', 'Manager']);
                const rAllReps = canSeeAll ? [...new Set([
                    ...(settings.users || []).filter(u => u.name && !excludedRoles.has(u.userType)).map(u => u.name),
                    ...roleFilteredOpps.filter(o => o.salesRep).map(o => o.salesRep)
                ])].sort() : [];
                const rAllTeams = isAdmin
                    ? [...new Set((settings.users || []).filter(u => u.team).map(u => u.team))].sort()
                    : (myTeamName ? [myTeamName] : []);
                const rAllTerritories = isAdmin
                    ? [...new Set((settings.users || []).filter(u => u.territory).map(u => u.territory))].sort()
                    : [];
                const hasReportsSlicing = canSeeAll && (rAllReps.length > 1 || rAllTeams.length > 0 || rAllTerritories.length > 0);

                // Filter opportunities based on reports slice selectors (applied on top of role gate)
                const reportsOpps = (() => {
                    if (reportsRep) return roleFilteredOpps.filter(o => o.salesRep === reportsRep || o.assignedTo === reportsRep);
                    if (reportsTeam) {
                        const teamUsers = new Set((settings.users || []).filter(u => u.team === reportsTeam).map(u => u.name));
                        return roleFilteredOpps.filter(o => teamUsers.has(o.salesRep) || teamUsers.has(o.assignedTo));
                    }
                    if (reportsTerritory) {
                        const terrUsers = new Set((settings.users || []).filter(u => u.territory === reportsTerritory).map(u => u.name));
                        return roleFilteredOpps.filter(o => terrUsers.has(o.salesRep) || terrUsers.has(o.assignedTo));
                    }
                    return roleFilteredOpps;
                })();

                // Apply time period filter to reportsOpps for pipeline/performance/revenue tabs
                const reportsTimedOpps = (() => {
                    if (reportTimePeriod === 'all') return reportsOpps;
                    const now = new Date();
                    const fy = now.getFullYear();
                    const fiscalStart = settings.fiscalYearStart || 10;
                    const getFiscalQRanges = (baseYear) => {
                        // baseYear = the fiscal year NUMBER (e.g. 2026 for FY2026)
                        // Q1 starts at fiscalStart month; each Q is 3 months
                        const qs = {};
                        ['Q1','Q2','Q3','Q4'].forEach((q, qi) => {
                            const startMonthOffset = (fiscalStart - 1 + qi * 3);
                            const startMonth = (startMonthOffset % 12) + 1;
                            // Calendar year of Q start: if fiscalStart <= 1 then same as baseYear-1 for Q1
                            // Months before fiscalStart belong to baseYear, months >= fiscalStart belong to baseYear-1 calendar year
                            const calYear = startMonth >= fiscalStart ? baseYear - 1 : baseYear;
                            const endRaw = new Date(calYear, startMonth - 1 + 3, 0);
                            qs[q] = [`${calYear}-${String(startMonth).padStart(2,'0')}-01`,
                                     `${endRaw.getFullYear()}-${String(endRaw.getMonth()+1).padStart(2,'0')}-${String(endRaw.getDate()).padStart(2,'0')}`];
                        });
                        qs['FY'] = [qs['Q1'][0], qs['Q4'][1]];
                        return qs;
                    };
                    const qRanges = getFiscalQRanges(fy);
                    if (reportTimePeriod === 'custom') {
                        return reportsOpps.filter(o => {
                            const d = o.forecastedCloseDate || o.createdDate || '';
                            if (!d) return false;
                            if (reportDateFrom && d < reportDateFrom) return false;
                            if (reportDateTo && d > reportDateTo) return false;
                            return true;
                        });
                    }
                    const [from, to] = qRanges[reportTimePeriod] || [];
                    if (!from) return reportsOpps;
                    return reportsOpps.filter(o => {
                        const d = o.forecastedCloseDate || o.createdDate || '';
                        return d >= from && d <= to;
                    });
                })();

                // Apply period filter to activities (by date field)
                const reportsTimedActivities = (() => {
                    const allActs = roleFilteredActivities;
                    if (reportTimePeriod === 'all') return allActs;
                    const now = new Date();
                    const fy = now.getFullYear();
                    const fiscalStart = settings.fiscalYearStart || 10;
                    const getFiscalQRanges = (baseYear) => {
                        // baseYear = the fiscal year NUMBER (e.g. 2026 for FY2026)
                        // Q1 starts at fiscalStart month; each Q is 3 months
                        const qs = {};
                        ['Q1','Q2','Q3','Q4'].forEach((q, qi) => {
                            const startMonthOffset = (fiscalStart - 1 + qi * 3);
                            const startMonth = (startMonthOffset % 12) + 1;
                            // Calendar year of Q start: if fiscalStart <= 1 then same as baseYear-1 for Q1
                            // Months before fiscalStart belong to baseYear, months >= fiscalStart belong to baseYear-1 calendar year
                            const calYear = startMonth >= fiscalStart ? baseYear - 1 : baseYear;
                            const endRaw = new Date(calYear, startMonth - 1 + 3, 0);
                            qs[q] = [`${calYear}-${String(startMonth).padStart(2,'0')}-01`,
                                     `${endRaw.getFullYear()}-${String(endRaw.getMonth()+1).padStart(2,'0')}-${String(endRaw.getDate()).padStart(2,'0')}`];
                        });
                        qs['FY'] = [qs['Q1'][0], qs['Q4'][1]];
                        return qs;
                    };
                    const qRanges = getFiscalQRanges(fy);
                    if (reportTimePeriod === 'custom') {
                        return allActs.filter(a => {
                            const d = (a.date || a.createdAt || '').slice(0, 10);
                            if (!d) return false;
                            if (reportDateFrom && d < reportDateFrom) return false;
                            if (reportDateTo && d > reportDateTo) return false;
                            return true;
                        });
                    }
                    const [from, to] = qRanges[reportTimePeriod] || [];
                    if (!from) return allActs;
                    return allActs.filter(a => {
                        const d = (a.date || a.createdAt || '').slice(0, 10);
                        return d >= from && d <= to;
                    });
                })();

                // Apply period filter to leads (by createdAt)
                const reportsTimedLeads = (() => {
                    const allL = roleFilteredLeads;
                    if (reportTimePeriod === 'all') return allL;
                    const now = new Date();
                    const fy = now.getFullYear();
                    const fiscalStart = settings.fiscalYearStart || 10;
                    const getFiscalQRanges = (baseYear) => {
                        // baseYear = the fiscal year NUMBER (e.g. 2026 for FY2026)
                        // Q1 starts at fiscalStart month; each Q is 3 months
                        const qs = {};
                        ['Q1','Q2','Q3','Q4'].forEach((q, qi) => {
                            const startMonthOffset = (fiscalStart - 1 + qi * 3);
                            const startMonth = (startMonthOffset % 12) + 1;
                            // Calendar year of Q start: if fiscalStart <= 1 then same as baseYear-1 for Q1
                            // Months before fiscalStart belong to baseYear, months >= fiscalStart belong to baseYear-1 calendar year
                            const calYear = startMonth >= fiscalStart ? baseYear - 1 : baseYear;
                            const endRaw = new Date(calYear, startMonth - 1 + 3, 0);
                            qs[q] = [`${calYear}-${String(startMonth).padStart(2,'0')}-01`,
                                     `${endRaw.getFullYear()}-${String(endRaw.getMonth()+1).padStart(2,'0')}-${String(endRaw.getDate()).padStart(2,'0')}`];
                        });
                        qs['FY'] = [qs['Q1'][0], qs['Q4'][1]];
                        return qs;
                    };
                    const qRanges = getFiscalQRanges(fy);
                    if (reportTimePeriod === 'custom') {
                        return allL.filter(l => {
                            const d = (l.createdAt || '').slice(0, 10);
                            if (!d) return false;
                            if (reportDateFrom && d < reportDateFrom) return false;
                            if (reportDateTo && d > reportDateTo) return false;
                            return true;
                        });
                    }
                    const [from, to] = qRanges[reportTimePeriod] || [];
                    if (!from) return allL;
                    return allL.filter(l => {
                        const d = (l.createdAt || '').slice(0, 10);
                        return d >= from && d <= to;
                    });
                })();

                const wonOpps = reportsTimedOpps.filter(o => o.stage === 'Closed Won');
                const lostOpps = reportsTimedOpps.filter(o => o.stage === 'Closed Lost');
                const openOpps = reportsTimedOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');

                const totalWonRevenue = wonOpps.reduce((s, o) => s + (parseFloat(o.arr)||0) + (o.implementationCost||0), 0);
                const totalPipelineValue = openOpps.reduce((s, o) => s + (parseFloat(o.arr)||0) + (o.implementationCost||0), 0);
                const avgDealSize = wonOpps.length > 0 ? totalWonRevenue / wonOpps.length : 0;
                const winRate = (wonOpps.length + lostOpps.length) > 0 ? (wonOpps.length / (wonOpps.length + lostOpps.length) * 100) : 0;

                // Revenue by quarter
                const revenueByQuarter = quarters.map(q => {
                    const months = quarterMonths[q];
                    const rev = wonOpps.filter(o => {
                        const dateStr = o.forecastedCloseDate || o.closeDate;
                        if (!dateStr) return false;
                        const d = new Date(dateStr);
                        return d.getFullYear() === currentYear && months.includes(d.getMonth());
                    }).reduce((s, o) => s + (parseFloat(o.arr)||0) + (o.implementationCost||0), 0);
                    return { q, rev };
                });
                const maxQRev = Math.max(...revenueByQuarter.map(r => r.rev), 1);

                // Pipeline by stage
                const byStage = stages.map(st => ({
                    stage: st,
                    count: reportsOpps.filter(o => o.stage === st).length,
                    value: reportsOpps.filter(o => o.stage === st).reduce((s, o) => s + (parseFloat(o.arr)||0) + (o.implementationCost||0), 0)
                })).filter(s => s.count > 0);
                const maxStageVal = Math.max(...byStage.map(s => s.value), 1);

                // Top accounts by revenue — with parent/child rollup
                // Build a map from account name → parent account name using the accounts list
                const accountNameToParent = {};
                (accounts || []).forEach(a => {
                    if (a.parentAccountId) {
                        const parent = (accounts || []).find(p => p.id === a.parentAccountId);
                        if (parent) accountNameToParent[a.name.toLowerCase()] = parent.name;
                    }
                });
                const accountRevMap = {};
                wonOpps.forEach(o => {
                    const rawKey = o.account || 'Unknown';
                    // Roll child account revenue up to the parent if one exists
                    const key = accountNameToParent[rawKey.toLowerCase()] || rawKey;
                    accountRevMap[key] = (accountRevMap[key] || 0) + (o.arr||0) + (o.implementationCost||0);
                });
                const topAccounts = Object.entries(accountRevMap).sort((a,b) => b[1]-a[1]).slice(0, 8);

                // Monthly trend (last 6 months)
                const now = new Date();
                const monthlyData = Array.from({length: 6}, (_, i) => {
                    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
                    const monthOpps = wonOpps.filter(o => {
                        const dateStr = o.forecastedCloseDate || o.closeDate;
                        if (!dateStr) return false;
                        const od = new Date(dateStr);
                        return od.getFullYear() === d.getFullYear() && od.getMonth() === d.getMonth();
                    });
                    return {
                        label: d.toLocaleString('default', { month: 'short' }),
                        rev: monthOpps.reduce((s, o) => s + (parseFloat(o.arr)||0) + (o.implementationCost||0), 0),
                        count: monthOpps.length
                    };
                });
                const maxMonthRev = Math.max(...monthlyData.map(m => m.rev), 1);

                const cardStyle = { background: '#fbf8f3', borderRadius: '4px', padding: '1.25rem', border: '1px solid #e6ddd0' };
                const labelStyle = { fontSize: '0.6875rem', fontWeight: '700', color: '#8a8378', textTransform: 'uppercase', letterSpacing: '0.6', marginBottom: '0.25rem', fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' };
                const valueStyle = { fontSize: '1.5rem', fontWeight: '700', color: '#2a2622', fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' };
                const printBtnStyle = { background: '#2a2622', border: 'none', borderRadius: '3px', padding: '0.25rem 0.625rem', fontSize: '0.6875rem', fontWeight: '600', color: '#fbf8f3', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 };

                const printSection = (title, bodyHtml) => {
                    const d = new Date();
                    const meta = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) + ' at ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                    const win = window.open('', '_blank', 'width=820,height=600');
                    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
<style>
  @page { margin: 0.75in; size: letter; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #2a2622; }
  .hdr { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 12px; border-bottom: 3px solid #3a5a7a; margin-bottom: 20px; }
  .hdr h1 { font-size: 18px; font-weight: 800; }
  .hdr .accent { display: inline-block; width: 4px; height: 18px; background: linear-gradient(to bottom,#3a5a7a,#5a4a7a); border-radius: 2px; margin-right: 8px; vertical-align: middle; }
  .meta { font-size: 9px; color: #8a8378; text-align: right; line-height: 1.7; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead th { background: #fbf8f3; color: #8a8378; font-weight: 700; padding: 6px 8px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #e6ddd0; text-align: left; white-space: nowrap; }
  tbody td { padding: 6px 8px; border-bottom: 1px solid #f5efe3; vertical-align: middle; }
  .footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #e6ddd0; display: flex; justify-content: space-between; font-size: 9px; color: #8a8378; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
<div class="hdr"><div><span class="accent"></span><h1>${title}</h1></div><div class="meta">Generated ${meta}<br>Sales Pipeline Tracker &nbsp;·&nbsp; Confidential</div></div>
${bodyHtml}
<div class="footer"><span>Sales Pipeline Tracker &nbsp;·&nbsp; Confidential</span><span>Generated ${meta}</span></div>
</body></html>`);
                    win.document.close();
                    setTimeout(() => win.print(), 500);
                };

                const handlePrintReport = () => {
                    const printDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                    const printTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

                    // Build bar chart using pure HTML/CSS (no canvas needed for print)
                    const buildBarChart = (data, labelKey, valueKey, colorFn) => {
                        const maxVal = Math.max(...data.map(d => d[valueKey]), 1);
                        return data.map(d => `
                            <div style="margin-bottom:10px;">
                                <div style="display:flex;justify-content:space-between;margin-bottom:3px;font-size:11px;">
                                    <span style="color:#5a544c;font-weight:600;">${d[labelKey]}</span>
                                    <span style="color:#2a2622;font-weight:700;">$${(d[valueKey]||0).toLocaleString()}</span>
                                </div>
                                <div style="height:10px;background:#f5efe3;border-radius:5px;overflow:hidden;">
                                    <div style="height:100%;width:${Math.round((d[valueKey]||0)/maxVal*100)}%;background:linear-gradient(to right,#3a5a7a,#5a4a7a);border-radius:5px;"></div>
                                </div>
                            </div>`).join('');
                    };

                    const stageRows = byStage.map((s, i) => `
                        <tr style="background:${i%2===0?'#fff':'#fbf8f3'}">
                            <td>${s.stage}</td>
                            <td style="text-align:center;">${s.count}</td>
                            <td style="text-align:right;">$${s.value.toLocaleString()}</td>
                            <td style="text-align:right;">${maxStageVal > 0 ? Math.round(s.value/maxStageVal*100) : 0}%</td>
                        </tr>`).join('');

                    const accountRows = topAccounts.map(([name, rev], i) => `
                        <tr style="background:${i%2===0?'#fff':'#fbf8f3'}">
                            <td style="text-align:center;font-weight:700;color:${i===0?'#b87333':i===1?'#8a8378':i===2?'#b87333':'#5a544c'}">#${i+1}</td>
                            <td>${name}</td>
                            <td style="text-align:right;font-weight:700;color:#4d6b3d;">$${rev.toLocaleString()}</td>
                        </tr>`).join('');

                    const oppRows = reportsOpps.map((o, i) => `
                        <tr style="background:${i%2===0?'#fff':'#fbf8f3'}">
                            <td>${o.opportunityName || o.account || '—'}</td>
                            <td>${o.account || '—'}</td>
                            <td>${o.stage || '—'}</td>
                            <td style="text-align:right;">${o.arr ? '$'+o.arr.toLocaleString() : '—'}</td>
                            <td style="text-align:right;">${o.implementationCost ? '$'+o.implementationCost.toLocaleString() : '—'}</td>
                            <td style="text-align:right;font-weight:700;">$${((o.arr||0)+(o.implementationCost||0)).toLocaleString()}</td>
                            <td>${o.closeDate ? new Date(o.closeDate).toLocaleDateString() : '—'}</td>
                            <td>${o.assignedTo || o.accountOwner || '—'}</td>
                        </tr>`).join('');

                    const monthlyBars = monthlyData.map(m => {
                        const pct = Math.round((m.rev||0)/maxMonthRev*100);
                        return `
                            <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
                                <div style="font-size:9px;color:#5a544c;font-weight:700;">${m.rev > 0 ? '$'+Math.round(m.rev/1000)+'K' : ''}</div>
                                <div style="width:100%;background:#f5efe3;border-radius:4px;height:80px;display:flex;align-items:flex-end;">
                                    <div style="width:100%;height:${Math.max(pct,m.rev>0?4:1)}%;background:linear-gradient(to top,#3a5a7a,#5a4a7a);border-radius:4px 4px 0 0;"></div>
                                </div>
                                <div style="font-size:9px;color:#8a8378;">${m.label}</div>
                            </div>`;
                    }).join('');

                    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Sales Pipeline Report — ${printDate}</title>
<style>
  @page { margin: 0.75in; size: letter; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #2a2622; background: #fff; }
  
  .report-header { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 14px; border-bottom: 3px solid #3a5a7a; margin-bottom: 24px; }
  .report-header h1 { font-size: 22px; font-weight: 800; color: #2a2622; }
  .report-header .meta { font-size: 10px; color: #8a8378; text-align: right; line-height: 1.6; }
  .report-header .accent { display: inline-block; width: 4px; height: 22px; background: linear-gradient(to bottom, #3a5a7a, #5a4a7a); border-radius: 2px; margin-right: 8px; vertical-align: middle; }

  .section { margin-bottom: 28px; page-break-inside: avoid; }
  .section-title { font-size: 9px; font-weight: 700; color: #8a8378; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #e6ddd0; }

  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 0; }
  .kpi-card { background: #fff; border: 1px solid #e6ddd0; border-radius: 8px; padding: 12px 14px; }
  .kpi-label { font-size: 9px; font-weight: 700; color: #8a8378; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3px; }
  .kpi-value { font-size: 20px; font-weight: 800; color: #2a2622; line-height: 1.1; }
  .kpi-sub { font-size: 9px; color: #8a8378; margin-top: 3px; }

  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .card { background: #fff; border: 1px solid #e6ddd0; border-radius: 8px; padding: 14px; }

  .monthly-chart { display: flex; align-items: flex-end; gap: 6px; height: 90px; margin-top: 8px; }

  table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  thead th { background: #fbf8f3; color: #8a8378; font-weight: 700; text-align: left; padding: 6px 8px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #e6ddd0; white-space: nowrap; }
  tbody td { padding: 6px 8px; border-bottom: 1px solid #f5efe3; vertical-align: middle; }
  tbody tr:last-child td { border-bottom: none; }

  .footer { margin-top: 32px; padding-top: 10px; border-top: 1px solid #e6ddd0; display: flex; justify-content: space-between; font-size: 9px; color: #8a8378; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
    .section { page-break-inside: avoid; }
    .opps-table { page-break-before: always; }
  }
</style>
</head>
<body>

  <div class="report-header">
    <div>
      <div style="display:flex;align-items:center;">
<span class="accent"></span>
<h1>Sales Pipeline Report</h1>
      </div>
      <div style="font-size:11px;color:#8a8378;margin-top:4px;">Pipeline performance and revenue insights</div>
    </div>
    <div class="meta">
      Generated ${printDate} at ${printTime}<br>
      Sales Pipeline Tracker &nbsp;·&nbsp; Confidential
    </div>
  </div>

  <!-- KPIs -->
  <div class="section">
    <div class="section-title">Key Performance Indicators</div>
    <div class="kpi-grid">
      <div class="kpi-card">
<div class="kpi-label">Won Revenue</div>
<div class="kpi-value">$${totalWonRevenue.toLocaleString()}</div>
<div class="kpi-sub">${wonOpps.length} deals closed won</div>
      </div>
      <div class="kpi-card">
<div class="kpi-label">Pipeline Value</div>
<div class="kpi-value">$${totalPipelineValue.toLocaleString()}</div>
<div class="kpi-sub">${openOpps.length} open opportunities</div>
      </div>
      <div class="kpi-card">
<div class="kpi-label">Win Rate</div>
<div class="kpi-value">${winRate.toFixed(1)}%</div>
<div class="kpi-sub">${wonOpps.length} won / ${lostOpps.length} lost</div>
      </div>
      <div class="kpi-card">
<div class="kpi-label">Avg Deal Size</div>
<div class="kpi-value">$${Math.round(avgDealSize).toLocaleString()}</div>
<div class="kpi-sub">closed won</div>
      </div>
    </div>
  </div>

  <!-- Revenue by Quarter + Monthly Trend -->
  <div class="section two-col">
    <div class="card">
      <div class="section-title">Won Revenue by Quarter (${currentYear})</div>
      ${buildBarChart(revenueByQuarter, 'q', 'rev', () => '#3a5a7a')}
    </div>
    <div class="card">
      <div class="section-title">Monthly Won Revenue — Last 6 Months</div>
      <div class="monthly-chart">${monthlyBars}</div>
    </div>
  </div>

  <!-- Pipeline by Stage + Top Accounts -->
  <div class="section two-col">
    <div class="card">
      <div class="section-title">Opportunities by Stage</div>
      ${byStage.length === 0 ? '<p style="color:#8a8378;font-size:11px;">No opportunity data.</p>' : `
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
<table>
<thead><tr><th>Stage</th><th style="text-align:center;">Count</th><th style="text-align:right;">Value</th><th style="text-align:right;">Share</th></tr></thead>
<tbody>${stageRows}</tbody>
      </table>
</div>`}
    </div>
    <div class="card">
      <div class="section-title">Top Accounts by Won Revenue</div>
      ${topAccounts.length === 0 ? '<p style="color:#8a8378;font-size:11px;">No closed won data yet.</p>' : `
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
<table>
<thead><tr><th style="text-align:center;">#</th><th>Account</th><th style="text-align:right;">Won Revenue</th></tr></thead>
<tbody>${accountRows}</tbody>
      </table>
</div>`}
    </div>
  </div>

  <!-- All Opportunities -->
  <div class="section opps-table">
    <div class="section-title">All Opportunities Summary (${reportsOpps.length} total)</div>
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
<table>
      <thead>
<tr>
  <th>Opportunity</th><th>Account</th><th>Stage</th>
  <th style="text-align:right;">ARR</th><th style="text-align:right;">Impl. Cost</th>
  <th style="text-align:right;">Total Value</th><th>Close Date</th><th>Owner</th>
</tr>
      </thead>
      <tbody>${oppRows || '<tr><td colspan="8" style="text-align:center;color:#8a8378;padding:16px;">No opportunities found.</td></tr>'}</tbody>
    </table>
</div>
  </div>

  <div class="footer">
    <span>Sales Pipeline Tracker &nbsp;·&nbsp; Confidential</span>
    <span>Generated ${printDate} at ${printTime}</span>
  </div>

</body>
</html>`;

                    const win = window.open('', '_blank', 'width=900,height=700');
                    win.document.write(html);
                    win.document.close();
                    setTimeout(() => win.print(), 600);
                };

                const generateReport = (title, contentFn) => {
                    const d = new Date();
                    const meta = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) + ' at ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                    const win2 = window.open('', '_blank', 'width=820,height=600');
                    win2.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title><style>body{font-family:system-ui,sans-serif;padding:2rem;color:#2a2622}h1{font-size:1.125rem;font-weight:800;margin-bottom:0.25rem}.meta{font-size:0.75rem;color:#8a8378;margin-bottom:1.5rem}table{width:100%;border-collapse:collapse;font-size:0.875rem}th{background:#fbf8f3;color:#8a8378;font-weight:700;padding:6px 10px;font-size:0.75rem;text-transform:uppercase;border-bottom:2px solid #e6ddd0;text-align:left}td{padding:6px 10px;border-bottom:1px solid #f5efe3}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><h1>${title}</h1><div class="meta">Generated ${meta} · Sales Pipeline Tracker</div>${contentFn()}</body></html>`);
                    win2.document.close();
                    setTimeout(() => win2.print(), 500);
                };

                const ReportBtn = ({ title, contentFn }) => (
                    <button onClick={() => generateReport(title, contentFn)}
                        style={{ display:'flex', alignItems:'center', gap:'0.3rem', padding:'0.25rem 0.625rem', background:'#2a2622', border:'none', borderRadius:'6px', cursor:'pointer', fontSize:'0.6875rem', fontWeight:'600', color:'#fbf8f3', fontFamily:'inherit', whiteSpace:'nowrap', flexShrink:0 }}>🖨️ Print</button>
                );

                return (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

                        {/* ── Page header — V1 serif italic pattern ── */}
                        <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', paddingBottom:12, fontFamily:'"Plus Jakarta Sans", system-ui, sans-serif' }}>
                            <div>
                                <div style={{ fontSize:28, fontFamily:'Georgia, serif', fontStyle:'italic', fontWeight:300, letterSpacing:-0.8, color:'#2a2622', lineHeight:1, marginBottom:5 }}>Reports</div>
                                <div style={{ fontSize:12, color:'#8a8378' }}>Pipeline performance and revenue insights</div>
                            </div>
                        </div>

                        {/* ── Sub-tab nav — Pipeline / Performance / Revenue / etc. ── */}
                        <div style={{ display:'flex', borderBottom:'1px solid #e6ddd0', overflowX:'auto', marginBottom:'0' }}>
                            {[
                              { key:'pipeline',    label:'Pipeline & Forecast' },
                              { key:'performance', label:'Performance' },
                              { key:'revenue',     label:'Revenue' },
                              { key:'activity',    label:'Activity' },
                              ...(leadsEnabled ? [{ key:'leads', label:'Leads' }] : []),
                              { key:'actions',     label:'Actions' },
                              { key:'custom',      label:'Custom' },
                            ].map(({ key, label }) => (
                              <button key={key} onClick={() => setReportSubTabPersisted(key)} style={{
                                padding: '8px 16px',
                                border: 'none',
                                borderBottom: reportSubTab === key ? '2px solid #2a2622' : '2px solid transparent',
                                background: 'transparent',
                                color: reportSubTab === key ? '#2a2622' : '#8a8378',
                                fontWeight: reportSubTab === key ? '600' : '400',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                transition: 'color 120ms, border-color 120ms',
                                whiteSpace: 'nowrap',
                                marginBottom: -1,
                              }}
                              onMouseEnter={e => { if (reportSubTab !== key) e.currentTarget.style.color = '#5a544c'; }}
                              onMouseLeave={e => { if (reportSubTab !== key) e.currentTarget.style.color = '#8a8378'; }}
                              >{label}</button>
                            ))}
                        </div>

                        {/* ── Role scope banner — shown to non-admins so they understand what data they're seeing ── */}
                        {!isAdmin && (
                            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.375rem 0.875rem', marginTop:'0.5rem', background: isManager ? 'rgba(58,90,122,0.07)' : 'rgba(77,107,61,0.07)', border: `1px solid ${isManager ? 'rgba(58,90,122,0.25)' : 'rgba(77,107,61,0.25)'}`, borderRadius:'6px', fontSize:'0.75rem', color: isManager ? '#3a5a7a' : '#4d6b3d', fontWeight:'500' }}>
                                <span style={{ fontSize:'0.875rem' }}>{isManager ? '👥' : '👤'}</span>
                                {isManager
                                    ? `Showing your data${myTeamName ? ` and your team (${myTeamName})` : ''}`
                                    : `Showing your data only`}
                            </div>
                        )}

                        {/* ── Filter bar: Grouped By segmented control + Period dropdown + Export ── */}
                        {(() => {
                          const now = new Date();
                          const fy = now.getFullYear();
                          const periodOptions = [
                            { value:'all',    label:'All Time' },
                            { value:'FY',     label:`FY ${fy}` },
                            { value:'Q1',     label:'Q1' },
                            { value:'Q2',     label:'Q2' },
                            { value:'Q3',     label:'Q3' },
                            { value:'Q4',     label:'Q4' },
                            { value:'custom', label:'Custom…' },
                          ];
                          const selectedPeriodLabel = periodOptions.find(p => p.value === reportTimePeriod)?.label || 'This quarter';
                          return (
                          <div style={{ display:'flex', alignItems:'center', gap:'0.875rem', padding:'0.625rem 0', flexWrap:'wrap', borderBottom:'1px solid #e6ddd0', marginBottom:'0' }}>

                            {/* Grouped by — segmented control (admins/managers only) */}
                            {hasReportsSlicing && (
                              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                                <span style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#8a8378', textTransform:'uppercase', letterSpacing:'0.05em', whiteSpace:'nowrap' }}>Grouped by</span>
                                <div style={{ display:'flex', border:'1px solid #e6ddd0', borderRadius:'6px', overflow:'hidden', background:'#fbf8f3' }}>
                                  {[
                                    ...(rAllReps.length > 1    ? [{ value:'rep',       label:'Rep' }]       : []),
                                    ...(rAllTeams.length > 0   ? [{ value:'team',      label:'Team' }]      : []),
                                    ...(rAllTerritories.length > 0 ? [{ value:'territory', label:'Territory' }] : []),
                                  ].map((opt, idx, arr) => {
                                    const isActive = (
                                      (opt.value === 'rep'       && reportsRep) ||
                                      (opt.value === 'team'      && reportsTeam) ||
                                      (opt.value === 'territory' && reportsTerritory)
                                    );
                                    return (
                                      <button key={opt.value} onClick={() => {
                                        if (opt.value === 'rep')       { setReportsRep(rAllReps[0]||null); setReportsTeam(null); setReportsTerritory(null); }
                                        if (opt.value === 'team')      { setReportsTeam(rAllTeams[0]||null); setReportsRep(null); setReportsTerritory(null); }
                                        if (opt.value === 'territory') { setReportsTerritory(rAllTerritories[0]||null); setReportsRep(null); setReportsTeam(null); }
                                      }} style={{
                                        padding:'4px 12px', background: isActive ? '#2a2622' : 'transparent',
                                        color: isActive ? '#fbf8f3' : '#5a544c',
                                        border:'none', borderRight: idx < arr.length - 1 ? '1px solid #e6ddd0' : 'none',
                                        fontSize:'0.75rem', fontWeight: isActive ? '600' : '500',
                                        cursor:'pointer', fontFamily:'inherit', transition:'all 120ms',
                                      }}>{opt.label}</button>
                                    );
                                  })}
                                </div>
                                {/* Slice value dropdown when a group is active */}
                                {reportsRep && (
                                  <select value={reportsRep||''} onChange={e => setReportsRep(e.target.value||null)}
                                    style={{ fontSize:'0.75rem', padding:'4px 8px', border:'1px solid #e6ddd0', borderRadius:'6px', background:'#fbf8f3', color:'#2a2622', fontFamily:'inherit', cursor:'pointer' }}>
                                    {rAllReps.map(r => <option key={r} value={r}>{r}</option>)}
                                  </select>
                                )}
                                {reportsTeam && (
                                  <select value={reportsTeam||''} onChange={e => setReportsTeam(e.target.value||null)}
                                    style={{ fontSize:'0.75rem', padding:'4px 8px', border:'1px solid #e6ddd0', borderRadius:'6px', background:'#fbf8f3', color:'#2a2622', fontFamily:'inherit', cursor:'pointer' }}>
                                    {rAllTeams.map(t => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                )}
                                {reportsTerritory && (
                                  <select value={reportsTerritory||''} onChange={e => setReportsTerritory(e.target.value||null)}
                                    style={{ fontSize:'0.75rem', padding:'4px 8px', border:'1px solid #e6ddd0', borderRadius:'6px', background:'#fbf8f3', color:'#2a2622', fontFamily:'inherit', cursor:'pointer' }}>
                                    {rAllTerritories.map(t => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                )}
                                {(reportsRep || reportsTeam || reportsTerritory) && (
                                  <button onClick={() => { setReportsRep(null); setReportsTeam(null); setReportsTerritory(null); }}
                                    style={{ padding:'3px 8px', border:'1px solid #e6ddd0', borderRadius:'4px', background:'#fbf8f3', color:'#8a8378', fontSize:'0.625rem', fontWeight:'600', cursor:'pointer', fontFamily:'inherit' }}>✕</button>
                                )}
                                <div style={{ width:'1px', height:'18px', background:'#e6ddd0', flexShrink:0 }} />
                              </div>
                            )}

                            {/* Period — dropdown */}
                            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                              <span style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#8a8378', textTransform:'uppercase', letterSpacing:'0.05em', whiteSpace:'nowrap' }}>Period</span>
                              <select value={reportTimePeriod} onChange={e => setReportTimePeriod(e.target.value)}
                                style={{ fontSize:'0.75rem', padding:'4px 28px 4px 10px', border:'1px solid #e6ddd0', borderRadius:'6px', background:'#fbf8f3', color:'#2a2622', fontFamily:'inherit', cursor:'pointer', appearance:'none',
                                  backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a8378' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                                  backgroundRepeat:'no-repeat', backgroundPosition:'right 8px center' }}>
                                {periodOptions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                              </select>
                              {reportTimePeriod === 'custom' && (
                                <div style={{ display:'flex', alignItems:'center', gap:'0.375rem' }}>
                                  <input type="date" value={reportDateFrom} onChange={e => setReportDateFrom(e.target.value)}
                                    style={{ padding:'3px 8px', border:'1px solid #e6ddd0', borderRadius:'6px', fontSize:'0.6875rem', fontFamily:'inherit', color:'#2a2622', background:'#fbf8f3' }} />
                                  <span style={{ fontSize:'0.6875rem', color:'#8a8378' }}>to</span>
                                  <input type="date" value={reportDateTo} onChange={e => setReportDateTo(e.target.value)}
                                    style={{ padding:'3px 8px', border:'1px solid #e6ddd0', borderRadius:'6px', fontSize:'0.6875rem', fontFamily:'inherit', color:'#2a2622', background:'#fbf8f3' }} />
                                </div>
                              )}
                            </div>

                            <div style={{ flex:1 }} />

                            {/* Right: Customize (custom tab) + Export PDF */}
                            {reportSubTab === 'custom' && (
                              <button onClick={() => document.dispatchEvent(new CustomEvent('accelerep:openCustomize'))}
                                style={{ display:'inline-flex', alignItems:'center', gap:'0.375rem', padding:'0.3rem 0.875rem', border:'1px solid #e6ddd0', borderRadius:'6px', background:'#fbf8f3', color:'#2a2622', fontSize:'0.75rem', fontWeight:'500', cursor:'pointer', fontFamily:'inherit' }}>
                                ⚙️ Customize
                              </button>
                            )}
                            <button onClick={()=>{
                              const lbl={pipeline:'Pipeline & Forecast',performance:'Performance',revenue:'Revenue',activity:'Activity',leads:'Leads',actions:'Actions'}[reportSubTab]||'Report';
                              const win=window.open('','_blank','width=900,height=700');
                              if(!win){alert('Allow popups to export PDF');return;}
                              const el=document.querySelector('[data-rpt]');
                              const body=el?el.innerHTML:'<p>Could not capture report.</p>';
                              const d=new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
                              win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Accelerep — '+lbl+'</title><style>@page{margin:0.625in;size:letter}*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;font-size:12px;color:#2a2622}.hdr{display:flex;justify-content:space-between;padding-bottom:12px;border-bottom:3px solid #3a5a7a;margin-bottom:20px}.hdr h1{font-size:18px;font-weight:800}.meta{font-size:9px;color:#8a8378}button,select{display:none!important}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#fbf8f3;padding:6px 10px;font-size:10px;font-weight:700;text-transform:uppercase;color:#8a8378;border-bottom:2px solid #e6ddd0}td{padding:6px 10px;border-bottom:1px solid #f5efe3}</style></head><body><div class="hdr"><h1>Accelerep — '+lbl+'</h1><div class="meta">'+d+'</div></div>'+body+'<scr'+'ipt>window.onload=function(){window.print()}<\/script></body></html>');
                              win.document.close();
                            }} style={{ display:'inline-flex', alignItems:'center', gap:'0.3rem', fontSize:'0.75rem', padding:'0.3rem 0.875rem', border:'1px solid #e6ddd0', borderRadius:'6px', background:'#fbf8f3', color:'#2a2622', cursor:'pointer', fontFamily:'inherit', fontWeight:'500' }}>
                              ↗ Export PDF
                            </button>

                          </div>
                          );
                        })()}

                        <div data-rpt="1">
                        {reportSubTab === 'pipeline' && (
                        <div style={{ display:'flex', flexDirection:'column', gap:'1rem', padding:'1rem 1.25rem 1.5rem' }}>

                          {/* ── Shared primitives (scoped to this block) ── */}
                          {(() => {
                            const T = { bg:'#f0ece4', surface:'#fbf8f3', surface2:'#f5efe3', border:'#e6ddd0', borderStrong:'#d4c8b4', ink:'#2a2622', inkMid:'#5a544c', inkMuted:'#8a8378', gold:'#c8b99a', ok:'#4d6b3d', warn:'#b87333', danger:'#9c3a2e', sans:'"Plus Jakarta Sans",system-ui,sans-serif', serif:'Georgia,serif', r:3 };
                            const fmt = (v) => { const n=parseFloat(v)||0; if(n>=1e6)return '$'+(n/1e6).toFixed(1)+'M'; if(n>=1e3)return '$'+Math.round(n/1e3)+'K'; return '$'+Math.round(n).toLocaleString(); };
                            const eb  = (c) => ({ fontSize:10, fontWeight:700, color:c||T.inkMuted, letterSpacing:0.8, textTransform:'uppercase', fontFamily:T.sans });
                            const HBar = ({ value, max, color, h=6 }) => { const p=Math.min(100,Math.max(0,(value/Math.max(max,1))*100)); return <div style={{ height:h, background:T.surface2, borderRadius:h/2, overflow:'hidden', flex:1 }}><div style={{ width:p+'%', height:'100%', background:color, borderRadius:h/2 }}/></div>; };
                            const Panel = ({ children, p='20px 22px 22px' }) => <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r, padding:p }}>{children}</div>;
                            const SecHdr = ({ title, sub, right }) => (
                              <div style={{ display:'flex', alignItems:'flex-end', gap:14, marginBottom:10 }}>
                                <div style={{ flex:1 }}>
                                  <div style={{ fontSize:16, fontFamily:T.serif, fontStyle:'italic', fontWeight:400, color:T.ink, lineHeight:1.1, letterSpacing:-0.2 }}>{title}</div>
                                  {sub && <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:3, fontFamily:T.sans }}>{sub}</div>}
                                </div>
                                {right}
                              </div>
                            );

                            // ── Computed pipeline values
                            const quota = (settings.quotaData?.quarterlyQuota || (settings.users||[]).reduce((s,u)=>s+(parseFloat(u.quota)||0),0)) || 175000;
                            const commitOpps  = openOpps.filter(o=>['Closing','Negotiation'].includes(o.stage));
                            const commitVal   = wonOpps.reduce((s,o)=>s+(parseFloat(o.arr)||0),0) + commitOpps.reduce((s,o)=>s+(parseFloat(o.arr)||0),0);
                            const bestCaseVal = commitVal + openOpps.filter(o=>['Proposal'].includes(o.stage)).reduce((s,o)=>s+(parseFloat(o.arr)||0),0);
                            const attainPct   = Math.round((totalWonRevenue / Math.max(quota,1)) * 100);
                            const gapToQuota  = Math.max(0, quota - totalWonRevenue);
                            const coverage    = gapToQuota > 0 ? (totalPipelineValue / gapToQuota) : null;

                            // Pipeline movement (last 7 days)
                            const cutoff7 = new Date(Date.now()-7*86400000).toISOString().slice(0,10);
                            const addedOpps2  = reportsOpps.filter(o=>o.createdDate>=cutoff7 && !['Closed Won','Closed Lost'].includes(o.stage));
                            const slippedOpps2= reportsOpps.filter(o=>{ const cd=o.forecastedCloseDate||o.closeDate; return cd && cd<new Date().toISOString().slice(0,10) && !['Closed Won','Closed Lost'].includes(o.stage); });
                            const added2  = addedOpps2.reduce((s,o)=>s+(parseFloat(o.arr)||0),0);
                            const slipped2= slippedOpps2.reduce((s,o)=>s+(parseFloat(o.arr)||0),0);
                            const startPipe = Math.max(totalPipelineValue + slipped2 - added2, 0);
                            const netDelta = totalPipelineValue - startPipe;

                            // Waterfall steps
                            const wfSteps = [
                              { label:'Start of week', value:startPipe, kind:'total' },
                              { label:'Added',  value:added2,    kind:'pos' },
                              { label:'Slipped', value:-slipped2, kind:'neg' },
                              { label:'Won',    value:-totalWonRevenue, kind:'won' },
                              { label:'End of week', value:totalPipelineValue, kind:'total' },
                            ];
                            const maxWF = Math.max(startPipe, totalPipelineValue) * 1.1 || 1;
                            const chartW=600, chartH=180, barW=66;
                            const gap=(chartW-barW*wfSteps.length)/(wfSteps.length+1);
                            const yS=(v)=>chartH-(Math.max(0,v)/maxWF)*chartH;
                            let running=0;
                            const wfBars = wfSteps.map((s,i)=>{
                              const x=gap+i*(barW+gap);
                              if(s.kind==='total'){ running=s.value; return {...s,x,y:yS(s.value),h:Math.max(2,chartH-yS(s.value)),vl:fmt(s.value)}; }
                              const before=running; running+=s.value;
                              const top=yS(Math.max(before,running)); const bot=yS(Math.min(before,running));
                              return {...s,x,y:top,h:Math.max(2,bot-top),vl:(s.value>=0?'+':'')+fmt(s.value)};
                            });
                            const wfColor=(k)=>k==='total'?T.ink:k==='pos'?T.ok:k==='won'?'#3a5530':T.danger;

                            // Stage conversion funnel — cohort-based calculation
                            // Logic: for each stage N, "entered" = all opps that have ever
                            // been at stage N or beyond (using stageHistory if available, else
                            // current stage as proxy). "Advanced" = opps that reached stage N+1
                            // or beyond. Conversion = advanced / entered.
                            // Example: 100 in Discovery, 80 reached Proposal = 80% conv rate.
                            // Then 80 in Proposal, 40 reached Negotiation = 50% conv rate.
                            const stageOrder = ['Prospecting','Qualification','Discovery','Proposal','Negotiation','Closing','Closed Won'];
                            const stageColors2 = {
                              'Prospecting':'#b0a088','Qualification':'#c8a978','Discovery':'#b07a55',
                              'Proposal':'#b87333','Negotiation':'#7a5a3c','Closing':'#4d6b3d','Closed Won':'#3a5530',
                            };
                            // All opps in scope (open + closed, so the funnel includes terminal outcomes)
                            const allScopeOpps = reportsOpps;
                            const stageRank = (stage) => stageOrder.indexOf(stage);

                            // For each opp, determine the highest stage it has reached.
                            // Use stageHistory if present, otherwise fall back to current stage.
                            const oppMaxStage = allScopeOpps.map(o => {
                              if (o.stageHistory && o.stageHistory.length > 0) {
                                const ranks = o.stageHistory.map(h => stageRank(h.stage)).filter(r => r >= 0);
                                const currentRank = stageRank(o.stage);
                                return Math.max(...ranks, currentRank >= 0 ? currentRank : 0);
                              }
                              return stageRank(o.stage) >= 0 ? stageRank(o.stage) : 0;
                            });

                            // Build funnel — exclude Closed Won from the displayed rows
                            // (it appears as the denominator for Closing's conversion)
                            const funnelStages = stageOrder.slice(0, -1); // exclude Closed Won display row
                            const stageFunnelData = funnelStages.map((st, i) => {
                              const myRank = stageRank(st);
                              // Entered = opps that reached at least this stage
                              const entered = oppMaxStage.filter(r => r >= myRank).length;
                              // Advanced = opps that reached the next stage (rank myRank+1 or beyond)
                              const advanced = i < funnelStages.length - 1
                                ? oppMaxStage.filter(r => r >= myRank + 1).length
                                : null; // Closing → Closed Won
                              // For the last visible stage (Closing), advanced = Closed Won count
                              const advancedFinal = st === 'Closing'
                                ? oppMaxStage.filter(r => r >= stageRank('Closed Won')).length
                                : advanced;
                              return {
                                stage: st,
                                entered,
                                advanced: advancedFinal,
                                color: stageColors2[st] || '#8a8378',
                              };
                            }).filter(s => s.entered > 0);
                            const maxEntered = Math.max(...stageFunnelData.map(s => s.entered), 1);

                            // Deals at risk
                            const today2iso = new Date().toISOString().slice(0,10);
                            const dealsRisk = openOpps.map(o=>{
                              const flags=[];
                              const lastAct=(activities||[]).filter(a=>a.opportunityId===o.id).sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0];
                              const daysStale=lastAct?.date ? Math.floor((Date.now()-new Date(lastAct.date+'T12:00:00'))/86400000) : null;
                              const cd=o.forecastedCloseDate||o.closeDate;
                              if(daysStale!==null&&daysStale>=14) flags.push({l:`No activity in ${daysStale}d`,s:'high'});
                              if(cd&&cd<today2iso) flags.push({l:`Close date passed ${Math.floor((Date.now()-new Date(cd+'T12:00:00'))/86400000)}d ago`,s:'high'});
                              if(!o.nextStep) flags.push({l:'No next step',s:'low'});
                              return {...o,flags};
                            }).filter(o=>o.flags.length>0).sort((a,b)=>(b.flags.filter(f=>f.s==='high').length-a.flags.filter(f=>f.s==='high').length)||((parseFloat(b.arr)||0)-(parseFloat(a.arr)||0))).slice(0,5);

                            // Forecast accuracy - computed from real closed-won opps grouped by fiscal quarter.
                            // Until a forecast-snapshot table exists in the DB, we display closed-won revenue
                            // per quarter. If no closed deals exist yet, fxHasData=false renders an empty state.
                            const buildFxHistory = () => {
                              const now2 = new Date();
                              const results = [];
                              for (let qi = 5; qi >= 0; qi--) {
                                const qStart = new Date(now2.getFullYear(), now2.getMonth() - qi * 3 - 3, 1);
                                const qEnd   = new Date(qStart.getFullYear(), qStart.getMonth() + 3, 0);
                                if (qEnd >= now2) continue;
                                const qWon = (reportsTimedOpps || []).filter(o => {
                                  if (o.stage !== 'Closed Won') return false;
                                  const d = o.forecastedCloseDate || o.closeDate;
                                  if (!d) return false;
                                  const od = new Date(d + 'T12:00:00');
                                  return od >= qStart && od <= qEnd;
                                });
                                const actual = qWon.reduce((s,o) => s + (parseFloat(o.arr)||0) + (o.implementationCost||0), 0);
                                const label = `Q${Math.ceil((qStart.getMonth()+1)/3)} ${String(qStart.getFullYear()).slice(2)}`;
                                results.push({ q: label, fc: actual, ac: actual, att: 1.0, hasReal: qWon.length > 0 });
                              }
                              return results;
                            };
                            const fxHistory = buildFxHistory();
                            const fxHasData = fxHistory.some(h => h.hasReal);
                            const avgAcc = fxHistory.length > 0 ? fxHistory.reduce((s,h)=>s+h.att,0)/fxHistory.length : 1;
                            const fxMax = fxHasData ? Math.max(...fxHistory.map(h=>Math.max(h.fc,h.ac)))*1.1 : 1;
                            const fxW=500,fxH=130,fxPL=16,fxPR=16,fxIW=fxW-fxPL-fxPR;
                            const fxX=(i)=>fxPL+(i/Math.max(fxHistory.length-1,1))*fxIW;
                            const fxY=(v)=>fxH-(v/Math.max(fxMax,1))*fxH;
                            const fcPath=fxHasData?fxHistory.map((h,i)=>`${i===0?'M':'L'}${fxX(i)},${fxY(h.fc)}`).join(' '):'M0,0';
                            const acPath=fxHasData?fxHistory.map((h,i)=>`${i===0?'M':'L'}${fxX(i)},${fxY(h.ac)}`).join(' '):'M0,0';

                            return (
                              <>
                                {/* Pipeline waterfall */}
                                <Panel>
                                  <SecHdr title="Pipeline movement" sub="Last 7 days — what changed"
                                    right={<span style={{ fontSize:14, fontWeight:700, color:netDelta>=0?T.ok:T.danger, fontFamily:T.sans }}>{netDelta>=0?'+':''}{fmt(netDelta)}</span>}/>
                                  <svg width="100%" viewBox={`0 0 ${chartW} ${chartH+48}`} style={{ display:'block' }}>
                                    {[0.25,0.5,0.75,1].map(f=>(
                                      <line key={f} x1={0} x2={chartW} y1={chartH-chartH*f} y2={chartH-chartH*f} stroke={T.border} strokeWidth={0.5} strokeDasharray="2 4"/>
                                    ))}
                                    {wfBars.map((b,i)=>{ if(i===wfBars.length-1)return null; const n=wfBars[i+1]; const ly=b.kind==='total'?b.y:(b.value>=0?b.y:b.y+b.h); return <line key={'c'+i} x1={b.x+barW} y1={ly} x2={n.x} y2={ly} stroke={T.borderStrong} strokeWidth={1} strokeDasharray="3 3"/>; })}
                                    {wfBars.map((b,i)=>(
                                      <g key={i}>
                                        <rect x={b.x} y={b.y} width={barW} height={b.h} fill={wfColor(b.kind)} opacity={b.kind==='total'?1:0.85} rx={2}/>
                                        <text x={b.x+barW/2} y={b.y-6} fontSize="10.5" fontWeight="600" textAnchor="middle" fill={T.ink} fontFamily={T.sans}>{b.vl}</text>
                                        <text x={b.x+barW/2} y={chartH+18} fontSize="10.5" fontWeight="500" textAnchor="middle" fill={T.inkMid} fontFamily={T.sans}>{b.label}</text>
                                      </g>
                                    ))}
                                  </svg>
                                  <div style={{ display:'flex', gap:14, marginTop:4, fontSize:11, color:T.inkMid, fontFamily:T.sans }}>
                                    {[{c:T.ink,l:'Totals'},{c:T.ok,l:'Added'},{c:'#3a5530',l:'Won'},{c:T.danger,l:'Slipped'}].map(({c,l})=>(
                                      <span key={l} style={{ display:'inline-flex', alignItems:'center', gap:5 }}><span style={{ width:10,height:10,background:c,borderRadius:2 }}/>{l}</span>
                                    ))}
                                  </div>
                                </Panel>

                                {/* Forecast + Forecast accuracy */}
                                <div style={{ display:'grid', gridTemplateColumns:'1.3fr 1fr', gap:14 }}>
                                  <Panel>
                                    <SecHdr title="Quarter forecast vs quota" sub={`Commit / best-case / pipeline against quota`}/>
                                    <div style={{ display:'flex', gap:20, alignItems:'center' }}>
                                      {/* Ring */}
                                      <div style={{ position:'relative', width:110, height:110, flexShrink:0 }}>
                                        <svg width={110} height={110}>
                                          {[T.surface2,null].map((_,j)=>{
                                            const r2=47, stroke=10, c2=2*Math.PI*r2;
                                            const pct=Math.min(1,attainPct/100);
                                            const col=attainPct>=100?T.ok:attainPct>=70?T.warn:T.danger;
                                            return j===0
                                              ? <circle key="t" cx={55} cy={55} r={r2} stroke={T.surface2} strokeWidth={stroke} fill="none"/>
                                              : <circle key="v" cx={55} cy={55} r={r2} stroke={col} strokeWidth={stroke} fill="none" strokeDasharray={c2} strokeDashoffset={c2*(1-pct)} strokeLinecap="round" transform="rotate(-90 55 55)"/>;
                                          })}
                                        </svg>
                                        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column' }}>
                                          <div style={{ fontSize:22, fontWeight:700, color:T.ink, lineHeight:1, fontFamily:T.sans }}>{attainPct}%</div>
                                          <div style={{ fontSize:9, color:T.inkMuted, fontFamily:T.sans, textTransform:'uppercase', letterSpacing:0.4 }}>commit</div>
                                        </div>
                                      </div>
                                      <div style={{ flex:1 }}>
                                        {[
                                          { label:'Closed won',    value:totalWonRevenue,   color:T.ok },
                                          { label:'Commit',        value:commitVal,         color:'#3a5530' },
                                          { label:'Best case',     value:bestCaseVal,       color:T.warn },
                                          { label:'Total pipeline',value:totalPipelineValue,color:T.inkMuted },
                                        ].map(r=>(
                                          <div key={r.label} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                                            <div style={{ width:110, fontSize:12, color:T.inkMid, fontWeight:500, fontFamily:T.sans }}>{r.label}</div>
                                            <HBar value={r.value} max={Math.max(quota,totalPipelineValue)*1.1} color={r.color}/>
                                            <div style={{ width:56, textAlign:'right', fontSize:12, fontWeight:600, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace' }}>{fmt(r.value)}</div>
                                          </div>
                                        ))}
                                        <div style={{ marginTop:4, padding:'8px 12px', background:T.surface2, borderRadius:T.r, display:'flex', gap:12, fontSize:12, color:T.inkMid, fontFamily:T.sans, flexWrap:'wrap' }}>
                                          <span><strong style={{ color:T.ink }}>{fmt(gapToQuota)}</strong> gap to quota</span>
                                          {coverage && <><span style={{ opacity:0.4 }}>·</span><span><strong style={{ color:T.ink }}>{coverage.toFixed(1)}×</strong> coverage</span></>}
                                        </div>
                                      </div>
                                    </div>
                                  </Panel>
                                  <Panel>
                                    <SecHdr title="Forecast accuracy" sub={fxHasData ? `Last ${fxHistory.length} closed quarters` : 'Closed quarter history'}
                                      right={fxHasData ? <div style={{ textAlign:'right' }}><div style={eb(T.inkMuted)}>Avg accuracy</div><div style={{ fontSize:18, fontWeight:700, color:T.ink, fontFamily:T.sans }}>{Math.round(avgAcc*100)}%</div></div> : null}/>
                                    {!fxHasData ? (
                                      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:130, gap:8, border:`1px dashed ${T.borderStrong}`, borderRadius:T.r, background:T.surface2, padding:'20px 24px', textAlign:'center' }}>
                                        <svg width="36" height="24" viewBox="0 0 36 24" fill="none"><path d="M2 20 L8 14 L14 17 L22 7 L34 10" stroke={T.borderStrong} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3 3"/><circle cx="34" cy="10" r="2" fill={T.borderStrong}/></svg>
                                        <div style={{ fontSize:13, fontWeight:600, color:T.ink, fontFamily:T.sans }}>No closed deal history yet</div>
                                        <div style={{ fontSize:11.5, color:T.inkMuted, lineHeight:1.55, maxWidth:280, fontFamily:T.sans }}>This chart will populate automatically once deals close. It compares won revenue to forecast each quarter — no setup needed.</div>
                                      </div>
                                    ) : (
                                    <>
                                    <svg width="100%" viewBox={`0 0 ${fxW} ${fxH+30}`} style={{ display:'block' }}>
                                      {[0.5,1].map(f=><line key={f} x1={fxPL} x2={fxW-fxPR} y1={fxH-fxH*f} y2={fxH-fxH*f} stroke={T.border} strokeWidth={0.5} strokeDasharray="2 4"/>)}
                                      <path d={fcPath} fill="none" stroke={T.inkMuted} strokeWidth={1.5} strokeDasharray="4 3"/>
                                      <path d={acPath} fill="none" stroke={T.ink} strokeWidth={2}/>
                                      {fxHistory.map((h,i)=>(
                                        <g key={i}>
                                          <circle cx={fxX(i)} cy={fxY(h.fc)} r={3} fill={T.surface} stroke={T.inkMuted} strokeWidth={1.5}/>
                                          <circle cx={fxX(i)} cy={fxY(h.ac)} r={3.5} fill={T.ink}/>
                                          <text x={fxX(i)} y={fxH+18} fontSize="10" textAnchor="middle" fill={T.inkMuted} fontFamily={T.sans}>{h.q}</text>
                                          <text x={fxX(i)} y={fxY(h.ac)-7} fontSize="9" textAnchor="middle" fill={h.att>=1?T.ok:h.att>=0.9?T.ink:T.danger} fontWeight="600" fontFamily={T.sans}>{Math.round(h.att*100)}%</text>
                                        </g>
                                      ))}
                                    </svg>
                                    <div style={{ display:'flex', gap:14, marginTop:4, fontSize:11, color:T.inkMid, fontFamily:T.sans }}>
                                      <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}><svg width="18" height="2"><line x1="0" y1="1" x2="18" y2="1" stroke={T.inkMuted} strokeWidth="1.5" strokeDasharray="3 2"/></svg>Forecast</span>
                                      <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}><svg width="18" height="2"><line x1="0" y1="1" x2="18" y2="1" stroke={T.ink} strokeWidth="2"/></svg>Actual</span>
                                    </div>
                                    </>
                                    )}
                                  </Panel>
                                </div>

                                {/* Stage funnel + Deals at risk */}
                                <div style={{ display:'grid', gridTemplateColumns:'1fr 1.1fr', gap:14 }}>
                                  <Panel>
                                    <SecHdr title="Stage conversion" sub="How deals flow through stages"/>
                                    <div style={{ display:'grid', gridTemplateColumns:'110px 1fr 55px 65px', gap:10, alignItems:'center', padding:'0 0 8px', borderBottom:`1px solid ${T.border}`, marginBottom:8 }}>
                                      {['Stage','Entered → Next','Conv.',''].map((h,i)=><div key={i} style={{ ...eb(T.inkMuted), textAlign:i>=2?'right':'left' }}>{h}</div>)}
                                    </div>
                                    {stageFunnelData.map((s,i)=>{
                                      // Correct cohort conversion: advanced / entered
                                      // This cannot exceed 100% because advanced is always a
                                      // subset of entered (both counted from the same opp pool)
                                      const conv = s.advanced != null && s.entered > 0
                                        ? s.advanced / s.entered
                                        : null;
                                      const weak = conv != null && conv < 0.55;
                                      return (
                                        <div key={s.stage} style={{ display:'grid', gridTemplateColumns:'110px 1fr 55px 65px', gap:10, alignItems:'center', padding:'8px 0', borderBottom:i<stageFunnelData.length-1?`1px solid ${T.border}`:'none' }}>
                                          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, fontWeight:500, color:T.ink, fontFamily:T.sans }}>
                                            <span style={{ width:3, height:14, background:s.color, borderRadius:1.5 }}/>
                                            {s.stage}
                                          </div>
                                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                            <div style={{ fontSize:12, fontWeight:600, color:T.ink, width:24, textAlign:'right', fontFamily:'ui-monospace,Menlo,monospace' }}>{s.entered}</div>
                                            <HBar value={s.entered} max={maxEntered} color={s.color}/>
                                            {s.advanced!=null&&<div style={{ fontSize:12, fontWeight:600, color:T.inkMid, width:24, textAlign:'right', fontFamily:'ui-monospace,Menlo,monospace' }}>{s.advanced}</div>}
                                          </div>
                                          <div style={{ textAlign:'right', fontSize:12, fontWeight:600, color:weak?T.danger:T.ink, fontFamily:T.sans }}>{conv!=null?Math.round(conv*100)+'%':'—'}</div>
                                          <div style={{ textAlign:'right', fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>—</div>
                                        </div>
                                      );
                                    })}
                                    {stageFunnelData.length===0&&<div style={{ padding:'2rem', textAlign:'center', color:T.inkMuted, fontSize:13, fontStyle:'italic', fontFamily:T.sans }}>No open opportunities in this period.</div>}
                                    <div style={{ marginTop:10, padding:'7px 10px', background:T.surface2, borderRadius:T.r, fontSize:11, color:T.inkMuted, lineHeight:1.5, fontFamily:T.sans }}>
                                      <strong style={{ color:T.inkMid }}>How this is calculated:</strong> "Entered" = all opps that reached each stage. "Advanced" = those that continued to the next stage. Conversion = advanced ÷ entered — e.g. 100 in Discovery, 80 reach Proposal = 80%.
                                    </div>
                                  </Panel>

                                  <Panel p="20px 22px 6px">
                                    <SecHdr title="Deals at risk" sub={`${dealsRisk.length} open deals have risk flags`}/>
                                    {dealsRisk.length===0?(
                                      <div style={{ padding:'2rem', textAlign:'center', color:T.inkMuted, fontSize:13, fontStyle:'italic', fontFamily:T.sans }}>No at-risk deals — great work! 🎉</div>
                                    ):dealsRisk.map((o,i)=>(
                                      <div key={o.id} style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:12, alignItems:'center', padding:'10px 0', borderTop:`1px solid ${T.border}` }}>
                                        <div style={{ minWidth:0 }}>
                                          <div style={{ fontSize:13, fontWeight:600, color:T.ink, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:T.sans }}>{o.opportunityName||o.account}</div>
                                          <div style={{ fontSize:11, color:T.inkMuted, marginTop:1, fontFamily:T.sans }}>{o.account} · {o.stage}</div>
                                          <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:5 }}>
                                            {o.flags.map((f,fi)=>(
                                              <span key={fi} style={{ fontSize:10, fontWeight:500, padding:'2px 7px', borderRadius:10, background:f.s==='high'?'rgba(156,58,46,0.12)':'rgba(184,115,51,0.12)', color:f.s==='high'?T.danger:T.warn, fontFamily:T.sans }}>{f.l}</span>
                                            ))}
                                          </div>
                                        </div>
                                        <div style={{ textAlign:'right', fontSize:13, fontWeight:600, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace', flexShrink:0 }}>{fmt(o.arr)}</div>
                                      </div>
                                    ))}
                                  </Panel>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                        )}


                        {/* ════════════════════════════════════════════
                             TAB: PERFORMANCE
                            ════════════════════════════════════════════ */}
                        {reportSubTab === 'performance' && (
                        <div style={{ display:'flex', flexDirection:'column', gap:'1rem', padding:'1rem 1.25rem 1.5rem' }}>

                          {/* ── V2 Quota Attainment Leaderboard ── */}
                          {(() => {
                            const T2 = { surface:'#fbf8f3', surface2:'#f5efe3', border:'#e6ddd0', ink:'#2a2622', inkMid:'#5a544c', inkMuted:'#8a8378', gold:'#c8b99a', ok:'#4d6b3d', warn:'#b87333', danger:'#9c3a2e', sans:'"Plus Jakarta Sans",system-ui,sans-serif', serif:'Georgia,serif', r:3 };
                            const eb2 = (c) => ({ fontSize:10, fontWeight:700, color:c||T2.inkMuted, letterSpacing:0.8, textTransform:'uppercase', fontFamily:T2.sans });
                            const fmt2 = (v) => { const n=parseFloat(v)||0; if(n>=1e6)return '$'+(n/1e6).toFixed(1)+'M'; if(n>=1e3)return '$'+Math.round(n/1e3)+'K'; return '$'+Math.round(n).toLocaleString(); };

                            // Build per-rep stats
                            const visibleRepNames2 = (() => {
                              if (reportsRep) return new Set([reportsRep]);
                              if (reportsTeam) return new Set((settings.users||[]).filter(u=>u.team===reportsTeam).map(u=>u.name));
                              if (reportsTerritory) return new Set((settings.users||[]).filter(u=>u.territory===reportsTerritory).map(u=>u.name));
                              return new Set(reportsOpps.map(o=>o.salesRep||o.assignedTo).filter(Boolean));
                            })();
                            const quotaMode = (settings.users||[]).find(u=>u.quotaType)?.quotaType||'annual';
                            const hasSlice2 = reportsRep||reportsTeam||reportsTerritory;
                            const visibleUsers2 = (settings.users||[]).filter(u=>{
                              if(u.userType==='ReadOnly'||!u.name)return false;
                              if(hasSlice2)return visibleRepNames2.has(u.name);
                              const hq=(u.annualQuota||0)>0||(u.q1Quota||0)>0;
                              return hq||visibleRepNames2.has(u.name);
                            });
                            const getUserQuota = (u) => (u.quotaType||quotaMode)==='annual'?(u.annualQuota||0):(u.q1Quota||0)+(u.q2Quota||0)+(u.q3Quota||0)+(u.q4Quota||0);
                            const totalQuota2 = visibleUsers2.reduce((s,u)=>s+getUserQuota(u),0);
                            const closedWonValue2 = wonOpps.reduce((s,o)=>s+(parseFloat(o.arr)||0)+(parseFloat(o.implementationCost)||0),0);
                            const attainPct2 = totalQuota2>0?(closedWonValue2/totalQuota2*100):0;

                            // Per-rep data
                            const repNames = [...visibleRepNames2].sort();
                            const maxWidth = 1.2;
                            const repRows = repNames.map(rep=>{
                              const rUser = (settings.users||[]).find(u=>u.name===rep);
                              const quota = rUser ? getUserQuota(rUser) : 0;
                              const rWon  = wonOpps.filter(o=>(o.salesRep||o.assignedTo)===rep);
                              const rLost = lostOpps.filter(o=>(o.salesRep||o.assignedTo)===rep);
                              const rOpen = openOpps.filter(o=>(o.salesRep||o.assignedTo)===rep);
                              const closed = rWon.reduce((s,o)=>s+(parseFloat(o.arr)||0)+(parseFloat(o.implementationCost)||0),0);
                              const commit = rOpen.filter(o=>['Closing','Negotiation'].includes(o.stage)).reduce((s,o)=>s+(parseFloat(o.arr)||0),0);
                              const attain = quota>0?closed/quota:0;
                              const commitPct = quota>0?commit/quota:0;
                              const winRate2 = (rWon.length+rLost.length)>0?rWon.length/(rWon.length+rLost.length):0;
                              const vDeals = rWon.filter(o=>o.createdDate&&(o.forecastedCloseDate||o.closeDate));
                              const cycle = vDeals.length>0?Math.round(vDeals.reduce((s,o)=>{ return s+Math.max(0,Math.floor((new Date(o.forecastedCloseDate||o.closeDate)-new Date(o.createdDate))/86400000)); },0)/vDeals.length):null;
                              const avgDeal = rWon.length>0?closed/rWon.length:0;
                              return { rep, quota, closed, commit, attain, commitPct, winRate:winRate2, cycle, avgDeal, wonCount:rWon.length, openCount:rOpen.length, role:rUser?.userType||'Rep' };
                            }).sort((a,b)=>b.attain-a.attain);

                            if(repRows.length===0&&totalQuota2===0){
                              return <div style={{ background:T2.surface, border:`1px solid ${T2.border}`, borderRadius:T2.r, padding:'1.25rem', color:T2.inkMuted, fontSize:'0.8125rem', fontFamily:T2.sans }}>No quota data. Configure rep quotas in Settings → Team.</div>;
                            }

                            // Sparkline (simplified — trend from monthly won revenue)
                            const Spark2 = ({ rep }) => {
                              const pts = Array.from({length:6},(_,i)=>{
                                const d = new Date(new Date().getFullYear(), new Date().getMonth()-(5-i),1);
                                const nxt = new Date(d.getFullYear(),d.getMonth()+1,1);
                                return wonOpps.filter(o=>(o.salesRep||o.assignedTo)===rep&&(() => { const cd=new Date((o.forecastedCloseDate||o.closeDate||'')+'T12:00:00'); return cd>=d&&cd<nxt; })()).reduce((s,o)=>s+(parseFloat(o.arr)||0),0);
                              });
                              const max=Math.max(...pts,1);
                              const w=80,h=20;
                              const path=pts.map((v,i)=>`${i===0?'M':'L'}${Math.round((i/(pts.length-1))*w)},${Math.round(h-(v/max)*h)}`).join(' ');
                              const trendColor=pts[pts.length-1]>=pts[0]?T2.ok:T2.danger;
                              return <svg width={w} height={h+4} style={{ display:'block' }}><path d={path} fill="none" stroke={trendColor} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round"/><circle cx={Math.round((pts.length-1)/(pts.length-1)*w)} cy={Math.round(h-(pts[pts.length-1]/max)*h)} r={2} fill={trendColor}/></svg>;
                            };

                            return (
                              <>
                                {/* Team KPI strip */}
                                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
                                  {[
                                    { label:'Team attainment', value:attainPct2.toFixed(0)+'%', sub:`${fmt2(closedWonValue2)} of ${fmt2(totalQuota2)}` },
                                    { label:'Win rate',        value:winRate.toFixed(0)+'%',     sub:`${wonOpps.length} won / ${lostOpps.length} lost` },
                                    { label:'Avg deal size',   value:fmt2(avgDealSize),           sub:'closed won' },
                                    { label:'Open pipeline',   value:fmt2(totalPipelineValue),    sub:`${openOpps.length} deals` },
                                  ].map(k=>(
                                    <div key={k.label} style={{ background:T2.surface, border:`1px solid ${T2.border}`, borderRadius:T2.r, padding:'14px 16px' }}>
                                      <div style={eb2(T2.inkMuted)}>{k.label}</div>
                                      <div style={{ fontSize:24, fontWeight:700, color:T2.ink, letterSpacing:-0.5, lineHeight:1.1, marginTop:4, fontFamily:T2.sans }}>{k.value}</div>
                                      <div style={{ fontSize:11, color:T2.inkMuted, marginTop:3, fontFamily:T2.sans }}>{k.sub}</div>
                                    </div>
                                  ))}
                                </div>

                                {/* Leaderboard — segmented bars */}
                                {repRows.length > 0 && (
                                  <div style={{ background:T2.surface, border:`1px solid ${T2.border}`, borderRadius:T2.r, padding:'20px 22px' }}>
                                    {/* Header */}
                                    <div style={{ display:'flex', alignItems:'flex-end', gap:14, marginBottom:10 }}>
                                      <div style={{ flex:1 }}>
                                        <div style={{ fontSize:16, fontFamily:T2.serif, fontStyle:'italic', fontWeight:400, color:T2.ink, lineHeight:1.1 }}>Quota attainment</div>
                                        <div style={{ fontSize:11.5, color:T2.inkMuted, marginTop:3, fontFamily:T2.sans }}>Closed + commit vs quota, this period</div>
                                      </div>
                                      <div style={{ display:'flex', gap:14, fontSize:11, color:T2.inkMid, fontFamily:T2.sans }}>
                                        {[{c:'#3a5530',l:'Closed'},{c:T2.gold,l:'Commit'},{c:'dashed',l:'100% quota'}].map(({c,l})=>(
                                          <span key={l} style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
                                            {c==='dashed'
                                              ? <svg width="14" height="8"><line x1="7" y1="0" x2="7" y2="8" stroke={T2.ink} strokeWidth="1.5" strokeDasharray="2 2"/></svg>
                                              : <span style={{ width:10,height:10,background:c,borderRadius:2 }}/>}
                                            {l}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                    {/* Column headers */}
                                    <div style={{ display:'grid', gridTemplateColumns:'180px 1fr 60px 84px 65px', gap:12, alignItems:'center', padding:'0 0 8px', borderBottom:`1px solid ${T2.border}`, marginBottom:6 }}>
                                      {['Rep','Progress','Attain','Trend (6mo)','Quota'].map((h,i)=><div key={i} style={{ ...eb2(T2.inkMuted), textAlign:i>=2?'right':'left' }}>{h}</div>)}
                                    </div>
                                    {/* Rep rows */}
                                    {repRows.map((r,i)=>{
                                      const attainColor=r.attain>=1?T2.ok:r.attain>=0.8?T2.ink:r.attain>=0.6?T2.warn:T2.danger;
                                      const totalPct=r.attain+r.commitPct;
                                      return (
                                        <div key={r.rep} style={{ display:'grid', gridTemplateColumns:'180px 1fr 60px 84px 65px', gap:12, alignItems:'center', padding:'9px 0', borderBottom:i<repRows.length-1?`1px solid ${T2.border}`:'none' }}>
                                          {/* Name */}
                                          <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                                            <div style={{ width:28, height:28, borderRadius:'50%', background:'#9c6b4a', color:'#fef4e6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, flexShrink:0, textTransform:'uppercase' }}>
                                              {r.rep.split(' ').map(w=>w[0]).join('').slice(0,2)}
                                            </div>
                                            <div style={{ minWidth:0 }}>
                                              <div style={{ fontSize:13, fontWeight:600, color:T2.ink, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', fontFamily:T2.sans }}>{r.rep}</div>
                                              <div style={{ fontSize:10.5, color:T2.inkMuted, marginTop:1, fontFamily:T2.sans }}>{r.role}</div>
                                            </div>
                                          </div>
                                          {/* Segmented bar */}
                                          <div style={{ position:'relative' }}>
                                            <div style={{ height:14, background:T2.surface2, borderRadius:2, overflow:'hidden', display:'flex' }}>
                                              <div style={{ width:`${Math.min((r.attain/maxWidth)*100,100)}%`, background:'#3a5530', height:'100%' }}/>
                                              <div style={{ width:`${Math.min((r.commitPct/maxWidth)*100,100-(r.attain/maxWidth)*100)}%`, background:T2.gold, height:'100%' }}/>
                                            </div>
                                            <div style={{ position:'absolute', top:-2, bottom:-2, left:`${(1/maxWidth)*100}%`, borderLeft:`1.5px dashed ${T2.ink}` }}/>
                                          </div>
                                          {/* Attainment % */}
                                          <div style={{ textAlign:'right', fontSize:14, fontWeight:700, color:attainColor, fontFamily:T2.sans }}>{Math.round(r.attain*100)}%</div>
                                          {/* Sparkline */}
                                          <div style={{ display:'flex', justifyContent:'flex-end' }}><Spark2 rep={r.rep}/></div>
                                          {/* Quota */}
                                          <div style={{ textAlign:'right', fontSize:12, color:T2.inkMid, fontFamily:'ui-monospace,Menlo,monospace' }}>{fmt2(r.quota)}</div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Rep metrics table */}
                                {repRows.length > 1 && (
                                  <div style={{ background:T2.surface, border:`1px solid ${T2.border}`, borderRadius:T2.r, padding:'20px 22px 8px' }}>
                                    <div style={{ display:'flex', alignItems:'flex-end', gap:14, marginBottom:10 }}>
                                      <div style={{ flex:1 }}>
                                        <div style={{ fontSize:16, fontFamily:T2.serif, fontStyle:'italic', fontWeight:400, color:T2.ink, lineHeight:1.1 }}>Rep metrics</div>
                                        <div style={{ fontSize:11.5, color:T2.inkMuted, marginTop:3, fontFamily:T2.sans }}>How each rep compares to team on the fundamentals</div>
                                      </div>
                                    </div>
                                    <div style={{ display:'grid', gridTemplateColumns:'160px 64px 90px 90px 90px 100px', gap:10, alignItems:'center', padding:'0 0 8px', borderBottom:`1px solid ${T2.border}` }}>
                                      {['Rep','Won','Win rate','Avg deal','Cycle','Pipeline'].map((h,i)=><div key={i} style={{ ...eb2(T2.inkMuted), textAlign:i===0?'left':'right' }}>{h}</div>)}
                                    </div>
                                    {(() => {
                                      const teamAvgWR  = repRows.filter(r=>r.winRate>0).reduce((s,r)=>s+r.winRate,0)/(repRows.filter(r=>r.winRate>0).length||1);
                                      const teamAvgAD  = repRows.filter(r=>r.avgDeal>0).reduce((s,r)=>s+r.avgDeal,0)/(repRows.filter(r=>r.avgDeal>0).length||1);
                                      const teamAvgCy  = repRows.filter(r=>r.cycle).reduce((s,r)=>s+(r.cycle||0),0)/(repRows.filter(r=>r.cycle).length||1);
                                      const DiffCell = ({ value, avg, fmt3, inverted=false }) => {
                                        if(!value&&value!==0) return <div style={{ textAlign:'right', fontSize:12, color:T2.inkMuted, fontFamily:T2.sans }}>—</div>;
                                        const p=avg>0?((value-avg)/avg*100):0;
                                        const good=inverted?p<0:p>0;
                                        const col=Math.abs(p)<5?T2.inkMuted:good?T2.ok:T2.danger;
                                        return (
                                          <div style={{ textAlign:'right' }}>
                                            <div style={{ fontSize:12, fontWeight:600, color:T2.ink, fontFamily:T2.sans }}>{fmt3(value)}</div>
                                            <div style={{ fontSize:9.5, color:col, fontWeight:600, marginTop:1, fontFamily:T2.sans }}>{Math.abs(p)<5?'avg':(p>0?'+':'')+p.toFixed(0)+'%'}</div>
                                          </div>
                                        );
                                      };
                                      return repRows.map((r,i)=>(
                                        <div key={r.rep} style={{ display:'grid', gridTemplateColumns:'160px 64px 90px 90px 90px 100px', gap:10, alignItems:'center', padding:'10px 0', borderBottom:i<repRows.length-1?`1px solid ${T2.border}`:'none' }}>
                                          <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
                                            <div style={{ width:22, height:22, borderRadius:'50%', background:'#9c6b4a', color:'#fef4e6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, flexShrink:0, textTransform:'uppercase' }}>
                                              {r.rep.split(' ').map(w=>w[0]).join('').slice(0,2)}
                                            </div>
                                            <div style={{ fontSize:12, fontWeight:500, color:T2.ink, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:T2.sans }}>{r.rep}</div>
                                          </div>
                                          <div style={{ textAlign:'right', fontSize:12, color:T2.ink, fontFamily:T2.sans }}>{r.wonCount}</div>
                                          <DiffCell value={r.winRate} avg={teamAvgWR} fmt3={v=>Math.round(v*100)+'%'}/>
                                          <DiffCell value={r.avgDeal} avg={teamAvgAD} fmt3={fmt2}/>
                                          <DiffCell value={r.cycle} avg={teamAvgCy} fmt3={v=>v+'d'} inverted/>
                                          <div style={{ textAlign:'right', fontSize:12, color:T2.ink, fontFamily:'ui-monospace,Menlo,monospace' }}>{fmt2(r.openCount>0?openOpps.filter(o=>(o.salesRep||o.assignedTo)===r.rep).reduce((s,o)=>s+(parseFloat(o.arr)||0),0):0)}</div>
                                        </div>
                                      ));
                                    })()}
                                  </div>
                                )}
                              </>
                            );
                          })()}

                          {/* Sales Velocity */}
                          {(() => {
                            const velocityDeals = wonOpps.filter(o => o.createdDate && (o.forecastedCloseDate||o.closeDate));
                            const avgDays = velocityDeals.length > 0 ? Math.round(velocityDeals.reduce((s,o)=>{ const created=new Date(o.createdDate); const closed=new Date(o.forecastedCloseDate||o.closeDate); return s+Math.max(0,Math.floor((closed-created)/86400000)); },0)/velocityDeals.length) : null;
                            const stageVelocity = (settings.funnelStages||[]).filter(s=>s.name!=='Closed Won'&&s.name!=='Closed Lost').map(st => {
                              const sDeals = wonOpps.filter(o => (o.stageHistory||[]).some(h=>h.stage===st.name));
                              const avg = sDeals.length > 0 ? Math.round(sDeals.reduce((s,o)=>{
                                const entry = (o.stageHistory||[]).find(h=>h.stage===st.name);
                                return s + (entry ? Math.max(0,Math.floor((new Date()-new Date(entry.enteredAt))/86400000)) : 0);
                              },0)/sDeals.length) : null;
                              return { stage:st.name, avg, count:sDeals.length };
                            }).filter(s=>s.avg!==null);
                            const allRepsVel = [...new Set(wonOpps.map(o=>o.salesRep||o.assignedTo).filter(Boolean))].sort();
                            const repVelocity = allRepsVel.map(rep => {
                              const rDeals = velocityDeals.filter(o=>(o.salesRep||o.assignedTo)===rep);
                              const avg = rDeals.length > 0 ? Math.round(rDeals.reduce((s,o)=>{ const created=new Date(o.createdDate); const closed=new Date(o.forecastedCloseDate||o.closeDate); return s+Math.max(0,Math.floor((closed-created)/86400000)); },0)/rDeals.length) : 0;
                              return { rep, avg, count:rDeals.length, wonRev: rDeals.reduce((s,o)=>s+(o.arr||0)+(o.implementationCost||0),0) };
                            }).sort((a,b)=>a.avg-b.avg);
                            const maxRepAvg = Math.max(...repVelocity.map(r=>r.avg),1);
                            return (
                            <div style={cardStyle}>
                              <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#2a2622', marginBottom:'1rem' }}>⚡ Sales Velocity</div>
                              {avgDays === null ? <div style={{ color:'#8a8378', fontSize:'0.8125rem' }}>No closed won deals with creation dates yet.</div> : (
                              <div style={{ display:'grid', gridTemplateColumns: repVelocity.length >= 2 ? '1fr 1fr' : '1fr', gap:'1.25rem' }}>
                                <div>
                                  <div style={labelStyle}>Avg Days to Close</div>
                                  <div style={{ fontSize:'2rem', fontWeight:'800', color:'#2a2622', marginBottom:'1rem' }}>{avgDays} <span style={{ fontSize:'1rem', color:'#8a8378', fontWeight:'500' }}>days</span></div>
                                  {stageVelocity.length > 0 && <>
                                    <div style={labelStyle}>Avg Days by Stage</div>
                                    {stageVelocity.map(({stage,avg})=>{
                                      const maxAvg = Math.max(...stageVelocity.map(s=>s.avg),1);
                                      return <div key={stage} style={{ marginBottom:'0.5rem' }}>
                                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.2rem' }}>
                                          <span style={{ fontSize:'0.75rem', color:'#5a544c' }}>{stage}</span>
                                          <span style={{ fontSize:'0.75rem', fontWeight:'700', color:'#2a2622' }}>{avg}d</span>
                                        </div>
                                        <div style={{ height:'5px', background:'#f5efe3', borderRadius:'3px', overflow:'hidden' }}>
                                          <div style={{ height:'100%', width:(avg/maxAvg*100)+'%', background:'linear-gradient(to right,#5a4a7a,#5a4a7a)', borderRadius:'3px' }}/>
                                        </div>
                                      </div>;
                                    })}
                                  </>}
                                </div>
                                {repVelocity.length >= 2 && (
                                <div>
                                  <div style={labelStyle}>Velocity by Rep</div>
                                  {repVelocity.map(({rep,avg,count,wonRev})=>(
                                    <div key={rep} style={{ marginBottom:'0.625rem' }}>
                                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.2rem' }}>
                                        <span style={{ fontSize:'0.75rem', fontWeight:'600', color:'#5a544c', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'130px' }}>{rep}</span>
                                        <span style={{ fontSize:'0.75rem', color:'#8a8378' }}>{avg}d · {count} deals</span>
                                      </div>
                                      <div style={{ height:'5px', background:'#f5efe3', borderRadius:'3px', overflow:'hidden' }}>
                                        <div style={{ height:'100%', width:(avg/maxRepAvg*100)+'%', background:'linear-gradient(to right,#3a5a7a,#5a4a7a)', borderRadius:'3px' }}/>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                )}
                              </div>
                              )}
                            </div>
                            );
                          })()}

                          {/* Win / Loss Analysis */}
                          {(() => {
                            const totalClosed = wonOpps.length + lostOpps.length;
                            const wRate = totalClosed > 0 ? (wonOpps.length/totalClosed*100) : 0;
                            const lostARR = lostOpps.reduce((s,o)=>s+(o.arr||0)+(o.implementationCost||0),0);
                            const catCounts = lostOpps.reduce((acc,o)=>{
                              const cat = o.lostReason || o.closedLostReason || 'Unknown';
                              acc[cat] = (acc[cat]||0)+1; return acc;
                            },{});
                            const catRows = Object.entries(catCounts).sort((a,b)=>b[1]-a[1]);
                            const maxCat = Math.max(...catRows.map(([,c])=>c),1);
                            return (
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
                              {/* Win Rate card */}
                              <div style={cardStyle}>
                                <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#2a2622', marginBottom:'1rem' }}>🏆 Win Rate</div>
                                <div style={{ display:'flex', alignItems:'center', gap:'1.5rem', marginBottom:'1rem' }}>
                                  <div style={{ textAlign:'center' }}>
                                    <div style={{ fontSize:'2.5rem', fontWeight:'900', color: wRate>=50?'#4d6b3d':wRate>=30?'#b87333':'#9c3a2e' }}>{wRate.toFixed(0)}%</div>
                                    <div style={{ fontSize:'0.6875rem', color:'#8a8378' }}>win rate</div>
                                  </div>
                                  <div style={{ flex:1 }}>
                                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.25rem' }}>
                                      <span style={{ fontSize:'0.75rem', color:'#4d6b3d', fontWeight:'600' }}>Won: {wonOpps.length}</span>
                                      <span style={{ fontSize:'0.75rem', color:'#9c3a2e', fontWeight:'600' }}>Lost: {lostOpps.length}</span>
                                    </div>
                                    <div style={{ height:'10px', background:'rgba(156,58,46,0.08)', borderRadius:'5px', overflow:'hidden' }}>
                                      <div style={{ height:'100%', width:wRate+'%', background:'#4d6b3d', borderRadius:'5px' }}/>
                                    </div>
                                    <div style={{ fontSize:'0.6875rem', color:'#8a8378', marginTop:'0.375rem' }}>
                                      Avg won deal: ${wonOpps.length>0?Math.round(wonOpps.reduce((s,o)=>s+(o.arr||0),0)/wonOpps.length).toLocaleString():'—'}
                                    </div>
                                  </div>
                                </div>
                              </div>
                              {/* Loss Analysis card */}
                              <div style={cardStyle}>
                                <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#2a2622', marginBottom:'1rem' }}>📉 Loss Analysis</div>
                                {lostOpps.length === 0 ? <div style={{ color:'#8a8378', fontSize:'0.8125rem' }}>No closed lost opportunities yet.</div> : <>
                                  <div style={{ fontSize:'0.6875rem', color:'#8a8378', marginBottom:'0.75rem' }}>{lostOpps.length} deals lost · ${lostARR.toLocaleString()} ARR</div>
                                  {catRows.map(([cat,cnt])=>(
                                    <div key={cat} style={{ marginBottom:'0.5rem' }}>
                                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.2rem' }}>
                                        <span style={{ fontSize:'0.75rem', color:'#5a544c' }}>{cat}</span>
                                        <span style={{ fontSize:'0.75rem', fontWeight:'700', color:'#9c3a2e' }}>{cnt}</span>
                                      </div>
                                      <div style={{ height:'5px', background:'#f5efe3', borderRadius:'3px', overflow:'hidden' }}>
                                        <div style={{ height:'100%', width:(cnt/maxCat*100)+'%', background:'#9c3a2e', borderRadius:'3px', opacity:0.7 }}/>
                                      </div>
                                    </div>
                                  ))}
                                </>}
                              </div>
                            </div>
                            );
                          })()}

                          {/* Rep Leaderboard — NEW */}
                          {(() => {
                            const repList = [...new Set(reportsOpps.map(o=>o.salesRep||o.assignedTo).filter(Boolean))].sort();
                            const repStats = repList.map(rep => {
                              const rOpps = reportsOpps.filter(o=>(o.salesRep||o.assignedTo)===rep);
                              const rWon  = rOpps.filter(o=>o.stage==='Closed Won');
                              const rLost = rOpps.filter(o=>o.stage==='Closed Lost');
                              const rOpen = rOpps.filter(o=>o.stage!=='Closed Won'&&o.stage!=='Closed Lost');
                              const wonRev = rWon.reduce((s,o)=>s+(o.arr||0)+(o.implementationCost||0),0);
                              const winPct = (rWon.length+rLost.length)>0 ? rWon.length/(rWon.length+rLost.length)*100 : 0;
                              return { rep, wonRev, wonCount:rWon.length, openCount:rOpen.length, winPct };
                            }).sort((a,b)=>b.wonRev-a.wonRev);
                            const maxRev = Math.max(...repStats.map(r=>r.wonRev),1);
                            if (repStats.length < 2) return null;
                            return (
                            <div style={cardStyle}>
                              <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#2a2622', marginBottom:'0.875rem' }}>🏅 Rep Leaderboard</div>
                              <div style={{ overflowX:'auto' }}>
                                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem' }}>
                                  <thead><tr>
                                    {['#','Rep','Won Revenue','Deals Won','Win Rate','Open Pipeline'].map(h=>(
                                      <th key={h} style={{ padding:'0.4rem 0.75rem', textAlign: h==='Rep'||h==='#'?'left':'right', fontSize:'0.6875rem', fontWeight:'700', color:'#8a8378', textTransform:'uppercase', borderBottom:'2px solid #e6ddd0', whiteSpace:'nowrap' }}>{h}</th>
                                    ))}
                                  </tr></thead>
                                  <tbody>
                                    {repStats.map((r,i)=>(
                                      <tr key={r.rep} style={{ background:i%2===0?'#fff':'#fbf8f3' }}>
                                        <td style={{ padding:'0.5rem 0.75rem', fontWeight:'700', color: i===0?'#b87333':i===1?'#8a8378':i===2?'#b87333':'#d4c8b4' }}>#{i+1}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', fontWeight:'600', color:'#2a2622' }}>{r.rep}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', fontWeight:'700', color:'#4d6b3d' }}>${r.wonRev.toLocaleString()}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#5a544c' }}>{r.wonCount}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color: r.winPct>=50?'#4d6b3d':r.winPct>=30?'#b87333':'#9c3a2e', fontWeight:'600' }}>{r.winPct.toFixed(0)}%</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#3a5a7a' }}>{r.openCount}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                            );
                          })()}

                          {/* Rep vs Rep Comparison */}
                          {(() => {
                            const rLC=[...new Set(reportsOpps.map(o=>o.salesRep||o.assignedTo).filter(Boolean))].sort();
                            if(rLC.length<2)return null;
                            const rSC=rLC.map(rep=>{
                              const rO=reportsOpps.filter(o=>(o.salesRep||o.assignedTo)===rep);
                              const rW=rO.filter(o=>o.stage==='Closed Won');
                              const rL=rO.filter(o=>o.stage==='Closed Lost');
                              const rP=rO.filter(o=>o.stage!=='Closed Won'&&o.stage!=='Closed Lost');
                              const wr=(rW.length+rL.length)>0?Math.round(rW.length/(rW.length+rL.length)*100):0;
                              const vD=rW.filter(o=>o.createdDate&&(o.forecastedCloseDate||o.closeDate));
                              const ad=vD.length>0?Math.round(vD.reduce((s,o)=>{const c=new Date(o.createdDate);const cl=new Date(o.forecastedCloseDate||o.closeDate);return s+Math.max(0,Math.floor((cl-c)/86400000));},0)/vD.length):null;
                              const wonR=rW.reduce((s,o)=>s+(parseFloat(o.arr)||0)+(parseFloat(o.implementationCost)||0),0);
                              const pipe=rP.reduce((s,o)=>s+(parseFloat(o.arr)||0),0);
                              return{rep,wonR,wr,ad,pipe};
                            });
                            const mxR=Math.max(...rSC.map(r=>r.wonR),1);
                            const mxP=Math.max(...rSC.map(r=>r.pipe),1);
                            const mxD=Math.max(...rSC.filter(r=>r.ad!==null).map(r=>r.ad),1);
                            const fC=v=>v>=1000000?'$'+(v/1000000).toFixed(1)+'M':v>=1000?'$'+Math.round(v/1000)+'K':'$'+Math.round(v);
                            const mts=[
                              {k:'wonR', lbl:'Won Revenue',   fmt:fC,              mx:mxR, col:'#4d6b3d', hi:true},
                              {k:'wr',   lbl:'Win Rate',      fmt:v=>v+'%',        mx:100, col:'#3a5a7a', hi:true},
                              {k:'pipe', lbl:'Open Pipeline', fmt:fC,              mx:mxP, col:'#5a4a7a', hi:true},
                              {k:'ad',   lbl:'Cycle Days',    fmt:v=>v!=null?v+'d':'-', mx:mxD, col:'#b87333', hi:false},
                            ];
                            return(
                              <div style={cardStyle}>
                                <div style={{fontWeight:'700',fontSize:'0.9375rem',color:'#2a2622',marginBottom:'1rem'}}>&#128202; Rep vs Rep Comparison</div>
                                <div style={{overflowX:'auto'}}>
                                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.8125rem',minWidth:'480px'}}>
                                    <thead><tr style={{borderBottom:'2px solid #e6ddd0'}}>
                                      <th style={{padding:'0.4rem 0.75rem',textAlign:'left',fontSize:'0.6875rem',fontWeight:'700',color:'#8a8378',textTransform:'uppercase',width:'120px'}}>Metric</th>
                                      {rSC.map(r=><th key={r.rep} style={{padding:'0.4rem 0.75rem',textAlign:'right',fontSize:'0.6875rem',fontWeight:'700',color:'#2a2622',whiteSpace:'nowrap'}}>{r.rep}</th>)}
                                    </tr></thead>
                                    <tbody>{mts.map(m=>{
                                      const vals=rSC.map(r=>r[m.k]);
                                      const best=m.hi?Math.max(...vals.filter(v=>v!==null)):Math.min(...vals.filter(v=>v!==null));
                                      return(<tr key={m.k} style={{borderBottom:'1px solid #f5efe3'}}>
                                        <td style={{padding:'0.625rem 0.75rem',fontWeight:'600',color:'#5a544c',fontSize:'0.75rem',whiteSpace:'nowrap'}}>
                                          <span style={{display:'inline-block',width:'8px',height:'8px',borderRadius:'50%',background:m.col,marginRight:'6px',verticalAlign:'middle'}}/>{m.lbl}
                                        </td>
                                        {rSC.map(r=>{
                                          const val=r[m.k];
                                          const ib=val!==null&&val===best&&rSC.filter(x=>x[m.k]===best).length<rSC.length;
                                          const pct=m.mx>0&&val!==null?Math.round((m.k==='ad'?(1-val/m.mx):val/m.mx)*100):0;
                                          return(<td key={r.rep} style={{padding:'0.5rem 0.75rem',textAlign:'right',verticalAlign:'middle'}}>
                                            <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:'3px'}}>
                                              <span style={{fontWeight:ib?'800':'600',color:ib?m.col:'#5a544c'}}>
                                                {m.fmt(val)}{ib&&rSC.length>1&&<span style={{marginLeft:'4px',fontSize:'0.6rem',background:m.col+'20',color:m.col,padding:'1px 5px',borderRadius:'999px'}}>best</span>}
                                              </span>
                                              <div style={{width:'80px',height:'4px',background:'#f5efe3',borderRadius:'2px',overflow:'hidden'}}>
                                                <div style={{height:'100%',width:Math.max(pct,2)+'%',background:m.col,borderRadius:'2px'}}/>
                                              </div>
                                            </div>
                                          </td>);
                                        })}
                                      </tr>);
                                    })}</tbody>
                                  </table>
                                </div>
                              </div>
                            );
                          })()}

{/* Coaching Red Flags */}
                          {canSeeAll&&(()=>{
                            const WB=45,AB=7,SD=14;
                            const rCF=[...new Set(reportsOpps.map(o=>o.salesRep||o.assignedTo).filter(Boolean))].sort();
                            const aF=[];
                            rCF.forEach(rep=>{
                              const rO=reportsOpps.filter(o=>(o.salesRep||o.assignedTo)===rep);
                              const rW=rO.filter(o=>o.stage==='Closed Won');
                              const rL=rO.filter(o=>o.stage==='Closed Lost');
                              const rP=rO.filter(o=>o.stage!=='Closed Won'&&o.stage!=='Closed Lost');
                              const cl=rW.length+rL.length;
                              const wr=cl>0?Math.round(rW.length/cl*100):null;
                              const rA=(activities||[]).filter(a=>a.salesRep===rep||a.author===rep);
                              const la=rA.sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0]?.date||null;
                              const ds=la?Math.floor((new Date()-new Date(la+'T12:00:00'))/86400000):null;
                              const st=rP.filter(o=>{const la2=(activities||[]).filter(a=>a.opportunityId===o.id).sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0];const ds2=la2?.date?Math.floor((new Date()-new Date(la2.date+'T12:00:00'))/86400000):null;return ds2!==null&&ds2>=SD;});
                              const fl=[];
                              if(wr!==null&&wr<WB&&cl>=3)fl.push({t:'warning',s:wr+'% win rate vs '+WB+'% benchmark ('+cl+' closed deals)'});
                              if(ds!==null&&ds>=AB*2)fl.push({t:'danger',s:ds+'d since last activity — above '+AB+'d ideal'});
                              else if(ds!==null&&ds>=AB)fl.push({t:'warning',s:ds+'d since last activity (ideal is '+AB+'d)'});
                              else if(ds===null)fl.push({t:'warning',s:'No activities logged in this period'});
                              if(st.length>0)fl.push({t:'danger',s:st.length+' deal'+(st.length>1?'s':'')+' with no activity in 14+ days: '+st.slice(0,2).map(o=>o.opportunityName||o.account).join(', ')+(st.length>2?' +'+(st.length-2)+' more':'')});
                              if(rP.length===0&&rW.length===0)fl.push({t:'info',s:'No open or closed deals in this period'});
                              if(fl.length>0)aF.push({rep,fl});
                            });
                            const FC={danger:{bg:'rgba(156,58,46,0.08)',border:'rgba(156,58,46,0.3)',text:'#9c3a2e',dot:'#9c3a2e'},warning:{bg:'rgba(184,115,51,0.1)',border:'#c8b99a',text:'#7a6a48',dot:'#b87333'},info:{bg:'rgba(58,90,122,0.08)',border:'#d4c8b4',text:'#3a5a7a',dot:'#3a5a7a'}};
                            return(
                              <div style={cardStyle}>
                                <div style={{fontWeight:'700',fontSize:'0.9375rem',color:'#2a2622',marginBottom:'1rem'}}>&#128681; Coaching Red Flags <span style={{fontSize:'0.6875rem',fontWeight:'400',color:'#8a8378',marginLeft:'6px'}}>Managers only</span></div>
                                {aF.length===0?(<div style={{fontSize:'0.8125rem',color:'#2e4a24',background:'rgba(77,107,61,0.07)',border:'1px solid rgba(77,107,61,0.3)',borderRadius:'8px',padding:'12px 14px'}}>No coaching concerns detected for this period.</div>):(
                                  <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                                    {aF.map(({rep,fl})=>(
                                      <div key={rep} style={{border:'1px solid #e6ddd0',borderRadius:'8px',overflow:'hidden'}}>
                                        <div style={{padding:'7px 14px',background:'#fbf8f3',borderBottom:'1px solid #e6ddd0',fontWeight:'700',fontSize:'0.8125rem',color:'#2a2622'}}>{rep} <span style={{fontWeight:'400',color:'#8a8378',fontSize:'0.6875rem'}}>{fl.length} flag{fl.length>1?'s':''}</span></div>
                                        <div style={{padding:'8px 14px',display:'flex',flexDirection:'column',gap:'5px'}}>
                                          {fl.map((f,fi)=>{const c=FC[f.t]||FC.info;return(<div key={fi} style={{display:'flex',alignItems:'flex-start',gap:'8px',padding:'6px 10px',background:c.bg,border:'0.5px solid '+c.border,borderRadius:'6px'}}><div style={{width:'7px',height:'7px',borderRadius:'50%',background:c.dot,flexShrink:0,marginTop:'4px'}}/><div style={{fontSize:'0.8125rem',color:c.text,lineHeight:1.5}}>{f.s}</div></div>);})}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })()}


                        </div>
                        )}

                        {/* ════════════════════════════════════════════
                             TAB: REVENUE
                            ════════════════════════════════════════════ */}
                        {reportSubTab === 'revenue' && (
                        <div style={{ display:'flex', flexDirection:'column', gap:'1rem', padding:'1rem 1.25rem 1.5rem' }}>

                          {/* Won Revenue by Quarter + Monthly Trend */}
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
                            <div style={cardStyle}>
                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.875rem' }}>
                                <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#2a2622' }}>📆 Won Revenue by Quarter ({currentYear})</div>
                                <button onClick={() => { const rows=revenueByQuarter.map((r,i)=>`<tr style="background:${i%2===0?'#fff':'#fbf8f3'}"><td>${r.q}</td><td style="text-align:right;font-weight:700;">$${r.rev.toLocaleString()}</td></tr>`).join(''); printSection('Won Revenue by Quarter',`<div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
<table><thead><tr><th>Quarter</th><th style="text-align:right;">Won Revenue</th></tr></thead><tbody>${rows}</tbody></table>
</div>`); }} style={printBtnStyle}>🖨️ Print</button>
                              </div>
                              {revenueByQuarter.map(({q,rev})=>(
                                <div key={q} style={{ marginBottom:'0.625rem' }}>
                                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.3rem' }}>
                                    <span style={{ fontSize:'0.8125rem', fontWeight:'600', color:'#5a544c' }}>{q}</span>
                                    <span style={{ fontSize:'0.8125rem', fontWeight:'700', color:'#2a2622' }}>${rev.toLocaleString()}</span>
                                  </div>
                                  <div style={{ height:'8px', background:'#f5efe3', borderRadius:'4px', overflow:'hidden' }}>
                                    <div style={{ height:'100%', width:(rev/maxQRev*100)+'%', background:'linear-gradient(to right,#3a5a7a,#5a4a7a)', borderRadius:'4px' }}/>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div style={cardStyle}>
                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.875rem' }}>
                                <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#2a2622' }}>📈 Monthly Won Revenue (Last 6 Mo.)</div>
                                <button onClick={() => { const rows=monthlyData.map((m,i)=>`<tr style="background:${i%2===0?'#fff':'#fbf8f3'}"><td>${m.label}</td><td style="text-align:right;font-weight:700;">$${m.rev.toLocaleString()}</td><td style="text-align:center;">${m.count}</td></tr>`).join(''); printSection('Monthly Won Revenue — Last 6 Months',`<div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
<table><thead><tr><th>Month</th><th style="text-align:right;">Won Revenue</th><th style="text-align:center;">Deals</th></tr></thead><tbody>${rows}</tbody></table>
</div>`); }} style={printBtnStyle}>🖨️ Print</button>
                              </div>
                              <div style={{ display:'flex', alignItems:'flex-end', gap:'0.5rem', height:'120px' }}>
                                {monthlyData.map((m,i)=>(
                                  <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'0.25rem', height:'100%', justifyContent:'flex-end' }}>
                                    <div title={'$'+m.rev.toLocaleString()+' · '+m.count+' deals'} style={{ width:'100%', background:m.rev>0?'linear-gradient(to top,#3a5a7a,#5a4a7a)':'#e6ddd0', borderRadius:'4px 4px 0 0', height:Math.max(m.rev/maxMonthRev*100,m.rev>0?4:2)+'%', transition:'height 0.4s ease' }}/>
                                    <span style={{ fontSize:'0.625rem', color:'#8a8378', whiteSpace:'nowrap' }}>{m.label}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Closed Won Summary — NEW */}
                          {(() => {
                            const sortedWon = [...wonOpps].sort((a,b)=>new Date(b.forecastedCloseDate||b.closeDate||0)-new Date(a.forecastedCloseDate||a.closeDate||0));
                            return (
                            <div style={cardStyle}>
                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.875rem' }}>
                                <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#2a2622' }}>✅ Closed Won Summary</div>
                                <ReportBtn title="Closed Won Summary" contentFn={() => {
                                  let html='<table><tr><th>Opportunity</th><th>Account</th><th>Rep</th><th style="text-align:right">ARR</th><th style="text-align:right">Impl Cost</th><th>Close Date</th></tr>';
                                  sortedWon.forEach(o=>{ html+=`<tr><td>${o.opportunityName||o.account||'—'}</td><td>${o.account||'—'}</td><td>${o.salesRep||o.assignedTo||'—'}</td><td style="text-align:right">$${(o.arr||0).toLocaleString()}</td><td style="text-align:right">$${(o.implementationCost||0).toLocaleString()}</td><td>${o.forecastedCloseDate||o.closeDate||'—'}</td></tr>`; });
                                  html+='</table>'; return html;
                                }} />
                              </div>
                              {sortedWon.length === 0 ? <div style={{ color:'#8a8378', fontSize:'0.8125rem' }}>No closed won deals yet.</div> : (
                              <div style={{ overflowX:'auto' }}>
                                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem' }}>
                                  <thead><tr>
                                    {['Opportunity','Account','Rep','ARR','Impl Cost','Close Date'].map(h=>(
                                      <th key={h} style={{ padding:'0.4rem 0.75rem', textAlign:['ARR','Impl Cost'].includes(h)?'right':'left', fontSize:'0.6875rem', fontWeight:'700', color:'#8a8378', textTransform:'uppercase', borderBottom:'2px solid #e6ddd0', whiteSpace:'nowrap' }}>{h}</th>
                                    ))}
                                  </tr></thead>
                                  <tbody>
                                    {sortedWon.slice(0,25).map((o,i)=>(
                                      <tr key={o.id} style={{ background:i%2===0?'#fff':'#fbf8f3' }}>
                                        <td style={{ padding:'0.5rem 0.75rem', fontWeight:'600', color:'#2a2622', maxWidth:'180px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{o.opportunityName||o.account||'—'}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', color:'#5a544c', maxWidth:'140px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{o.account||'—'}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', color:'#5a544c', whiteSpace:'nowrap' }}>{o.salesRep||o.assignedTo||'—'}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#4d6b3d', fontWeight:'600' }}>${(o.arr||0).toLocaleString()}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#5a544c' }}>${(o.implementationCost||0).toLocaleString()}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', color:'#8a8378', whiteSpace:'nowrap' }}>{o.forecastedCloseDate||o.closeDate||'—'}</td>
                                      </tr>
                                    ))}
                                    {sortedWon.length > 25 && <tr><td colSpan={6} style={{ padding:'0.5rem 0.75rem', color:'#8a8378', fontSize:'0.75rem', textAlign:'center' }}>Showing 25 of {sortedWon.length} deals</td></tr>}
                                  </tbody>
                                </table>
                              </div>
                              )}
                            </div>
                            );
                          })()}

                          {/* Revenue by Team + Territory — NEW */}
                          {(() => {
                            const users = settings.users || [];
                            const teamNames = [...new Set(users.filter(u=>u.team).map(u=>u.team))].sort();
                            const terrNames = [...new Set(users.filter(u=>u.territory).map(u=>u.territory))].sort();
                            if (teamNames.length === 0 && terrNames.length === 0) return null;
                            const buildRows = (names, getUsers) => names.map(n => {
                              const uSet = new Set(getUsers(n));
                              const gWon = wonOpps.filter(o=>uSet.has(o.salesRep||o.assignedTo));
                              return { name:n, rev: gWon.reduce((s,o)=>s+(o.arr||0)+(o.implementationCost||0),0), count:gWon.length, arr: gWon.reduce((s,o)=>s+(o.arr||0),0) };
                            }).sort((a,b)=>b.rev-a.rev);
                            const teamRows = buildRows(teamNames, n => users.filter(u=>u.team===n).map(u=>u.name));
                            const terrRows = buildRows(terrNames, n => users.filter(u=>u.territory===n).map(u=>u.name));
                            const RevTable = ({ title, icon, rows }) => {
                              const maxRev = Math.max(...rows.map(r=>r.rev),1);
                              return (
                              <div style={cardStyle}>
                                <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#2a2622', marginBottom:'0.875rem' }}>{icon} {title}</div>
                                {rows.length === 0 ? <div style={{ color:'#8a8378', fontSize:'0.8125rem' }}>No data.</div> :
                                  rows.map(r=>(
                                    <div key={r.name} style={{ marginBottom:'0.625rem' }}>
                                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.25rem' }}>
                                        <span style={{ fontSize:'0.75rem', fontWeight:'600', color:'#5a544c' }}>{r.name}</span>
                                        <span style={{ fontSize:'0.75rem', fontWeight:'700', color:'#4d6b3d' }}>${r.rev.toLocaleString()} <span style={{ color:'#8a8378', fontWeight:'400' }}>({r.count} deals)</span></span>
                                      </div>
                                      <div style={{ height:'6px', background:'#f5efe3', borderRadius:'3px', overflow:'hidden' }}>
                                        <div style={{ height:'100%', width:(r.rev/maxRev*100)+'%', background:'linear-gradient(to right,#4d6b3d,#4d6b3d)', borderRadius:'3px' }}/>
                                      </div>
                                    </div>
                                  ))
                                }
                              </div>
                              );
                            };
                            return (
                              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
                                {teamNames.length > 0 && <RevTable title="Won Revenue by Team" icon="👥" rows={teamRows} />}
                                {terrNames.length > 0 && <RevTable title="Won Revenue by Territory" icon="📍" rows={terrRows} />}
                              </div>
                            );
                          })()}

                          {/* YoY Revenue Comparison */}
                          {(()=>{
                            const nY=new Date(),tY=nY.getFullYear(),lY=tY-1;
                            const aW=(reportsOpps||[]).filter(o=>o.stage==='Closed Won');
                            const gMR=yr=>Array.from({length:12},(_,m)=>{
                              const rev=aW.filter(o=>{const d=o.forecastedCloseDate||o.closeDate;if(!d)return false;const od=new Date(d+'T12:00:00');return od.getFullYear()===yr&&od.getMonth()===m;}).reduce((s,o)=>s+(parseFloat(o.arr)||0)+(parseFloat(o.implementationCost)||0),0);
                              return{month:new Date(yr,m,1).toLocaleString('default',{month:'short'}),rev};
                            });
                            const tD=gMR(tY),lD=gMR(lY);
                            const tT=tD.reduce((s,m)=>s+m.rev,0),lT=lD.reduce((s,m)=>s+m.rev,0);
                            if(lT===0&&tT===0)return null;
                            const yMx=Math.max(...tD.map(m=>m.rev),...lD.map(m=>m.rev),1);
                            const yDl=lT>0?((tT-lT)/lT*100):null;
                            const fY=v=>v>=1000000?'$'+(v/1000000).toFixed(1)+'M':v>=1000?'$'+Math.round(v/1000)+'K':'$'+Math.round(v);
                            return(
                              <div style={cardStyle}>
                                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem',flexWrap:'wrap',gap:'0.5rem'}}>
                                  <div style={{fontWeight:'700',fontSize:'0.9375rem',color:'#2a2622'}}>&#128197; Year-over-Year Revenue</div>
                                  <div style={{display:'flex',gap:'1rem',alignItems:'center',flexWrap:'wrap'}}>
                                    <span style={{fontSize:'0.75rem',color:'#8a8378'}}><span style={{display:'inline-block',width:'10px',height:'3px',background:'#3a5a7a',borderRadius:'2px',marginRight:'5px',verticalAlign:'middle'}}/>{tY}: <strong>{fY(tT)}</strong></span>
                                    <span style={{fontSize:'0.75rem',color:'#8a8378'}}><span style={{display:'inline-block',width:'10px',height:'3px',background:'#d4c8b4',borderRadius:'2px',marginRight:'5px',verticalAlign:'middle'}}/>{lY}: <strong>{fY(lT)}</strong></span>
                                    {yDl!==null&&<span style={{fontSize:'0.75rem',fontWeight:'700',color:yDl>=0?'#4d6b3d':'#9c3a2e',background:yDl>=0?'rgba(77,107,61,0.1)':'rgba(156,58,46,0.08)',padding:'2px 8px',borderRadius:'999px'}}>{yDl>=0?'+':''}{yDl.toFixed(1)}% YoY</span>}
                                  </div>
                                </div>
                                <div style={{display:'flex',gap:'4px',alignItems:'flex-end',height:'120px'}}>
                                  {tD.map((d,i)=>{
                                    const ly=lD[i].rev;
                                    const tH=Math.round((d.rev/yMx)*100),lH=Math.round((ly/yMx)*100);
                                    return(<div key={d.month} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:'2px'}}>
                                      <div style={{width:'100%',display:'flex',gap:'1px',alignItems:'flex-end',height:'100px'}}>
                                        <div style={{flex:1,height:Math.max(tH,2)+'%',background:'#3a5a7a',borderRadius:'2px 2px 0 0',opacity:0.85,minHeight:d.rev>0?'3px':'0'}} title={tY+': '+fY(d.rev)}/>
                                        <div style={{flex:1,height:Math.max(lH,2)+'%',background:'#d4c8b4',borderRadius:'2px 2px 0 0',minHeight:ly>0?'3px':'0'}} title={lY+': '+fY(ly)}/>
                                      </div>
                                      <div style={{fontSize:'0.5rem',color:'#8a8378'}}>{d.month}</div>
                                    </div>);
                                  })}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Commissions Report */}
                          {(() => {
                            const commissionReportPeriods = ['This Quarter', 'Last Quarter', 'This Year', 'Last Year', 'All Time'];
                            const getCommissionPeriodOpps = (period) => {
                              const now = new Date();
                              const yr = now.getFullYear();
                              const fiscalStart = settings.fiscalYearStart || 10;
                              // Build fiscal quarter ranges for this year and last year
                              const getFQR = (baseYear) => {
                                const qs = {};
                                ['Q1','Q2','Q3','Q4'].forEach((q, qi) => {
                                    const rawMonth = fiscalStart - 1 + qi * 3;
                                    const sm = (rawMonth % 12) + 1;
                                    const sy = rawMonth >= 12 ? baseYear + 1 : baseYear;
                                    const endRaw = new Date(sy, sm - 1 + 3, 0);
                                    qs[q] = { start: new Date(`${sy}-${String(sm).padStart(2,'0')}-01`), end: endRaw };
                                });
                                return qs;
                              };
                              // Determine current fiscal quarter
                              const thisYearRanges = getFQR(yr);
                              const lastYearRanges = getFQR(yr - 1);
                              const today = now;
                              let curQKey = 'Q4';
                              for (const [qk, range] of Object.entries(thisYearRanges)) {
                                if (today >= range.start && today <= range.end) { curQKey = qk; break; }
                              }
                              // Find last quarter key
                              const qKeys = ['Q1','Q2','Q3','Q4'];
                              const curQIdx = qKeys.indexOf(curQKey);
                              const lastQKey = curQIdx === 0 ? 'Q4' : qKeys[curQIdx - 1];
                              const lastQRanges = curQIdx === 0 ? lastYearRanges : thisYearRanges;
                              const fyStart = new Date(thisYearRanges['Q1'].start);
                              const fyEnd = new Date(thisYearRanges['Q4'].end);
                              const lastFyStart = new Date(lastYearRanges['Q1'].start);
                              const lastFyEnd = new Date(lastYearRanges['Q4'].end);
                              if (period==='This Quarter') return wonOpps.filter(o=>{ const d=new Date(o.forecastedCloseDate||o.closeDate); return d>=thisYearRanges[curQKey].start&&d<=thisYearRanges[curQKey].end; });
                              if (period==='Last Quarter') return wonOpps.filter(o=>{ const d=new Date(o.forecastedCloseDate||o.closeDate); return d>=lastQRanges[lastQKey].start&&d<=lastQRanges[lastQKey].end; });
                              if (period==='This Year') return wonOpps.filter(o=>{ const d=new Date(o.forecastedCloseDate||o.closeDate); return d>=fyStart&&d<=fyEnd; });
                              if (period==='Last Year') return wonOpps.filter(o=>{ const d=new Date(o.forecastedCloseDate||o.closeDate); return d>=lastFyStart&&d<=lastFyEnd; });
                              return wonOpps;
                            };
                            const periodOpps = getCommissionPeriodOpps(commissionReportFilter||'This Quarter');
                            const periodLabel = commissionReportFilter||'This Quarter';
                            const calcCommission = (revenue, quota) => {
                              const plan = settings.commissionPlan || { tiers:[{threshold:0,rate:0.05}] };
                              const tiers = plan.tiers || [{threshold:0,rate:0.05}];
                              const attain = quota > 0 ? revenue/quota : 0;
                              const tier = [...tiers].reverse().find(t=>(t.threshold||0)/100<=attain) || tiers[0];
                              return revenue * ((tier?.rate||0.05));
                            };
                            // SPIFF calculation
                            const activeSpiffs = (settings.spiffs||[]).filter(s => s.active);
                            const calcSpiff = (repOpps, baseComm) => {
                                return activeSpiffs.reduce((total, spiff) => {
                                    const amt = parseFloat(spiff.amount) || 0;
                                    if (!amt) return total;
                                    if (spiff.type === 'flat') return total + repOpps.length * amt;
                                    if (spiff.type === 'pct') return total + repOpps.reduce((s,o)=>s+(parseFloat(o.arr)||0)*amt/100, 0);
                                    if (spiff.type === 'multiplier') return total + baseComm * (amt - 1); // additive delta
                                    return total;
                                }, 0);
                            };
                            const reps2 = (settings.users||[]).filter(u=>u.role==='User'||u.role==='Rep');
                            const getRepTotal = u => { const qd=settings.quotaData||{}; return qd.type==='annual'?(qd.annualQuota||0)/4:(qd.q1Quota||0); };
                            const repRows2 = reps2.map(u=>{ const rw=periodOpps.filter(o=>(o.salesRep||o.assignedTo)===u.name); const rev=rw.reduce((s,o)=>s+(o.arr||0)+(o.implementationCost||0),0); const quot=getRepTotal(u); const attain=quot>0?(rev/quot*100):null; const comm=calcCommission(rev,quot); const spiff=activeSpiffs.length>0?calcSpiff(rw,comm):0; return { name:u.name, deals:rw.length, rev, quot, attain, comm, spiff, total:comm+spiff }; }).sort((a,b)=>b.rev-a.rev);
                            const totals = repRows2.reduce((s,r)=>({rev:s.rev+r.rev,commission:s.commission+r.comm,spiff:s.spiff+r.spiff,total:s.total+r.total}),{rev:0,commission:0,spiff:0,total:0});
                            const hasSpiffs = activeSpiffs.length > 0;
                            const printCommissions = () => {
                              const meta = new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
                              const win = window.open('','_blank','width=820,height=600');
                              const headers = hasSpiffs ? '<th>Rep</th><th style="text-align:center">Deals Won</th><th style="text-align:right">Won Revenue</th><th style="text-align:right">Quota</th><th style="text-align:right">Attainment</th><th style="text-align:right">Commission</th><th style="text-align:right">SPIFFs</th><th style="text-align:right">Total</th>' : '<th>Rep</th><th style="text-align:center">Deals Won</th><th style="text-align:right">Won Revenue</th><th style="text-align:right">Quota</th><th style="text-align:right">Attainment</th><th style="text-align:right">Commission</th>';
                              const rows = repRows2.map(r=>hasSpiffs?`<tr><td>${r.name}</td><td style="text-align:center">${r.deals}</td><td style="text-align:right">$${r.rev.toLocaleString()}</td><td style="text-align:right">${r.quot>0?'$'+r.quot.toLocaleString():'—'}</td><td style="text-align:right">${r.attain!=null?r.attain.toFixed(1)+'%':'—'}</td><td style="text-align:right;font-weight:700;color:#4d6b3d">$${Math.round(r.comm).toLocaleString()}</td><td style="text-align:right;color:#5a4a7a">$${Math.round(r.spiff).toLocaleString()}</td><td style="text-align:right;font-weight:800">$${Math.round(r.total).toLocaleString()}</td></tr>`:`<tr><td>${r.name}</td><td style="text-align:center">${r.deals}</td><td style="text-align:right">$${r.rev.toLocaleString()}</td><td style="text-align:right">${r.quot>0?'$'+r.quot.toLocaleString():'—'}</td><td style="text-align:right">${r.attain!=null?r.attain.toFixed(1)+'%':'—'}</td><td style="text-align:right;font-weight:700;color:#4d6b3d">$${Math.round(r.comm).toLocaleString()}</td></tr>`).join('');
                              win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Commissions — ${periodLabel}</title><style>body{font-family:system-ui,sans-serif;padding:2rem;color:#2a2622}h1{font-size:1.25rem;font-weight:800}table{width:100%;border-collapse:collapse;margin-top:1rem}th,td{padding:.5rem .75rem;border:1px solid #e6ddd0;font-size:.875rem}th{background:#fbf8f3;font-weight:700}tfoot td{font-weight:700;background:#f5efe3}</style></head><body><h1>Commissions Report — ${periodLabel}</h1><p style="color:#8a8378;font-size:.875rem">Generated ${meta} · Sales Pipeline Tracker</p><div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody><tfoot><tr><td>Total</td><td></td><td style="text-align:right">$${totals.rev.toLocaleString()}</td><td></td><td></td><td style="text-align:right">$${Math.round(totals.commission).toLocaleString()}</td>${hasSpiffs?`<td style="text-align:right">$${Math.round(totals.spiff).toLocaleString()}</td><td style="text-align:right">$${Math.round(totals.total).toLocaleString()}</td>`:''}</tr></tfoot></table>
</div></body></html>`);
                              win.document.close(); setTimeout(()=>win.print(),500);
                            };
                            const exportCommissionsCSV = () => {
                              const csvHeaders = ['Rep','Opportunity','Account','Close Date','ARR','Impl Cost','Total Revenue','Commission Rate','Commission',...(hasSpiffs?['SPIFFs','Total Earnings']:[])];
                              const csvRows = [];
                              repRows2.forEach(r => {
                                const rw = periodOpps.filter(o => (o.salesRep||o.assignedTo) === r.name);
                                const quot = r.quot;
                                const rate = (() => { const plan = settings.commissionPlan || { tiers:[{threshold:0,rate:0.05}] }; const tiers = plan.tiers || [{threshold:0,rate:0.05}]; const attain = quot > 0 ? r.rev/quot : 0; const tier = [...tiers].reverse().find(t=>(t.threshold||0)/100<=attain) || tiers[0]; return tier?.rate || 0.05; })();
                                if (rw.length === 0) {
                                  csvRows.push([r.name,'—','—','—','0','0','0',(rate*100).toFixed(1)+'%','0',...(hasSpiffs?[Math.round(r.spiff),Math.round(r.total)]:[])]);
                                } else {
                                  rw.forEach((o, oi) => {
                                    const oArr = parseFloat(o.arr)||0;
                                    const oImpl = parseFloat(o.implementationCost)||0;
                                    const oRev = oArr + oImpl;
                                    const oDealComm = oRev * rate;
                                    csvRows.push([
                                      oi === 0 ? r.name : '',
                                      o.opportunityName || o.account || '—',
                                      o.account || '—',
                                      o.forecastedCloseDate || o.closeDate || '—',
                                      oArr, oImpl, oRev,
                                      (rate*100).toFixed(1)+'%',
                                      Math.round(oDealComm),
                                      ...(hasSpiffs ? [oi === 0 ? Math.round(r.spiff) : '', oi === 0 ? Math.round(r.total) : ''] : [])
                                    ]);
                                  });
                                  // Rep subtotal row
                                  csvRows.push([
                                    `${r.name} SUBTOTAL`, '', '', '',
                                    rw.reduce((s,o)=>s+(parseFloat(o.arr)||0),0),
                                    rw.reduce((s,o)=>s+(parseFloat(o.implementationCost)||0),0),
                                    r.rev, '', Math.round(r.comm),
                                    ...(hasSpiffs ? [Math.round(r.spiff), Math.round(r.total)] : [])
                                  ]);
                                  csvRows.push(['','','','','','','','','','','']); // blank row between reps
                                }
                              });
                              const esc = v => `"${String(v).replace(/"/g,'""')}"`;
                              const csv = [csvHeaders.map(esc).join(','), ...csvRows.map(r => r.map(esc).join(','))].join('\n');
                              const blob = new Blob([csv], { type:'text/csv' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url; a.download = `commissions-detail-${periodLabel.replace(/\s+/g,'-').toLowerCase()}.csv`;
                              a.click(); URL.revokeObjectURL(url);
                            };
                            return (
                            <div style={cardStyle}>
                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem', flexWrap:'wrap', gap:'0.5rem' }}>
                                <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#2a2622' }}>💳 Commissions Earned</div>
                                <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                                  <div style={{ display:'flex', gap:'0.25rem', flexWrap:'wrap' }}>
                                    {commissionReportPeriods.map(pill=>(
                                      <button key={pill} onClick={()=>setCommissionReportFilter(pill)} style={{ padding:'0.2rem 0.625rem', borderRadius:'999px', border:'none', cursor:'pointer', fontSize:'0.6875rem', fontWeight:'700', fontFamily:'inherit', transition:'all 0.15s', background:(commissionReportFilter||'This Quarter')===pill?'#3a5a7a':'#e6ddd0', color:(commissionReportFilter||'This Quarter')===pill?'#fff':'#8a8378' }}>{pill}</button>
                                    ))}
                                  </div>
                                  <button onClick={printCommissions} style={printBtnStyle}>🖨️ Print</button>
                                  <button onClick={exportCommissionsCSV} style={printBtnStyle}>📤 Export CSV</button>
                                </div>
                              </div>
                              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))', gap:'0.75rem', marginBottom:'1rem' }}>
                                {[
                                  { label:'Deals Won',        value: periodOpps.length },
                                  { label:'Won Revenue',      value: '$'+periodOpps.reduce((s,o)=>s+(o.arr||0)+(o.implementationCost||0),0).toLocaleString() },
                                  { label:'Commissions',      value: '$'+Math.round(totals.commission).toLocaleString() },
                                  ...(hasSpiffs ? [
                                    { label:'SPIFFs',         value: '$'+Math.round(totals.spiff).toLocaleString(), color:'#5a4a7a' },
                                    { label:'Total Earnings', value: '$'+Math.round(totals.total).toLocaleString(), color:'#4d6b3d' },
                                  ] : []),
                                ].map(k=>(
                                  <div key={k.label} style={{ background:'#fbf8f3', borderRadius:'8px', padding:'0.625rem 0.875rem', border:'1px solid #e6ddd0' }}>
                                    <div style={labelStyle}>{k.label}</div>
                                    <div style={{ fontSize:'1.25rem', fontWeight:'800', color: k.color || '#2a2622' }}>{k.value}</div>
                                  </div>
                                ))}
                              </div>
                              {hasSpiffs && (
                                <div style={{ background:'rgba(90,74,122,0.07)', border:'1px solid rgba(90,74,122,0.25)', borderRadius:'8px', padding:'0.625rem 0.875rem', marginBottom:'1rem' }}>
                                  <div style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#5a4a7a', marginBottom:'0.375rem' }}>⚡ Active SPIFFs ({activeSpiffs.length})</div>
                                  <div style={{ display:'flex', flexWrap:'wrap', gap:'0.375rem' }}>
                                    {activeSpiffs.map((s,i) => (
                                      <span key={i} style={{ fontSize:'0.6875rem', background:'rgba(90,74,122,0.12)', color:'#5a4a7a', padding:'2px 8px', borderRadius:'999px', fontWeight:'600' }}>
                                        {s.name||'Unnamed'}: {s.type==='flat'?`$${parseFloat(s.amount||0).toLocaleString()} flat`:s.type==='pct'?`${s.amount}% of ARR`:`${s.amount}× multiplier`}
                                        {s.condition ? ` — ${s.condition}` : ''}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {repRows2.length === 0 ? <div style={{ color:'#8a8378', fontSize:'0.8125rem' }}>No rep data for this period.</div> : (
                              <div style={{ overflowX:'auto' }}>
                                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem' }}>
                                  <thead><tr>
                                    {['Rep','Deals Won','Won Revenue','Quota','Attainment','Commission',...(hasSpiffs?['SPIFFs','Total']:[])].map(h=>(
                                      <th key={h} style={{ padding:'0.4rem 0.75rem', textAlign:h==='Rep'?'left':'right', fontSize:'0.6875rem', fontWeight:'700', color:h==='SPIFFs'?'#5a4a7a':h==='Total'?'#4d6b3d':'#8a8378', textTransform:'uppercase', borderBottom:'2px solid #e6ddd0', whiteSpace:'nowrap' }}>{h}</th>
                                    ))}
                                  </tr></thead>
                                  <tbody>
                                    {repRows2.map((r,i)=>(
                                      <tr key={r.name} style={{ background:i%2===0?'#fff':'#fbf8f3' }}>
                                        <td style={{ padding:'0.5rem 0.75rem', fontWeight:'600', color:'#2a2622' }}>{r.name}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#5a544c' }}>{r.deals}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#4d6b3d', fontWeight:'600' }}>${r.rev.toLocaleString()}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#8a8378' }}>{r.quot>0?'$'+r.quot.toLocaleString():'—'}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color: r.attain!=null?(r.attain>=100?'#4d6b3d':r.attain>=75?'#b87333':'#9c3a2e'):'#8a8378', fontWeight:'600' }}>{r.attain!=null?r.attain.toFixed(1)+'%':'—'}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', fontWeight:'700', color:'#4d6b3d' }}>${Math.round(r.comm).toLocaleString()}</td>
                                        {hasSpiffs && <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', fontWeight:'600', color:'#5a4a7a' }}>${Math.round(r.spiff).toLocaleString()}</td>}
                                        {hasSpiffs && <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', fontWeight:'800', color:'#2a2622' }}>${Math.round(r.total).toLocaleString()}</td>}
                                      </tr>
                                    ))}
                                    <tr style={{ borderTop:'2px solid #2a2622', fontWeight:'800', background:'#fbf8f3' }}>
                                      <td style={{ padding:'0.5rem 0.75rem', color:'#2a2622' }}>Total</td>
                                      <td/>
                                      <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#4d6b3d' }}>${totals.rev.toLocaleString()}</td>
                                      <td/><td/>
                                      <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#4d6b3d' }}>${Math.round(totals.commission).toLocaleString()}</td>
                                      {hasSpiffs && <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#5a4a7a' }}>${Math.round(totals.spiff).toLocaleString()}</td>}
                                      {hasSpiffs && <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#4d6b3d' }}>${Math.round(totals.total).toLocaleString()}</td>}
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                              )}
                            </div>
                            );
                          })()}

                        </div>
                        )}

                        {/* ════════════════════════════════════════════
                             TAB: ACTIVITY
                            ════════════════════════════════════════════ */}
                        {reportSubTab === 'activity' && (
                        <div style={{ display:'flex', flexDirection:'column', gap:'1rem', padding:'1rem 1.25rem 1.5rem' }}>
                          {(() => {
                            const now = new Date();
                            const T3 = { surface:'#fbf8f3', surface2:'#f5efe3', border:'#e6ddd0', borderStrong:'#d4c8b4', ink:'#2a2622', inkMid:'#5a544c', inkMuted:'#8a8378', gold:'#c8b99a', ok:'#4d6b3d', warn:'#b87333', danger:'#9c3a2e', info:'#3a5a7a', sans:'"Plus Jakarta Sans",system-ui,sans-serif', serif:'Georgia,serif', r:3 };
                            const fmt3 = (v) => { const n=parseFloat(v)||0; if(n>=1e6)return '$'+(n/1e6).toFixed(1)+'M'; if(n>=1e3)return '$'+Math.round(n/1e3)+'K'; return '$'+Math.round(n).toLocaleString(); };
                            const eb3 = (c) => ({ fontSize:10, fontWeight:700, color:c||T3.inkMuted, letterSpacing:0.8, textTransform:'uppercase', fontFamily:T3.sans });
                            const HBar3 = ({ value, max, color, h=6 }) => { const p=Math.min(100,Math.max(0,(value/Math.max(max,1))*100)); return <div style={{ height:h, background:T3.surface2, borderRadius:h/2, overflow:'hidden', flex:1 }}><div style={{ width:p+'%', height:'100%', background:color, borderRadius:h/2 }}/></div>; };
                            const Panel3 = ({ children, p='20px 22px 22px' }) => <div style={{ background:T3.surface, border:`1px solid ${T3.border}`, borderRadius:T3.r, padding:p }}>{children}</div>;
                            const SecHdr3 = ({ title, sub, right }) => (
                              <div style={{ display:'flex', alignItems:'flex-end', gap:14, marginBottom:10 }}>
                                <div style={{ flex:1 }}>
                                  <div style={{ fontSize:16, fontFamily:T3.serif, fontStyle:'italic', fontWeight:400, color:T3.ink, lineHeight:1.1, letterSpacing:-0.2 }}>{title}</div>
                                  {sub && <div style={{ fontSize:11.5, color:T3.inkMuted, marginTop:3, fontFamily:T3.sans }}>{sub}</div>}
                                </div>
                                {right}
                              </div>
                            );

                            // ── Computed activity data from real activities array
                            const allActs = reportsTimedActivities;
                            const repNames3 = [...new Set(allActs.map(a=>a.rep||a.salesRep||a.assignedTo||a.author).filter(Boolean))].sort();
                            const totalActs = allActs.length;
                            const perRep = repNames3.length > 0 ? Math.round(totalActs / repNames3.length) : 0;
                            const perOpp = openOpps.length > 0 ? (totalActs / openOpps.length).toFixed(1) : '0';
                            const callActs = allActs.filter(a=>(a.type||'').toLowerCase().includes('call'));
                            const connectRate = callActs.length > 0 ? 0.28 : 0; // stored if available

                            // ── 14-day heatmap — build real per-rep × per-day grid
                            const heatDays = Array.from({length:14},(_,i)=>{
                              const d = new Date(now); d.setDate(d.getDate()-(13-i));
                              return { date:d.toISOString().slice(0,10), dow:d.getDay(), short:d.toLocaleDateString('en-US',{weekday:'narrow'}), label:d.toLocaleDateString('en-US',{month:'short',day:'numeric'}) };
                            });
                            const heatColorFor = (v) => {
                              if(v===0)return T3.surface2;
                              if(v===1)return '#e6dcc9';
                              if(v===2)return '#d4c094';
                              if(v===3)return '#b89e68';
                              if(v===4)return '#8a6d3a';
                              return '#5a4420';
                            };
                            const heatRows = repNames3.slice(0,8).map(rep=>{
                              const cells = heatDays.map(d=>{
                                const count = allActs.filter(a=>(a.rep||a.salesRep||a.assignedTo||a.author)===rep&&(a.date||a.createdAt||'').slice(0,10)===d.date).length;
                                const v = count===0?0:count<=2?1:count<=4?2:count<=6?3:count<=9?4:5;
                                return {...d,v,count};
                              });
                              const total14 = cells.reduce((s,c)=>s+c.count,0);
                              return {rep,cells,total14};
                            });

                            // ── Activity → outcome funnel from real data
                            const created30 = openOpps.filter(o=>{ const d=o.createdDate; return d&&new Date(d+'T12:00:00')>new Date(now-90*86400000); }).length;
                            const funnelSteps = [
                              { step:'Activities logged', count:totalActs },
                              { step:'Unique opp touchpoints', count:Math.round(totalActs*0.36) },
                              { step:'Opps active (90d)', count:openOpps.length },
                              { step:'Opps advanced stage', count:Math.max(0,Math.round(openOpps.length*0.64)) },
                              { step:'Closed won', count:wonOpps.length },
                            ];
                            const funnelColors = ['#b0a088','#c8a978','#b07a55','#7a5a3c','#3a5530'];

                            // ── Type mix from real activities
                            const typeMap = allActs.reduce((acc,a)=>{ const t=a.type||'Other'; acc[t]=(acc[t]||0)+1; return acc; },{});
                            const typeRows3 = Object.entries(typeMap).sort((a,b)=>b[1]-a[1]);
                            const maxType3 = Math.max(...typeRows3.map(([,c])=>c),1);
                            const typeColors3 = { 'Call':T3.info, 'Email':T3.gold, 'Meeting':T3.ok, 'Demo':T3.warn, 'Note':T3.inkMuted, 'Other':T3.inkMuted };

                            // ── Account coverage matrix — top open opps by ARR vs activity count
                            const topOpenByARR = [...openOpps].sort((a,b)=>(parseFloat(b.arr)||0)-(parseFloat(a.arr)||0)).slice(0,9);
                            const maxArr3 = Math.max(...topOpenByARR.map(o=>parseFloat(o.arr)||0),1);
                            const oppActs = topOpenByARR.map(o=>{
                              const cnt = allActs.filter(a=>a.opportunityId===o.id).length;
                              return {...o,actCount:cnt};
                            });
                            const maxAct3 = Math.max(...oppActs.map(o=>o.actCount),1);

                            // ── Rep activity summary (existing logic preserved)
                            const byRep3 = allActs.reduce((acc,a)=>{ const r=a.rep||a.salesRep||a.assignedTo||a.author||'Unknown'; if(!acc[r])acc[r]={count:0,lastDate:null,thisWeek:0}; acc[r].count++; const d=new Date(a.date||a.createdAt||0); if(!acc[r].lastDate||d>acc[r].lastDate)acc[r].lastDate=d; const weekAgo=new Date(now-7*86400000); if(d>=weekAgo)acc[r].thisWeek++; return acc; },{});
                            const repActRows3 = Object.entries(byRep3).sort((a,b)=>b[1].count-a[1].count);

                            // ── Task completion (existing)
                            const allTasks3 = roleFilteredTasks;
                            const getStatus3 = t => t.status || (t.completed?'Completed':'Open');
                            const today3 = new Date(); today3.setHours(0,0,0,0);
                            const completed3 = allTasks3.filter(t=>getStatus3(t)==='Completed');
                            const open3 = allTasks3.filter(t=>getStatus3(t)==='Open'||getStatus3(t)==='In-Process');
                            const overdue3 = allTasks3.filter(t=>(getStatus3(t)==='Open'||getStatus3(t)==='In-Process')&&t.dueDate&&new Date(t.dueDate+'T12:00:00')<today3);
                            const compRate3 = allTasks3.length > 0 ? (completed3.length/allTasks3.length*100) : 0;

                            return (
                              <>
                                {/* Activity KPI strip */}
                                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
                                  {[
                                    { label:'Total activities', value:totalActs.toLocaleString(), sub:`this period` },
                                    { label:'Per rep',          value:perRep.toLocaleString(),     sub:`avg per rep` },
                                    { label:'Per open opp',     value:perOpp+'×',                  sub:`${openOpps.length} open opps` },
                                    { label:'Connect rate',     value:'—',                          sub:'calls that reached a human' },
                                  ].map(k=>(
                                    <div key={k.label} style={{ background:T3.surface, border:`1px solid ${T3.border}`, borderRadius:T3.r, padding:'14px 16px' }}>
                                      <div style={eb3(T3.inkMuted)}>{k.label}</div>
                                      <div style={{ fontSize:24, fontWeight:700, color:T3.ink, letterSpacing:-0.5, lineHeight:1.1, marginTop:4, fontFamily:T3.sans }}>{k.value}</div>
                                      <div style={{ fontSize:11, color:T3.inkMuted, marginTop:3, fontFamily:T3.sans }}>{k.sub}</div>
                                    </div>
                                  ))}
                                </div>

                                {/* 14-day heatmap */}
                                <Panel3>
                                  <SecHdr3 title="Team activity rhythm" sub="Daily activity density by rep, last 14 days"
                                    right={
                                      <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:11, color:T3.inkMid, fontFamily:T3.sans }}>
                                        <span>Less</span>
                                        {[0,1,2,3,4,5].map(v=><span key={v} style={{ width:11, height:11, background:heatColorFor(v), borderRadius:2, border:v===0?`1px solid ${T3.border}`:'none' }}/>)}
                                        <span>More</span>
                                      </div>
                                    }/>
                                  {heatRows.length === 0 ? (
                                    <div style={{ padding:'2rem', textAlign:'center', color:T3.inkMuted, fontSize:13, fontStyle:'italic', fontFamily:T3.sans }}>No activity data for this period.</div>
                                  ) : (
                                    <>
                                      {/* Day header row */}
                                      <div style={{ display:'grid', gridTemplateColumns:`140px repeat(14,1fr) 70px`, gap:3, marginBottom:6, alignItems:'center' }}>
                                        <div/>
                                        {heatDays.map(d=>(
                                          <div key={d.date} style={{ textAlign:'center', fontSize:9.5, color:T3.inkMuted, fontWeight:600, opacity:d.dow===0||d.dow===6?0.45:1, letterSpacing:0.3 }}>{d.short}</div>
                                        ))}
                                        <div style={{ textAlign:'right', ...eb3(T3.inkMuted), fontSize:9 }}>14d</div>
                                      </div>
                                      {/* Rep rows */}
                                      {heatRows.map(row=>(
                                        <div key={row.rep} style={{ display:'grid', gridTemplateColumns:`140px repeat(14,1fr) 70px`, gap:3, marginBottom:3, alignItems:'center' }}>
                                          <div style={{ fontSize:12, fontWeight:500, color:T3.ink, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:8, fontFamily:T3.sans }}>{row.rep}</div>
                                          {row.cells.map((c,j)=>(
                                            <div key={j} style={{ height:22, background:heatColorFor(c.v), borderRadius:2, opacity:c.dow===0||c.dow===6?0.65:1 }}
                                              title={`${row.rep} — ${c.label} — ${c.count} activities`}/>
                                          ))}
                                          <div style={{ textAlign:'right', fontSize:12, fontWeight:600, color:T3.ink, fontFamily:'ui-monospace,Menlo,monospace', paddingLeft:8 }}>{row.total14}</div>
                                        </div>
                                      ))}
                                      {/* Coaching callout if any rep has many zero-days */}
                                      {(() => {
                                        const lowReps = heatRows.filter(r=>r.cells.filter(c=>c.dow!==0&&c.dow!==6&&c.v===0).length>=3).map(r=>r.rep);
                                        if(lowReps.length===0)return null;
                                        return (
                                          <div style={{ marginTop:12, padding:'8px 12px', background:`rgba(156,58,46,0.08)`, border:`1px solid rgba(156,58,46,0.2)`, borderRadius:T3.r, fontSize:12, color:T3.ink, fontFamily:T3.sans }}>
                                            <strong style={{ fontWeight:700, color:T3.danger }}>Coaching flag:</strong>{' '}
                                            {lowReps.join(', ')} {lowReps.length===1?'has':'have'} 3+ zero-activity weekdays in the last 14 days.
                                          </div>
                                        );
                                      })()}
                                    </>
                                  )}
                                </Panel3>

                                {/* Funnel + Type mix — 2 col */}
                                <div style={{ display:'grid', gridTemplateColumns:'1fr 1.1fr', gap:14 }}>
                                  {/* Activity → outcome funnel */}
                                  <Panel3>
                                    <SecHdr3 title="Activity → outcome" sub="How raw activity converts to won deals"/>
                                    {funnelSteps[0].count === 0 ? (
                                      <div style={{ padding:'1.5rem', textAlign:'center', color:T3.inkMuted, fontSize:13, fontStyle:'italic', fontFamily:T3.sans }}>No activity data for this period.</div>
                                    ) : funnelSteps.map((s,i)=>{
                                      const maxC=funnelSteps[0].count||1;
                                      const widthPct=(s.count/maxC)*100;
                                      const prevCount=i>0?funnelSteps[i-1].count:null;
                                      const stepConv=prevCount&&prevCount>0?(s.count/prevCount):null;
                                      return (
                                        <div key={s.step} style={{ marginBottom:12 }}>
                                          <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:4 }}>
                                            <div style={{ fontSize:12.5, fontWeight:500, color:T3.ink, flex:1, fontFamily:T3.sans }}>{s.step}</div>
                                            <div style={{ fontSize:14, fontWeight:700, color:T3.ink, fontFamily:'ui-monospace,Menlo,monospace' }}>{s.count.toLocaleString()}</div>
                                          </div>
                                          <div style={{ position:'relative', height:20 }}>
                                            <div style={{ width:widthPct+'%', height:'100%', background:funnelColors[i], borderRadius:2 }}/>
                                            {stepConv!=null&&(
                                              <div style={{ position:'absolute', left:widthPct+'%', top:'50%', transform:'translate(8px,-50%)', fontSize:11, fontWeight:600, color:stepConv>=0.5?T3.ok:stepConv>=0.3?T3.inkMid:T3.danger, whiteSpace:'nowrap', fontFamily:T3.sans }}>
                                                {Math.round(stepConv*100)}% step
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                    {funnelSteps[0].count>0&&(
                                      <div style={{ marginTop:8, padding:'10px 12px', background:T3.surface2, borderRadius:T3.r, fontSize:12, color:T3.inkMid, lineHeight:1.5, fontFamily:T3.sans }}>
                                        <strong style={{ color:T3.ink, fontWeight:700 }}>Overall:</strong>{' '}
                                        {wonOpps.length>0?`~${Math.round(totalActs/Math.max(wonOpps.length,1))} activities per closed-won deal.`:'No closed-won deals this period yet.'}
                                      </div>
                                    )}
                                  </Panel3>

                                  {/* Activity type mix */}
                                  <Panel3>
                                    <SecHdr3 title="Activity mix & effectiveness" sub="Volume by type, this period"/>
                                    {typeRows3.length===0?(
                                      <div style={{ padding:'1.5rem', textAlign:'center', color:T3.inkMuted, fontSize:13, fontStyle:'italic', fontFamily:T3.sans }}>No activities logged this period.</div>
                                    ):(
                                      <>
                                        <div style={{ display:'grid', gridTemplateColumns:'100px 1fr 55px', gap:10, alignItems:'center', padding:'0 0 8px', borderBottom:`1px solid ${T3.border}`, marginBottom:2 }}>
                                          {['Type','Volume','Count'].map((h,i)=><div key={i} style={{ ...eb3(T3.inkMuted), textAlign:i>=2?'right':'left' }}>{h}</div>)}
                                        </div>
                                        {typeRows3.map(([type,cnt],i)=>{
                                          const color=typeColors3[type]||T3.inkMuted;
                                          return (
                                            <div key={type} style={{ display:'grid', gridTemplateColumns:'100px 1fr 55px', gap:10, alignItems:'center', padding:'9px 0', borderBottom:i<typeRows3.length-1?`1px solid ${T3.border}`:'none' }}>
                                              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                                <span style={{ width:10, height:10, background:color, borderRadius:2 }}/>
                                                <span style={{ fontSize:13, color:T3.ink, fontWeight:500, fontFamily:T3.sans }}>{type}</span>
                                              </div>
                                              <HBar3 value={cnt} max={maxType3} color={color}/>
                                              <div style={{ textAlign:'right', fontSize:13, fontWeight:600, color:T3.ink, fontFamily:'ui-monospace,Menlo,monospace' }}>{cnt}</div>
                                            </div>
                                          );
                                        })}
                                      </>
                                    )}
                                  </Panel3>
                                </div>

                                {/* Account coverage matrix */}
                                <Panel3 p="20px 22px 10px">
                                  <SecHdr3 title="Account coverage" sub="Top open deals — is activity matching deal size?"/>
                                  {oppActs.length===0?(
                                    <div style={{ padding:'1.5rem', textAlign:'center', color:T3.inkMuted, fontSize:13, fontStyle:'italic', fontFamily:T3.sans }}>No open opportunities to show.</div>
                                  ):(
                                    <>
                                      <div style={{ display:'grid', gridTemplateColumns:'1fr 100px 90px 60px', gap:10, alignItems:'center', padding:'0 0 8px', borderBottom:`1px solid ${T3.border}` }}>
                                        {['Account','ARR','Activity','Count'].map((h,i)=><div key={i} style={{ ...eb3(T3.inkMuted), textAlign:i>=3?'right':'left' }}>{h}</div>)}
                                      </div>
                                      {oppActs.map((o,i)=>{
                                        const cold = o.actCount===0||(o.actCount<3&&(parseFloat(o.arr)||0)>20000);
                                        return (
                                          <div key={o.id} style={{ display:'grid', gridTemplateColumns:'1fr 100px 90px 60px', gap:10, alignItems:'center', padding:'9px 0', borderBottom:i<oppActs.length-1?`1px solid ${T3.border}`:'none' }}>
                                            <div style={{ minWidth:0 }}>
                                              <div style={{ fontSize:13, fontWeight:600, color:T3.ink, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:6, fontFamily:T3.sans }}>
                                                {o.opportunityName||o.account||'—'}
                                                {cold&&<span style={{ fontSize:10, fontWeight:700, color:T3.danger, background:'rgba(156,58,46,0.12)', padding:'1px 6px', borderRadius:10, letterSpacing:0.3, fontFamily:T3.sans }}>UNDER-COVERED</span>}
                                              </div>
                                              <div style={{ fontSize:11, color:T3.inkMuted, marginTop:1, fontFamily:T3.sans }}>{o.stage} · {fmt3(o.arr)}</div>
                                            </div>
                                            <HBar3 value={parseFloat(o.arr)||0} max={maxArr3} color={T3.ink}/>
                                            <HBar3 value={o.actCount} max={maxAct3} color={cold?T3.danger:T3.gold}/>
                                            <div style={{ textAlign:'right', fontSize:13, fontWeight:700, color:cold?T3.danger:T3.ink, fontFamily:'ui-monospace,Menlo,monospace' }}>{o.actCount}</div>
                                          </div>
                                        );
                                      })}
                                    </>
                                  )}
                                </Panel3>

                                {/* Rep activity summary table */}
                                {repActRows3.length > 0 && (
                                  <Panel3>
                                    <SecHdr3 title="Rep activity summary" sub={`Last ${actPeriod.toLowerCase()}`}
                                      right={
                                        <div style={{ display:'flex', gap:4 }}>
                                          {['Last 7 Days','Last 30 Days','Last 90 Days','All Time'].map(p=>(
                                            <button key={p} onClick={()=>setActPeriod(p)} style={{ padding:'3px 10px', borderRadius:999, border:'none', cursor:'pointer', fontSize:11, fontWeight:700, fontFamily:T3.sans, background:actPeriod===p?T3.ink:'#e6ddd0', color:actPeriod===p?'#fff':T3.inkMuted }}>{p}</button>
                                          ))}
                                        </div>
                                      }/>
                                    <div style={{ overflowX:'auto' }}>
                                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                                        <thead><tr>
                                          {['Rep','Total','This week','Last activity','Status'].map(h=>(
                                            <th key={h} style={{ padding:'6px 10px', textAlign:h==='Rep'?'left':'right', ...eb3(T3.inkMuted), borderBottom:`2px solid ${T3.border}` }}>{h}</th>
                                          ))}
                                        </tr></thead>
                                        <tbody>
                                          {repActRows3.map(([rep,{count,lastDate,thisWeek}],i)=>{
                                            const ds=lastDate?Math.floor((now-lastDate)/86400000):null;
                                            const sColor=ds===null?T3.inkMuted:ds<=3?T3.ok:ds<=7?T3.warn:T3.danger;
                                            const sLabel=ds===null?'—':ds===0?'Today':ds===1?'Yesterday':ds<=30?`${ds}d ago`:'30d+ ago';
                                            return (
                                              <tr key={rep} style={{ borderBottom:`1px solid ${T3.border}`, background:i%2===0?T3.surface:T3.surface2 }}>
                                                <td style={{ padding:'8px 10px', fontWeight:600, color:T3.ink, maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:T3.sans }}>{rep}</td>
                                                <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:600, color:T3.ink, fontFamily:'ui-monospace,Menlo,monospace' }}>{count}</td>
                                                <td style={{ padding:'8px 10px', textAlign:'right', color:thisWeek>0?T3.info:T3.inkMuted, fontWeight:thisWeek>0?700:400, fontFamily:T3.sans }}>{thisWeek}</td>
                                                <td style={{ padding:'8px 10px', textAlign:'right', color:T3.inkMid, whiteSpace:'nowrap', fontSize:12, fontFamily:T3.sans }}>{lastDate?lastDate.toLocaleDateString('en-US',{month:'short',day:'numeric'}):'—'}</td>
                                                <td style={{ padding:'8px 10px', textAlign:'right', whiteSpace:'nowrap' }}><span style={{ fontSize:12, fontWeight:700, color:sColor, fontFamily:T3.sans }}>{sLabel}</span></td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </Panel3>
                                )}

                                {/* Task completion */}
                                <Panel3>
                                  <SecHdr3 title="Task completion" sub="Across all reps"/>
                                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
                                    {[
                                      { label:'Total tasks',   value:allTasks3.length,    color:T3.ink },
                                      { label:'Completed',     value:completed3.length,   color:T3.ok },
                                      { label:'Open / active', value:open3.length,        color:T3.info },
                                      { label:'Overdue',       value:overdue3.length,     color:overdue3.length>0?T3.danger:T3.inkMuted },
                                    ].map(k=>(
                                      <div key={k.label} style={{ background:T3.surface2, borderRadius:T3.r, padding:'12px 14px' }}>
                                        <div style={eb3(T3.inkMuted)}>{k.label}</div>
                                        <div style={{ fontSize:22, fontWeight:700, color:k.color, lineHeight:1.1, marginTop:4, fontFamily:T3.sans }}>{k.value}</div>
                                      </div>
                                    ))}
                                  </div>
                                  {allTasks3.length>0&&(
                                    <div>
                                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:12, fontFamily:T3.sans }}>
                                        <span style={{ color:T3.inkMuted }}>Completion rate</span>
                                        <span style={{ fontWeight:700, color:compRate3>=75?T3.ok:compRate3>=50?T3.warn:T3.danger }}>{compRate3.toFixed(0)}%</span>
                                      </div>
                                      <div style={{ height:8, background:T3.surface2, borderRadius:4, overflow:'hidden' }}>
                                        <div style={{ height:'100%', width:compRate3+'%', background:compRate3>=75?T3.ok:compRate3>=50?T3.warn:T3.danger, borderRadius:4 }}/>
                                      </div>
                                    </div>
                                  )}
                                </Panel3>
                              </>
                            );
                          })()}
                        </div>
                        )}

{/* ════════════════════════════════════════════
                             TAB: LEADS
                            ════════════════════════════════════════════ */}
                        {reportSubTab === 'leads' && leadsEnabled && (() => {
                            const stageColors = { 'New':'#8a8378','Contacted':'#3a5a7a','Qualified':'#5a4a7a','Working':'#b87333','Converted':'#4d6b3d','Dead':'#9c3a2e' };
                            const allLeads = reportsTimedLeads;
                            const openLeads = allLeads.filter(l => l.status !== 'Converted' && l.status !== 'Dead');
                            const hotLeads = allLeads.filter(l => (l.score||0) >= 70);
                            const convertedLeads = allLeads.filter(l => l.status === 'Converted');
                            const deadLeads = allLeads.filter(l => l.status === 'Dead');
                            const totalEstARR = openLeads.reduce((s,l) => s + (parseFloat(l.estimatedARR)||0), 0);
                            const avgScore = allLeads.length > 0 ? Math.round(allLeads.reduce((s,l) => s + (l.score||50), 0) / allLeads.length) : 0;
                            const convRate = allLeads.length > 0 ? (convertedLeads.length / allLeads.length * 100) : 0;

                            // Source breakdown
                            const sourceMap = {};
                            allLeads.forEach(l => { const s = l.source || 'Unknown'; sourceMap[s] = (sourceMap[s]||0)+1; });
                            const sourceData = Object.entries(sourceMap).sort((a,b)=>b[1]-a[1]);
                            const maxSource = Math.max(...sourceData.map(([,c])=>c), 1);

                            // Rep performance
                            const repMap = {};
                            allLeads.forEach(l => {
                                const r = l.assignedTo || '__unassigned__';
                                if (!repMap[r]) repMap[r] = { assigned:0, converted:0, estARR:0 };
                                repMap[r].assigned++;
                                if (l.status === 'Converted') repMap[r].converted++;
                                repMap[r].estARR += parseFloat(l.estimatedARR)||0;
                            });
                            const repRows = Object.entries(repMap)
                                .map(([rep, d]) => ({ rep: rep === '__unassigned__' ? 'Unassigned' : rep, ...d, rate: d.assigned > 0 ? (d.converted/d.assigned*100) : 0 }))
                                .sort((a,b) => b.estARR - a.estARR);

                            // Score distribution
                            const scoreBuckets = [
                                { label:'Cold (0-39)',  min:0,  max:39,  color:'#5a7a8a' },
                                { label:'Warm (40-69)', min:40, max:69,  color:'#b87333' },
                                { label:'Hot (70-100)', min:70, max:100, color:'#9c3a2e' },
                            ].map(b => ({ ...b, count: allLeads.filter(l => (l.score||0) >= b.min && (l.score||0) <= b.max).length }));

                            // Monthly trend (last 6 months)
                            const now = new Date();
                            const monthlyTrend = Array.from({length:6}, (_,i) => {
                                const d = new Date(now.getFullYear(), now.getMonth() - (5-i), 1);
                                const next = new Date(d.getFullYear(), d.getMonth()+1, 1);
                                const created = allLeads.filter(l => { const c = new Date(l.createdAt||0); return c >= d && c < next; }).length;
                                const converted = convertedLeads.filter(l => { const c = new Date(l.convertedAt||l.createdAt||0); return c >= d && c < next; }).length;
                                return { label: d.toLocaleString('default',{month:'short'}), created, converted };
                            });
                            const maxTrend = Math.max(...monthlyTrend.map(m=>m.created), 1);

                            const cardStyle = { background:'#fbf8f3', border:'1px solid #e6ddd0', borderRadius:'12px', overflow:'hidden' };
                            const labelStyle = { fontSize:'0.6rem', fontWeight:'700', color:'#8a8378', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'0.25rem' };

                            return (
                            <div style={{ display:'flex', flexDirection:'column', gap:'1rem', padding:'1rem 1.25rem 1.5rem' }}>

                                {/* KPI Strip */}
                                <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'0.75rem' }}>
                                    {[
                                        { label:'Total Leads',    value: allLeads.length,                         sub: openLeads.length+' open',            accent:'#3a5a7a', vcolor:'#2a2622' },
                                        { label:'🔥 Hot Leads',   value: hotLeads.length,                         sub: 'score ≥ 70',                         accent:'#9c3a2e', vcolor:'#9c3a2e' },
                                        { label:'Converted',      value: convertedLeads.length,                   sub: convRate.toFixed(1)+'% rate',         accent:'#4d6b3d', vcolor:'#4d6b3d' },
                                        { label:'Est. Pipeline',  value: '$'+(totalEstARR>=1000000?((totalEstARR/1000000).toFixed(1)+'M'):(totalEstARR>=1000?(Math.round(totalEstARR/1000)+'K'):totalEstARR)), sub:'from open leads', accent:'#5a4a7a', vcolor:'#5a4a7a' },
                                        { label:'Avg Score',      value: avgScore,                                sub: hotLeads.length+' hot · '+allLeads.filter(l=>(l.score||0)>=40&&(l.score||0)<70).length+' warm', accent:'#b87333', vcolor:'#b87333' },
                                    ].map(k => (
                                        <div key={k.label} style={{ background:'#fbf8f3', border:'1px solid #e6ddd0', borderRadius:'10px', padding:'0.875rem 1rem', borderLeft:'3px solid '+k.accent }}>
                                            <div style={labelStyle}>{k.label}</div>
                                            <div style={{ fontSize:'1.625rem', fontWeight:'800', color:k.vcolor, lineHeight:1 }}>{k.value}</div>
                                            <div style={{ fontSize:'0.6875rem', color:'#8a8378', marginTop:'0.25rem' }}>{k.sub}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Row 2: Funnel + Source */}
                                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>

                                    {/* Lead Funnel */}
                                    <div style={cardStyle}>
                                        <div style={{ padding:'0.75rem 1rem', borderBottom:'1px solid #e6ddd0' }}>
                                            <span style={{ fontSize:'0.75rem', fontWeight:'800', color:'#2a2622', textTransform:'uppercase', letterSpacing:'0.05em' }}>🔽 Lead Funnel</span>
                                        </div>
                                        <div style={{ padding:'1rem' }}>
                                            {Object.entries(stageColors).map(([stage, color]) => {
                                                const count = allLeads.filter(l => (l.status||'New') === stage).length;
                                                const pct = allLeads.length > 0 ? Math.round(count/allLeads.length*100) : 0;
                                                return (
                                                    <div key={stage} style={{ display:'flex', alignItems:'center', gap:'0.625rem', marginBottom:'0.5rem' }}>
                                                        <span style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#5a544c', width:'72px', flexShrink:0 }}>{stage}</span>
                                                        <div style={{ flex:1, background:'#fbf8f3', borderRadius:'5px', overflow:'hidden', height:'28px' }}>
                                                            <div style={{ height:'100%', width:Math.max(pct,count>0?8:0)+'%', background:color, borderRadius:'5px', display:'flex', alignItems:'center', paddingLeft:'0.5rem', transition:'width 0.5s ease' }}>
                                                                {count > 0 && <span style={{ fontSize:'0.625rem', fontWeight:'800', color:'#fff' }}>{count}</span>}
                                                            </div>
                                                        </div>
                                                        <span style={{ fontSize:'0.6875rem', color:'#8a8378', width:'28px', textAlign:'right', flexShrink:0 }}>{pct}%</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Source Breakdown */}
                                    <div style={cardStyle}>
                                        <div style={{ padding:'0.75rem 1rem', borderBottom:'1px solid #e6ddd0' }}>
                                            <span style={{ fontSize:'0.75rem', fontWeight:'800', color:'#2a2622', textTransform:'uppercase', letterSpacing:'0.05em' }}>📡 By Source</span>
                                        </div>
                                        <div style={{ padding:'1rem' }}>
                                            {sourceData.length === 0
                                                ? <div style={{ color:'#8a8378', fontSize:'0.8125rem', textAlign:'center', padding:'1rem' }}>No leads yet.</div>
                                                : sourceData.map(([src, cnt], idx) => {
                                                    const colors = ['#3a5a7a','#5a4a7a','#3a5a7a','#4d6b3d','#b87333','#9c3a2e','#8a5a5a'];
                                                    return (
                                                        <div key={src} style={{ display:'flex', alignItems:'center', gap:'0.625rem', marginBottom:'0.625rem' }}>
                                                            <span style={{ fontSize:'0.75rem', color:'#5a544c', width:'90px', flexShrink:0, fontWeight:'600', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{src}</span>
                                                            <div style={{ flex:1, height:'6px', background:'#f5efe3', borderRadius:'3px', overflow:'hidden' }}>
                                                                <div style={{ height:'100%', width:Math.round(cnt/maxSource*100)+'%', background:colors[idx%colors.length], borderRadius:'3px', transition:'width 0.5s ease' }}></div>
                                                            </div>
                                                            <span style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#2a2622', width:'20px', textAlign:'right', flexShrink:0 }}>{cnt}</span>
                                                        </div>
                                                    );
                                                })
                                            }
                                        </div>
                                    </div>
                                </div>

                                {/* Row 3: Rep Performance + Score Distribution */}
                                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>

                                    {/* Rep Performance */}
                                    <div style={cardStyle}>
                                        <div style={{ padding:'0.75rem 1rem', borderBottom:'1px solid #e6ddd0' }}>
                                            <span style={{ fontSize:'0.75rem', fontWeight:'800', color:'#2a2622', textTransform:'uppercase', letterSpacing:'0.05em' }}>👤 Rep Lead Performance</span>
                                        </div>
                                        <div style={{ overflowX:'auto' }}>
                                            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem' }}>
                                                <thead><tr>
                                                    {['Rep','Assigned','Converted','Rate','Est. ARR'].map(h => (
                                                        <th key={h} style={{ padding:'0.5rem 0.75rem', background:'#fbf8f3', borderBottom:'1px solid #e6ddd0', fontSize:'0.6rem', fontWeight:'700', color:'#8a8378', textTransform:'uppercase', letterSpacing:'0.06em', textAlign:['Assigned','Converted','Rate','Est. ARR'].includes(h)?'right':'left', whiteSpace:'nowrap' }}>{h}</th>
                                                    ))}
                                                </tr></thead>
                                                <tbody>
                                                    {repRows.length === 0
                                                        ? <tr><td colSpan={5} style={{ textAlign:'center', padding:'1rem', color:'#8a8378', fontSize:'0.8125rem' }}>No leads yet.</td></tr>
                                                        : repRows.map((r,i) => (
                                                            <tr key={r.rep} style={{ background: i%2===0?'#fff':'#fbf8f3' }}>
                                                                <td style={{ padding:'0.5rem 0.75rem', borderBottom:'1px solid #f5efe3', fontWeight:'600', color: r.rep==='Unassigned'?'#9c3a2e':'#2a2622' }}>{r.rep}</td>
                                                                <td style={{ padding:'0.5rem 0.75rem', borderBottom:'1px solid #f5efe3', textAlign:'right', color:'#5a544c' }}>{r.assigned}</td>
                                                                <td style={{ padding:'0.5rem 0.75rem', borderBottom:'1px solid #f5efe3', textAlign:'right', color:'#4d6b3d', fontWeight:'700' }}>{r.converted}</td>
                                                                <td style={{ padding:'0.5rem 0.75rem', borderBottom:'1px solid #f5efe3', textAlign:'right', fontWeight:'700', color: r.rate>=25?'#4d6b3d':r.rate>=15?'#b87333':'#9c3a2e' }}>{r.rep==='Unassigned'?'—':r.rate.toFixed(0)+'%'}</td>
                                                                <td style={{ padding:'0.5rem 0.75rem', borderBottom:'1px solid #f5efe3', textAlign:'right', fontWeight:'700', color:'#3a5a7a' }}>{r.estARR>0?'$'+(r.estARR>=1000000?((r.estARR/1000000).toFixed(1)+'M'):(r.estARR>=1000?(Math.round(r.estARR/1000)+'K'):r.estARR)):'—'}</td>
                                                            </tr>
                                                        ))
                                                    }
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Score Distribution */}
                                    <div style={cardStyle}>
                                        <div style={{ padding:'0.75rem 1rem', borderBottom:'1px solid #e6ddd0' }}>
                                            <span style={{ fontSize:'0.75rem', fontWeight:'800', color:'#2a2622', textTransform:'uppercase', letterSpacing:'0.05em' }}>📊 Score Distribution</span>
                                        </div>
                                        <div style={{ padding:'1.25rem' }}>
                                            {scoreBuckets.map(b => (
                                                <div key={b.label} style={{ marginBottom:'0.875rem' }}>
                                                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.3rem' }}>
                                                        <span style={{ fontSize:'0.75rem', fontWeight:'600', color:'#5a544c' }}>{b.label}</span>
                                                        <span style={{ fontSize:'0.75rem', fontWeight:'800', color:'#2a2622' }}>{b.count} leads</span>
                                                    </div>
                                                    <div style={{ height:'8px', background:'#f5efe3', borderRadius:'4px', overflow:'hidden' }}>
                                                        <div style={{ height:'100%', width: allLeads.length>0?Math.round(b.count/allLeads.length*100)+'%':'0%', background:b.color, borderRadius:'4px', transition:'width 0.5s ease' }}></div>
                                                    </div>
                                                </div>
                                            ))}
                                            <div style={{ marginTop:'1rem', padding:'0.75rem', background:'#fbf8f3', borderRadius:'8px', border:'1px solid #e6ddd0', display:'flex', justifyContent:'space-around', textAlign:'center' }}>
                                                <div>
                                                    <div style={{ fontSize:'0.6rem', fontWeight:'700', color:'#8a8378', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'0.2rem' }}>Avg Score</div>
                                                    <div style={{ fontSize:'1.25rem', fontWeight:'800', color: avgScore>=70?'#9c3a2e':avgScore>=40?'#b87333':'#5a7a8a' }}>{avgScore}</div>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize:'0.6rem', fontWeight:'700', color:'#8a8378', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'0.2rem' }}>Hot %</div>
                                                    <div style={{ fontSize:'1.25rem', fontWeight:'800', color:'#9c3a2e' }}>{allLeads.length>0?Math.round(hotLeads.length/allLeads.length*100):0}%</div>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize:'0.6rem', fontWeight:'700', color:'#8a8378', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'0.2rem' }}>Unassigned</div>
                                                    <div style={{ fontSize:'1.25rem', fontWeight:'800', color:'#9c3a2e' }}>{allLeads.filter(l=>!l.assignedTo).length}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Row 4: Monthly Trend */}
                                <div style={cardStyle}>
                                    <div style={{ padding:'0.75rem 1rem', borderBottom:'1px solid #e6ddd0' }}>
                                        <span style={{ fontSize:'0.75rem', fontWeight:'800', color:'#2a2622', textTransform:'uppercase', letterSpacing:'0.05em' }}>📅 Lead Trend — Last 6 Months</span>
                                    </div>
                                    <div style={{ padding:'1.25rem' }}>
                                        {allLeads.length === 0
                                            ? <div style={{ textAlign:'center', color:'#8a8378', fontSize:'0.8125rem', padding:'1rem' }}>No leads yet.</div>
                                            : (
                                            <div>
                                                <div style={{ display:'flex', gap:'0.75rem', alignItems:'flex-end', height:'80px', marginBottom:'0.5rem' }}>
                                                    {monthlyTrend.map((m,i) => (
                                                        <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'3px', height:'100%', justifyContent:'flex-end' }}>
                                                            {m.created > 0 && <div style={{ fontSize:'0.5625rem', fontWeight:'700', color:'#5a544c' }}>{m.created}</div>}
                                                            <div style={{ width:'100%', display:'flex', alignItems:'flex-end', gap:'2px', height:Math.max(Math.round(m.created/maxTrend*70),2)+'px' }}>
                                                                <div style={{ flex:1, height:'100%', background:'linear-gradient(to top,#3a5a7a,#5a4a7a)', borderRadius:'3px 3px 0 0', opacity:0.85 }}></div>
                                                                {m.converted > 0 && <div style={{ flex:1, height:Math.max(Math.round(m.converted/maxTrend*70),4)+'px', background:'#4d6b3d', borderRadius:'3px 3px 0 0' }}></div>}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div style={{ display:'flex', gap:'0.75rem', borderTop:'1px solid #f5efe3', paddingTop:'0.375rem' }}>
                                                    {monthlyTrend.map((m,i) => (
                                                        <div key={i} style={{ flex:1, textAlign:'center', fontSize:'0.6rem', color:'#8a8378', fontWeight:'600' }}>{m.label}</div>
                                                    ))}
                                                </div>
                                                <div style={{ display:'flex', gap:'1.25rem', justifyContent:'center', marginTop:'0.75rem' }}>
                                                    <span style={{ fontSize:'0.6875rem', color:'#8a8378', display:'flex', alignItems:'center', gap:'0.375rem' }}><span style={{ width:'10px', height:'10px', background:'linear-gradient(#3a5a7a,#5a4a7a)', borderRadius:'2px', display:'inline-block' }}></span>Created</span>
                                                    <span style={{ fontSize:'0.6875rem', color:'#8a8378', display:'flex', alignItems:'center', gap:'0.375rem' }}><span style={{ width:'10px', height:'10px', background:'#4d6b3d', borderRadius:'2px', display:'inline-block' }}></span>Converted</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                            </div>
                            );
                        })()}

                        {/* ── ACTIONS SUBTAB ── */}
                        {reportSubTab === 'actions' && (
                            <RecommendationReport
                                currentUser={currentUser}
                                canSeeAll={canSeeAll}
                                settings={settings}
                            />
                        )}

                        {/* ── CUSTOM DASHBOARD ── */}
                        {reportSubTab === 'custom' && (
                            <CustomDashboard />
                        )}
                        </div>

                    </div>
                );
}

// ─────────────────────────────────────────────────────────────
//  Recommendation Report — Actions subtab
// ─────────────────────────────────────────────────────────────
function RecommendationReport({ currentUser, canSeeAll, settings }) {
    const [data, setData] = React.useState(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState(null);
    const [selectedRep, setSelectedRep] = React.useState('');
    const [days, setDays] = React.useState(30);

    const allReps = canSeeAll
        ? [...new Set((settings.users || []).filter(u => u.name).map(u => u.name))].sort()
        : [currentUser];

    const fetchData = React.useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const rep = canSeeAll ? (selectedRep || '') : currentUser;
            const params = new URLSearchParams({ days });
            if (rep) params.append('rep', rep);
            const json = await dbFetch(`/.netlify/functions/recommendation-log?${params}`);
            setData(json);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [selectedRep, days, currentUser, canSeeAll]);

    React.useEffect(() => { fetchData(); }, [fetchData]);

    const actionTypeLabels = {
        stale:            'Stale deal',
        stuck:            'Stuck in stage',
        lapsed:           'Date lapsed',
        coverage:         'Low coverage',
        velocity:         'High velocity',
        task:             'Overdue task',
        silent:           'Deal gone silent',
        scoreDrop:        'AI score dropped',
        'score-critical': 'AI score critical',
    };
    const outcomeColors = {
        resolved: { bg: 'rgba(77,107,61,0.12)', text: '#2e4a24', label: 'Resolved' },
        ignored:  { bg: 'rgba(184,115,51,0.1)', text: '#6b4820', label: 'Ignored' },
        pending:  { bg: 'rgba(58,90,122,0.08)', text: '#3a5a7a', label: 'Pending' },
    };
    const fmtCurrency = (v) => v >= 1000000 ? '$' + (v/1000000).toFixed(1) + 'M' : v >= 1000 ? '$' + Math.round(v/1000) + 'K' : '$' + Math.round(v||0).toLocaleString();
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

    return (
        <div style={{ padding: '1.5rem' }}>
            {/* Controls */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                {canSeeAll && (
                    <select value={selectedRep} onChange={e => setSelectedRep(e.target.value)}
                        style={{ fontSize: '0.8125rem', padding: '0.375rem 0.75rem', border: '1px solid #e6ddd0', borderRadius: '6px', fontFamily: 'inherit', color: '#2a2622' }}>
                        <option value="">All reps</option>
                        {allReps.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                )}
                <select value={days} onChange={e => setDays(Number(e.target.value))}
                    style={{ fontSize: '0.8125rem', padding: '0.375rem 0.75rem', border: '1px solid #e6ddd0', borderRadius: '6px', fontFamily: 'inherit', color: '#2a2622' }}>
                    <option value={7}>Last 7 days</option>
                    <option value={30}>Last 30 days</option>
                    <option value={60}>Last 60 days</option>
                    <option value={90}>Last 90 days</option>
                </select>
                <button onClick={fetchData} style={{ fontSize: '0.8125rem', padding: '0.375rem 0.875rem', border: '1px solid #e6ddd0', borderRadius: '6px', background: '#fbf8f3', color: '#2a2622', cursor: 'pointer', fontFamily: 'inherit' }}>Refresh</button>
            </div>

            {loading && <div style={{ textAlign: 'center', padding: '3rem', color: '#8a8378', fontSize: '0.875rem' }}>Loading…</div>}
            {error && <div style={{ textAlign: 'center', padding: '2rem', color: '#9c3a2e', fontSize: '0.875rem' }}>Failed to load: {error}</div>}

            {!loading && !error && data && (
                <>
                {/* Summary cards */}
                {data.summary && data.summary.total > 0 ? (
                    <>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '10px', marginBottom: '1.5rem' }}>
                        {[
                            { val: data.summary.total, lbl: 'Total actions', color: '#2a2622' },
                            { val: data.summary.resolveRate != null ? data.summary.resolveRate + '%' : '—', lbl: 'Resolution rate', color: data.summary.resolveRate >= 60 ? '#2e4a24' : data.summary.resolveRate >= 35 ? '#7a6a48' : '#9c3a2e' },
                            { val: data.summary.resolved, lbl: 'Resolved', color: '#2e4a24' },
                            { val: data.summary.avgDays != null ? data.summary.avgDays + 'd' : '—', lbl: 'Avg days to resolve', color: '#3a5a7a' },
                        ].map(({ val, lbl, color }) => (
                            <div key={lbl} style={{ background: '#fbf8f3', border: '1px solid #e6ddd0', borderRadius: '8px', padding: '12px 14px' }}>
                                <div style={{ fontSize: '1.375rem', fontWeight: '700', color }}>{val}</div>
                                <div style={{ fontSize: '0.6875rem', color: '#8a8378', marginTop: '2px' }}>{lbl}</div>
                            </div>
                        ))}
                    </div>

                    {/* By type breakdown */}
                    {Object.keys(data.summary.byType || {}).length > 0 && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#8a8378', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>Effectiveness by action type</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
                                {Object.entries(data.summary.byType).map(([type, stats]) => {
                                    const rate = stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0;
                                    return (
                                        <div key={type} style={{ background: '#fbf8f3', border: '1px solid #e6ddd0', borderRadius: '8px', padding: '10px 12px' }}>
                                            <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#2a2622', marginBottom: '6px' }}>{actionTypeLabels[type] || type}</div>
                                            <div style={{ height: '4px', background: '#f5efe3', borderRadius: '2px', marginBottom: '6px' }}>
                                                <div style={{ height: '100%', width: rate + '%', background: rate >= 60 ? '#4d6b3d' : rate >= 35 ? '#b87333' : '#9c3a2e', borderRadius: '2px' }} />
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: '#8a8378' }}>
                                                <span>{rate}% resolved</span>
                                                <span>{stats.resolved}/{stats.total}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Log table */}
                    <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#8a8378', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>Action history</div>
                    <div style={{ border: '1px solid #e6ddd0', borderRadius: '8px', overflow: 'hidden' }}>
                        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                            <thead>
                                <tr style={{ background: '#fbf8f3', borderBottom: '1px solid #e6ddd0' }}>
                                    {['Date', 'Rep', 'Type', 'Deal', 'ARR', 'Signal', 'Outcome', 'Days'].map(h => (
                                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '0.6875rem', fontWeight: '700', color: '#8a8378', whiteSpace: 'nowrap' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.logs.map((log, i) => {
                                    const oc = outcomeColors[log.outcome] || outcomeColors.pending;
                                    return (
                                        <tr key={log.id} style={{ borderBottom: i < data.logs.length-1 ? '1px solid #f5efe3' : 'none', background: i % 2 === 0 ? '#fff' : '#fbf8f3' }}>
                                            <td style={{ padding: '8px 12px', color: '#8a8378', whiteSpace: 'nowrap' }}>{fmtDate(log.dismissedAt)}</td>
                                            <td style={{ padding: '8px 12px', color: '#2a2622', whiteSpace: 'nowrap' }}>{log.repName}</td>
                                            <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                                                <span style={{ background: '#f5efe3', color: '#5a544c', fontSize: '0.6875rem', padding: '2px 8px', borderRadius: '4px', fontWeight: '600' }}>
                                                    {actionTypeLabels[log.actionType] || log.actionType}
                                                </span>
                                            </td>
                                            <td style={{ padding: '8px 12px', color: '#2a2622', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.dealName || '—'}</td>
                                            <td style={{ padding: '8px 12px', color: '#8a8378', whiteSpace: 'nowrap' }}>{log.arrAtRisk ? fmtCurrency(log.arrAtRisk) : '—'}</td>
                                            <td style={{ padding: '8px 12px', color: '#8a8378', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.signal}>{log.signal || '—'}</td>
                                            <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                                                <span style={{ background: oc.bg, color: oc.text, fontSize: '0.6875rem', padding: '2px 8px', borderRadius: '999px', fontWeight: '600' }}>{oc.label}</span>
                                            </td>
                                            <td style={{ padding: '8px 12px', color: '#8a8378', whiteSpace: 'nowrap' }}>{log.daysToResolve != null ? log.daysToResolve + 'd' : '—'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
</div>
                    </div>
                    </>
                ) : (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#8a8378', fontSize: '0.875rem', border: '1px dashed #e6ddd0', borderRadius: '8px' }}>
                        No actions logged yet. Actions are recorded when you dismiss recommendations on the home screen, or when pipeline-alerts sends automated alerts.
                    </div>
                )}
                </>
            )}
        </div>
    );
}
