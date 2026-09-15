// _aiKey.mjs — which Anthropic key a call made FOR THIS ORG uses (state §0.141).
//
// The org's own key (Settings → Features → AI → BYOK), stored encrypted at
// settings.extra.anthropicApiKey and decrypted here with the shared helper,
// wins; the site's ANTHROPIC_API_KEY is the fallback; none means no call.
// ai-score.mjs carried its own copy of the decrypt ("mirrors settings.mjs")
// before this; report-prompt.mjs would have been the second copy. One helper,
// one rule, and the plaintext never leaves the function that resolved it.
//
// Underscore-prefixed: a helper, not an endpoint (like _lib, _heartbeat).
import { decrypt } from './crypto.mjs';

/**
 * → { apiKey: string | null, usingOrgKey: boolean }
 * `orgExtra` is the org's settings.extra (or null). Never throws: a key that
 * fails to decrypt reads as absent and the site key (if any) is used.
 */
export function resolveAnthropicKey(orgExtra) {
    const stored = orgExtra && typeof orgExtra.anthropicApiKey === 'string' ? orgExtra.anthropicApiKey : null;
    let orgKey = null;
    if (stored) {
        try { orgKey = decrypt(stored) || null; } catch (err) { console.error('_aiKey: org key decryption failed:', err?.message); orgKey = null; }
    }
    const apiKey = orgKey || process.env.ANTHROPIC_API_KEY || null;
    return { apiKey, usingOrgKey: !!orgKey };
}
