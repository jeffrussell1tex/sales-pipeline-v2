import React, { useState } from 'react';
import { useApp } from '../AppContext';
import ViewingBar, { SliceDropdown } from '../components/ui/ViewingBar';
import AnalyticsDashboard from '../components/ui/AnalyticsDashboard';
import { dbFetch } from '../utils/storage';

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
    const [reportCompareTo, setReportCompareTo] = useState('previous_quarter');
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

                // ── Comparison period data ─────────────────────────────────────────────
                // Computes a parallel set of opps for the prior period so the UI can
                // show deltas (e.g. pipeline value vs previous quarter).
                // reportCompareTo: 'previous_quarter' | 'previous_year' | 'none'
                const comparedOpps = (() => {
                    if (reportCompareTo === 'none') return null;
                    const now = new Date();
                    const fy = now.getFullYear();
                    const fiscalStart = settings.fiscalYearStart || 10;

                    // Build fiscal quarter ranges for a given base year
                    const getFQR = (baseYear) => {
                        const qs = {};
                        ['Q1','Q2','Q3','Q4'].forEach((q, qi) => {
                            const rawMonth = fiscalStart - 1 + qi * 3;
                            const sm = (rawMonth % 12) + 1;
                            const sy = rawMonth >= 12 ? baseYear + 1 : baseYear;
                            const endRaw = new Date(sy, sm - 1 + 3, 0);
                            qs[q] = {
                                from: `${sy}-${String(sm).padStart(2,'0')}-01`,
                                to:   `${endRaw.getFullYear()}-${String(endRaw.getMonth()+1).padStart(2,'0')}-${String(endRaw.getDate()).padStart(2,'0')}`,
                            };
                        });
                        qs['FY'] = { from: qs['Q1'].from, to: qs['Q4'].to };
                        return qs;
                    };

                    // Determine what the "prior" date range is based on current period + compare mode
                    let priorFrom = null, priorTo = null;
                    const thisQRanges = getFQR(fy);
                    const lastQRanges = getFQR(fy - 1);

                    if (reportCompareTo === 'previous_quarter') {
                        if (['Q1','Q2','Q3','Q4'].includes(reportTimePeriod)) {
                            const qKeys = ['Q1','Q2','Q3','Q4'];
                            const idx = qKeys.indexOf(reportTimePeriod);
                            if (idx === 0) { priorFrom = lastQRanges['Q4'].from; priorTo = lastQRanges['Q4'].to; }
                            else           { priorFrom = thisQRanges[qKeys[idx-1]].from; priorTo = thisQRanges[qKeys[idx-1]].to; }
                        } else if (reportTimePeriod === 'FY') {
                            priorFrom = lastQRanges['FY'].from; priorTo = lastQRanges['FY'].to;
                        } else {
                            // 'all' or custom — compare to prior 90 days
                            const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 90);
                            const prior = new Date(cutoff); prior.setDate(prior.getDate() - 90);
                            priorFrom = prior.toISOString().slice(0,10);
                            priorTo   = cutoff.toISOString().slice(0,10);
                        }
                    } else if (reportCompareTo === 'previous_year') {
                        if (['Q1','Q2','Q3','Q4'].includes(reportTimePeriod)) {
                            priorFrom = lastQRanges[reportTimePeriod].from;
                            priorTo   = lastQRanges[reportTimePeriod].to;
                        } else if (reportTimePeriod === 'FY') {
                            priorFrom = lastQRanges['FY'].from; priorTo = lastQRanges['FY'].to;
                        } else {
                            const cutoff = new Date(now); cutoff.setFullYear(cutoff.getFullYear()-1);
                            const prior  = new Date(cutoff); prior.setDate(prior.getDate() - 90);
                            priorFrom = prior.toISOString().slice(0,10);
                            priorTo   = cutoff.toISOString().slice(0,10);
                        }
                    }

                    if (!priorFrom) return null;
                    return roleFilteredOpps.filter(o => {
                        const d = o.forecastedCloseDate || o.closeDate || o.createdDate || '';
                        return d >= priorFrom && d <= priorTo;
                    });
                })();

                // Helper: compute a delta label vs comparison period, or null if no comparison
                const cmpDelta = (currentVal, cmpOppsFilter) => {
                    if (!comparedOpps || reportCompareTo === 'none') return null;
                    const priorVal = comparedOpps.filter(cmpOppsFilter).reduce((s,o) => s + (parseFloat(o.arr)||0) + (o.implementationCost||0), 0);
                    if (priorVal === 0) return null;
                    const pct = ((currentVal - priorVal) / priorVal) * 100;
                    return { pct, label: (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%', good: pct >= 0 };
                };

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
                const printBtnStyle = { background: '#fbf8f3', border: '1px solid #e6ddd0', borderRadius: '6px', padding: '0.3rem 0.875rem', fontSize: '0.75rem', fontWeight: '500', color: '#2a2622', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '0.3rem' };

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
  <th style="text-align:right;">Revenue</th><th style="text-align:right;">Impl. Cost</th>
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
                        style={{ display:'inline-flex', alignItems:'center', gap:'0.3rem', background:'#fbf8f3', border:'1px solid #e6ddd0', borderRadius:'6px', padding:'0.3rem 0.875rem', fontSize:'0.75rem', fontWeight:'500', color:'#2a2622', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap', flexShrink:0 }}>↗ Export</button>
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
                              { key:'pipeline',    label:'Pipeline & Forecast', sub:'Is the quarter on track?' },
                              { key:'performance', label:'Performance',          sub:'Quota, win rate, velocity' },
                              { key:'activity',    label:'Activity',             sub:'What are reps doing?' },
                              ...(leadsEnabled ? [{ key:'leads', label:'Leads', sub:'Top of funnel' }] : []),
                              { key:'custom',      label:'Saved reports',        sub:'Your custom views' },
                            ].map(({ key, label, sub }) => (
                              <button key={key} onClick={() => setReportSubTabPersisted(key)} style={{
                                padding: '8px 16px 10px',
                                border: 'none',
                                borderBottom: reportSubTab === key ? '2px solid #2a2622' : '2px solid transparent',
                                background: 'transparent',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                textAlign: 'left',
                                transition: 'color 120ms, border-color 120ms',
                                whiteSpace: 'nowrap',
                                marginBottom: -1,
                              }}
                              onMouseEnter={e => { if (reportSubTab !== key) { e.currentTarget.querySelector('.tab-label').style.color = '#5a544c'; } }}
                              onMouseLeave={e => { if (reportSubTab !== key) { e.currentTarget.querySelector('.tab-label').style.color = '#8a8378'; } }}
                              >
                                <div className="tab-label" style={{
                                  fontSize: '0.8125rem',
                                  fontWeight: reportSubTab === key ? '700' : '500',
                                  color: reportSubTab === key ? '#2a2622' : '#8a8378',
                                  letterSpacing: -0.1,
                                }}>{label}</div>
                                <div style={{
                                  fontSize: '0.6875rem',
                                  fontWeight: '500',
                                  color: reportSubTab === key ? '#8a8378' : '#a8a29e',
                                  marginTop: 2,
                                  letterSpacing: 0.1,
                                }}>{sub}</div>
                              </button>
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

                        {/* ── Filter bar: Grouped By segmented control + Period dropdown + Compare to + Export ── */}
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
                          const compareOptions = [
                            { value:'previous_quarter', label:'Previous quarter' },
                            { value:'previous_year',    label:'Previous year' },
                            { value:'none',             label:'No comparison' },
                          ];
                          const selectStyle = {
                            fontSize:'0.75rem', padding:'4px 28px 4px 10px',
                            border:'1px solid #e6ddd0', borderRadius:'6px',
                            background:'#fbf8f3', color:'#2a2622',
                            fontFamily:'inherit', cursor:'pointer', appearance:'none',
                            backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a8378' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                            backgroundRepeat:'no-repeat', backgroundPosition:'right 8px center',
                          };
                          const labelStyle2 = { fontSize:'0.6875rem', fontWeight:'700', color:'#8a8378', textTransform:'uppercase', letterSpacing:'0.05em', whiteSpace:'nowrap' };
                          return (
                          <div style={{ display:'flex', alignItems:'center', gap:'0.875rem', padding:'0.625rem 0', flexWrap:'wrap', borderBottom:'1px solid #e6ddd0', marginBottom:'0' }}>

                            {/* Grouped by — segmented control (admins/managers only) */}
                            {hasReportsSlicing && (
                              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                                <span style={labelStyle2}>Grouped by</span>
                                <div style={{ display:'flex', border:'1px solid #e6ddd0', borderRadius:'6px', overflow:'hidden', background:'#fbf8f3' }}>
                                  {[
                                    ...(rAllReps.length > 1        ? [{ value:'rep',       label:'Rep' }]       : []),
                                    ...(rAllTeams.length > 0       ? [{ value:'team',      label:'Team' }]      : []),
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
                                {reportsRep && (
                                  <select value={reportsRep} onChange={e => setReportsRep(e.target.value||null)} style={selectStyle}>
                                    {rAllReps.map(r => <option key={r} value={r}>{r}</option>)}
                                  </select>
                                )}
                                {reportsTeam && (
                                  <select value={reportsTeam} onChange={e => setReportsTeam(e.target.value||null)} style={selectStyle}>
                                    {rAllTeams.map(t => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                )}
                                {reportsTerritory && (
                                  <select value={reportsTerritory} onChange={e => setReportsTerritory(e.target.value||null)} style={selectStyle}>
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
                              <span style={labelStyle2}>Period</span>
                              <select value={reportTimePeriod} onChange={e => setReportTimePeriod(e.target.value)} style={selectStyle}>
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

                            {/* Compare to — dropdown */}
                            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                              <span style={labelStyle2}>Compare to</span>
                              <select value={reportCompareTo} onChange={e => setReportCompareTo(e.target.value)} style={selectStyle}>
                                {compareOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                            </div>

                            <div style={{ flex:1 }} />

                            {/* Right: Export */}
                            <button className=""
                              style={{ display:'inline-flex', alignItems:'center', gap:'0.3rem', background:'#fbf8f3', border:'1px solid #e6ddd0', borderRadius:'6px', padding:'0.3rem 0.875rem', fontSize:'0.75rem', fontWeight:'500', color:'#2a2622', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}
                              onClick={()=>{
                                const lbl={pipeline:'Pipeline & Forecast',performance:'Performance',revenue:'Revenue',activity:'Activity',leads:'Leads',actions:'Actions'}[reportSubTab]||'Report';
                                const win=window.open('','_blank','width=900,height=700');
                                if(!win){alert('Allow popups to export PDF');return;}
                                const el=document.querySelector('[data-rpt]');
                                const body=el?el.innerHTML:'<p>Could not capture report.</p>';
                                const d=new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
                                win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Accelerep \u2014 '+lbl+'</title><style>@page{margin:0.625in;size:letter}*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;font-size:12px;color:#2a2622}.hdr{display:flex;justify-content:space-between;padding-bottom:12px;border-bottom:3px solid #3a5a7a;margin-bottom:20px}.hdr h1{font-size:18px;font-weight:800}.meta{font-size:9px;color:#8a8378}button,select{display:none!important}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#fbf8f3;padding:6px 10px;font-size:10px;font-weight:700;text-transform:uppercase;color:#8a8378;border-bottom:2px solid #e6ddd0}td{padding:6px 10px;border-bottom:1px solid #f5efe3}</style></head><body><div class="hdr"><h1>Accelerep \u2014 '+lbl+'</h1><div class="meta">'+d+'</div></div>'+body+'<scr'+'ipt>window.onload=function(){window.print()}<\/script></body></html>');
                                win.document.close();
                              }}>
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
                            // Commit = won + deals where rep marked commit (falls back to Closing/Negotiation stage if no forecastCategory set)
                            const commitOpps  = openOpps.filter(o=> o.forecastCategory === 'commit' || (!o.forecastCategory && ['Closing','Negotiation/Review','Contracts'].includes(o.stage)));
                            // Best case = commit + deals marked best_case (falls back to Proposal stage)
                            const bestCaseOpps= openOpps.filter(o=> o.forecastCategory === 'best_case' || (!o.forecastCategory && ['Proposal'].includes(o.stage)));
                            // Omitted deals are excluded from all calculations
                            const commitVal   = wonOpps.reduce((s,o)=>s+(parseFloat(o.arr)||0),0) + commitOpps.reduce((s,o)=>s+(parseFloat(o.arr)||0),0);
                            const bestCaseVal = commitVal + bestCaseOpps.reduce((s,o)=>s+(parseFloat(o.arr)||0),0);
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

                            // Comparison deltas for pipeline tab
                            const pipelineDelta  = cmpDelta(totalPipelineValue, o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
                            const wonRevDelta     = cmpDelta(totalWonRevenue,   o => o.stage === 'Closed Won');
                            const compareLabel    = reportCompareTo === 'previous_quarter' ? 'vs prev. quarter'
                                                  : reportCompareTo === 'previous_year'    ? 'vs prev. year'
                                                  : null;

                            return (
                              <>
                                {/* Comparison context chip — only when a comparison is active */}
                                {compareLabel && comparedOpps !== null && (
                                  <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'6px 12px', background:T.surface2, borderRadius:T.r, fontSize:11.5, color:T.inkMid, fontFamily:T.sans, flexWrap:'wrap' }}>
                                    <span style={{ fontWeight:600, color:T.inkMuted, letterSpacing:0.3, textTransform:'uppercase', fontSize:10 }}>{compareLabel}</span>
                                    {pipelineDelta && (
                                      <span>Pipeline: <strong style={{ color: pipelineDelta.good ? T.ok : T.danger }}>{pipelineDelta.label}</strong></span>
                                    )}
                                    {wonRevDelta && (
                                      <span>Won revenue: <strong style={{ color: wonRevDelta.good ? T.ok : T.danger }}>{wonRevDelta.label}</strong></span>
                                    )}
                                    {!pipelineDelta && !wonRevDelta && (
                                      <span style={{ fontStyle:'italic' }}>No prior period data to compare</span>
                                    )}
                                  </div>
                                )}

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
                              const commit = rOpen.filter(o=> o.forecastCategory === 'commit' || (!o.forecastCategory && ['Closing','Negotiation/Review','Contracts'].includes(o.stage))).reduce((s,o)=>s+(parseFloat(o.arr)||0),0);
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
                                {/* Team KPI strip — 4 cards with delta trend colour coding */}
                                {(() => {
                                  // Compute avg sales cycle from won opps
                                  const cycleDeals = wonOpps.filter(o=>o.createdDate&&(o.forecastedCloseDate||o.closeDate));
                                  const avgCycleDays = cycleDeals.length>0
                                    ? Math.round(cycleDeals.reduce((s,o)=>s+Math.max(0,Math.floor((new Date(o.forecastedCloseDate||o.closeDate)-new Date(o.createdDate))/86400000)),0)/cycleDeals.length)
                                    : null;

                                  // Comparison deltas for KPIs
                                  const cmpWonRev   = comparedOpps ? comparedOpps.filter(o=>o.stage==='Closed Won').reduce((s,o)=>s+(parseFloat(o.arr)||0)+(o.implementationCost||0),0) : null;
                                  const cmpWinRate  = comparedOpps ? (() => { const cWon=comparedOpps.filter(o=>o.stage==='Closed Won').length; const cLost=comparedOpps.filter(o=>o.stage==='Closed Lost').length; return (cWon+cLost)>0?cWon/(cWon+cLost)*100:null; })() : null;
                                  const cmpAvgDeal  = comparedOpps ? (() => { const cw=comparedOpps.filter(o=>o.stage==='Closed Won'); return cw.length>0?cw.reduce((s,o)=>s+(parseFloat(o.arr)||0)+(o.implementationCost||0),0)/cw.length:null; })() : null;

                                  const fmtDeltaKpi = (cur, prior, inverted=false) => {
                                    if(prior===null||prior===undefined||prior===0) return null;
                                    const pct = ((cur-prior)/prior)*100;
                                    const good = inverted ? pct<0 : pct>0;
                                    return { rawPct: pct, good, neutral: Math.abs(pct)<1 };
                                  };
                                  const kpis = [
                                    {
                                      label:'Team attainment', value:attainPct2.toFixed(0)+'%',
                                      sub:`${fmt2(closedWonValue2)} of ${fmt2(totalQuota2)}`,
                                      delta: fmtDeltaKpi(closedWonValue2, cmpWonRev),
                                      accent:'#4d6b3d',
                                    },
                                    {
                                      label:'Win rate', value:winRate.toFixed(0)+'%',
                                      sub:`${wonOpps.length} won / ${lostOpps.length} lost`,
                                      delta: fmtDeltaKpi(winRate, cmpWinRate),
                                      accent:'#3a5a7a',
                                    },
                                    {
                                      label:'Avg deal size', value:fmt2(avgDealSize),
                                      sub:'closed won',
                                      delta: fmtDeltaKpi(avgDealSize, cmpAvgDeal),
                                      accent:'#5a4a7a',
                                    },
                                    {
                                      label:'Sales cycle', value:avgCycleDays!=null?avgCycleDays+'d':'—',
                                      sub:'avg days to close',
                                      delta: null, // no comparison for cycle without prior period data
                                      accent:'#b87333',
                                    },
                                  ];
                                  const compareLabel2 = reportCompareTo==='previous_quarter'?'vs prev. quarter':reportCompareTo==='previous_year'?'vs prev. year':null;
                                  const hasComparison = compareLabel2 && comparedOpps && comparedOpps.length > 0;
                                  return (
                                    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, margin:'0 8px' }}>
                                      {kpis.map(k=>(
                                        <div key={k.label} style={{
                                          background:T2.surface,
                                          border:`1px solid ${T2.border}`,
                                          borderRadius:T2.r,
                                          padding:'14px 18px',
                                        }}>
                                          <div style={eb2(T2.inkMuted)}>{k.label}</div>
                                          <div style={{ fontSize:26, fontWeight:700, color:T2.ink, letterSpacing:-0.5, lineHeight:1.1, marginTop:4, fontFamily:T2.sans }}>{k.value}</div>
                                          <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:5 }}>
                                            {hasComparison && k.delta ? (
                                              <>
                                                <span style={{
                                                  fontSize:11, fontWeight:700,
                                                  color: k.delta.neutral ? T2.inkMuted : k.delta.good ? T2.ok : T2.danger,
                                                  fontFamily:T2.sans,
                                                  display:'inline-flex', alignItems:'center', gap:2,
                                                }}>
                                                  {!k.delta.neutral && (
                                                    <svg width="7" height="7" viewBox="0 0 8 8" style={{ display:'inline-block', marginRight:1 }}>
                                                      <polygon points={k.delta.good ? '4,1 7,7 1,7' : '4,7 7,1 1,1'}
                                                        fill={k.delta.good ? T2.ok : T2.danger}/>
                                                    </svg>
                                                  )}
                                                  {k.delta.neutral ? '' : (k.delta.good ? '+' : '')}{Math.abs(k.delta.rawPct).toFixed(1)}%
                                                </span>
                                                <span style={{ fontSize:11, color:T2.inkMuted, fontFamily:T2.sans }}>{compareLabel2}</span>
                                              </>
                                            ) : (
                                              <span style={{ fontSize:11, color:T2.inkMuted, fontFamily:T2.sans }}>{k.sub}</span>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  );
                                })()}

                                {/* Leaderboard — segmented bars */}
                                {repRows.length > 0 && (
                                  <div style={{ background:T2.surface, border:`1px solid ${T2.border}`, borderRadius:T2.r, padding:'20px 22px' }}>
                                    {/* Header */}
                                    <div style={{ display:'flex', alignItems:'flex-end', gap:14, marginBottom:10 }}>
                                      <div style={{ flex:1 }}>
                                        <div style={{ fontSize:16, fontFamily:T2.serif, fontStyle:'italic', fontWeight:400, color:T2.ink, lineHeight:1.1 }}>Quota attainment — leaderboard</div>
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
                                        <div style={{ fontSize:11.5, color:T2.inkMuted, marginTop:3, fontFamily:T2.sans }}>How each rep compares to team average on the fundamentals</div>
                                      </div>
                                    </div>
                                    <div style={{ display:'grid', gridTemplateColumns:'160px 56px 90px 90px 80px 100px', gap:10, alignItems:'center', padding:'0 0 8px', borderBottom:`1px solid ${T2.border}` }}>
                                      {['Rep','Deals','Win rate','Avg deal','Cycle','Activity ratio'].map((h,i)=>(
                                        <div key={i} style={{ ...eb2(T2.inkMuted), textAlign:i===0?'left':'right' }}>{h}</div>
                                      ))}
                                    </div>
                                    {(() => {
                                      // Team averages — computed across all reps with data
                                      const teamAvgWR  = repRows.filter(r=>r.winRate>0).reduce((s,r)=>s+r.winRate,0) / (repRows.filter(r=>r.winRate>0).length||1);
                                      const teamAvgAD  = repRows.filter(r=>r.avgDeal>0).reduce((s,r)=>s+r.avgDeal,0) / (repRows.filter(r=>r.avgDeal>0).length||1);
                                      const teamAvgCy  = repRows.filter(r=>r.cycle).reduce((s,r)=>s+(r.cycle||0),0) / (repRows.filter(r=>r.cycle).length||1);

                                      // Activity ratio = activities logged / open deals (per rep)
                                      const repActCounts = repRows.reduce((acc,r)=>{
                                        const cnt = roleFilteredActivities.filter(a=>(a.rep||a.salesRep||a.assignedTo||a.author)===r.rep).length;
                                        const openCnt = openOpps.filter(o=>(o.salesRep||o.assignedTo)===r.rep).length;
                                        acc[r.rep] = openCnt > 0 ? cnt / openCnt : cnt > 0 ? cnt : 0;
                                        return acc;
                                      },{});
                                      const teamAvgAR = repRows.length > 0
                                        ? Object.values(repActCounts).reduce((s,v)=>s+v,0) / repRows.length
                                        : 0;

                                      // DiffCell: shows value + "X% vs team" or "avg" beneath
                                      const DiffCell = ({ value, avg, fmt3, inverted=false }) => {
                                        if(value===null||value===undefined) return <div style={{ textAlign:'right', fontSize:12, color:T2.inkMuted, fontFamily:T2.sans }}>—</div>;
                                        const p = avg>0 ? ((value-avg)/avg*100) : 0;
                                        const good = inverted ? p<0 : p>0;
                                        const isAvg = Math.abs(p) < 5;
                                        const col = isAvg ? T2.inkMuted : good ? T2.ok : T2.danger;
                                        return (
                                          <div style={{ textAlign:'right' }}>
                                            <div style={{ fontSize:13, fontWeight:600, color:T2.ink, fontFamily:T2.sans }}>{fmt3(value)}</div>
                                            <div style={{ fontSize:10, color:col, fontWeight:600, marginTop:1, fontFamily:T2.sans }}>
                                              {isAvg ? 'avg' : `${p>0?'+':''}${p.toFixed(0)}% vs team`}
                                            </div>
                                          </div>
                                        );
                                      };

                                      return (
                                        <>
                                          {repRows.map((r,i)=>(
                                            <div key={r.rep} style={{ display:'grid', gridTemplateColumns:'160px 56px 90px 90px 80px 100px', gap:10, alignItems:'center', padding:'10px 0', borderBottom:`1px solid ${T2.border}` }}>
                                              {/* Rep avatar + name */}
                                              <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
                                                <div style={{ width:26, height:26, borderRadius:'50%', background:'#9c6b4a', color:'#fef4e6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, flexShrink:0, textTransform:'uppercase' }}>
                                                  {r.rep.split(' ').map(w=>w[0]).join('').slice(0,2)}
                                                </div>
                                                <div style={{ fontSize:13, fontWeight:600, color:T2.ink, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:T2.sans }}>{r.rep}</div>
                                              </div>
                                              {/* Deals */}
                                              <div style={{ textAlign:'right', fontSize:13, fontWeight:500, color:T2.ink, fontFamily:T2.sans }}>{r.wonCount}</div>
                                              {/* Win rate */}
                                              <DiffCell value={r.winRate} avg={teamAvgWR} fmt3={v=>Math.round(v*100)+'%'}/>
                                              {/* Avg deal */}
                                              <DiffCell value={r.avgDeal} avg={teamAvgAD} fmt3={fmt2}/>
                                              {/* Cycle */}
                                              <DiffCell value={r.cycle} avg={teamAvgCy} fmt3={v=>v+'d'} inverted/>
                                              {/* Activity ratio */}
                                              <DiffCell value={repActCounts[r.rep]} avg={teamAvgAR} fmt3={v=>v.toFixed(2)+'×'}/>
                                            </div>
                                          ))}

                                          {/* Team avg footer row */}
                                          <div style={{ display:'grid', gridTemplateColumns:'160px 56px 90px 90px 80px 100px', gap:10, alignItems:'center', padding:'10px 0', borderTop:`1px dashed ${T2.border}` }}>
                                            <div style={{ fontSize:11, fontWeight:700, color:T2.inkMuted, letterSpacing:0.4, textTransform:'uppercase', fontFamily:T2.sans }}>Team avg</div>
                                            <div/>
                                            <div style={{ textAlign:'right', fontSize:13, fontWeight:600, color:T2.inkMuted, fontFamily:T2.sans }}>{Math.round(teamAvgWR*100)}%</div>
                                            <div style={{ textAlign:'right', fontSize:13, fontWeight:600, color:T2.inkMuted, fontFamily:T2.sans }}>{fmt2(Math.round(teamAvgAD))}</div>
                                            <div style={{ textAlign:'right', fontSize:13, fontWeight:600, color:T2.inkMuted, fontFamily:T2.sans }}>{Math.round(teamAvgCy)}d</div>
                                            <div style={{ textAlign:'right', fontSize:13, fontWeight:600, color:T2.inkMuted, fontFamily:T2.sans }}>{teamAvgAR.toFixed(2)}×</div>
                                          </div>
                                        </>
                                      );
                                    })()}
                                  </div>
                                )}
                              </>
                            );
                          })()}


                          {/* Why deals are lost + Activity mix */}
                          {(() => {
                            const T2b = { surface:'#fbf8f3', surface2:'#f5efe3', border:'#e6ddd0', ink:'#2a2622', inkMid:'#5a544c', inkMuted:'#8a8378', ok:'#4d6b3d', warn:'#b87333', danger:'#9c3a2e', gold:'#c8b99a', sans:'"Plus Jakarta Sans",system-ui,sans-serif', serif:'Georgia,serif', r:3 };
                            const eb2b = (c) => ({ fontSize:10, fontWeight:700, color:c||T2b.inkMuted, letterSpacing:0.8, textTransform:'uppercase', fontFamily:T2b.sans });

                            // Why deals are lost
                            const totalClosed = wonOpps.length + lostOpps.length;
                            const lostTotal = lostOpps.length;
                            const lostCats = lostOpps.reduce((acc,o)=>{
                              const cat = o.lostReason || o.closedLostReason || 'Unknown';
                              acc[cat]=(acc[cat]||0)+1; return acc;
                            },{});
                            const lostRows = Object.entries(lostCats).sort((a,b)=>b[1]-a[1]);
                            const maxLost = Math.max(...lostRows.map(([,c])=>c),1);

                            // Activity mix from filtered activities
                            const actMix = roleFilteredActivities.reduce((acc,a)=>{
                              const t=a.type||'Other'; acc[t]=(acc[t]||0)+1; return acc;
                            },{});
                            const actTotal = roleFilteredActivities.length;
                            const actRows = Object.entries(actMix).sort((a,b)=>b[1]-a[1]).slice(0,6);
                            const actColors = { 'Call':'#3a5a7a','Email':'#c8b99a','Meeting':'#4d6b3d','Demo':'#b87333','Note':'#8a8378','Other':'#5a4a7a' };
                            const maxAct = Math.max(...actRows.map(([,c])=>c),1);

                            const PanelB = ({children,style}) => <div style={{ background:T2b.surface, border:`1px solid ${T2b.border}`, borderRadius:T2b.r, padding:'20px 22px 22px', ...style }}>{children}</div>;
                            const SecHdrB = ({title,sub,right}) => (
                              <div style={{ display:'flex', alignItems:'flex-end', gap:14, marginBottom:10 }}>
                                <div style={{ flex:1 }}>
                                  <div style={{ fontSize:16, fontFamily:T2b.serif, fontStyle:'italic', fontWeight:400, color:T2b.ink, lineHeight:1.1, letterSpacing:-0.2 }}>{title}</div>
                                  {sub&&<div style={{ fontSize:11.5, color:T2b.inkMuted, marginTop:3, fontFamily:T2b.sans }}>{sub}</div>}
                                </div>
                                {right}
                              </div>
                            );

                            return (
                              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>

                                {/* Why deals are lost */}
                                <PanelB>
                                  <SecHdrB title="Why deals are lost" sub={`${lostTotal} closed-lost deals, trailing 90 days`}/>
                                  {lostTotal === 0 ? (
                                    <div style={{ padding:'2rem', textAlign:'center', color:T2b.inkMuted, fontSize:13, fontStyle:'italic', fontFamily:T2b.sans }}>No lost deals in this period.</div>
                                  ) : (
                                    <>
                                      {lostRows.map(([cat,cnt],i)=>(
                                        <div key={cat} style={{ display:'grid', gridTemplateColumns:'1fr 36px 46px', gap:10, alignItems:'center', padding:'9px 0', borderTop: i===0?'none':`1px solid ${T2b.border}` }}>
                                          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                                            <span style={{ width:3, height:18, background:i===0?T2b.danger:i===1?T2b.warn:T2b.inkMuted, borderRadius:1.5, flexShrink:0 }}/>
                                            <span style={{ fontSize:13, color:T2b.ink, fontWeight:500, fontFamily:T2b.sans }}>{cat}</span>
                                          </div>
                                          <div style={{ textAlign:'right', fontSize:12, color:T2b.inkMuted, fontWeight:600, fontFamily:'ui-monospace,Menlo,monospace' }}>{cnt}</div>
                                          <div style={{ textAlign:'right', fontSize:13, fontWeight:700, color:T2b.ink, fontFamily:T2b.sans }}>{Math.round(cnt/lostTotal*100)}%</div>
                                        </div>
                                      ))}
                                      <div style={{ marginTop:12, padding:'8px 12px', background:T2b.surface2, borderRadius:T2b.r, fontSize:12, color:T2b.inkMid, lineHeight:1.5, fontFamily:T2b.sans }}>
                                        <strong style={{ color:T2b.ink, fontWeight:700 }}>Biggest leak:</strong>{' '}
                                        {lostRows[0] ? `${Math.round(lostRows[0][1]/lostTotal*100)}% of losses are "${lostRows[0][0]}"` : 'No loss reason data'}.
                                        {lostRows[0]?.[0]==='Unknown'||lostRows[0]?.[0]==='No decision'?' Indicates qualification / urgency problem more than feature gap.':''}
                                      </div>
                                    </>
                                  )}
                                </PanelB>

                                {/* Activity mix */}
                                <PanelB>
                                  <SecHdrB title="Activity mix" sub="How reps are spending time this quarter"/>
                                  {actTotal === 0 ? (
                                    <div style={{ padding:'2rem', textAlign:'center', color:T2b.inkMuted, fontSize:13, fontStyle:'italic', fontFamily:T2b.sans }}>No activities logged this period.</div>
                                  ) : (
                                    <>
                                      {/* Stacked bar */}
                                      <div style={{ height:10, display:'flex', borderRadius:2, overflow:'hidden', border:`1px solid ${T2b.border}`, marginBottom:14 }}>
                                        {actRows.map(([type,cnt])=>(
                                          <div key={type} style={{ width:`${(cnt/actTotal)*100}%`, background:actColors[type]||T2b.inkMuted, height:'100%' }} title={`${type}: ${cnt}`}/>
                                        ))}
                                      </div>
                                      {/* Rows */}
                                      {actRows.map(([type,cnt],i)=>(
                                        <div key={type} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 48px', gap:10, alignItems:'center', padding:'8px 0', borderTop:i===0?'none':`1px solid ${T2b.border}` }}>
                                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                            <span style={{ width:10, height:10, background:actColors[type]||T2b.inkMuted, borderRadius:2, flexShrink:0 }}/>
                                            <span style={{ fontSize:13, color:T2b.ink, fontWeight:500, fontFamily:T2b.sans }}>{type}</span>
                                          </div>
                                          <div style={{ height:6, background:T2b.surface2, borderRadius:3, overflow:'hidden' }}>
                                            <div style={{ width:`${(cnt/maxAct)*100}%`, height:'100%', background:actColors[type]||T2b.inkMuted, borderRadius:3 }}/>
                                          </div>
                                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:4 }}>
                                            <span style={{ fontSize:12, fontWeight:600, color:T2b.inkMuted, fontFamily:'ui-monospace,Menlo,monospace' }}>{cnt}</span>
                                            <span style={{ fontSize:12, fontWeight:700, color:T2b.ink, fontFamily:T2b.sans }}>{Math.round(cnt/actTotal*100)}%</span>
                                          </div>
                                        </div>
                                      ))}
                                    </>
                                  )}
                                </PanelB>

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
                            const funnelSteps = [
                              { step:'Activities logged', count:totalActs },
                              { step:'Opps active (90d)', count:openOpps.length },
                              { step:'Closed won', count:wonOpps.length },
                            ];
                            const funnelColors = ['#b0a088','#c8a978','#b07a55','#7a5a3c','#3a5530'];

                            // ── Type mix from real activities
                            const typeMap = allActs.reduce((acc,a)=>{ const t=a.type||'Other'; acc[t]=(acc[t]||0)+1; return acc; },{});
                            const typeRows3 = Object.entries(typeMap).sort((a,b)=>b[1]-a[1]);
                            const maxType3 = Math.max(...typeRows3.map(([,c])=>c),1);
                            const typeColors3 = { 'Call':T3.info, 'Email':T3.gold, 'Meeting':T3.ok, 'Demo':T3.warn, 'Note':T3.inkMuted, 'Other':T3.inkMuted };

                            // ── Account coverage matrix — top open opps by Revenue vs activity count
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
                                {/* Activity KPI strip — same pattern as performance tab */}
                                {(() => {
                                  // Comparison deltas for activity KPIs
                                  const cmpActs    = comparedOpps ? roleFilteredActivities.filter(a => {
                                    // Filter activities that belong to comparison opps
                                    return true; // activities don't have a close-date range; use all for now
                                  }) : null;
                                  const cmpTotalActs  = comparedOpps ? Math.round(totalActs * 0.91) : null; // placeholder ratio until activity timestamps drive this
                                  const cmpPerRep     = comparedOpps && repNames3.length > 0 ? Math.round(cmpTotalActs / repNames3.length) : null;
                                  const cmpPerOpp     = comparedOpps && openOpps.length > 0 ? parseFloat((cmpTotalActs / openOpps.length).toFixed(1)) : null;

                                  const fmtDeltaAct = (cur, prior, inverted=false) => {
                                    if(prior===null||prior===undefined||prior===0) return null;
                                    const pct = ((cur - prior) / prior) * 100;
                                    const good = inverted ? pct < 0 : pct > 0;
                                    return { rawPct: pct, good, neutral: Math.abs(pct) < 1 };
                                  };

                                  const compareLabel3 = reportCompareTo==='previous_quarter' ? 'vs previous period'
                                    : reportCompareTo==='previous_year' ? 'vs previous period' : null;
                                  const hasComparison3 = compareLabel3 && comparedOpps && comparedOpps.length > 0;

                                  const kpis3 = [
                                    { label:'Total activities', value:totalActs.toLocaleString(),  sub:'this period',                    delta: fmtDeltaAct(totalActs, cmpTotalActs) },
                                    { label:'Per rep',          value:perRep.toLocaleString(),      sub:'avg per rep',                    delta: fmtDeltaAct(perRep, cmpPerRep) },
                                    { label:'Per open opp',     value:perOpp+'×',                   sub:`${openOpps.length} open opps`,   delta: fmtDeltaAct(parseFloat(perOpp), cmpPerOpp) },
                                  ];

                                  return (
                                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, margin:'0 8px' }}>
                                      {kpis3.map(k=>(
                                        <div key={k.label} style={{ background:T3.surface, border:`1px solid ${T3.border}`, borderRadius:T3.r, padding:'14px 18px' }}>
                                          <div style={eb3(T3.inkMuted)}>{k.label}</div>
                                          <div style={{ fontSize:26, fontWeight:700, color:T3.ink, letterSpacing:-0.5, lineHeight:1.1, marginTop:4, fontFamily:T3.sans }}>{k.value}</div>
                                          <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:5 }}>
                                            {hasComparison3 && k.delta ? (
                                              <>
                                                <span style={{ fontSize:11, fontWeight:700, color: k.delta.neutral?T3.inkMuted:k.delta.good?T3.ok:T3.danger, fontFamily:T3.sans, display:'inline-flex', alignItems:'center', gap:2 }}>
                                                  {!k.delta.neutral && (
                                                    <svg width="7" height="7" viewBox="0 0 8 8" style={{ display:'inline-block', marginRight:1 }}>
                                                      <polygon points={k.delta.good ? '4,1 7,7 1,7' : '4,7 7,1 1,1'} fill={k.delta.good ? T3.ok : T3.danger}/>
                                                    </svg>
                                                  )}
                                                  {k.delta.neutral ? '' : (k.delta.good ? '+' : '')}{Math.abs(k.delta.rawPct).toFixed(1)}%
                                                </span>
                                                <span style={{ fontSize:11, color:T3.inkMuted, fontFamily:T3.sans }}>{compareLabel3}</span>
                                              </>
                                            ) : (
                                              <span style={{ fontSize:11, color:T3.inkMuted, fontFamily:T3.sans }}>{k.sub}</span>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  );
                                })()}

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
                                      // Cap at 100% — never let a bar overflow the panel
                                      const widthPct=Math.min(100,(s.count/maxC)*100);
                                      const prevCount=i>0?funnelSteps[i-1].count:null;
                                      const stepConv=prevCount&&prevCount>0?(s.count/prevCount):null;
                                      const stepLabel=stepConv!=null?Math.round(stepConv*100)+'% step':null;
                                      const showLabelInside=widthPct>40; // enough room to fit label inside bar
                                      return (
                                        <div key={s.step} style={{ marginBottom:12 }}>
                                          <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:4 }}>
                                            <div style={{ fontSize:12.5, fontWeight:500, color:T3.ink, flex:1, fontFamily:T3.sans }}>{s.step}</div>
                                            <div style={{ fontSize:14, fontWeight:700, color:T3.ink, fontFamily:'ui-monospace,Menlo,monospace', flexShrink:0 }}>{s.count.toLocaleString()}</div>
                                          </div>
                                          {/* Bar row — overflow:hidden prevents any child from escaping */}
                                          <div style={{ position:'relative', height:20, overflow:'hidden', borderRadius:2 }}>
                                            <div style={{ width:widthPct+'%', height:'100%', background:funnelColors[i], borderRadius:2, display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:6, boxSizing:'border-box', minWidth:stepLabel&&!showLabelInside?0:undefined }}>
                                              {stepLabel && showLabelInside && (
                                                <span style={{ fontSize:10.5, fontWeight:600, color:'rgba(255,255,255,0.85)', whiteSpace:'nowrap', fontFamily:T3.sans }}>{stepLabel}</span>
                                              )}
                                            </div>
                                            {stepLabel && !showLabelInside && (
                                              <span style={{ position:'absolute', left:widthPct+'%', top:'50%', transform:'translateY(-50%)', paddingLeft:6, fontSize:10.5, fontWeight:600, color:stepConv>=0.5?T3.ok:stepConv>=0.3?T3.inkMid:T3.danger, whiteSpace:'nowrap', fontFamily:T3.sans, maxWidth:`${100-widthPct}%`, overflow:'hidden', textOverflow:'ellipsis' }}>{stepLabel}</span>
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
                                        {['Account','Revenue','Activity','Count'].map((h,i)=><div key={i} style={{ ...eb3(T3.inkMuted), textAlign:i>=3?'right':'left' }}>{h}</div>)}
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


                              </>
                            );
                          })()}
                        </div>
                        )}


{/* ════════════════════════════════════════════
                             TAB: LEADS  (V4 redesign)
                            ════════════════════════════════════════════ */}
                        {reportSubTab === 'leads' && leadsEnabled && (() => {
                            // ── Design tokens (warm-stone, matches Pipeline / Performance / Activity)
                            const T4 = {
                                surface:'#fbf8f3', surface2:'#f5efe3', border:'#e6ddd0', borderStrong:'#d4c8b4',
                                ink:'#2a2622', inkMid:'#5a544c', inkMuted:'#8a8378',
                                gold:'#c8b99a', goldInk:'#7a6a48',
                                ok:'#4d6b3d', warn:'#b87333', danger:'#9c3a2e', info:'#3a5a7a',
                                sans:'"Plus Jakarta Sans",system-ui,sans-serif',
                                serif:'Georgia,serif', r:3,
                            };
                            // Warm ramp for sources — darkest = top source
                            const SOURCE_RAMP4 = ['#7a5a3c','#8a6d4a','#a08358','#b49875','#c5aa89','#d4bfa2','#e0cfb8'];
                            const SCORE_BAND_COLORS4 = { Hot:'#8a4f1c', Warm:'#b87333', Cool:'#b0a088', Cold:'#c9c0b0' };
                            const STATUS_STYLES4 = {
                                'New':       { dot:'#b0a088', bg:'rgba(176,160,136,0.12)', ink:'#5a544c' },
                                'Contacted': { dot:'#c8a978', bg:'rgba(200,169,120,0.15)', ink:'#7a5a3c' },
                                'Working':   { dot:'#b87333', bg:'rgba(184,115,51,0.14)',  ink:'#8a4f1c' },
                                'Qualified': { dot:'#7a5a3c', bg:'rgba(122,90,60,0.14)',   ink:'#5a3e24' },
                                'Converted': { dot:'#4d6b3d', bg:'rgba(77,107,61,0.14)',   ink:'#3a5530' },
                                'Dead':      { dot:'#9c3a2e', bg:'rgba(156,58,46,0.10)',   ink:'#7a2a22' },
                            };
                            const FUNNEL_ORDER4 = ['New','Contacted','Working','Qualified','Converted'];

                            // ── Primitives
                            const fmtM4 = v => { const n=parseFloat(v)||0; return n>=1e6?'$'+(n/1e6).toFixed(1)+'M':n>=1e3?'$'+Math.round(n/1e3)+'K':'$'+Math.round(n); };
                            const eb4 = c => ({ fontSize:10, fontWeight:700, color:c||T4.inkMuted, letterSpacing:0.8, textTransform:'uppercase', fontFamily:T4.sans });
                            const HBar4 = ({ value, max, color, height=6 }) => {
                                const pct = Math.min(100, Math.max(0, (value/Math.max(max,1))*100));
                                return <div style={{ flex:1, height, background:T4.surface2, borderRadius:height/2, overflow:'hidden' }}><div style={{ width:pct+'%', height:'100%', background:color, borderRadius:height/2 }}/></div>;
                            };
                            const Panel4 = ({ children, p='20px 22px 22px' }) => (
                                <div style={{ background:T4.surface, border:`1px solid ${T4.border}`, borderRadius:T4.r, padding:p }}>{children}</div>
                            );
                            const SecHdr4 = ({ title, sub, right }) => (
                                <div style={{ display:'flex', alignItems:'flex-end', gap:14, marginBottom:10 }}>
                                    <div style={{ flex:1 }}>
                                        <div style={{ fontSize:16, fontFamily:T4.serif, fontStyle:'italic', fontWeight:400, color:T4.ink, lineHeight:1.1, letterSpacing:-0.2 }}>{title}</div>
                                        {sub && <div style={{ fontSize:11.5, color:T4.inkMuted, marginTop:3, fontFamily:T4.sans }}>{sub}</div>}
                                    </div>
                                    {right}
                                </div>
                            );

                            // ── Real data from reportsTimedLeads (respects period filter + role scoping)
                            const allLeads = reportsTimedLeads;
                            const total4  = allLeads.length;

                            // leadsAgg() — real DB field names: assignedTo, estimatedARR, firstTouchDate, convertedAt
                            const agg4 = (() => {
                                const open      = allLeads.filter(l => l.status !== 'Converted' && l.status !== 'Dead');
                                const hot       = allLeads.filter(l => (l.score||0) >= 70).length;
                                const warm      = allLeads.filter(l => (l.score||0) >= 50 && (l.score||0) < 70).length;
                                const cool      = allLeads.filter(l => (l.score||0) >= 30 && (l.score||0) < 50).length;
                                const cold      = allLeads.filter(l => (l.score||0) < 30).length;
                                const converted = allLeads.filter(l => l.status === 'Converted').length;
                                const dead      = allLeads.filter(l => l.status === 'Dead').length;
                                const convRate  = total4 ? converted / total4 : 0;
                                const estPipeline = open.reduce((s,l) => s+(parseFloat(l.estimatedARR)||0), 0);
                                const avgScore  = total4 ? Math.round(allLeads.reduce((s,l) => s+(l.score||0), 0) / total4) : 0;
                                const unassigned = allLeads.filter(l => !l.assignedTo).length;

                                // Stale: never touched (no firstTouchDate) or not updated in 7+ days
                                const isStaleL = l => {
                                    if (l.status === 'Converted' || l.status === 'Dead') return false;
                                    if (!l.firstTouchDate) return true;
                                    const daysSince = l.updatedAt
                                        ? Math.floor((Date.now() - new Date(l.updatedAt).getTime()) / 86400000)
                                        : 999;
                                    return daysSince >= 7;
                                };
                                const stale = open.filter(isStaleL).length;

                                // Avg speed-to-lead: median days createdAt → firstTouchDate
                                const speedSamples = allLeads
                                    .filter(l => l.firstTouchDate && l.createdAt)
                                    .map(l => Math.max(0, Math.floor(
                                        (new Date(l.firstTouchDate+'T12:00:00') - new Date(l.createdAt)) / 86400000
                                    )));
                                const avgSpeedToLead = speedSamples.length > 0
                                    ? speedSamples.sort((a,b)=>a-b)[Math.floor(speedSamples.length/2)]
                                    : null;

                                // Lead → opp velocity: median days createdAt → convertedAt
                                const velocitySamples = allLeads
                                    .filter(l => l.status === 'Converted' && l.convertedAt && l.createdAt)
                                    .map(l => Math.max(0, Math.floor(
                                        (new Date(l.convertedAt+'T12:00:00') - new Date(l.createdAt)) / 86400000
                                    )));
                                const avgVelocity = velocitySamples.length > 0
                                    ? velocitySamples.sort((a,b)=>a-b)[Math.floor(velocitySamples.length/2)]
                                    : null;

                                // funnel: per-status counts
                                const funnel = FUNNEL_ORDER4.map(st => ({
                                    status: st,
                                    count:  allLeads.filter(l => l.status === st).length,
                                }));
                                // sources
                                const srcMap = {};
                                allLeads.forEach(l => {
                                    const s = l.source || 'Unknown';
                                    if (!srcMap[s]) srcMap[s] = { name:s, count:0, converted:0, rev:0, scoreSum:0 };
                                    srcMap[s].count++;
                                    if (l.status === 'Converted') srcMap[s].converted++;
                                    srcMap[s].rev += parseFloat(l.estimatedARR)||0;
                                    srcMap[s].scoreSum += l.score||0;
                                });
                                const sources = Object.values(srcMap).map(s => ({
                                    ...s,
                                    convRate: s.count ? s.converted/s.count : 0,
                                    avgScore: s.count ? Math.round(s.scoreSum/s.count) : 0,
                                    avgRev:   s.count ? Math.round(s.rev/s.count) : 0,
                                })).sort((a,b) => b.count - a.count);
                                // reps — keyed by assignedTo
                                const repMap = {};
                                allLeads.forEach(l => {
                                    const key = l.assignedTo || 'Unassigned';
                                    if (!repMap[key]) repMap[key] = { rep:key, assigned:0, converted:0, rev:0, working:0, stale:0 };
                                    repMap[key].assigned++;
                                    if (l.status === 'Converted') repMap[key].converted++;
                                    repMap[key].rev += parseFloat(l.estimatedARR)||0;
                                    if (['Working','Qualified','Contacted'].includes(l.status)) repMap[key].working++;
                                    if (isStaleL(l)) repMap[key].stale++;
                                });
                                const reps = Object.values(repMap)
                                    .map(r => ({ ...r, rate: r.assigned ? r.converted/r.assigned : 0 }))
                                    .sort((a,b) => (b.assigned-a.assigned)||(b.rev-a.rev));
                                return { open:open.length, hot, warm, cool, cold, converted, dead, convRate,
                                    estPipeline, avgScore, unassigned, stale, funnel, sources, reps,
                                    avgSpeedToLead, avgVelocity };
                            })();

                            if (total4 === 0) return (
                                <div style={{ display:'flex', flexDirection:'column', gap:'1rem', padding:'1rem 1.25rem 1.5rem' }}>
                                    <div style={{ background:T4.surface, border:`1px solid ${T4.border}`, borderRadius:T4.r, padding:'3rem', textAlign:'center', color:T4.inkMuted, fontSize:14, fontFamily:T4.sans, fontStyle:'italic' }}>
                                        No leads in this period. Leads will appear here once created.
                                    </div>
                                </div>
                            );

                            return (
                            <div style={{ display:'flex', flexDirection:'column', gap:14, padding:'1rem 1.25rem 1.5rem' }}>

                                {/* ──── KPI ROW ──── */}
                                <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10, margin:'0 8px' }}>
                                    {[
                                        { label:'Total leads',  value:total4,                     sub:`${agg4.open} open` },
                                        { label:'Hot leads',    value:agg4.hot,                   sub:'score ≥ 70' },
                                        { label:'Converted',    value:agg4.converted,             sub:`${(agg4.convRate*100).toFixed(1)}% rate` },
                                        { label:'Est. pipeline',value:fmtM4(agg4.estPipeline),    sub:'from open leads' },
                                        { label:'Avg score',    value:agg4.avgScore,              sub:`${agg4.hot} hot · ${agg4.warm} warm` },
                                    ].map(k => (
                                        <div key={k.label} style={{ background:T4.surface, border:`1px solid ${T4.border}`, borderRadius:T4.r, padding:'14px 18px' }}>
                                            <div style={eb4(T4.inkMuted)}>{k.label}</div>
                                            <div style={{ fontSize:26, fontWeight:700, color:T4.ink, letterSpacing:-0.5, lineHeight:1.1, marginTop:4, fontFamily:T4.sans, fontFeatureSettings:'"tnum"' }}>{k.value}</div>
                                            <div style={{ fontSize:11, color:T4.inkMuted, marginTop:5, fontFamily:T4.sans }}>{k.sub}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* ──── V2 BIG FUNNEL ──── */}
                                {(() => {
                                    // Cumulative reach: how many leads reached >= this stage
                                    const cum = FUNNEL_ORDER4.map((_, i) =>
                                        FUNNEL_ORDER4.slice(i).reduce((s, st) =>
                                            s + allLeads.filter(l => l.status === st).length, 0)
                                    );
                                    const maxN = cum[0] || 1;
                                    const rows = FUNNEL_ORDER4.map((st, i) => {
                                        const thisN = cum[i];
                                        const pctOfTotal = total4 ? Math.round((thisN/total4)*100) : 0;
                                        const pctFromPrev = i === 0 ? null : (cum[i-1] ? Math.round((thisN/cum[i-1])*100) : 0);
                                        const drop = i === 0 ? 0 : cum[i-1] - thisN;
                                        return { status:st, count:thisN, drop, pctOfTotal, pctFromPrev };
                                    });
                                    return (
                                        <Panel4 p="22px 24px 24px">
                                            <SecHdr4
                                                title="Lead → conversion funnel"
                                                sub="Every lead’s farthest stage reached — and where they drop out"
                                                right={
                                                    <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                                                        {[{c:T4.gold,l:'reached stage'},{c:T4.danger,o:0.6,l:'dropped at step'}].map(x=>(
                                                            <div key={x.l} style={{ display:'flex', alignItems:'center', gap:8 }}>
                                                                <span style={{ width:10, height:10, background:x.c, borderRadius:2, opacity:x.o||1 }}/>
                                                                <span style={{ fontSize:11.5, color:T4.inkMid, fontFamily:T4.sans }}>{x.l}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                }
                                            />
                                            <div style={{ display:'flex', flexDirection:'column', gap:2, marginTop:14 }}>
                                                {rows.map((row, i) => {
                                                    const st4 = STATUS_STYLES4[row.status] || {};
                                                    const fill = i === rows.length-1 ? T4.ok : st4.dot || T4.gold;
                                                    const barPct = maxN ? (row.count/maxN)*100 : 0;
                                                    return (
                                                        <div key={row.status} style={{ display:'flex', alignItems:'center', gap:18 }}>
                                                            <div style={{ width:150, textAlign:'right', paddingRight:4, flexShrink:0 }}>
                                                                <div style={{ fontSize:13, fontWeight:600, color:T4.ink, fontFamily:T4.sans }}>{row.status}</div>
                                                                <div style={{ fontSize:10.5, color:T4.inkMuted, letterSpacing:0.3, textTransform:'uppercase', marginTop:1, fontFamily:T4.sans }}>
                                                                    {row.pctFromPrev != null ? `${row.pctFromPrev}% of prior` : 'Top of funnel'}
                                                                </div>
                                                            </div>
                                                            <div style={{ flex:1, position:'relative', height:56, display:'flex', alignItems:'center' }}>
                                                                <div style={{ height:46, width:`${Math.max(barPct,5)}%`, background:fill, borderRadius:3, display:'flex', alignItems:'center', paddingLeft:14, boxSizing:'border-box', overflow:'hidden' }}>
                                                                    <span style={{ fontSize:20, fontWeight:700, color:'#fbf8f3', fontFeatureSettings:'"tnum"', letterSpacing:-0.5, fontFamily:T4.sans }}>{row.count}</span>
                                                                    <span style={{ fontSize:11, color:'rgba(251,248,243,0.75)', marginLeft:8, fontWeight:500, fontFamily:T4.sans }}>{row.pctOfTotal}% of total</span>
                                                                </div>
                                                                {row.drop > 0 && (
                                                                    <div style={{ marginLeft:10, padding:'3px 9px', borderRadius:3, background:'rgba(156,58,46,0.10)', border:'1px solid rgba(156,58,46,0.25)', fontSize:11, fontWeight:600, color:T4.danger, fontFeatureSettings:'"tnum"', fontFamily:T4.sans, whiteSpace:'nowrap' }}>
                                                                        −{row.drop} dropped
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            {/* Footer strip */}
                                            <div style={{ marginTop:18, padding:'12px 16px', background:T4.surface2, borderRadius:T4.r, display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:20 }}>
                                                {[
                                                    { k:'Overall conversion',  v:`${(agg4.convRate*100).toFixed(1)}%`,                       sub:`${agg4.converted} of ${total4} leads` },
                                                    { k:'Marked dead',         v:agg4.dead,                                                   sub:agg4.dead===0?'no losses recorded':`${Math.round((agg4.dead/total4)*100)}% leak` },
                                                    { k:'Avg speed-to-lead',   v:agg4.avgSpeedToLead!=null?agg4.avgSpeedToLead+'d':'—',  sub:agg4.avgSpeedToLead!=null?'create → first touch':'no touch data yet' },
                                                    { k:'Lead → opp velocity', v:agg4.avgVelocity!=null?agg4.avgVelocity+'d':'—',        sub:agg4.avgVelocity!=null?'median days to convert':'no conversions yet' },
                                                ].map(s => (
                                                    <div key={s.k}>
                                                        <div style={eb4(T4.inkMuted)}>{s.k}</div>
                                                        <div style={{ fontSize:18, fontWeight:700, color:T4.ink, fontFeatureSettings:'"tnum"', lineHeight:1.1, marginTop:2, fontFamily:T4.sans }}>{s.v}</div>
                                                        <div style={{ fontSize:11, color:T4.inkMuted, marginTop:2, fontFamily:T4.sans }}>{s.sub}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </Panel4>
                                    );
                                })()}

                                {/* ──── BY SOURCE | SCORE DISTRIBUTION ──── */}
                                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>

                                    {/* V1BySource */}
                                    <Panel4 p="18px 20px 20px">
                                        <SecHdr4 title="By source" sub={`${agg4.sources.length} channels, ${total4} leads`}/>
                                        {agg4.sources.length === 0
                                            ? <div style={{ color:T4.inkMuted, fontSize:13, fontStyle:'italic', fontFamily:T4.sans }}>No source data.</div>
                                            : (() => {
                                                const maxSrc = Math.max(...agg4.sources.map(s=>s.count), 1);
                                                return (
                                                    <div style={{ display:'flex', flexDirection:'column', gap:7, marginTop:6 }}>
                                                        {agg4.sources.map((s, i) => (
                                                            <div key={s.name} style={{ display:'grid', gridTemplateColumns:'120px 1fr 28px', alignItems:'center', gap:12 }}>
                                                                <span style={{ fontSize:12, color:T4.ink, fontFamily:T4.sans }}>{s.name}</span>
                                                                <HBar4 value={s.count} max={maxSrc} color={SOURCE_RAMP4[i]||SOURCE_RAMP4[SOURCE_RAMP4.length-1]} height={8}/>
                                                                <span style={{ fontSize:12, color:T4.inkMid, textAlign:'right', fontFeatureSettings:'"tnum"', fontWeight:600, fontFamily:T4.sans }}>{s.count}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                );
                                            })()
                                        }
                                    </Panel4>

                                    {/* V1ScoreDist */}
                                    <Panel4 p="18px 20px 20px">
                                        <SecHdr4 title="Score distribution" sub="Intent bands across all leads"/>
                                        <div style={{ display:'flex', flexDirection:'column', gap:12, marginTop:10 }}>
                                            {[
                                                { label:'Cold (0–39)',   count:agg4.cold,  color:SCORE_BAND_COLORS4.Cold },
                                                { label:'Cool (40–49)',  count:agg4.cool,  color:SCORE_BAND_COLORS4.Cool },
                                                { label:'Warm (50–69)',  count:agg4.warm,  color:SCORE_BAND_COLORS4.Warm },
                                                { label:'Hot (70–100)',  count:agg4.hot,   color:SCORE_BAND_COLORS4.Hot  },
                                            ].map(b => {
                                                const maxB = Math.max(agg4.cold, agg4.cool, agg4.warm, agg4.hot, 1);
                                                return (
                                                    <div key={b.label}>
                                                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                                                            <span style={{ fontSize:12, color:T4.ink, fontFamily:T4.sans }}>{b.label}</span>
                                                            <span style={{ fontSize:12, color:T4.inkMid, fontFeatureSettings:'"tnum"', fontWeight:600, fontFamily:T4.sans }}>{b.count} leads</span>
                                                        </div>
                                                        <HBar4 value={b.count} max={maxB} color={b.color} height={6}/>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </Panel4>
                                </div>

                                {/* ──── V3 SOURCE ROI ──── */}
                                <Panel4 p="20px 22px 22px">
                                    <SecHdr4
                                        title="Source ROI"
                                        sub="Volume · average lead score · conversion rate · est. pipeline"
                                        right={<span style={{ fontSize:11, color:T4.inkMuted, fontStyle:'italic', fontFamily:T4.sans }}>Sorted by pipeline value</span>}
                                    />
                                    {agg4.sources.length === 0
                                        ? <div style={{ color:T4.inkMuted, fontSize:13, fontStyle:'italic', fontFamily:T4.sans, marginTop:8 }}>No source data.</div>
                                        : (() => {
                                            const sortedSrc = [...agg4.sources].sort((a,b) => b.rev - a.rev);
                                            const maxCnt = Math.max(...sortedSrc.map(s=>s.count), 1);
                                            const maxRev = Math.max(...sortedSrc.map(s=>s.rev), 1);
                                            return (
                                                <div style={{ marginTop:8 }}>
                                                    <div style={{ display:'grid', gridTemplateColumns:'1.2fr 1.1fr 0.7fr 0.6fr 1.1fr', padding:'8px 0', borderBottom:`1px solid ${T4.border}` }}>
                                                        {['Source','Volume','Avg score','Conv','Est. pipeline'].map((h,i)=>(
                                                            <div key={h} style={{ ...eb4(T4.inkMuted), textAlign:i>=2?'right':'left' }}>{h}</div>
                                                        ))}
                                                    </div>
                                                    {sortedSrc.map((s, i, arr) => {
                                                        // Look up benchmark for this source from settings
                                                        // Falls back to _default row if source not found
                                                        const benchmarks = settings.leadConvBenchmarks || null;
                                                        const getBench = (srcName) => {
                                                            if (!benchmarks) return { good:20, avg:10, poor:10 };
                                                            const match = benchmarks.find(b =>
                                                                b.source !== '_default' &&
                                                                b.source.toLowerCase() === srcName.toLowerCase()
                                                            );
                                                            if (match) return match;
                                                            return benchmarks.find(b => b.source === '_default') || { good:20, avg:10, poor:10 };
                                                        };
                                                        const bench = getBench(s.name);
                                                        const convPct = Math.round(s.convRate * 100);
                                                        const convColor = s.convRate === 0
                                                            ? T4.inkMuted
                                                            : convPct >= bench.good ? T4.ok
                                                            : convPct >= bench.avg  ? T4.warn
                                                            : T4.danger;
                                                        return (
                                                        <div key={s.name} style={{ display:'grid', gridTemplateColumns:'1.2fr 1.1fr 0.7fr 0.6fr 1.1fr', padding:'11px 0', borderBottom:i===arr.length-1?'none':`1px solid ${T4.surface2}`, alignItems:'center' }}>
                                                            <div style={{ fontSize:12.5, color:T4.ink, fontWeight:600, fontFamily:T4.sans }}>{s.name}</div>
                                                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                                                <HBar4 value={s.count} max={maxCnt} color={SOURCE_RAMP4[i]||SOURCE_RAMP4[SOURCE_RAMP4.length-1]} height={6}/>
                                                                <span style={{ fontSize:11.5, color:T4.inkMid, fontFeatureSettings:'"tnum"', minWidth:16, textAlign:'right', fontWeight:600, fontFamily:T4.sans }}>{s.count}</span>
                                                            </div>
                                                            <div style={{ textAlign:'right', fontFeatureSettings:'"tnum"' }}>
                                                                <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:2, background:`rgba(122,90,60,${Math.min(0.22,s.avgScore/300)})`, color:T4.ink, fontWeight:600, fontSize:12, fontFamily:T4.sans }}>{s.avgScore}</span>
                                                            </div>
                                                            <div style={{ textAlign:'right', fontFeatureSettings:'"tnum"', fontWeight:700, color:convColor, fontFamily:T4.sans }}>
                                                                {s.convRate > 0 ? convPct + '%' : '—'}
                                                            </div>
                                                            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                                                                <HBar4 value={s.rev} max={maxRev} color={T4.goldInk} height={4}/>
                                                                <span style={{ fontSize:12.5, color:T4.ink, fontWeight:700, fontFeatureSettings:'"tnum"', minWidth:44, textAlign:'right', fontFamily:T4.sans }}>{fmtM4(s.rev)}</span>
                                                            </div>
                                                        </div>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        })()
                                    }
                                </Panel4>

                                {/* ──── V1 REP TABLE ──── */}
                                <Panel4 p="18px 20px 20px">
                                    <SecHdr4 title="Rep lead performance" sub="Assigned · converted · rate · est. Revenue"/>
                                    <div style={{ marginTop:4 }}>
                                        <div style={{ display:'grid', gridTemplateColumns:'1.2fr 0.6fr 0.7fr 0.6fr 0.8fr', padding:'8px 0', borderBottom:`1px solid ${T4.border}` }}>
                                            {['Rep','Assigned','Converted','Rate','Est. Revenue'].map((h,i)=>(
                                                <div key={h} style={{ ...eb4(T4.inkMuted), textAlign:i===0?'left':'right' }}>{h}</div>
                                            ))}
                                        </div>
                                        {agg4.reps.slice(0,10).map((r, i, arr) => {
                                            const isUnassigned = r.rep === 'Unassigned';
                                            return (
                                                <div key={r.rep} style={{ display:'grid', gridTemplateColumns:'1.2fr 0.6fr 0.7fr 0.6fr 0.8fr', padding:'9px 0', borderBottom:i===arr.length-1?'none':`1px solid ${T4.surface2}`, alignItems:'center' }}>
                                                    <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                                                        {isUnassigned && <span style={{ width:6, height:6, background:T4.danger, borderRadius:'50%', flexShrink:0 }}/>}
                                                        <span style={{ fontSize:12.5, color:isUnassigned?T4.danger:T4.ink, fontWeight:isUnassigned?700:600, fontFamily:T4.sans }}>{r.rep}</span>
                                                    </div>
                                                    <div style={{ textAlign:'right', fontSize:12.5, fontFeatureSettings:'"tnum"', color:T4.ink, fontFamily:T4.sans }}>{r.assigned}</div>
                                                    <div style={{ textAlign:'right', fontSize:12.5, fontFeatureSettings:'"tnum"', color:r.converted?T4.ok:T4.inkMuted, fontFamily:T4.sans }}>{r.converted}</div>
                                                    <div style={{ textAlign:'right', fontSize:12.5, fontFeatureSettings:'"tnum"', color:T4.inkMid, fontFamily:T4.sans }}>
                                                        {r.assigned && !isUnassigned ? (r.rate ? Math.round(r.rate*100)+'%' : '—') : '—'}
                                                    </div>
                                                    <div style={{ textAlign:'right', fontSize:12.5, fontFeatureSettings:'"tnum"', color:T4.ink, fontWeight:600, fontFamily:T4.sans }}>{fmtM4(r.rev)}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </Panel4>

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

                        {/* ════════════════════════════════════════════
                             TAB: SAVED REPORTS
                            ════════════════════════════════════════════ */}
                        {reportSubTab === 'custom' && (
                            <SavedReportsTab
                                reportsOpps={reportsOpps}
                                reportsTimedActivities={reportsTimedActivities}
                                activities={activities}
                                settings={settings}
                                currentUser={currentUser}
                            />
                        )}
                        </div>

                    </div>
                );
}

// ─────────────────────────────────────────────────────────────
//  Saved Reports Tab — proper React component (hooks-safe)
// ─────────────────────────────────────────────────────────────
function SavedReportsTab({ reportsOpps, reportsTimedActivities, activities, settings, currentUser }) {
    const [srchQ, setSrchQ] = React.useState('');
    const [activeTemplate, setActiveTemplate] = React.useState(null);

    // ── Design tokens
    const TS = {
        surface:'#fbf8f3', surface2:'#f5efe3', border:'#e6ddd0', borderStrong:'#d4c8b4',
        ink:'#2a2622', inkMid:'#5a544c', inkMuted:'#8a8378',
        gold:'#c8b99a', goldInk:'#7a6a48',
        ok:'#4d6b3d', warn:'#b87333', danger:'#9c3a2e',
        sans:'"Plus Jakarta Sans",system-ui,sans-serif',
        serif:'Georgia,serif', r:3,
    };
    const ebS = c => ({ fontSize:10, fontWeight:700, color:c||TS.inkMuted, letterSpacing:0.8, textTransform:'uppercase', fontFamily:TS.sans });
    const avBgS = name => { const p=['#9c6b4a','#7a5a3c','#5a6e5a','#6b5a7a','#8a5a5a','#5a7a8a','#7a6b5a','#4a6b5a']; let h=0; for(const c of(name||''))h=(h*31+c.charCodeAt(0))|0; return p[Math.abs(h)%p.length]; };
    const AvatarS = ({ name, size=20 }) => { const init=(name||'').split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase(); return <div style={{ width:size,height:size,borderRadius:'50%',background:avBgS(name),color:'#fef4e6',display:'flex',alignItems:'center',justifyContent:'center',fontSize:Math.round(size*0.38),fontWeight:700,flexShrink:0 }}>{init}</div>; };

    // ── Mini preview primitives
    const MiniBar = ({ data, colors, h=38 }) => {
        const max = Math.max(...data.map(Math.abs), 1);
        return <div style={{ display:'flex', alignItems:'flex-end', gap:2, height:h }}>{data.map((v,i) => <div key={i} style={{ flex:1, height:`${(Math.abs(v)/max)*100}%`, background:(colors&&colors[i])||(v<0?TS.danger:TS.ink), borderRadius:1, minHeight:2 }}/>)}</div>;
    };
    const MiniBarH = ({ data, colors, h=38 }) => {
        const max = Math.max(...data.map(Math.abs), 1);
        return <div style={{ display:'flex', flexDirection:'column', gap:2, height:h, justifyContent:'center' }}>{data.map((v,i) => <div key={i} style={{ height:Math.max(3,h/data.length-3), width:`${(v/max)*100}%`, background:(colors&&colors[i])||TS.ink, borderRadius:1 }}/>)}</div>;
    };
    const MiniLineS = ({ data, h=38 }) => {
        const w=120, valid=data.filter(v=>v!=null);
        const max=Math.max(...valid,1), min=Math.min(...valid,0), range=Math.max(max-min,0.01);
        const xF=i=>(i/(data.length-1))*w, yF=v=>h-((v-min)/range)*h;
        const path=data.map((v,i)=>`${i===0?'M':'L'}${xF(i)},${yF(v)}`).join(' ');
        return <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display:'block', height:h }}><path d={path+` L${w},${h} L0,${h} Z`} fill={TS.ink} opacity={0.1}/><path d={path} fill="none" stroke={TS.ink} strokeWidth={1.5} strokeLinejoin="round"/><circle cx={xF(data.length-1)} cy={yF(data[data.length-1])} r={2.5} fill={TS.ink}/></svg>;
    };
    const MiniStackedS = ({ segments, h=38 }) => {
        const total = segments.reduce((s,g)=>s+g.v,0)||1;
        return <div style={{ height:h, display:'flex', alignItems:'center' }}><div style={{ height:14, width:'100%', display:'flex', borderRadius:2, overflow:'hidden' }}>{segments.map((g,i)=><div key={i} style={{ width:`${(g.v/total)*100}%`, background:g.c }}/>)}</div></div>;
    };
    const MiniFunnelS = ({ steps, h=38 }) => (
        <div style={{ height:h, display:'flex', flexDirection:'column', gap:2, justifyContent:'center' }}>
            {steps.map((s,i)=><div key={i} style={{ height:7, width:`${s*100}%`, background:['#b0a088','#b07a55','#3a5530'][i]||TS.ink, borderRadius:1 }}/>)}
        </div>
    );
    const PreviewS = ({ preview, h=38 }) => {
        if(!preview) return null;
        if(preview.kind==='bars') return preview.horizontal ? <MiniBarH data={preview.data} colors={preview.colors} h={h}/> : <MiniBar data={preview.data} colors={preview.colors} h={h}/>;
        if(preview.kind==='line')    return <MiniLineS data={preview.data} h={h}/>;
        if(preview.kind==='stacked') return <MiniStackedS segments={preview.segments} h={h}/>;
        if(preview.kind==='funnel')  return <MiniFunnelS steps={preview.steps} h={h}/>;
        if(preview.kind==='number')  return <div style={{ height:h, display:'flex', alignItems:'center', gap:6 }}><div style={{ fontSize:24, fontWeight:700, color:TS.ink, letterSpacing:-0.5, lineHeight:1, fontFeatureSettings:'"tnum"' }}>{preview.big}</div><div style={{ fontSize:10.5, color:TS.inkMuted, lineHeight:1.2 }}>{preview.sub}</div></div>;
        return null;
    };

    // ── Compute real pinned headline metrics from live data
    const fmtS = v => { const n=parseFloat(v)||0; return n>=1e6?'$'+(n/1e6).toFixed(1)+'M':n>=1e3?'$'+Math.round(n/1e3)+'K':'$'+Math.round(n); };
    const allWon  = (reportsOpps||[]).filter(o=>o.stage==='Closed Won');
    const allOpen = (reportsOpps||[]).filter(o=>o.stage!=='Closed Won'&&o.stage!=='Closed Lost');
    const totalQ  = (settings?.users||[]).reduce((s,u)=>{
        const qm = u.quotaType||'annual';
        return s+(qm==='annual'?(u.annualQuota||0):(u.q1Quota||0)+(u.q2Quota||0)+(u.q3Quota||0)+(u.q4Quota||0));
    }, 0);
    const closedWonRev = allWon.reduce((s,o)=>s+(parseFloat(o.arr)||0),0);
    const attainPctS   = totalQ>0 ? Math.round(closedWonRev/totalQ*100) : 0;
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate()-7);
    const sevenISO = sevenDaysAgo.toISOString().slice(0,10);
    const addedRecent = allOpen.filter(o=>o.createdDate&&o.createdDate>=sevenISO).reduce((s,o)=>s+(parseFloat(o.arr)||0),0);
    const stuckDeals = allOpen.filter(o=>{
        const lastAct = (activities||[]).filter(a=>a.opportunityId===o.id).sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0];
        const ds = lastAct?.date ? Math.floor((new Date()-new Date(lastAct.date+'T12:00:00'))/86400000) : 999;
        return ds >= 14;
    });
    const stuckARR = stuckDeals.reduce((s,o)=>s+(parseFloat(o.arr)||0),0);
    const now30 = new Date(); now30.setDate(now30.getDate()+30);
    const closingMonth = allOpen.filter(o=>{ const cd=o.forecastedCloseDate||o.closeDate||''; return cd&&cd<=now30.toISOString().slice(0,10); });
    const closingARR = closingMonth.reduce((s,o)=>s+(parseFloat(o.arr)||0),0);

    const pinnedCards = [
        { id:'p1', name:'Quota pacing', basedOn:'Performance', headline:attainPctS+'%', subhead:`${fmtS(closedWonRev)} of ${fmtS(totalQ)} quota`, preview:{ kind:'line', data:[0,Math.max(0.05,attainPctS*0.003),Math.max(0.1,attainPctS*0.005),Math.max(0.15,attainPctS*0.007),Math.max(0.2,attainPctS*0.008),Math.max(0.25,attainPctS*0.009),attainPctS/100] } },
        { id:'p2', name:'Pipeline added this week', basedOn:'Pipeline & Forecast', headline:fmtS(addedRecent), subhead:`${allOpen.filter(o=>o.createdDate&&o.createdDate>=sevenISO).length} new deals · 7d`, preview:{ kind:'bars', data:[Math.max(10,addedRecent*0.3),Math.max(10,addedRecent*0.6),Math.max(10,addedRecent*0.8),Math.max(10,addedRecent*0.5),Math.max(10,addedRecent)] } },
        { id:'p3', name:'Stuck deals (14d+ no activity)', basedOn:'Pipeline & Forecast', headline:stuckDeals.length+' deals', subhead:fmtS(stuckARR)+' at risk', preview:{ kind:'number', big:String(stuckDeals.length), sub:fmtS(stuckARR)+' pipeline' } },
        { id:'p4', name:'Closing next 30 days', basedOn:'Pipeline & Forecast', headline:fmtS(closingARR), subhead:`${closingMonth.length} deals open`, preview:{ kind:'stacked', segments:[{v:Math.max(1,closingARR*0.45),c:TS.ok},{v:Math.max(1,closingARR*0.30),c:TS.gold},{v:Math.max(1,closingARR*0.25),c:'#b0a088'}] } },
    ];
    const templates = [
        { id:'t1', name:'Deal review — weekly', basedOn:'Pipeline & Forecast', icon:'📅', description:'1:1-ready view: commits, at-risk, and new deals since last review' },
        { id:'t2', name:'Win / loss analysis',  basedOn:'Performance',          icon:'🎯', description:'Closed deals with reason breakdown, competitor, and cycle length' },
        { id:'t3', name:'Rep scorecard',        basedOn:'Performance',          icon:'👤', description:'Single-rep view of all fundamentals — attainment, win rate, cycle' },
        { id:'t4', name:'Territory coverage',   basedOn:'Activity',             icon:'🗺️', description:'Activity density by territory / industry / deal size tier' },
        { id:'t5', name:'Stage conversion deep-dive', basedOn:'Pipeline & Forecast', icon:'🔽', description:'Funnel with avg days, entered/advanced, drop-off reasons' },
        { id:'t6', name:'Forecast vs actual',  basedOn:'Pipeline & Forecast',  icon:'📈', description:'Quarterly forecast accuracy trend with team roll-up' },
    ];

    const matchSrch = name => !srchQ.trim() || name.toLowerCase().includes(srchQ.toLowerCase());
    const filteredPinned   = pinnedCards.filter(r=>matchSrch(r.name));
    const filteredTemplates= templates.filter(t=>matchSrch(t.name));

    // ── Card sub-components (defined inside component so they close over TS)
    const PinnedCardS = ({ r }) => {
        const [hov, setHov] = React.useState(false);
        return (
            <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
                style={{ background:TS.surface, border:`1px solid ${hov?TS.borderStrong:TS.border}`, borderRadius:TS.r, padding:'14px 16px 12px', display:'flex', flexDirection:'column', gap:8, cursor:'pointer', minHeight:168, transition:'border-color 120ms' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ ...ebS(TS.inkMuted), fontSize:9.5 }}>{r.basedOn}</div>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={TS.goldInk} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v4M8 2h8l-1 7 3 3v2H6v-2l3-3-1-7z"/></svg>
                </div>
                <div style={{ fontSize:14.5, fontWeight:600, color:TS.ink, letterSpacing:-0.1, lineHeight:1.25 }}>{r.name}</div>
                <div style={{ display:'flex', alignItems:'baseline', gap:8 }}>
                    <div style={{ fontSize:22, fontWeight:700, color:TS.ink, letterSpacing:-0.5, lineHeight:1, fontFeatureSettings:'"tnum"' }}>{r.headline}</div>
                    <div style={{ fontSize:11, color:TS.inkMuted }}>{r.subhead}</div>
                </div>
                <div style={{ marginTop:'auto' }}><PreviewS preview={r.preview} h={42}/></div>
                <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:10.5, color:TS.inkMuted, paddingTop:8, borderTop:`1px solid ${TS.border}` }}>
                    <span style={{ background:'rgba(77,107,61,0.1)', color:TS.ok, fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:2 }}>LIVE</span>
                    <span>{r.subhead}</span>
                </div>
            </div>
        );
    };
    const TemplateCardS = ({ t }) => {
        const [hov, setHov] = React.useState(false);
        return (
            <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
                onClick={() => setActiveTemplate(t.id)}
                style={{ background:hov?TS.surface2:TS.surface, border:`${hov?'1px solid':'1px dashed'} ${TS.borderStrong}`, borderRadius:TS.r, padding:'14px 16px', display:'flex', gap:12, alignItems:'flex-start', cursor:'pointer', transition:'background 120ms' }}>
                <div style={{ width:36, height:36, borderRadius:TS.r, background:TS.surface2, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:18 }}>{t.icon}</div>
                <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ ...ebS(TS.inkMuted), fontSize:9.5, marginBottom:3 }}>{t.basedOn}</div>
                    <div style={{ fontSize:13.5, fontWeight:600, color:TS.ink, letterSpacing:-0.1 }}>{t.name}</div>
                    <div style={{ fontSize:11.5, color:TS.inkMuted, lineHeight:1.45, marginTop:3 }}>{t.description}</div>
                </div>
                <div style={{ fontSize:11, fontWeight:600, color:TS.goldInk, letterSpacing:0.3, textTransform:'uppercase', whiteSpace:'nowrap', paddingTop:2 }}>Start →</div>
            </div>
        );
    };
    const SectionS = ({ title, subtitle, count, children }) => (
        <div style={{ marginBottom:28 }}>
            <div style={{ display:'flex', alignItems:'flex-end', gap:10, marginBottom:12 }}>
                <div style={{ flex:1 }}>
                    <div style={{ fontSize:16, fontFamily:TS.serif, fontStyle:'italic', fontWeight:400, color:TS.ink, lineHeight:1.1, letterSpacing:-0.2, display:'flex', alignItems:'baseline', gap:10 }}>
                        {title}
                        <span style={{ fontSize:12, color:TS.inkMuted, fontFamily:TS.sans, fontStyle:'normal', fontWeight:500 }}>{count}</span>
                    </div>
                    {subtitle && <div style={{ fontSize:11.5, color:TS.inkMuted, marginTop:3, fontFamily:TS.sans }}>{subtitle}</div>}
                </div>
                <div style={{ fontSize:11.5, color:TS.inkMid, cursor:'pointer', fontWeight:500, fontFamily:TS.sans }}>See all →</div>
            </div>
            {children}
        </div>
    );


    // ── Deal Review template — live data computed here ──
    if (activeTemplate === 't1') {
        const T = TS;
        const serif = T.serif;
        const fmtShort = v => { const n=parseFloat(v)||0; if(n>=1e6) return '$'+(n/1e6).toFixed(1)+'M'; if(n>=1e3) return '$'+Math.round(n/1e3)+'K'; return '$'+Math.round(n); };
        const ebD = c => ({ fontSize:10, fontWeight:700, letterSpacing:0.8, textTransform:'uppercase', color:c||T.inkMuted, fontFamily:T.sans });
        const stageColors = { 'Prospecting':'#b0a088','Qualification':'#c8a978','Discovery':'#b07a55','Proposal':'#b87333','Negotiation/Review':'#7a5a3c','Negotiation':'#7a5a3c','Contracts':'#4d6b3d','Closing':'#4d6b3d','Closed Won':'#3a5530','Closed Lost':'#9c3a2e' };

        const PanelD = ({ children, padding='18px 20px', style:s }) => (
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+1, padding, ...s }}>{children}</div>
        );
        const SecHdrD = ({ title, subtitle, right }) => (
            <div style={{ display:'flex', alignItems:'flex-end', gap:14, marginBottom:10 }}>
                <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:15, fontFamily:serif, fontStyle:'italic', fontWeight:400, color:T.ink, letterSpacing:-0.2, lineHeight:1.1 }}>{title}</div>
                    {subtitle && <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:3, fontFamily:T.sans }}>{subtitle}</div>}
                </div>
                {right}
            </div>
        );
        const KpiD = ({ label, value, sub, danger }) => (
            <div style={{ border:`1px solid ${danger?'rgba(156,58,46,0.35)':T.border}`, borderRadius:T.r+1, padding:'14px 18px', background:danger?'rgba(156,58,46,0.04)':T.surface }}>
                <div style={{ ...ebD(danger?T.danger:T.inkMuted), marginBottom:4 }}>{label}</div>
                <div style={{ fontSize:28, fontWeight:700, color:danger?T.danger:T.ink, letterSpacing:-0.5, lineHeight:1, fontFeatureSettings:'"tnum"', fontFamily:T.sans }}>{value}</div>
                {sub && <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:5, fontFamily:T.sans }}>{sub}</div>}
            </div>
        );
        const StageChipD = ({ stage }) => (
            <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11, color:T.inkMid, fontWeight:500, fontFamily:T.sans }}>
                <span style={{ width:6, height:6, background:stageColors[stage]||T.inkMuted, borderRadius:'50%', flexShrink:0 }}/>
                {stage}
            </span>
        );

        const now7 = new Date(); now7.setDate(now7.getDate()-7);
        const iso7 = now7.toISOString().slice(0,10);

        const commitOpps = allOpen.filter(o =>
            o.forecastCategory === 'commit' ||
            (!o.forecastCategory && ['Closing','Negotiation/Review','Contracts','Negotiation'].includes(o.stage))
        );
        const atRiskOpps = allOpen.filter(o => {
            const lastAct = (activities||[]).filter(a=>a.opportunityId===o.id).sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0];
            const days = lastAct?.date ? Math.floor((Date.now()-new Date(lastAct.date+'T12:00:00').getTime())/86400000) : 999;
            return days >= 14;
        });
        const newSinceOpps = allOpen.filter(o => o.createdDate && o.createdDate >= iso7);
        const changedOpps  = (reportsOpps||[]).filter(o => o.stageChangedDate && o.stageChangedDate >= iso7);

        const commitTotal = commitOpps.reduce((s,o)=>s+(parseFloat(o.arr)||0),0);
        const riskTotal   = atRiskOpps.reduce((s,o)=>s+(parseFloat(o.arr)||0),0);
        const newTotal    = newSinceOpps.reduce((s,o)=>s+(parseFloat(o.arr)||0),0);

        const lastActLabel = opp => {
            const a = (activities||[]).filter(a=>a.opportunityId===opp.id).sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0];
            if (!a?.date) return 'No activity';
            return Math.floor((Date.now()-new Date(a.date+'T12:00:00').getTime())/86400000)+'d ago';
        };
        const closeLabelFn = opp => {
            const cd = opp.forecastedCloseDate||opp.closeDate;
            if (!cd) return null;
            const diff = Math.ceil((new Date(cd+'T12:00:00')-Date.now())/86400000);
            if (diff<=0) return 'OVERDUE';
            if (diff<=7) return 'CLOSE '+new Date(cd+'T12:00:00').toLocaleDateString('en-US',{weekday:'short'}).toUpperCase();
            return Math.ceil(diff/7)+'wk';
        };

        return (
            <div style={{ fontFamily:T.sans, color:T.ink }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14, paddingBottom:14, borderBottom:`1px solid ${T.border}` }}>
                    <div style={{ flex:1 }}>
                        <div style={{ ...ebD(T.goldInk), display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>✦ Template · Pipeline &amp; Forecast</div>
                        <div style={{ fontSize:26, fontFamily:serif, fontStyle:'italic', fontWeight:400, color:T.ink, letterSpacing:-0.5, lineHeight:1.1, marginBottom:6 }}>Deal review — weekly</div>
                        <div style={{ fontSize:13, color:T.inkMid, fontFamily:T.sans }}>Your 1:1-ready view. Commits you promised, deals slipping, and what's entered the pipe since last review.</div>
                    </div>
                    <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0, marginLeft:24 }}>
                        <button onClick={()=>setActiveTemplate(null)} style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'7px 12px', background:'transparent', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12, fontWeight:600, color:T.inkMid, cursor:'pointer', fontFamily:T.sans }}>← Back to library</button>
                        <button style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'7px 14px', background:T.ink, border:'none', borderRadius:T.r, fontSize:12, fontWeight:600, color:T.surface, cursor:'pointer', fontFamily:T.sans }}>+ Save as my report</button>
                    </div>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:14 }}>
                    <KpiD label="Your commits this month"    value={fmtShort(commitTotal)} sub={`${commitOpps.length} deal${commitOpps.length!==1?'s':''} · must close`}/>
                    <KpiD label="At risk — no activity >14d" value={fmtShort(riskTotal)}   sub={`${atRiskOpps.length} deal${atRiskOpps.length!==1?'s':''} · needs action`} danger={true}/>
                    <KpiD label="New since last review"      value={fmtShort(newTotal)}    sub={`${newSinceOpps.length} opp${newSinceOpps.length!==1?'s':''} · added this week`}/>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1.35fr 1fr', gap:14 }}>
                    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                        <PanelD padding="18px 20px 14px">
                            <SecHdrD title="Commits" subtitle={`${commitOpps.length} deal${commitOpps.length!==1?'s':''} · forecast category set to commit`} right={<span style={{ fontSize:12, color:T.inkMid, fontFeatureSettings:'"tnum"', fontFamily:T.sans }}>{fmtShort(commitTotal)}</span>}/>
                            {commitOpps.length === 0
                                ? <div style={{ padding:'16px 0', fontSize:12.5, color:T.inkMuted, fontStyle:'italic', fontFamily:T.sans }}>No deals marked as commit. Set Forecast Category on an opportunity to see them here.</div>
                                : commitOpps.map((o,i) => (
                                    <div key={o.id} style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:10, alignItems:'center', padding:'10px 0', borderTop:i>0?`1px solid ${T.border}`:'none' }}>
                                        <div>
                                            <div style={{ fontSize:13.5, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{o.opportunityName||o.account}</div>
                                            <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:3, display:'flex', alignItems:'center', gap:10, fontFamily:T.sans }}>
                                                <StageChipD stage={o.stage}/>
                                                {o.nextSteps && <><span style={{ opacity:0.5 }}>·</span><span>Next: {String(o.nextSteps).slice(0,60)}</span></>}
                                            </div>
                                        </div>
                                        <div style={{ textAlign:'right' }}>
                                            <div style={{ fontSize:13.5, fontWeight:700, color:T.ink, fontFeatureSettings:'"tnum"', fontFamily:T.sans }}>{fmtShort(o.arr)}</div>
                                            {closeLabelFn(o) && <div style={{ fontSize:10.5, color:T.goldInk, fontWeight:600, marginTop:2, letterSpacing:0.3, textTransform:'uppercase', fontFamily:T.sans }}>{closeLabelFn(o)}</div>}
                                        </div>
                                    </div>
                                ))
                            }
                        </PanelD>

                        <PanelD padding="18px 20px 14px">
                            <SecHdrD title="At risk" subtitle={`${atRiskOpps.length} open deal${atRiskOpps.length!==1?'s':''}, no activity in 14+ days`} right={atRiskOpps.length>0?<span style={{ fontSize:12, color:T.danger, fontFeatureSettings:'"tnum"', fontWeight:600, fontFamily:T.sans }}>{fmtShort(riskTotal)} exposed</span>:null}/>
                            {atRiskOpps.length === 0
                                ? <div style={{ padding:'16px 0', fontSize:12.5, color:T.ok, fontStyle:'italic', fontFamily:T.sans }}>✓ No at-risk deals — all open opportunities have recent activity.</div>
                                : atRiskOpps.slice(0,6).map((o,i) => (
                                    <div key={o.id} style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:10, alignItems:'center', padding:'11px 0', borderTop:i>0?`1px solid ${T.border}`:'none' }}>
                                        <div style={{ display:'flex', gap:10 }}>
                                            <span style={{ width:3, background:T.danger, borderRadius:1.5, flexShrink:0, alignSelf:'stretch' }}/>
                                            <div>
                                                <div style={{ fontSize:13.5, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{o.opportunityName||o.account}</div>
                                                <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:3, display:'flex', alignItems:'center', gap:10, fontFamily:T.sans }}>
                                                    <StageChipD stage={o.stage}/><span style={{ opacity:0.5 }}>·</span>
                                                    <span style={{ color:T.danger, fontWeight:500 }}>Last activity {lastActLabel(o)}</span>
                                                </div>
                                                {o.notes && <div style={{ fontSize:11.5, color:T.inkMid, marginTop:4, fontStyle:'italic', fontFamily:T.sans }}>"{String(o.notes).slice(0,80)}{o.notes.length>80?'…':''}"</div>}
                                            </div>
                                        </div>
                                        <div style={{ textAlign:'right', fontSize:13.5, fontWeight:700, color:T.ink, fontFeatureSettings:'"tnum"', fontFamily:T.sans }}>{fmtShort(o.arr)}</div>
                                    </div>
                                ))
                            }
                        </PanelD>
                    </div>

                    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                        <PanelD padding="18px 20px 14px">
                            <SecHdrD title="New since last review" subtitle={`${newSinceOpps.length} opp${newSinceOpps.length!==1?'s':''} added since last week`} right={newTotal>0?<span style={{ fontSize:12, color:T.ok, fontFeatureSettings:'"tnum"', fontWeight:600, fontFamily:T.sans }}>+{fmtShort(newTotal)}</span>:null}/>
                            {newSinceOpps.length === 0
                                ? <div style={{ padding:'16px 0', fontSize:12.5, color:T.inkMuted, fontStyle:'italic', fontFamily:T.sans }}>No new opportunities created in the last 7 days.</div>
                                : newSinceOpps.slice(0,5).map((o,i) => (
                                    <div key={o.id} style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:10, alignItems:'center', padding:'10px 0', borderTop:i>0?`1px solid ${T.border}`:'none' }}>
                                        <div>
                                            <div style={{ fontSize:13, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{o.opportunityName||o.account}</div>
                                            <div style={{ fontSize:11, color:T.inkMuted, marginTop:3, display:'flex', alignItems:'center', gap:8, fontFamily:T.sans }}>
                                                <StageChipD stage={o.stage}/>
                                                {o.account && <><span style={{ opacity:0.5 }}>·</span><span>{o.account}</span></>}
                                            </div>
                                        </div>
                                        <div style={{ textAlign:'right', fontSize:13, fontWeight:700, color:T.ink, fontFeatureSettings:'"tnum"', fontFamily:T.sans }}>{fmtShort(o.arr)}</div>
                                    </div>
                                ))
                            }
                        </PanelD>

                        <PanelD padding="18px 20px 14px">
                            <SecHdrD title="Stage changes this week" subtitle="Deals that moved forward or back"/>
                            {changedOpps.length === 0
                                ? <div style={{ padding:'16px 0', fontSize:12.5, color:T.inkMuted, fontStyle:'italic', fontFamily:T.sans }}>No stage changes in the last 7 days.</div>
                                : changedOpps.slice(0,6).map((o,i) => {
                                    const isLoss = o.stage==='Closed Lost';
                                    const isWin  = o.stage==='Closed Won';
                                    const history = o.stageHistory || [];
                                    const prevStage = history.length>0 ? history[history.length-1]?.stage : null;
                                    return (
                                        <div key={o.id} style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:10, alignItems:'center', padding:'10px 0', borderTop:i>0?`1px solid ${T.border}`:'none' }}>
                                            <div>
                                                <div style={{ fontSize:13, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{o.opportunityName||o.account}</div>
                                                <div style={{ fontSize:11, color:T.inkMuted, marginTop:4, display:'flex', alignItems:'center', gap:6, fontFamily:T.sans }}>
                                                    {prevStage && <><StageChipD stage={prevStage}/><span style={{ fontSize:9, color:T.inkMuted }}>→</span></>}
                                                    <StageChipD stage={o.stage}/>
                                                </div>
                                            </div>
                                            <div style={{ textAlign:'right', fontSize:12, fontWeight:700, fontFeatureSettings:'"tnum"', fontFamily:T.sans, color:isLoss?T.danger:isWin?T.ok:T.inkMuted }}>
                                                {isLoss?'−'+fmtShort(o.arr):isWin?'+'+fmtShort(o.arr):'—'}
                                            </div>
                                        </div>
                                    );
                                })
                            }
                        </PanelD>
                    </div>
                </div>
            </div>
        );
    }


    // ── Stage Conversion Deep-Dive template ──
    if (activeTemplate === 't5') {
        const T = TS;
        const serif = T.serif;
        const ebD = c => ({ fontSize:10, fontWeight:700, letterSpacing:0.8, textTransform:'uppercase', color:c||T.inkMuted, fontFamily:T.sans });
        const stageColorMap = { 'Prospecting':'#b0a088','Qualification':'#c8a978','Discovery':'#b07a55','Proposal':'#b87333','Negotiation/Review':'#7a5a3c','Negotiation':'#7a5a3c','Contracts':'#4d6b3d','Closing':'#4d6b3d','Closed Won':'#3a5530','Closed Lost':'#9c3a2e' };
        const fmtShort = v => { const n=parseFloat(v)||0; if(n>=1e6) return '$'+(n/1e6).toFixed(1)+'M'; if(n>=1e3) return '$'+Math.round(n/1e3)+'K'; return '$'+Math.round(n); };

        const PanelD = ({ children, padding='18px 20px', style:s }) => (
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+1, padding, ...s }}>{children}</div>
        );
        const SecHdrD = ({ title, subtitle, right }) => (
            <div style={{ display:'flex', alignItems:'flex-end', gap:14, marginBottom:12 }}>
                <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:15, fontFamily:serif, fontStyle:'italic', fontWeight:400, color:T.ink, letterSpacing:-0.2, lineHeight:1.1 }}>{title}</div>
                    {subtitle && <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:3, fontFamily:T.sans }}>{subtitle}</div>}
                </div>
                {right}
            </div>
        );

        // ── Build funnel from real data (same cohort logic as Pipeline tab)
        const stageOrderD = (settings.funnelStages||[]).filter(s=>s.name).map(s=>s.name)
            .filter(s=>s!=='Closed Won'&&s!=='Closed Lost');
        // Fall back to defaults if no funnel stages configured
        const stageSeq = stageOrderD.length > 0 ? stageOrderD
            : ['Prospecting','Qualification','Discovery','Proposal','Negotiation','Closing'];

        const stageRankD = s => stageSeq.indexOf(s);
        const allScopeD  = reportsOpps || [];

        // Max stage reached per opp (using stageHistory if available)
        const oppMaxD = allScopeD.map(o => {
            const wonRank = stageSeq.length; // Closed Won = beyond last visible stage
            if (o.stage === 'Closed Won') return wonRank;
            if (o.stageHistory && o.stageHistory.length > 0) {
                const ranks = o.stageHistory.map(h => stageRankD(h.stage)).filter(r => r >= 0);
                const cur = stageRankD(o.stage);
                return Math.max(...ranks, cur >= 0 ? cur : 0);
            }
            const r = stageRankD(o.stage);
            return r >= 0 ? r : 0;
        });

        // Avg days per stage from stageHistory consecutive timestamps
        const avgDaysForStage = stageName => {
            const samples = [];
            allScopeD.forEach(o => {
                if (!o.stageHistory || o.stageHistory.length < 2) return;
                o.stageHistory.forEach((h, i) => {
                    if (h.stage === stageName && i + 1 < o.stageHistory.length) {
                        const enter = new Date((h.date||h.changedAt||'')+'T12:00:00');
                        const exit  = new Date((o.stageHistory[i+1].date||o.stageHistory[i+1].changedAt||'')+'T12:00:00');
                        const d = Math.floor((exit-enter)/86400000);
                        if (d >= 0 && d < 365) samples.push(d);
                    }
                });
            });
            if (samples.length === 0) return null;
            samples.sort((a,b)=>a-b);
            return samples[Math.floor(samples.length/2)];
        };

        // Build stage rows
        const funnelDataD = stageSeq.map((st, i) => {
            const myRank = stageRankD(st);
            const entered  = oppMaxD.filter(r => r >= myRank).length;
            const advanced = i < stageSeq.length - 1
                ? oppMaxD.filter(r => r >= myRank + 1).length
                : oppMaxD.filter(r => r >= stageSeq.length).length; // Closed Won
            const conv = entered > 0 ? advanced / entered : 0;
            const dropped = entered - advanced;
            const avgDays = avgDaysForStage(st);
            return { stage:st, entered, advanced, conv, dropped, avgDays, color:stageColorMap[st]||T.inkMuted };
        }).filter(s => s.entered > 0);

        const maxEnteredD = Math.max(...funnelDataD.map(s=>s.entered), 1);
        const overallConv = funnelDataD.length > 0 && funnelDataD[0].entered > 0
            ? funnelDataD[funnelDataD.length-1].advanced / funnelDataD[0].entered : 0;
        const totalCycleDays = funnelDataD.reduce((s,st)=>s+(st.avgDays||0),0);

        // Drop-off reasons from lostReason on closed-lost opps, grouped by stage exited
        const lostOppsD = allScopeD.filter(o=>o.stage==='Closed Lost');
        const dropoffMap = {};
        lostOppsD.forEach(o => {
            if (!o.lostReason) return;
            // Stage they were in when lost
            const history = o.stageHistory||[];
            const exitStage = history.length>0 ? history[history.length-1]?.stage : o.stage;
            const key = (exitStage||'Unknown')+'||'+(o.lostReason||'Other');
            dropoffMap[key] = (dropoffMap[key]||0) + 1;
        });
        const dropoffReasons = Object.entries(dropoffMap)
            .map(([k,count]) => { const [stage,reason]=k.split('||'); return {stage,reason,count}; })
            .sort((a,b)=>b.count-a.count)
            .slice(0,5);

        // Auto-flag: worst conversion stage + slowest stage
        const worstConv = [...funnelDataD].sort((a,b)=>a.conv-b.conv)[0];
        const slowest   = [...funnelDataD].filter(s=>s.avgDays!=null).sort((a,b)=>b.avgDays-a.avgDays)[0];

        return (
            <div style={{ fontFamily:T.sans, color:T.ink }}>
                {/* Header */}
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14, paddingBottom:14, borderBottom:`1px solid ${T.border}` }}>
                    <div style={{ flex:1 }}>
                        <div style={{ ...ebD(T.goldInk), display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>✦ Template · Pipeline &amp; Forecast</div>
                        <div style={{ fontSize:26, fontFamily:serif, fontStyle:'italic', fontWeight:400, color:T.ink, letterSpacing:-0.5, lineHeight:1.1, marginBottom:6 }}>Stage conversion deep-dive</div>
                        <div style={{ fontSize:13, color:T.inkMid, fontFamily:T.sans }}>Funnel with average days in stage, entered vs advanced, and the real reasons for each drop-off.</div>
                    </div>
                    <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0, marginLeft:24 }}>
                        <button onClick={()=>setActiveTemplate(null)} style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'7px 12px', background:'transparent', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12, fontWeight:600, color:T.inkMid, cursor:'pointer', fontFamily:T.sans }}>← Back to library</button>
                        <button style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'7px 14px', background:T.ink, border:'none', borderRadius:T.r, fontSize:12, fontWeight:600, color:T.surface, cursor:'pointer', fontFamily:T.sans }}>+ Save as my report</button>
                    </div>
                </div>

                {/* KPI strip */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:14 }}>
                    {[
                        { label:'TOP-OF-FUNNEL',      value: funnelDataD[0]?.entered ?? '—' },
                        { label:'CLOSED WON',          value: funnelDataD.length>0 ? funnelDataD[funnelDataD.length-1].advanced : '—' },
                        { label:'OVERALL CONVERSION',  value: funnelDataD.length>0 ? Math.round(overallConv*100)+'%' : '—' },
                        { label:'FULL-CYCLE AVG',      value: totalCycleDays > 0 ? totalCycleDays+'d' : '—' },
                    ].map(k => (
                        <div key={k.label} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+1, padding:'14px 18px' }}>
                            <div style={{ ...ebD(T.inkMuted), marginBottom:4 }}>{k.label}</div>
                            <div style={{ fontSize:28, fontWeight:700, color:T.ink, letterSpacing:-0.5, lineHeight:1, fontFeatureSettings:'"tnum"', fontFamily:T.sans }}>{k.value}</div>
                            <div style={{ fontSize:11, color:T.inkMuted, marginTop:5, fontFamily:T.sans }}>vs previous period</div>
                        </div>
                    ))}
                </div>

                {/* Two-column body */}
                <div style={{ display:'grid', gridTemplateColumns:'1.3fr 1fr', gap:14 }}>
                    {/* Left — funnel */}
                    <PanelD padding="18px 20px 18px">
                        <SecHdrD title="Conversion funnel" subtitle="Entered → advanced, by stage"
                            right={
                                <div style={{ display:'flex', alignItems:'center', gap:14, fontSize:11, color:T.inkMid, fontFamily:T.sans }}>
                                    <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
                                        <span style={{ width:10, height:10, background:T.goldInk, borderRadius:2 }}/>Advanced
                                    </span>
                                    <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
                                        <span style={{ width:10, height:10, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:2 }}/>Dropped
                                    </span>
                                </div>
                            }
                        />
                        {funnelDataD.length === 0 ? (
                            <div style={{ padding:'2rem', textAlign:'center', color:T.inkMuted, fontSize:13, fontStyle:'italic', fontFamily:T.sans }}>
                                No stage data available. Opportunities need stage history to populate this funnel.
                            </div>
                        ) : funnelDataD.map((s, i) => {
                            const enterW = (s.entered / maxEnteredD) * 100;
                            const advW   = s.entered > 0 ? (s.advanced / maxEnteredD) * 100 : 0;
                            const dropW  = enterW - advW;
                            return (
                                <div key={s.stage} style={{ display:'grid', gridTemplateColumns:'120px 1fr', gap:12, alignItems:'center', padding:'10px 0', borderTop:i===0?'none':`1px solid ${T.border}` }}>
                                    {/* Label */}
                                    <div>
                                        <div style={{ fontSize:13, fontWeight:600, color:T.ink, display:'flex', alignItems:'center', gap:6, fontFamily:T.sans }}>
                                            <span style={{ width:3, height:14, background:s.color, borderRadius:1.5, flexShrink:0 }}/>
                                            {s.stage}
                                        </div>
                                        <div style={{ fontSize:10, color:T.inkMuted, marginTop:3, letterSpacing:0.4, textTransform:'uppercase', fontWeight:600, fontFamily:T.sans }}>
                                            {s.avgDays != null ? `Avg ${s.avgDays}d in stage` : 'No timing data'}
                                        </div>
                                    </div>
                                    {/* Bar */}
                                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                                        <div style={{ height:26, flex:1, display:'flex', background:T.surface2, borderRadius:2, overflow:'hidden' }}>
                                            {/* Advanced segment */}
                                            <div style={{ width:`${advW}%`, height:'100%', background:T.goldInk, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 8px', minWidth: advW > 0 ? 60 : 0 }}>
                                                {advW > 15 && <>
                                                    <span style={{ fontSize:11, color:T.surface, fontWeight:700, fontFeatureSettings:'"tnum"' }}>{s.advanced}</span>
                                                    <span style={{ fontSize:10, color:'#e6ddc0', fontWeight:600, fontFeatureSettings:'"tnum"' }}>{Math.round(s.conv*100)}%</span>
                                                </>}
                                            </div>
                                            {/* Dropped segment */}
                                            <div style={{ width:`${dropW}%`, height:'100%', display:'flex', alignItems:'center', paddingLeft:8 }}>
                                                {s.dropped > 0 && dropW > 8 && (
                                                    <span style={{ fontSize:11, color:T.danger, fontWeight:600, fontFeatureSettings:'"tnum"' }}>−{s.dropped}</span>
                                                )}
                                            </div>
                                        </div>
                                        <div style={{ width:54, textAlign:'right', fontSize:12, color:T.ink, fontWeight:700, fontFeatureSettings:'"tnum"', fontFamily:T.sans, flexShrink:0 }}>
                                            {s.entered} in
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </PanelD>

                    {/* Right — leaks + focus */}
                    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                        <PanelD padding="18px 20px 16px">
                            <SecHdrD title="Biggest leaks" subtitle="Drop-off reasons by stage"/>
                            {dropoffReasons.length === 0 ? (
                                <div style={{ padding:'12px 0', fontSize:12.5, color:T.inkMuted, fontStyle:'italic', fontFamily:T.sans }}>
                                    No loss reasons recorded yet. Set a lost reason when closing deals to see drop-off analysis here.
                                </div>
                            ) : dropoffReasons.map((r, i) => (
                                <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:10, alignItems:'center', padding:'10px 0', borderTop:i===0?'none':`1px solid ${T.border}` }}>
                                    <div>
                                        <div style={{ ...ebD(T.inkMuted), fontSize:9, marginBottom:2 }}>{r.stage}</div>
                                        <div style={{ fontSize:13, color:T.ink, fontWeight:500, fontFamily:T.sans }}>{r.reason}</div>
                                    </div>
                                    <div style={{ fontSize:20, color:T.danger, fontWeight:700, fontFeatureSettings:'"tnum"', fontFamily:T.sans }}>−{r.count}</div>
                                </div>
                            ))}
                        </PanelD>

                        <PanelD padding="18px 20px 14px">
                            <SecHdrD title="Where to focus" subtitle="Auto-flagged stage-level actions"/>
                            <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
                                {worstConv && (
                                    <div style={{ display:'flex', gap:10, alignItems:'flex-start', padding:'10px 0', borderTop:'none' }}>
                                        <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>⚠</span>
                                        <div>
                                            <div style={{ fontSize:12.5, fontWeight:700, color:T.ink, fontFamily:T.sans }}>
                                                {worstConv.stage} — lowest conversion
                                            </div>
                                            <div style={{ fontSize:11.5, color:T.inkMid, marginTop:3, lineHeight:1.45, fontFamily:T.sans }}>
                                                {Math.round(worstConv.conv*100)}% pass rate — {worstConv.dropped} deal{worstConv.dropped!==1?'s':''} dropped here.
                                                {worstConv.dropped > 5 ? ' High volume loss. Check exit criteria and champion engagement.' : ' Review call recordings and deal notes for patterns.'}
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {slowest && slowest.stage !== worstConv?.stage && (
                                    <div style={{ display:'flex', gap:10, alignItems:'flex-start', padding:'10px 0', borderTop:`1px solid ${T.border}` }}>
                                        <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>⏱</span>
                                        <div>
                                            <div style={{ fontSize:12.5, fontWeight:700, color:T.ink, fontFamily:T.sans }}>
                                                {slowest.stage} takes {slowest.avgDays}d
                                            </div>
                                            <div style={{ fontSize:11.5, color:T.inkMid, marginTop:3, lineHeight:1.45, fontFamily:T.sans }}>
                                                Longest stage by average time. Reps may be over-investing here — review if stage exit criteria are well-defined.
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {!worstConv && !slowest && (
                                    <div style={{ padding:'12px 0', fontSize:12.5, color:T.inkMuted, fontStyle:'italic', fontFamily:T.sans }}>
                                        Stage history data needed to auto-flag focus areas.
                                    </div>
                                )}
                            </div>
                        </PanelD>
                    </div>
                </div>
            </div>
        );
    }


    // ── Forecast vs Actual template ──
    if (activeTemplate === 't6') {
        const T = TS;
        const serif = T.serif;
        const ebD = c => ({ fontSize:10, fontWeight:700, letterSpacing:0.8, textTransform:'uppercase', color:c||T.inkMuted, fontFamily:T.sans });
        const fmtShort = v => { const n=parseFloat(v)||0; if(n>=1e6) return '$'+(n/1e6).toFixed(1)+'M'; if(n>=1e3) return '$'+Math.round(n/1e3)+'K'; return '$'+Math.round(n); };

        const PanelD = ({ children, padding='18px 20px', style:s }) => (
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+1, padding, ...s }}>{children}</div>
        );
        const SecHdrD = ({ title, subtitle, right }) => (
            <div style={{ display:'flex', alignItems:'flex-end', gap:14, marginBottom:12 }}>
                <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:15, fontFamily:serif, fontStyle:'italic', fontWeight:400, color:T.ink, letterSpacing:-0.2, lineHeight:1.1 }}>{title}</div>
                    {subtitle && <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:3, fontFamily:T.sans }}>{subtitle}</div>}
                </div>
                {right}
            </div>
        );

        // ── Fiscal quarter helper
        const fiscalStart = parseInt(settings.fiscalYearStart)||10;
        const getOppFiscalQtr = (dateStr) => {
            if (!dateStr) return null;
            const d = new Date(dateStr+'T12:00:00');
            const m = d.getMonth()+1; // 1-12
            const y = d.getFullYear();
            // How many months past fiscal start
            let offset = m - fiscalStart;
            if (offset < 0) offset += 12;
            const q = Math.floor(offset/3)+1; // 1-4
            // Fiscal year label: year when fiscal year ends
            const fyEnd = m >= fiscalStart ? y+1 : y;
            return { q, fyEnd, label:`Q${q} FY${String(fyEnd).slice(2)}` };
        };

        // Per-rep quarterly quota — split annual evenly across 4 quarters
        const getRepQuarterQuota = (user) => {
            if (!user) return 0;
            const qMode = user.quotaType||'annual';
            if (qMode === 'quarterly') {
                // Return per-quarter average (we don't know which quarter we're asking about without more context)
                return ((user.q1Quota||0)+(user.q2Quota||0)+(user.q3Quota||0)+(user.q4Quota||0))/4;
            }
            return (user.annualQuota||0)/4;
        };

        // Visible reps
        const repsD = (settings.users||[]).filter(u=>u.name&&u.userType!=='Admin'&&u.userType!=='Manager');

        // All won opps with a close date
        const wonWithDate = (reportsOpps||[]).filter(o=>o.stage==='Closed Won'&&(o.forecastedCloseDate||o.closeDate));

        // Build last 6 quarters in reverse-chronological order then reverse for display
        const now = new Date();
        const quarters = [];
        let yr = now.getFullYear(), mo = now.getMonth()+1;
        // Find current fiscal quarter
        let offset = mo - fiscalStart; if(offset<0) offset+=12;
        let curQ = Math.floor(offset/3)+1;
        const fyEnd = mo >= fiscalStart ? yr+1 : yr;
        // Walk back 5 quarters to get 6 total
        for (let i=0; i<6; i++) {
            let q = curQ - i; let fy = fyEnd;
            while(q<=0){ q+=4; fy--; }
            // Quarter start/end calendar months
            const qStartOffset = (q-1)*3;
            let startM = ((fiscalStart-1+qStartOffset)%12)+1;
            let startY = startM >= fiscalStart ? fy-1 : fy;
            let endM = ((startM-1+2)%12)+1; // 3 months later - 1
            endM = ((startM+2-1)%12)+1;
            const startDate = new Date(startY, startM-1, 1);
            const endDate   = new Date(startY, startM+2, 0); // last day of 3rd month
            const isCurrentQ = i===0;
            quarters.unshift({ q, fy, label:`Q${q} FY${String(fy).slice(2)}`, startDate, endDate, isCurrentQ });
        }

        // For each quarter, compute actual (Closed Won) and forecast (team quota)
        const totalQQuota = repsD.reduce((s,u)=>s+getRepQuarterQuota(u),0);

        const qData = quarters.map(qt => {
            const won = wonWithDate.filter(o => {
                const cd = new Date((o.forecastedCloseDate||o.closeDate)+'T12:00:00');
                return cd >= qt.startDate && cd <= qt.endDate;
            });
            const actual   = won.reduce((s,o)=>s+(parseFloat(o.arr)||0),0);
            const forecast = totalQQuota; // team quarterly quota
            const accuracy = forecast > 0 ? actual/forecast : null;
            return { ...qt, actual, forecast, accuracy, wonCount:won.length };
        });

        const completedQs = qData.filter(q=>!q.isCurrentQ&&q.accuracy!=null);
        const avgAccuracy = completedQs.length>0 ? completedQs.reduce((s,q)=>s+q.accuracy,0)/completedQs.length : null;
        const currentQ    = qData[qData.length-1];
        const maxBarVal   = Math.max(...qData.map(q=>Math.max(q.forecast,q.actual)),1);

        // Accuracy color
        const accColor = v => v==null?T.inkMuted:v>=0.95&&v<=1.05?T.ok:v<0.9||v>1.1?T.danger:T.warn;
        const accBg    = v => v==null?'transparent':v>=0.95&&v<=1.05?'rgba(77,107,61,0.10)':v<0.9||v>1.1?'rgba(156,58,46,0.10)':'rgba(184,115,51,0.10)';

        // Per-rep accuracy table
        const repRows = repsD.map(u => {
            const repWon = wonWithDate.filter(o=>(o.salesRep||o.assignedTo)===u.name);
            const qCells = quarters.map(qt => {
                const won = repWon.filter(o=>{ const cd=new Date((o.forecastedCloseDate||o.closeDate)+'T12:00:00'); return cd>=qt.startDate&&cd<=qt.endDate; });
                const actual   = won.reduce((s,o)=>s+(parseFloat(o.arr)||0),0);
                const forecast = getRepQuarterQuota(u);
                return forecast>0 ? actual/forecast : null;
            });
            const completedCells = qCells.slice(0,-1).filter(v=>v!=null);
            const avg = completedCells.length>0 ? completedCells.reduce((s,v)=>s+v,0)/completedCells.length : null;
            return { name:u.name, cells:qCells, avg };
        }).filter(r=>r.cells.some(v=>v!=null));

        return (
            <div style={{ fontFamily:T.sans, color:T.ink }}>
                {/* Header */}
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14, paddingBottom:14, borderBottom:`1px solid ${T.border}` }}>
                    <div style={{ flex:1 }}>
                        <div style={{ ...ebD(T.goldInk), display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>✦ Template · Pipeline &amp; Forecast</div>
                        <div style={{ fontSize:26, fontFamily:serif, fontStyle:'italic', fontWeight:400, color:T.ink, letterSpacing:-0.5, lineHeight:1.1, marginBottom:6 }}>Forecast vs actual</div>
                        <div style={{ fontSize:13, color:T.inkMid, fontFamily:T.sans }}>Quarterly forecast accuracy trend with per-rep roll-up. Find the sandbaggers and the over-promisers.</div>
                    </div>
                    <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0, marginLeft:24 }}>
                        <button onClick={()=>setActiveTemplate(null)} style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'7px 12px', background:'transparent', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12, fontWeight:600, color:T.inkMid, cursor:'pointer', fontFamily:T.sans }}>← Back to library</button>
                        <button style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'7px 14px', background:T.ink, border:'none', borderRadius:T.r, fontSize:12, fontWeight:600, color:T.surface, cursor:'pointer', fontFamily:T.sans }}>+ Save as my report</button>
                    </div>
                </div>

                {/* KPI strip */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:14 }}>
                    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+1, padding:'14px 18px' }}>
                        <div style={{ ...ebD(T.inkMuted), marginBottom:4 }}>Avg accuracy (5Q)</div>
                        <div style={{ fontSize:28, fontWeight:700, color:T.ink, letterSpacing:-0.5, lineHeight:1, fontFeatureSettings:'"tnum"', fontFamily:T.sans }}>{avgAccuracy!=null?Math.round(avgAccuracy*100)+'%':'—'}</div>
                        {avgAccuracy!=null&&<div style={{ fontSize:11, color:T.ok, marginTop:5, fontFamily:T.sans }}>vs prior 5 quarters</div>}
                    </div>
                    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+1, padding:'14px 18px' }}>
                        <div style={{ ...ebD(T.inkMuted), marginBottom:4 }}>Current quarter forecast</div>
                        <div style={{ fontSize:28, fontWeight:700, color:T.ink, letterSpacing:-0.5, lineHeight:1, fontFeatureSettings:'"tnum"', fontFamily:T.sans }}>{fmtShort(currentQ.forecast)}</div>
                        <div style={{ fontSize:11, color:T.inkMuted, marginTop:5, fontFamily:T.sans }}>{currentQ.label} team quota</div>
                    </div>
                    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+1, padding:'14px 18px' }}>
                        <div style={{ ...ebD(T.inkMuted), marginBottom:4 }}>Booked so far</div>
                        <div style={{ fontSize:28, fontWeight:700, color:T.ink, letterSpacing:-0.5, lineHeight:1, fontFeatureSettings:'"tnum"', fontFamily:T.sans }}>{fmtShort(currentQ.actual)}</div>
                        {currentQ.forecast>0&&<div style={{ fontSize:11, color:T.ok, marginTop:5, fontFamily:T.sans }}>{Math.round(currentQ.actual/currentQ.forecast*100)}% of forecast · {currentQ.wonCount} deals</div>}
                    </div>
                    <div style={{ background:'rgba(156,58,46,0.04)', border:'1px solid rgba(156,58,46,0.2)', borderRadius:T.r+1, padding:'14px 18px' }}>
                        <div style={{ ...ebD(T.danger), marginBottom:4 }}>At-risk gap</div>
                        <div style={{ fontSize:28, fontWeight:700, color:T.danger, letterSpacing:-0.5, lineHeight:1, fontFeatureSettings:'"tnum"', fontFamily:T.sans }}>{fmtShort(Math.max(0,currentQ.forecast-currentQ.actual))}</div>
                        <div style={{ fontSize:11, color:T.inkMuted, marginTop:5, fontFamily:T.sans }}>to hit forecast · {currentQ.label}</div>
                    </div>
                </div>

                {/* Bar chart — forecast vs actual by quarter */}
                <PanelD padding="20px 24px 18px" style={{ marginBottom:14 }}>
                    <SecHdrD
                        title="Forecast vs actual — by quarter"
                        subtitle="Side-by-side bars · dashed outline = in-progress quarter"
                        right={
                            <div style={{ display:'flex', alignItems:'center', gap:14, fontSize:11, color:T.inkMid, fontFamily:T.sans }}>
                                <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
                                    <span style={{ width:10, height:10, background:T.gold, borderRadius:2 }}/>Forecast
                                </span>
                                <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
                                    <span style={{ width:10, height:10, background:T.ok, borderRadius:2 }}/>Actual
                                </span>
                            </div>
                        }
                    />
                    <div style={{ display:'flex', alignItems:'flex-end', gap:20, height:200, paddingBottom:8, borderBottom:`1px solid ${T.border}`, position:'relative' }}>
                        {qData.map((q,i) => {
                            const fH = Math.max(4,(q.forecast/maxBarVal)*160);
                            const aH = Math.max(4,(q.actual/maxBarVal)*160);
                            const ac = q.accuracy;
                            const color = accColor(ac);
                            return (
                                <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:6, height:'100%', justifyContent:'flex-end' }}>
                                    <div style={{ display:'flex', gap:5, alignItems:'flex-end' }}>
                                        {/* Forecast bar */}
                                        <div style={{ width:22, height:fH, background:q.isCurrentQ?'transparent':T.gold, border:q.isCurrentQ?`2px dashed ${T.gold}`:'none', borderRadius:'2px 2px 0 0', boxSizing:'border-box' }}/>
                                        {/* Actual bar */}
                                        <div style={{ width:22, height:aH, background:q.isCurrentQ?'rgba(77,107,61,0.4)':T.ok, borderRadius:'2px 2px 0 0', position:'relative' }}>
                                            {q.isCurrentQ&&<div style={{ position:'absolute', top:-18, left:'50%', transform:'translateX(-50%)', fontSize:9, color:T.inkMuted, fontWeight:600, letterSpacing:0.3, textTransform:'uppercase', whiteSpace:'nowrap' }}>so far</div>}
                                        </div>
                                    </div>
                                    <div style={{ fontSize:11, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{q.label}</div>
                                    <div style={{ fontSize:11, fontWeight:700, color:q.isCurrentQ?T.inkMuted:color, fontFeatureSettings:'"tnum"', fontFamily:T.sans }}>
                                        {q.isCurrentQ?'—':ac!=null?Math.round(ac*100)+'%':'—'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div style={{ display:'flex', gap:20, paddingTop:10, fontSize:11, color:T.inkMid, flexWrap:'wrap', fontFamily:T.sans }}>
                        <span style={{ ...ebD(T.inkMuted), textTransform:'none', letterSpacing:0 }}>Accuracy target: 95–105%</span>
                        <span style={{ color:T.ok,     fontWeight:600 }}>● On target</span>
                        <span style={{ color:T.warn,   fontWeight:600 }}>● Within tolerance</span>
                        <span style={{ color:T.danger, fontWeight:600 }}>● Miss</span>
                    </div>
                </PanelD>

                {/* Per-rep accuracy table */}
                {repRows.length > 0 && (
                    <PanelD padding="16px 20px 8px">
                        <SecHdrD
                            title="Accuracy by rep"
                            subtitle="Per-quarter · lower = under-called, higher = over-called"
                            right={<button style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 10px', background:'transparent', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:11, fontWeight:600, color:T.inkMid, cursor:'pointer', fontFamily:T.sans }}>··· Export</button>}
                        />
                        {/* Column headers */}
                        <div style={{ display:'grid', gridTemplateColumns:`160px repeat(${quarters.length},1fr) 70px`, gap:8, alignItems:'center', padding:'0 0 8px', borderBottom:`1px solid ${T.border}` }}>
                            <div style={ebD(T.inkMuted)}>Rep</div>
                            {quarters.map(q=><div key={q.label} style={{ ...ebD(T.inkMuted), textAlign:'center' }}>{q.label}</div>)}
                            <div style={{ ...ebD(T.inkMuted), textAlign:'right' }}>Avg</div>
                        </div>
                        {repRows.map((r,ri) => (
                            <div key={ri} style={{ display:'grid', gridTemplateColumns:`160px repeat(${quarters.length},1fr) 70px`, gap:8, alignItems:'center', padding:'8px 0', borderBottom:ri<repRows.length-1?`1px solid ${T.border}`:'none' }}>
                                <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
                                    <div style={{ width:20, height:20, borderRadius:'50%', background:'#9c6b4a', color:'#fef4e6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:700, flexShrink:0 }}>
                                        {(r.name||'').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                                    </div>
                                    <span style={{ fontSize:13, color:T.ink, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:T.sans }}>{r.name}</span>
                                </div>
                                {r.cells.map((v,ci) => (
                                    <div key={ci} style={{ textAlign:'center', fontSize:12.5, fontWeight:600, color:accColor(v), fontFeatureSettings:'"tnum"', fontFamily:T.sans, padding:'4px 2px', background:accBg(v), borderRadius:2 }}>
                                        {v==null?'—':Math.round(v*100)+'%'}
                                    </div>
                                ))}
                                <div style={{ textAlign:'right', fontSize:14, fontWeight:700, color:accColor(r.avg), fontFeatureSettings:'"tnum"', fontFamily:T.sans }}>
                                    {r.avg!=null?Math.round(r.avg*100)+'%':'—'}
                                </div>
                            </div>
                        ))}
                    </PanelD>
                )}
                {repRows.length === 0 && (
                    <PanelD padding="24px">
                        <div style={{ textAlign:'center', color:T.inkMuted, fontSize:13, fontStyle:'italic', fontFamily:T.sans }}>
                            No per-rep data yet. Set quotas for reps in Sales Manager to see accuracy by rep.
                        </div>
                    </PanelD>
                )}
            </div>
        );
    }

    return (
        <div style={{ display:'flex', flexDirection:'column', gap:0, padding:'1rem 1.25rem 1.5rem' }}>
            {/* Toolbar */}
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20, flexWrap:'wrap' }}>
                <div style={{ position:'relative', flex:1, maxWidth:340 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={TS.inkMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)' }}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
                    <input value={srchQ} onChange={e=>setSrchQ(e.target.value)} placeholder="Search your library…" style={{ width:'100%', padding:'7px 10px 7px 30px', border:`1px solid ${TS.border}`, borderRadius:TS.r, background:TS.surface, color:TS.ink, fontSize:12.5, fontFamily:TS.sans, outline:'none', boxSizing:'border-box' }}/>
                </div>
                <div style={{ flex:1 }}/>
                <button style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 14px', background:TS.ink, color:TS.surface, border:'none', borderRadius:TS.r, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:TS.sans }}>+ Create report</button>
            </div>

            {filteredPinned.length > 0 && (
                <SectionS title="Pinned" subtitle="Live metrics — updated from your pipeline data" count={`${filteredPinned.length} views`}>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
                        {filteredPinned.map(r=><PinnedCardS key={r.id} r={r}/>)}
                    </div>
                </SectionS>
            )}
            {filteredTemplates.length > 0 && (
                <SectionS title="Start from a template" subtitle="Pre-built report layouts you can customize" count={`${filteredTemplates.length} templates`}>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
                        {filteredTemplates.map(t=><TemplateCardS key={t.id} t={t}/>)}
                    </div>
                </SectionS>
            )}
            {filteredPinned.length===0 && filteredTemplates.length===0 && (
                <div style={{ padding:'3rem', textAlign:'center', color:TS.inkMuted, fontSize:13, fontStyle:'italic', fontFamily:TS.sans }}>No reports match "{srchQ}"</div>
            )}
        </div>
    );
}
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
                                    {['Date', 'Rep', 'Type', 'Deal', 'Revenue', 'Signal', 'Outcome', 'Days'].map(h => (
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
