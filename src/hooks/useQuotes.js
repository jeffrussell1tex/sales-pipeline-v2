import { useState, useCallback } from 'react';
import { dbStatusOf } from '../utils/fetchStatus';
import { dbFetch, waitForToken, requestOrg, stillOrg } from '../utils/storage';
import { failureWords, refusalWords, heardRefusal, landedBefore, maybeSaid } from '../utils/refusalWords.js';

// One stored row read again by id, from the list its GET answers (state §0.261, Part 6): a create an earlier press had
// landed is shown as stored. Null when the read fails or the row is not in it.
const storedRowOf = async (url, key, id) => {
    const res = await dbFetch(url).catch(() => null);
    if (!res || !res.ok) return null;
    const data = await res.json().catch(() => null);
    return (Array.isArray(data?.[key]) ? data[key] : []).find(r => r && r.id === id) || null;
};

/**
 * useQuotes — manages quotes and products (price book) state.
 *
 * Quotes:
 *   quotes[]            — all quotes for the org (loaded once on mount)
 *   loadQuotes()        — fetch all quotes from /quotes
 *   handleSaveQuote()   — POST (new) or PUT (update existing)
 *
 * Products (Price Book):
 *   products[]          — all active products
 *   loadProducts()      — fetch from /products
 *   handleSaveProduct() — POST or PUT
 *   handleDeleteProduct()
 */
