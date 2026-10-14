import Loader from "@/components/Loader";
import NotFound from "@/components/NotFound";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import MonthPicker from "@/components/inputs/MonthPicker";
import { ButtonsSecion, FilterSection } from "@/components/sections";
import { Card, Typography, Button } from "@material-tailwind/react";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { __search } from "@/services/functions";
import { useRef, useState } from "react";
import ReportHeader from "@/components/tables/ReportHeader";
import ReportActionBar from "@/components/tables/ReportActionBar";
import ColumnHeader from "@/components/tables/ColumnHeader";
import Cell from "@/components/tables/Cell";
import { useReactToPrint } from "react-to-print";
import { options } from "@/components/inputs/options/education";
import FilterItem from "@/components/inputs/FilterItem";
import { customParseFloat } from "@/components/views/accounting/methods";

const API_PATH = "/api/overall_income_plan_report";
const inputSchema = { school: '', education_level: '', month: '' };
function OverallIncomePlan() {
    const { user: { user }, class: { classesBackup }, notification: { updateNotification } } = useAppContext();
    inputSchema["school"] = user?.profile?.school || user?.profile?.id;
    const [input, setInput] = useState({ ...inputSchema });
    const [pickedAllMonths, setPickedAllMonths] = useState(false);
    const [data, setData] = useState({});
    const { searching, statusHandler } = useRequestStatus();

    function onChange({ name, value }) {
        setInput(state => ({ ...state, [name]: value }));
    }

    function onAllMonthsSelect(months) {
        setInput(state => ({ ...state, month: months }));
    }

    function convertToTable(response) {
        const { titles, data } = response;
        const tableColumns = Object.entries(titles).map(([titleId, titleName]) => [titleId, titleName]);

        const classesList = (
            input?.education_level ? classesBackup.filter(([, { education_level }]) => education_level === input.education_level) : classesBackup
        ).map(([, { id, name }]) => [id, name]);

        const colTotals = {};
        for (const [titleId] of tableColumns) {
            colTotals[titleId] = 0;
        }
        const tableData = [];
        for (const [classId, className] of classesList) {
            const row = { className };
            let rowTotal = 0;

            for (const [titleId] of tableColumns) {
                const value = data?.[classId]?.[titleId] ?? 0;
                row[titleId] = customParseFloat(value);
                rowTotal += value;
                colTotals[titleId] += value;
            }

            row.rowTotal = customParseFloat(rowTotal);
            tableData.push(row);
        }

        // build and append totals row as last row
        const totalsRow = { className: 'Total' };
        let grandTotal = 0;
        for (const [titleId] of tableColumns) {
            const cTotal = colTotals[titleId] || 0;
            totalsRow[titleId] = customParseFloat(cTotal);
            grandTotal += Number(cTotal) || 0;
        }
        totalsRow.rowTotal = customParseFloat(grandTotal);
        tableData.push(totalsRow);

        return { tableColumns, tableData };
    }

    async function onSearch(e) {
        e.preventDefault();
        if (input?.month?.length) {
            (async () => {
                statusHandler.toggleSearching();
                const [status, msg, data] = await __search(API_PATH, { ...input });
                updateNotification(status, msg);
                if (data) {
                    setData(convertToTable(data));
                } else {
                    setData({});
                }
                statusHandler.toggleSearching();
            })();
        }
    }

    function onReset() {
        setInput({ ...inputSchema });
        setPickedAllMonths(false);
    }

    return (
        <>
            <form onSubmit={onSearch} className="mb-2 flex flex-col gap-y-5">
                <FilterSection title={"Choose education level (optional but recommended)"}>
                    {
                        options?.map(option => (
                            <FilterItem onClick={onChange} label={option?.name} value={option?.value}
                                name={'education_level'} selectedOption={input?.education_level} key={option?.value} />
                        ))
                    }
                </FilterSection>
                <FilterSection title={"Select months"}>
                    <MonthPicker data={input?.month} onSelect={onChange} onSelectAll={onAllMonthsSelect}
                        allMonths={{ pickedAllMonths, setPickedAllMonths }} />
                </FilterSection>
                <ButtonsSecion>
                    <Button variant="outlined" onClick={onReset}>Reset</Button>
                    <FormSaveButton isSearch={true} searching={searching} disabled={!input.month.length} />
                </ButtonsSecion>
            </form>
            <>
                {searching ? <Loader /> :
                    <>
                        {data?.length ?
                            <NotFound error="No data found!" /> :
                            <OIPReportTable {...data} />
                        }
                    </>
                }
            </>
        </>
    )
}

function OIPReportTable({ tableColumns = [], tableData = [] }) {
    const printRef = useRef(null);
    const printReport = useReactToPrint({
        content: () => printRef.current,
    });

    return (
        <>
            <ReportActionBar onPrint={tableData.length ? printReport : null} reportRef={printRef}
                exportName={"Overall Income Plan"} />
            <Card className="flex flex-col p-2 bg-teal-10 overflow-auto mb-5" ref={printRef}>
                <ReportHeader />
                <Typography variant="h5" className={`my-2 w-full text-center`}>
                    Overall Income Plan
                </Typography>
                <table className={`w-full text-left rounded-lg`}>
                    <thead className="uppercase cursor-pointer bg-table-header">
                        <tr>
                            <ColumnHeader columnName={'S.N'} rowSpan={2} />
                            <ColumnHeader columnName={'classes'} rowSpan={2} />
                            <ColumnHeader columnName={'fee titles'} colSpan={tableColumns.length} classNameTypo={"w-full text-center"} />
                            <ColumnHeader columnName={"total"} rowSpan={2} classNameTypo={"font-bold text-black"} />
                        </tr>
                        <tr>
                            {
                                tableColumns.map((col, i) => (
                                    <ColumnHeader key={i} columnName={col[1] || col[0]} />
                                ))
                            }
                        </tr >
                    </thead>
                    <tbody>
                        {
                            tableData.map((row, sn) => {
                                const isLast = (sn === tableData?.length - 1);
                                return (
                                    <tr key={sn} className={`hover:bg-teal-200 border-b border-sky-300`}>
                                        <td className="text-base">{sn + 1}</td>
                                        <td><Cell index={sn} data={row.className} highLighted={isLast} /></td>
                                        {
                                            tableColumns?.map((col, ci) => {
                                                const value = row?.[col[0]];
                                                return (
                                                    <td key={ci} className={`py-2.5`}>
                                                        {
                                                            col ?
                                                                <Cell
                                                                    index={sn}
                                                                    col={col[0]}
                                                                    data={value || "0.00"}
                                                                    highLighted={col[2] || isLast}
                                                                /> :
                                                                <>-</>
                                                        }
                                                    </td>
                                                )
                                            })
                                        }
                                        <td><Cell index={sn} data={row?.rowTotal || "0.00"} highLighted /></td>
                                    </tr>
                                )
                            })
                        }
                    </tbody>
                </table>
            </Card>
        </>
    )
}

export default OverallIncomePlan;