import { PERMISSIONS } from "@/configs/permissions";
import BasicTable from "../tables/BasicTable";
import TableHeaderFooter from "../tables/TableHeaderFooter";
import {
    deleteAction, detailAction, editAction, payAction,
    issueBookAction, returnBookAction, viewAction,
} from "../tables/actions";
import { History_SearchListColumns, Staff_History_SearchListColumns, Library_SearchListColumns, Payment_SearchListColumns } from "../views/reports/enrollments/students/table_columns";
import { useAppContext } from "@/contexts/AppContext";
import { Checkbox } from "@material-tailwind/react";
import { useState } from "react";
import { calculateBSAge } from "@/methods/calculateBSAge";

/**
Student SearchForm List Views!
*/

const searchListViewOptions = {
    PAYMENT: 1,
    HISTORY: 2,
    MANAGE: 3,
    LIBRARY: 4,
    LIBRARY_PROFILE: 5,
};
function Payment_SearchListView({ data, studentClasses, onSelect, allowStudentManagement, permissions }) {
    // Pay is open to everyone who can reach the billing page — no permission gate.
    const _actions = [payAction];
    if (permissions && permissions?.length > 0) {
        if (permissions?.includes(PERMISSIONS.STUDENT.UPDATE)) {
            _actions.push(detailAction);
        }
    } else if (!permissions) {
        _actions.push(detailAction);
    }
    return (
        <BasicTable name={"Students"} onSelect={(action, studentId, student) => {
            onSelect(action, studentId, studentClasses?.[studentId] || '', student);
        }}
            columns={Payment_SearchListColumns} data={data}
            actions={
                [..._actions, ...(allowStudentManagement ? [editAction, deleteAction] : [])
                ]
            } />
    )
}

function History_SearchListView({ data }) {
    const { user: { user } } = useAppContext();
    const today = user?.today || '';
    // Column visibility — every column is shown by default; the user can
    // toggle any column off (and back on) without affecting the data fetch.
    const [hiddenCols, setHiddenCols] = useState([]);
    const toggleCol = (key) => {
        setHiddenCols(state =>
            state.includes(key) ? state.filter(k => k !== key) : [...state, key]
        );
    };
    const columns = History_SearchListColumns.filter(col => !hiddenCols.includes(col[0]));
    data = data
        .map(item => ({
            ...item,
            gender: item.gender === 1 ? 'Male' : item.gender === 2 ? 'Female' : 'Others',
            age: calculateBSAge(item.birth_date, today),
        }))
        .sort((a, b) => (a?.name || '').localeCompare(b?.name || '', undefined, { sensitivity: 'base' }));
    const count = data?.length || 0;
    return (
        <>
            <div className="hide-from-print mb-3 rounded-lg border border-teal-300/60 bg-white/70 p-2">
                <p className="px-1 pb-1 text-sm font-semibold text-blue-gray-800">Columns to show</p>
                <div className="flex flex-wrap items-center gap-x-2">
                    {History_SearchListColumns.map((col) => (
                        <label key={col[0]} className="flex items-center capitalize text-sm cursor-pointer">
                            <Checkbox checked={!hiddenCols.includes(col[0])}
                                onChange={() => toggleCol(col[0])} />
                            {col[1] || col[0]}
                        </label>
                    ))}
                </div>
            </div>
            <BasicTable showSelected={false} name={"Students"} onSelect={() => null}
                columns={columns} data={data} print allowExport
                header={<TableHeaderFooter label={"Total no. of students"} value={count} />}
                footer={<TableHeaderFooter label={"Total no. of students"} value={count} />} />
        </>
    )
}

// Staff "view all details" report — mirrors the student History view: every
// column shown by default, each toggleable, with print + export.
function Staff_History_SearchListView({ data }) {
    const [hiddenCols, setHiddenCols] = useState([]);
    const toggleCol = (key) => {
        setHiddenCols(state =>
            state.includes(key) ? state.filter(k => k !== key) : [...state, key]
        );
    };
    const columns = Staff_History_SearchListColumns.filter(col => !hiddenCols.includes(col[0]));
    data = (data || [])
        .slice()
        .sort((a, b) => (a?.name || '').localeCompare(b?.name || '', undefined, { sensitivity: 'base' }));
    const count = data?.length || 0;
    return (
        <>
            <div className="hide-from-print mb-3 rounded-lg border border-teal-300/60 bg-white/70 p-2">
                <p className="px-1 pb-1 text-sm font-semibold text-blue-gray-800">Columns to show</p>
                <div className="flex flex-wrap items-center gap-x-2">
                    {Staff_History_SearchListColumns.map((col) => (
                        <label key={col[0]} className="flex items-center capitalize text-sm cursor-pointer">
                            <Checkbox checked={!hiddenCols.includes(col[0])}
                                onChange={() => toggleCol(col[0])} />
                            {col[1] || col[0]}
                        </label>
                    ))}
                </div>
            </div>
            <BasicTable showSelected={false} name={"Staffs"} onSelect={() => null}
                columns={columns} data={data} print allowExport dense
                header={<TableHeaderFooter label={"Total no. of staffs"} value={count} />}
                footer={<TableHeaderFooter label={"Total no. of staffs"} value={count} />} />
        </>
    )
}

function Manage_SearchListView({ name, columns, data, userClassInfos, onSelect, allowManagement }) {
    return (
        <BasicTable name={name} onSelect={(action, userId, user) => {
            onSelect(action, userId, userClassInfos?.[userId] || '', user);
        }}
            columns={columns} data={data}
            actions={
                [detailAction,
                    ...(allowManagement ? [editAction, deleteAction] : [])
                ]
            } />
    )
}

function Library_SearchListView({ name, data, onSelect }) {
    // when other schools' students are in the list, name the school they're from.
    const columns = data?.some(d => d?.school_name) ?
        [...Library_SearchListColumns, ["school_name", "School"]] :
        Library_SearchListColumns;
    return (
        <BasicTable name={name} onSelect={(action, studentId, student) => {
            onSelect(action, studentId, null, student);
        }}
            columns={columns} data={data}
            actions={[issueBookAction, returnBookAction]} />
    )
}

function LibraryProfile_SearchListView({ name, data, onSelect }) {
    return (
        <BasicTable name={name} onSelect={(action, userId, user) => {
            onSelect(action, userId, null, user);
        }}
            columns={Library_SearchListColumns} data={data}
            actions={[viewAction]} />
    )
}

export { searchListViewOptions, Payment_SearchListView, History_SearchListView, Staff_History_SearchListView, Manage_SearchListView, Library_SearchListView, LibraryProfile_SearchListView };