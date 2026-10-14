import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { ArrowPathIcon, BoltIcon, GlobeAltIcon, MapPinIcon, PowerIcon, SignalIcon, TruckIcon } from '@heroicons/react/24/outline';
import { useAppContext } from '@/contexts/AppContext';
import server from '@/services/server';
import { schoolIdOf } from '@/configs/blockedSchools';
import { FILTERS, busStatus, hasLocation, statusGroup } from './tracking';
import TrackingIntro from './Intro';
import HistoryPanel from './HistoryPanel';
import styles from './tracking.module.css';

const SatelliteMap = dynamic(() => import('./SatelliteMap'), { ssr: false });
const figure = (value, digits = 2) => Number.isFinite(value) ? value.toLocaleString('en-IN', { maximumFractionDigits: digits }) : null;

export default function BusTracking() {
    const { user: { user } } = useAppContext();
    const schoolId = schoolIdOf(user);
    // Remount on a school switch so even an in-flight response cannot leave
    // the previous school's positions on the screen.
    return <TrackingPage key={schoolId} schoolId={schoolId} schoolName={user?.profile?.school_name || user?.profile?.name} />;
}

function TrackingPage({ schoolId, schoolName }) {
    const [data, setData] = useState(null);
    const [selectedId, setSelectedId] = useState(null);
    const [filter, setFilter] = useState('all');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [refresh, setRefresh] = useState(0);
    const [now, setNow] = useState(Date.now());
    const [follow, setFollow] = useState(true);
    // Where the buses are now, or where one of them has been.
    const [mode, setMode] = useState('live');
    // How often to ask is the server's to say (it knows how long it keeps one
    // answer from the GPS service); the page only refuses to hammer or to doze.
    const every = useRef(5000);
    useEffect(() => {
        if (!schoolId) return;
        let disposed = false;
        let busy = false;
        let timer = null;
        const controller = new AbortController();
        async function poll() {
            clearTimeout(timer);
            if (disposed) return;
            if (!busy && document.visibilityState !== 'hidden') {
                busy = true;
                try {
                    const response = await server.get('/api/bus-tracking', {
                        params: { school: schoolId }, signal: controller.signal, timeout: 15000,
                    });
                    if (!Array.isArray(response.data?.buses)) throw new Error('Invalid tracking response');
                    if (!disposed) {
                        setData(response.data);
                        // The server answers even when the GPS service will not:
                        // it lists the school's buses and says what is wrong.
                        setError(response.data.unavailable ? (response.data.message || 'The GPS service is unavailable.') : '');
                        setSelectedId(id => response.data.buses.some(bus => bus.id === id) ? id : response.data.buses[0]?.id ?? null);
                        setNow(Date.now());
                        const seconds = Number(response.data.refresh_seconds);
                        every.current = Math.min(30, Math.max(5, Number.isFinite(seconds) ? seconds : 5)) * 1000;
                    }
                } catch (err) {
                    if (!disposed) setError(err.response?.data?.message || 'Could not refresh bus locations. Retrying automatically.');
                } finally {
                    busy = false;
                    if (!disposed) setLoading(false);
                }
            }
            if (!disposed) timer = setTimeout(poll, every.current);
        }
        poll();
        const clock = setInterval(() => setNow(Date.now()), 1000);
        document.addEventListener('visibilitychange', poll);
        return () => {
            disposed = true;
            controller.abort();
            clearTimeout(timer);
            clearInterval(clock);
            document.removeEventListener('visibilitychange', poll);
        };
    }, [schoolId, refresh]);

    const buses = (data?.buses || []).map(bus => {
        const displayStatus = busStatus(bus, now, !!error);
        return { ...bus, displayStatus, group: statusGroup(displayStatus) };
    });
    const counts = buses.reduce((acc, bus) => ({ ...acc, [bus.group]: (acc[bus.group] || 0) + 1 }), { all: buses.length });
    const listed = filter === 'all' ? buses : buses.filter(bus => bus.group === filter);
    const selected = buses.find(bus => bus.id === selectedId);
    const chooseBus = id => { setSelectedId(id); setFollow(true); };
    // A school with no bus on GPS is told what the page does, not shown an
    // empty map — and a refresh that fails has nothing to warn it about.
    const intro = data?.configured === false;
    const history = mode === 'history' && buses.length > 0;
    return (
        <section className={styles.tracking} aria-label="School bus tracking">
            <header className={styles.heading}>
                <div className={styles.titleGroup}>
                    <span className={styles.titleIcon}><TruckIcon /></span>
                    <div>
                        <h1>Bus Tracking</h1>
                        <p>{schoolName || 'Your school'}{!intro && ` · ${buses.length} ${buses.length === 1 ? 'bus' : 'buses'}`}</p>
                    </div>
                </div>
                <div className={styles.headingActions}>
                    {buses.length > 0 && <div className={styles.mode} role="group" aria-label="Show">
                        {[['live', 'Live'], ['history', 'History']].map(([key, label]) => <button key={key} type="button"
                            aria-pressed={mode === key} className={mode === key ? styles.modeOn : ''} onClick={() => setMode(key)}>{label}</button>)}
                    </div>}
                    {!history && data?.configured && <span className={`${styles.live} ${error ? styles.liveOff : ''}`} role="status">
                        <i aria-hidden="true" />{error ? 'Tracking unavailable' : 'Live'}
                    </span>}
                    {!history && <button type="button" className={styles.iconButton} onClick={() => setRefresh(v => v + 1)} aria-label="Refresh bus locations"><ArrowPathIcon /></button>}
                </div>
            </header>
            {error && !intro && !history && <div className={styles.warning} role="alert">{error}{buses.some(hasLocation) && ' Showing the last positions received.'}</div>}
            {buses.length > 0 && !history && <div className={styles.filters} role="group" aria-label="Show buses that are">
                {FILTERS.map(([key, label]) => <button key={key} type="button" aria-pressed={filter === key}
                    className={`${styles.filter} ${filter === key ? styles.filterOn : ''}`} onClick={() => setFilter(key)}>
                    {label} <span>({counts[key] || 0})</span>
                </button>)}
            </div>}
            {intro ? <TrackingIntro /> : history ? <HistoryPanel schoolId={schoolId} buses={buses} selectedId={selectedId} onSelect={setSelectedId} /> : <div className={styles.layout}>
                <div className={styles.list}>
                    {loading && <p className={styles.empty} role="status">Connecting to your buses…</p>}
                    {!loading && !buses.length && <div className={styles.empty}>
                        <TruckIcon /><h2>Tracking is unavailable</h2>
                        <p>Please try again shortly.</p>
                    </div>}
                    {!loading && buses.length > 0 && !listed.length && <p className={styles.empty}>{error ? 'Bus statuses cannot be checked while tracking is unavailable. Select All to see your buses.' : `No buses in the ${FILTERS.find(([key]) => key === filter)[1]} category.`}</p>}
                    {listed.map(bus => <BusCard key={bus.id} bus={bus} selected={bus.id === selectedId} onChoose={chooseBus} />)}
                    {buses.length > 0 && <p className={styles.panelFoot}>Only buses of your school are shown.</p>}
                </div>
                <div className={styles.mapWrap}>
                    <SatelliteMap buses={buses} selectedId={selectedId} onSelect={chooseBus} follow={follow} onManualPan={() => setFollow(false)} schoolId={schoolId} />
                    {selected && hasLocation(selected) && <button type="button" className={`${styles.followButton} ${follow ? styles.followOn : ''}`}
                        aria-pressed={follow} onClick={() => setFollow(v => !v)}>
                        <MapPinIcon />{follow ? `Following ${selected.name}` : `Follow ${selected.name}`}
                    </button>}
                </div>
            </div>}
        </section>
    );
}

