# Batch 4b-3 — Jeff's answers (1 November 2026)

Asked after the map (DESIGN.md §3), through AskUserQuestion, each with a
Recommended answer. Jeff took every one as Recommended.

- **Q0, order:** "A, C, D, then B" — the link rule, then teams, then service
  plans; the stale-save fix last, on a settled base.
- **Q4, the stale save:** "Revision per key" — every key carries a token
  compared in the write; a stale save is refused and the screen shows the
  latest.
- **The census:** "Run it" — SELECT counts per org, UKG included, never names
  or row contents; it decides Q3.
- **The rest (Q1-Q3, Q5-Q18):** "Take all Recommended":
  - Q1 held = any id the stored list holds in that field, anywhere;
  - Q2 a team's manager or a territory's owner: any member of this org;
  - Q3 strays already stored stay; only a restore clears what it lands (to be
    read against the census);
  - Q5 a refused screen takes the latest and says so; an addition half-made is
    re-applied once;
  - Q6 a save with no revisions at all is accepted unchecked;
  - Q7 the server pairs a team's name and id; a rename renames every member
    holding the team, inactive too;
  - Q8 no new duplicate team name; a stored one stays numbered;
  - Q9 a removed member leaves teams' and territories' lists, in the same
    request;
  - Q10 a coaching note's team on the house rule;
  - Q11 a plan's covered job types asked with its visit template;
  - Q12 "Create N plans" skips plans that exist;
  - Q13 quote templates' made-up creators filed with the panel's rewrite;
  - Q14 approval tiers keep their stricter rule, the re-ask filed;
  - Q15 the settings save stops taking `integrationRequests`;
  - Q16 the Dispatch rows naming settings entries: their own batch, 4b-4;
  - Q17 the house words per kind;
  - Q18 the write-time merge keeps §0.170's seeding and §0.171's dropping of
    retired keys.

## Step C — teams (2 November 2026)

Asked after step C's map (STEP-C.md §8), through AskUserQuestion, each with a
Recommended answer (Jeff, "Start please", then every Recommended):

- **J1, a member listed by Clerk id:** "Allow, read only" — the Teams page
  recognises a held Clerk id as the member it names; it never writes one where
  none was held, never as a manager; the one exception to CLAUDE.md's "never
  mix", written into guide §18b112 and CLAUDE.md.
- **J2, users-sync's team:** "Stop it" — users-sync no longer writes a member's
  team from Clerk's user metadata (create or fill); `territory`'s same hazard
  filed.
- **J3, UKG's count:** "Run it" — SELECT counts only, no names, before step C
  ships; "do not save UKG's team on the Teams page" kept until it is read.
- **J4, the rest:** "Take all Recommended" — N1, N2 as the critic amended it,
  (a) both ids off on removal, N4, N5, N6, N12, N13, N14, N16, N17 as written in
  STEP-C.md §8.

## Step D — service plans (2 November 2026)

Asked after step D's map (STEP-D.md §5), through AskUserQuestion, each with a
Recommended answer (Jeff, "Start step D", then every Recommended):

- **JD1, D2's "a plan exists":** "Name or old id; random" — a plan of the
  label's name (case and spaces aside) or the old button's id, in this org,
  any plan, skips the label; new plans get a random id.
- **JD2, the stored shape:** "Yes, for plans" — a plan's covered job types are
  stored as a real list; the one stored text row stays until saved; jobs and
  customers (the same class) filed.
- **JD3, Karen:** "Check QA, then decide" — QA's `repsCanUseDispatch` read; if
  on, Karen saves a test plan through the screen; if off, her app loads.
- **JD4, the rest:** "Take all Recommended" — the stale job-type chip drawn as
  the template's stale option (the disabled-or-not question kept open); R1,
  R2, R4, R5, R7 and the jsonb class filed; the GET's list always a list.

## Step B — the stale save (2 November 2026)

Asked after step B's map (STEP-B.md §6), through AskUserQuestion, each with a
Recommended answer (Jeff, "Start step B", then every Recommended):

- **J-B1, the split:** "Three commits" — B-1 the server, B-2 the shared
  sender and the people screens, B-3 every other screen; each with its own
  gates, harness run and browser check.
- **J-B4, what a refusal carries:** "Re-read settings once" — the 409 names
  the keys that moved and carries the words; the screen re-reads settings for
  the latest values and their tokens together. No copy of the GET's
  projection.
- **J-B15, a save with no tokens that loses its own race:** "Retry, then
  refuse" — the server tries again on a fresh read, twice at most, then
  answers 409; Q6's "accepted unchecked" kept.
- **The rest:** "Take all Recommended" — J-B2, J-B3, J-B5 to J-B14 as written
  in STEP-B.md §6, and the two filings.

### B-2 (2 November 2026)

Asked after B-2's map (STEP-B.md §4a, "Questions for Jeff"), through
AskUserQuestion:

- **The harness (JB2-12):** "Commit each, harness last" — asked in chat
  before the map's questions; written into CLAUDE.md's chain and guide §18b23
  part 4: each batch committed marked "harness deferred", one scoped run over
  every deferred batch before any push. J-B1's "each with its own harness
  run" yields to it for B-2 and B-3.
- **JB2-7 and JB2-8, the two older defects in the lines B-2 rewrites:** "Fix
  both in B-2" — the Assign popover and the Territory window stop replacing
  the roster from a filtered copy; Assign lists a member once
  (`teamsWithMemberOn`), off any other team list holding them by app id; N13
  (Clerk ids) stays filed.
- **The rest:** "Take all Recommended" — JB2-1 to JB2-6, JB2-9 to JB2-11 and
  JB2-13 as written in STEP-B.md §4a.
