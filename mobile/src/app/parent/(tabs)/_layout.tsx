import RoleTabs, { type TabSpec } from '@/ui/RoleTabs';

const TABS: TabSpec[] = [
  { name: 'index', title: 'Home', icon: 'home' },
  { name: 'attendance', title: 'Attendance', icon: 'calendar' },
  { name: 'fees', title: 'Fees', icon: 'wallet' },
  { name: 'homework', title: 'Homework', icon: 'book' },
  { name: 'more', title: 'Account', icon: 'grid' },
];

export default function Tabs() {
  return <RoleTabs tabs={TABS} />;
}
