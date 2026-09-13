# Phase 0 — the spine collision, read against the real app

The brief is `docs/design/handoff-signal-tonal/README.md` (§3 and §4, "Phase 0 — Resolve the spine collision. Decide nothing alone."). Its `SPINE_CONFLICT.affected` list names Claude Design's mock artboards (`dispatch-customers-a/b/c.jsx`, `documents-surfaces.jsx`, `documents-rails.jsx`, `contact-account-rails.jsx`). None of those files exist here. This document is the same question asked of `src/` — every left spine in the app, what each one means today, and one resolution to apply globally before any list is migrated.

Method: `grep -rnE "inset [3-6]px 0 0|borderLeft:\s*\`?[3-6]px" src/` (13 Sep 2026, `dev` at `7aec59d`), each hit read in place. Nothing in `src/` was changed.

## 1. Every left spine in the app, by what it means

### 1a. SELECTION — four lists (the brief's actual collision surface)

| File | Line | Spine colour when selected | Also on the row |
|---|---:|---|---|
| `src/components/ListView.jsx` | 252 | `T.gold` (3px, + `surface2` fill) | the period/group picker — no severity ever |
| `src/Tabs/ContactsTab.jsx` | 464 | `T.ink` (3px, + `surface2` fill) | the company list — no severity ever |
| `src/Tabs/LeadsTab.jsx` | 758 | the lead's SCORE BAND colour (`SCORE_COLORS[scoreBand(score)]`, 3px, + `surface2`) | `LeadStatusPill` (a status pill, r999) and the `LeadScore` badge |
| `src/Tabs/DispatchTab.jsx` | 3126 | the customer's PLAN TIER colour (`presOf(c).color`, `inset 3px 0 0`, + a gold tint) | `overdueBy[c.id]` and `renewalDays(c)` render in the same row — an overdue customer that is also selected is the collision, live, today |

Three different colours mean "selected" in four lists. Only one (ContactsTab) uses ink.

### 1b. SEVERITY already on a row — one site, already in the design's form

| File | Line | Treatment |
|---|---:|---|
| `src/Tabs/DispatchTab.jsx` | 809 | technician lane over hours → `boxShadow: inset 3px 0 0 T.danger` |

This is exactly `FORM.spineWidth` on a flagged row. It needs only the colour (`RAMP.critical.deep`) and the `SignalRow` wrapper.

### 1c. NOTICE BOXES — about sixty sites, already tint + spine

The pattern `padding · tinted background · borderLeft: 3px solid <signal> · radius 3–6` is the app's callout: error banners, info notes, warnings, success confirmations. Sites (from the audit's form column, `spine 3px · tint bg`): the Settings panels (`ApiKeysDetail`, `AutomationsDetail`, `BackupDetail`, `ConnectedAppsDetail` — its `CardNote`, `ExportDetail`, `FeaturesDetail`, `FlsDetail`, `MfaDetail`, `WebhooksDetail`, `AuditDetail`, `security/shared.jsx`, `DispatchVehiclesDetail`, `DispatchPropertyTypesDetail`, `DispatchJobTemplatesDetail`), `HomeTab.jsx` 733 and 920 (the attention cards, `urgencyBorder`: overdue → danger, meeting → info, else warn), `DispatchTab.jsx` 1393, 1408, 1417, 2646 (job-editor notes).

These are not rows and never carry selection; no collision. They are already the Tonal & Form callout shape and migrate by colour only (`tint` fill, `deep` spine) — the one form question is whether a callout's spine is `deep` (as the row spine in the reference) or `base`; the reference implementation uses the deep colour `c` for the row spine, so `deep`.

### 1d. CATEGORICAL and ORDINAL spines — about twenty sites, not signals

| Meaning | Sites | Width |
|---|---|---:|
| Job priority (`prioColor`: emergency → `T.danger`, high → `T.warn`, normal → `inkMid`, low → `inkMuted`) | `DispatchTab.jsx` 1232, 1794, 1856, 3758, 4715; `DispatchJobTemplatesDetail.jsx` 243 (its own copy) | 3px and **4px** |
| Pipeline stage (`stageColor`) | `PipelineTab.jsx` 311 | 3px |
| Plan tier (`pc`, `pres.color`) | `DispatchTab.jsx` 617, 3215 | 3px |
| Crew colour / team colour (user-chosen swatches) | `DispatchCrewsDetail.jsx` 150, `TeamsDetail.jsx` 228 | **4px** |
| Rep health (`healthColor`: ok / warn / danger by score) | `SalesManagerTab.jsx` 930 | 3px |
| Metric-card tone (`tone(k)`: danger / warn / ok) | `DispatchTab.jsx` 2164, 2290 | 3px |
| Job status colour (`col`) | `DispatchTab.jsx` 1783, 4441 | 3px |
| Lead card accent | `LeadsTab.jsx` 478 | 3px |
| Per-row colour (`item.borderColor`, `m.color`) | `HomeTab.jsx` 733, `UsersDetail.jsx` 851 | 3px |

