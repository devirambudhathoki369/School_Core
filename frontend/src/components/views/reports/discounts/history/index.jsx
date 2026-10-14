import Loader from "@/components/Loader";
import NotFound from "@/components/NotFound";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import Checkbox from "@/components/inputs/Checkbox";
import ChooseClass from "@/components/inputs/ChooseClass";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { selectAction } from "@/components/tables/actions";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { fetchFeeTitles } from "@/services/functions/feeTitles";
import { searchStudents } from "@/services/functions/students";
import { useEffect, useState } from "react";

function DiscountsHistory() {
    const { user: { user } } = useAppContext();
    const [selectedClass, setSelectedClass] = useState('');
    const [titles, setTitles] = useState({});
    const [data, setData] = useState([]);
    const { searching, statusHandler } = useRequestStatus();
    // 
    const [showOldRates, setShowOldRates] = useState(false);
    const [tableHeaders, setTableHeaders] = useState([...DiscountsTableColumnHeaders]);

    function onClassSelect(action, id, item) {
        setSelectedClass(item);
    }

    function toTable(data) {
        const table = [];
        data.forEach(studentDiscount => {
            Object.entries(studentDiscount?.discounts || {})
                .forEach(([titleId, titleDiscount]) => {
                    const _discount = {
                        name: studentDiscount.name,
                        ...titleDiscount,
                        title: titles?.[titleId] || ""
                    };
                    table.push(_discount);
                });
        })
        return table;
    }

    async function onSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        const schoolId = user?.profile?.school || user?.profile?.id;
        const [, , _data] = await searchStudents({
            school: schoolId,
            class_info: selectedClass?.class_info?.id,
            include_discounts: true,
            discount_details: true,
            strict: true,
        });
        if (_data) {
            setData(
                toTable(_data)
            );
        }
        statusHandler.toggleSearching();
    }

    function toggleOldRates() {
        setShowOldRates(state => {
            state = !state;
            let _th = [...DiscountsTableColumnHeaders];
            if (state) {
                _th.push(['old_discount', 'Old Discount Amount']);
            }
            setTableHeaders(_th);
            return state;
        });
    }

    useEffect(() => {
        (async () => {
            const schoolId = user?.profile?.school || user?.profile?.id;
            let _titles = await fetchFeeTitles(schoolId, true);
            if (_titles) {
                _titles = _titles.reduce((acc, title) => {
                    acc[title.value] = title.name;
                    return acc;
                }, { "tn": "Transportation" });
            }
            setTitles(_titles);
        })();
    }, [user]);

    return (
        <>
            <ChooseClass selectedClass={selectedClass} actions={[selectAction]} onSelect={onClassSelect}>
                <form onSubmit={onSearch}>
                    <ButtonsSecion>
                        <FormSaveButton isSearch={true} searching={searching} />
                    </ButtonsSecion>
                </form>
                <>
                    {
                        searching ? <Loader /> :
                            <>
                                {
                                    data?.length > 0 ?
                                        <>
                                            <Section>
                                                <Checkbox name={""} text={"Show old discount amount"} checked={showOldRates} onClick={toggleOldRates} />
                                            </Section>
                                            <BasicTable name={"Discounts"} columns={tableHeaders} data={data} onSelect={() => null}
                                                showSelected={false} print={true} allowExport={true}
                                                header={
                                                    <span className="text-semibold text-base text-black capitalize">Class : {selectedClass?.classname}</span>
                                                } />
                                        </> :
                                        <NotFound />
                                }
                            </>
                    }
                </>
            </ChooseClass>
        </>
    )
}

const DiscountsTableColumnHeaders = [
    ['name'],
    ['created_at', 'date'],
    ['title'],
    ['discount'],
    ['percentage'],
    // ['old_discount', 'Old discount'],
    ['remarks'],
]

export default DiscountsHistory;