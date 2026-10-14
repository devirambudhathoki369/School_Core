// Run: node src/tests/payment-mode-reports.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cache = new Map();
function load(relative) {
    const filename = path.resolve(__dirname, '..', relative);
    if (cache.has(filename)) return cache.get(filename);
    const exports = {};
    cache.set(filename, exports);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText;
    new Function('exports', 'require', source)(exports, name => {
        assert.ok(name.startsWith('@/'));
        return load(name.slice(2) + '.js');
    });
    return exports;
}
const { collectionByMode, paymentModeLabel } = load('methods/payment/collection.js');
const formatter = load('components/views/reports/transactions/transactions_history/formatter.js').default;
const receipts = [
    { id: 1, mode: 1, details: { 1: { amt: '1000.50', dis: '100' }, 2: { amt: '20' }, __titles: { 1: 'Fee' } } },
    { id: 2, mode: '2', details: { 1: { amt: '200' } } },
    { id: 'extra:1', mode: 4, details: { 'extra:1': { amt: '125.50' } } },
    { id: 4, mode: 3, details: { 1: { amt: '300' } } },
    { id: 5, details: { 1: { amt: '10' } } },
];
const expected = [920.5, 200, 300, 125.5, 10];
const totals = collectionByMode(receipts, row => formatter.sum(row.details));
assert.deepEqual(totals.map(row => row.total), expected);
assert.equal(paymentModeLabel(null), 'Unspecified');
assert.equal(paymentModeLabel(99), 'Unspecified');
for (const [columns, rows] of [formatter.intermediate('test', receipts, 1), formatter.detailed('test', receipts, {}, 1)]) {
    assert.ok(columns.some(([key]) => key === 'payment_mode'));
    assert.equal(rows[0].payment_mode, 'Cash');
    assert.deepEqual(collectionByMode(rows, row => row.total), totals);
}
assert.deepEqual(formatter.modewise(receipts)[1], totals);
assert.equal(formatter.modewise(receipts.filter(row => Number(row.mode) === 2))[1][1].total, 200);
const trialRows = [{ mode: 4, credit_amount: '50.25' }, { discount_amount: 100 }, { debit_amount: 500 }];
assert.deepEqual(collectionByMode(trialRows, row => row.credit_amount || 0).map(row => row.total), [0, 0, 0, 50.25]);
assert.equal(collectionByMode([{ mode: 1, amount: 0.1 }, { mode: 1, amount: 0.2 }], row => row.amount)[0].total, 0.3);
console.log('Payment-mode report checks passed.');
