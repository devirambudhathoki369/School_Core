import Head from 'next/head';
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';
import server from '@/services/server';
import { hasLocation } from './tracking';
import deepestTiles from './deepestTiles';
import { duration, historyPreset, historyRange, historyTime, pointIndexAt, routeSegments } from './history';
import styles from './tracking.module.css';

const COLOURS = { moving: '#059669', idling: '#d97706', stopped: '#2563eb', offline: '#64748b' };
const busSvg = '<svg width="26" height="26" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><rect x="7" y="5" width="18" height="22" rx="5" fill="#f8fafc"/><rect x="10" y="9" width="12" height="9" rx="2" fill="#15344e"/><circle cx="11" cy="23" r="2" fill="#0b1930"/><circle cx="21" cy="23" r="2" fill="#0b1930"/></svg>';
// The way a moving bus is heading: a small pointer on the rim of its badge,
// turned to its course. The badge itself always carries the bus.
const headingSvg = (course, colour) => `<svg width="58" height="58" viewBox="0 0 58 58" xmlns="http://www.w3.org/2000/svg" style="position:absolute;left:-7px;top:-7px;transform:rotate(${course}deg);pointer-events:none"><path d="M29 0.5l6.5 9h-13z" fill="${colour}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>`;
// Google's map, the one a school already knows from its GPS panel: the plain
// road map, the satellite picture with roads, places and landmarks written on
// it, or the land with its hills drawn. Google answers every level it is asked
// for, so no square is ever missing and nothing has to be enlarged here.
const google = (lyrs) => `https://mt{s}.google.com/vt/lyrs=${lyrs}&hl=en&x={x}&y={y}&z={z}`;
const esri = (service) => `https://services.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/tile/{z}/{y}/{x}`;
const STYLES = [['simple', 'Simple'], ['satellite', 'Satellite'], ['terrain', 'Terrain']];
const GOOGLE = { simple: 'm', satellite: 'y', terrain: 'p' };
// The stand-in, should Google stop answering: the map is never left blank.
const ESRI = {
    simple: ['World_Street_Map', 'Map &copy; Esri, HERE, Garmin, OpenStreetMap contributors'],
    satellite: ['World_Imagery', 'Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community'],
    terrain: ['World_Topo_Map', 'Map &copy; Esri, HERE, Garmin, OpenStreetMap contributors'],
};
// What may be laid over the map. Today's route and its stops are read for the
// one bus that is selected, and only on the live page.
const VIEWS = [['names', 'Show vehicle number'], ['traffic', 'Traffic'], ['route', "Today's route"], ['stops', 'Stopped points']];
const CHOICES = 'bus-map-options';
// What this person chose last time, on this computer; a browser that will not
// keep it simply starts from the usual map.
function remembered() {
    try {
        const kept = JSON.parse(window.localStorage.getItem(CHOICES)) || {};
        return { kind: GOOGLE[kept.kind] ? kept.kind : 'satellite', ...Object.fromEntries(VIEWS.map(([key]) => [key, kept[key] === true])) };
    } catch { return { kind: 'satellite' }; }
}
// Squares Google may refuse, with none drawn yet, before Esri takes over.
const REFUSALS = 4;

