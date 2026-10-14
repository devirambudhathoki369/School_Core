/**
 * The navigation rail's one invariant: AT MOST ONE SUBMENU OPEN PER LEVEL.
 *
 * Run with:  node src/tests/sidebar-single-open-submenu.js
 *
 * This mirrors the two pure functions that AppContext owns — `toggleMenuGroup`
 * and the route-sync effect — and exercises them over a menu tree shaped like
 * the real one (four levels deep, the way Exam and result ▸ Results ▸ Number
 * System ▸ Final result is). Everything else in the rail is Material Tailwind
 * rendering; the behaviour that was actually broken lives entirely in these two
 * reducers, so this is the part worth pinning down.
 *
 * Why a plain script: this repo has no test runner and the brief was not to add
 * dependencies. `src/tests/` already holds hand-run scripts in exactly this
 * style (date-validation.js, paymentupdate.js), so this follows the local
 * convention rather than importing one.
 */

// ---- the logic under test, copied verbatim in behaviour from AppContext ----

/** Open or close one group. Returns the new open path. */
function toggleMenuGroup(prev, viewName) {
    const parts = String(viewName).split('.');
    const depth = parts.length - 1;
    return prev[depth] === viewName
        ? prev.slice(0, depth)
        : parts.map((_, i) => parts.slice(0, i + 1).join('.'));
}

/** The branch a given page lives in: every ancestor of the selected view. */
function pathForSelectedMenu(selectedMenu) {
    if (!selectedMenu) return [];
    const parts = String(selectedMenu).split('.');
    return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('.'));
}

// depth is derivable from the view path alone — no counter is threaded through
const depthOf = (viewName) => viewName.split('.').length - 1;

// ---- assertions ----

let failures = 0;
function check(label, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    const ok = a === e;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
    if (!ok) console.log(`        expected ${e}\n        got      ${a}`);
}

// The exact case named in the brief.
{
    let path = [];
    path = toggleMenuGroup(path, 'dashboard');
    check('opening Dashboard opens it', path, ['dashboard']);

    path = toggleMenuGroup(path, 'manage');
    check('opening Manage CLOSES Dashboard', path, ['manage']);

    path = toggleMenuGroup(path, 'manage');
    check('clicking the open group collapses it', path, []);
}

// Nesting is not a violation: a child group is a different level, so a parent
// stays open while its own child unfolds. What must never happen is two
// SIBLINGS at the same level.
{
    let path = [];
    path = toggleMenuGroup(path, 'exams');
    path = toggleMenuGroup(path, 'exams.results');
    path = toggleMenuGroup(path, 'exams.results.number-system');
    check('a nested branch stays open end to end', path,
        ['exams', 'exams.results', 'exams.results.number-system']);

    // its sibling at depth 2 replaces it, and nothing deeper survives
    path = toggleMenuGroup(path, 'exams.results.letter-grading');
    check('a sibling at depth 2 replaces it', path,
        ['exams', 'exams.results', 'exams.results.letter-grading']);

    // switching a top-level group discards the whole branch below it
    path = toggleMenuGroup(path, 'payment');
    check('switching the top group drops the whole branch', path, ['payment']);
}

// REGRESSION. Opening a deep group whose ancestors are NOT already open used to
// place it at index 0 while its depth was 3 — after which it could never match
// itself, so a second click appended a duplicate instead of closing it.
// Rebuilding the branch from the view path is what makes the index correct by
// construction.
{
    let path = toggleMenuGroup([], 'exams.results.number-system.final');
    check('a deep group opened cold brings its whole ancestry', path,
        ['exams', 'exams.results', 'exams.results.number-system',
            'exams.results.number-system.final']);
    path = toggleMenuGroup(path, 'exams.results.number-system.final');
    check('and clicking it again closes it', path,
        ['exams', 'exams.results', 'exams.results.number-system']);
}

// Navigating (a click on a leaf, the command palette, a pasted `#…` URL) puts
// the rail on the branch that contains the page — and only that branch.
{
    check('a two-level page opens its one parent',
        pathForSelectedMenu('dashboard.summary'), ['dashboard']);
    check('a deep page opens its whole ancestry',
        pathForSelectedMenu('exams.results.number-system.class-result'),
        ['exams', 'exams.results', 'exams.results.number-system']);
    check('a root-level page opens nothing',
        pathForSelectedMenu('student-photos'), []);
    check('no selection opens nothing',
        pathForSelectedMenu(''), []);
}

// THE INVARIANT ITSELF, stated over the real menu shape: whatever sequence of
// clicks and navigations is applied, the open path can never hold two entries
// at the same depth — because it is an array indexed BY depth. This walks a
// pseudo-random sequence to make the point empirically as well as structurally.
{
    const groups = [
        'dashboard', 'enrollment', 'enrollment.bulk', 'payment', 'manage',
        'exams', 'exams.results', 'exams.results.number-system',
        'exams.results.number-system.final', 'reports', 'accounting', 'library',
    ];
    const pages = [
        'dashboard.summary', 'payment.student', 'manage.fees', 'student-photos',
        'exams.results.number-system.class-result', 'enrollment.bulk.student-updates',
    ];
    let path = [];
    let worstCase = 0;
    let seed = 7;
    const next = (n) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;

    for (let i = 0; i < 4000; i++) {
        if (next(3) === 0) {
            path = pathForSelectedMenu(pages[next(pages.length)]);
        } else {
            const g = groups[next(groups.length)];
            path = toggleMenuGroup(path, g);
        }
        // one entry per depth, by construction
        const depths = path.map(depthOf);
        const distinct = new Set(depths);
        if (depths.length !== distinct.size) {
            console.log('FAIL  two groups open at the same depth:', path);
            failures++;
            break;
        }
        // and each entry must sit at the index matching its own depth
        for (let d = 0; d < path.length; d++) {
            if (depthOf(path[d]) !== d) {
                console.log('FAIL  entry at wrong index:', path);
                failures++;
                break;
            }
        }
        worstCase = Math.max(worstCase, path.length);
    }
    check('4000 random clicks/navigations never break the invariant', failures, 0);
    console.log(`        (deepest branch reached during the run: ${worstCase} levels)`);
}

console.log(failures === 0
    ? '\nAll checks passed — at most one submenu can be open per level.'
    : `\n${failures} check(s) FAILED.`);

if (typeof process !== 'undefined' && failures > 0) process.exitCode = 1;
