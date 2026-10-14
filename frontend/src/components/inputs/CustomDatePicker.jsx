import { useEffect, useState } from "react";
import {
    Popover,
    PopoverHandler,
    PopoverContent
} from "@material-tailwind/react";
import { TextInput } from ".";
import MonthInput from "./MonthInput";
import Error from "../Error";

const dateFormat = { year: '', month: '', day: '' };
function extractDate(dateValue) {
    // 'year-month-day -> date:{year,month-day};
    const ex = dateValue.split('-');
    const date = {
        ...dateFormat,
        ['year']: ex[0],
        ['month']: ex[1],
        ['day']: ex[2]
    };
    return date;
}
function joinDate(dateObject) {
    // date:{year,month,day} -> 'year-month-day';
    return Object.values(dateObject).every(value => value !== "") ?
        Object.values(dateObject).join('-') : "";
}
//
/**
 * A custom date picker which accepts year, month, and day.
 */
export default function CustomDatePicker({ input, value, error, onChange, onBlur, min_year, max_year }) {
    const [date, setDate] = useState({ ...dateFormat });
    function updateDate({ name, value }) {
        // local function: only for this component;
        setDate(state => ({ ...state, [name]: value }));
    }
    function onDateBlur() {
        /** visible textbox doesn't change so handle date change via blur */
        const obj = { name: input.name, value: joinDate(date) };
        onChange(obj);
        onBlur(obj);
    }
    useEffect(() => {
        if (value) {
            setDate(state => {
                state = { ...extractDate(value) };
                return state;
            })
        }
    }, []);
    // 
    return (
        <div className="sm:col-span-4">
            {/* `bottom` centres the panel on the field; `bottom-start` lines it
                up with the field's left edge, which is what keeps it on screen
                when the field runs the full width of a phone. Width is capped
                against the viewport for the same reason. */}
            <Popover placement="bottom-start">
                <PopoverHandler>
                    <div>
                        <TextInput
                            value={joinDate(date)}
                            input={{ ...input, readOnly: true, placeholder: 'Click to pick date!' }} />
                    </div>
                </PopoverHandler>
                <PopoverContent onBlur={onDateBlur} className="bg-gray-50 w-[min(92vw,22rem)] max-h-[min(70vh,26rem)] overflow-y-auto">
                    <div className="mygrid !gap-1">
                        <TextInput
                            value={date.year} onChange={updateDate}
                            input={{
                                name: 'year', label: "Year", type: 'number', min: min_year, max: max_year, placeholder: "2000-3000"
                            }} />
                        <MonthInput value={date.month} onChange={updateDate} />
                        <TextInput
                            value={date.day} onChange={updateDate}
                            input={{
                                name: 'day', label: "Day", type: 'number', min: 1, max: 32, placeholder: "Min (1), Max (32)"
                            }} />
                    </div>
                </PopoverContent>
            </Popover>
            <Error error={error} />
        </div>
    );
}
