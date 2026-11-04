import dynamic from "next/dynamic";

// Every page is dynamically imported: the canteen is a per-school module, so for
// most schools none of this code should ever be fetched at all.
const CanteenCounter = dynamic(() => import("@/components/views/canteen/counter"));
const CanteenProducts = dynamic(() => import("@/components/views/canteen/products"));
const CanteenAccounts = dynamic(() => import("@/components/views/canteen/accounts"));
const CanteenReports = dynamic(() => import("@/components/views/canteen/reports"));
const CanteenSetup = dynamic(() => import("@/components/views/canteen/setup"));
const CanteenFacilities = dynamic(() => import("@/components/views/canteen/facilities"));
const CanteenFacilityUsers = dynamic(() => import("@/components/views/canteen/facility_users"));
const CanteenMonthlyPosting = dynamic(() => import("@/components/views/canteen/monthly_posting"));
const CanteenPayment = dynamic(() => import("@/components/views/canteen/payment"));
const CanteenProfile = dynamic(() => import("@/components/views/canteen/profile"));
const CanteenUsers = dynamic(() => import("@/components/views/canteen/users"));
const CanteenMyPassword = dynamic(() => import("@/components/views/canteen/my_password"));

// NOTE: gated as a group by `configs/moduleGates.js` — the whole `canteen.*`
// prefix is dropped from the view map for a school without the module, so none
// of these paths resolve for them even by hand-typed URL.
const canteenViews = {
    "canteen.counter": () => <CanteenCounter />,
    "canteen.product-setup": () => <CanteenProducts />,
    "canteen.accounts": () => <CanteenAccounts />,
    "canteen.reports": () => <CanteenReports />,
    "canteen.setup": () => <CanteenSetup />,
    "canteen.facility-setup": () => <CanteenFacilities />,
    "canteen.user-setup": () => <CanteenFacilityUsers />,
    "canteen.monthly-posting": () => <CanteenMonthlyPosting />,
    "canteen.payment": () => <CanteenPayment />,
    "canteen.profile": () => <CanteenProfile />,
    "canteen.users": () => <CanteenUsers />,
    // A canteen user's own password; the school's logins have theirs elsewhere.
    "canteen.my-password": () => <CanteenMyPassword />,
};

export default canteenViews;
