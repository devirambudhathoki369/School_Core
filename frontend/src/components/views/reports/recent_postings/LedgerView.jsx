import Loader from "@/components/Loader";
import { useAppContext } from "@/contexts/AppContext";
import monthsMapper from "@/methods/monthsMapper";
import { getLedgers } from "@/services/functions/ledgers";
import { Accordion, AccordionBody, AccordionHeader } from "@material-tailwind/react";
import { useEffect, useState } from "react";
import { ChevronUpIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import Checkbox from "@/components/inputs/Checkbox";
import useRequestStatus from "@/hooks/requestStatus";
import NotFound from "@/components/NotFound";

/**
This param below is needed when this component is called from superadmin; \
superAdminData={ 
    school: Number, 
    academic_year: Number, 
    className: String,
    isChecked: Boolean,
    onSelect: function
}
*/
function LedgerView({ ledger, superAdminData = {} }) {
    const { user: { user }, fiscalYear: { year } } = useAppContext();
    const [open, setOpen] = useState(false);
    const [ledgers, setLedgers] = useState([]);
    const { fetching, statusHandler } = useRequestStatus();
    // 
    const fromSuperadmin = Boolean(superAdminData?.school);
    const className = ledger?.className || superAdminData?.className || '';

    useEffect(() => {
        (async () => {
            if (open && ledger?.id && ledgers?.length < 1) {
                let schoolId = user?.user?.profile?.school || user?.profile?.id,
                    academic_year = year?.academic_year;
                if (fromSuperadmin) {
                    schoolId = superAdminData.school;
                    academic_year = superAdminData.academic_year;
                }
                statusHandler.toggleFetching();
                const data = await getLedgers(schoolId, ledger.id, null, academic_year);
                // console.log(data);
                setLedgers(data);
                statusHandler.toggleFetching();
            }
        })();
    }, [open]);
    const classes = {
        grid: 'grid grid-cols-5 gap-x-5 justify-between items-start border-b text-center border-blue-gray-100'
    }
    return (
        <Accordion className="text-xs" open={open}
            icon={open ? <ChevronUpIcon className="icon" /> : <ChevronDownIcon className="icon" />}
            onClick={() => {
                setOpen(state => !state);
            }}>
            <AccordionHeader className="py-3">
                <div className={`grid grid-cols-3 justify-between w-full items-center`}>
                    <span className="uppercase flex items-center justify-start">
                        {fromSuperadmin &&
                            <Checkbox name={"on_select"}
                                checked={superAdminData?.isChecked ?? false}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (superAdminData?.onSelect) {
                                        superAdminData.onSelect(ledger.id);
                                    }
                                }}
                            />
                        }
                        <span className="w-full">{className}</span>
                    </span>
                    <span>{ledger?.date || ''}</span>
                    <span className="flex flex-row flex-wrap gap-y-1">
                        {
                            monthsMapper(ledger?.months || [])?.
                                map((month, mi) => (
                                    <span
                                        className="mr-1 px-4 py-1 rounded-full bg-gray-300 font-normal text-black"
                                        key={mi}>{month}</span>
                                ))
                        }
                    </span>
                </div>
            </AccordionHeader>
            <AccordionBody>
                <div className="bg-gray-300 rounded-md py-3">
                    {(open && ledgers?.data?.length > 0) ?
                        <>
                            {
                                ledgers?.data
                                    ?.map((ledger, li) => (
                                        <div key={li} className={`${classes.grid} py-1`}>
                                            <span className="text-left px-3 font-semibold">{ledger?.name}</span>
                                            <span className="col-span-3 flex flex-col px-2 border border-gray-400 border-dotted" key={li}>
                                                {
                                                    ledger?.particulars
                                                        ?.map((particular, pi) => {
                                                            const [titleId, amount] = particular;
                                                            return (
                                                                <span key={pi} className="flex justify-between">
                                                                    <span className="font-semibold capitalize">{ledgers?.titles?.[titleId] || ''}</span>
                                                                    <span>{amount}</span>
                                                                </span>
                                                            )
                                                        })
                                                }
                                            </span>
                                            <span>Rs. {ledger?.debit_amount || '0.00'}</span>
                                        </div>
                                    ))
                            }
                        </> :
                        <>{fetching ? <Loader minutes={2} /> : <NotFound />}</>
                    }
                </div>
            </AccordionBody>
        </Accordion>
    )
}

export default LedgerView;