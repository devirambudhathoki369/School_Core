import AttentionBox from "@/components/AttentionBox";
import BasicTable from "@/components/tables/BasicTable";
import { customAction } from "@/components/tables/actions";
import { useAppContext } from "@/contexts/AppContext";
import { getAccountingEconomicYears } from "@/services/functions/accounting/accounting_economic_year";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useTempState } from "@/contexts/TempStateContext";
import { AccountingEconomicYearClosingKey } from "@/components/views/accounting/accounting_economic_year/configs";

/**
 * Accounting economic years, as the school sees them: LIST + CLOSE.
 *
 * The create form is gone. A school moves into its next accounting year by
 * CLOSING the running one — that flow creates the new year and carries the
 * opening balances into it in the same transaction, which a hand-created year
 * never does. Setting a year up from scratch is a superadmin job now.
 */
const CloseActionButton = customAction({
    text: null, action: 'close_year',
    icon: <span className="flex items-center font-normal">
        Close <ChevronRightIcon className="icon" />
    </span>,
    tooltip: "Close this accounting economic year"
});

function AccountingEconomicYear() {
    const { user: { user } } = useAppContext();
    const [years, setYears] = useState([]);
    const { saveTempState } = useTempState();

    useEffect(() => {
        (async () => {
            const schoolId = user?.profile?.school || user?.profile?.id;
            if (!schoolId) return;
            const data = await getAccountingEconomicYears(schoolId);
            setYears(Array.isArray(data) ? data : []);
        })();
    }, [user?.profile]);

    //
    const router = useRouter();
    function onActionClicked(action, id, item) {
        if (action === CloseActionButton.action) {
            saveTempState(AccountingEconomicYearClosingKey, item);
            router.push("#accounting.economic-year-closing");
        }
    }

    return (
        <>
            <AttentionBox title={NOTE.title} description={NOTE.description} />
            <BasicTable name={"Accounting Economic Years"} data={years} columns={[
                ['name'],
                ['start_date', 'start date'],
                ['end_date', 'end date'],
                ['status']
            ]} actions={[
                CloseActionButton
            ]} onSelect={onActionClicked} showSelected={false} />
        </>
    )
}

const NOTE = {
    title: "Accounting years are set up centrally",
    description: `Close the running year and the next one is created for you,
    with the opening balances carried across.
        Need a year added or corrected? Contact support.`,
};

export default AccountingEconomicYear;
