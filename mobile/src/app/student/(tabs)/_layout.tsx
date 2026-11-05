import RoleTabs, { type TabSpec } from '@/ui/RoleTabs';

const TABS: TabSpec[] = [
  { name: 'index', title: 'Home', icon: 'home' },
  { name: 'attendance', title: 'Attendance', icon: 'calendar' },
  { name: 'homework', title: 'Homework', icon: 'book' },
  { name: 'results', title: 'Results', icon: 'award' },
  { name: 'more', title: 'Account', icon: 'grid' },
];

export default function Tabs() {
  return <RoleTabs tabs={TABS} />;
}
