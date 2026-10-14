import Link from 'next/link';
import {
    ArrowRightCircleIcon, BellAlertIcon, BoltIcon, ClockIcon, LockClosedIcon, MapIcon, MapPinIcon, TruckIcon, ViewfinderCircleIcon,
} from '@heroicons/react/24/outline';
import { useAppContext } from '@/contexts/AppContext';
import styles from './tracking.module.css';

// What the page does, said the way a school office would say it. Only what the
// page really does today is listed here.
const FEATURES = [
    [MapIcon, 'Live map', 'Every bus on a satellite or street map, moving as the bus moves.'],
    [TruckIcon, 'On the road or parked', 'Each bus is marked Moving, Idling, Stopped or Offline, so one look is enough.'],
    [MapPinIcon, 'The place, in words', 'The address the bus is at: the village, the ward, the road.'],
    [BoltIcon, 'Speed and engine', 'How fast the bus is going and whether its engine is on.'],
    [ClockIcon, 'Where it has been', 'Replay the road a bus took, with each trip, each stop and the distance it ran.'],
    [ViewfinderCircleIcon, 'Follow one bus', 'Choose a bus and the map stays with it wherever it goes.'],
    [LockClosedIcon, 'Only your buses', 'Your school sees its own buses. No other school can see them.'],
    [BellAlertIcon, 'Alerts for parents', 'Parents and students who follow their bus in the mobile app get an alert when it is near.'],
];

// Shown in place of the map to a school that has no bus on GPS yet.
export default function TrackingIntro() {
    const { menu: { menus } } = useAppContext();
    return (
        <div className={styles.intro}>
            <div className={styles.introLead}>
                <h2>See where your school buses are, live</h2>
                <p>A small GPS device in each bus sends its position every few seconds. This page puts every bus of your school on a map, so the office always knows where each bus is.</p>
            </div>
            <ul className={styles.features}>
                {FEATURES.map(([Icon, title, text]) => <li key={title}>
                    <span className={styles.featureIcon}><Icon /></span>
                    <div><h3>{title}</h3><p>{text}</p></div>
                </li>)}
            </ul>
            <div className={styles.introStart}>
                <div>
                    <h3>Your school is not using it yet</h3>
                    <p>To use it, your buses need a GPS device. Ask us from the Support page and we will help you get started.</p>
                    <p>Already have GPS in your buses? They appear here as soon as someone at the school follows a bus in the mobile app.</p>
                </div>
                {menus?.views?.support && <Link href="#support" className={styles.introLink}>Go to Support<ArrowRightCircleIcon /></Link>}
            </div>
        </div>
    );
}
