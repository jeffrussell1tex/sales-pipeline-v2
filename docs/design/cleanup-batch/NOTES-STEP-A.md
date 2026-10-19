<!-- The cleanup batch (OPEN_ITEMS §1, "Next, merged-away records leave every other list"): what step G's reviews found that step A must do in THE GUARD (tests/merged-away-lists.test.mjs). Written 18 Oct 2026 in the twenty-first session, read only, over 7ee14fe — file:line references are as of 7ee14fe and may have moved; verify every one before building. Step G (§0.208, THE GUARD class-wide) is DONE; steps A (§0.209, the screens) and B (§0.210, the public API, the quote email and the numbers) are next. The read-only maps it cites (map-*.md, critique-*.md) were scratch files and are not kept. -->

# Notes for step A (§0.209) and step B (§0.210), from step G's fixer

Written by step G's fixer (18 Oct 2026). These items are step A's or B's to carry, not G's.
The suite they edit is `tests/merged-away-lists.test.mjs` as G leaves it:
- sha256 `0349e9f99163e25e9eaa992340557ce84ec3cff120ee0d510f7d52589d4d619a`, 1546 lines, LF;
- `b14/edits/files/merged-away-lists.test.mjs`, applied by `b14/edits/02-guard.mjs`.

## 1. The A-plan line (harness review #2, verbatim)

The harness review (`b14/review-g-harness.md`, finding 2, "Fix", first bullet) asks that this be added to the A plan's §5.2 line:

> Add to the A plan's §5.2 line: "RECEIVERS: AddContactToOppPanel out; RESOLVERS gains standsFor, mergedInto, accountOfDeal, heldAccountOption, each with its C1 label; WHOLE_READS gains DispatchTab's two mergedAwayName reads (stay)"

Its other two bullets were G's, and are done in G's file:
- `:1005`'s message now says "not followed — is nothing handed to it any more? Then take it out of RECEIVERS".
- The REGRESSION message now says "a call that resolves through the whole list: add it to RESOLVERS, with the test that runs it on a merged-away row".

## 2. Harness review #8: the design's line numbers for this file are 13ba06c's

Design §5.2 cites three lines of `tests/merged-away-lists.test.mjs`. On G's final file each sits 8 lines lower (the build's tree had +4):

| Line | At 13ba06c | On G's file |
|---|---|---|
| RAIL_CONTACTS' second line (`c.accountId ? c.accountId === account?.id : …`) | :251 | **:259** |
| T3's `CHILDREN` | :212 | **:220** |
| AccountRail's import pin (`import { resolveLink, linkRefusal, unarchived, HIDDEN_ACCOUNT } …`) | :261 | **:269** |

Steps A and B anchor by text, so nothing breaks. Read the design's numbers as +8.

## 3. Harness review #9: a leftover "until §0.209" entry would pass after A ships

`FATES` (`:637` on G's file) always accepts `SCREENS` and `NUMBERS`.

- **A's commit:** take `SCREENS` out of `FATES` (and its `const`, once nothing names it). Any "until §0.209" entry left in WHOLE_READS then fails "a reason and a fate".
- **B's commit:** do the same with `NUMBERS`.

## 4. What G's review fixes mean for A and B

These are new in G's final file (`b14/fix-g-dispositions.md`).

**RECEIVERS must be the whole set.** T8 fails both ways:
- a receiver reached but not named;
- a receiver named but not reached.

P4 (`allContacts={unarchived(contacts)}`) turns ReportsTab's hand-off into a `live` read. So AddContactToOppPanel leaves RECEIVERS, as in item 1. A new hand-off that A adds (P11, P12) is named there.

**Resolver form.** A resolver's list must be:
- a DIRECT argument (`f(x, accounts)`, `f(accounts || [])`); or
- the direct value of a property of an object literal that is one (`f({ records: accounts })`, `f({ accounts })`).

Anything else inside the arguments is a read of its own: a filter, a spread, an assignment. (`unarchived(accounts)` is a `live` read wherever it stands, so `f({ records: unarchived(accounts) })` needs nothing.) Check A's new calls against this:
- `standsFor`;
- `mergedInto(globalSearch, accounts)`;
- `accountOfDeal`;
- `heldAccountOption`;
- `mergedAwayName`'s callers.

**'carries'.** A resolver whose answer holds the rows it was given must carry `'carries'` as the fifth element of its RESOLVERS entry. contactIndex is one today. Its answer must then be bound to a name, and that name is scanned as the list.

Decide this for each of A's four new resolvers by reading its return value:
- an array or object holding rows of the list it was given → `'carries'`;
- an id, an id list, a name, an option or a verdict → nothing.

`standsFor` (design §3) needs this read with particular care.

**runsOnMerged's limit is now stated** (comment above `runsOnMerged`). The check passes when the test calls the name AND a merge-marked row is in reach. It does not prove the marked row reaches the call. So each new entry's named test must be read to run the call on a list that holds a merged-away row.

**CARRIED and APP_READS.** `getAccountRollup`'s `allContacts` is named in two places:
- APP_READS (App.jsx builds it);
- CARRIED (no screen reads it).

P40 (filed) drops it. When it goes, take both entries out together.

**LIST_HOOK_KEYS.** A new value App.jsx takes from `useAccounts()` / `useContacts()` fails T8 until it is classified there. That means either:
- a row-carrying key with its reason; or
- one of the keys that hand on no rows.

**The combined message.** A WHOLE_READS line that A rewords, but that still reads the whole list, fails once with: "a line WHOLE_READS names, not found as written — fixed? take it out of the list; moved or reworded? update its text there", followed by the new line. A line A fixes (now a shape) fails with: "a line WHOLE_READS names, gone or read a different number of times — fixed? take it out of the list".
