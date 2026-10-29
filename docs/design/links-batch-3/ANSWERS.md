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
carry a Site Name; four were updated since 1 Oct. How they came to stand on a
site — before D22's lift (§0.198), a site made since by a path that lifts
nothing, or a write the rule does not see — is **not known** (not read); the
audit log holds no tier entries for UKG.

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
