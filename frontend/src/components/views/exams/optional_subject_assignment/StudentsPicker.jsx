import FilterItem from "@/components/inputs/FilterItem";
import Checkbox from "@/components/inputs/Checkbox";
import { useEffect } from "react";

const NAME = "student";
function StudentsPicker({ students, data, previousData, onSelect, allStudents: { pickedAllStudents, setPickedAllStudents }, onSelectAll }) {
    function handleSelectAll() {
        if (pickedAllStudents) {
            const _students = students.reduce((acc, std) => {
                if (!previousData?.includes(std.id)) acc.push(std.id);
                return acc;
            }, []);
            onSelectAll({ name: NAME, value: _students });
        } else {
            onSelectAll({ name: NAME, value: [] });
        }
    }
    function onStudentSelect({ name, value }) {
        let _students = new Set(data?.students || []);
        if (_students.has(value)) _students.delete(value);
        else _students.add(value);
        return onSelect({ name, value: Array.from(_students) });
    }
    // 
    useEffect(() => {
        handleSelectAll();
    }, [pickedAllStudents]);
    // 
    return (
        <div className="flex flex-col items-end">
            <div className="flex flex-wrap">
                {students.map(std => (
                    <FilterItem key={std.id} name={NAME}
                        // TODO: FIX THIS; keep isSelected, remove selectedOption;
                        isDisabled={previousData?.includes(std.id)}
                        selectedOption={data?.students?.includes(std.id) ? std.id : null}
                        label={std.name} value={std.id} onClick={onStudentSelect} />
                ))}
            </div>
            <Checkbox disabled={students?.length < 1} onClick={() => {
                setPickedAllStudents(state => !state);
            }} checked={pickedAllStudents} text={"Select all students?"} />
        </div>
    )
}

export default StudentsPicker;