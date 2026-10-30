import dynamic from "next/dynamic";

// Every page is dynamically imported: the canteen is a per-school module, so for
// most schools none of this code should ever be fetched at all.
const CanteenCounter = dynamic(() => import("@/components/views/canteen/counter"));
const CanteenItems = dynamic(() => import("@/components/views/canteen/items"));
const CanteenAccounts = dynamic(() => import("@/components/views/canteen/accounts"));
const CanteenReports = dynamic(() => import("@/components/views/canteen/reports"));
const CanteenSetup = dynamic(() => import("@/components/views/canteen/setup"));
const CanteenUseTypes = dynamic(() => import("@/components/views/canteen/use_types"));
const CanteenMonthlyPosting = dynamic(() => import("@/components/views/canteen/monthly_posting"));
const CanteenCollect = dynamic(() => import("@/components/views/canteen/collect"));
const CanteenUsers = dynamic(() => import("@/components/views/canteen/users"));
const CanteenMyPassword = dynamic(() => import("@/components/views/canteen/my_password"));

// NOTE: gated as a group by `configs/moduleGates.js` — the whole `canteen.*`
// prefix is dropped from the view map for a school without the module, so none
// of these paths resolve for them even by hand-typed URL.
const canteenViews = {
    "canteen.counter": () => <CanteenCounter />,
    "canteen.items": () => <CanteenItems />,
    "canteen.accounts": () => <CanteenAccounts />,
    "canteen.reports": () => <CanteenReports />,
    "canteen.setup": () => <CanteenSetup />,
    "canteen.use-types": () => <CanteenUseTypes />,
    "canteen.monthly-posting": () => <CanteenMonthlyPosting />,
    "canteen.collect": () => <CanteenCollect />,
    "canteen.users": () => <CanteenUsers />,
    // A canteen user's own password; the school's logins have theirs elsewhere.
    "canteen.my-password": () => <CanteenMyPassword />,
};

export default canteenViews;
