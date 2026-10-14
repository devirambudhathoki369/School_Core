import StudentSearch from "@/components/searchbars/StudentSearch";
import { Button } from "@material-tailwind/react";
import { useState } from "react";
import { ChevronLeftIcon } from "@heroicons/react/24/outline";
import { searchListViewOptions } from "@/components/searchbars/SearchListViews";

const VIEWS = { SEARCH: 'SEARCH', ACTION: 'ACTION' };
function EnrollmentsHistory() {
    const [studentId, setStudentId] = useState(null);
    const [studentClassId, setStudentClassId] = useState(null);
    const [action, setAction] = useState('');
    const [view, setView] = useState(VIEWS.SEARCH);
    const onStudentSelect = (action, studentId, classId) => {
        setAction(action);
        setStudentId(studentId);
        setStudentClassId(classId);
        setView(VIEWS.ACTION);
    };
    // 
    return (
        <div className="w-full">
            <>
                <div hidden={view != VIEWS.SEARCH}>
                    <StudentSearch onReset={() => {
                        return null;
                    }} onStudentSelect={onStudentSelect} detailed={true} includeClassname={true}
                        useAcademicYear={true}
                        searchListViewOption={searchListViewOptions.HISTORY} />
                </div>
            </>
            {view === VIEWS.ACTION &&
                <>
                    <div className="student-action-view w-full">
                        <div className="flex">
                            <Button className="flex items-center bg-gray-300"
                                variant="text" size="sm"
                                onClick={() => {
                                    setView(VIEWS.SEARCH);
                                }}>
                                <ChevronLeftIcon className="w-5 h-5" />
                                Goto Search
                            </Button>
                        </div>
                    </div>
                </>
            }
        </div>
    )
}

export default EnrollmentsHistory;