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

    // Local report filter state
    const [reportSubTab, setReportSubTab] = useState('pipeline');
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
                const stageColors = { 'Prospecting':'#6366f1','Qualified':'#8b5cf6','Demo':'#3b82f6','Proposal':'#f59e0b','Negotiation':'#f97316','Closed Won':'#10b981','Closed Lost':'#ef4444' };

                // Build slice options (only for managers/admins)
                const excludedRoles = new Set(['Admin', 'Manager']);
                const rAllReps = canSeeAll ? [...new Set([
                    ...(settings.users || []).filter(u => u.name && !excludedRoles.has(u.userType)).map(u => u.name),
                    ...visibleOpportunities.filter(o => o.salesRep).map(o => o.salesRep)
                ])].sort() : [];
                const rAllTeams = [...new Set((settings.users || []).filter(u => u.team).map(u => u.team))].sort();
                const rAllTerritories = [...new Set((settings.users || []).filter(u => u.territory).map(u => u.territory))].sort();
                const hasReportsSlicing = canSeeAll && (rAllReps.length > 1 || rAllTeams.length > 0 || rAllTerritories.length > 0);

                // Filter opportunities based on reports slice selectors
                const reportsOpps = (() => {
                    if (reportsRep) return visibleOpportunities.filter(o => o.salesRep === reportsRep || o.assignedTo === reportsRep);
                    if (reportsTeam) {
                        const teamUsers = new Set((settings.users || []).filter(u => u.team === reportsTeam).map(u => u.name));
                        return visibleOpportunities.filter(o => teamUsers.has(o.salesRep) || teamUsers.has(o.assignedTo));
                    }
                    if (reportsTerritory) {
                        const terrUsers = new Set((settings.users || []).filter(u => u.territory === reportsTerritory).map(u => u.name));
                        return visibleOpportunities.filter(o => terrUsers.has(o.salesRep) || terrUsers.has(o.assignedTo));
                    }
                    return visibleOpportunities;
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
                    const allActs = activities || [];
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
                    const allL = leads || [];
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

                const cardStyle = { background: '#fff', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' };
                const labelStyle = { fontSize: '0.6875rem', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' };
                const valueStyle = { fontSize: '1.625rem', fontWeight: '700', color: '#1e293b' };
                const printBtnStyle = { background: '#1c1917', border: 'none', borderRadius: '6px', padding: '0.25rem 0.625rem', fontSize: '0.6875rem', fontWeight: '600', color: '#f5f1eb', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 };

                const printSection = (title, bodyHtml) => {
                    const d = new Date();
                    const meta = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) + ' at ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                    const win = window.open('', '_blank', 'width=820,height=600');
                    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
<style>
  @page { margin: 0.75in; size: letter; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1e293b; }
  .hdr { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 12px; border-bottom: 3px solid #2563eb; margin-bottom: 20px; }
  .hdr h1 { font-size: 18px; font-weight: 800; }
  .hdr .accent { display: inline-block; width: 4px; height: 18px; background: linear-gradient(to bottom,#2563eb,#7c3aed); border-radius: 2px; margin-right: 8px; vertical-align: middle; }
  .meta { font-size: 9px; color: #94a3b8; text-align: right; line-height: 1.7; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead th { background: #f8fafc; color: #94a3b8; font-weight: 700; padding: 6px 8px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #e2e8f0; text-align: left; white-space: nowrap; }
  tbody td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  .footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; }
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
                                    <span style="color:#475569;font-weight:600;">${d[labelKey]}</span>
                                    <span style="color:#1e293b;font-weight:700;">$${(d[valueKey]||0).toLocaleString()}</span>
                                </div>
                                <div style="height:10px;background:#f1f5f9;border-radius:5px;overflow:hidden;">
                                    <div style="height:100%;width:${Math.round((d[valueKey]||0)/maxVal*100)}%;background:linear-gradient(to right,#2563eb,#7c3aed);border-radius:5px;"></div>
                                </div>
                            </div>`).join('');
                    };

                    const stageRows = byStage.map((s, i) => `
                        <tr style="background:${i%2===0?'#fff':'#f8fafc'}">
                            <td>${s.stage}</td>
                            <td style="text-align:center;">${s.count}</td>
                            <td style="text-align:right;">$${s.value.toLocaleString()}</td>
                            <td style="text-align:right;">${maxStageVal > 0 ? Math.round(s.value/maxStageVal*100) : 0}%</td>
                        </tr>`).join('');

                    const accountRows = topAccounts.map(([name, rev], i) => `
                        <tr style="background:${i%2===0?'#fff':'#f8fafc'}">
                            <td style="text-align:center;font-weight:700;color:${i===0?'#f59e0b':i===1?'#94a3b8':i===2?'#d97706':'#475569'}">#${i+1}</td>
                            <td>${name}</td>
                            <td style="text-align:right;font-weight:700;color:#10b981;">$${rev.toLocaleString()}</td>
                        </tr>`).join('');

                    const oppRows = reportsOpps.map((o, i) => `
                        <tr style="background:${i%2===0?'#fff':'#f8fafc'}">
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
                                <div style="font-size:9px;color:#475569;font-weight:700;">${m.rev > 0 ? '$'+Math.round(m.rev/1000)+'K' : ''}</div>
                                <div style="width:100%;background:#f1f5f9;border-radius:4px;height:80px;display:flex;align-items:flex-end;">
                                    <div style="width:100%;height:${Math.max(pct,m.rev>0?4:1)}%;background:linear-gradient(to top,#2563eb,#7c3aed);border-radius:4px 4px 0 0;"></div>
                                </div>
                                <div style="font-size:9px;color:#94a3b8;">${m.label}</div>
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
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1e293b; background: #fff; }
  
  .report-header { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 14px; border-bottom: 3px solid #2563eb; margin-bottom: 24px; }
  .report-header h1 { font-size: 22px; font-weight: 800; color: #1e293b; }
  .report-header .meta { font-size: 10px; color: #94a3b8; text-align: right; line-height: 1.6; }
  .report-header .accent { display: inline-block; width: 4px; height: 22px; background: linear-gradient(to bottom, #2563eb, #7c3aed); border-radius: 2px; margin-right: 8px; vertical-align: middle; }

  .section { margin-bottom: 28px; page-break-inside: avoid; }
  .section-title { font-size: 9px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0; }

  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 0; }
  .kpi-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; }
  .kpi-label { font-size: 9px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3px; }
  .kpi-value { font-size: 20px; font-weight: 800; color: #1e293b; line-height: 1.1; }
  .kpi-sub { font-size: 9px; color: #64748b; margin-top: 3px; }

  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; }

  .monthly-chart { display: flex; align-items: flex-end; gap: 6px; height: 90px; margin-top: 8px; }

  table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  thead th { background: #f8fafc; color: #94a3b8; font-weight: 700; text-align: left; padding: 6px 8px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #e2e8f0; white-space: nowrap; }
  tbody td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  tbody tr:last-child td { border-bottom: none; }

  .footer { margin-top: 32px; padding-top: 10px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; }

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
      <div style="font-size:11px;color:#64748b;margin-top:4px;">Pipeline performance and revenue insights</div>
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
      ${buildBarChart(revenueByQuarter, 'q', 'rev', () => '#2563eb')}
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
      ${byStage.length === 0 ? '<p style="color:#94a3b8;font-size:11px;">No opportunity data.</p>' : `
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
<table>
<thead><tr><th>Stage</th><th style="text-align:center;">Count</th><th style="text-align:right;">Value</th><th style="text-align:right;">Share</th></tr></thead>
<tbody>${stageRows}</tbody>
      </table>
</div>`}
    </div>
    <div class="card">
      <div class="section-title">Top Accounts by Won Revenue</div>
      ${topAccounts.length === 0 ? '<p style="color:#94a3b8;font-size:11px;">No closed won data yet.</p>' : `
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
      <tbody>${oppRows || '<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:16px;">No opportunities found.</td></tr>'}</tbody>
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
                    win2.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title><style>body{font-family:system-ui,sans-serif;padding:2rem;color:#1e293b}h1{font-size:1.125rem;font-weight:800;margin-bottom:0.25rem}.meta{font-size:0.75rem;color:#94a3b8;margin-bottom:1.5rem}table{width:100%;border-collapse:collapse;font-size:0.875rem}th{background:#f8fafc;color:#94a3b8;font-weight:700;padding:6px 10px;font-size:0.75rem;text-transform:uppercase;border-bottom:2px solid #e2e8f0;text-align:left}td{padding:6px 10px;border-bottom:1px solid #f1f5f9}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><h1>${title}</h1><div class="meta">Generated ${meta} · Sales Pipeline Tracker</div>${contentFn()}</body></html>`);
                    win2.document.close();
                    setTimeout(() => win2.print(), 500);
                };

                const ReportBtn = ({ title, contentFn }) => (
                    <button onClick={() => generateReport(title, contentFn)}
                        style={{ display:'flex', alignItems:'center', gap:'0.3rem', padding:'0.25rem 0.625rem', background:'#1c1917', border:'none', borderRadius:'6px', cursor:'pointer', fontSize:'0.6875rem', fontWeight:'600', color:'#f5f1eb', fontFamily:'inherit', whiteSpace:'nowrap', flexShrink:0 }}>🖨️ Print</button>
                );

                return (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

                        {/* ── Row 1: Title — matches Sales Manager tab-page-header style ── */}
                        <div className="tab-page-header">
                            <div className="tab-page-header-bar"></div>
                            <div>
                                <h2>Reports</h2>
                            </div>
                        </div>

                        {/* ── Sub-tab nav — Pipeline / Performance / Revenue / etc. ── */}
                        <div style={{ display:'flex', borderBottom:'1px solid #e2e8f0', overflowX:'auto', marginBottom:'0' }}>
                            {[
                              { key:'pipeline',    label:'Pipeline' },
                              { key:'performance', label:'Performance' },
                              { key:'revenue',     label:'Revenue' },
                              { key:'activity',    label:'Activity' },
                              ...(leadsEnabled ? [{ key:'leads', label:'Leads' }] : []),
                              { key:'actions',     label:'Actions' },
                              { key:'custom',      label:'Custom' },
                            ].map(({ key, label }) => (
                              <button key={key} onClick={() => setReportSubTab(key)} style={{
                                padding: '0.5rem 1.25rem',
                                border: 'none',
                                borderBottom: reportSubTab === key ? '2px solid #2563eb' : '2px solid transparent',
                                background: 'transparent',
                                color: reportSubTab === key ? '#2563eb' : '#64748b',
                                fontWeight: reportSubTab === key ? '700' : '500',
                                fontSize: '0.875rem',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                transition: 'all 0.15s',
                                whiteSpace: 'nowrap',
                              }}>{label}</button>
                            ))}
                        </div>

                        {/* ── Row 2: Viewing + Period filters (left) + Export PDF (right) ── */}
                        <div className="table-container" style={{ marginTop: '0.75rem' }}>
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.625rem 1.25rem', borderBottom:'1px solid #e2e8f0', flexWrap:'wrap', gap:'0.5rem' }}>

                            {/* Left side: Viewing slice + Period filter */}
                            <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', flexWrap:'wrap' }}>
                              {hasReportsSlicing && (
                                <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap' }}>
                                  <span style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em' }}>Viewing:</span>
                                  {rAllReps.length > 1 && <SliceDropdown label="Rep" icon="👤" options={rAllReps} selected={reportsRep} onSelect={v => { setReportsRep(v); if(v){setReportsTeam(null);setReportsTerritory(null);} }} />}
                                  {rAllTeams.length > 0 && <SliceDropdown label="Team" icon="👥" options={rAllTeams} selected={reportsTeam} onSelect={v => { setReportsTeam(v); if(v){setReportsRep(null);setReportsTerritory(null);} }} />}
                                  {rAllTerritories.length > 0 && <SliceDropdown label="Territory" icon="📍" options={rAllTerritories} selected={reportsTerritory} onSelect={v => { setReportsTerritory(v); if(v){setReportsRep(null);setReportsTeam(null);} }} />}
                                  {(reportsRep || reportsTeam || reportsTerritory) && (
                                    <button onClick={() => { setReportsRep(null); setReportsTeam(null); setReportsTerritory(null); }}
                                      style={{ padding:'0.2rem 0.5rem', borderRadius:'4px', border:'1px solid #e2e8f0', background:'#fff', color:'#94a3b8', fontSize:'0.625rem', fontWeight:'600', cursor:'pointer', fontFamily:'inherit' }}>✕ Clear</button>
                                  )}
                                  <div style={{ width:'1px', height:'16px', background:'#e2e8f0', flexShrink:0 }} />
                                </div>
                              )}
                              {/* Period filter */}
                              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap' }}>
                                <span style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', flexShrink:0 }}>Period:</span>
                                {(() => { const now = new Date(); const fy = now.getFullYear(); return (
                                <div style={{ display:'flex', gap:'4px', flexWrap:'wrap', alignItems:'center' }}>
                                    {['FY','Q1','Q2','Q3','Q4','all','custom'].map(p => (
                                        <button key={p} onClick={() => setReportTimePeriod(p)}
                                            style={{ padding:'3px 12px', borderRadius:'999px', border:'1px solid', cursor:'pointer', fontFamily:'inherit', fontSize:'0.6875rem', fontWeight:'600', transition:'all 0.15s',
                                                background: reportTimePeriod === p ? '#2563eb' : '#f8fafc',
                                                color:      reportTimePeriod === p ? '#fff' : '#475569',
                                                borderColor: reportTimePeriod === p ? '#2563eb' : '#e2e8f0' }}>
                                            {p === 'all' ? 'All Time' : p === 'FY' ? `FY ${fy}` : p === 'custom' ? 'Custom' : p}
                                        </button>
                                    ))}
                                    {reportTimePeriod === 'custom' && (
                                        <div style={{ display:'flex', alignItems:'center', gap:'0.375rem' }}>
                                            <input type="date" value={reportDateFrom} onChange={e => setReportDateFrom(e.target.value)}
                                                style={{ padding:'3px 8px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'0.6875rem', fontFamily:'inherit', color:'#1e293b' }} />
                                            <span style={{ fontSize:'0.6875rem', color:'#94a3b8' }}>to</span>
                                            <input type="date" value={reportDateTo} onChange={e => setReportDateTo(e.target.value)}
                                                style={{ padding:'3px 8px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'0.6875rem', fontFamily:'inherit', color:'#1e293b' }} />
                                        </div>
                                    )}
                                </div>
                                ); })()}
                              </div>
                            </div>

                            {/* Right side: Customize (custom tab only) + Export PDF */}
                            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexShrink:0 }}>
                              {reportSubTab === 'custom' && (
                                <button
                                  onClick={() => document.dispatchEvent(new CustomEvent('accelerep:openCustomize'))}
                                  style={{ display:'flex', alignItems:'center', gap:'0.375rem', padding:'0.3rem 0.875rem', border:'none', borderRadius:'6px', background:'#1c1917', color:'#f5f1eb', fontSize:'0.75rem', fontWeight:'600', cursor:'pointer', fontFamily:'inherit' }}
                                >
                                  ⚙️ Customize
                                </button>
                              )}
                              <button onClick={()=>{
                                const lbl={pipeline:'Pipeline',performance:'Performance',revenue:'Revenue',activity:'Activity',leads:'Leads',actions:'Actions'}[reportSubTab]||'Report';
                                const win=window.open('','_blank','width=900,height=700');
                                if(!win){alert('Allow popups to export PDF');return;}
                                const el=document.querySelector('[data-rpt]');
                                const body=el?el.innerHTML:'<p>Could not capture report.</p>';
                                const d=new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
                                win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Accelerep — '+lbl+'</title><style>@page{margin:0.625in;size:letter}*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;font-size:12px;color:#1e293b}.hdr{display:flex;justify-content:space-between;padding-bottom:12px;border-bottom:3px solid #2563eb;margin-bottom:20px}.hdr h1{font-size:18px;font-weight:800}.meta{font-size:9px;color:#94a3b8}button,select{display:none!important}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#f8fafc;padding:6px 10px;font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0}td{padding:6px 10px;border-bottom:1px solid #f1f5f9}</style></head><body><div class="hdr"><h1>Accelerep — '+lbl+'</h1><div class="meta">'+d+'</div></div>'+body+'<scr'+'ipt>window.onload=function(){window.print()}<\/script></body></html>');
                                win.document.close();
                              }} style={{fontSize:'0.75rem',padding:'0.3rem 0.875rem',border:'none',borderRadius:'6px',background:'#1c1917',color:'#f5f1eb',cursor:'pointer',fontFamily:'inherit',fontWeight:'600'}}>
                                &#128424; Export PDF
                              </button>
                            </div>

                          </div>
                        </div>

                        {/* ── KPI summary strip (always visible, below period filter) ── */}
                        {(() => {
                            const _now = new Date();
                            const fy = _now.getFullYear();
                            const fiscalStart = settings.fiscalYearStart || 10;
                            const getFiscalQRanges = (baseYear) => {
                                const qs = {};
                                ['Q1','Q2','Q3','Q4'].forEach((q, qi) => {
                                    const rawMonth = fiscalStart - 1 + qi * 3;
                                    const sm = (rawMonth % 12) + 1;
                                    const sy = rawMonth >= 12 ? baseYear + 1 : baseYear;
                                    const endRaw = new Date(sy, sm - 1 + 3, 0);
                                    qs[q] = { start: new Date(`${sy}-${String(sm).padStart(2,'0')}-01`), end: endRaw };
                                });
                                qs['FY'] = { start: qs['Q1'].start, end: qs['Q4'].end };
                                return qs;
                            };
                            // Build time buckets that match the selected period filter
                            const buildBuckets = () => {
                                if (reportTimePeriod === 'all') {
                                    // Last 6 months
                                    return Array.from({ length: 6 }, (_, i) => {
                                        const d = new Date(fy, _now.getMonth() - (5 - i), 1);
                                        return { start: d, end: new Date(d.getFullYear(), d.getMonth() + 1, 1) };
                                    });
                                } else if (reportTimePeriod === 'FY') {
                                    // Each fiscal quarter of the fiscal year
                                    const fsRanges = getFiscalQRanges(fy);
                                    return ['Q1','Q2','Q3','Q4'].map(q => ({
                                        start: fsRanges[q].start,
                                        end: new Date(fsRanges[q].end.getTime() + 86400000)
                                    }));
                                } else if (['Q1','Q2','Q3','Q4'].includes(reportTimePeriod)) {
                                    // Each month within the fiscal quarter
                                    const fsRanges = getFiscalQRanges(fy);
                                    const qStart = fsRanges[reportTimePeriod].start;
                                    return Array.from({ length: 3 }, (_, i) => {
                                        const d = new Date(qStart.getFullYear(), qStart.getMonth() + i, 1);
                                        return { start: d, end: new Date(qStart.getFullYear(), qStart.getMonth() + i + 1, 1) };
                                    });
                                } else if (reportTimePeriod === 'custom' && reportDateFrom && reportDateTo) {
                                    // Split custom range into 6 equal segments
                                    const start = new Date(reportDateFrom).getTime();
                                    const end = new Date(reportDateTo).getTime() + 86400000;
                                    const seg = (end - start) / 6;
                                    return Array.from({ length: 6 }, (_, i) => ({
                                        start: new Date(start + i * seg),
                                        end: new Date(start + (i + 1) * seg)
                                    }));
                                }
                                // Fallback: last 6 months
                                return Array.from({ length: 6 }, (_, i) => {
                                    const d = new Date(fy, _now.getMonth() - (5 - i), 1);
                                    return { start: d, end: new Date(d.getFullYear(), d.getMonth() + 1, 1) };
                                });
                            };
                            const monthBuckets = buildBuckets().map(({ start, end }) => {
                                const bucketOpps = reportsTimedOpps.filter(o => {
                                    const c = o.forecastedCloseDate || o.closeDate;
                                    if (!c) return false;
                                    const cd = new Date(c);
                                    return cd >= start && cd < end;
                                });
                                const bucketWon = bucketOpps.filter(o => o.stage === 'Closed Won');
                                const bucketLost = bucketOpps.filter(o => o.stage === 'Closed Lost');
                                const wonRev = bucketWon.reduce((s, o) => s + (parseFloat(o.arr)||0) + (o.implementationCost||0), 0);
                                const pipelineVal = bucketOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost').reduce((s, o) => s + (parseFloat(o.arr)||0) + (o.implementationCost||0), 0);
                                const wr = (bucketWon.length + bucketLost.length) > 0 ? (bucketWon.length / (bucketWon.length + bucketLost.length)) * 100 : 0;
                                const avg = bucketWon.length > 0 ? wonRev / bucketWon.length : 0;
                                return { wonRev, pipelineVal, wr, avg };
                            });
                            const sparkSvg = (vals, color) => {
                                const mx = Math.max(...vals, 1);
                                const n = vals.length;
                                const pts = vals.map((v, i) => `${Math.round((i/(n-1))*100)},${Math.round(24-Math.max(0,v/mx)*20)}`).join(' ');
                                const pf = pts + ' 100,24 0,24';
                                return (
                                    <svg width="100%" height="24" viewBox="0 0 100 24" preserveAspectRatio="none" style={{ display:'block', marginTop:'6px' }}>
                                        <polyline fill={color} fillOpacity="0.10" stroke="none" points={pf} />
                                        <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" points={pts} opacity="0.8" />
                                    </svg>
                                );
                            };
                            return (
                            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(90px,1fr))', gap:'0.75rem', padding:'0.75rem 1.25rem' }}>
                                <div className="kpi-card accent-green" style={{ borderRadius:'10px', padding:'0.875rem 1rem 0.625rem 1.25rem' }}>
                                    <div style={labelStyle}>Won Revenue</div>
                                    <div style={valueStyle}>{'$'+totalWonRevenue.toLocaleString()}</div>
                                    <div style={{ fontSize:'0.6875rem', color:'#94a3b8', marginTop:'0.125rem' }}>{wonOpps.length} deals</div>
                                    {sparkSvg(monthBuckets.map(b => b.wonRev), '#16a34a')}
                                </div>
                                <div className="kpi-card accent-blue" style={{ borderRadius:'10px', padding:'0.875rem 1rem 0.625rem 1.25rem' }}>
                                    <div style={labelStyle}>Pipeline Value</div>
                                    <div style={valueStyle}>{'$'+totalPipelineValue.toLocaleString()}</div>
                                    <div style={{ fontSize:'0.6875rem', color:'#94a3b8', marginTop:'0.125rem' }}>{openOpps.length} open</div>
                                    {sparkSvg(monthBuckets.map(b => b.pipelineVal), '#2563eb')}
                                </div>
                                <div className="kpi-card accent-purple" style={{ borderRadius:'10px', padding:'0.875rem 1rem 0.625rem 1.25rem' }}>
                                    <div style={labelStyle}>Win Rate</div>
                                    <div style={valueStyle}>{winRate.toFixed(1)+'%'}</div>
                                    <div style={{ fontSize:'0.6875rem', color:'#94a3b8', marginTop:'0.125rem' }}>{wonOpps.length} won / {lostOpps.length} lost</div>
                                    {sparkSvg(monthBuckets.map(b => b.wr), '#9333ea')}
                                </div>
                                <div className="kpi-card accent-amber" style={{ borderRadius:'10px', padding:'0.875rem 1rem 0.625rem 1.25rem' }}>
                                    <div style={labelStyle}>Avg Deal Size</div>
                                    <div style={valueStyle}>{'$'+Math.round(avgDealSize).toLocaleString()}</div>
                                    <div style={{ fontSize:'0.6875rem', color:'#94a3b8', marginTop:'0.125rem' }}>closed won</div>
                                    {sparkSvg(monthBuckets.map(b => b.avg), '#f59e0b')}
                                </div>
                            </div>
                            );
                        })()}

                        <div data-rpt="1">
                        {reportSubTab === 'pipeline' && (
                        <div style={{ padding:'1rem 1.25rem 1.5rem' }}>
                          <AnalyticsDashboard opportunities={reportsTimedOpps} settings={settings} quotaData={settings.quotaData} accounts={accounts} users={settings.users || []} />
                        </div>
                        )}


                        {/* ════════════════════════════════════════════
                             TAB: PERFORMANCE
                            ════════════════════════════════════════════ */}
                        {reportSubTab === 'performance' && (
                        <div style={{ display:'flex', flexDirection:'column', gap:'1rem', padding:'1rem 1.25rem 1.5rem' }}>

                          {/* Quota Attainment */}
                          {(() => {
                            // Build the set of visible rep names matching the current reports slice
                            const visibleRepNames = (() => {
                              if (reportsRep) return new Set([reportsRep]);
                              if (reportsTeam) return new Set((settings.users||[]).filter(u => u.team === reportsTeam).map(u => u.name));
                              if (reportsTerritory) return new Set((settings.users||[]).filter(u => u.territory === reportsTerritory).map(u => u.name));
                              // No slice — use all users visible to this user (respects role-based visibility)
                              return new Set(reportsOpps.map(o => o.salesRep || o.assignedTo).filter(Boolean));
                            })();
                            // Sum per-user quotas for visible reps only
                            const quotaMode = (settings.users||[]).find(u => u.quotaType)?.quotaType || 'annual';
                            // Build the quota rollup correctly:
                            // - When a rep/team/territory slice is active, sum only those users' quotas
                            // - When no slice is active (admin viewing all), sum ALL non-ReadOnly users with quota set
                            // - Never filter by Admin/Manager role — they can carry quota too
                            const hasSlice = reportsRep || reportsTeam || reportsTerritory;
                            const visibleUsers = (settings.users||[]).filter(u => {
                                if (u.userType === 'ReadOnly') return false;
                                if (!u.name) return false;
                                if (hasSlice) return visibleRepNames.has(u.name);
                                // No slice: include any user who has quota configured
                                const hasQuota = (u.annualQuota || 0) > 0 || (u.q1Quota || 0) > 0 || (u.q2Quota || 0) > 0 || (u.q3Quota || 0) > 0 || (u.q4Quota || 0) > 0;
                                return hasQuota;
                            });
                            const totalQuota = visibleUsers.reduce((s, u) => {
                              if ((u.quotaType || quotaMode) === 'annual') return s + (u.annualQuota || 0);
                              return s + (u.q1Quota||0) + (u.q2Quota||0) + (u.q3Quota||0) + (u.q4Quota||0);
                            }, 0);
                            const closedWonValue = wonOpps.reduce((s,o)=>s+(o.arr||0)+(o.implementationCost||0),0);
                            const totalWeightedValue = openOpps.reduce((s,o)=>{
                              const stDef = (settings.funnelStages||[]).find(st=>st.name===o.stage);
                              const prob = (o.probability!=null?o.probability:(stDef?stDef.weight:30))/100;
                              return s + ((o.arr||0)+(o.implementationCost||0))*prob;
                            },0);
                            const attainPct = totalQuota > 0 ? (closedWonValue/totalQuota*100) : 0;
                            const estPct    = totalQuota > 0 ? ((closedWonValue+totalWeightedValue)/totalQuota*100) : 0;
                            const barColor  = attainPct>=100?'#10b981':attainPct>=75?'#f59e0b':'#ef4444';
                            return (
                            <div style={cardStyle}>
                              <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#1e293b', marginBottom:'1rem' }}>🎯 Quota Attainment</div>
                              {totalQuota === 0 ? <div style={{ color:'#94a3b8', fontSize:'0.8125rem' }}>No quota set. Configure your quota in Settings.</div> : (
                              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))', gap:'1rem' }}>
                                {[
                                  { label:'Annual Quota',       value:'$'+totalQuota.toLocaleString(),              color:'#1e293b' },
                                  { label:'Closed Won',         value:'$'+closedWonValue.toLocaleString(),           color:'#10b981' },
                                  { label:'Attainment',         value:attainPct.toFixed(1)+'%',                      color:barColor },
                                  { label:'Est. w/ Weighted',   value:estPct.toFixed(1)+'%',                         color:'#6366f1' },
                                ].map(k=>(
                                  <div key={k.label} style={{ background:'#f8fafc', borderRadius:'8px', padding:'0.75rem 1rem', border:'1px solid #e2e8f0' }}>
                                    <div style={labelStyle}>{k.label}</div>
                                    <div style={{ fontSize:'1.5rem', fontWeight:'800', color:k.color }}>{k.value}</div>
                                  </div>
                                ))}
                              </div>
                              )}
                              {totalQuota > 0 && (
                                <div style={{ marginTop:'1rem' }}>
                                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.375rem' }}>
                                    <span style={{ fontSize:'0.75rem', color:'#64748b' }}>Attainment Progress</span>
                                    <span style={{ fontSize:'0.75rem', fontWeight:'700', color:barColor }}>{attainPct.toFixed(1)}%</span>
                                  </div>
                                  <div style={{ height:'12px', background:'#e2e8f0', borderRadius:'6px', overflow:'hidden', position:'relative' }}>
                                    <div style={{ height:'100%', width:Math.min(attainPct,100)+'%', background:barColor, borderRadius:'6px', transition:'width 0.5s ease' }}/>
                                    {estPct > attainPct && <div style={{ position:'absolute', top:0, left:Math.min(attainPct,100)+'%', height:'100%', width:Math.min(estPct-attainPct,100-attainPct)+'%', background:'#6366f120', borderRadius:'0 6px 6px 0' }}/>}
                                  </div>
                                  <div style={{ fontSize:'0.6875rem', color:'#94a3b8', marginTop:'0.375rem' }}>Weighted pipeline adds {(estPct-attainPct).toFixed(1)}% estimated attainment</div>
                                </div>
                              )}
                            </div>
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
                              <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#1e293b', marginBottom:'1rem' }}>⚡ Sales Velocity</div>
                              {avgDays === null ? <div style={{ color:'#94a3b8', fontSize:'0.8125rem' }}>No closed won deals with creation dates yet.</div> : (
                              <div style={{ display:'grid', gridTemplateColumns: repVelocity.length >= 2 ? '1fr 1fr' : '1fr', gap:'1.25rem' }}>
                                <div>
                                  <div style={labelStyle}>Avg Days to Close</div>
                                  <div style={{ fontSize:'2rem', fontWeight:'800', color:'#1e293b', marginBottom:'1rem' }}>{avgDays} <span style={{ fontSize:'1rem', color:'#64748b', fontWeight:'500' }}>days</span></div>
                                  {stageVelocity.length > 0 && <>
                                    <div style={labelStyle}>Avg Days by Stage</div>
                                    {stageVelocity.map(({stage,avg})=>{
                                      const maxAvg = Math.max(...stageVelocity.map(s=>s.avg),1);
                                      return <div key={stage} style={{ marginBottom:'0.5rem' }}>
                                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.2rem' }}>
                                          <span style={{ fontSize:'0.75rem', color:'#475569' }}>{stage}</span>
                                          <span style={{ fontSize:'0.75rem', fontWeight:'700', color:'#1e293b' }}>{avg}d</span>
                                        </div>
                                        <div style={{ height:'5px', background:'#f1f5f9', borderRadius:'3px', overflow:'hidden' }}>
                                          <div style={{ height:'100%', width:(avg/maxAvg*100)+'%', background:'linear-gradient(to right,#6366f1,#8b5cf6)', borderRadius:'3px' }}/>
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
                                        <span style={{ fontSize:'0.75rem', fontWeight:'600', color:'#475569', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'130px' }}>{rep}</span>
                                        <span style={{ fontSize:'0.75rem', color:'#94a3b8' }}>{avg}d · {count} deals</span>
                                      </div>
                                      <div style={{ height:'5px', background:'#f1f5f9', borderRadius:'3px', overflow:'hidden' }}>
                                        <div style={{ height:'100%', width:(avg/maxRepAvg*100)+'%', background:'linear-gradient(to right,#2563eb,#7c3aed)', borderRadius:'3px' }}/>
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
                                <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#1e293b', marginBottom:'1rem' }}>🏆 Win Rate</div>
                                <div style={{ display:'flex', alignItems:'center', gap:'1.5rem', marginBottom:'1rem' }}>
                                  <div style={{ textAlign:'center' }}>
                                    <div style={{ fontSize:'2.5rem', fontWeight:'900', color: wRate>=50?'#10b981':wRate>=30?'#f59e0b':'#ef4444' }}>{wRate.toFixed(0)}%</div>
                                    <div style={{ fontSize:'0.6875rem', color:'#94a3b8' }}>win rate</div>
                                  </div>
                                  <div style={{ flex:1 }}>
                                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.25rem' }}>
                                      <span style={{ fontSize:'0.75rem', color:'#10b981', fontWeight:'600' }}>Won: {wonOpps.length}</span>
                                      <span style={{ fontSize:'0.75rem', color:'#ef4444', fontWeight:'600' }}>Lost: {lostOpps.length}</span>
                                    </div>
                                    <div style={{ height:'10px', background:'#fee2e2', borderRadius:'5px', overflow:'hidden' }}>
                                      <div style={{ height:'100%', width:wRate+'%', background:'#10b981', borderRadius:'5px' }}/>
                                    </div>
                                    <div style={{ fontSize:'0.6875rem', color:'#94a3b8', marginTop:'0.375rem' }}>
                                      Avg won deal: ${wonOpps.length>0?Math.round(wonOpps.reduce((s,o)=>s+(o.arr||0),0)/wonOpps.length).toLocaleString():'—'}
                                    </div>
                                  </div>
                                </div>
                              </div>
                              {/* Loss Analysis card */}
                              <div style={cardStyle}>
                                <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#1e293b', marginBottom:'1rem' }}>📉 Loss Analysis</div>
                                {lostOpps.length === 0 ? <div style={{ color:'#94a3b8', fontSize:'0.8125rem' }}>No closed lost opportunities yet.</div> : <>
                                  <div style={{ fontSize:'0.6875rem', color:'#94a3b8', marginBottom:'0.75rem' }}>{lostOpps.length} deals lost · ${lostARR.toLocaleString()} ARR</div>
                                  {catRows.map(([cat,cnt])=>(
                                    <div key={cat} style={{ marginBottom:'0.5rem' }}>
                                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.2rem' }}>
                                        <span style={{ fontSize:'0.75rem', color:'#475569' }}>{cat}</span>
                                        <span style={{ fontSize:'0.75rem', fontWeight:'700', color:'#ef4444' }}>{cnt}</span>
                                      </div>
                                      <div style={{ height:'5px', background:'#f1f5f9', borderRadius:'3px', overflow:'hidden' }}>
                                        <div style={{ height:'100%', width:(cnt/maxCat*100)+'%', background:'#ef4444', borderRadius:'3px', opacity:0.7 }}/>
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
                              <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#1e293b', marginBottom:'0.875rem' }}>🏅 Rep Leaderboard</div>
                              <div style={{ overflowX:'auto' }}>
                                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem' }}>
                                  <thead><tr>
                                    {['#','Rep','Won Revenue','Deals Won','Win Rate','Open Pipeline'].map(h=>(
                                      <th key={h} style={{ padding:'0.4rem 0.75rem', textAlign: h==='Rep'||h==='#'?'left':'right', fontSize:'0.6875rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap' }}>{h}</th>
                                    ))}
                                  </tr></thead>
                                  <tbody>
                                    {repStats.map((r,i)=>(
                                      <tr key={r.rep} style={{ background:i%2===0?'#fff':'#f8fafc' }}>
                                        <td style={{ padding:'0.5rem 0.75rem', fontWeight:'700', color: i===0?'#f59e0b':i===1?'#94a3b8':i===2?'#d97706':'#cbd5e1' }}>#{i+1}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', fontWeight:'600', color:'#1e293b' }}>{r.rep}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', fontWeight:'700', color:'#10b981' }}>${r.wonRev.toLocaleString()}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#475569' }}>{r.wonCount}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color: r.winPct>=50?'#10b981':r.winPct>=30?'#f59e0b':'#ef4444', fontWeight:'600' }}>{r.winPct.toFixed(0)}%</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#2563eb' }}>{r.openCount}</td>
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
                              {k:'wonR', lbl:'Won Revenue',   fmt:fC,              mx:mxR, col:'#10b981', hi:true},
                              {k:'wr',   lbl:'Win Rate',      fmt:v=>v+'%',        mx:100, col:'#2563eb', hi:true},
                              {k:'pipe', lbl:'Open Pipeline', fmt:fC,              mx:mxP, col:'#6366f1', hi:true},
                              {k:'ad',   lbl:'Cycle Days',    fmt:v=>v!=null?v+'d':'-', mx:mxD, col:'#f59e0b', hi:false},
                            ];
                            return(
                              <div style={cardStyle}>
                                <div style={{fontWeight:'700',fontSize:'0.9375rem',color:'#1e293b',marginBottom:'1rem'}}>&#128202; Rep vs Rep Comparison</div>
                                <div style={{overflowX:'auto'}}>
                                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.8125rem',minWidth:'480px'}}>
                                    <thead><tr style={{borderBottom:'2px solid #e2e8f0'}}>
                                      <th style={{padding:'0.4rem 0.75rem',textAlign:'left',fontSize:'0.6875rem',fontWeight:'700',color:'#94a3b8',textTransform:'uppercase',width:'120px'}}>Metric</th>
                                      {rSC.map(r=><th key={r.rep} style={{padding:'0.4rem 0.75rem',textAlign:'right',fontSize:'0.6875rem',fontWeight:'700',color:'#1e293b',whiteSpace:'nowrap'}}>{r.rep}</th>)}
                                    </tr></thead>
                                    <tbody>{mts.map(m=>{
                                      const vals=rSC.map(r=>r[m.k]);
                                      const best=m.hi?Math.max(...vals.filter(v=>v!==null)):Math.min(...vals.filter(v=>v!==null));
                                      return(<tr key={m.k} style={{borderBottom:'1px solid #f1f5f9'}}>
                                        <td style={{padding:'0.625rem 0.75rem',fontWeight:'600',color:'#475569',fontSize:'0.75rem',whiteSpace:'nowrap'}}>
                                          <span style={{display:'inline-block',width:'8px',height:'8px',borderRadius:'50%',background:m.col,marginRight:'6px',verticalAlign:'middle'}}/>{m.lbl}
                                        </td>
                                        {rSC.map(r=>{
                                          const val=r[m.k];
                                          const ib=val!==null&&val===best&&rSC.filter(x=>x[m.k]===best).length<rSC.length;
                                          const pct=m.mx>0&&val!==null?Math.round((m.k==='ad'?(1-val/m.mx):val/m.mx)*100):0;
                                          return(<td key={r.rep} style={{padding:'0.5rem 0.75rem',textAlign:'right',verticalAlign:'middle'}}>
                                            <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:'3px'}}>
                                              <span style={{fontWeight:ib?'800':'600',color:ib?m.col:'#475569'}}>
                                                {m.fmt(val)}{ib&&rSC.length>1&&<span style={{marginLeft:'4px',fontSize:'0.6rem',background:m.col+'20',color:m.col,padding:'1px 5px',borderRadius:'999px'}}>best</span>}
                                              </span>
                                              <div style={{width:'80px',height:'4px',background:'#f1f5f9',borderRadius:'2px',overflow:'hidden'}}>
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
                            const FC={danger:{bg:'#FCEBEB',border:'#F7C1C1',text:'#A32D2D',dot:'#E24B4A'},warning:{bg:'#FAEEDA',border:'#FAC775',text:'#854F0B',dot:'#BA7517'},info:{bg:'#E6F1FB',border:'#B5D4F4',text:'#0C447C',dot:'#378ADD'}};
                            return(
                              <div style={cardStyle}>
                                <div style={{fontWeight:'700',fontSize:'0.9375rem',color:'#1e293b',marginBottom:'1rem'}}>&#128681; Coaching Red Flags <span style={{fontSize:'0.6875rem',fontWeight:'400',color:'#94a3b8',marginLeft:'6px'}}>Managers only</span></div>
                                {aF.length===0?(<div style={{fontSize:'0.8125rem',color:'#166534',background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:'8px',padding:'12px 14px'}}>No coaching concerns detected for this period.</div>):(
                                  <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                                    {aF.map(({rep,fl})=>(
                                      <div key={rep} style={{border:'1px solid #e2e8f0',borderRadius:'8px',overflow:'hidden'}}>
                                        <div style={{padding:'7px 14px',background:'#f8fafc',borderBottom:'1px solid #e2e8f0',fontWeight:'700',fontSize:'0.8125rem',color:'#1e293b'}}>{rep} <span style={{fontWeight:'400',color:'#94a3b8',fontSize:'0.6875rem'}}>{fl.length} flag{fl.length>1?'s':''}</span></div>
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
                                <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#1e293b' }}>📆 Won Revenue by Quarter ({currentYear})</div>
                                <button onClick={() => { const rows=revenueByQuarter.map((r,i)=>`<tr style="background:${i%2===0?'#fff':'#f8fafc'}"><td>${r.q}</td><td style="text-align:right;font-weight:700;">$${r.rev.toLocaleString()}</td></tr>`).join(''); printSection('Won Revenue by Quarter',`<div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
<table><thead><tr><th>Quarter</th><th style="text-align:right;">Won Revenue</th></tr></thead><tbody>${rows}</tbody></table>
</div>`); }} style={printBtnStyle}>🖨️ Print</button>
                              </div>
                              {revenueByQuarter.map(({q,rev})=>(
                                <div key={q} style={{ marginBottom:'0.625rem' }}>
                                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.3rem' }}>
                                    <span style={{ fontSize:'0.8125rem', fontWeight:'600', color:'#475569' }}>{q}</span>
                                    <span style={{ fontSize:'0.8125rem', fontWeight:'700', color:'#1e293b' }}>${rev.toLocaleString()}</span>
                                  </div>
                                  <div style={{ height:'8px', background:'#f1f5f9', borderRadius:'4px', overflow:'hidden' }}>
                                    <div style={{ height:'100%', width:(rev/maxQRev*100)+'%', background:'linear-gradient(to right,#2563eb,#7c3aed)', borderRadius:'4px' }}/>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div style={cardStyle}>
                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.875rem' }}>
                                <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#1e293b' }}>📈 Monthly Won Revenue (Last 6 Mo.)</div>
                                <button onClick={() => { const rows=monthlyData.map((m,i)=>`<tr style="background:${i%2===0?'#fff':'#f8fafc'}"><td>${m.label}</td><td style="text-align:right;font-weight:700;">$${m.rev.toLocaleString()}</td><td style="text-align:center;">${m.count}</td></tr>`).join(''); printSection('Monthly Won Revenue — Last 6 Months',`<div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
<table><thead><tr><th>Month</th><th style="text-align:right;">Won Revenue</th><th style="text-align:center;">Deals</th></tr></thead><tbody>${rows}</tbody></table>
</div>`); }} style={printBtnStyle}>🖨️ Print</button>
                              </div>
                              <div style={{ display:'flex', alignItems:'flex-end', gap:'0.5rem', height:'120px' }}>
                                {monthlyData.map((m,i)=>(
                                  <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'0.25rem', height:'100%', justifyContent:'flex-end' }}>
                                    <div title={'$'+m.rev.toLocaleString()+' · '+m.count+' deals'} style={{ width:'100%', background:m.rev>0?'linear-gradient(to top,#2563eb,#7c3aed)':'#e2e8f0', borderRadius:'4px 4px 0 0', height:Math.max(m.rev/maxMonthRev*100,m.rev>0?4:2)+'%', transition:'height 0.4s ease' }}/>
                                    <span style={{ fontSize:'0.625rem', color:'#94a3b8', whiteSpace:'nowrap' }}>{m.label}</span>
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
                                <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#1e293b' }}>✅ Closed Won Summary</div>
                                <ReportBtn title="Closed Won Summary" contentFn={() => {
                                  let html='<table><tr><th>Opportunity</th><th>Account</th><th>Rep</th><th style="text-align:right">ARR</th><th style="text-align:right">Impl Cost</th><th>Close Date</th></tr>';
                                  sortedWon.forEach(o=>{ html+=`<tr><td>${o.opportunityName||o.account||'—'}</td><td>${o.account||'—'}</td><td>${o.salesRep||o.assignedTo||'—'}</td><td style="text-align:right">$${(o.arr||0).toLocaleString()}</td><td style="text-align:right">$${(o.implementationCost||0).toLocaleString()}</td><td>${o.forecastedCloseDate||o.closeDate||'—'}</td></tr>`; });
                                  html+='</table>'; return html;
                                }} />
                              </div>
                              {sortedWon.length === 0 ? <div style={{ color:'#94a3b8', fontSize:'0.8125rem' }}>No closed won deals yet.</div> : (
                              <div style={{ overflowX:'auto' }}>
                                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem' }}>
                                  <thead><tr>
                                    {['Opportunity','Account','Rep','ARR','Impl Cost','Close Date'].map(h=>(
                                      <th key={h} style={{ padding:'0.4rem 0.75rem', textAlign:['ARR','Impl Cost'].includes(h)?'right':'left', fontSize:'0.6875rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap' }}>{h}</th>
                                    ))}
                                  </tr></thead>
                                  <tbody>
                                    {sortedWon.slice(0,25).map((o,i)=>(
                                      <tr key={o.id} style={{ background:i%2===0?'#fff':'#f8fafc' }}>
                                        <td style={{ padding:'0.5rem 0.75rem', fontWeight:'600', color:'#1e293b', maxWidth:'180px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{o.opportunityName||o.account||'—'}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', color:'#475569', maxWidth:'140px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{o.account||'—'}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', color:'#475569', whiteSpace:'nowrap' }}>{o.salesRep||o.assignedTo||'—'}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#10b981', fontWeight:'600' }}>${(o.arr||0).toLocaleString()}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#475569' }}>${(o.implementationCost||0).toLocaleString()}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', color:'#64748b', whiteSpace:'nowrap' }}>{o.forecastedCloseDate||o.closeDate||'—'}</td>
                                      </tr>
                                    ))}
                                    {sortedWon.length > 25 && <tr><td colSpan={6} style={{ padding:'0.5rem 0.75rem', color:'#94a3b8', fontSize:'0.75rem', textAlign:'center' }}>Showing 25 of {sortedWon.length} deals</td></tr>}
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
                                <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#1e293b', marginBottom:'0.875rem' }}>{icon} {title}</div>
                                {rows.length === 0 ? <div style={{ color:'#94a3b8', fontSize:'0.8125rem' }}>No data.</div> :
                                  rows.map(r=>(
                                    <div key={r.name} style={{ marginBottom:'0.625rem' }}>
                                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.25rem' }}>
                                        <span style={{ fontSize:'0.75rem', fontWeight:'600', color:'#475569' }}>{r.name}</span>
                                        <span style={{ fontSize:'0.75rem', fontWeight:'700', color:'#10b981' }}>${r.rev.toLocaleString()} <span style={{ color:'#94a3b8', fontWeight:'400' }}>({r.count} deals)</span></span>
                                      </div>
                                      <div style={{ height:'6px', background:'#f1f5f9', borderRadius:'3px', overflow:'hidden' }}>
                                        <div style={{ height:'100%', width:(r.rev/maxRev*100)+'%', background:'linear-gradient(to right,#10b981,#059669)', borderRadius:'3px' }}/>
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
                                  <div style={{fontWeight:'700',fontSize:'0.9375rem',color:'#1e293b'}}>&#128197; Year-over-Year Revenue</div>
                                  <div style={{display:'flex',gap:'1rem',alignItems:'center',flexWrap:'wrap'}}>
                                    <span style={{fontSize:'0.75rem',color:'#64748b'}}><span style={{display:'inline-block',width:'10px',height:'3px',background:'#2563eb',borderRadius:'2px',marginRight:'5px',verticalAlign:'middle'}}/>{tY}: <strong>{fY(tT)}</strong></span>
                                    <span style={{fontSize:'0.75rem',color:'#64748b'}}><span style={{display:'inline-block',width:'10px',height:'3px',background:'#cbd5e1',borderRadius:'2px',marginRight:'5px',verticalAlign:'middle'}}/>{lY}: <strong>{fY(lT)}</strong></span>
                                    {yDl!==null&&<span style={{fontSize:'0.75rem',fontWeight:'700',color:yDl>=0?'#10b981':'#ef4444',background:yDl>=0?'#dcfce7':'#fee2e2',padding:'2px 8px',borderRadius:'999px'}}>{yDl>=0?'+':''}{yDl.toFixed(1)}% YoY</span>}
                                  </div>
                                </div>
                                <div style={{display:'flex',gap:'4px',alignItems:'flex-end',height:'120px'}}>
                                  {tD.map((d,i)=>{
                                    const ly=lD[i].rev;
                                    const tH=Math.round((d.rev/yMx)*100),lH=Math.round((ly/yMx)*100);
                                    return(<div key={d.month} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:'2px'}}>
                                      <div style={{width:'100%',display:'flex',gap:'1px',alignItems:'flex-end',height:'100px'}}>
                                        <div style={{flex:1,height:Math.max(tH,2)+'%',background:'#2563eb',borderRadius:'2px 2px 0 0',opacity:0.85,minHeight:d.rev>0?'3px':'0'}} title={tY+': '+fY(d.rev)}/>
                                        <div style={{flex:1,height:Math.max(lH,2)+'%',background:'#cbd5e1',borderRadius:'2px 2px 0 0',minHeight:ly>0?'3px':'0'}} title={lY+': '+fY(ly)}/>
                                      </div>
                                      <div style={{fontSize:'0.5rem',color:'#94a3b8'}}>{d.month}</div>
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
                              const rows = repRows2.map(r=>hasSpiffs?`<tr><td>${r.name}</td><td style="text-align:center">${r.deals}</td><td style="text-align:right">$${r.rev.toLocaleString()}</td><td style="text-align:right">${r.quot>0?'$'+r.quot.toLocaleString():'—'}</td><td style="text-align:right">${r.attain!=null?r.attain.toFixed(1)+'%':'—'}</td><td style="text-align:right;font-weight:700;color:#059669">$${Math.round(r.comm).toLocaleString()}</td><td style="text-align:right;color:#7c3aed">$${Math.round(r.spiff).toLocaleString()}</td><td style="text-align:right;font-weight:800">$${Math.round(r.total).toLocaleString()}</td></tr>`:`<tr><td>${r.name}</td><td style="text-align:center">${r.deals}</td><td style="text-align:right">$${r.rev.toLocaleString()}</td><td style="text-align:right">${r.quot>0?'$'+r.quot.toLocaleString():'—'}</td><td style="text-align:right">${r.attain!=null?r.attain.toFixed(1)+'%':'—'}</td><td style="text-align:right;font-weight:700;color:#059669">$${Math.round(r.comm).toLocaleString()}</td></tr>`).join('');
                              win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Commissions — ${periodLabel}</title><style>body{font-family:system-ui,sans-serif;padding:2rem;color:#1e293b}h1{font-size:1.25rem;font-weight:800}table{width:100%;border-collapse:collapse;margin-top:1rem}th,td{padding:.5rem .75rem;border:1px solid #e2e8f0;font-size:.875rem}th{background:#f8fafc;font-weight:700}tfoot td{font-weight:700;background:#f1f5f9}</style></head><body><h1>Commissions Report — ${periodLabel}</h1><p style="color:#64748b;font-size:.875rem">Generated ${meta} · Sales Pipeline Tracker</p><div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
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
                                <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#1e293b' }}>💳 Commissions Earned</div>
                                <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                                  <div style={{ display:'flex', gap:'0.25rem', flexWrap:'wrap' }}>
                                    {commissionReportPeriods.map(pill=>(
                                      <button key={pill} onClick={()=>setCommissionReportFilter(pill)} style={{ padding:'0.2rem 0.625rem', borderRadius:'999px', border:'none', cursor:'pointer', fontSize:'0.6875rem', fontWeight:'700', fontFamily:'inherit', transition:'all 0.15s', background:(commissionReportFilter||'This Quarter')===pill?'#2563eb':'#e2e8f0', color:(commissionReportFilter||'This Quarter')===pill?'#fff':'#64748b' }}>{pill}</button>
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
                                    { label:'SPIFFs',         value: '$'+Math.round(totals.spiff).toLocaleString(), color:'#7c3aed' },
                                    { label:'Total Earnings', value: '$'+Math.round(totals.total).toLocaleString(), color:'#059669' },
                                  ] : []),
                                ].map(k=>(
                                  <div key={k.label} style={{ background:'#f8fafc', borderRadius:'8px', padding:'0.625rem 0.875rem', border:'1px solid #e2e8f0' }}>
                                    <div style={labelStyle}>{k.label}</div>
                                    <div style={{ fontSize:'1.25rem', fontWeight:'800', color: k.color || '#1e293b' }}>{k.value}</div>
                                  </div>
                                ))}
                              </div>
                              {hasSpiffs && (
                                <div style={{ background:'#f5f3ff', border:'1px solid #ddd6fe', borderRadius:'8px', padding:'0.625rem 0.875rem', marginBottom:'1rem' }}>
                                  <div style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#6d28d9', marginBottom:'0.375rem' }}>⚡ Active SPIFFs ({activeSpiffs.length})</div>
                                  <div style={{ display:'flex', flexWrap:'wrap', gap:'0.375rem' }}>
                                    {activeSpiffs.map((s,i) => (
                                      <span key={i} style={{ fontSize:'0.6875rem', background:'#ede9fe', color:'#5b21b6', padding:'2px 8px', borderRadius:'999px', fontWeight:'600' }}>
                                        {s.name||'Unnamed'}: {s.type==='flat'?`$${parseFloat(s.amount||0).toLocaleString()} flat`:s.type==='pct'?`${s.amount}% of ARR`:`${s.amount}× multiplier`}
                                        {s.condition ? ` — ${s.condition}` : ''}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {repRows2.length === 0 ? <div style={{ color:'#94a3b8', fontSize:'0.8125rem' }}>No rep data for this period.</div> : (
                              <div style={{ overflowX:'auto' }}>
                                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem' }}>
                                  <thead><tr>
                                    {['Rep','Deals Won','Won Revenue','Quota','Attainment','Commission',...(hasSpiffs?['SPIFFs','Total']:[])].map(h=>(
                                      <th key={h} style={{ padding:'0.4rem 0.75rem', textAlign:h==='Rep'?'left':'right', fontSize:'0.6875rem', fontWeight:'700', color:h==='SPIFFs'?'#7c3aed':h==='Total'?'#059669':'#94a3b8', textTransform:'uppercase', borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap' }}>{h}</th>
                                    ))}
                                  </tr></thead>
                                  <tbody>
                                    {repRows2.map((r,i)=>(
                                      <tr key={r.name} style={{ background:i%2===0?'#fff':'#f8fafc' }}>
                                        <td style={{ padding:'0.5rem 0.75rem', fontWeight:'600', color:'#1e293b' }}>{r.name}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#475569' }}>{r.deals}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#10b981', fontWeight:'600' }}>${r.rev.toLocaleString()}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#94a3b8' }}>{r.quot>0?'$'+r.quot.toLocaleString():'—'}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color: r.attain!=null?(r.attain>=100?'#10b981':r.attain>=75?'#f59e0b':'#ef4444'):'#94a3b8', fontWeight:'600' }}>{r.attain!=null?r.attain.toFixed(1)+'%':'—'}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', fontWeight:'700', color:'#059669' }}>${Math.round(r.comm).toLocaleString()}</td>
                                        {hasSpiffs && <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', fontWeight:'600', color:'#7c3aed' }}>${Math.round(r.spiff).toLocaleString()}</td>}
                                        {hasSpiffs && <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', fontWeight:'800', color:'#1e293b' }}>${Math.round(r.total).toLocaleString()}</td>}
                                      </tr>
                                    ))}
                                    <tr style={{ borderTop:'2px solid #1e293b', fontWeight:'800', background:'#f8fafc' }}>
                                      <td style={{ padding:'0.5rem 0.75rem', color:'#1e293b' }}>Total</td>
                                      <td/>
                                      <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#10b981' }}>${totals.rev.toLocaleString()}</td>
                                      <td/><td/>
                                      <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#059669' }}>${Math.round(totals.commission).toLocaleString()}</td>
                                      {hasSpiffs && <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#7c3aed' }}>${Math.round(totals.spiff).toLocaleString()}</td>}
                                      {hasSpiffs && <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#059669' }}>${Math.round(totals.total).toLocaleString()}</td>}
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

                          {/* Activity Summary — NEW */}
                          {(() => {
                            const now = new Date();
                            const periods = ['Last 7 Days','Last 30 Days','Last 90 Days','All Time'];
                            const periodDays = { 'Last 7 Days':7, 'Last 30 Days':30, 'Last 90 Days':90, 'All Time': Infinity };
                            const days = periodDays[actPeriod];
                            const cutoff = days === Infinity ? new Date(0) : new Date(now - days*86400000);
                            const filtActs = reportsTimedActivities.filter(a => new Date(a.date||a.createdAt||0) >= cutoff);
                            const byType = filtActs.reduce((acc,a)=>{ const t=a.type||'Other'; acc[t]=(acc[t]||0)+1; return acc; },{});
                            const typeRows = Object.entries(byType).sort((a,b)=>b[1]-a[1]);
                            const maxTypeCount = Math.max(...typeRows.map(([,c])=>c),1);
                            const byRep = filtActs.reduce((acc,a)=>{ const r=a.rep||a.salesRep||a.assignedTo||a.author||'Unknown'; if(!acc[r])acc[r]={count:0,lastDate:null,thisWeek:0}; acc[r].count++; const d=new Date(a.date||a.createdAt||0); if(!acc[r].lastDate||d>acc[r].lastDate)acc[r].lastDate=d; const weekAgo=new Date(now-7*86400000); if(d>=weekAgo)acc[r].thisWeek++; return acc; },{});
                            const repActRows = Object.entries(byRep).sort((a,b)=>b[1].count-a[1].count);
                            return (
                            <div style={cardStyle}>
                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem', flexWrap:'wrap', gap:'0.5rem' }}>
                                <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#1e293b' }}>📞 Activity Summary</div>
                                <div style={{ display:'flex', gap:'0.25rem' }}>
                                  {periods.map(p=>(
                                    <button key={p} onClick={()=>setActPeriod(p)} style={{ padding:'0.2rem 0.625rem', borderRadius:'999px', border:'none', cursor:'pointer', fontSize:'0.6875rem', fontWeight:'700', fontFamily:'inherit', background:actPeriod===p?'#2563eb':'#e2e8f0', color:actPeriod===p?'#fff':'#64748b' }}>{p}</button>
                                  ))}
                                </div>
                              </div>
                              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(90px,1fr))', gap:'0.75rem', marginBottom:'1.25rem' }}>
                                {[
                                  { label:'Total Activities', value: filtActs.length },
                                  { label:'Unique Types',     value: typeRows.length },
                                  { label:'Active Reps',      value: repActRows.length },
                                  { label:'Avg / Rep',        value: repActRows.length > 0 ? Math.round(filtActs.length/repActRows.length) : 0 },
                                ].map(k=>(
                                  <div key={k.label} style={{ background:'#f8fafc', borderRadius:'8px', padding:'0.625rem 0.875rem', border:'1px solid #e2e8f0' }}>
                                    <div style={labelStyle}>{k.label}</div>
                                    <div style={{ fontSize:'1.5rem', fontWeight:'800', color:'#1e293b' }}>{k.value}</div>
                                  </div>
                                ))}
                              </div>
                              <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:'1.25rem' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                                <div>
                                  <div style={labelStyle}>By Activity Type</div>
                                  {typeRows.length === 0 ? <div style={{ color:'#94a3b8', fontSize:'0.8125rem', marginTop:'0.5rem' }}>No activities logged yet.</div> :
                                    typeRows.map(([type,cnt])=>(
                                      <div key={type} style={{ marginBottom:'0.5rem' }}>
                                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.2rem' }}>
                                          <span style={{ fontSize:'0.75rem', color:'#475569' }}>{type}</span>
                                          <span style={{ fontSize:'0.75rem', fontWeight:'700', color:'#1e293b' }}>{cnt}</span>
                                        </div>
                                        <div style={{ height:'5px', background:'#f1f5f9', borderRadius:'3px', overflow:'hidden' }}>
                                          <div style={{ height:'100%', width:(cnt/maxTypeCount*100)+'%', background:'linear-gradient(to right,#2563eb,#7c3aed)', borderRadius:'3px' }}/>
                                        </div>
                                      </div>
                                    ))
                                  }
                                </div>
                                <div style={{ gridColumn: 'span 2' }}>
                                  {/* placeholder to keep By Activity Type left-aligned */}
                                </div>
                                </div>{/* end inner 2-col grid */}
                                <div>
                                  <div style={labelStyle}>Rep Activity Summary</div>
                                  {repActRows.length === 0 ? <div style={{ color:'#94a3b8', fontSize:'0.8125rem', marginTop:'0.5rem' }}>No activities logged yet.</div> : (
                                    <div style={{ overflowX: 'auto', marginTop: '0.5rem' }}>
                                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                                        <thead><tr>
                                          {['Rep', 'Total', 'This Week', 'Last Activity', 'Status'].map(h => (
                                            <th key={h} style={{ padding: '0.4rem 0.75rem', textAlign: h === 'Rep' ? 'left' : 'right', fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                                          ))}
                                        </tr></thead>
                                        <tbody>
                                          {repActRows.map(([rep, {count, lastDate, thisWeek}], i) => {
                                            const daysSince = lastDate ? Math.floor((now - lastDate) / 86400000) : null;
                                            const statusColor = daysSince === null ? '#94a3b8' : daysSince <= 3 ? '#10b981' : daysSince <= 7 ? '#f59e0b' : '#ef4444';
                                            const statusLabel = daysSince === null ? '—' : daysSince === 0 ? 'Today' : daysSince === 1 ? 'Yesterday' : daysSince <= 7 ? `${daysSince}d ago` : daysSince <= 30 ? `${daysSince}d ago` : '30d+ ago';
                                            const statusDot = daysSince === null ? '○' : daysSince <= 3 ? '●' : daysSince <= 7 ? '●' : '⚠';
                                            return (
                                              <tr key={rep} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '0.5rem 0.75rem', fontWeight: '600', color: '#1e293b', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rep}</td>
                                                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: '#475569', fontWeight: '600' }}>{count}</td>
                                                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: thisWeek > 0 ? '#2563eb' : '#94a3b8', fontWeight: thisWeek > 0 ? '700' : '400' }}>{thisWeek}</td>
                                                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: '#475569', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                                                  {lastDate ? lastDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                                                </td>
                                                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                  <span style={{ color: statusColor, fontSize: '0.75rem', fontWeight: '700' }}>{statusDot} {statusLabel}</span>
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              </div>{/* end outer grid */}
                            </div>
                            );
                          })()}

                          {/* Task Completion Rate — NEW */}
                          {(() => {
                            const allTasks = tasks || [];
                            const getStatus = t => t.status || (t.completed ? 'Completed' : 'Open');
                            const today = new Date(); today.setHours(0,0,0,0);
                            const completed = allTasks.filter(t => getStatus(t) === 'Completed');
                            const open      = allTasks.filter(t => getStatus(t) === 'Open' || getStatus(t) === 'In-Process');
                            const overdue   = allTasks.filter(t => (getStatus(t)==='Open'||getStatus(t)==='In-Process') && t.dueDate && new Date(t.dueDate + 'T12:00:00') < today);
                            const compRate  = allTasks.length > 0 ? (completed.length/allTasks.length*100) : 0;
                            const repTaskMap = allTasks.reduce((acc,t)=>{ const r=t.assignedTo||'Unassigned'; if(!acc[r])acc[r]={total:0,done:0,overdue:0}; acc[r].total++; if(getStatus(t)==='Completed')acc[r].done++; if((getStatus(t)==='Open'||getStatus(t)==='In-Process')&&t.dueDate&&new Date(t.dueDate + 'T12:00:00')<today)acc[r].overdue++; return acc; },{});
                            const repTaskRows = Object.entries(repTaskMap).sort((a,b)=>b[1].total-a[1].total);
                            return (
                            <div style={cardStyle}>
                              <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#1e293b', marginBottom:'1rem' }}>✔️ Task Completion Rate</div>
                              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(90px,1fr))', gap:'0.75rem', marginBottom:'1.25rem' }}>
                                {[
                                  { label:'Total Tasks',    value: allTasks.length,   color:'#1e293b' },
                                  { label:'Completed',      value: completed.length,   color:'#10b981' },
                                  { label:'Open / Active',  value: open.length,        color:'#2563eb' },
                                  { label:'Overdue',        value: overdue.length,     color:'#ef4444' },
                                  { label:'Completion Rate',value: compRate.toFixed(0)+'%', color: compRate>=75?'#10b981':compRate>=50?'#f59e0b':'#ef4444' },
                                ].map(k=>(
                                  <div key={k.label} style={{ background:'#f8fafc', borderRadius:'8px', padding:'0.625rem 0.875rem', border:'1px solid #e2e8f0' }}>
                                    <div style={labelStyle}>{k.label}</div>
                                    <div style={{ fontSize:'1.375rem', fontWeight:'800', color:k.color }}>{k.value}</div>
                                  </div>
                                ))}
                              </div>
                              {repTaskRows.length >= 2 && (
                              <div style={{ overflowX:'auto' }}>
                                <div style={labelStyle}>By Rep</div>
                                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
<table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem', marginTop:'0.5rem' }}>
                                  <thead><tr>
                                    {['Rep','Total','Completed','Overdue','Completion %'].map(h=>(
                                      <th key={h} style={{ padding:'0.4rem 0.75rem', textAlign:h==='Rep'?'left':'right', fontSize:'0.6875rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap' }}>{h}</th>
                                    ))}
                                  </tr></thead>
                                  <tbody>
                                    {repTaskRows.map(([rep,{total,done,overdue}],i)=>{
                                      const pct = total > 0 ? done/total*100 : 0;
                                      return (
                                      <tr key={rep} style={{ background:i%2===0?'#fff':'#f8fafc' }}>
                                        <td style={{ padding:'0.5rem 0.75rem', fontWeight:'600', color:'#1e293b' }}>{rep}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#475569' }}>{total}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#10b981', fontWeight:'600' }}>{done}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color: overdue>0?'#ef4444':'#94a3b8', fontWeight: overdue>0?'700':'400' }}>{overdue}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', fontWeight:'700', color:pct>=75?'#10b981':pct>=50?'#f59e0b':'#ef4444' }}>{pct.toFixed(0)}%</td>
                                      </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
</div>
                              </div>
                              )}
                            </div>
                            );
                          })()}

                          {/* Recent Activity Log — NEW */}
                          {(() => {
                            const recentActs = [...(activities||[])].sort((a,b)=>new Date(b.date||b.createdAt||0)-new Date(a.date||a.createdAt||0)).slice(0,30);
                            const typeIcons = { Call:'📞', Email:'📧', Meeting:'🤝', Demo:'💻', 'Follow-up':'🔔', Note:'📝' };
                            return (
                            <div style={cardStyle}>
                              <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#1e293b', marginBottom:'0.875rem' }}>🕐 Recent Activity Log <span style={{ fontSize:'0.75rem', fontWeight:'400', color:'#94a3b8' }}>(last 30)</span></div>
                              {recentActs.length === 0 ? <div style={{ color:'#94a3b8', fontSize:'0.8125rem' }}>No activities logged yet.</div> : (
                              <div style={{ overflowX:'auto' }}>
                                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem' }}>
                                  <thead><tr>
                                    {['Date','Type','Subject','Account','Rep','Duration'].map(h=>(
                                      <th key={h} style={{ padding:'0.4rem 0.75rem', textAlign:'left', fontSize:'0.6875rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap' }}>{h}</th>
                                    ))}
                                  </tr></thead>
                                  <tbody>
                                    {recentActs.map((a,i)=>(
                                      <tr key={a.id||i} style={{ background:i%2===0?'#fff':'#f8fafc' }}>
                                        <td style={{ padding:'0.5rem 0.75rem', color:'#64748b', whiteSpace:'nowrap' }}>{a.date ? new Date(a.date + 'T12:00:00').toLocaleDateString() : '—'}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', whiteSpace:'nowrap' }}><span>{typeIcons[a.type]||'📋'} {a.type||'—'}</span></td>
                                        <td style={{ padding:'0.5rem 0.75rem', color:'#1e293b', maxWidth:'200px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.subject||a.title||'—'}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', color:'#475569', maxWidth:'150px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.account||'—'}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', color:'#475569', whiteSpace:'nowrap' }}>{a.rep||a.salesRep||'—'}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', color:'#94a3b8', whiteSpace:'nowrap' }}>{a.duration ? a.duration+'m' : '—'}</td>
                                      </tr>
                                    ))}
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
                             TAB: LEADS
                            ════════════════════════════════════════════ */}
                        {reportSubTab === 'leads' && leadsEnabled && (() => {
                            const stageColors = { 'New':'#94a3b8','Contacted':'#0ea5e9','Qualified':'#8b5cf6','Working':'#f59e0b','Converted':'#10b981','Dead':'#ef4444' };
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
                                { label:'Cold (0-39)',  min:0,  max:39,  color:'#3b82f6' },
                                { label:'Warm (40-69)', min:40, max:69,  color:'#f59e0b' },
                                { label:'Hot (70-100)', min:70, max:100, color:'#ef4444' },
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

                            const cardStyle = { background:'#fff', border:'1px solid #e2e8f0', borderRadius:'12px', overflow:'hidden' };
                            const labelStyle = { fontSize:'0.6rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'0.25rem' };

                            return (
                            <div style={{ display:'flex', flexDirection:'column', gap:'1rem', padding:'1rem 1.25rem 1.5rem' }}>

                                {/* KPI Strip */}
                                <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'0.75rem' }}>
                                    {[
                                        { label:'Total Leads',    value: allLeads.length,                         sub: openLeads.length+' open',            accent:'#2563eb', vcolor:'#1e293b' },
                                        { label:'🔥 Hot Leads',   value: hotLeads.length,                         sub: 'score ≥ 70',                         accent:'#dc2626', vcolor:'#dc2626' },
                                        { label:'Converted',      value: convertedLeads.length,                   sub: convRate.toFixed(1)+'% rate',         accent:'#10b981', vcolor:'#10b981' },
                                        { label:'Est. Pipeline',  value: '$'+(totalEstARR>=1000000?((totalEstARR/1000000).toFixed(1)+'M'):(totalEstARR>=1000?(Math.round(totalEstARR/1000)+'K'):totalEstARR)), sub:'from open leads', accent:'#7c3aed', vcolor:'#7c3aed' },
                                        { label:'Avg Score',      value: avgScore,                                sub: hotLeads.length+' hot · '+allLeads.filter(l=>(l.score||0)>=40&&(l.score||0)<70).length+' warm', accent:'#f59e0b', vcolor:'#f59e0b' },
                                    ].map(k => (
                                        <div key={k.label} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'0.875rem 1rem', borderLeft:'3px solid '+k.accent }}>
                                            <div style={labelStyle}>{k.label}</div>
                                            <div style={{ fontSize:'1.625rem', fontWeight:'800', color:k.vcolor, lineHeight:1 }}>{k.value}</div>
                                            <div style={{ fontSize:'0.6875rem', color:'#94a3b8', marginTop:'0.25rem' }}>{k.sub}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Row 2: Funnel + Source */}
                                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>

                                    {/* Lead Funnel */}
                                    <div style={cardStyle}>
                                        <div style={{ padding:'0.75rem 1rem', borderBottom:'1px solid #e2e8f0' }}>
                                            <span style={{ fontSize:'0.75rem', fontWeight:'800', color:'#0f172a', textTransform:'uppercase', letterSpacing:'0.05em' }}>🔽 Lead Funnel</span>
                                        </div>
                                        <div style={{ padding:'1rem' }}>
                                            {Object.entries(stageColors).map(([stage, color]) => {
                                                const count = allLeads.filter(l => (l.status||'New') === stage).length;
                                                const pct = allLeads.length > 0 ? Math.round(count/allLeads.length*100) : 0;
                                                return (
                                                    <div key={stage} style={{ display:'flex', alignItems:'center', gap:'0.625rem', marginBottom:'0.5rem' }}>
                                                        <span style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#475569', width:'72px', flexShrink:0 }}>{stage}</span>
                                                        <div style={{ flex:1, background:'#f8fafc', borderRadius:'5px', overflow:'hidden', height:'28px' }}>
                                                            <div style={{ height:'100%', width:Math.max(pct,count>0?8:0)+'%', background:color, borderRadius:'5px', display:'flex', alignItems:'center', paddingLeft:'0.5rem', transition:'width 0.5s ease' }}>
                                                                {count > 0 && <span style={{ fontSize:'0.625rem', fontWeight:'800', color:'#fff' }}>{count}</span>}
                                                            </div>
                                                        </div>
                                                        <span style={{ fontSize:'0.6875rem', color:'#94a3b8', width:'28px', textAlign:'right', flexShrink:0 }}>{pct}%</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Source Breakdown */}
                                    <div style={cardStyle}>
                                        <div style={{ padding:'0.75rem 1rem', borderBottom:'1px solid #e2e8f0' }}>
                                            <span style={{ fontSize:'0.75rem', fontWeight:'800', color:'#0f172a', textTransform:'uppercase', letterSpacing:'0.05em' }}>📡 By Source</span>
                                        </div>
                                        <div style={{ padding:'1rem' }}>
                                            {sourceData.length === 0
                                                ? <div style={{ color:'#94a3b8', fontSize:'0.8125rem', textAlign:'center', padding:'1rem' }}>No leads yet.</div>
                                                : sourceData.map(([src, cnt], idx) => {
                                                    const colors = ['#2563eb','#7c3aed','#0ea5e9','#10b981','#f59e0b','#ef4444','#ec4899'];
                                                    return (
                                                        <div key={src} style={{ display:'flex', alignItems:'center', gap:'0.625rem', marginBottom:'0.625rem' }}>
                                                            <span style={{ fontSize:'0.75rem', color:'#475569', width:'90px', flexShrink:0, fontWeight:'600', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{src}</span>
                                                            <div style={{ flex:1, height:'6px', background:'#f1f5f9', borderRadius:'3px', overflow:'hidden' }}>
                                                                <div style={{ height:'100%', width:Math.round(cnt/maxSource*100)+'%', background:colors[idx%colors.length], borderRadius:'3px', transition:'width 0.5s ease' }}></div>
                                                            </div>
                                                            <span style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#1e293b', width:'20px', textAlign:'right', flexShrink:0 }}>{cnt}</span>
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
                                        <div style={{ padding:'0.75rem 1rem', borderBottom:'1px solid #e2e8f0' }}>
                                            <span style={{ fontSize:'0.75rem', fontWeight:'800', color:'#0f172a', textTransform:'uppercase', letterSpacing:'0.05em' }}>👤 Rep Lead Performance</span>
                                        </div>
                                        <div style={{ overflowX:'auto' }}>
                                            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem' }}>
                                                <thead><tr>
                                                    {['Rep','Assigned','Converted','Rate','Est. ARR'].map(h => (
                                                        <th key={h} style={{ padding:'0.5rem 0.75rem', background:'#f8fafc', borderBottom:'1px solid #e2e8f0', fontSize:'0.6rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em', textAlign:['Assigned','Converted','Rate','Est. ARR'].includes(h)?'right':'left', whiteSpace:'nowrap' }}>{h}</th>
                                                    ))}
                                                </tr></thead>
                                                <tbody>
                                                    {repRows.length === 0
                                                        ? <tr><td colSpan={5} style={{ textAlign:'center', padding:'1rem', color:'#94a3b8', fontSize:'0.8125rem' }}>No leads yet.</td></tr>
                                                        : repRows.map((r,i) => (
                                                            <tr key={r.rep} style={{ background: i%2===0?'#fff':'#f8fafc' }}>
                                                                <td style={{ padding:'0.5rem 0.75rem', borderBottom:'1px solid #f1f5f9', fontWeight:'600', color: r.rep==='Unassigned'?'#ef4444':'#1e293b' }}>{r.rep}</td>
                                                                <td style={{ padding:'0.5rem 0.75rem', borderBottom:'1px solid #f1f5f9', textAlign:'right', color:'#475569' }}>{r.assigned}</td>
                                                                <td style={{ padding:'0.5rem 0.75rem', borderBottom:'1px solid #f1f5f9', textAlign:'right', color:'#10b981', fontWeight:'700' }}>{r.converted}</td>
                                                                <td style={{ padding:'0.5rem 0.75rem', borderBottom:'1px solid #f1f5f9', textAlign:'right', fontWeight:'700', color: r.rate>=25?'#10b981':r.rate>=15?'#f59e0b':'#ef4444' }}>{r.rep==='Unassigned'?'—':r.rate.toFixed(0)+'%'}</td>
                                                                <td style={{ padding:'0.5rem 0.75rem', borderBottom:'1px solid #f1f5f9', textAlign:'right', fontWeight:'700', color:'#2563eb' }}>{r.estARR>0?'$'+(r.estARR>=1000000?((r.estARR/1000000).toFixed(1)+'M'):(r.estARR>=1000?(Math.round(r.estARR/1000)+'K'):r.estARR)):'—'}</td>
                                                            </tr>
                                                        ))
                                                    }
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Score Distribution */}
                                    <div style={cardStyle}>
                                        <div style={{ padding:'0.75rem 1rem', borderBottom:'1px solid #e2e8f0' }}>
                                            <span style={{ fontSize:'0.75rem', fontWeight:'800', color:'#0f172a', textTransform:'uppercase', letterSpacing:'0.05em' }}>📊 Score Distribution</span>
                                        </div>
                                        <div style={{ padding:'1.25rem' }}>
                                            {scoreBuckets.map(b => (
                                                <div key={b.label} style={{ marginBottom:'0.875rem' }}>
                                                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.3rem' }}>
                                                        <span style={{ fontSize:'0.75rem', fontWeight:'600', color:'#475569' }}>{b.label}</span>
                                                        <span style={{ fontSize:'0.75rem', fontWeight:'800', color:'#1e293b' }}>{b.count} leads</span>
                                                    </div>
                                                    <div style={{ height:'8px', background:'#f1f5f9', borderRadius:'4px', overflow:'hidden' }}>
                                                        <div style={{ height:'100%', width: allLeads.length>0?Math.round(b.count/allLeads.length*100)+'%':'0%', background:b.color, borderRadius:'4px', transition:'width 0.5s ease' }}></div>
                                                    </div>
                                                </div>
                                            ))}
                                            <div style={{ marginTop:'1rem', padding:'0.75rem', background:'#f8fafc', borderRadius:'8px', border:'1px solid #e2e8f0', display:'flex', justifyContent:'space-around', textAlign:'center' }}>
                                                <div>
                                                    <div style={{ fontSize:'0.6rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'0.2rem' }}>Avg Score</div>
                                                    <div style={{ fontSize:'1.25rem', fontWeight:'800', color: avgScore>=70?'#dc2626':avgScore>=40?'#f59e0b':'#3b82f6' }}>{avgScore}</div>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize:'0.6rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'0.2rem' }}>Hot %</div>
                                                    <div style={{ fontSize:'1.25rem', fontWeight:'800', color:'#dc2626' }}>{allLeads.length>0?Math.round(hotLeads.length/allLeads.length*100):0}%</div>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize:'0.6rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'0.2rem' }}>Unassigned</div>
                                                    <div style={{ fontSize:'1.25rem', fontWeight:'800', color:'#ef4444' }}>{allLeads.filter(l=>!l.assignedTo).length}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Row 4: Monthly Trend */}
                                <div style={cardStyle}>
                                    <div style={{ padding:'0.75rem 1rem', borderBottom:'1px solid #e2e8f0' }}>
                                        <span style={{ fontSize:'0.75rem', fontWeight:'800', color:'#0f172a', textTransform:'uppercase', letterSpacing:'0.05em' }}>📅 Lead Trend — Last 6 Months</span>
                                    </div>
                                    <div style={{ padding:'1.25rem' }}>
                                        {allLeads.length === 0
                                            ? <div style={{ textAlign:'center', color:'#94a3b8', fontSize:'0.8125rem', padding:'1rem' }}>No leads yet.</div>
                                            : (
                                            <div>
                                                <div style={{ display:'flex', gap:'0.75rem', alignItems:'flex-end', height:'80px', marginBottom:'0.5rem' }}>
                                                    {monthlyTrend.map((m,i) => (
                                                        <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'3px', height:'100%', justifyContent:'flex-end' }}>
                                                            {m.created > 0 && <div style={{ fontSize:'0.5625rem', fontWeight:'700', color:'#475569' }}>{m.created}</div>}
                                                            <div style={{ width:'100%', display:'flex', alignItems:'flex-end', gap:'2px', height:Math.max(Math.round(m.created/maxTrend*70),2)+'px' }}>
                                                                <div style={{ flex:1, height:'100%', background:'linear-gradient(to top,#2563eb,#7c3aed)', borderRadius:'3px 3px 0 0', opacity:0.85 }}></div>
                                                                {m.converted > 0 && <div style={{ flex:1, height:Math.max(Math.round(m.converted/maxTrend*70),4)+'px', background:'#10b981', borderRadius:'3px 3px 0 0' }}></div>}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div style={{ display:'flex', gap:'0.75rem', borderTop:'1px solid #f1f5f9', paddingTop:'0.375rem' }}>
                                                    {monthlyTrend.map((m,i) => (
                                                        <div key={i} style={{ flex:1, textAlign:'center', fontSize:'0.6rem', color:'#94a3b8', fontWeight:'600' }}>{m.label}</div>
                                                    ))}
                                                </div>
                                                <div style={{ display:'flex', gap:'1.25rem', justifyContent:'center', marginTop:'0.75rem' }}>
                                                    <span style={{ fontSize:'0.6875rem', color:'#64748b', display:'flex', alignItems:'center', gap:'0.375rem' }}><span style={{ width:'10px', height:'10px', background:'linear-gradient(#2563eb,#7c3aed)', borderRadius:'2px', display:'inline-block' }}></span>Created</span>
                                                    <span style={{ fontSize:'0.6875rem', color:'#64748b', display:'flex', alignItems:'center', gap:'0.375rem' }}><span style={{ width:'10px', height:'10px', background:'#10b981', borderRadius:'2px', display:'inline-block' }}></span>Converted</span>
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
        resolved: { bg: '#EAF3DE', text: '#27500A', label: 'Resolved' },
        ignored:  { bg: '#FAEEDA', text: '#633806', label: 'Ignored' },
        pending:  { bg: '#E6F1FB', text: '#0C447C', label: 'Pending' },
    };
    const fmtCurrency = (v) => v >= 1000000 ? '$' + (v/1000000).toFixed(1) + 'M' : v >= 1000 ? '$' + Math.round(v/1000) + 'K' : '$' + Math.round(v||0).toLocaleString();
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

    return (
        <div style={{ padding: '1.5rem' }}>
            {/* Controls */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                {canSeeAll && (
                    <select value={selectedRep} onChange={e => setSelectedRep(e.target.value)}
                        style={{ fontSize: '0.8125rem', padding: '0.375rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontFamily: 'inherit', color: '#1e293b' }}>
                        <option value="">All reps</option>
                        {allReps.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                )}
                <select value={days} onChange={e => setDays(Number(e.target.value))}
                    style={{ fontSize: '0.8125rem', padding: '0.375rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontFamily: 'inherit', color: '#1e293b' }}>
                    <option value={7}>Last 7 days</option>
                    <option value={30}>Last 30 days</option>
                    <option value={60}>Last 60 days</option>
                    <option value={90}>Last 90 days</option>
                </select>
                <button onClick={fetchData} style={{ fontSize: '0.8125rem', padding: '0.375rem 0.875rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#f8fafc', color: '#1e293b', cursor: 'pointer', fontFamily: 'inherit' }}>Refresh</button>
            </div>

            {loading && <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8', fontSize: '0.875rem' }}>Loading…</div>}
            {error && <div style={{ textAlign: 'center', padding: '2rem', color: '#ef4444', fontSize: '0.875rem' }}>Failed to load: {error}</div>}

            {!loading && !error && data && (
                <>
                {/* Summary cards */}
                {data.summary && data.summary.total > 0 ? (
                    <>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '10px', marginBottom: '1.5rem' }}>
                        {[
                            { val: data.summary.total, lbl: 'Total actions', color: '#1e293b' },
                            { val: data.summary.resolveRate != null ? data.summary.resolveRate + '%' : '—', lbl: 'Resolution rate', color: data.summary.resolveRate >= 60 ? '#27500A' : data.summary.resolveRate >= 35 ? '#854F0B' : '#A32D2D' },
                            { val: data.summary.resolved, lbl: 'Resolved', color: '#27500A' },
                            { val: data.summary.avgDays != null ? data.summary.avgDays + 'd' : '—', lbl: 'Avg days to resolve', color: '#185FA5' },
                        ].map(({ val, lbl, color }) => (
                            <div key={lbl} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px' }}>
                                <div style={{ fontSize: '1.375rem', fontWeight: '700', color }}>{val}</div>
                                <div style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '2px' }}>{lbl}</div>
                            </div>
                        ))}
                    </div>

                    {/* By type breakdown */}
                    {Object.keys(data.summary.byType || {}).length > 0 && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>Effectiveness by action type</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
                                {Object.entries(data.summary.byType).map(([type, stats]) => {
                                    const rate = stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0;
                                    return (
                                        <div key={type} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px' }}>
                                            <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b', marginBottom: '6px' }}>{actionTypeLabels[type] || type}</div>
                                            <div style={{ height: '4px', background: '#f1f5f9', borderRadius: '2px', marginBottom: '6px' }}>
                                                <div style={{ height: '100%', width: rate + '%', background: rate >= 60 ? '#639922' : rate >= 35 ? '#BA7517' : '#E24B4A', borderRadius: '2px' }} />
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: '#64748b' }}>
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
                    <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>Action history</div>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    {['Date', 'Rep', 'Type', 'Deal', 'ARR', 'Signal', 'Outcome', 'Days'].map(h => (
                                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '0.6875rem', fontWeight: '700', color: '#64748b', whiteSpace: 'nowrap' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.logs.map((log, i) => {
                                    const oc = outcomeColors[log.outcome] || outcomeColors.pending;
                                    return (
                                        <tr key={log.id} style={{ borderBottom: i < data.logs.length-1 ? '1px solid #f1f5f9' : 'none', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                            <td style={{ padding: '8px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>{fmtDate(log.dismissedAt)}</td>
                                            <td style={{ padding: '8px 12px', color: '#1e293b', whiteSpace: 'nowrap' }}>{log.repName}</td>
                                            <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                                                <span style={{ background: '#f1f5f9', color: '#475569', fontSize: '0.6875rem', padding: '2px 8px', borderRadius: '4px', fontWeight: '600' }}>
                                                    {actionTypeLabels[log.actionType] || log.actionType}
                                                </span>
                                            </td>
                                            <td style={{ padding: '8px 12px', color: '#1e293b', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.dealName || '—'}</td>
                                            <td style={{ padding: '8px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>{log.arrAtRisk ? fmtCurrency(log.arrAtRisk) : '—'}</td>
                                            <td style={{ padding: '8px 12px', color: '#64748b', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.signal}>{log.signal || '—'}</td>
                                            <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                                                <span style={{ background: oc.bg, color: oc.text, fontSize: '0.6875rem', padding: '2px 8px', borderRadius: '999px', fontWeight: '600' }}>{oc.label}</span>
                                            </td>
                                            <td style={{ padding: '8px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>{log.daysToResolve != null ? log.daysToResolve + 'd' : '—'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
</div>
                    </div>
                    </>
                ) : (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8', fontSize: '0.875rem', border: '1px dashed #e2e8f0', borderRadius: '8px' }}>
                        No actions logged yet. Actions are recorded when you dismiss recommendations on the home screen, or when pipeline-alerts sends automated alerts.
                    </div>
                )}
                </>
            )}
        </div>
    );
}
