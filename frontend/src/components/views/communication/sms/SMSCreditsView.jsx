import { useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import { useAppContext } from "@/contexts/AppContext";
import Loader from "@/components/Loader";
import { useSMSCredits, creditFacts } from "./useSMSCredits";

function SMSCreditsView() {
    const { user: { user } } = useAppContext();
    const [open, setOpen] = useState(false);
    // asked only once the panel is opened, then kept current while it stays open
    const { info, checking } = useSMSCredits(user?.profile?.account, user?.role === "admin" && open);
    const { value } = creditFacts(info, checking);

    return (
        <div className="float-right p-2 relative">
            <h1 className="font-semibold flex items-center gap-x-1 cursor-pointer bg-[#cce5ff] p-2 rounded-md"
                onClick={() => setOpen(state => !state)}>
                SMS Credits Info
                {
                    open ?
                        <ChevronUpIcon className="icon" /> :
                        <ChevronDownIcon className="icon" />
                }
            </h1>
            {
                open &&
                <div className="!w-max max-w-[18rem] absolute right-2 p-3 bg-[#cce5ff] rounded-md z-10">
                    {
                        !info ? <Loader /> :
                            <div className="flex flex-col gap-y-1 !text-base font-semibold">
                                <span>
                                    Available SMS Credits : {info?.pending ? "Fetching…" : value}
                                </span>
                                {info?.total_sms_sent != null &&
                                    <span>
                                        Total SMS Sent : {info.total_sms_sent}
                                    </span>}
                                {/* said only while a newer figure is on its way */}
                                {checking &&
                                    <span className="text-xs font-medium text-[#1e3a5f]" aria-live="polite">Updating…</span>}
                            </div>
                    }
                </div>
            }
        </div>
    )
}

export default SMSCreditsView;
