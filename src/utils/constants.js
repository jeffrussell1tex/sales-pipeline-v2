export const initialOpportunities = [
    {
        id: '001',
        account: 'Example Chemical Corp',
        site: 'Houston Refinery',
        painPoints: 'Manual scheduling, compliance tracking, overtime costs',
        contacts: 'John Smith (Ops Mgr), Sarah Johnson (HR Dir)',
        stage: 'Qualification',
        arr: 85000,
        implementationCost: 25000,
        forecastedCloseDate: '2026-03-15',
        closeQuarter: 'FY2026 Q2',
        products: 'Shiftboard, AutoCall',
        unionized: 'Yes',
        notes: 'Strong interest, budget confirmed Q2',
        nextSteps: 'Schedule demo for Jan 15'
    },
    {
        id: '002',
        account: 'Global Energy Solutions',
        site: 'Dallas Plant',
        painPoints: 'Paper-based shifts, communication gaps',
        contacts: 'Mike Chen (Plant Mgr)',
        stage: 'Discovery',
        arr: 125000,
        implementationCost: 35000,
        forecastedCloseDate: '2026-02-28',
        closeQuarter: 'FY2026 Q2',
        products: 'Shiftboard, Timesheets',
        unionized: 'No',
        notes: 'Evaluating 3 vendors, decision by March',
        nextSteps: 'Send ROI calculator'
    },
    {
        id: '003',
        account: 'Midwest Utilities Inc',
        site: 'Chicago Station',
        painPoints: 'Union compliance, audit trail requirements',
        contacts: 'Lisa Martinez (Dir Ops), Tom Wilson (Union Rep)',
        stage: 'Proposal',
        arr: 95000,
        implementationCost: 30000,
        forecastedCloseDate: '2026-02-20',
        closeQuarter: 'FY2026 Q2',
        products: 'Shiftboard, AutoCall, Timesheets',
        unionized: 'Yes',
        notes: 'Sent proposal Dec 20, positive feedback',
        nextSteps: 'Follow up after holidays'
    }
];

export const stages = [
    'Qualification',
    'Discovery',
    'Evaluation (Demo)',
    'Proposal',
    'Negotiation/Review',
    'Contracts',
    'Closed Won',
    'Closed Lost'
];

export const productOptions = [
    'Shiftboard',
    'AutoCall',
    'Timesheets',
    'Shiftboard, AutoCall',
    'Shiftboard, Timesheets',
    'AutoCall, Timesheets',
    'Shiftboard, AutoCall, Timesheets'
];
