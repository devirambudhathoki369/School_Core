import RoleTabs, { type TabSpec } from '@/ui/RoleTabs';

const TABS: TabSpec[] = [
  { name: 'index', title: 'Today', icon: 'chart' },
  { name: 'students', title: 'Students', icon: 'student' },
  { name: 'fees', title: 'Fees', icon: 'wallet' },
  { name: 'staff', title: 'Staff', icon: 'staff' },
  { name: 'more', title: 'Account', icon: 'grid' },
];

export default function Tabs() {
  return <RoleTabs tabs={TABS} />;
}
