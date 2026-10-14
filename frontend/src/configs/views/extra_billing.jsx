import dynamic from "next/dynamic";

// Every page is dynamically imported: extra billing is a per-school module, so
// for most schools none of this code should ever be fetched at all.
const ExtraBillingParties = dynamic(() => import("@/components/views/extra_billing/parties"));
const ExtraBillingRun = dynamic(() => import("@/components/views/extra_billing/billing"));
const ExtraBillingPayment = dynamic(() => import("@/components/views/extra_billing/payment"));
const ExtraBillingReports = dynamic(() => import("@/components/views/extra_billing/reports"));

// NOTE: these keys are gated as a group by `configs/moduleGates.js` — the whole
// `extra-billing.*` prefix is dropped from the view map for a school without
// the module, so none of these paths resolve for them even by hand-typed URL.
const extraBillingViews = {
    "extra-billing.parties": () => <ExtraBillingParties />,
    "extra-billing.billing": () => <ExtraBillingRun />,
    "extra-billing.payment": () => <ExtraBillingPayment />,
    "extra-billing.reports": () => <ExtraBillingReports />,
};

export default extraBillingViews;
