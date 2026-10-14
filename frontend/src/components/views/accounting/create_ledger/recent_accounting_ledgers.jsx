import PreviousButton from "@/components/buttons/PreviousButton";
import { ButtonsSecion, PaginationSection, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { useAppContext } from "@/contexts/AppContext";
import { getCursor, getURL } from "@/methods/pagination";
import { __fetch, __search } from "@/services/functions";
import { useEffect, useState } from "react";
import { MAPPED_LEDGER_GROUPS, LEDGER_GROUPS_OPTIONS, BALANCE_TYPES_NAME } from "../ledger_groups";
import { SearchInput, TextInput } from "@/components/inputs";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { Button } from "@material-tailwind/react";
import useRequestStatus from "@/hooks/requestStatus";
import { editAction } from "@/components/tables/actions";
import { useTempState } from "@/contexts/TempStateContext";
import tempStateKeys from "../../tempStateKeys";
import { useRouter } from "next/router";

const searchSchema = { school: '', economic_year: '', ledger_group: '', name: '' };
const SEARCH_RESULTS = "search_results";
function RecentAccountingLedgers() {
    const { user: { user }, fiscalYear: { year }, notification: { updateNotification } } = useAppContext();
    searchSchema["school"] = user?.profile?.school || user?.profile?.id;
    searchSchema["economic_year"] = year?.accounting_economic_year;
    const [searchInput, setSearchInput] = useState({ ...searchSchema });
    const [ledgers, setLedgers] = useState({});
    const { searching, statusHandler } = useRequestStatus();
    const { saveTempState } = useTempState();

    const router = useRouter();

    function onSearchInputChange({ name, value }) {
        setSearchInput(state => ({ ...state, [name]: value }));
    }
    async function onSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        let [status, msg, _ledgers] = await __search("/accounting/search/ledgers", {
            school: searchInput.school,
            economic_year: searchInput.economic_year,
            name: searchInput.name,
            ledger_groups: searchInput?.ledger_group ? [searchInput.ledger_group] : '',
            detailed: true,
        });
        updateNotification(status, msg);
        if (status === 200 && _ledgers) {
            // ledger-group wise search!
            const groupwiseLedgers = _ledgers?.[searchInput.ledger_group];
            if (groupwiseLedgers && groupwiseLedgers?.length > 0) {
                _ledgers = formatData(groupwiseLedgers);
            }
            // search by name!
            else if (_ledgers?.length > 0) {
                _ledgers = formatData(_ledgers);
            }
            setLedgers(state => ({ ...state, [SEARCH_RESULTS]: _ledgers }));
            onReset();
        } else {
            setLedgers(state => ({ ...state, [SEARCH_RESULTS]: null }));
        }
        statusHandler.toggleSearching();
    }
    function onReset() {
        setSearchInput({ ...searchSchema });
    }
    function resetSearchResults() {
        onReset();
        setLedgers(state => ({ ...state, [SEARCH_RESULTS]: null }));
    }
    function onLedgerSelect(action, id, item) {
        if (action === editAction.action) {
            saveTempState(tempStateKeys.ACC_LEDGER, item);
            router.push("#accounting.create-ledger");
        }
        return null;
    }

    function formatData(data) {
        return data.reduce((acc, ledger) => {
            const ledgerGroup = MAPPED_LEDGER_GROUPS?.[ledger.ledger_group];
            let ledger_group_str = "_", transaction_type = "_";
            if (ledgerGroup) {
                ledger_group_str = ledgerGroup.name || "_";
                transaction_type = BALANCE_TYPES_NAME?.[ledger.balance_type] || "_";
            }
            acc.push({ ...ledger, ledger_group_str, transaction_type });
            return acc;
        }, []);
    }
    // PAGINATION;
    const ITEMS_PER_PAGE = 10;
    const [page, setPage] = useState(1);

    async function getData() {
        statusHandler.toggleSearching();
        // 
        const nextURL = getURL(ledgers, page - 1, 'next');
        if (!nextURL && getURL(ledgers, page - 1, 'previous')) {
            setPage(state => state - 1);
            return null;
        }
        const cursor = getCursor(nextURL);
        //  
        let res = await __fetch("accounting/ledgers", {
            school: searchSchema.school,
            economic_year: searchSchema.economic_year,
            page, cursor,
        });
        if (res) {
            const data = formatData([...(res?.results || [])]);
            res["results"] = data;
            setLedgers(state => ({ ...state, [page]: res }));
        }
        statusHandler.toggleSearching();
    }
    // 
    useEffect(() => {
        (async () => {
            if (!ledgers?.[page] && searchInput?.economic_year) await getData();
        })();
    }, [page, searchInput?.economic_year]);

    return (
        <>
            <ButtonsSecion className={"!justify-start"}>
                <PreviousButton />
            </ButtonsSecion>
            <>
                <BasicTable name={"Accounting Ledgers"} loading={searching}
                    data={ledgers?.[SEARCH_RESULTS] || ledgers?.[page]?.results || []}
                    columns={[
                        ['name', "Ledger Name"], ['ledger_group_str', "Ledger Group"],
                        ["transaction_type", "Transaction Type"], ['opening_balance', "Opening Balance"],
                        ['address'], ['contact'],
                    ]} showSelected={false} onSelect={onLedgerSelect}
                    page={page} itemsPerPage={ITEMS_PER_PAGE}
                    header={
                        <SearchForm data={searchInput} onChange={onSearchInputChange}
                            onSearch={onSearch} searching={searching} onReset={onReset} />
                    } actions={[editAction]} />
                <>
                    {!ledgers?.[SEARCH_RESULTS] ?
                        <PaginationSection page={page} setPage={setPage}
                            nextPage={getURL(ledgers, page, 'next')} /> :
                        <ButtonsSecion>
                            <Button variant="outlined" onClick={resetSearchResults}>
                                Reset Search Results
                            </Button>
                        </ButtonsSecion>
                    }
                </>
            </>
        </>
    )
}

function SearchForm({ data, onChange, onSearch, searching, onReset }) {
    return (
        <form className="mb-2" onSubmit={onSearch}>
            <Section>
                <TextInput input={{ name: 'name', label: "Ledger Name" }} value={data?.name} onChange={onChange} />
                <SearchInput input={{ name: 'ledger_group', label: "Ledger group", options: LEDGER_GROUPS_OPTIONS }}
                    value={data?.ledger_group} onChange={onChange} />
            </Section>
            <ButtonsSecion>
                <Button variant="outlined" onClick={onReset}>Reset</Button>
                <FormSaveButton isSearch={true} searching={searching} />
            </ButtonsSecion>
        </form>
    )
}

export default RecentAccountingLedgers;