export function useQuotes() {
    const [quotes, setQuotes]   = useState([]);
    const [products, setProducts] = useState([]);

    // ── Modal / saving state ──────────────────────────────────────────────────
    const [quoteModalError, setQuoteModalError]     = useState(null);
    const [quoteModalSaving, setQuoteModalSaving]   = useState(false);

    // ── Deep link: navigate from opp modal → Quotes tab pre-filtered ─────────
    const [quotesDeepLinkOppId, setQuotesDeepLinkOppId] = useState(null);

    // ── Loaders ───────────────────────────────────────────────────────────────
    const loadQuotes = useCallback(async (setDbOffline) => {
        const askedOrg = requestOrg();   // an answer for an org switched away from is dropped (state §0.173)
        try {
            await waitForToken();
            const res = await dbFetch('/.netlify/functions/quotes');
            if (!stillOrg(askedOrg)) return;
            if (setDbOffline) setDbOffline(dbStatusOf(res));
            if (!res.ok) return;
            const data = await res.json();
            if (!stillOrg(askedOrg)) return;
            setQuotes(data.quotes || []);
        } catch (err) {
            console.error('Failed to load quotes:', err.message);
        }
    }, []);

    const loadProducts = useCallback(async (includeInactive = false) => {
        const askedOrg = requestOrg();   // an answer for an org switched away from is dropped (state §0.173)
        try {
            await waitForToken();
            const url = includeInactive
                ? '/.netlify/functions/products?includeInactive=true'
                : '/.netlify/functions/products';
            const res = await dbFetch(url);
            if (!res.ok || !stillOrg(askedOrg)) return;
            const data = await res.json();
            if (!stillOrg(askedOrg)) return;
            setProducts(data.products || []);
        } catch (err) {
            console.error('Failed to load products:', err.message);
        }
    }, []);

    // ── Quote CRUD ────────────────────────────────────────────────────────────
    /**
     * handleSaveQuote
     * @param {object} formData  — quote fields from the UI
     * @param {object|null} editingQuote — existing quote if editing, null if new
     * @returns {object|null}  — saved quote record, or null on error
     */
    // Since §0.261 (the unknown-save rule, Part 3 — Jeff's Q1, Q2; Part 6): a create keeps the id its caller sends (a
    // press after an answer that proved nothing sends the same one), and the server's answer that the id is already this
    // org's is the earlier press landed — the quote read again and taken as saved. Only the server's own refusal says its
    // words alone; any other failure says the quote may have been saved. `onFailure` hears { words, unknown, stale }.
    // Since §0.280 an edit names what it changes and the stamp its quote was loaded with (`ifStamp`); a quote changed
    // since is refused 409 `stale` with the quote as stored, which takes the list's place — the screen shows it.
    // `editingQuote` is the quote the press was made on: its id, and the row an answer that cannot be read is laid over.
    const handleSaveQuote = useCallback(async (formData, editingQuote = null, { onFailure } = {}) => {
        const askedOrg = requestOrg();   // after an org switch its answer changes nothing (state §0.175)
        setQuoteModalError(null);
        setQuoteModalSaving(true);
        const fail = (words, unknown) => { setQuoteModalError(words); if (onFailure) onFailure({ words, unknown }); return null; };
        try {
            const isEdit = !!editingQuote;
            const payload = isEdit
                ? { ...formData, id: editingQuote.id }
                : { ...formData, id: formData.id || ('qt_' + crypto.randomUUID()) };

            const res = await dbFetch('/.netlify/functions/quotes', {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            // The ok check first, the house words (state §0.248, docs/design/refusal-sweep Part 10; Jeff's Q3).
            if (!res.ok) {
                const refused = await res.json().catch(() => null);
                if (!stillOrg(askedOrg)) return null;
                // A create stored already, or a move made already (state §0.271 — a send back that landed): the quote as stored.
                if (landedBefore(res.status, refused) && (!isEdit || refused.code === 'already')) {
                    const stored = await storedRowOf('/.netlify/functions/quotes', 'quotes', payload.id);
                    if (!stillOrg(askedOrg)) return null;
                    if (!stored) return fail(maybeSaid('The quote', 'saved', 'It could not be read again.'), true);
                    setQuotes(prev => (prev.some(q => q.id === stored.id) ? prev.map(q => (q.id === stored.id ? stored : q)) : [...prev, stored]));
                    return stored;
                }
                const heard = heardRefusal(res.status, refused);
                const stale = isEdit && res.status === 409 && refused?.code === 'stale' && refused.quote?.id === payload.id;
                if (stale) setQuotes(prev => prev.map(q => (q.id === refused.quote.id ? refused.quote : q)));
                const words = heard ? refusalWords(res, refused) : maybeSaid('The quote', 'saved', refusalWords(res, refused));
                setQuoteModalError(words);
                if (onFailure) onFailure({ words, unknown: !heard, stale, quote: stale ? refused.quote : null });
                return null;
            }
            // A landed answer that cannot be read: saved — a create shows the copy sent; an edit lays what it sent over the
            // quote it was made on; the stamp of either not known (null), so its next press is refused as stale with the quote
            // as stored — never sent with no stamp, which is not checked (the review).
            const data = await res.json().catch(() => ({}));
            if (!stillOrg(askedOrg)) return null;
            const { ifStamp: _sent, ...sent } = payload;
            const saved = data.quote || (isEdit ? { ...editingQuote, ...sent, stamp: null } : { ...payload, stamp: null });
            setQuotes(prev =>
                isEdit
                    ? prev.map(q => q.id === saved.id ? saved : q)
                    : [...prev, saved]
            );
            setQuoteModalError(null);
            return saved;
        } catch (err) {
            if (!stillOrg(askedOrg)) return null;
            return fail(maybeSaid('The quote', 'saved', failureWords(err)), true);
        } finally {
            setQuoteModalSaving(false);
        }
    }, []);

    // ── Product CRUD ──────────────────────────────────────────────────────────
    // A product save's answer (state §0.242, §18b123 rule 4): { ok: true, product } once saved; { ok: false, error }
    // when refused — the server's words, else "The server returned N." — for the Price Book to draw; and
    // { ok: false, quiet: true } when the org changed while it was out (state §0.175): that answer changes nothing
    // and says nothing. `formData` is the body as the screen built it (productChanges.js — only what changed).
    // Since §0.261 (the unknown-save rule, Part 3; Part 6): a new product keeps the id its form sends — one per opening of
    // the form — and the server's answer that it is already this org's is the earlier press landed, the product read
    // again; only the server's own refusal is { ok: false, error } in its words alone, any other failure says it may have
    // been saved (`unknown`).
    const handleSaveProduct = useCallback(async (formData, editingProduct = null) => {
        const askedOrg = requestOrg();   // after an org switch its answer changes nothing (state §0.175)
        try {
            const isEdit = !!editingProduct;
            const payload = isEdit
                ? { ...formData, id: editingProduct.id }
                : { ...formData, id: formData.id || ('prod_' + crypto.randomUUID()) };

            const res = await dbFetch('/.netlify/functions/products', {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            // The ok check first (state §0.248, docs/design/refusal-sweep Part 10): the server's words with their ref.
            if (!res.ok) {
                const refused = await res.json().catch(() => null);
                if (!stillOrg(askedOrg)) return { ok: false, quiet: true };
                if (!isEdit && landedBefore(res.status, refused)) {
                    const stored = await storedRowOf('/.netlify/functions/products?includeInactive=true', 'products', payload.id);
                    if (!stillOrg(askedOrg)) return { ok: false, quiet: true };
                    if (!stored) return { ok: false, error: maybeSaid('The product', 'saved', 'It could not be read again.'), unknown: true };
                    setProducts(prev => [...prev.filter(p => p.id !== stored.id), stored]);
                    return { ok: true, product: stored };
                }
                const heard = heardRefusal(res.status, refused);
                return { ok: false, error: heard ? refusalWords(res, refused) : maybeSaid('The product', 'saved', refusalWords(res, refused)), unknown: !heard };
            }
            const data = await res.json().catch(() => ({}));
            if (!stillOrg(askedOrg)) return { ok: false, quiet: true };
            const saved = data.product || payload;
            setProducts(prev =>
                isEdit
                    ? prev.map(p => p.id === saved.id ? saved : p)
                    : [...prev, saved]
            );
            return { ok: true, product: saved };
        } catch (err) {
            if (!stillOrg(askedOrg)) return { ok: false, quiet: true };
            return { ok: false, error: maybeSaid('The product', 'saved', failureWords(err)), unknown: true };
        }
    }, []);

    // A product's Delete answers what happened (state §0.261, the unknown-save rule, Part 3): { ok: true } once deleted;
    // { ok: false, error, unknown } when it was not — the server's own refusal in its words (`unknown` false), any other
    // answer or none may have deleted it; { ok: false, quiet: true } after an org switch. It said nothing when refused
    // (census-A row 38): the Price Book's row stayed, with no word why.
    const handleDeleteProduct = useCallback(async (productId, showConfirm) => {
        const doDelete = async () => {
            const askedOrg = requestOrg();   // after an org switch its answer changes nothing (state §0.175)
            let res;
            try {
                res = await dbFetch('/.netlify/functions/products?id=' + productId, { method: 'DELETE' });
            } catch (err) {
                if (!stillOrg(askedOrg)) return { ok: false, quiet: true };
                return { ok: false, error: failureWords(err), unknown: true };
            }
            if (!stillOrg(askedOrg)) return { ok: false, quiet: true };
            if (!res.ok) {
                const refused = await res.json().catch(() => null);
                return { ok: false, error: refusalWords(res, refused), unknown: !heardRefusal(res.status, refused) };
            }
            // Soft-delete: mark inactive in local state
            setProducts(prev => prev.map(p => p.id === productId ? { ...p, active: false } : p));
            return { ok: true };
        };
        if (showConfirm) {
            showConfirm('Deactivate this product? It will no longer appear in the catalog for new quotes.', doDelete, true, { confirm: 'Deactivate' });   // never "Delete" over a soft delete (state §0.272)
            return null;
        }
        return doDelete();
    }, []);

    // ── Helper: get all versions for a given opportunity ──────────────────────
    const getQuotesForOpp = useCallback((opportunityId) => {
        return quotes
            .filter(q => q.opportunityId === opportunityId)
            .sort((a, b) => {
                if (a.quoteNumber < b.quoteNumber) return -1;
                if (a.quoteNumber > b.quoteNumber) return 1;
                return (a.version || 1) - (b.version || 1);
            });
    }, [quotes]);

    // Quote numbers are issued SERVER-SIDE (quotes.mjs → nextQuoteNumber) and come
    // back on the POST response. The former client-side generator was removed: it
    // derived the next number from whatever quotes this browser had loaded, so two
    // reps quoting at once got the same number and a filtered list produced one
    // that collided with an existing quote.

    return {
        // State
        quotes, setQuotes,
        products, setProducts,
        // Loading
        loadQuotes, loadProducts,
        // Quote ops
        quoteModalError, setQuoteModalError,
        quoteModalSaving, setQuoteModalSaving,
        handleSaveQuote,
        // Product ops — a save answers { ok, error | quiet }, drawn by the Price Book's own form (state §0.242)
        handleSaveProduct,
        handleDeleteProduct,
        // Helpers
        getQuotesForOpp,

        // Deep link
        quotesDeepLinkOppId, setQuotesDeepLinkOppId,
    };
}
