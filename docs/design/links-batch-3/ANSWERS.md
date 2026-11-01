# Batch 3 — Jeff's answers and the census

## Jeff's answers (29 Oct 2026, in chat; each was the Recommended option)

- **Q1, a refused row:** "Refuse that row". That row only is refused, listed
  at Preview (row, field, cell, the records it matched); the rest import; the
  receipt repeats it.
- **Q2, a Sales Rep's narrowed list:** "Leave it, decide later". The import
  reads the caller's list, as the pickers do; decided once with §4.8's
  "Twins are still easy to make".
- **Q3, a deal whose Account names no saved account:** "Refuse the row".
- **Q4, an Overwrite naming a different record:** "Re-link it". The record's
  id with its name; a blank cell keeps the stored pair.
- **Q5, an account Overwrite's Parent Account cell:** "Ignore it and say so".
- **Q6, two new rows of one name in one file:** "Refuse if same parent".
  Same name and same Parent cell: both refused; different parents: both
  import, and a Parent cell naming that name is refused as two matches.
- **Q7, a merge into a grandchild or below:** "Refuse, name the chain".
- **Q8, a merge that would put anything below a site or change a moved
  account's tier:** "Refuse it". Nothing written; every merge stays exactly
  undoable.
- **Q9, an API bulk PUT naming a parent or renaming an account:** "Refuse it".
  A tier sent is ignored.
- **Q10, the census:** "Yes, run it".
- **Q11, a deal with a blank Sales Rep:** "Importer, by id". The receipt shows
  the owner names the server could not match or found twice.
- **Q12, SPIFF claims renamed org-wide by a merge:** "Fold it in". Only claims
  on a deal of the merge, and claims with no deal by name.

## Jeff's answers for step 3b (30 Oct 2026, in chat; each the Recommended)

Two gaps the read-only map of the contact and deal imports found (a workflow:
four readers, each checked by a critic, over `306be1f`):

- **Q13, two new rows of one file that are the same contact (same email) or
  the same deal (same name on the same account):** "Refuse both". As Q6 for
  accounts: both rows refused at Preview, the rest import.
- **Q14, an Overwrite's blank cell** (a mapped column, an empty cell — today a
  blank Sales Rep unassigns the deal, a blank Stage sets Discovery, a blank
  ARR sets 0, and so on for contacts and accounts): "Keep what's stored". An
  Overwrite writes only the cells the file fills, on all three imports, as Q4
  already keeps a blank Company (a deal's blank Account refuses the row — Q3).

## Jeff's answers for step 3c (30 Oct 2026, in chat)

A read-only map of the account and contact merges (a workflow: four readers
— the account merge, the Undo, the contact merge, the windows — each checked
by a critic, over `8e02c19`; 18 corrections) found these gaps. Jeff's answers,
each the Recommended:

- **Q15, the Undo of a contact the account merge moved by id:** "Still on
  survivor". Every moved contact still linked to the survivor goes back with
  its own logged company text, even if the survivor was renamed since (as a
  deal's id move is put back today); one re-linked elsewhere since is kept
  and counted.
- **Q16, a record with no account id whose text names the merged-away account
  when a third live account has that name:** "Skip if shared". Contacts,
  deals and SPIFF claims are renamed by name only when no live account
  outside the pair has the name (the D22 lift's test); otherwise left and
  counted.
- **Q17, a contact merge where the two contacts' Company reads alike but
  their links differ, or only one is linked:** "Show it to pick". The window
  compares by link: two accounts are a conflict (each account's level or
  parent shown); a link only the record merged away has fills; the Company
  text and the account id travel together.
- **Q18, the small merge fixes the design offered to 3c:** all three — the
  audit's double count (each record counted once), two merges at once (a
  claim, as the Undo's, so the second is refused), and Past merges' busy mark.

**Taken as recommended (the map's answers, following the design and the house
rules):** an account merge moves only the contacts on the merged-away id
(not those of records merged into it before — DESIGN "What does not change"),
by their snapshotted ids, each logged with its own old `accountId` and
`company`; the contacts name rename is scoped to `accountId` null or the
survivor, so a moved contact is logged and put back once; a deal moved by id
takes the survivor's name in the same statement (`dealsOfMerge` unchanged); a
SPIFF claim is renamed when its deal is a deal of the merge (`dealsOfMerge`,
read in this org) or it has no live deal, and only when its text is one of
the merge's names — a claim on a deal the D22 lift moves takes that deal's new
account name; the contact merge's pair is derived on the server from the
record whose Company won, checked by `checkLinks` (a merged-away account
followed, its current name written), and a dead account refuses the merge
(409, nothing written, naming the Company); the contact merge's Undo puts the
pair back only while both still hold what the merge wrote; the account window
counts contacts as the rail reads them and names Dispatch, SPIFF claims and
the D22 lift in words; both windows' words corrected, the Undo sentence one
pinned tail; the app re-reads SPIFF claims after a merge and its Undo. Filed,
not in 3c: the contact merge's tasks and activities moved by value (a row
linked mid-merge is moved unlogged) and the per-deal `contactIds` write's
unguarded read; the same race on the account merge's other id moves.

## Jeff's answers for step 3d (31 Oct 2026, in chat)

A read-only map of the merge's placement (a workflow: five readers — the
server's placement, the Undo's deals, the duplicate scan, the window, the
tests and harness — each checked by a critic, over `db51d6a`) found four
choices the design left open. Jeff's answers, each the Recommended:

- **Q19, the record merged away's sub-accounts merged away earlier (hidden
  from every list):** "Judge live rows only". The refusals look only at live
  accounts; a hidden merged-away row still moves with the rest, as today — a
  merge is never refused over a record no screen shows.
