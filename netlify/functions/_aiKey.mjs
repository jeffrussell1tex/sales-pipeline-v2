// _aiKey.mjs — the Anthropic key a call made FOR THIS ORG uses (state §0.141, §0.293): the org's own, or none.
//
// The org's own key (Settings → Features & AI → Your own key), stored encrypted at settings.extra.anthropicApiKey and
// decrypted here with the shared helper. There is no other: until §0.293 the site's ANTHROPIC_API_KEY was the fallback —
// an org with no key, or one whose key could not be read, sent its deals to Claude on the site's key and account (Jeff,
// 23 Nov: "I'm building this where a customer uses their own AI key. So no key provided stop"). One helper, one rule, and
// the plaintext never leaves the function that resolved it.
//
// Underscore-prefixed: a helper, not an endpoint (like _lib, _heartbeat).
import { decrypt } from './crypto.mjs';

/**
 * → { apiKey: string, keyProblem: null } or { apiKey: null, keyProblem: 'no_key' | 'key_unreadable' }
 * `orgExtra` is the org's settings.extra (or null). Never throws: decrypt answers null for a key it cannot read (stored
 * under another secret, or by hand). The words for each problem are src/utils/aiModels.js AI_KEY_WORDS.
 */
export function resolveAnthropicKey(orgExtra) {
    const stored = orgExtra?.anthropicApiKey;
    if (!stored) return { apiKey: null, keyProblem: 'no_key' };
    const apiKey = typeof stored === 'string' ? decrypt(stored) : null;
    return apiKey ? { apiKey, keyProblem: null } : { apiKey: null, keyProblem: 'key_unreadable' };
}
