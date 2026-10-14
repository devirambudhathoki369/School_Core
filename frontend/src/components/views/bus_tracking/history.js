const NEPAL_OFFSET = 345 * 60000;

export function nepalInput(time) {
    return new Date(time + NEPAL_OFFSET).toISOString().slice(0, 16);
}

export function historyPreset(kind, now = Date.now()) {
    const day = nepalInput(now).slice(0, 10);
    const midnight = Date.parse(`${day}T00:00:00+05:45`);
    if (kind === 'yesterday') return { from: nepalInput(midnight - 86400000), to: nepalInput(midnight) };
    if (kind === 'hour') return { from: nepalInput(now - 3600000), to: nepalInput(now) };
    return { from: `${day}T00:00`, to: nepalInput(now) };
}

export function historyRange(range, now = Date.now()) {
    const start = Date.parse(`${range.from}+05:45`);
    const end = Date.parse(`${range.to}+05:45`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 86400000) {
        throw new Error('Choose a time range greater than zero and no longer than 24 hours.');
    }
    if (start > now) throw new Error('History cannot start in the future.');
    return { from: new Date(start).toISOString(), to: new Date(end).toISOString() };
}

export function pointIndexAt(points, cursor) {
    let low = 0, high = points.length - 1;
    while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (Date.parse(points[middle].updated_at) <= cursor) low = middle;
        else high = middle - 1;
    }
    return low;
}

export function routeSegments(points) {
    const segments = [];
    for (const point of points) {
        if (!segments.length || point.gap_before) segments.push([]);
        segments[segments.length - 1].push([point.latitude, point.longitude]);
    }
    return segments;
}

export function historyTime(value, date = false) {
    const time = Date.parse(value);
    if (!Number.isFinite(time)) return '—';
    return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kathmandu', ...(date ? { day: '2-digit', month: 'short', year: 'numeric' } : {}),
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(time);
}

export function duration(seconds) {
    if (!Number.isFinite(seconds)) return '—';
    const minutes = Math.floor(seconds / 60);
    if (!minutes) return `${Math.round(seconds)} sec`;
    return minutes >= 60 ? `${Math.floor(minutes / 60)} hr ${minutes % 60} min` : `${minutes} min`;
}