- **Q20, the survivor's own lift (a site or unit merged with the account
  above it goes up, and a top-level one becomes an account):** "Keep the lift
  allowed". Only the moved sub-accounts are judged, against the survivor's
  level after the lift; the lift stays exactly undoable (survivorRestore).
- **Q21, a legacy row deep in a moved branch whose fit the move does not
  change:** "Only what the move changes". A merge is refused only where the
  move itself changes a row's level; moving a misfit row itself (one of UKG's
  12) is still refused (Q8).
- **Q22, the window knowing the server will refuse:** "Warn, keep Merge". The
  window shows the refusal's words — and, where it would work, that the other
  record as survivor merges — above the button; Merge stays pressable and the
  server decides.

**Taken as recommended (the map's answers, following the design and the house
rules):** the placement is read in this org before the batch, the refusal
answered with nothing written; the children move by the ids read, each still
under the record merged away, and the batch aborts (the refusal read again)
when a live child not read stands there — so no child lands unplaced; a
survivor two or more levels under the record merged away is refused naming
the chain (Q7's words); `accountTier` leaves the merge's fields (old logs
still undo); D22's namesake test counts live accounts only, through 3c's
`idlessNames`; the Undo's `dealsOn` also reads the survivor's deals with no
account id by the name it will carry once the Undo is done, where no other
account live after the Undo has that name (the record merged away counted
live), leaving out a deal its name restore sends back to the record merged
away — and `noDealOn` asks the same in the batch, only when that read found
the name alone (OPEN_ITEMS §4.7's first shape; the second stays filed); the
duplicate scan marks a same-name pair in one hierarchy with each record's
level and parent and no longer calls it "safe to merge" — in the org-wide
scan only, never the create probe (a rep's own list); the contact scan's
words are left as they are, filed. Found, not settled: the census showed no
same-name pair in one hierarchy in UKG, while eight code comments name UKG's
two "Shell - Port Allen" (a unit and its site) — not read which is current.

## The census

Read only, run 29 Oct 2026 at 21:10:23 UTC on the shared Neon `main` branch
(`ep-soft-morning-…`). SELECTs only; names read into memory to apply
`searchKey`, never printed. Org ids are shortened; UKG is `org_3CwnbloU…`.
The script is in the session's scratchpad, not the repo. "Live" means not
merged away.

**Accounts**

| org | live | merged away | twin-name groups (rows) | same-name pairs in one hierarchy | under a site | tier not below its parent's | top level, not an account | loops | parent missing / merged away |
|---|---|---|---|---|---|---|---|---|---|
| org_3B8LhDm6Z… | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 |
| org_3B8Tg9OtN… (the dev "UKG") | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 |
| org_3BDQEH7sx… (Accelerep Test) | 147 | 0 | 3 (6) | 0 | 0 | 0 | 2 | 0 | 0 / 0 |
| **org_3CwnbloUX… (UKG)** | 666 | 3 | 0 | 0 | 0 | **12** | 0 | 0 | 0 / 0 |
| org_3DwnytSaS… | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 |
| org_3K6LqEB6k… (Accelerep QA) | 15 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 |

UKG's tiers, live (a follow-up count): 85 top-level accounts; 12 accounts
stored as tier `account` under an `account` parent (the "tier not below"
column); 32 business units and 422 sites under an account; 115 sites under a
business unit.

**Contacts (live)**

| org | contacts | no account id: company names 1 live account / 2+ / none / merged-away only / blank | on a merged-away account | on a missing account | company not their account's name |
|---|---|---|---|---|---|
| org_3BDQEH7sx… | 1536 | 1427 / 79 / 1 / 0 / 6 | 0 | 0 | 0 |
| UKG | 1516 | 0 / 0 / 0 / 0 / 1 | 0 | 0 | 0 |
| org_3DwnytSaS… | 1 | 0 / 0 / 0 / 0 / 1 | 0 | 0 | 0 |
| org_3K6LqEB6k… | 24 | — (every contact linked) | 0 | 0 | 0 |

**Deals and SPIFF claims**

| org | deals | no account id: names 1 live account / none | on a merged-away account | **on a site** | on a missing account | text not their account's name | claims | claim text not its deal's |
|---|---|---|---|---|---|---|---|---|
| org_3B8Tg9OtN… | 3 | 0 / 3 | 0 | 0 | 0 | 0 | 0 | 0 |
| org_3BDQEH7sx… | 51 | 19 / 4 | 0 | 0 | 0 | 0 | 7 | 0 |
| **UKG** | 19 | 4 / 0 | 0 | **6** | 0 | 0 | 0 | 0 |
| org_3K6LqEB6k… | 16 | — | 0 | 0 | 0 | 0 | 1 | 0 |

UKG's six deals on a site (a follow-up count): six different sites, each with
a parent; three open (Evaluation 1, Qualification 2), three Closed Lost; four
carry a Site Name; four were updated since 1 Oct. How they came to be was not
read. They are likely the legacy rows the code already names: accounts.mjs says
"UKG's deals on sites stay until changed by hand" (from before D22's lift,
§0.198), and src/utils/accountParent.js's header counts 13 tier-'account' rows
under an account at its read of 12 Oct, stored before the rule and kept until
moved. Whether today's six deals and twelve accounts are those rows was not read
(noted 29 Oct, §0.215, once the build read those comments).

**What it says for the design:**

- No loops, nothing under a site, no contact or deal on a merged-away or
  missing account, no text that has drifted from its link, in any org — the
  merge's and the import's new refusals meet no existing breakage of those
  kinds.
- UKG's 12 accounts under an account break the rank rule (D3). Q8's merge
  refusal ("a moved account's tier would change") would refuse a merge that
  moves one of them; a single save of one keeps its tier until it is moved.
  Jeff's data decision, filed (OPEN_ITEMS §2.4).
- UKG's six deals on a site break D22; nothing in this batch moves them.
  Filed for Jeff with the twelve (OPEN_ITEMS §2.4).
- Accelerep Test's 79 id-less contacts whose company names two live accounts
  are demo data; a backfill would refuse them under the rule, as an import
  now would. No backfill is in this batch.

## Jeff's answers for §0.220 (1 November 2026)

After §0.219, two recommendations: fix the chain refusal's words where two
records share a name, and press a refused merge once in the browser. Jeff:
"do that". Two choices then asked (AskUserQuestion), each the Recommended:

- **Card level:** "Show level on cards" — each merge card's grey line starts
  with its level, so the words' tags match what the cards show.
- **Error box:** "Warm warning box" — the server's refusal in both merge
  windows in the warm warning colours, not the delete red.

The review changed the words' tags for the two merged from their level to
their cards' tags (survivor, archive): a level or a place read alike for two
top-level twins, the commonest pair (state §0.220).
