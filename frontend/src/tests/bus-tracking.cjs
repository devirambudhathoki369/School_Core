const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const exportsForTest = {};
const source = fs.readFileSync(path.join(__dirname, '../components/views/bus_tracking/tracking.js'), 'utf8');
new Function('exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(exportsForTest);
const { busStatus, statusGroup, hasLocation, enlargedTile, FILTERS } = exportsForTest;
const now = Date.parse('2026-10-04T10:00:00Z');
const bus = { latitude: 28.1, longitude: 82.3, status: 'Moving', updated_at: '2026-10-04T09:59:45Z', stale: false };
// a live answer is shown as given
assert.equal(busStatus(bus, now), 'Moving');
assert.equal(busStatus({ ...bus, status: 'Idling' }, now), 'Idling');
// ...but not on the strength of an answer that has gone stale
assert.equal(busStatus(bus, now, true), 'Tracking unavailable');
assert.equal(busStatus(bus, now + 180000), 'No signal');
assert.equal(busStatus({ ...bus, updated_at: null }, now), 'No signal');
assert.equal(busStatus({ ...bus, stale: true }, now), 'No signal');
// A parked fix remains stopped while connected; an outage makes its status unknown.
const parked = { ...bus, status: 'Stopped', stale: true, updated_at: '2026-10-04T00:00:00Z' };
assert.equal(busStatus(parked, now), 'Stopped');
assert.equal(busStatus(parked, now, true), 'Tracking unavailable');
assert.equal(busStatus({ ...bus, status: 'No signal', stale: true }, now), 'No signal');
// no position at all
assert.equal(busStatus({ ...bus, latitude: null }, now), 'Offline');
assert.equal(busStatus({ ...bus, status: 'Offline' }, now), 'Offline');
for (const status of ['Moving', 'Idling', 'Stopped', 'Offline', 'No signal']) {
    assert.equal(busStatus({ ...bus, status }, now, true), 'Tracking unavailable');
}
assert.equal(busStatus({ latitude: null, longitude: null, status: 'Offline' }, now, true), 'Tracking unavailable');
assert.equal(busStatus({ latitude: null, longitude: null, status: 'Tracking unavailable' }, now), 'Tracking unavailable');
assert.equal(statusGroup('Tracking unavailable'), 'unavailable');
// Once the connection recovers, real offline and moving states return.
assert.equal(busStatus({ ...bus, status: 'Offline' }, now, false), 'Offline');
assert.equal(busStatus(bus, now, false), 'Moving');
// the tabs: "No signal" is counted with Offline
assert.deepEqual(['Moving', 'Idling', 'Stopped', 'No signal', 'Offline'].map(statusGroup), ['moving', 'idling', 'stopped', 'offline', 'offline']);
assert.deepEqual(FILTERS.map(([key]) => key), ['all', 'moving', 'idling', 'stopped', 'offline', 'unavailable']);
assert.equal(hasLocation({ latitude: 0, longitude: 82 }), true);
// A square the map service has not drawn is cut from the tile above it. The
// bus in Tulsipur at level 19 is tile 381763/219372; its level-18 parent is
// drawn twice the size and the square is its right-hand, top quarter.
const square = { z: 19, x: 381763, y: 219372 };
assert.deepEqual(enlargedTile(square, 0), { z: 19, x: 381763, y: 219372, full: 256, left: 0, top: 0 });
assert.deepEqual(enlargedTile(square, 1), { z: 18, x: 190881, y: 109686, full: 512, left: 256, top: 0 });
assert.deepEqual(enlargedTile(square, 2), { z: 17, x: 95440, y: 54843, full: 1024, left: 768, top: 0 });
// The sixteen squares under one tile take sixteen different pieces of it, and
// together they cover it exactly.
const pieces = new Set();
for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) {
    const piece = enlargedTile({ z: 19, x: 381760 + x, y: 219372 + y }, 2);
    assert.deepEqual([piece.z, piece.x, piece.y, piece.full], [17, 95440, 54843, 1024]);
    pieces.add(`${piece.left},${piece.top}`);
}
assert.equal(pieces.size, 16);
assert.ok([...pieces].every(piece => piece.split(',').every(edge => edge % 256 === 0 && edge >= 0 && edge <= 768)));
// --- where a bus has been -------------------------------------------------
const historyForTest = {};
const historySource = fs.readFileSync(path.join(__dirname, '../components/views/bus_tracking/history.js'), 'utf8');
new Function('exports', ts.transpileModule(historySource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(historyForTest);
const { nepalInput, historyPreset, historyRange, pointIndexAt, routeSegments, historyTime, duration } = historyForTest;
// 10:00 UTC is 15:45 in Nepal, and the pickers speak Nepal time.
assert.equal(nepalInput(now), '2026-10-04T15:45');
assert.deepEqual(historyPreset('today', now), { from: '2026-10-04T00:00', to: '2026-10-04T15:45' });
assert.deepEqual(historyPreset('hour', now), { from: '2026-10-04T14:45', to: '2026-10-04T15:45' });
assert.deepEqual(historyPreset('yesterday', now), { from: '2026-10-03T00:00', to: '2026-10-04T00:00' });
// Just past midnight in Nepal is still "yesterday" in UTC: today must be Nepal's day.
assert.equal(historyPreset('today', Date.parse('2026-10-04T18:30:00Z')).from, '2026-10-05T00:00');
// What is sent to the server carries the timezone the pickers left unsaid.
assert.deepEqual(historyRange({ from: '2026-10-04T00:00', to: '2026-10-04T15:45' }, now), { from: '2026-10-03T18:15:00.000Z', to: '2026-10-04T10:00:00.000Z' });
assert.deepEqual(historyRange(historyPreset('yesterday', now), now), { from: '2026-10-02T18:15:00.000Z', to: '2026-10-03T18:15:00.000Z' });
for (const range of [{ from: '2026-10-04T10:00', to: '2026-10-04T09:00' }, { from: '2026-10-04T10:00', to: '2026-10-04T10:00' },
    { from: '2026-10-02T00:00', to: '2026-10-04T00:00' }, { from: '', to: '2026-10-04T00:00' }]) {
    assert.throws(() => historyRange(range, now), /no longer than 24 hours/);
}
assert.throws(() => historyRange({ from: '2026-10-05T10:00', to: '2026-10-05T11:00' }, now), /future/);
// The record on show is the last one at or before the moment being played.
const recorded = ['09:00:00', '09:00:10', '09:00:20', '09:10:00'].map((time, i) => ({ updated_at: `2026-10-04T${time}Z`, latitude: 28 + i / 1000, longitude: 82, gap_before: i === 3 }));
const moment = time => Date.parse(`2026-10-04T${time}Z`);
assert.deepEqual(['08:00:00', '09:00:00', '09:00:15', '09:05:00', '09:10:00', '12:00:00'].map(time => pointIndexAt(recorded, moment(time))), [0, 0, 1, 2, 3, 3]);
assert.equal(pointIndexAt([], moment('09:00:00')), 0);
// The line is broken where the device was silent, never drawn across the gap.
assert.deepEqual(routeSegments(recorded), [[[28, 82], [28.001, 82], [28.002, 82]], [[28.003, 82]]]);
assert.deepEqual(routeSegments([]), []);
assert.equal(historyTime('2026-10-04T02:01:45Z'), '07:46:45');
assert.equal(historyTime('2026-10-04T02:01:45Z', true), '04 Oct 2026, 07:46:45');
assert.equal(historyTime(null), '—');
assert.deepEqual([47, 158, 5936, 0, NaN].map(duration), ['47 sec', '2 min', '1 hr 38 min', '0 sec', '—']);
console.log('Bus tracking status checks passed.');
