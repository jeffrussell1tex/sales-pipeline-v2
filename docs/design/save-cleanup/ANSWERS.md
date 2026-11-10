# Save cleanup batch — Jeff's answers (10 November 2026)

The design: DESIGN.md beside this file (over `bb0c88e`). Asked 10 Nov in the dialog, each question standing on its own, after Jeff chose the cleanup batch ("Cleanup batch") from the items §0.241 filed.

| # | Asked | Answer |
|---|---|---|
| S | How much the batch takes (six parts, about 28 files) | **"Parts 1-4 now (Recommended)"** — the products save, the partial-save wipes in three other endpoints, the percent range checks and the date labels now (graded by the evening's harness run); Part 5 (the silent-refusal sweep) and Part 6 (the Dispatch legacy-import trap) the next batch |
| Q1 | A products PUT naming an id this org does not hold | **"404, write nothing (Recommended)"** — as quotes and SPIFF claims do; a create is the POST |
| Q2 | The Price Book's "Custom / Variable Price" (never saved: no column) | **"Add the column (Recommended)"** — `products.custom_price`, nullable, additive, applied on Jeff's go; a custom product saves with a $0 list price and the builder's "Custom price — enter below" works |
| Q3 | A percent out of range in a request (deal discount, line discount, the org's default tax rate, a service plan's discount) | **"Refuse it (Recommended)"** — a 400 naming the field, nothing written; readers keep their existing clamps |
| Q4 | A rep types a line discount above 100 or below 0 | **"Refuse, name the line (Recommended)"** — Save refused in words naming the line, the typed value kept to fix |
| Q5 | How the corrected date labels read | **"Keep each look (Recommended)"** — only the day corrected, each label its current shape |
| Q6 | Export file names (Accounts, Contacts, Audit, Users, Pipelines) | **"Your local day (Recommended)"** — named by the member's day, not UTC's |

Not asked (Part 6, the next batch): Q7, the Dispatch "Import from the old settings list" card.

Pre-build census (SELECT only, 10 Nov): no settings row holds a `quoteDefaults.taxRate`; 2 service plans, none out of range; 0 quotes with a deal discount out of range or a line discount outside 0-100 (the mapper's); `products.custom_price` not yet a column. Still Jeff's: the schema apply of `products.custom_price`.
