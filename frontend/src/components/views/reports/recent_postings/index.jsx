import Loader from "@/components/Loader";
import { useAppContext } from "@/contexts/AppContext";
import { getRecentPostings } from "@/services/functions/ledgers";
import { useEffect, useState } from "react";
import LedgerView from "./LedgerView";
import { PaginationSection } from "@/components/sections";
import { getCursor, getURL } from "@/methods/pagination";
import useRequestStatus from "@/hooks/requestStatus";
import NotFound from "@/components/NotFound";

function RecentPostings() {
    const { user: { user } } = useAppContext();
    const [data, setData] = useState({});
    const [page, setPage] = useState(1);
    const { fetching, statusHandler } = useRequestStatus();
    // 
    async function getData() {
        const nextURL = getURL(data, page - 1, 'next');
        if (!nextURL && getURL(data, page - 1, 'previous')) {
            setPage(state => state - 1);
            return null;
        }
        const cursor = getCursor(nextURL);
        statusHandler.toggleFetching();
        const res = await getRecentPostings(user?.profile?.school || user?.profile?.id, page, cursor);
        setData(state => ({ ...state, [page]: res }));
        statusHandler.toggleFetching();
    }
    // 
    useEffect(() => {
        (async () => {
            if (!data?.[page]) await getData();
        })();
    }, [page]);
    return (
        <>
            {fetching ? <Loader minutes={2} /> :
                <>
                    {data?.[page]?.['results']?.length > 0 ?
                        <>
                            <div className={`grid grid-cols-3 justify-between w-full items-center uppercase font-semibold mb-3 p-2 rounded-md bg-blue-gray-200`}>
                                <span>Class</span>
                                <span>Date</span>
                                <span>Months</span>
                            </div>
                            {
                                data?.[page]?.['results']
                                    ?.map((ledger, li) => (
                                        <LedgerView ledger={ledger} key={li} />
                                    ))
                            }
                            <div className="my-2">
                                <PaginationSection page={page} setPage={setPage}
                                    nextPage={getURL(data, page, 'next')} />
                            </div>
                        </>
                        :
                        <NotFound />
                    }
                </>
            }
        </>
    )
}

export default RecentPostings;