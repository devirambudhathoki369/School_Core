/**
 * The facilities (modules) a superadmin gives a school, as the frontend gates
 * them — `src/configs/moduleGates.js`.
 *
 * Run with:  node src/tests/school-modules.js
 *
 * Three things are pinned down:
 *
 *   1. THE GATES. A school without a module has no page of it — the menu
 *      branch, every page under it, and a single page filed elsewhere (extra
 *      activities live under Manage but belong to exams).
 *   2. THE PERMISSIONS TAB offers nothing for a module the school lacks.
 *   3. THE TWO LISTS AGREE. The backend keeps the same modules in
 *      backend/main/constants/school_modules.py; a module added to one and not
 *      the other would be a menu with no server behind it, or the reverse.
 *      And every gate names pages that really exist, so a renamed menu cannot
 *      leave a module silently ungated.
 *
 * Why a plain script: this repo has no test runner and `src/tests/` already
 * holds hand-run scripts in exactly this style.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

// App source (ESM in a .js file), loaded as text and imported as a module.
const src = readFileSync(join(HERE, '..', 'configs', 'moduleGates.js'), 'utf8');
const { SCHOOL_MODULES, MODULE_GATES, moduleAllowed, filterViewsByModules, permissionAllowed } =
    await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(src));

let failures = 0;
function check(label, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failures++;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
    if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
}

const ALL = Object.fromEntries(SCHOOL_MODULES.map(({ flag }) => [flag, true]));
const NONE = Object.fromEntries(SCHOOL_MODULES.map(({ flag }) => [flag, false]));

// ------------------------------------------------------------------ gates --
check('a school with payroll opens its pages', moduleAllowed('payroll.salary-posting', ALL), true);
check('a school without payroll does not', moduleAllowed('payroll.salary-posting', { ...ALL, uses_payroll: false }), false);
check('nor the payroll menu itself', moduleAllowed('payroll', { ...ALL, uses_payroll: false }), false);
check('a nested accounting report follows accounting',
    moduleAllowed('accounting.reports.day-book', { ...ALL, uses_accounting: false }), false);
check('extra activities under Manage follow exams',
    moduleAllowed('manage.extra-activities-setup', { ...ALL, uses_exams: false }), false);
check('the rest of Manage does not',
    moduleAllowed('manage.fees', NONE), true);
check('a page of no module is every school\'s', moduleAllowed('payment.student', NONE), true);
check('a profile without the flag at all has no module', moduleAllowed('library.books', {}), false);
check('the canteen\'s pages follow the canteen', moduleAllowed('canteen.counter', { ...ALL, uses_canteen: false }), false);
check('a canteen user\'s profile carries only that flag, and opens them',
    moduleAllowed('canteen.collect', { uses_canteen: true }), true);

const VIEWS = {
    'dashboard': 1, 'payroll.staff': 2, 'payroll.pay-slips': 3, 'exams.setup': 4,
    'manage.fees': 5, 'manage.extra-activities-setup': 6, 'hostel.rooms': 7,
};
check('with every module the view map is the same object',
    filterViewsByModules(VIEWS, ALL) === VIEWS, true);
check('without payroll and exams their pages leave the view map',
    Object.keys(filterViewsByModules(VIEWS, { ...ALL, uses_payroll: false, uses_exams: false })),
    ['dashboard', 'manage.fees', 'hostel.rooms']);

// ----------------------------------------------------------- permissions --
check('no exam permissions without exams', permissionAllowed('EXAM', null, { ...ALL, uses_exams: false }), false);
check('exam permissions with exams', permissionAllowed('EXAM', null, ALL), true);
check('no salary posting (204) without payroll', permissionAllowed(null, 204, { ...ALL, uses_payroll: false }), false);
check('staff enrolment (201) is not payroll', permissionAllowed(null, 201, NONE), true);
check('extra activities setup (508) follows exams', permissionAllowed(null, 508, { ...ALL, uses_exams: false }), false);
check('a category of no module is every school\'s', permissionAllowed('STUDENT', null, NONE), true);
check('no canteen permissions without the canteen', permissionAllowed('CANTEEN', null, { ...ALL, uses_canteen: false }), false);

// ------------------------------------------------- the backend agrees --
const backend = readFileSync(join(HERE, '..', '..', '..', 'backend', 'main', 'constants', 'school_modules.py'), 'utf8');
const rows = [...backend.matchAll(/\("(\w+)", "(uses_\w+)", "([^"]+)", (True|False)\)/g)]
    .map(([, code, flag, label, on]) => ({ flag, label, on: on === 'True' }));
check('the backend lists the same modules, labels and defaults, in order',
    rows, SCHOOL_MODULES.map(({ flag, label, on }) => ({ flag, label, on })));
check('every gate is a module the school form offers',
    [...new Set(Object.values(MODULE_GATES))].every(flag => SCHOOL_MODULES.some(m => m.flag === flag)), true);
check('every module the form offers is gated',
    SCHOOL_MODULES.every(({ flag }) => Object.values(MODULE_GATES).includes(flag)), true);

// ------------------------------------------ the gates name real pages --
const require_ = (await import('node:module')).createRequire(import.meta.url);
const parser = require_(join(HERE, '..', '..', 'node_modules', '@babel', 'parser'));
const parse = (file) => parser.parse(readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
function viewKeys(file) {
    const keys = new Set();
    for (const node of parse(file).program.body) {
        if (node.type !== 'VariableDeclaration') continue;
        for (const d of node.declarations) {
            if (d.init?.type !== 'ObjectExpression') continue;
            for (const p of d.init.properties) {
                if (p.type === 'ObjectProperty') keys.add(p.key.value || p.key.name);
            }
        }
    }
    return keys;
}
const cfg = (...parts) => join(HERE, '..', 'configs', 'views', ...parts);
const pages = ['admin.jsx', 'exam.jsx', 'accounting.jsx', 'inventory.jsx', 'library.jsx', 'hostel.jsx', 'extra_billing.jsx',
    'canteen.jsx']
    .flatMap(f => [...viewKeys(cfg(f))]);
for (const gate of Object.keys(MODULE_GATES)) {
    check(`the gate "${gate}" names pages that exist`,
        pages.some(p => p === gate || p.startsWith(`${gate}.`)), true);
}

console.log(failures ? `\n${failures} check(s) FAILED.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
