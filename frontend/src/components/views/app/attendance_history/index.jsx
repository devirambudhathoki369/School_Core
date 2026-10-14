import Loader from "@/components/Loader";
import NotFound from "@/components/NotFound";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { TextInput } from "@/components/inputs";
import ChooseClass from "@/components/inputs/ChooseClass";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { selectAction } from "@/components/tables/actions";
import StatusCell from "./StatusCell";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { __search } from "@/services/functions";
import { useState } from "react";

const searchSchema = { start_date: '', end_date: '', school: '' };

// checked_in_at is a UTC instant; show the punch time in Nepal local time.
function formatCheckInTime(value) {
    if (!value) return '';
    const dt = new Date(value);
    if (isNaN(dt.getTime())) return '';
    return dt.toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Kathmandu',
        hour: '2-digit', minute: '2-digit', hour12: true,
    });
}

function AttendanceHistory() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    searchSchema["start_date"] = user?.today;
    searchSchema["end_date"] = user?.today;
    searchSchema["school"] = user?.profile?.school || user?.profile?.id;
    const [selectedClass, setSelectedClass] = useState(null);
    const [searchInput, setSearchInput] = useState({ ...searchSchema });
    const [data, setData] = useState({});
    const { searching, statusHandler } = useRequestStatus();

    function onClassSelect(action, id, item) {
        setSelectedClass(item);
    }
    function onChange({ name, value }) {
        setSearchInput(state => ({ ...state, [name]: value }));
    }
    function allowSearch() {
        return (searchInput?.school && searchInput?.start_date && searchInput?.end_date);
    }
    function formatData(stdAttendance) {
        let present = 0, absent = 0, total = 0;
        const dateRow = Object.keys(stdAttendance).reduce((acc, date) => {
            // cell is { status: bool, checked_in_at, checked_out_at, reason }
            const cell = stdAttendance[date] || {};
            const status = cell?.status;
            const reason = cell?.reason ? `(${cell.reason})` : "";
            let status_str = "-";
            if (status === true) {
                const inT = formatCheckInTime(cell?.checked_in_at);
                const outT = formatCheckInTime(cell?.checked_out_at);
                let s = `present${reason}`;
                if (inT) s += ` · In ${inT}`;
                if (outT) s += ` · Out ${outT}`;
                status_str = s;
                present += 1; total += 1;
            }
            if (status === false) { status_str = `absent${reason}`; absent += 1; total += 1; }
            acc[date] = status_str;
            return acc;
        }, {});
        dateRow["total_present"] = present;
        dateRow["total_absent"] = absent;
        dateRow["total_days"] = total;
        return dateRow;
    }
    async function onSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        const [status, msg, _data] = await __search("/api/search/attendance", {
            ...searchInput,
            class_info: selectedClass?.class_info?.id,
        });
        if (_data?.students?.length > 0 && _data?.dates?.length > 0) {
            const _formattedData = _data.students.reduce((acc, std) => {
                acc.push(
                    { ...std, ...formatData(_data.data?.[std.id] || {}) }
                );
                return acc;
            }, []);
            setData({
                data: _formattedData,
                dates: [
                    ["name", "Student name"],
                    ..._data.dates.map(date => ([date, date, "", false, "horizontal", StatusCell])),
                    ["total_present", "Total Present"],
                    ["total_absent", "Total Absent"],
                    ["total_days", "Total Days"],
                ]
            });
        }
        else {
            updateNotification(status, msg);
        }
        statusHandler.toggleSearching();
    }

    return (
        <ChooseClass title={"Attendance history"} selectedClass={selectedClass} onSelect={onClassSelect} actions={[selectAction]}>
            <form onSubmit={onSearch}>
                <Section>
                    <TextInput input={{ name: 'start_date', label: "Date (From)" }} value={searchInput?.start_date} onChange={onChange} />
                    <TextInput input={{ name: 'end_date', label: "Date (To)" }} value={searchInput?.end_date} onChange={onChange} />
                </Section>
                <ButtonsSecion>
                    <FormSaveButton isSearch={true} searching={searching}
                        disabled={!allowSearch()} />
                </ButtonsSecion>
            </form>

            {
                searching ? <Loader /> :
                    <>
                        {
                            (data?.dates?.length > 0 && data?.data?.length > 0) ?
                                <>
                                    <BasicTable name={"Attendance history"} data={data.data} columns={data.dates}
                                        header={
                                            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-semibold p-2">
                                                <span>Class : <span className="capitalize font-bold">{selectedClass?.class_info?.name}</span></span>
                                                <span>Students : <span className="font-bold">{data.data.length}</span></span>
                                                <span>From : {searchInput?.start_date}</span>
                                                <span>To : {searchInput?.end_date}</span>
                                            </div>
                                        }
                                        showSelected={false} print={true} allowExport={true} onSelect={() => null} />
                                </> :
                                <NotFound />
                        }
                    </>
            }
        </ChooseClass>
    )
}

export default AttendanceHistory;