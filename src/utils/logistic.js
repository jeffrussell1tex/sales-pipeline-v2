// src/utils/logistic.js
//
// A small logistic regression, fitted per org and never pooled across tenants (AI scoring batch 2A; docs/design/
// deal-score). Pure, so the server's trainer and the suite run the same arithmetic. The lead model has its own copy
// in score-lead.mjs (score-lead.mjs:170 trainLeadModel); this one adds what the deal model's guardrails ask for — a
// fit that can be scored on rows it did not see (`heldOutAccuracy`) — and leaves the lead engine as it is (OPEN_ITEMS
// §4.3: its accuracy is measured on the rows it trained on).

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

// Fit on rows of { features: number[], label: 0|1 }. Every feature is standardised over the rows given (a feature
// that does not vary is left at its mean, std 1, so it adds nothing). L2 keeps a fit on a few dozen rows from leaning
// on any one feature. Returns null when there is nothing to fit (no rows, or every row the same label: a model of
// one outcome predicts nothing).
export function fitLogistic(rows, { iters = 500, lr = 0.3, l2 = 0.05 } = {}) {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const labels = new Set(rows.map((r) => r.label));
    if (labels.size < 2) return null;
    const k = rows[0].features.length;
    const means = Array(k).fill(0);
    const stds = Array(k).fill(0);
    for (const r of rows) for (let j = 0; j < k; j++) means[j] += r.features[j];
    for (let j = 0; j < k; j++) means[j] /= rows.length;
    for (const r of rows) for (let j = 0; j < k; j++) stds[j] += (r.features[j] - means[j]) ** 2;
    for (let j = 0; j < k; j++) stds[j] = Math.sqrt(stds[j] / rows.length) || 1;
    const X = rows.map((r) => r.features.map((v, j) => (v - means[j]) / stds[j]));
    const y = rows.map((r) => r.label);
    const w = Array(k).fill(0);
    let b = 0;
    for (let it = 0; it < iters; it++) {
        const gw = Array(k).fill(0);
        let gb = 0;
        for (let i = 0; i < X.length; i++) {
            const e = sigmoid(X[i].reduce((s, v, j) => s + v * w[j], 0) + b) - y[i];
            for (let j = 0; j < k; j++) gw[j] += e * X[i][j];
            gb += e;
        }
        for (let j = 0; j < k; j++) w[j] -= lr * (gw[j] / X.length + l2 * w[j]);
        b -= lr * (gb / X.length);
    }
    return { coefficients: w, bias: b, means, stds };
}

// Each feature's pull on one row's log-odds: coefficient × the standardised value. The factors a member reads are
// the largest of these.
export function contributions(fit, features) {
    return features.map((v, j) => ((v - fit.means[j]) / (fit.stds[j] || 1)) * fit.coefficients[j]);
}

// The chance a fit gives one row, 0..1.
export function predictLogistic(fit, features) {
    if (!fit || !Array.isArray(fit.coefficients)) return null;
    return sigmoid(contributions(fit, features).reduce((s, c) => s + c, fit.bias || 0));
}

// The fold a row falls in, by its id — the same row in the same fold on every run, so a retrain on unchanged deals
// reports the same accuracy.
export function foldOf(id, folds) {
    let h = 0;
    for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h % folds;
}

// Accuracy on rows held out of training: each row is predicted by a fit made without its fold (k-fold, `folds`
// folds). A fold whose training rows hold one outcome only cannot be fitted; its rows count as wrong — never a
// flattering skip. → { correct, total } (rows of { id, features, label }).
export function heldOutAccuracy(rows, { folds = 5, ...opts } = {}) {
    const total = Array.isArray(rows) ? rows.length : 0;
    let correct = 0;
    for (let f = 0; f < folds; f++) {
        const test = rows.filter((r) => foldOf(r.id, folds) === f);
        if (!test.length) continue;
        const fit = fitLogistic(rows.filter((r) => foldOf(r.id, folds) !== f), opts);
        if (!fit) continue;
        for (const r of test) if ((predictLogistic(fit, r.features) >= 0.5 ? 1 : 0) === r.label) correct++;
    }
    return { correct, total };
}
