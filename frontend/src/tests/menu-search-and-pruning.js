/**
 * The rail's search box, and the promise that nothing in the menu leads to
 * "COMING SOON!!!".
 *
 * Run with:  node src/tests/menu-search-and-pruning.js
 *
 * Two things are pinned down here, both of them pure functions in
 * `src/methods/menuTree.js`:
 *
 *   1. PRUNING. Every row the rail and the shortcuts grid offer must resolve to
 *      a view — the same map `pages/[role].jsx` renders from. A row that does
 *      not is a dead end wearing a page's clothes, and it is the whole reason
 *      anyone ever saw "COMING SOON!!!".
 *   2. SEARCH. Matching is against the breadcrumb, so two vague words narrow
 *      the list instead of emptying it, and a matching GROUP keeps its children.
 *
 * The real menu config is JSX, so it cannot be imported from a plain node
 * script; the tree below is shaped like it (groups, nested groups, an
 * action-only row, a hidden row) which is what these functions actually care
 * about. The last block then re-checks the invariant against the SHIPPING
 * config — menus.jsx and configs/views/ parsed for real — and that is the check
 * that catches a new menu row added without a view behind it.
 *
 * Why a plain script: this repo has no test runner and `src/tests/` already
 * holds hand-run scripts in exactly this style.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

// The helper is app source (ESM in a .js file, resolved by Next's bundler), so
// it is loaded as text and imported as a module rather than required.
const src = readFileSync(join(HERE, '..', 'methods', 'menuTree.js'), 'utf8');
const { pruneUnopenableMenus, filterMenuTree, collectMenuLeaves, joinView } =
    await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(src));

let failures = 0;
function check(label, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failures++;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
    if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
}

// ---------------------------------------------------------------- the tree --
const MENU = [
    {
        name: 'Payment', view: 'payment', submenu: [
            { name: 'Student', view: 'student' },
            { name: 'Ledger posting', view: 'ledger-posting' },
        ]
    },
    {
        name: 'Accounting', view: 'accounting', submenu: [
            { name: 'Journal Entry', view: 'journal-entry' },
            // the Contra Entry case: a menu row whose component is commented out
            { name: 'Contra Entry', view: 'contra-entry' },
            {
                name: 'Reports', view: 'reports', submenu: [
                    { name: 'Day Book', view: 'day-book' },
                    { name: 'Trial Balance', view: 'trial-balance' },
                ]
            },
        ]
    },
    // a group where NOTHING resolves — it should not survive as an empty chevron
    {
        name: 'Inventory', view: 'inventory', submenu: [
            { name: 'Items', view: 'items' },
        ]
    },
    { name: 'Match Photos', view: 'student-photos' },
    { name: 'Database Backup', action: 'database-backup' },
    { name: 'Notice List', view: 'notices', hidden: true },
];

const VIEWS = {
    'payment.student': () => null,
    'payment.ledger-posting': () => null,
    'accounting.journal-entry': () => null,
    'accounting.reports.day-book': () => null,
    'accounting.reports.trial-balance': () => null,
    'student-photos': () => null,
    'communication.notices': () => null,
};

const names = (list) => list.map(m => m.name);
const paths = (list) => collectMenuLeaves(list).map(l => l.view);

// ------------------------------------------------------------------ paths --
check('joinView builds the dot path the router uses',
    joinView('exams.results', 'marksheet'), 'exams.results.marksheet');
check('joinView on a top-level page is the view alone',
    joinView('', 'student-photos'), 'student-photos');

// ---------------------------------------------------------------- pruning --
const pruned = pruneUnopenableMenus(MENU, VIEWS);

check('a row with no view behind it is dropped',
    paths(pruned).includes('accounting.contra-entry'), false);
check('a group whose children all vanish is dropped too',
    names(pruned).includes('Inventory'), false);
check('everything that resolves survives, and nothing else',
    paths(pruned), [
        'payment.student', 'payment.ledger-posting',
        'accounting.journal-entry',
        'accounting.reports.day-book', 'accounting.reports.trial-balance',
        'student-photos',
    ]);
check('an action row (Database Backup) has no view and still survives',
    names(pruned).includes('Database Backup'), true);
check('with no views map yet, the tree is returned untouched',
    names(pruneUnopenableMenus(MENU, undefined)), names(MENU));

// ----------------------------------------------------------------- search --
check('a plain word finds the page',
    paths(filterMenuTree(pruned, 'day book')), ['accounting.reports.day-book']);
check('matching is case-insensitive',
    paths(filterMenuTree(pruned, 'DAY BOOK')), ['accounting.reports.day-book']);
check('two vague words narrow, they do not empty',
    paths(filterMenuTree(pruned, 'acc day')), ['accounting.reports.day-book']);
check('a term from the GROUP name matches its children',
    paths(filterMenuTree(pruned, 'accounting trial')), ['accounting.reports.trial-balance']);
check('a group whose own name matches is kept whole',
    paths(filterMenuTree(pruned, 'payment')),
    ['payment.student', 'payment.ledger-posting']);
check('no match empties the list, so the rail can say so',
    filterMenuTree(pruned, 'zzz').length, 0);
check('an empty query is not a filter',
    names(filterMenuTree(pruned, '   ')), names(pruned));
check('a hidden row is never a search result',
    paths(filterMenuTree(MENU, 'notice')), []);
check('search keeps the parent chain, so the rail can unfold to it',
    names(filterMenuTree(pruned, 'trial')), ['Accounting']);

// ------------------------------------------- and now the shipping config --
//
// The invariant that actually matters in production: every leaf of menus.jsx
// must have a component behind it in configs/views/. Both files are JSX, so
// they are parsed with the babel parser the Next toolchain already ships rather
// than pattern-matched — a regex over this config gets the nesting wrong, and a
// test that is wrong about the tree is worse than no test.
const require_ = (await import('node:module')).createRequire(import.meta.url);
const parser = require_(join(HERE, '..', '..', 'node_modules', '@babel', 'parser'));

const parse = (file) => parser.parse(readFileSync(file, 'utf8'),
    { sourceType: 'module', plugins: ['jsx'] });
const propOf = (obj, key) => obj.properties
    .find(p => p.type === 'ObjectProperty' && (p.key.name || p.key.value) === key);
const stringOf = (prop) => prop?.value?.type === 'StringLiteral' ? prop.value.value : undefined;

// every leaf path the menu offers, per menu (admin / superadmin)
function menuLeaves(file) {
    const out = {};
    for (const node of parse(file).program.body) {
        if (node.type !== 'VariableDeclaration') continue;
        for (const d of node.declarations) {
            if (d.init?.type !== 'ArrayExpression') continue;
            const leaves = [];
            (function walk(arr, parent) {
                for (const el of arr.elements || []) {
                    if (el?.type !== 'ObjectExpression') continue;
                    const path = joinView(parent, stringOf(propOf(el, 'view')));
                    const submenu = propOf(el, 'submenu');
                    if (submenu?.value?.type === 'ArrayExpression') walk(submenu.value, path);
                    else if (!propOf(el, 'action')) leaves.push(path);
                }
            })(d.init, '');
            out[d.id.name] = leaves;
        }
    }
    return out;
}

// every view key that resolves to a component (an explicit `null` does not)
function viewKeys(file) {
    const keys = new Set();
    for (const node of parse(file).program.body) {
        if (node.type !== 'VariableDeclaration') continue;
        for (const d of node.declarations) {
            if (d.init?.type !== 'ObjectExpression') continue;
            for (const p of d.init.properties) {
                if (p.type !== 'ObjectProperty') continue;
                if (p.value.type === 'NullLiteral') continue;
                keys.add(p.key.value || p.key.name);
            }
        }
    }
    return keys;
}

const cfg = (...parts) => join(HERE, '..', 'configs', ...parts);
const shared = ['exam.jsx', 'accounting.jsx', 'inventory.jsx', 'library.jsx']
    .flatMap(f => [...viewKeys(cfg('views', f))]);
const resolvable = {
    adminMenu: new Set([...shared, ...viewKeys(cfg('views', 'admin.jsx'))]),
    superAdminMenu: new Set([...shared, ...viewKeys(cfg('views', 'superadmin.jsx'))]),
};
const shipped = menuLeaves(cfg('menus.jsx'));
for (const [menuName, leaves] of Object.entries(shipped)) {
    check(`${menuName}: every row leads to a page that exists`,
        leaves.filter(p => !resolvable[menuName]?.has(p)), []);
}
check('the shipping menus were actually read',
    Object.keys(shipped).sort(), ['adminMenu', 'superAdminMenu']);

console.log(failures === 0
    ? '\nAll checks passed — the rail only offers pages that open, and search finds them.'
    : `\n${failures} check(s) FAILED.`);

if (typeof process !== 'undefined' && failures > 0) process.exitCode = 1;
