// MUST BE CAUGHT — guide 18b3. Found live in ReportsTab, Aug 2026: the callback is
// NAMED data but holds a Response, and nothing in the chain calls .json(), so
// `data?.reports` was undefined forever and the saved-reports list never loaded.
// Note the OPTIONAL chaining — matching only MemberExpression missed it.
const load = () => {
    dbFetch('/.netlify/functions/saved-reports')
        .then(data => setList(data?.reports || []))
        .catch(() => {});
};
