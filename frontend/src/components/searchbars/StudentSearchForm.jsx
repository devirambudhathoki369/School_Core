import React, { useState } from "react";

import { useSearch } from "@/contexts/SearchContext";
import { SelectInput, TextInput } from "../inputs";
import { FilterSection } from "@/components/sections";
import ClassPicker from "../inputs/ClassPicker";
import ClosedAcademicYearSelectInput from "../inputs/ClosedAcademicYearSelectInput";
import STUDENT_STATUS_OPTIONS from "../inputs/options/student_status";
import SearchPanel from "./SearchPanel";
import countActiveFilters, { activeFilters } from "./countActiveFilters";

// Field name → what the user should read. Without this the chips would show the
// API's own names ("student_id", "class_info"), which are not words anyone
// typed into the form.
const FILTER_LABELS = {
    student_id: "ID no.",
    first_name: "First name",
    middle_name: "Middle name",
    last_name: "Last name",
    status: "Status",
    academic_year: "Academic year",
    education_level: "Level",
    grade: "Class",
    section: "Section",
    faculty: "Faculty",
    course: "Course",
    semester: "Semester",
    batch: "Batch",
};

function StudentSearchForm({ useStatus = false, useAcademicYear = false }) {
    const [searchOpened, setSearchOpened] = useState(true);
    const { studentSearch, methods: { onChange, onSeachFormReset, onSearch } } = useSearch();

    // A status filter is stored as its numeric value, so the chip would read
    // "Status: 2". Resolved back to the label the user picked.
    function formatFilter(key, value) {
        if (key === 'status') {
            const opt = (STUDENT_STATUS_OPTIONS || []).find(o => `${o.value}` === `${value}`);
            if (opt) return opt.name;
        }
        return Array.isArray(value) ? value.join(', ') : String(value);
    }

    return (
        <SearchPanel
            title="Search Student"
            open={searchOpened}
            onToggle={() => setSearchOpened(state => !state)}
            activeCount={countActiveFilters(studentSearch)}
            filters={activeFilters(studentSearch, { labels: FILTER_LABELS, format: formatFilter })}
            // Clearing one chip is the same operation the form already has for
            // emptying a field, so it reuses `onChange` rather than introducing
            // a second way to mutate the search state.
            onRemoveFilter={(key) => onChange({ name: key, value: '' })}
            onReset={onSeachFormReset}
            onSubmit={(e) => {
                e.preventDefault();
                onSearch(e);
            }}>
            <div className="mygrid">
                <FilterSection title={"Student's Info"}>
                    <div className="w-full grid grid-cols-1 sm:grid-cols-12 gap-x-1">
                        {/* An ID pins down one student on its own — no name or class needed. */}
                        <TextInput grid={3} input={{ name: 'student_id', label: 'Student ID No.', type: 'number' }} value={studentSearch?.student_id} onChange={onChange} />
                        <TextInput grid={3} input={{ name: 'first_name', label: 'First Name' }} value={studentSearch?.first_name} onChange={onChange} />
                        <TextInput grid={3} input={{ name: 'middle_name', label: 'Middle Name' }} value={studentSearch?.middle_name} onChange={onChange} />
                        <TextInput grid={3} input={{ name: 'last_name', label: 'Last Name' }} value={studentSearch?.last_name} onChange={onChange} />
                        {
                            useStatus &&
                            <SelectInput grid={3} input={{ name: 'status', label: 'Status', options: STUDENT_STATUS_OPTIONS }}
                                value={studentSearch?.status} onChange={onChange} />
                        }
                    </div>
                </FilterSection>
                {/* --- */}
                <ClassPicker data={studentSearch} onChange={onChange} classwise={true} />
                {/* --- */}
                {useAcademicYear &&
                    <FilterSection title={"Academic Year"}>
                        <div className="w-full grid grid-cols-1 sm:grid-cols-12 gap-x-1">
                            <ClosedAcademicYearSelectInput
                                value={studentSearch?.academic_year}
                                onChange={({ value }) => onChange({ name: 'academic_year', value })}
                                showRunning={true} />
                        </div>
                    </FilterSection>
                }
            </div>
        </SearchPanel>
    );
}


export default React.memo(StudentSearchForm);
