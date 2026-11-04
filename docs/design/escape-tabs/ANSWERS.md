<!-- Escape in the tabs (OPEN_ITEMS §1 item 3, §4.1 "In-tab layers without Escape"): Jeff's answers to the 9 Oct design's questions. Asked 4 Nov 2026 in the twenty-fifth session, over 2942d6c / f885df4, after a fresh read-only inventory of every in-tab layer (DESIGN.md §2). -->

# Jeff's answers for Escape in the tabs (4 Nov 2026, in chat, AskUserQuestion)

Asked after three read-only readers re-did the 9 Oct inventory against today's tree (DESIGN.md §2). Every answer
is the Recommended option. The question text is quoted as asked; the answer as chosen.

- **Q1 Typed work** — "When Escape lands on a form or dialog that holds typed, unsaved work, what should it do?" →
  **"Ask "Discard?" (Recommended)"**: "If something was typed, App's confirm asks "Discard changes?" with Keep
  editing / Discard. If nothing was typed, it just closes. Mid-save, Escape does nothing."
- **Q2 Secrets** — the new API key, the new webhook's signing secret, the audit stream's signing secret →
  **"Only "I've stored it" (Recommended)"**: "At the reveal step, Escape, the backdrop and × do nothing; only the
  "I've stored it — close" button closes. Matches the audit stream secret today."
- **Q3 Shortcuts** — "What should the shortcuts do while an in-tab layer is open?" → **"Off while open
  (Recommended)"**: "No letter/number shortcut fires while any layer is open, in-tab or app; and none fires on a
  keystroke a control already handled (the time picker's typing). "?" still toggles the shortcuts list."
- **Q4 Batches** → **"Four batches (Recommended)"**: "1) the mechanism + CRM tabs (Accounts, Contacts, Leads,
  Pipeline, Tasks, Quotes, Reports, Documents; 18 layers); 2) Dispatch (10); 3) Settings (45); 4) inline-input
  Escapes and nested popovers."
- **Q5 Leave guard** — Settings' "Unsaved changes" guard, drawn inside the tab → **"Move it above
  (Recommended)"**: "Portal it to the page body so it draws at 99999, above every rail and window, where the order
  already places it." (Batch 3.)
- **Q6 Shortcuts list** — "?" opens under an open rail or the deal window → **"Yes, in batch 1 (Recommended)"**:
  "Raise it above the rails and windows and give it that place in the Escape order."
- **Q7 Layer bugs** in the batches' files → **"Fix in its batch (Recommended)"**: "Each fixed in the batch that
  converts that file's layers, with a test; anything outside layers gets filed in OPEN_ITEMS, not fixed."
- **Q8 Other finds** (deletes with no confirm in Webhooks, Automations and Dispatch time off; a component defined
  inside Dispatch's Technician view; four native time inputs) → **"File in OPEN_ITEMS (Recommended)"**: "Written
  into OPEN_ITEMS with file:line in batch 1's commit; you order them later."

Asked after the two critiques of the design (DESIGN.md §9), the same day:

- **Q9 Lingering** — the notifications panel and the "Add a follow-up task?" card never close by themselves, so
  with Q3 they would hold every shortcut off until closed → **"Close on outside click (Recommended)"**: "Both close
  when you click anywhere outside them (the follow-up card as Skip does). Shortcuts stay off while either is open,
  as you chose." (Batch 1.)
- **Q10 × and Cancel** — "Should ×, Cancel and the backdrop ask too?" → **"All four ask (Recommended)"**: "Escape,
  backdrop, × and Cancel all ask "Discard changes?" when something was typed; with nothing typed, all just close.
  One rule, no amendment." (Guide §18b80 rule 3 stands: one close for all four.)

Not asked, taken as the design's default (DESIGN.md §6, open to Jeff's word): what counts as typed work (a search
box or a filter draft does not); the document picker portaled above the rail it opens from (batch 4); one Escape in
an inline edit under a menu closes the edit only.
