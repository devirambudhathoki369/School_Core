import { useEffect, useState } from "react";
import { SearchInput } from ".";
import { fetchStaffRoles } from "@/services/functions/staffs";

function StaffRoleInput({ input, value, error, onChange, onBlur }) {
    const [roles, setRoles] = useState([]);
    useEffect(() => {
        (async () => {
            const _roles = await fetchStaffRoles({}, {}, true);
            setRoles(_roles);
        })();
    }, []);
    return (
        <SearchInput input={{ ...input, options: roles }} value={value} error={error} onChange={onChange} onBlur={onBlur} />
    )
}

export default StaffRoleInput;