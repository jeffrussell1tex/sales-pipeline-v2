// mergedDelete.js — the words a Delete of a merged-away record is refused in (state §0.282; OPEN_ITEMS §4.8, §0.273's
// found (2); Jeff, 21 Nov: "Refuse it" — it reverses Q4's "deleting stays as it is" for merged-away records only).
// A tab loaded before a merge still listed the record merged away; its Delete removed it (200), and the merge could
// never be undone — a delete's Undo then brought it back as a live duplicate. Now the server refuses it while the merge
// can still be undone, nothing deleted, naming the record it lives on in (told apart when both share a name — the
// spirit of guide §18b110; left out where the caller may not read it), and the screen reads its list again. Deleting a
// live record, a survivor too, is unchanged. `chained`: the record it was merged into was itself merged away since —
// that later merge is undone first (merge.mjs undoRefusal).
export function mergedDeleteWords(kind, name, intoName, { chained = false } = {}) {
    const noun = kind === 'contact' ? 'contact' : 'account';
    const what = String(name || '').trim();
    const into = String(intoName || '').trim();
    const undo = chained ? `undo the later merge of that ${noun}, then this one` : 'undo the merge first';
    if (!into) return `This ${noun} was merged into another ${noun} — nothing was deleted. To remove it, ${undo}.`;
    if (!what || what === into) return `This ${noun} was merged into another ${noun} also named “${into}” — nothing was deleted. It is part of that ${noun} now; to remove it, ${undo}.`;
    return `“${what}” was merged into “${into}” — nothing was deleted. It is part of “${into}” now; to remove it, ${undo}.`;
}