export default function SatelliteMap({ buses, selectedId, onSelect, follow, onManualPan, routePoints, schoolId }) {
    const element = useRef(null);
    const mapRef = useRef(null);
    const markers = useRef(new Map());
    const glides = useRef(new Map());
    const base = useRef(null);
    const labels = useRef(null);
    const googleDrew = useRef(false);
    const callbacks = useRef({ onSelect, onManualPan });
    callbacks.current = { onSelect, onManualPan };
    const [ready, setReady] = useState(false);
    const [tileError, setTileError] = useState(false);
    const [choices, setChoices] = useState(remembered);
    const { kind } = choices;
    const choose = (change) => setChoices(now => {
        const next = { ...now, ...change };
        try { window.localStorage.setItem(CHOICES, JSON.stringify(next)); } catch { /* kept for this visit only */ }
        return next;
    });
    const [source, setSource] = useState('google');
    const [panel, setPanel] = useState(false);
    // Where the selected bus has been today, and what it has sent since that was read.
    const [today, setToday] = useState(null);
    const since = useRef([]);

    useEffect(() => {
        // All of Nepal until a bus gives the map somewhere to be: a school whose
        // buses have sent no position is not shown another school's town.
        const map = L.map(element.current, { zoomControl: true, attributionControl: true }).fitBounds([[26.35, 80.05], [30.45, 88.2]]);
        mapRef.current = map;
        // Whose picture it is, and no more: not the name of the map library.
        map.attributionControl.setPrefix(false);
        map.on('dragstart', () => callbacks.current.onManualPan());
        const resize = new ResizeObserver(() => map.invalidateSize());
        resize.observe(element.current);
        setReady(true);
        return () => {
            resize.disconnect();
            glides.current.forEach(cancelAnimationFrame);
            glides.current.clear();
            map.remove();
            mapRef.current = null;
            markers.current.clear();
        };
    }, []);

    // Satellite or street map: the imagery under the buses, swapped in place.
    useEffect(() => {
        const map = mapRef.current;
        if (!ready || !map) return;
        const fromGoogle = source === 'google';
        // Traffic is Google's own colouring of the roads, where it knows them.
        const [url, attribution] = fromGoogle
            ? [google(GOOGLE[kind] + (choices.traffic ? ',traffic' : '')), '&copy; Google']
            : [esri(ESRI[kind][0]), ESRI[kind][1]];
        const layer = (fromGoogle
            ? L.tileLayer(url, { subdomains: '0123', maxZoom: 20, attribution })
            : deepestTiles(url, { maxZoom: 19, attribution })).addTo(map);
        let refused = 0;
        layer.on('tileerror', () => {
            // Refused from the first square, Google is not serving this page;
            // refused after it has drawn, the connection has dropped.
            if (fromGoogle && !googleDrew.current && ++refused >= REFUSALS) setSource('esri');
            else setTileError(true);
        });
        layer.on('tileload', () => {
            if (fromGoogle) googleDrew.current = true;
            setTileError(false);
        });
        base.current = layer;
        // Google writes place names into its own picture; Esri's imagery needs
        // them drawn over it, and its street map carries its own.
        if (!fromGoogle && kind === 'satellite') {
            labels.current = deepestTiles(esri('Reference/World_Boundaries_and_Places'), {
                maxZoom: 19, attribution: 'Labels &copy; Esri',
            }).addTo(map);
        }
        return () => { layer.remove(); labels.current?.remove(); labels.current = null; };
    }, [ready, kind, source, choices.traffic]);

    useEffect(() => {
        const map = mapRef.current;
        if (!ready || !map) return;
        const visible = new Set();
        for (const bus of buses.filter(hasLocation)) {
            visible.add(bus.id);
            let marker = markers.current.get(bus.id);
            const active = bus.id === selectedId;
            const colour = COLOURS[bus.group] || COLOURS.offline;
            const heading = bus.group === 'moving' && Number.isFinite(bus.course);
            const icon = L.divIcon({
                className: '', iconSize: [44, 44], iconAnchor: [22, 22],
                html: `<div style="position:relative;width:44px;height:44px">${heading ? headingSvg(bus.course, colour) : ''}<div style="position:relative;box-sizing:border-box;width:44px;height:44px;display:grid;place-items:center;border-radius:50%;background:${colour};border:3px solid white;box-shadow:0 0 0 ${active ? '8' : '2'}px ${active ? `${colour}55` : '#00000033'},0 3px 14px #0008">${busSvg}</div></div>`,
            });
            const target = [bus.latitude, bus.longitude];
            if (!marker) {
                marker = L.marker(target, { icon, title: bus.name, keyboard: true }).addTo(map);
                marker.on('click', () => callbacks.current.onSelect(bus.id));
                markers.current.set(bus.id, marker);
            } else {
                marker.setIcon(icon);
                glide(bus.id, marker, target);
            }
            // Text nodes, never provider text interpolated into HTML.
            const label = document.createElement('span');
            label.textContent = choices.names ? bus.name : `${bus.name} · ${bus.displayStatus}`;
            marker.unbindTooltip().bindTooltip(label, { direction: 'top', offset: [0, -24], permanent: !!choices.names });
            marker.setZIndexOffset(active ? 1000 : 0);
        }
        for (const [id, marker] of markers.current) {
            if (!visible.has(id)) {
                cancelAnimationFrame(glides.current.get(id));
                glides.current.delete(id);
                marker.remove();
                markers.current.delete(id);
            }
        }
    }, [buses, selectedId, ready, choices.names]);

    // The road a bus took, for the history view: a line with a pale edge so it
    // reads on rooftops and on the street map alike, broken where the device
    // was silent, and the map drawn back to hold all of it.
    useEffect(() => {
        const map = mapRef.current;
        if (!ready || !map || !routePoints?.length) return;
        const segments = routeSegments(routePoints);
        const end = (point, colour, text) => {
            const label = document.createElement('span');
            label.textContent = text;
            return L.circleMarker([point.latitude, point.longitude], { radius: 7, color: '#fff', weight: 3, fillColor: colour, fillOpacity: 1 }).bindTooltip(label, { direction: 'top', offset: [0, -8] });
        };
        const route = L.featureGroup([
            L.polyline(segments, { color: '#fff', weight: 8, opacity: .85, interactive: false }),
            L.polyline(segments, { color: '#2563eb', weight: 4, interactive: false }),
            end(routePoints[0], '#059669', 'Start'),
            end(routePoints[routePoints.length - 1], '#dc2626', 'End'),
        ]).addTo(map);
        map.fitBounds(route.getBounds(), { padding: [40, 40], maxZoom: 17 });
        return () => { route.remove(); };
    }, [ready, routePoints]);

    // Today's road and stops of the selected bus are one reading of its history,
    // asked for only when either is switched on and again every few minutes; in
    // between, the line is carried on with the positions the page receives.
    const wantsToday = !!schoolId && !routePoints && (choices.route || choices.stops);
    useEffect(() => {
        setToday(null);
        since.current = [];
        if (!wantsToday || !selectedId) return;
        const controller = new AbortController();
        const read = async () => {
            if (document.visibilityState === 'hidden') return;
            try {
                const params = { school: schoolId, bus: selectedId, ...historyRange(historyPreset('today')) };
                const response = await server.get('/api/bus-tracking/history', { params, signal: controller.signal, timeout: 50000 });
                if (!controller.signal.aborted && Array.isArray(response.data?.points)) { since.current = []; setToday(response.data); }
            } catch { /* the live map does not depend on it; it is asked again later */ }
        };
        read();
        const again = setInterval(read, 5 * 60 * 1000);
        return () => { controller.abort(); clearInterval(again); };
    }, [wantsToday, schoolId, selectedId]);

    const tracked = buses.find(bus => bus.id === selectedId);
    useEffect(() => {
        const map = mapRef.current;
        if (!ready || !map || !today) return;
        if (hasLocation(tracked)) {
            const last = since.current[since.current.length - 1];
            if (!last || last[0] !== tracked.latitude || last[1] !== tracked.longitude) since.current.push([tracked.latitude, tracked.longitude]);
        }
        const drawn = [];
        if (choices.route && today.points.length) {
            const segments = routeSegments(today.points);
            // The line runs on from the last recorded point to where the bus is now.
            if (since.current.length) segments.push([segments[segments.length - 1].slice(-1)[0], ...since.current]);
            drawn.push(L.polyline(segments, { color: '#fff', weight: 7, opacity: .85, interactive: false }),
                L.polyline(segments, { color: '#2563eb', weight: 4, interactive: false }));
        }
        if (choices.stops) {
            for (const stop of today.stops || []) {
                const at = today.points[pointIndexAt(today.points, Date.parse(stop.start))];
                if (!hasLocation(at)) continue;
                const label = document.createElement('span');
                label.textContent = `Stopped ${duration(stop.duration_seconds)} from ${historyTime(stop.start)}`;
                drawn.push(L.circleMarker([at.latitude, at.longitude], { radius: 6, color: '#fff', weight: 2, fillColor: '#dc2626', fillOpacity: 1 }).bindTooltip(label, { direction: 'top', offset: [0, -6] }));
            }
        }
        const layer = L.featureGroup(drawn).addTo(map);
        return () => { layer.remove(); };
    }, [ready, today, choices.route, choices.stops, tracked?.latitude, tracked?.longitude]);

    // A new fix arrives every few seconds. Jumping the marker to it reads as a
    // bus teleporting down the road, so it is carried there over a second —
    // unless it is so far that it IS a jump (the first fix after a long gap).
    function glide(id, marker, target) {
        cancelAnimationFrame(glides.current.get(id));
        const from = marker.getLatLng();
        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (reduced || from.distanceTo(target) > 600 || from.distanceTo(target) < 0.5) { marker.setLatLng(target); return; }
        const started = performance.now();
        const step = (time) => {
            const t = Math.min(1, (time - started) / 1000);
            marker.setLatLng([from.lat + (target[0] - from.lat) * t, from.lng + (target[1] - from.lng) * t]);
            if (t < 1) glides.current.set(id, requestAnimationFrame(step));
        };
        glides.current.set(id, requestAnimationFrame(step));
    }

    const selected = buses.find(bus => bus.id === selectedId);
    useEffect(() => {
        if (ready && follow && hasLocation(selected)) {
            mapRef.current.setView([selected.latitude, selected.longitude], Math.max(mapRef.current.getZoom(), 16), { animate: true });
        }
    }, [ready, follow, selectedId, selected?.latitude, selected?.longitude]);

    return <>
        <Head><link rel="stylesheet" href="/bus-tracking/leaflet.css" /></Head>
        <div ref={element} className={styles.map} aria-label="Map of your school's buses" />
        <div className={styles.mapTools}>
            <div className={styles.mapKind} role="group" aria-label="Map style">
                {STYLES.map(([key, label]) => <button key={key} type="button"
                    aria-pressed={kind === key} className={kind === key ? styles.mapKindOn : ''} onClick={() => choose({ kind: key })}>{label}</button>)}
            </div>
            <button type="button" className={styles.mapOptionsButton} aria-label="Map options" aria-expanded={panel} onClick={() => setPanel(open => !open)}><AdjustmentsHorizontalIcon /></button>
            {panel && <div className={styles.mapOptions} role="group" aria-label="Map options">
                <h3>Map view</h3>
                {VIEWS.filter(([key]) => (key !== 'route' && key !== 'stops') || (schoolId && !routePoints)).map(([key, label]) => <button key={key} type="button"
                    role="switch" aria-checked={!!choices[key]} onClick={() => choose({ [key]: !choices[key] })}><span>{label}</span><i aria-hidden="true" /></button>)}
            </div>}
        </div>
        {tileError && <div className={styles.mapError} role="status">The map could not load. Check your connection.</div>}
    </>;
}
