# Batch 2 — Jeff's answers and the census

## Jeff's answers (28 Oct 2026, in chat; each was the Recommended option)

- **Q1, the placeholder with two customers:** "Open, ask to pick". The
  placeholder carries no customer. New Job opens with the name filled in and
  "more than one" said under the field.
- **Q2, quote → job with two customers:** "Refuse, name both". The server
  answers 409 and writes nothing. The message names both customers by number.
- **Q3, a second customer for one CRM account:** "Refuse it". The server
  answers 409 and names the customer already linked. Extra sites go in as that
  customer's service locations.
- **Q6, the census:** "Yes, run it".
- **Q4 (the header search's count) and Q5 (fold in the refused save that makes
  the customer twice)** were not asked separately. They stand as DESIGN.md
  recommends, unless Jeff says otherwise.

## The census

Read only, run 28 Oct 2026 at 20:50:48 UTC on the shared Neon `main` branch.
It ran SELECT counts per org and printed no names. Org ids are shortened.
UKG is `org_3CwnbloU…`. The script is in the session's scratchpad, not the
repo.

| org | customers | linked to an account | accounts with 2+ customers | repeated customer names (`searchKey`) | links naming no account | linked to a merged-away account | Closed Won deals | of those, no account id | accepted quotes | of those, deal with no account id | live account names repeated |
|---|---|---|---|---|---|---|---|---|---|---|---|
| org_3BDQEH7s… | 5 | 4 | 0 | 0 | 0 | 0 | 10 | 6 | 3 | 0 | 3 |
| org_3CwnbloU… (UKG) | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| org_3DwnytSa… | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| org_3K6LqEB6… | 4 | 3 | 0 | 0 | 0 | 0 | 3 | 0 | 3 | 0 | 0 |

**What the census shows:**

- **No existing twins anywhere.** No account has two customers, no customer
  name repeats, and no customer link is dead or points to a merged-away
  account. So no data decision is needed before the build, and Q3's server
  refusal meets no existing row.
- **Name lookups are still reached.** One org has 6 Closed Won deals with no
  account id; those placeholders reach the name step (rule 3). The same org
  has 3 live account names held by two or more accounts.
- **UKG** has 8 customers, none linked to an account, and no Closed Won deals.

**Read, not asked:** the census was limited to the orgs that hold customers,
won deals or accepted quotes. Account twins in other orgs were not counted.
