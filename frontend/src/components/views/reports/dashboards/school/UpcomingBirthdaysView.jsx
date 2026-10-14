import { PaginationSection } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { getCursor, getURL } from "@/methods/pagination";
import { __fetch } from "@/services/functions";
import { useEffect, useState } from "react";
import { Card, Dialog, DialogHeader, DialogBody } from "@material-tailwind/react";
import { CakeIcon } from "@heroicons/react/24/solid";
import CloseButton from "@/components/buttons/CloseButton";
/**
 * 
 * @param role "student" | "staff" 
 */
function UpcomingBirthdaysView({ label, role }) {
    const { user: { user } } = useAppContext();
    const [data, setData] = useState({});
    const [todayBirthdayCount, setTodayBirthdayCount] = useState(0);
    const [showTable, setShowTable] = useState(false);
    const { fetching, statusHandler } = useRequestStatus();

    const API = `/api/${role}/upcoming_birthdays`;
    const schoolId = user?.profile?.school || user?.profile?.id;

    // PAGINATION;
    const [page, setPage] = useState(1);
    async function getTableData() {
        const nextURL = getURL(data, page - 1, 'next');
        if (!nextURL && getURL(data, page - 1, 'previous')) {
            setPage(state => state - 1);
            return null;
        }
        const cursor = getCursor(nextURL);
        // 
        statusHandler.toggleFetching();
        const res = await __fetch(API, {
            school: schoolId, page, cursor
        });
        if (res) {
            setData(state => ({ ...state, [page]: res }));
        }
        statusHandler.toggleFetching();
    }
    function toggleTable() {
        setShowTable(state => !state);
    }
    // 
    useEffect(() => {
        (async () => {
            if (!data?.[page] && showTable) await getTableData();
        })();
    }, [page, showTable]);

    useEffect(() => {
        (async () => {
            const res = await __fetch(API, {
                school: schoolId, count: true,
            });
            if (res) {
                setTodayBirthdayCount(res?.count);
            }
        })();
    }, [user?.profile?.id]);

    return (
        <Card className="app-panel relative mb-1 h-full overflow-hidden !rounded-xl border bg-white">
            {/* A quiet card like every other one on the dashboard: the count is
                the content, the list is one small button away. (It was a pink
                slab with a full-width solid button — the loudest thing on the
                page for what is, most days, a zero.) */}
            {/* On a phone the two birthday tiles share a row: the count sits
                beside the cake, the label under them, and the button takes the
                tile's full width — a thumb-sized target instead of a chip. */}
            <div className="flex h-full flex-col gap-y-2 p-3 sm:flex-row sm:items-center sm:gap-x-3 sm:p-4">
                <div className="flex min-w-0 flex-1 items-center gap-x-3">
                    <span className="grid h-10 w-10 sm:h-11 sm:w-11 shrink-0 place-items-center rounded-xl bg-rose-50">
                        <CakeIcon className="h-5 w-5 text-rose-500" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] sm:text-[13px] font-semibold leading-snug text-[var(--ink-600)]">{label}</div>
                        <div className="text-[1.45rem] sm:text-[1.7rem] font-extrabold leading-tight text-[var(--ink-900)]">{todayBirthdayCount}</div>
                    </div>
                </div>
                <button type="button"
                    className="mt-auto w-full shrink-0 rounded-[10px] border border-[var(--field-line)] bg-white px-3.5 py-2 text-sm font-bold text-[var(--ink-800)] transition-colors hover:bg-[var(--surface-soft)] sm:mt-0 sm:w-auto"
                    onClick={toggleTable}
                >
                    See list
                </button>
            </div>
            {/* The list opens as a dialog rather than an overlay inside this
                card: the card is a small dashboard tile, so the table's own
                toolbar (Columns / Print / Export) had nowhere to go and spilled
                out over the tile. */}
            <Dialog open={showTable} handler={toggleTable} size="lg"
                className="max-h-[90vh] overflow-hidden">
                <DialogHeader className="flex items-center justify-between gap-x-2 py-3">
                    <span className="flex items-center gap-x-2 capitalize">
                        <CakeIcon className="h-6 w-6 text-rose-400" />
                        {label}
                    </span>
                    <CloseButton onClick={toggleTable} />
                </DialogHeader>
                <DialogBody className="overflow-y-auto max-h-[75vh]">
                    <BasicTable name={`Upcoming ${role} birthdays`} columns={[
                        ["name"],
                        ...(role === "student" ? [["classname"]] : []),
                        ["birth_date"]
                    ]} data={data?.[page]?.['results'] || []} showSelected={false} loading={fetching} print allowExport />
                    <div className="my-1">
                        <PaginationSection page={page} setPage={setPage} nextPage={getURL(data, page, 'next')} />
                    </div>
                </DialogBody>
            </Dialog>
        </Card>
    )
}

export default UpcomingBirthdaysView;