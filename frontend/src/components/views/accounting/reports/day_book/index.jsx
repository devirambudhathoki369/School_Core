import Loader from "@/components/Loader";
import NotFound from "@/components/NotFound";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { SelectInput, TextInput } from "@/components/inputs";
import Checkbox from "@/components/inputs/Checkbox";
import { ButtonsSecion, Section } from "@/components/sections";
import ColumnHeader from "@/components/tables/ColumnHeader";
import ReportHeader from "@/components/tables/ReportHeader";
import ReportActionBar from "@/components/tables/ReportActionBar";
import { customParseFloat } from "@/components/views/accounting/methods";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import getCurrentDateTime from "@/methods/getCurrentDateTime";
import { __search } from "@/services/functions";
import { Fragment, useEffect, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { ENTRIES } from "../../acc_constants";
import VoucherDetailModal from "../ledger_reports/VoucherDetailModal";

const API_PATH = "/accounting/reports/day_book";
const searchSchema = { school: '', economic_year: '', start_date: '', end_date: '', entry_type: '' };
// "" is the SelectInput's own placeholder option, which here means every kind.
const VOUCHER_TYPES = [
    { name: "Income vouchers", value: ENTRIES.INCOME.ID },
    { name: "Expense vouchers", value: ENTRIES.EXPENSE.ID },
    { name: "Journal vouchers", value: ENTRIES.JOURNAL.ID },
];
const optionsSchema = {
    show_voucher: true,
    show_narration: true,
    // OFF by default: it is only meaningful for a school that posts every
    // receipt and payment as a voucher. Where fee collection lives outside
    // the accounting module the position is real but reads as alarming, so
    // it is opened deliberately rather than printed on every sheet.
    show_cash_position: false,
};

/**
 * Which day the book opens on for a given year.
 *
 * Today, normally — that is the page's whole purpose, and what a cashier
 * reaches for it to see. The exception is a year that has already ENDED: today
 * is outside it, so opening there would guarantee an empty sheet. Those open on
 * the year's last day instead, which is the last day that can hold anything.
 *
 * One function so the first render and a later change of year cannot drift
 * apart — they were separate expressions, and only one of them knew the rule.
 */
function openingDay(ey, today) {
    if (ey?.end_date && today && ey.end_date < today) return ey.end_date;
    return today || '';
}

function money(value) {
    return customParseFloat(value) || "0.00";
}

// customParseFloat is Math.abs()-based — right for Dr/Cr columns, which are
// never negative, but it would print an overdrawn cash position as a healthy
// one. Anything that can legitimately go below zero goes through this.
function signedMoney(value) {
    const number = Number(value) || 0;
    return `${number < 0 ? '-' : ''}${money(number)}`;
}

function DayBook() {
    const { user: { user }, fiscalYear: { year, years, mappedYears, getCurrentAccountingEconomicYear },
        notification: { updateNotification } } = useAppContext();
    const [searchInput, setSearchInput] = useState({ ...searchSchema });
    const [data, setData] = useState({});
    const [searched, setSearched] = useState(null); // the range the sheet belongs to
    const [options, setOptions] = useState({ ...optionsSchema });
    const [generatedTime, setGeneratedTime] = useState('');
    // Row whose source voucher is open in the "Show more" modal.
    const [detailRow, setDetailRow] = useState(null);
    const { searching, statusHandler } = useRequestStatus();

    const reportRef = useRef(null);
    const printReport = useReactToPrint({ content: () => reportRef.current });

    function onChange({ name, value }) {
        setSearchInput(state => ({ ...state, [name]: value }));
    }
    function onYearChange({ value }) {
        const day = openingDay(mappedYears?.allAccountingEconomicYears?.[value], user?.today);
        setSearchInput(state => ({
            ...state, economic_year: value,
            start_date: day || state.start_date,
            end_date: day || state.end_date,
        }));
    }
    function toggle(name) {
        setOptions(state => ({ ...state, [name]: !state[name] }));
    }

    async function onSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        const { entry_type, ...payload } = searchInput;
        const [status, msg, _data] = await __search(API_PATH, {
            ...payload,
            entry_types: entry_type ? [Number(entry_type)] : [],
        });
        updateNotification(status, msg);
        if (_data) {
            setData(_data);
            setSearched({ ...searchInput });
            setGeneratedTime(getCurrentDateTime());
        } else {
            setData({});
            setSearched(null);
            setGeneratedTime('');
        }
        statusHandler.toggleSearching();
    }

    function allowSearch() {
        return (searchInput?.school && searchInput?.economic_year &&
            searchInput?.start_date && searchInput?.end_date);
    }

    /**
     * Open on today, in the year today belongs to — without being asked.
     *
     * The fiscal year used to come from `year.accounting_economic_year` alone,
     * which is read out of localStorage and is EMPTY until somebody has picked
     * a year from the top-right selector on that particular browser. A fresh
     * machine, or a member of staff signing in for the first time, therefore
     * got a blank Fiscal Year box and a Search button that would not enable —
     * on a report where there is only ever one sensible answer.
     *
     * So: the active year when there is one, otherwise the school's CURRENT
     * year, worked out from today's date. A year that was actively chosen still
     * wins; this only fills the hole where nothing was chosen at all.
     *
     * `mappedYears` is in the dependencies because the fallback reads it. It
     * lands in the same batch as `year`, but depending on that would be
     * depending on a coincidence of React's batching rather than on the data.
     */
    useEffect(() => {
        const economic_year = year?.accounting_economic_year ||
            getCurrentAccountingEconomicYear(user?.today);
        const day = openingDay(mappedYears?.allAccountingEconomicYears?.[economic_year], user?.today);
        searchSchema["school"] = user?.profile?.school || user?.profile?.id;
        searchSchema["economic_year"] = economic_year;
        searchSchema["start_date"] = day;
        searchSchema["end_date"] = day;
        setSearchInput(state => ({ ...state, ...searchSchema }));
    }, [year, mappedYears]);

    const singleDay = searched?.start_date === searched?.end_date;
    // the server withholds the cash/bank position on a voucher-type filter,
    // where it could not be made to tie to the rows on the sheet.
    const showCash = options?.show_cash_position && data?.cash_position;
    // Date | [Voucher No.] | Particular | Debit | Credit | [Narration]
    const leadingCount = 2 + (options?.show_voucher ? 1 : 0); // up to and including Particular
    const columnCount = leadingCount + 2 + (options?.show_narration ? 1 : 0);

    return (
        <>
            <form onSubmit={onSearch}>
                <Section>
                    <SelectInput input={{ name: 'economic_year', label: "Fiscal Year", options: years?.allAccountingEconomicYears || [] }}
                        value={searchInput?.economic_year} onChange={onYearChange} />
                    <TextInput input={{ name: 'start_date', label: "Date (From)" }}
                        value={searchInput?.start_date} onChange={onChange} />
                    <TextInput input={{ name: 'end_date', label: "Date (To)" }}
                        value={searchInput?.end_date} onChange={onChange} />
                    <SelectInput input={{ name: 'entry_type', label: "Voucher Type", placeholder: "All vouchers", options: VOUCHER_TYPES }}
                        value={searchInput?.entry_type} onChange={onChange} />
                </Section>
                <ButtonsSecion>
                    <FormSaveButton isSearch={true} searching={searching} disabled={!allowSearch()} />
                </ButtonsSecion>
            </form>

            {searching ? <Loader /> :
                // nothing at all until a search has actually run — a day book
                // that opens on "Not found" reads like an error, not a blank page.
                !searched ? null :
                    !data?.data?.length ? <NotFound /> :
                    <div className="my-2">
                        <Section>
                            <Checkbox checked={options?.show_voucher} name={"show_voucher"} text={"Show Voucher No."}
                                onClick={() => toggle('show_voucher')} />
                            <Checkbox checked={options?.show_narration} name={"show_narration"} text={"Show Narration"}
                                onClick={() => toggle('show_narration')} />
                            {data?.cash_position &&
                                <Checkbox checked={options?.show_cash_position} name={"show_cash_position"} text={"Show Cash & Bank Position"}
                                    description={"Opening, movement and closing cash/bank for each day.\nOnly meaningful when every receipt and payment is posted as a voucher."}
                                    onClick={() => toggle('show_cash_position')} />
                            }
                        </Section>
                        <ReportActionBar onPrint={printReport} reportRef={reportRef}
                            exportName={"Day Book"}
                            exportTitles={[`From ${searched?.start_date} to ${searched?.end_date}`]} />
                        <p className="hide-from-print text-sm text-gray-600 mb-1">
                            Double-click any line to open the voucher it came from.
                        </p>
                        <div ref={reportRef} className="rounded-md my-2">
                            <ReportHeader />
                            <div className="flex flex-col gap-y-2 text-center font-bold children-text-base px-5">
                                <span className="!text-2xl">Day Book</span>
                                <span>
                                    {singleDay ? `Date : ${searched?.start_date}` :
                                        `From ${searched?.start_date} to ${searched?.end_date}`}
                                </span>
                                <span className="text-end">Date : {user?.today}</span>
                            </div>
                            <div className="w-full flex justify-center">
                                {/* the year this SHEET belongs to, not the one the
                                    app happens to be set to — they are no longer
                                    always the same now that the page can default
                                    its own year, and a printed day book naming the
                                    wrong year would be worse than naming none. */}
                                <span className="p-2 text-lg font-bold">
                                    {mappedYears?.allAccountingEconomicYears?.[searched?.economic_year]?.name ||
                                        year?.accounting_economic_year_name}
                                </span>
                            </div>
                            <div className="flex overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="uppercase bg-table-header">
                                        <tr>
                                            <ColumnHeader columnName={"Date"} />
                                            {options?.show_voucher && <ColumnHeader columnName={"Voucher No."} />}
                                            <ColumnHeader columnName={"Particular"} />
                                            <ColumnHeader columnName={"Debit"} />
                                            <ColumnHeader columnName={"Credit"} />
                                            {options?.show_narration && <ColumnHeader columnName={"Narration"} />}
                                        </tr>
                                    </thead>
                                    <tbody className="w-full border-collapse [&_td]:p-2 [&_td]:border [&_td]:border-gray-500">
                                        {data.data.map(day => (
                                            <DayBlock key={day.date} day={day} options={options}
                                                showCash={showCash} columnCount={columnCount}
                                                onShowVoucher={setDetailRow} />
                                        ))}
                                        <tr className="font-bold bg-table-header">
                                            <td colSpan={leadingCount}>Grand Total</td>
                                            <td>{money(data?.total_debit)}</td>
                                            <td>{money(data?.total_credit)}</td>
                                            {options?.show_narration &&
                                                <td>
                                                    {data?.voucher_count} voucher{data?.voucher_count === 1 ? '' : 's'} in {data?.day_count} day{data?.day_count === 1 ? '' : 's'}
                                                </td>
                                            }
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            {showCash && <CashPosition data={data} />}
                            <div className="flex justify-between items-center p-4 font-bold">
                                <span>Report generated at : {generatedTime}</span>
                                <span className="capitalize">
                                    Report generated by : {user?.profile?.school_name || user?.profile?.name}
                                </span>
                            </div>
                        </div>
                    </div>
            }
            <VoucherDetailModal row={detailRow} onClose={() => setDetailRow(null)} />
        </>
    )
}

