import { useState, useCallback } from 'react';
import { dbFetch, waitForToken } from '../utils/storage';

/**
 * useQuotes — manages quotes and products (price book) state.
 *
 * Quotes:
 *   quotes[]            — all quotes for the org (loaded once on mount)
 *   loadQuotes()        — fetch all quotes from /quotes
 *   handleSaveQuote()   — POST (new) or PUT (update existing)
 *   handleDeleteQuote() — DELETE (admin only)
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
    const [productModalError, setProductModalError] = useState(null);
    const [productModalSaving, setProductModalSaving] = useState(false);

    // ── Loaders ───────────────────────────────────────────────────────────────
    const loadQuotes = useCallback(async (setDbOffline) => {
        try {
            await waitForToken();
            const res = await dbFetch('/.netlify/functions/quotes');
            if (!res.ok) { if (setDbOffline) setDbOffline(true); return; }
            const data = await res.json();
            setQuotes(data.quotes || []);
            if (setDbOffline) setDbOffline(false);
        } catch (err) {
            console.error('Failed to load quotes:', err.message);
        }
    }, []);

    const loadProducts = useCallback(async (includeInactive = false) => {
        try {
            await waitForToken();
            const url = includeInactive
                ? '/.netlify/functions/products?includeInactive=true'
                : '/.netlify/functions/products';
            const res = await dbFetch(url);
            if (!res.ok) return;
            const data = await res.json();
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
    const handleSaveQuote = useCallback(async (formData, editingQuote = null) => {
        setQuoteModalError(null);
        setQuoteModalSaving(true);
        try {
            const isEdit = !!editingQuote;
            const payload = isEdit
                ? { ...formData, id: editingQuote.id }
                : { ...formData, id: 'qt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) };

            const res = await dbFetch('/.netlify/functions/quotes', {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) {
                setQuoteModalError(data.error || 'Failed to save quote. Please try again.');
                return null;
            }
            const saved = data.quote || payload;
            setQuotes(prev =>
                isEdit
                    ? prev.map(q => q.id === saved.id ? saved : q)
                    : [...prev, saved]
            );
            setQuoteModalError(null);
            return saved;
        } catch (err) {
            setQuoteModalError('Failed to save quote. Check your connection and try again.');
            return null;
        } finally {
            setQuoteModalSaving(false);
        }
    }, []);

    const handleDeleteQuote = useCallback(async (quoteId, showConfirm) => {
        const doDelete = async () => {
            try {
                const res = await dbFetch('/.netlify/functions/quotes?id=' + quoteId, { method: 'DELETE' });
                if (!res.ok) { console.error('Failed to delete quote'); return; }
                setQuotes(prev => prev.filter(q => q.id !== quoteId));
            } catch (err) {
                console.error('Delete quote error:', err.message);
            }
        };
        if (showConfirm) {
            showConfirm('Delete this quote version? This cannot be undone.', doDelete, true);
        } else {
            await doDelete();
        }
    }, []);

    // ── Product CRUD ──────────────────────────────────────────────────────────
    const handleSaveProduct = useCallback(async (formData, editingProduct = null) => {
        setProductModalError(null);
        setProductModalSaving(true);
        try {
            const isEdit = !!editingProduct;
            const payload = isEdit
                ? { ...formData, id: editingProduct.id }
                : { ...formData, id: 'prod_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) };

            const res = await dbFetch('/.netlify/functions/products', {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) {
                setProductModalError(data.error || 'Failed to save product.');
                return null;
            }
            const saved = data.product || payload;
            setProducts(prev =>
                isEdit
                    ? prev.map(p => p.id === saved.id ? saved : p)
                    : [...prev, saved]
            );
            setProductModalError(null);
            return saved;
        } catch (err) {
            setProductModalError('Failed to save product. Check your connection.');
            return null;
        } finally {
            setProductModalSaving(false);
        }
    }, []);

    const handleDeleteProduct = useCallback(async (productId, showConfirm) => {
        const doDelete = async () => {
            try {
                const res = await dbFetch('/.netlify/functions/products?id=' + productId, { method: 'DELETE' });
                if (!res.ok) return;
                // Soft-delete: mark inactive in local state
                setProducts(prev => prev.map(p => p.id === productId ? { ...p, active: false } : p));
            } catch (err) {
                console.error('Delete product error:', err.message);
            }
        };
        if (showConfirm) {
            showConfirm('Deactivate this product? It will no longer appear in the catalog for new quotes.', doDelete, true);
        } else {
            await doDelete();
        }
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

    // ── Helper: generate next quote number for this org ───────────────────────
    const getNextQuoteNumber = useCallback(() => {
        const year = new Date().getFullYear();
        const prefix = `Q-${year}-`;
        const existing = quotes
            .filter(q => q.quoteNumber && q.quoteNumber.startsWith(prefix))
            .map(q => parseInt(q.quoteNumber.replace(prefix, ''), 10))
            .filter(n => !isNaN(n));
        const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
        return prefix + String(next).padStart(3, '0');
    }, [quotes]);

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
        handleDeleteQuote,
        // Product ops
        productModalError, setProductModalError,
        productModalSaving, setProductModalSaving,
        handleSaveProduct,
        handleDeleteProduct,
        // Helpers
        getQuotesForOpp,
        getNextQuoteNumber,
    };
}
