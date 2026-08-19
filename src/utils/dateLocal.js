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