/**
 * One date of the book: every voucher posted on it, then the day's own
 * closing line and total — the way a page of a hand-written day book ends.
 */
function DayBlock({ day, options, showCash, columnCount, onShowVoucher }) {
    return (
        <>
            {day.vouchers.map(voucher => (
                <Fragment key={`${voucher.entry_type}-${voucher.voucher_id}`}>
                    {voucher.rows.map((row, ri) => (
                        <tr key={row.id} onDoubleClick={() => onShowVoucher(row)}
                            title="Double-click to open the full voucher"
                            className="cursor-pointer hover:bg-teal-50">
                            {/* the date is written once per voucher, as on the sheet */}
                            <td>{ri === 0 ? day.date : ''}</td>
                            {options?.show_voucher && <td>{ri === 0 ? voucher.voucher_id : ''}</td>}
                            <td className={row.type === 2 ? "pl-6" : ""}>{row.particular}</td>
                            <td>{money(row.debit)}</td>
                            <td>{money(row.credit)}</td>
                            {options?.show_narration && <td>{row.narration}</td>}
                        </tr>
                    ))}
                </Fragment>
            ))}
            {/* the balancing figure: 0.00 in books that balance, and the size
                of the problem in books that do not. */}
            <tr>
                <td>{day.date}</td>
                {options?.show_voucher && <td></td>}
                <td>Closing Balance</td>
                <td>{money(day.closing_debit)}</td>
                <td>{money(day.closing_credit)}</td>
                {options?.show_narration && <td></td>}
            </tr>
            <tr className="font-bold">
                <td></td>
                {options?.show_voucher && <td></td>}
                <td>Total</td>
                <td>{money(day.total_debit)}</td>
                <td>{money(day.total_credit)}</td>
                {options?.show_narration && <td></td>}
            </tr>
            {showCash &&
                <tr className="text-sm">
                    <td colSpan={columnCount}>
                        <span className="font-semibold">Cash : </span>
                        opening {signedMoney(day.opening_cash)} + received {money(day.cash_receipt)}
                        &nbsp;- paid {money(day.cash_payment)} = <b>{signedMoney(day.closing_cash)}</b>
                        <span className="font-semibold"> &nbsp;| Bank : </span>
                        opening {signedMoney(day.opening_bank)} + received {money(day.bank_receipt)}
                        &nbsp;- paid {money(day.bank_payment)} = <b>{signedMoney(day.closing_bank)}</b>
                    </td>
                </tr>
            }
        </>
    )
}

/**
 * Where the money stood at each end of the range.
 *
 * Deliberately NOT a <table>: the report's column show/hide tool reads its
 * column list off the first table and then hides that index in every table on
 * the page, so a second table here would lose cells whenever a day book column
 * was switched off.
 */
function CashPosition({ data }) {
    const rows = [
        ["Cash in hand", data?.opening_cash, data?.closing_cash],
        ["Bank", data?.opening_bank, data?.closing_bank],
    ];
    return (
        <div className="mt-4 px-4">
            <div className="w-full sm:w-2/3 border border-gray-500">
                <div className="grid grid-cols-3 font-semibold uppercase bg-table-header text-sm">
                    <span className="p-2">Position</span>
                    <span className="p-2">Opening</span>
                    <span className="p-2">Closing</span>
                </div>
                {rows.map(([label, opening, closing]) => (
                    <div key={label} className="grid grid-cols-3 border-t border-gray-500">
                        <span className="p-2">{label}</span>
                        <span className="p-2">{signedMoney(opening)}</span>
                        <span className="p-2 font-bold">{signedMoney(closing)}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

export default DayBook;
