import Loader from "@/components/Loader";
import { PaginationSection } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { useAppContext } from "@/contexts/AppContext";
import { calculateBSAge } from "@/methods/calculateBSAge";
import { getCursor, getURL } from "@/methods/pagination";
import { getRecentEnrollments } from "@/services/functions/students";
import { useEffect, useState } from "react";
import { History_SearchListColumns } from "./table_columns";

function RecentEnrollments() {
    const { user: { user } } = useAppContext();
    const [data, setData] = useState([]);
    const [page, setPage] = useState(1);
    const ITEMS_PER_PAGE = 10;

    async function getData() {
        const nextURL = getURL(data, page - 1, 'next');
        if (!nextURL && getURL(data, page - 1, 'previous')) {
            setPage(state => state - 1);
            return null;
        }
        const cursor = getCursor(nextURL);
        const res = await getRecentEnrollments(user?.profile?.school || user?.profile?.id, page, cursor);
        setData(state => ({ ...state, [page]: res }));
    }
    // 
    useEffect(() => {
        (async () => {
            if (!data?.[page]) await getData();
        })();
    }, [page]);
    return (
        <>
            {data?.[page]?.['results'] ?
                <>
                    <BasicTable name={"Recent enrollments"}
                        columns={History_SearchListColumns}
                        data={data[page]['results'].map(item => ({
                            ...item,
                            age: calculateBSAge(item.birth_date, user?.today),
                        }))}
                        onSelect={() => null} showSelected={false} page={page} itemsPerPage={ITEMS_PER_PAGE} print allowExport />
                    <PaginationSection page={page} setPage={setPage}
                        nextPage={getURL(data, page, 'next')} />
                </>
                :
                <Loader />
            }
        </>
    )
}

/* object-sample
id, name, gender, classname, contact, guardian name, location | guardian location, date-of-birth;
*/

export default RecentEnrollments;