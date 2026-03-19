import React, { useState, useEffect, useRef } from 'react';
import { stages } from '../../utils/constants';

export default function AnalyticsDashboard({ opportunities, settings, quotaData, accounts, users }) {
    const [analyticsExpanded, setAnalyticsExpanded] = useState({ forecast: true, metrics: true, stage: true, product: true, funnel: true, dealsByAccount: true, byTeam: true, byTerritory: true });

    const generateReport = (title, contentFn) => {
        const content = contentFn();
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        printWindow.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 2rem; color: #1e293b; }
                h1 { font-size: 1.5rem; border-bottom: 2px solid #2563eb; padding-bottom: 0.5rem; margin-bottom: 1rem; }
                h2 { font-size: 1.1rem; color: #64748b; margin-top: 1.5rem; }
                table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
                th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #e2e8f0; }
                th { background: #f1f3f5; font-weight: 700; font-size: 0.8rem; }
                td { font-size: 0.875rem; }
                .kpi-row { display: flex; gap: 2rem; margin: 1rem 0; }
                .kpi-item { text-align: center; }
                .kpi-label { font-size: 0.75rem; color: #64748b; }
                .kpi-val { font-size: 1.5rem; font-weight: 800; }
                .footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; font-size: 0.75rem; color: #94a3b8; }
                @media print { body { padding: 0.5rem; } }
            </style></head><body>
            <h1>${title}</h1>
            <div style="font-size:0.8rem;color:#64748b;margin-bottom:1rem">Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()} | Sales Pipeline Tracker</div>
            ${content}
            <div class="footer">Sales Pipeline Tracker Report - Confidential</div>
        </body></html>`);
        printWindow.document.close();
        setTimeout(() => printWindow.print(), 500);
    };

    const ReportBtn = ({ title, contentFn }) => (
        <button
            onClick={() => generateReport(title, contentFn)}
            title={'Generate ' + title + ' Report'}
            style={{
                background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px',
                padding: '0.25rem 0.5rem', cursor: 'pointer', fontSize: '0.7rem',
                color: '#64748b', fontWeight: '600', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: '0.25rem', transition: 'all 0.2s'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.color = '#1e293b'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#64748b'; }}
        >📄 Report</button>
    );
    // Build team and territory lists from user records
    const allTeams = [...new Set(users.filter(u => u.team).map(u => u.team))].sort();
    const allTerritories = [...new Set(users.filter(u => u.territory).map(u => u.territory))].sort();
    const allRepNames = [...new Set([
        ...users.filter(u => u.name).map(u => u.name),
        ...opportunities.filter(o => o.salesRep).map(o => o.salesRep)
    ])].sort();

    // Derive sliced opportunities — rep > team > territory priority; all filters ANDed
    const slicedOpportunities = opportunities;

    // Helper: get pipeline/won for a rep or group
    const getGroupStats = (opps) => {
        const open = opps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
        const won = opps.filter(o => o.stage === 'Closed Won');
        return {
            pipeline: open.reduce((s, o) => s + (o.arr || 0), 0),
            wonRev: won.reduce((s, o) => s + (o.arr || 0) + (o.implementationCost || 0), 0),
            openCount: open.length,
            wonCount: won.length,
            totalCount: opps.length,
        };
    };

    // By-team stats
    const teamStats = allTeams.map(team => {
        const teamUsers = users.filter(u => u.team === team).map(u => u.name);
        const teamOpps = opportunities.filter(o => teamUsers.includes(o.salesRep) || teamUsers.includes(o.assignedTo));
        return { group: team, ...getGroupStats(teamOpps), repCount: teamUsers.length };
    }).sort((a, b) => b.pipeline - a.pipeline);

    // By-territory stats
    const territoryStats = allTerritories.map(territory => {
        const terrUsers = users.filter(u => u.territory === territory).map(u => u.name);
        const terrOpps = opportunities.filter(o => terrUsers.includes(o.salesRep) || terrUsers.includes(o.assignedTo));
        return { group: territory, ...getGroupStats(terrOpps), repCount: terrUsers.length };
    }).sort((a, b) => b.pipeline - a.pipeline);

    const stageData = stages.map(stage => ({
        stage: stage,
        count: slicedOpportunities.filter(opp => opp.stage === stage).length,
        arr: slicedOpportunities.filter(opp => opp.stage === stage)
            .reduce((sum, opp) => sum + opp.arr, 0)
    })).filter(item => item.count > 0);

    // Use settings.products as the canonical list, fall back to deriving from data
    const settingsProductList = settings?.products || [];
    const dataProductList = [...new Set(
        slicedOpportunities
            .flatMap(opp => typeof opp.products === 'string' && opp.products
                ? opp.products.split(',').map(p => p.trim()).filter(Boolean)
                : [])
    )];
    const productList = settingsProductList.length > 0
        ? [...new Set([...settingsProductList, ...dataProductList])].sort()
        : dataProductList.sort();
    const productData = productList.map(product => ({
        product: product,
        count: slicedOpportunities.filter(opp => (opp.products || []).includes(product)).length,
        arr: slicedOpportunities.filter(opp => (opp.products || []).includes(product))
            .reduce((sum, opp) => sum + opp.arr, 0)
    }));

    const getQuarter = (dateString) => {
        const date = new Date(dateString);
        const month = date.getMonth() + 1;
        const fiscalStart = settings?.fiscalYearStart || 10;
        
        // Calculate quarters based on fiscal year start
        const q1Start = fiscalStart;
        const q2Start = (fiscalStart + 3) > 12 ? (fiscalStart + 3 - 12) : (fiscalStart + 3);
        const q3Start = (fiscalStart + 6) > 12 ? (fiscalStart + 6 - 12) : (fiscalStart + 6);
        const q4Start = (fiscalStart + 9) > 12 ? (fiscalStart + 9 - 12) : (fiscalStart + 9);
        
        // Determine quarter
        if (fiscalStart <= 3) {
            if (month >= fiscalStart && month < q2Start) return 'Q1';
            if (month >= q2Start && month < q3Start) return 'Q2';
            if (month >= q3Start && month < q4Start) return 'Q3';
            return 'Q4';
        } else if (fiscalStart <= 6) {
            if (month >= fiscalStart && month < q2Start) return 'Q1';
            if (month >= q2Start && month < q3Start) return 'Q2';
            if (month >= q3Start && month < q4Start) return 'Q3';
            return 'Q4';
        } else if (fiscalStart <= 9) {
            if (month >= fiscalStart && month < q4Start) return 'Q1';
            if (month >= q4Start || month < q2Start) return 'Q2';
            if (month >= q2Start && month < q3Start) return 'Q3';
            return 'Q4';
        } else {
            if (month >= q1Start || month < q2Start) return 'Q1';
            if (month >= q2Start && month < q3Start) return 'Q2';
            if (month >= q3Start && month < q4Start) return 'Q3';
            return 'Q4';
        }
    };

    const getQuarterLabel = (quarter, dateString) => {
        const date = new Date(dateString);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const fiscalStart = settings?.fiscalYearStart || 10;
        
        let fiscalYear;
        if (month >= fiscalStart) {
            fiscalYear = year + 1;
        } else {
            fiscalYear = year;
        }
        
        return `FY${fiscalYear} ${quarter}`;
    };

    const quarterlyData = {};
    opportunities.forEach(opp => {
        if (opp.forecastedCloseDate) {
            const quarter = getQuarter(opp.forecastedCloseDate);
            const quarterLabel = getQuarterLabel(quarter, opp.forecastedCloseDate);
            
            if (!quarterlyData[quarterLabel]) {
                quarterlyData[quarterLabel] = {
                    count: 0, arr: 0, implCost: 0, totalValue: 0,
                    closedCount: 0, closedValue: 0,
                    forecastCount: 0, forecastValue: 0,
                    sortKey: new Date(opp.forecastedCloseDate).getTime()
                };
            }
            const val = (opp.arr || 0) + (opp.implementationCost || 0);
            quarterlyData[quarterLabel].count++;
            quarterlyData[quarterLabel].arr += opp.arr;
            quarterlyData[quarterLabel].implCost += opp.implementationCost;
            quarterlyData[quarterLabel].totalValue += val;
            if (opp.stage === 'Closed Won') {
                quarterlyData[quarterLabel].closedCount++;
                quarterlyData[quarterLabel].closedValue += val;
            } else if (opp.stage !== 'Closed Lost') {
                quarterlyData[quarterLabel].forecastCount++;
                quarterlyData[quarterLabel].forecastValue += val;
            }
        }
    });

    const sortedQuarters = Object.entries(quarterlyData)
        .sort((a, b) => a[1].sortKey - b[1].sortKey);
    const maxValue = sortedQuarters.length > 0 ? Math.max(...sortedQuarters.map(([_, data]) => data.totalValue)) : 1;
    const fyTotalForecast = sortedQuarters.reduce((s, [_, d]) => s + d.forecastValue, 0);
    const fyTotalClosed = sortedQuarters.reduce((s, [_, d]) => s + d.closedValue, 0);

    // Advanced Analytics Calculations
    const wonDeals = slicedOpportunities.filter(opp => opp.stage === 'Closed Won');
    const lostDeals = slicedOpportunities.filter(opp => opp.stage === 'Closed Lost');
    const totalDeals = wonDeals.length + lostDeals.length;
    const winRate = totalDeals > 0 ? ((wonDeals.length / totalDeals) * 100).toFixed(1) : 0;

    // Sales Velocity (average days to close for won deals)
    const salesVelocity = wonDeals.length > 0 ? 
        Math.round(wonDeals.reduce((sum, opp) => {
            if (opp.createdDate && opp.forecastedCloseDate) {
                const created = new Date(opp.createdDate);
                const closed = new Date(opp.forecastedCloseDate);
                const days = Math.floor((closed - created) / (1000 * 60 * 60 * 24));
                return sum + days;
            }
            return sum + 90; // Default 90 days if no data
        }, 0) / wonDeals.length) : 0;

    // Conversion rates between stages
    const getConversionRate = (fromStage, toStage) => {
        const fromCount = slicedOpportunities.filter(opp => {
            const stageIndex = stages.indexOf(opp.stage);
            const fromIndex = stages.indexOf(fromStage);
            return stageIndex >= fromIndex;
        }).length;
        const toCount = slicedOpportunities.filter(opp => {
            const stageIndex = stages.indexOf(opp.stage);
            const toIndex = stages.indexOf(toStage);
            return stageIndex >= toIndex;
        }).length;
        return fromCount > 0 ? ((toCount / fromCount) * 100).toFixed(1) : 0;
    };

    // Weighted pipeline value
    const funnelWeights = {};
    (settings.funnelStages || []).forEach(s => { if (s.name.trim()) funnelWeights[s.name] = s.weight / 100; });
    const getOppProbability = (opp) => {
        if (opp.probability !== null && opp.probability !== undefined) return opp.probability / 100;
        return funnelWeights[opp.stage] !== undefined ? funnelWeights[opp.stage] : 0.3;
    };
    const weightedPipeline = slicedOpportunities
        .filter(opp => opp.stage !== 'Closed Won' && opp.stage !== 'Closed Lost')
        .reduce((sum, opp) => {
            const probability = getOppProbability(opp);
            return sum + ((opp.arr + opp.implementationCost) * probability);
        }, 0);

    return (
        <>

            <div className="kpi-grid" style={{ marginBottom: '1.5rem' }}>
                <div className="kpi-card neutral" style={{ background: '#ecfdf5', borderColor: '#a7f3d0' }}>
                    <div className="kpi-label">Win Rate</div>
                    <div className="kpi-value">{winRate}%</div>
                </div>
                <div className="kpi-card neutral" style={{ background: '#eff6ff', borderColor: '#bfdbfe' }}>
                    <div className="kpi-label">Sales Velocity</div>
                    <div className="kpi-value">{salesVelocity} days</div>
                </div>
                <div className="kpi-card neutral" style={{ background: '#fffbeb', borderColor: '#fde68a' }}>
                    <div className="kpi-label">Weighted Pipeline</div>
                    <div className="kpi-value">${Math.round(weightedPipeline).toLocaleString()}</div>
                </div>
                <div className="kpi-card neutral" style={{ background: '#eff6ff', borderColor: '#93c5fd' }}>
                    <div className="kpi-label">Conversion Rate</div>
                    <div className="kpi-value">{getConversionRate('Qualification', 'Closed Won')}%</div>
                </div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

            {/* Quarterly Forecast - collapsible */}
            <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.04)', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
                <div onClick={() => setAnalyticsExpanded(p => ({ ...p, forecast: !p.forecast }))}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', cursor: 'pointer', background: '#ffffff', borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '4px', height: '16px', borderRadius: '2px', background: 'linear-gradient(to bottom, #2563eb, #7c3aed)' }} />
                        <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: '700', color: '#1e293b' }}>Quarterly Forecast</h3>
                        <span style={{ fontSize: '0.6875rem', color: '#94a3b8', fontWeight: '600' }}>({sortedQuarters.length} quarters)</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <ReportBtn title="Quarterly Forecast Report" contentFn={() => {
                            let html = '<table><tr><th>Quarter</th><th>Opportunities</th><th>ARR</th><th>Impl Cost</th><th>Total Value</th></tr>';
                            sortedQuarters.forEach(([q, d]) => { html += `<tr><td>${q}</td><td>${d.count}</td><td>$${d.arr.toLocaleString()}</td><td>$${d.implCost.toLocaleString()}</td><td>$${d.totalValue.toLocaleString()}</td></tr>`; });
                            html += '</table>'; return html;
                        }} />
                        <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{analyticsExpanded.forecast ? '▼' : '▶'}</span>
                    </div>
                </div>
                {analyticsExpanded.forecast && (
                    <div style={{ padding: '0.75rem 1rem' }}>
                        {/* Legend */}
                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', fontSize: '0.6875rem', color: '#64748b' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><div style={{ width: '10px', height: '6px', borderRadius: '2px', background: '#2563eb' }} /> Forecast</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><div style={{ width: '10px', height: '6px', borderRadius: '2px', background: '#10b981' }} /> Closed Won</div>
                        </div>
                        {sortedQuarters.map(([quarter, data]) => (
                            <div key={quarter} style={{ marginBottom: '0.75rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: '#1e293b' }}>{quarter}</span>
                                        <span style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>{data.count} opps</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', fontSize: '0.75rem' }}>
                                        <span style={{ color: '#2563eb', fontWeight: '600' }}>Forecast: ${data.forecastValue.toLocaleString()}</span>
                                        <span style={{ color: '#10b981', fontWeight: '600' }}>Closed: ${data.closedValue.toLocaleString()}</span>
                                        <span style={{ color: '#1e293b', fontWeight: '700', fontSize: '0.8125rem' }}>Total: ${data.totalValue.toLocaleString()}</span>
                                    </div>
                                </div>
                                <div style={{ height: '6px', background: '#f1f3f5', borderRadius: '3px', overflow: 'hidden', display: 'flex' }}>
                                    {data.closedValue > 0 && <div style={{ height: '100%', width: `${(data.closedValue / maxValue) * 100}%`, background: '#10b981', transition: 'width 0.5s ease' }} />}
                                    {data.forecastValue > 0 && <div style={{ height: '100%', width: `${(data.forecastValue / maxValue) * 100}%`, background: '#2563eb', transition: 'width 0.5s ease' }} />}
                                </div>
                            </div>
                        ))}
                        {/* Fiscal Year Totals */}
                        <div style={{ borderTop: '2px solid #1e293b', marginTop: '0.5rem', paddingTop: '0.625rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: '800', fontSize: '0.875rem', color: '#1e293b' }}>Fiscal Year Total</span>
                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', fontSize: '0.75rem' }}>
                                <span style={{ color: '#2563eb', fontWeight: '700' }}>Forecast: ${fyTotalForecast.toLocaleString()}</span>
                                <span style={{ color: '#10b981', fontWeight: '700' }}>Closed: ${fyTotalClosed.toLocaleString()}</span>
                                <span style={{ color: '#1e293b', fontWeight: '800', fontSize: '0.875rem' }}>Total: ${(fyTotalForecast + fyTotalClosed).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Sales Funnel - collapsible */}
            {(() => {
                const funnelStages = ((settings && settings.funnelStages) || []).filter(s => s && s.name && s.name.trim() && s.name !== 'Closed Lost');
                const funnelData = funnelStages.map((stage, idx, arr) => {
                    const opps = opportunities.filter(o => o.stage === stage.name);
                    const value = opps.reduce((s, o) => s + (o.arr || 0) + (o.implementationCost || 0), 0);
                    const weighted = value * (stage.weight / 100);
                    return { ...stage, count: opps.length, value, weighted };
                });
                const maxFunnelCount = Math.max(...funnelData.map(d => d.count), 1);
                const totalPipelineValue = funnelData.reduce((s, d) => s + d.value, 0);
                const totalWeightedValue = funnelData.reduce((s, d) => s + d.weighted, 0);
                const funnelColors = ['#6366f1', '#818cf8', '#a78bfa', '#c084fc', '#3b82f6', '#2563eb', '#10b981', '#14b8a6'];

                // Quota calculations — sum per-rep quotas from user records.
                // The old global quotaData blob is no longer used for totals;
                // quota is now set per-rep in the Sales Manager tab and stored on user objects.
                const quotaMode = (users || []).find(u => u.quotaType)?.quotaType || 'annual';
                const totalQuota = (users || [])
                    .filter(u => u.userType !== 'ReadOnly')
                    .reduce((s, u) => {
                        if ((u.quotaType || quotaMode) === 'annual') return s + (u.annualQuota || 0);
                        return s + (u.q1Quota || 0) + (u.q2Quota || 0) + (u.q3Quota || 0) + (u.q4Quota || 0);
                    }, 0);
                const closedWonValue = opportunities.filter(o => o.stage === 'Closed Won')
                    .reduce((s, o) => s + (o.arr || 0) + (o.implementationCost || 0), 0);
                const remainingQuota = Math.max(0, totalQuota - closedWonValue);
                const estimatedAttainment = closedWonValue + totalWeightedValue;
                const estimatedAttainmentPct = totalQuota > 0 ? parseFloat(((estimatedAttainment / totalQuota) * 100).toFixed(1)) : 0;

                return (
                <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.04)', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
                    <div onClick={() => setAnalyticsExpanded(p => ({ ...p, funnel: !p.funnel }))}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', cursor: 'pointer', background: '#ffffff', borderBottom: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: '4px', height: '16px', borderRadius: '2px', background: 'linear-gradient(to bottom, #2563eb, #7c3aed)' }} />
                            <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: '700', color: '#1e293b' }}>Sales Funnel</h3>
                            <span style={{ fontSize: '0.6875rem', color: '#94a3b8', fontWeight: '600' }}>({opportunities.filter(o => o.stage !== 'Closed Lost').length} active deals)</span>
                        </div>
                        <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{analyticsExpanded.funnel ? '▼' : '▶'}</span>
                    </div>
                    {analyticsExpanded.funnel && (
                        <div style={{ padding: '0.75rem 1rem' }}>
                            {/* Summary row */}
                            <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                                <div style={{ flex: '1 1 130px', padding: '0.625rem', background: '#f8fafc', borderRadius: '6px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.625rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', marginBottom: '0.125rem' }}>Total Pipeline</div>
                                    <div style={{ fontSize: '1.125rem', fontWeight: '800', color: '#475569' }}>${totalPipelineValue.toLocaleString()}</div>
                                </div>
                                <div style={{ flex: '1 1 130px', padding: '0.625rem', background: '#f8fafc', borderRadius: '6px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.625rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', marginBottom: '0.125rem' }}>Weighted Pipeline</div>
                                    <div style={{ fontSize: '1.125rem', fontWeight: '800', color: '#475569' }}>${Math.round(totalWeightedValue).toLocaleString()}</div>
                                </div>
                                <div style={{ flex: '1 1 130px', padding: '0.625rem', background: '#f8fafc', borderRadius: '6px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.625rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', marginBottom: '0.125rem' }}>Active Deals</div>
                                    <div style={{ fontSize: '1.125rem', fontWeight: '800', color: '#475569' }}>{funnelData.reduce((s, d) => s + d.count, 0)}</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                                <div style={{ flex: '1 1 130px', padding: '0.625rem', background: '#fef2f2', borderRadius: '6px', border: '1px solid #fecaca', textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.625rem', color: '#991b1b', fontWeight: '600', textTransform: 'uppercase', marginBottom: '0.125rem' }}>Remaining Quota</div>
                                    <div style={{ fontSize: '1.125rem', fontWeight: '800', color: '#475569' }}>${remainingQuota.toLocaleString()}</div>
                                </div>
                                <div style={{ flex: '1 1 130px', padding: '0.625rem', background: estimatedAttainmentPct >= 100 ? '#ecfdf5' : estimatedAttainmentPct >= 75 ? '#fffbeb' : '#fef2f2', borderRadius: '6px', border: '1px solid ' + (estimatedAttainmentPct >= 100 ? '#a7f3d0' : estimatedAttainmentPct >= 75 ? '#fde68a' : '#fecaca'), textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.625rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', marginBottom: '0.125rem' }}>Est. Quota Attainment</div>
                                    <div style={{ fontSize: '1.125rem', fontWeight: '800', color: '#475569' }}>${Math.round(estimatedAttainment).toLocaleString()} <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: estimatedAttainmentPct >= 100 ? '#10b981' : estimatedAttainmentPct >= 75 ? '#f59e0b' : '#ef4444' }}>({estimatedAttainmentPct}%)</span></div>
                                </div>
                            </div>

                            {/* Visual funnel */}
                            <div style={{ marginBottom: '1rem' }}>
                                {funnelData.map((stage, idx) => {
                                    const widthPct = funnelData.length > 1 ? (100 - (idx * (55 / Math.max(funnelData.length - 1, 1)))) : 100;
                                    const color = funnelColors[idx % funnelColors.length];
                                    return (
                                        <div key={stage.name} style={{ display: 'flex', alignItems: 'center', marginBottom: '0.25rem' }}>
                                            <div style={{
                                                width: widthPct + '%', margin: '0 auto',
                                                padding: '0.5rem 0.875rem',
                                                background: (() => { const c = color; const r = parseInt(c.slice(1,3),16); const g = parseInt(c.slice(3,5),16); const b = parseInt(c.slice(5,7),16); return `rgba(${r},${g},${b},0.08)`; })(),
                                                border: (() => { const c = color; const r = parseInt(c.slice(1,3),16); const g = parseInt(c.slice(3,5),16); const b = parseInt(c.slice(5,7),16); return `1px solid rgba(${r},${g},${b},0.2)`; })(),
                                                borderRadius: '4px',
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                transition: 'all 0.3s ease'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                                                    <span style={{ fontWeight: '700', fontSize: '0.8125rem', color: '#1e293b' }}>{stage.name}</span>
                                                    <span style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>({stage.weight}% prob)</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.8125rem' }}>
                                                    <span style={{ color: '#64748b' }}>{stage.count} deal{stage.count !== 1 ? 's' : ''}</span>
                                                    <span style={{ fontWeight: '700', color: '#1e293b' }}>${stage.value.toLocaleString()}</span>
                                                    <span style={{ fontWeight: '600', color, fontSize: '0.75rem' }}>${Math.round(stage.weighted).toLocaleString()} wtd</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
                );
            })()}

            {/* Deals by Account - collapsible */}
            {(() => {
                const subToParent = {};
                (accounts || []).forEach(acc => {
                    (accounts || []).filter(a => a.parentId === acc.id).forEach(sub => {
                        subToParent[sub.name] = acc.name;
                    });
                });
                const accountDeals = {};
                opportunities.forEach(opp => {
                    const oppAccount = opp.account || 'Unassigned';
                    const parentName = subToParent[oppAccount] || oppAccount;
                    if (!accountDeals[parentName]) accountDeals[parentName] = { count: 0, value: 0, stages: {} };
                    accountDeals[parentName].count++;
                    const val = (opp.arr || 0) + (opp.implementationCost || 0);
                    accountDeals[parentName].value += val;
                    accountDeals[parentName].stages[opp.stage] = (accountDeals[parentName].stages[opp.stage] || 0) + 1;
                });
                const sortedAccounts = Object.entries(accountDeals).sort((a, b) => b[1].value - a[1].value);
                const maxAccountValue = sortedAccounts.length > 0 ? Math.max(...sortedAccounts.map(([_, d]) => d.value)) : 1;
                const accountColors = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6'];
                return (
                <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.04)', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
                    <div onClick={() => setAnalyticsExpanded(p => ({ ...p, dealsByAccount: !p.dealsByAccount }))}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', cursor: 'pointer', background: '#ffffff', borderBottom: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: '4px', height: '16px', borderRadius: '2px', background: 'linear-gradient(to bottom, #2563eb, #7c3aed)' }} />
                            <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: '700', color: '#1e293b' }}>Deals by Account</h3>
                            <span style={{ fontSize: '0.6875rem', color: '#94a3b8', fontWeight: '600' }}>({sortedAccounts.length} accounts)</span>
                        </div>
                        <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{analyticsExpanded.dealsByAccount ? '▼' : '▶'}</span>
                    </div>
                    {analyticsExpanded.dealsByAccount && (
                        <div style={{ padding: '0.75rem 1rem' }}>
                            {sortedAccounts.length === 0 ? (
                                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '1rem', fontSize: '0.875rem' }}>No deals to display</div>
                            ) : (
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', padding: '0.375rem 0', marginBottom: '0.375rem', borderBottom: '2px solid #e2e8f0' }}>
                                        <span style={{ width: '200px', flexShrink: 0, fontSize: '0.6875rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Account</span>
                                        <span style={{ width: '60px', flexShrink: 0, fontSize: '0.6875rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', textAlign: 'center' }}>Deals</span>
                                        <span style={{ flex: 1, fontSize: '0.6875rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', textAlign: 'right', paddingRight: '0.5rem' }}>Total Value</span>
                                    </div>
                                    {sortedAccounts.map(([name, data], idx) => (
                                        <div key={name} style={{ marginBottom: '0.5rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.25rem' }}>
                                                <span style={{ width: '200px', flexShrink: 0, fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                                                <span style={{ width: '60px', flexShrink: 0, textAlign: 'center' }}>
                                                    <span style={{ background: '#e0e7ff', color: '#3730a3', fontSize: '0.6875rem', fontWeight: '700', padding: '0.125rem 0.5rem', borderRadius: '999px' }}>{data.count}</span>
                                                </span>
                                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <div style={{ flex: 1, height: '6px', background: '#f1f3f5', borderRadius: '3px', overflow: 'hidden' }}>
                                                        <div style={{ height: '100%', width: `${(data.value / maxAccountValue) * 100}%`, background: accountColors[idx % accountColors.length], transition: 'width 0.5s ease', borderRadius: '3px' }} />
                                                    </div>
                                                    <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: '#1e293b', minWidth: '90px', textAlign: 'right' }}>${data.value.toLocaleString()}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    <div style={{ display: 'flex', alignItems: 'center', padding: '0.5rem 0', borderTop: '2px solid #1e293b', marginTop: '0.25rem' }}>
                                        <span style={{ width: '200px', flexShrink: 0, fontSize: '0.875rem', fontWeight: '800', color: '#1e293b' }}>Total</span>
                                        <span style={{ width: '60px', flexShrink: 0, textAlign: 'center', fontWeight: '800', fontSize: '0.875rem', color: '#1e293b' }}>{slicedOpportunities.length}</span>
                                        <span style={{ flex: 1, textAlign: 'right', fontWeight: '800', fontSize: '0.875rem', color: '#1e293b' }}>${sortedAccounts.reduce((s, [_, d]) => s + d.value, 0).toLocaleString()}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                );
            })()}

            {/* Pipeline by Stage - collapsible */}
            <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.04)', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
                <div onClick={() => setAnalyticsExpanded(p => ({ ...p, stage: !p.stage }))}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', cursor: 'pointer', background: '#ffffff', borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '4px', height: '16px', borderRadius: '2px', background: 'linear-gradient(to bottom, #2563eb, #7c3aed)' }} />
                        <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: '700', color: '#1e293b' }}>Pipeline by Stage</h3>
                        <span style={{ fontSize: '0.6875rem', color: '#94a3b8', fontWeight: '600' }}>({stageData.length} stages)</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <ReportBtn title="Pipeline by Stage Report" contentFn={() => {
                            let html = '<table><tr><th>Stage</th><th>Count</th><th>ARR</th></tr>';
                            stageData.forEach(s => { html += `<tr><td>${s.stage}</td><td>${s.count}</td><td>$${s.arr.toLocaleString()}</td></tr>`; });
                            const totalArr = stageData.reduce((s,d) => s + d.arr, 0);
                            html += `<tr><th>Total</th><th>${stageData.reduce((s,d) => s + d.count, 0)}</th><th>$${totalArr.toLocaleString()}</th></tr></table>`;
                            return html;
                        }} />
                        <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{analyticsExpanded.stage ? '▼' : '▶'}</span>
                    </div>
                </div>
                {analyticsExpanded.stage && (
                    <div style={{ padding: '0.75rem 1rem' }}>
                        {stageData.map((item) => (
                            <div key={item.stage} style={{ marginBottom: '0.625rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.8125rem', color: '#64748b' }}>
                                    <span>{item.stage}</span>
                                    <span style={{ fontWeight: '600' }}>${item.arr.toLocaleString()} ({item.count})</span>
                                </div>
                                <div style={{ height: '6px', background: '#f1f3f5', borderRadius: '3px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${(item.arr / Math.max(...stageData.map(d => d.arr))) * 100}%`, background: '#6366f1', transition: 'width 0.5s ease' }} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Pipeline by Product - collapsible */}
            <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.04)', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
                <div onClick={() => setAnalyticsExpanded(p => ({ ...p, product: !p.product }))}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', cursor: 'pointer', background: '#ffffff', borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '4px', height: '16px', borderRadius: '2px', background: 'linear-gradient(to bottom, #2563eb, #7c3aed)' }} />
                        <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: '700', color: '#1e293b' }}>Pipeline by Product</h3>
                        <span style={{ fontSize: '0.6875rem', color: '#94a3b8', fontWeight: '600' }}>({productData.length} products)</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <ReportBtn title="Pipeline by Product Report" contentFn={() => {
                            let html = '<table><tr><th>Product</th><th>Count</th><th>ARR</th></tr>';
                            productData.forEach(p => { html += `<tr><td>${p.product}</td><td>${p.count}</td><td>$${p.arr.toLocaleString()}</td></tr>`; });
                            html += '</table>'; return html;
                        }} />
                        <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{analyticsExpanded.product ? '▼' : '▶'}</span>
                    </div>
                </div>
                {analyticsExpanded.product && (
                    <div style={{ padding: '0.75rem 1rem' }}>
                        {productData.map((item) => (
                            <div key={item.product} style={{ marginBottom: '0.625rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.8125rem', color: '#64748b' }}>
                                    <span>{item.product}</span>
                                    <span style={{ fontWeight: '600' }}>${item.arr.toLocaleString()} ({item.count})</span>
                                </div>
                                <div style={{ height: '6px', background: '#f1f3f5', borderRadius: '3px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${productData.length > 0 ? (item.arr / Math.max(...productData.map(d => d.arr))) * 100 : 0}%`, background: '#f59e0b', transition: 'width 0.5s ease' }} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>


            {/* Pipeline by Team */}
            {teamStats.length > 0 && (
            <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.04)', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
                <div onClick={() => setAnalyticsExpanded(p => ({ ...p, byTeam: !p.byTeam }))}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', cursor: 'pointer', background: '#ffffff', borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '4px', height: '16px', borderRadius: '2px', background: 'linear-gradient(to bottom, #7c3aed, #a78bfa)' }} />
                        <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: '700', color: '#1e293b' }}>Pipeline by Team</h3>
                        <span style={{ fontSize: '0.6875rem', color: '#94a3b8', fontWeight: '600' }}>({teamStats.length} teams)</span>
                    </div>
                    <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{analyticsExpanded.byTeam ? '▼' : '▶'}</span>
                </div>
                {analyticsExpanded.byTeam && (() => {
                    const maxPipeline = Math.max(...teamStats.map(t => t.pipeline), 1);
                    const teamColors = ['#7c3aed','#6d28d9','#5b21b6','#4c1d95','#8b5cf6','#a78bfa'];
                    return (
                    <div style={{ padding: '1rem 1.25rem' }}>
                        {/* Column headers */}
                        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 90px 80px 80px 70px', gap: '0.5rem', padding: '0 0 0.5rem', borderBottom: '2px solid #e2e8f0', marginBottom: '0.625rem' }}>
                            {['Team','Pipeline','Won Rev','Active','Won','Reps'].map(h => (
                                <span key={h} style={{ fontSize: '0.625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: h === 'Team' ? 'left' : 'right' }}>{h}</span>
                            ))}
                        </div>
                        {teamStats.map((t, idx) => (
                            <div key={t.group} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 90px 80px 80px 70px', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                                <span style={{ fontWeight: '700', fontSize: '0.8125rem', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>👥 {t.group}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <div style={{ flex: 1, height: '8px', background: '#f1f3f5', borderRadius: '4px', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${(t.pipeline / maxPipeline) * 100}%`, background: teamColors[idx % teamColors.length], borderRadius: '4px', transition: 'width 0.5s ease' }} />
                                    </div>
                                    <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#1e293b', minWidth: '70px', textAlign: 'right' }}>${t.pipeline >= 1000 ? (t.pipeline/1000).toFixed(0)+'K' : t.pipeline.toLocaleString()}</span>
                                </div>
                                <span style={{ textAlign: 'right', fontSize: '0.75rem', fontWeight: '600', color: '#166534' }}>{t.wonRev > 0 ? '$'+(t.wonRev >= 1000 ? (t.wonRev/1000).toFixed(0)+'K' : t.wonRev.toLocaleString()) : '—'}</span>
                                <span style={{ textAlign: 'right', fontSize: '0.75rem', fontWeight: '600', color: '#2563eb' }}>{t.openCount}</span>
                                <span style={{ textAlign: 'right', fontSize: '0.75rem', fontWeight: '600', color: '#16a34a' }}>{t.wonCount}</span>
                                <span style={{ textAlign: 'right', fontSize: '0.75rem', color: '#94a3b8' }}>{t.repCount}</span>
                            </div>
                        ))}
                        {/* Totals row */}
                        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 90px 80px 80px 70px', gap: '0.5rem', borderTop: '2px solid #1e293b', paddingTop: '0.625rem', marginTop: '0.25rem' }}>
                            <span style={{ fontWeight: '800', fontSize: '0.8125rem', color: '#1e293b' }}>Total</span>
                            <span style={{ textAlign: 'right', fontWeight: '800', fontSize: '0.8125rem', color: '#1e293b' }}>${teamStats.reduce((s,t)=>s+t.pipeline,0).toLocaleString()}</span>
                            <span style={{ textAlign: 'right', fontWeight: '800', fontSize: '0.8125rem', color: '#166534' }}>${teamStats.reduce((s,t)=>s+t.wonRev,0).toLocaleString()}</span>
                            <span style={{ textAlign: 'right', fontWeight: '800', fontSize: '0.8125rem', color: '#2563eb' }}>{teamStats.reduce((s,t)=>s+t.openCount,0)}</span>
                            <span style={{ textAlign: 'right', fontWeight: '800', fontSize: '0.8125rem', color: '#16a34a' }}>{teamStats.reduce((s,t)=>s+t.wonCount,0)}</span>
                            <span style={{ textAlign: 'right', fontWeight: '700', fontSize: '0.8125rem', color: '#94a3b8' }}>{users.length}</span>
                        </div>
                    </div>
                    );
                })()}
            </div>
            )}

            {/* Pipeline by Territory */}
            {territoryStats.length > 0 && (
            <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.04)', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
                <div onClick={() => setAnalyticsExpanded(p => ({ ...p, byTerritory: !p.byTerritory }))}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', cursor: 'pointer', background: '#ffffff', borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '4px', height: '16px', borderRadius: '2px', background: 'linear-gradient(to bottom, #d97706, #f59e0b)' }} />
                        <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: '700', color: '#1e293b' }}>Pipeline by Territory</h3>
                        <span style={{ fontSize: '0.6875rem', color: '#94a3b8', fontWeight: '600' }}>({territoryStats.length} territories)</span>
                    </div>
                    <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{analyticsExpanded.byTerritory ? '▼' : '▶'}</span>
                </div>
                {analyticsExpanded.byTerritory && (() => {
                    const maxPipeline = Math.max(...territoryStats.map(t => t.pipeline), 1);
                    const terrColors = ['#d97706','#b45309','#92400e','#f59e0b','#fbbf24','#fcd34d'];
                    return (
                    <div style={{ padding: '1rem 1.25rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 90px 80px 80px 70px', gap: '0.5rem', padding: '0 0 0.5rem', borderBottom: '2px solid #e2e8f0', marginBottom: '0.625rem' }}>
                            {['Territory','Pipeline','Won Rev','Active','Won','Reps'].map(h => (
                                <span key={h} style={{ fontSize: '0.625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: h === 'Territory' ? 'left' : 'right' }}>{h}</span>
                            ))}
                        </div>
                        {territoryStats.map((t, idx) => (
                            <div key={t.group} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 90px 80px 80px 70px', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                                <span style={{ fontWeight: '700', fontSize: '0.8125rem', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📍 {t.group}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <div style={{ flex: 1, height: '8px', background: '#f1f3f5', borderRadius: '4px', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${(t.pipeline / maxPipeline) * 100}%`, background: terrColors[idx % terrColors.length], borderRadius: '4px', transition: 'width 0.5s ease' }} />
                                    </div>
                                    <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#1e293b', minWidth: '70px', textAlign: 'right' }}>${t.pipeline >= 1000 ? (t.pipeline/1000).toFixed(0)+'K' : t.pipeline.toLocaleString()}</span>
                                </div>
                                <span style={{ textAlign: 'right', fontSize: '0.75rem', fontWeight: '600', color: '#166534' }}>{t.wonRev > 0 ? '$'+(t.wonRev >= 1000 ? (t.wonRev/1000).toFixed(0)+'K' : t.wonRev.toLocaleString()) : '—'}</span>
                                <span style={{ textAlign: 'right', fontSize: '0.75rem', fontWeight: '600', color: '#2563eb' }}>{t.openCount}</span>
                                <span style={{ textAlign: 'right', fontSize: '0.75rem', fontWeight: '600', color: '#16a34a' }}>{t.wonCount}</span>
                                <span style={{ textAlign: 'right', fontSize: '0.75rem', color: '#94a3b8' }}>{t.repCount}</span>
                            </div>
                        ))}
                        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 90px 80px 80px 70px', gap: '0.5rem', borderTop: '2px solid #1e293b', paddingTop: '0.625rem', marginTop: '0.25rem' }}>
                            <span style={{ fontWeight: '800', fontSize: '0.8125rem', color: '#1e293b' }}>Total</span>
                            <span style={{ textAlign: 'right', fontWeight: '800', fontSize: '0.8125rem', color: '#1e293b' }}>${territoryStats.reduce((s,t)=>s+t.pipeline,0).toLocaleString()}</span>
                            <span style={{ textAlign: 'right', fontWeight: '800', fontSize: '0.8125rem', color: '#166534' }}>${territoryStats.reduce((s,t)=>s+t.wonRev,0).toLocaleString()}</span>
                            <span style={{ textAlign: 'right', fontWeight: '800', fontSize: '0.8125rem', color: '#2563eb' }}>{territoryStats.reduce((s,t)=>s+t.openCount,0)}</span>
                            <span style={{ textAlign: 'right', fontWeight: '800', fontSize: '0.8125rem', color: '#16a34a' }}>{territoryStats.reduce((s,t)=>s+t.wonCount,0)}</span>
                            <span style={{ textAlign: 'right', fontWeight: '700', fontSize: '0.8125rem', color: '#94a3b8' }}>{users.length}</span>
                        </div>
                    </div>
                    );
                })()}
            </div>
            )}

        </div>
        </>
    );
}

