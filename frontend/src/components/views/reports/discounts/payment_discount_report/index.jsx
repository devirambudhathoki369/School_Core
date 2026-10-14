import Loader from "@/components/Loader";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { SelectInput, TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { __search } from "@/services/functions";
import { useEffect, useState } from "react";

const APIPath = "/api/payment_discount_report";
const searchSchema = { school: '', academic_year: '', from_date: '', to_date: '' };
function PaymentDiscountReport() {
    const { user: { user }, fiscalYear: { year, years: { academicYears } },
        notification: { updateNotification } } = useAppContext();
    searchSchema['school'] = user?.profile?.school || user?.profile?.id;
    const [searchInput, setSearchInput] = useState({});
    const [data, setData] = useState([]);
    const { searching, statusHandler } = useRequestStatus();

    function onChange({ name, value }) {
        setSearchInput(state => ({ ...state, [name]: value }));
    }

    async function onSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        let [status, msg, _data] = await __search(APIPath, searchInput);
        if (status === 200) {
            _data = (_data?.data || []).reduce((acc, val) => {
                const particulars = Object.entries(val?.discount_details || {}).map(e => ([_data?.titles?.[e[0]], e[1]]));
                const cashier = val?.cashier || "admin";
                acc.push({ ...val, particulars, cashier });
                return acc;
            }, [])
            console.log(_data);
            setData(_data);
        } else {
            updateNotification(status, msg);
        }
        statusHandler.toggleSearching();
    }

    useEffect(() => {
        /* one-time prefill of academic_year from global fiscal year. Do not
         * resync on subsequent changes to the header fiscal-year dropdown.
         */
        if (year?.academic_year && !searchInput?.academic_year) {
            searchSchema['academic_year'] = year.academic_year;
            setSearchInput({ ...searchSchema });
        }
    }, [year?.academic_year]);

    return (
        <>
            <form onSubmit={onSearch}>
                <Section>
                    <SelectInput input={{ name: 'academic_year', label: "Running Academic Year", options: academicYears }}
                        value={searchInput?.academic_year} onChange={onChange} />
                    <TextInput value={searchInput?.from_date} onChange={onChange} input={{
                        name: 'from_date', label: 'From (BS)'
                    }} />
                    <TextInput value={searchInput?.to_date} onChange={onChange} input={{
                        name: 'to_date', label: 'To (BS).'
                    }} />
                </Section>
                <ButtonsSecion>
                    <FormSaveButton isSearch={true} searching={searching} />
                </ButtonsSecion>
            </form>
            <>
                {searching ? <Loader /> :
                    <>
                        <BasicTable name={"Payment Discount Report"} columns={[
                            ['invoice_id', "Invoice No."],
                            ['date'],
                            ['name'],
                            ['classname', 'class'],
                            ['particulars', , , , , ParticularsCol],
                            ['total_discount', "discount amount"],
                            ['cashier'],
                        ]} data={data} loading={searching}
                            showSelected={false} print allowExport />
                    </>
                }
            </>
        </>
    )
}

function ParticularsCol({ data }) {
    return (
        <span className="hh col-span-3 flex flex-col px-2 border border-gray-400 border-dotted">
            {
                data
                    ?.map((detail, detailIndex) => {
                        const [title, amount] = detail;
                        return (
                            <span key={detailIndex} className="flex justify-between">
                                <span className="font-semibold capitalize">{title}</span>
                                <span>{amount}</span>
                            </span>
                        )
                    })
            }
        </span>
    )
}

export default PaymentDiscountReport;