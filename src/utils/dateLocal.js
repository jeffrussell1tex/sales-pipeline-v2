// dateLocal.js — building yyyy-mm-dd strings from the LOCAL calendar.
//
// Pure and dependency-free, so `node --test` can reach it. Same reason
// quarters.js and csvAutoMap.js are: anything that imports React or useApp is
// invisible to the gates, and a date rule that is wrong for half the planet
// should not be in the untestable half of the codebase.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────
// `someDate.toISOString().split('T')[0]` converts to UTC before truncating, so
// the date it returns is not the date the user is looking at:
//
//   Chicago (UTC-5), 8pm Tue    -> "Wednesday"   (tomorrow, all evening)
//   Tokyo (UTC+9), 9am Wed      -> "Tuesday"     (yesterday, all morning)
//
// Found in 29 places in src/. The observed damage, worst first:
//
//   * SalesManagerTab coaching notes STORED tomorrow's date when written in the
//     evening. A wrong date on screen can be fixed; a wrong date in the database
//     is permanent.
//   * TaskItem compared dueDate against a "today" that rolls over at 7pm Central,
//     so tasks due today turned red as overdue that evening.
//   * HomeTab's previous-week range ended on a boundary that landed on the wrong
//     side of midnight in EVERY timezone tested, so "last week" included today and
//     the week-over-week delta was skewed.
//
// The rule: if a Date stands for a day on someone's wall calendar -- today, this
// week, the date in a form -- format it here. If it stands for an instant (an
// audit timestamp, a createdAt heading for the server) then UTC is correct and
// toISOString is the right call. The distinction is the reason this is a helper
// and not a blanket find-and-replace.
//
// Lives in its own module rather than in quarters.js, where isoLocal first landed:
// importing a general date helper from a file named "quarters" is the kind of
// misfiling that ends with someone writing a second copy.

// yyyy-mm-dd for the local calendar day this Date falls on.
export function isoLocal(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Today, locally. The `new Date()` + isoLocal pair is the dominant shape at the
// call sites, so it gets a name -- one place to be right rather than a dozen.
export function todayLocal() {
    return isoLocal(new Date());
}

// ── THE READ SIDE ────────────────────────────────────────────
// The rule above has a mirror. A yyyy-mm-dd string stands for a day on a wall
// calendar and must be read at LOCAL noon: `new Date('2026-09-01')` is UTC
// midnight, which renders as the previous evening everywhere west of Greenwich
// (TaskItem showed every due date a day early). A string that carries a time --
// createdAt, updatedAt, an audit timestamp -- is an instant and parses as-is;
// appending noon to one of those builds an Invalid Date, and every age computed
// from it renders "NaN" (LeadsTab's "NaNyr ago", 0.59). The audit that followed
// counted the `+ 'T12:00:00'` shape at ~140 sites, not the ~20 recorded: all but
// a handful feed date-only columns and are correct, but nothing guarded the
// assumption. This does. It never returns an Invalid Date -- null instead, so a
// caller can branch on it rather than propagate NaN.
export function parseLocalDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
    const s = String(v).trim();
    const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T12:00:00') : new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
}

// A day as a CSV cell might carry it, normalised to yyyy-mm-dd -- or null when
// nothing recognisable is there. The importer passed Close Date and Created Date
// through untouched, so "9/15/2026" or Excel's "2026-09-15 00:00:00" landed in a
// varchar(20) as written, and every consumer's noon-append then produced an
// Invalid Date for that deal: days-in-stage NaN, the stale flag permanently false
// (the never-stale bug arriving through the importer), the quarter bucket
// "undated". Order matters: ISO and US numeric forms are decoded by hand so a
// date-time suffix keeps the day the FILE says rather than the day UTC says, and
// an impossible date (2/30) is refused rather than rolled into March the way
// `new Date` would. Anything else goes through the engine's parser as a last
// resort; a bare run of digits does not, because `new Date('46000')` is the
// year 46000, not an Excel serial.
export function toLocalDay(v) {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s || /^\d+$/.test(s)) return null;
    let m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s))) return validDay(+m[1], +m[2], +m[3]);
    if ((m = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[T ].*)?$/.exec(s))) return validDay(+m[3], +m[1], +m[2]);
    // A two-digit US year is this century: "9/15/26" is 2026 in a CRM that
    // exists in 2026, and the engine used to say the same before it was gated.
    if ((m = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2})(?:[T ].*)?$/.exec(s))) return validDay(2000 + +m[3], +m[1], +m[2]);
    // The engine fills in a MISSING year as 2001: "Sept 15", "Oct 1" and "9/15"
    // all came back as real 2001 days (0.64) -- worse than a refusal, because
    // it looks like a date. A written-out date must carry a four-digit year to
    // reach the engine at all.
    if (!/\d{4}/.test(s)) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : isoLocal(d);
}

// The parts must survive a round trip through a real Date unchanged; 2026-02-30
// comes back as March 2nd, and that difference is the rejection.
function validDay(y, mo, d) {
    const dt = new Date(y, mo - 1, d, 12);
    return (dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d) ? isoLocal(dt) : null;
}
