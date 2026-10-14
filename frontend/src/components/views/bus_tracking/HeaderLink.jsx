import Link from 'next/link';
import { TruckIcon } from '@heroicons/react/24/outline';
import { useAppContext } from '@/contexts/AppContext';
import { TRACKING_VIEW } from './tracking';
import styles from './HeaderLink.module.css';

export default function BusTrackingHeaderLink() {
    const { menu: { menus }, user: { user } } = useAppContext();
    if (!['admin', 'staff'].includes(user?.role) || !menus?.views?.[TRACKING_VIEW]) return null;
    return <Link href={`#${TRACKING_VIEW}`} title="View Bus Tracking" aria-label="View Bus Tracking"
        className={styles.link}>
        <TruckIcon className="h-5 w-5 shrink-0" /><span className="hidden 2xl:inline whitespace-nowrap">View Bus Tracking</span>
    </Link>;
}
