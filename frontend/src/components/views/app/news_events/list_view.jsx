import { __fetch } from "@/services/functions";
import { useEffect, useState } from "react";
import { NEWS_EVENTS_API_PATH } from "./configs";
import { useAppContext } from "@/contexts/AppContext";
import BasicTable from "@/components/tables/BasicTable";
import { viewAction } from "@/components/tables/actions";
import { getCursor, getURL } from "@/methods/pagination";
import { PaginationSection } from "@/components/sections";
import useRequestStatus from "@/hooks/requestStatus";
import Loader from "@/components/Loader";
import NoticeView from "../notice/NoticeView";
import PreviousButton from "@/components/buttons/PreviousButton";

function NewsEventsListView() {
    const { user: { user } } = useAppContext();
    const [data, setData] = useState({});
    const [selectedNewsId, setSelectedNewsId] = useState('');
    const [news, setNews] = useState({});
    const schoolId = user?.profile?.school || user?.profile?.id;
    const { fetching, statusHandler } = useRequestStatus();
    // 
    const ITEMS_PER_PAGE = 10;
    const [page, setPage] = useState(1);

    async function getData() {
        statusHandler.toggleFetching();
        const nextURL = getURL(data, page - 1, 'next');
        if (!nextURL && getURL(data, page - 1, 'previous')) {
            setPage(state => state - 1);
            return null;
        }
        const cursor = getCursor(nextURL);
        const res = await __fetch(NEWS_EVENTS_API_PATH, { school: schoolId, page, cursor });
        setData(state => ({ ...state, [page]: res }));
        statusHandler.toggleFetching();
    }

    async function onSelectNewsEvent(action, id, item) {
        if (action === viewAction.action) {
            const newsEventId = item?.id;
            if (newsEventId) {
                setSelectedNewsId(newsEventId);
                if (!news?.[newsEventId]) {
                    item = await __fetch(NEWS_EVENTS_API_PATH, { school: schoolId, id: newsEventId, include_content: true });
                    setNews(state => ({ ...state, [newsEventId]: item }));
                }
            }
        }
    }

    useEffect(() => {
        (async () => {
            if (!data?.[page]) await getData();
        })();
    }, [page]);

    return (
        <>
            <>
                <PreviousButton href={"/admin#app.news-events"} />
            </>
            {data?.[page]?.['results'] ?
                <>
                    <BasicTable columns={[
                        ['title']
                    ]} loading={fetching} data={data[page]['results']} actions={[viewAction]}
                        page={page} itemsPerPage={ITEMS_PER_PAGE}
                        onSelect={onSelectNewsEvent} showSelected={false} />
                    <PaginationSection page={page} setPage={setPage}
                        nextPage={getURL(data, page, 'next')} />
                </> :
                <Loader />
            }

            {news?.[selectedNewsId] &&
                <NoticeView notice={news[selectedNewsId]} onClose={() => {
                    setSelectedNewsId('');
                }} />
            }
        </>
    )
}

export default NewsEventsListView;