import { useEffect, useState } from "react";
import { SearchInput } from ".";
import { useAppContext } from "@/contexts/AppContext";
import { fetchSubjects } from "@/services/functions/subjects";

function SubjectInput({ input, value, error, onChange, onBlur, optional = '', class_id = '' }) {
    const { user: { user } } = useAppContext();
    const [subjects, setSubjects] = useState([]);
    useEffect(() => {
        if (user?.profile && class_id) {
            (async () => {
                const _subjects = await fetchSubjects(user?.profile?.school || user?.profile?.id, true, optional, '', class_id);
                setSubjects(_subjects);
            })();
        }
    }, [user?.profile, class_id]);
    return (
        <SearchInput input={{ ...input, options: subjects }} value={value} error={error} onChange={onChange} onBlur={onBlur} />
    )
}

export default SubjectInput;