Two of these are severity wearing a category's name: **job priority** (emergency / high ARE attend / critical) and **rep health** / **metric tone** (a score band that is a signal). The rest are identity colours (stage, tier, crew, team) and stay excluded per the brief.

### 1e. BRAND devices — not rows

- The **section-heading rule**: `borderLeft: 3px solid T.goldInk; paddingLeft: 10` on a title block — 13 sites (every Settings panel title through `CategoryDetailChrome.jsx` 19 and `form.jsx` 64; `SettingsTab.jsx` 20; `RolesDetail`, `TeamsDetail`, `TerritoriesDetail`, `UsersDetail` ×2, `PriceBookDetail`; `DispatchTab.jsx` 5687, 6071; `data/shared.jsx`, `integrations/shared.jsx`, `security/shared.jsx`).
- **Gold accent cards**: `LeadModal.jsx` 244, `OpportunityModal.jsx` 1987, `LeadsTab.jsx` 341, 418, `ContactsTab.jsx` 491.

Headings and cards, never list rows. Untouched by the migration (gold is on the exclusion list).

## 2. The collision, concretely

Two lists would carry BOTH meanings on one row after the migration:

1. **Dispatch → Customers** (`DispatchTab.jsx` 3126): selected = tier-coloured 3px spine; an overdue plan or a renewal due is shown in the same row. Under the design, that row also wants a 3px `attend`/`critical` spine. Same edge, same width, two meanings.
2. **Leads → Cockpit** (`LeadsTab.jsx` 758): selected = score-band 3px spine; the row carries a status pill and could carry a severity (a lead gone cold, a request refused).

The other two selection lists (ListView, ContactsTab) never carry severity, but the rule has to be one rule.

## 3. Recommendation — A, and the app already has the precedent

**Severity owns the 3px left spine. Selection becomes `background: T.surface2` + a 5px INK spine.** This is the brief's recommended A, and `ContactsTab.jsx` 464 already selects with an ink spine over `surface2` — so A is "make the other three lists do what the company list does", not a new idea.

What changes, per list:

| List | Today | Under A | Anything lost? |
|---|---|---|---|
| ListView period picker | gold 3px | ink 5px | no — gold stays on headings and cards |
| ContactsTab company list | ink 3px | ink 5px | no |
| LeadsTab cockpit row | score-band 3px | ink 5px | no — the `LeadScore` badge in the same row already shows the band |
| DispatchTab customer list | tier 3px + gold tint | ink 5px + `surface2` | no — the `PlanBadge` in the same row already shows the tier |

Why not B (severity on the RIGHT edge): a right spine is invisible on the two lists that scroll sideways (Triage strips, the dispatch board) and on any row with a trailing action. Why not C (dots only): the reference implementation pairs dots with the spine; dots alone at 5px are the smallest mark on the screen and vanish in a forty-row list — the brief's own argument for the form.

## 4. Two decisions the brief does not ask for but the code forces

1. **Job priority as a spine** (`prioColor`, 6 sites, mixed 3px/4px, `T.danger`/`T.warn`). Under A this is a third left-spine meaning unless it is mapped: emergency → `critical`, high → `attend`, normal/low → no spine (the priority is still printed on the card). Recommended: map it — a priority IS a severity. Alternative: drop the priority spine to a `SeverityDots` mark and keep the card edge for nothing.
2. **The 4px categorical spines** (crew colour, team colour) and **rep health / metric tone** (3px in signal colours). Crew and team are identity — keep, but at a width that is not the severity width (4px is already not 3px; say so in the guide). Rep health and metric tone are signals — they become `TrendCard`'s deep left border (the brief's metric-card form), which is what they already look like.

## 5. The brief's §7 open questions, answered from the code where the code answers

