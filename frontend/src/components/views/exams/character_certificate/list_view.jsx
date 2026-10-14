import Loader from "@/components/Loader";
import { ButtonsSecion, PaginationSection } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { reprintAction } from "@/components/tables/actions";
import { useAppContext } from "@/contexts/AppContext";
import { getCursor, getURL } from "@/methods/pagination";
import { fetchCharacterCertificates } from "@/services/functions/exams/certificate";
import { useEffect, useRef, useState } from "react";
import CharacterCertificate from "./CharacterCertificate";
import { Button } from "@material-tailwind/react";
import { useReactToPrint } from "react-to-print";
import CertificateSearchForm from "@/components/views/exams/character_certificate/CertificateSearchForm";
import useRequestStatus from "@/hooks/requestStatus";

const COLUMNS = [
    ['serial_no', 'SC.No.'], ['name'], ['guardian_name', 'guardian'], ['address'], ['birth_date', 'birth date'],
    ['from_date', 'from date'], ['to_date', 'to date'], ['class'], ['exam_year', 'year'], ['result'],
    ['remarks'], ['symbol_no', 'symbol no.'], ['regd_no', 'registration no.'], ['issue_date', 'issue date']
]

function CharacterCertificateListView() {
    const { user: { user } } = useAppContext();
    const [data, setData] = useState({});
    const [page, setPage] = useState(1);
    const ITEMS_PER_PAGE = 10;
    const [selectedCertificate, setSelectedCertificate] = useState(null);
    const { fetching, statusHandler } = useRequestStatus();

    const certificateRef = useRef(null);
    const printCertificate = useReactToPrint({
        content: () => certificateRef.current,
    });

    function onSelect(action, id, item) {
        if (action === reprintAction.action) {
            setSelectedCertificate(item);
        }
    }

    async function getData() {
        const nextURL = getURL(data, page - 1, 'next');
        if (!nextURL && getURL(data, page - 1, 'previous')) {
            setPage(state => state - 1);
            return null;
        }
        const cursor = getCursor(nextURL);
        statusHandler.toggleFetching();
        const res = await fetchCharacterCertificates(user?.profile?.school || user?.profile?.id, '', page, cursor);
        setData(state => ({ ...state, [page]: res }));
        statusHandler.toggleFetching();
    }

    function afterSearch(data) {
        setData(state => ({ ...state, search: data }));
    }

    useEffect(() => {
        (async () => {
            if (!data?.[page]) await getData();
        })();
    }, [page]);
    useEffect(() => {
        if (certificateRef.current) {
            certificateRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [selectedCertificate]);

    return (
        <>
            {!fetching ?
                <>
                    <BasicTable includeSN={false}
                        // What the rows ARE: a search result must not sit under
                        // the heading of the list it replaced.
                        name={data?.search ? "Search results" : "Recent certificates"}
                        header={<CertificateSearchForm setData={afterSearch} />}
                        columns={COLUMNS}
                        data={data?.search || data[page]?.['results'] || []}
                        onSelect={onSelect} showSelected={false} page={page} itemsPerPage={ITEMS_PER_PAGE}
                        actions={[reprintAction]} />
                    {/* Prev/Next page the recent list, not a search result —
                        which is shown whole. */}
                    {!data?.search &&
                        <PaginationSection page={page} setPage={setPage}
                            nextPage={getURL(data, page, 'next')} />
                    }
                </>
                :
                <Loader />
            }
            <>
                {
                    selectedCertificate?.serial_no &&
                    <>
                        <div ref={certificateRef} id="certificate">
                            <CharacterCertificate student={selectedCertificate} editable={false} onChange={() => null}
                                schoolName={user?.profile?.school_name || user?.profile?.name || ''} university={selectedCertificate?.university} />
                        </div>
                        <ButtonsSecion className={"my-2"}>
                            <Button variant="outlined" onClick={printCertificate}
                                disabled={!selectedCertificate?.serial_no}
                            >Print</Button>
                        </ButtonsSecion>
                    </>
                }
            </>
        </>
    )
}

export default CharacterCertificateListView;