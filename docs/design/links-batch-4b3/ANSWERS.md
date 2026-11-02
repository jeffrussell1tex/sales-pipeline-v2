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