// One bus: where it is and the four readings a transport in-charge checks
// first. A <button>, so the whole card selects the bus on the map from the
// keyboard as well as the mouse.
function BusCard({ bus, selected, onChoose }) {
    const unavailable = bus.group === 'unavailable';
    const speed = unavailable || bus.displayStatus === 'No signal' ? null : figure(bus.speed_kmh, 1);
    const total = figure(bus.distance_km);
    const place = bus.address || (hasLocation(bus) ? `${bus.latitude.toFixed(5)}, ${bus.longitude.toFixed(5)}` : 'No position received yet');
    return (
        <button type="button" aria-pressed={selected} onClick={() => onChoose(bus.id)}
            className={`${styles.card} ${selected ? styles.cardOn : ''}`} data-state={bus.group}>
            <span className={styles.cardTop}>
                <strong>{bus.name}</strong>
                <span className={styles.badge} data-state={bus.group}><i aria-hidden="true" />{bus.displayStatus}</span>
            </span>
            {total && <span className={styles.cardMeta}><span>Total: <b>{total} km</b></span></span>}
            <span className={styles.address}><MapPinIcon />{place}</span>
            <span className={styles.metrics}>
                <span><em><BoltIcon />Speed</em><b>{speed === null ? '—' : `${speed} km/hr`}</b></span>
                <span><em><GlobeAltIcon />GPS</em><b>{bus.satellites ?? '—'}</b></span>
                <span><em><SignalIcon />GSM</em><b>{bus.gsm ?? '—'}</b></span>
                <span><em><PowerIcon />Ignition</em><b>{unavailable ? '—' : bus.ignition === true ? 'On' : bus.ignition === false ? 'Off' : '—'}</b></span>
            </span>
        </button>
    );
}
