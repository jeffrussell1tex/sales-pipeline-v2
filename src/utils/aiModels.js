// src/utils/aiModels.js
//
// The AI models an Admin may choose, and who may ask Claude (state §0.238; OPEN_ITEMS §3.1, batch 1;
// docs/design/ai-scoring). Pure — the Features panel, the settings PUT, ai-score.mjs, report-prompt.mjs,
// ai-models.mjs and the screens that offer a Score button all read this one list.
//
// Before this file the panel saved a model, a fallback, "Available to" and a token budget into
// settings.extra.aiSettings, and nothing read any of them: a score always asked Haiku 4.5, and any member
// who could edit a deal scored it (state §0.188, found (a)).

// The models a score may ask for, cheapest first (Jeff, 9 Nov: "the current Haiku, Sonnet and Opus").
// `what` is the panel's own line under the select (the Deal Scoring Roadmap's draft); no price is written
// here, so none goes stale — the panel points at Anthropic's pricing page.
export const AI_MODELS = Object.freeze([
    Object.freeze({ id: 'claude-haiku-5-5',  label: 'Haiku 5.5',  what: 'Fastest and cheapest. An explanation comes back in a few seconds. Good for explaining deals routinely.' }),
    Object.freeze({ id: 'claude-sonnet-5-5', label: 'Sonnet 5.5', what: 'Costs more per deal. Weighs mixed signals better and writes more specific recommendations. A good choice for teams with fewer, larger deals.' }),
    Object.freeze({ id: 'claude-opus-5-5',   label: 'Opus 5.5',   what: 'The most expensive. The deepest reading of a deal. Worth it for a handful of large, complex deals.' }),
]);

// A workspace that never chose: Haiku, the class that ran before (Q2), and Sonnet when Haiku cannot answer.
export const DEFAULT_MODEL    = 'claude-haiku-5-5';
export const DEFAULT_FALLBACK = 'claude-sonnet-5-5';

export const isAiModel = (id) => typeof id === 'string' && AI_MODELS.some((m) => m.id === id);
// The label a person reads; an id this list does not hold (a score from before the list) reads as itself.
export const modelLabel = (id) => AI_MODELS.find((m) => m.id === id)?.label || (typeof id === 'string' ? id : '');

const blobOf = (aiSettings) => (aiSettings && typeof aiSettings === 'object' && !Array.isArray(aiSettings) ? aiSettings : {});

// The model a score asks for: the stored choice when the list holds it, else the default (Q2 — a stored
// claude-sonnet-4-6, saved by a panel nobody chose in, or anything a restore or a hand-made save wrote).
export const modelOf    = (aiSettings) => (isAiModel(blobOf(aiSettings).model)    ? blobOf(aiSettings).model    : DEFAULT_MODEL);
export const fallbackOf = (aiSettings) => (isAiModel(blobOf(aiSettings).fallback) ? blobOf(aiSettings).fallback : DEFAULT_FALLBACK);

// "Available to": the stored value is the option's label, as the panel always saved it. An allowlist of
// roles each — ReadOnly, Technician and Dispatcher never ask Claude (they write no CRM record; requireWrite).
export const AI_ACCESS = Object.freeze([
    Object.freeze({ value: 'All roles',            roles: Object.freeze(['Admin', 'Manager', 'User']), who: 'Admins, Managers and Sales Reps' }),
    Object.freeze({ value: 'Admin + Manager only', roles: Object.freeze(['Admin', 'Manager']),         who: 'Admins and Managers' }),
    Object.freeze({ value: 'Admin only',           roles: Object.freeze(['Admin']),                    who: 'Admins' }),
]);
const ADMIN_ONLY = AI_ACCESS[2];

// Absent reads as All roles — what the panel has always shown for it. Anything else the list does not hold
// reads as Admin only: closed, and an Admin can still put it right.
export function aiAccessOf(aiSettings) {
    const v = blobOf(aiSettings).availableTo;
    if (v === undefined || v === null || v === '') return AI_ACCESS[0];
    return AI_ACCESS.find((a) => a.value === v) || ADMIN_ONLY;
}
export const mayUseAi = (role, aiSettings) => aiAccessOf(aiSettings).roles.includes(role);
export const aiAccessWords = (aiSettings) => `AI in this workspace is open to ${aiAccessOf(aiSettings).who}.`;

// Why a request to Claude has no key to go out on (state §0.293 — Jeff, 23 Nov: "I'm building this where a customer uses
// their own AI key. So no key provided stop"): the org installed none, or the one it stored cannot be read. The server's
// reasons (_aiKey.mjs), and the words every screen says for them.
export const AI_KEY_WORDS = Object.freeze({
    no_key:         'No AI key is installed for this workspace — an Admin adds one in Settings → Features & AI.',
    key_unreadable: "This workspace's AI key could not be read — an Admin enters it again in Settings → Features & AI.",
});

