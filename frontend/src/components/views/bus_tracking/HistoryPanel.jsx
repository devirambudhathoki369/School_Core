import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPinIcon, PlayIcon, PauseIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import server from '@/services/server';
import { duration, historyPreset, historyRange, historyTime, pointIndexAt } from './history';
import { statusGroup } from './tracking';
import styles from './tracking.module.css';

const SatelliteMap = dynamic(() => import('./SatelliteMap'), { ssr: false });
const metric = (value, unit) => Number.isFinite(value) ? `${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}${unit}` : '—';
const PAGE_SIZE = 50;

export default function HistoryPanel({ schoolId, buses, selectedId, onSelect }) {
    const [range, setRange] = useState(() => historyPreset('today'));
    const rangeRef = useRef(range);
    rangeRef.current = range;
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [cursor, setCursor] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [rate, setRate] = useState(60);
    const [follow, setFollow] = useState(false);
    const [tab, setTab] = useState('trips');
    const [page, setPage] = useState(0);
    const request = useRef(null);

    async function load(busId, selectedRange) {
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        setData(null); setError(''); setPlaying(false); setPage(0); setFollow(false);
        if (!busId) return;
        try {
            const params = { school: schoolId, bus: busId, ...historyRange(selectedRange) };
            setLoading(true);
            const response = await server.get('/api/bus-tracking/history', { params, signal: controller.signal, timeout: 50000 });
            if (controller.signal.aborted) return;
            if (response.data?.bus?.id !== busId || !Array.isArray(response.data?.points)) throw new Error('Invalid history response.');
            setData(response.data);
            setCursor(Date.parse(response.data.points[0]?.updated_at) || 0);
        } catch (err) {
            if (!controller.signal.aborted) setError(err.response?.data?.message || err.response?.data?.detail || err.message || 'Could not load history. Please try again.');
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }

    useEffect(() => {
        load(selectedId, rangeRef.current);
        return () => request.current?.abort();
    }, [schoolId, selectedId]);
    useEffect(() => {
        const pause = () => { if (document.hidden) setPlaying(false); };
        document.addEventListener('visibilitychange', pause);
        return () => document.removeEventListener('visibilitychange', pause);
    }, []);

    const points = data?.points || [];
    const index = pointIndexAt(points, cursor);
    const point = points[index];
    const end = Date.parse(points[points.length - 1]?.updated_at) || 0;
    useEffect(() => {
        if (!playing) return;
        let previous = performance.now();
        const timer = setInterval(() => {
            const now = performance.now();
            const elapsed = now - previous;
            previous = now;
            setCursor(value => Math.min(end, value + elapsed * rate));
        }, 250);
        return () => clearInterval(timer);
    }, [playing, rate, end]);
    useEffect(() => { if (cursor >= end) setPlaying(false); }, [cursor, end]);

    const marker = useMemo(() => point && data ? [{ ...point, id: data.bus.id, name: data.bus.name,
        group: statusGroup(point.status), displayStatus: `Recorded ${historyTime(point.updated_at)}` }] : [], [point, data]);
    const selectPoint = position => { setPlaying(false); setCursor(Date.parse(points[position].updated_at)); };
    const selectTime = value => { if (points.length) selectPoint(pointIndexAt(points, Date.parse(value))); };
    const changeRange = next => {
        request.current?.abort(); setLoading(false); setData(null); setPlaying(false); setError(''); setRange(next);
    };
    const preset = kind => { const next = historyPreset(kind); changeRange(next); load(selectedId, next); };
    const summary = data?.summary || {};
    const rows = tab === 'points' ? points : data?.[tab] || [];
    const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const inGap = points[index + 1]?.gap_before && cursor > Date.parse(point?.updated_at);

    return <div className={styles.history}>
        <form className={styles.historyForm} onSubmit={event => { event.preventDefault(); load(selectedId, range); }}>
            <label>Bus<select value={selectedId ?? ''} onChange={event => onSelect(Number(event.target.value))} aria-label="History bus">
                {!buses.length && <option value="">No buses available</option>}
                {buses.map(bus => <option key={bus.id} value={bus.id}>{bus.name}</option>)}
            </select></label>
            <label>From<input aria-label="History from" type="datetime-local" required value={range.from} onChange={event => changeRange({ ...range, from: event.target.value })} /></label>
            <label>To<input aria-label="History to" type="datetime-local" required value={range.to} onChange={event => changeRange({ ...range, to: event.target.value })} /></label>
            <button className={styles.historySubmit} type="submit" disabled={loading || !selectedId}>{loading ? 'Loading…' : 'View history'}</button>
        </form>
        <div className={styles.historyPresets}>
            <span>All times are Nepal time · Up to 24 hours per search</span>
            <div>{[['hour', 'Last hour'], ['today', 'Today'], ['yesterday', 'Yesterday']].map(([key, label]) =>
                <button type="button" key={key} disabled={!selectedId} onClick={() => preset(key)}>{label}</button>)}</div>
        </div>
        {error && <div className={styles.warning} role="alert">{String(error)}</div>}
        {loading && <div className={styles.empty} role="status">Loading the recorded route, trips and stops…</div>}
        {data && <>
            <p className={styles.historyCaption}>Recorded history · {data.bus.name} · {historyTime(data.from, true)} — {historyTime(data.to, true)}</p>
            {data.warnings?.map(warning => <div key={warning} className={styles.warning} role="status">{warning}</div>)}
            <div className={styles.historySummary}>
                {[
                    ['Distance', metric(summary.distance_km, ' km')], ['Average speed', metric(summary.average_speed_kmh, ' km/hr')],
                    ['Top speed', metric(summary.max_speed_kmh, ' km/hr')], ['Travel time', duration(summary.travel_seconds)],
                    ['Stopped time', duration(summary.stopped_seconds)], ['GPS records', points.length.toLocaleString()],
                ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
            </div>
            {!points.length ? <div className={styles.empty}><h2>No GPS history for this period</h2><p>Try another date or time range. Available history depends on records retained by the GPS provider.</p></div> :
                <div className={`${styles.layout} ${styles.historyLayout}`}>
                    <div className={styles.historySidebar}>
                        <div className={styles.playback}>
                            <div className={styles.playbackHeading}><strong>Route playback</strong><span>{index + 1} / {points.length}</span></div>
                            <div className={styles.playbackActions}>
                                <button type="button" aria-label={playing ? 'Pause history playback' : 'Play history playback'} disabled={points.length < 2} onClick={() => {
                                    if (cursor >= end) setCursor(Date.parse(points[0].updated_at));
                                    setPlaying(value => !value);
                                }}>{playing ? <PauseIcon /> : <PlayIcon />}{playing ? 'Pause' : 'Play'}</button>
                                <button type="button" aria-label="Restart history playback" onClick={() => selectPoint(0)}><ArrowPathIcon /></button>
                                <label>Speed<select aria-label="Playback speed" value={rate} onChange={event => setRate(Number(event.target.value))}>
                                    {[30, 60, 120].map(value => <option key={value} value={value}>{value}×</option>)}
                                </select></label>
                            </div>
                            <input aria-label="History position" type="range" min="0" max={Math.max(0, points.length - 1)} value={index} onChange={event => selectPoint(Number(event.target.value))} />
                            <div className={styles.recordDetail}>
                                <strong>{historyTime(point.updated_at, true)}</strong>
                                <span>{metric(point.speed_kmh, ' km/hr')} · Ignition {point.ignition === true ? 'on' : point.ignition === false ? 'off' : 'unknown'}</span>
                                <p>{point.address || `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`}</p>
                            </div>
                            {inGap && <p className={styles.historyNote}>GPS gap — showing the last recorded position until the next record.</p>}
                            {(data.gap_count > 0 || data.discarded_points > 0) && <p className={styles.historyNote}>Route lines break across gaps longer than 5 minutes. Invalid GPS points are omitted.</p>}
                        </div>
                        <div className={styles.activityTabs} role="group" aria-label="History records">
                            {[['trips', 'Trips'], ['stops', 'Stops'], ['points', 'GPS records']].map(([key, label]) => <button type="button" key={key} aria-pressed={tab === key}
                                className={tab === key ? styles.filterOn : ''} onClick={() => { setTab(key); setPage(0); }}>{label} ({key === 'points' ? points.length : data[key]?.length || 0})</button>)}
                        </div>
                        <div className={styles.activities}>
                            {!rows.length && <p className={styles.empty}>No {tab} reported for this period.</p>}
                            {rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((row, offset) => <button type="button" key={`${tab}-${page}-${offset}`} className={styles.activity}
                                aria-label={tab === 'points' ? `GPS record ${page * PAGE_SIZE + offset + 1}` : `${tab === 'trips' ? 'Trip' : 'Stop'} at ${historyTime(row.start)}`}
                                onClick={() => tab === 'points' ? selectPoint(page * PAGE_SIZE + offset) : selectTime(row.start)}>
                                {tab === 'points' ? <><strong>{historyTime(row.updated_at)} · {metric(row.speed_kmh, ' km/hr')}</strong><span>{row.address || 'Recorded GPS position'}</span></> :
                                    <><strong>{historyTime(row.start)} — {historyTime(row.end)}</strong><span>{duration(row.duration_seconds)}{tab === 'trips' ? ` · ${metric(row.distance_km, ' km')}` : ''}{row.partial ? ' · Partial period' : ''}</span>
                                        <p>{tab === 'trips' ? `${row.start_address || 'Start position'} → ${row.end_address || 'End position'}` : row.address || 'Stop location not named'}</p></>}
                            </button>)}
                        </div>
                        {pageCount > 1 && <div className={styles.historyPagination}><button type="button" disabled={!page} onClick={() => setPage(value => value - 1)}>Previous</button><span>{page + 1} / {pageCount}</span><button type="button" disabled={page >= pageCount - 1} onClick={() => setPage(value => value + 1)}>Next</button></div>}
                    </div>
                    <div className={styles.mapWrap}>
                        <SatelliteMap buses={marker} selectedId={selectedId} onSelect={() => {}} follow={follow} onManualPan={() => setFollow(false)} routePoints={points} />
                        <button type="button" className={`${styles.followButton} ${follow ? styles.followOn : ''}`} aria-pressed={follow} onClick={() => setFollow(value => !value)}><MapPinIcon />{follow ? 'Following playback' : 'Follow playback'}</button>
                    </div>
                </div>}
        </>}
    </div>;
}
