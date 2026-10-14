import React, { useState } from "react";

import { useSearch } from "@/contexts/SearchContext";
import { SelectInput, TextInput } from "../inputs";
import { FilterSection } from "@/components/sections";
import STAFF_STATUS_OPTIONS from "../inputs/options/staff_status";
import SearchPanel from "./SearchPanel";
import countActiveFilters, { activeFilters } from "./countActiveFilters";

const FILTER_LABELS = {
    first_name: "First name",
    middle_name: "Middle name",
    last_name: "Last name",
    status: "Status",
};

// `status` ships as "1" (employed) and is not a narrowing the user chose.
const DEFAULTS = { status: "1" };

function StaffSearchForm({ useStatus = false }) {
    const [searchOpened, setSearchOpened] = useState(true);
    const { form, methods: { onChange, onReset, onSearch } } = useSearch();

    return (
        <SearchPanel
            title="Search Staff"
            open={searchOpened}
            onToggle={() => setSearchOpened(state => !state)}
            activeCount={countActiveFilters(form, { defaults: DEFAULTS })}
            // Same removable chips as the student panel — this form collapses
            // itself after a search (below), so being able to read and lift the
            // filters without reopening it matters more here than there.
            filters={activeFilters(form, {
                defaults: DEFAULTS,
                labels: FILTER_LABELS,
                format: (key, value) => {
                    if (key === 'status') {
                        const opt = (STAFF_STATUS_OPTIONS || []).find(o => `${o.value}` === `${value}`);
                        if (opt) return opt.name;
                    }
                    return Array.isArray(value) ? value.join(', ') : String(value);
                },
            })}
            // `status` has a real default ("1"), so clearing its chip must put
            // the default back rather than blanking the field — blanking it
            // would silently widen the search to every staff record.
            onRemoveFilter={(key) => onChange({ name: key, value: DEFAULTS[key] ?? '' })}
            onReset={onReset}
            onSubmit={(e) => {
                e.preventDefault();
                onSearch(e);
                setSearchOpened(false);
            }}>
            <div className="mygrid">
                <FilterSection title={"Staff's Info"}>
                    <div className="grid grid-cols-1 sm:grid-cols-12 w-full gap-x-1">
                        <TextInput input={{ name: 'first_name', label: 'First Name' }} value={form?.first_name} onChange={onChange} />
                        <TextInput input={{ name: 'middle_name', label: 'Middle Name' }} value={form?.middle_name} onChange={onChange} />
                        <TextInput input={{ name: 'last_name', label: 'Last Name' }} value={form?.last_name} onChange={onChange} />
                        {
                            useStatus &&
                            <SelectInput input={{ name: 'status', label: 'Status', options: STAFF_STATUS_OPTIONS }}
                                value={form?.status} onChange={onChange} />
                        }
                    </div>
                </FilterSection>
            </div>
        </SearchPanel>
    );
}


export default React.memo(StaffSearchForm);
