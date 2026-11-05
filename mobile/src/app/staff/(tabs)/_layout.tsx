import RoleTabs, { type TabSpec } from '@/ui/RoleTabs';

const TABS: TabSpec[] = [
  { name: 'index', title: 'Today', icon: 'sun' },
  { name: 'classes', title: 'Classes', icon: 'users' },
  { name: 'homework', title: 'Homework', icon: 'book' },
  { name: 'notices', title: 'Notices', icon: 'bell' },
  { name: 'more', title: 'Account', icon: 'grid' },
];

export default function Tabs() {
  return <RoleTabs tabs={TABS} />;
}