1. **`SC_TIERS`** — the real analogue is `planPresentation` / `presOf` in `DispatchTab.jsx` (service-plan tiers, each with a colour and a fill; `PlanBadge` is already r2, uppercase, tinted). The tier's only spine is the SELECTION spine on the customer list. Under A it goes to ink and the tier keeps its badge. Q1 resolves itself.
2. **Radius 2 everywhere** — the app already has r2 badges (`PlanBadge`, `StatusBadge` and `RoleBadge` in `OpportunityModal.jsx`, `NewBadge`). Of the signal sites, 38 are r999 lozenges and 92 are r8–r20 pills (audit §2a). Guide §16 line 740 says "Pills: `borderRadius: 999`" — that rule changes either way (signal pills r2, categorical pills rounded); flagged, not edited, until this is decided. **Jeff's call.**
3. **Destructive vs critical** — 43 sites read as destructive (delete buttons and their hover reds; the heuristic also catches a few error lines near a delete handler). Recommended: keep `T.danger` for destructive, per the brief's own rule 2. **Jeff's call.**
4. **Dark header** — yes, there are signals on the ink band: `AppHeader.jsx` 325, 330, 443 (notification badges in `T.danger`), 448 (a `T.warn` badge), 531 (a red hover). `RAMP.critical.deep` (`#4a1109`) on `#2a2622` would be near-invisible (both are near-black). The header badges need their own rule — keep today's `T.danger`/`T.warn` there, or use the ramp's `base` — and the contrast gate must test the ink band as a third background. **Flagged; a decision is needed before the "events" batch.**
5. **Charts** — yes, own palettes: `funnelColors` (ReportsTab 1413), `SOURCE_RAMP4` (1676), the avatar palettes (2173, 3250, 3927), the heat ramp at 3591, `KPIThresholdsDetail`'s "Color palette" card (display-only: it prints `#4d6b3d` etc. as text labels — it will read wrong the day the values move). One series uses signal tokens as a ranked palette: `lossBarColors = [T.danger, T.warn, T.inkMid, …]` (3016). Categorical series are excluded; `lossBarColors` is flagged as ambiguous.
6. **Scope** — the audit's per-file table says where the density is: `ReportsTab.jsx` (trends, 164 hex + the ReportsTab token copies), `DispatchTab.jsx` (events), the Settings panels (notices). Recommended: the brief's Phase 3 order across the whole app, but one file per commit for `ReportsTab.jsx` and `DispatchTab.jsx` (each over 5,000 lines).

## 6. What the migration's surface really is (found while reading)

- **The token object is not shared.** `settings/shared/tokens.js` is imported by the Settings panels only; every other area declares its own `T` (24 files), and `ReportsTab.jsx` declares eight (`T`, `T2`, `T2b`, `T2c`, `T3`, `T4`, `TS`, `T_ACTIVITY`). A value changed in the shared file reaches none of them. This is the strongest possible case for the brief's "ship primitives, not tokens": `SignalPill` / `SignalRow` / `SeverityDots` / `TrendCard` are imported by name wherever they are used, and `RAMP`/`SIGNAL`/`FORM` ride inside them.
- **Fourteen local pill components** are the natural call sites for `SignalPill` (or for "leave alone, it is categorical"): `LeadStatusPill`, `TasksTab.StatusPill`, `QStatus`, `ScoreBadge`, `PlanBadge`, `DPill`, `QPill` ×2, `ConnectedApps.Pill` / `StatusDot`, `StatusChip`, `DispatchVehicles.StatusPill`, `OpportunityModal.StatusBadge` / `SignalChip`, `StagePill`, `TypePill`.
- **The contrast gate has a home.** Unit tests are `node --test tests/*.test.mjs` and import pure modules from `src/`; the tokens must live in a plain `.js` file (no JSX) for the gate to import them. A new test file must also be added to `SUITES` in `scripts/mutate-import.mjs`.

## 7. What is needed from Jeff before any list is migrated

1. Approve resolution **A** (or choose B / C).
2. Job priority → severity mapping (§4.1): map it, or dots.
3. Signal pills at radius 2 everywhere, or only in dense lists (§5 Q2).
4. Destructive stays `T.danger` (§5 Q3).
5. The header badges' rule (§5 Q4).
6. Then the audit: `docs/design/color-audit.md` §7 (the signal sites) is the list to read; every `?` and every `destructive`/`event` split of `T.danger` is a decision, not a finding.
