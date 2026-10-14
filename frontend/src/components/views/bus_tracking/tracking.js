export const TRACKING_VIEW = 'view-bus-tracking';

// The tabs over the list, in the order a school looks for a bus.
export const FILTERS = [['all', 'All'], ['moving', 'Moving'], ['idling', 'Idling'], ['stopped', 'Stopped'], ['offline', 'Offline'], ['unavailable', 'Unavailable']];

export function hasLocation(bus) {
    return Number.isFinite(bus?.latitude) && Number.isFinite(bus?.longitude);
}

/**
 * What the page may call a bus right now.
 *
 * The server names the state at the moment it asked the provider. The page can
 * be showing that answer some time later — a tab left open through a lost
 * connection — and a bus must not go on reading "Moving" on the strength of an
 * answer that has gone stale. A failed connection makes every current status
 * unknown, including a bus that was previously parked.
 */
export function busStatus(bus, now = Date.now(), unavailable = false) {
    if (unavailable || bus?.status === 'Tracking unavailable') return 'Tracking unavailable';
    if (!hasLocation(bus)) return 'Offline';
    const status = bus.status || 'Offline';
    if (status !== 'Moving' && status !== 'Idling') return status;
    const age = now - Date.parse(bus.updated_at);
    if (bus.stale || !Number.isFinite(age) || age > 120000 || age < -60000) return 'No signal';
    return status;
}

// "No signal" is counted with Offline: either way the bus is not being heard from.
export function statusGroup(status) {
    if (status === 'Tracking unavailable') return 'unavailable';
    if (status === 'Moving') return 'moving';
    if (status === 'Idling') return 'idling';
    if (status === 'Stopped') return 'stopped';
    return 'offline';
}

/**
 * The map square at `coords` as cut from the tile `up` levels above it: which
 * tile that is, how large it must be drawn, and how far into it the square lies.
 */
export function enlargedTile({ x, y, z }, up, size = 256) {
    const scale = 2 ** up;
    return { z: z - up, x: Math.floor(x / scale), y: Math.floor(y / scale), full: size * scale, left: (x % scale) * size, top: (y % scale) * size };
}