// The Features panel's reading of the workspace's key (state §0.293), pure so the suite runs it. `action`: what the open
// draft does to the key — 'set' (typed), 'clear' (to be removed) or null; `set`: the app's settings say one is stored;
// `check`: the server's answer to the key check, null until it answers, { reason: 'unasked' } when it could not be asked.
// The server's answer is the newer: another Admin may have installed or removed the key since the settings loaded.
export function aiKeyState({ action, set, check }) {
    const stored = check && check.reason !== 'unasked' ? check.reason !== 'no_key' : set === true;
    const isSet = action === 'set' || (action !== 'clear' && stored);
    const unread = isSet && action !== 'set' && check?.reason === 'key_unreadable';
    return { isSet, unread, notReady: !isSet ? 'no AI key is installed' : unread ? 'the AI key could not be read' : '' };
}
// The line under the key box, when the draft leaves the key as it is.
export const aiKeyLine = ({ isSet, unread }, last4) => (unread ? { tone: 'danger', text: 'The installed key could not be read — enter it again' }
    : isSet ? { tone: 'ok', text: `✓ Key installed${last4 ? ` · ••••${last4}` : ''}` }
    : { tone: 'inkMuted', text: 'No key installed · nothing is sent to Claude' });
// What the key check found, in words; `notCallable`: the labels of the models the key cannot call.
export function aiKeyCheckWords(check, notCallable = []) {
    if (!check) return '';
    if (check.checked) return notCallable.length
        ? `Checked against your key: ${notCallable.join(' and ')} ${notCallable.length > 1 ? 'are' : 'is'} not available to it.`
        : 'Checked against your key: every model here is available to it.';
    if (check.reason === 'no_key' || check.reason === 'key_unreadable') return AI_KEY_WORDS[check.reason];
    if (check.reason === 'refused') return 'Your AI key was refused when checked — an Admin can replace it under "AI · Your own key".';
    return "Couldn't check which models the key can call.";
}
// The two switches' words: what each sends, on whose key — and, on with no key to use, that nothing is sent.
export const aiPromptsWords = (on, notReady) => (!on ? 'Off · the report builder reads prompts with its built-in interpreter and tells members an Admin can turn AI assistance on here.'
    : notReady ? `On, but ${notReady} — nothing is sent to Claude, and the built-in interpreter reads every prompt.`
    : 'On · the report builder\'s "Ask AI" sends the prompt sentence (never your records) to Claude with your own key; the built-in reader takes over if Claude cannot answer.');
export const aiScoringWords = (on, notReady, label) => (!on ? 'Off · the deal window offers no "Explain this deal". An explanation a deal already has still shows.'
    : notReady ? `On, but ${notReady} — nothing is sent to Claude, and no deal is explained.`
    : `On · the deal window's "Explain this deal" sends the deal — its fields, notes and last ten activities — to Claude ${label} with your own key; each explanation is kept on the deal, with the model that made it, and written to the audit log.`);

// The fields only the panel's mock controls wrote — the token budget and what happened past it (Jeff, 9 Nov:
// decision 2), and the residency, retention, redaction and governance controls nothing enforced (Q4; guide
// §18b64). The next save leaves them out (§18b64.5); nothing is deleted to clean up. `byok` since §0.293: the switch decided
// nothing (a stored key was used whatever it said) and hid the key box — the key's presence decides.
export const RETIRED_AI_FIELDS = Object.freeze(['tokenBudget', 'budgetExceed', 'region', 'trainingOptIn', 'zeroRetention', 'piiRedaction', 'dpaSignedAt', 'auditLogging', 'blockList', 'byok']);

// The blob the panel saves: the model, fallback and "Available to" as they run (a stored id off the list is
// saved as the default the panel showed — Q2), the retired fields left out.
export function aiSettingsToSave(aiSettings) {
    const blob = { ...blobOf(aiSettings) };
    for (const f of RETIRED_AI_FIELDS) delete blob[f];
    return { ...blob, model: modelOf(blob), fallback: fallbackOf(blob), availableTo: aiAccessOf(blob).value };
}

// The settings PUT's rule for the blob: a model, a fallback or an "Available to" the save names anew must be
// one this list holds — refused naming the field, nothing written. A value the row already holds is never
// asked again (the house rule for held links), so a save that leaves an old id as it was still lands.
export function aiSettingsRefused(next, stored) {
    if (next === null || next === undefined) return null;
    if (typeof next !== 'object' || Array.isArray(next)) return { status: 400, field: 'aiSettings', error: 'The AI settings are not a settings object.' };
    const held = blobOf(stored);
    const anew = (k) => k in next && next[k] !== held[k] && next[k] !== undefined && next[k] !== null && next[k] !== '';
    if (anew('model') && !isAiModel(next.model)) return { status: 400, field: 'aiSettings.model', error: `"${String(next.model).slice(0, 60)}" is not a model this app offers.` };
    if (anew('fallback') && !isAiModel(next.fallback)) return { status: 400, field: 'aiSettings.fallback', error: `"${String(next.fallback).slice(0, 60)}" is not a model this app offers.` };
    if (anew('availableTo') && !AI_ACCESS.some((a) => a.value === next.availableTo)) return { status: 400, field: 'aiSettings.availableTo', error: '"Available to" is All roles, Admin + Manager only or Admin only.' };
    return null;
}
