import { useState } from "react";
import StudentProfileProvider from "@/contexts/StudentProfile";
import StudentPaymentProvider from "@/contexts/StudentPayment";
import StudentSearch from "@/components/searchbars/StudentSearch";
import StudentPaymentHistory from "./StudentPaymentHistory";
import StudentProfile from "@/components/views/profiles/student";
import { ChevronLeftIcon } from "@heroicons/react/24/outline";
import { Button } from "@material-tailwind/react";
import { searchListViewOptions } from "@/components/searchbars/SearchListViews";
import TitleSelectionSection from "./TitleSelectionSection";
import BillEntrySection from "./BillEntrySection";
import { useAppContext } from "@/contexts/AppContext";
import switchAcademicYear from "@/methods/switchAcademicYear";
import { prepareNameValue } from "@/methods/genAcademicYearMappingKey";

const VIEWS = { SEARCH: 'SEARCH', ACTION: 'ACTION' };
function initialsOf(name) {
    const words = `${name || ''}`.trim().split(/\s+/).filter(Boolean);
    if (words.length < 1) return '?';
    return `${words[0][0] || ''}${words.length > 1 ? (words[words.length - 1][0] || '') : ''}`.toUpperCase();
}
function StudentPayment() {
    const { fiscalYear: { updateAcademicYear } } = useAppContext();
    const [studentId, setStudentId] = useState(null);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [studentClassId, setStudentClassId] = useState(null);
    const [action, setAction] = useState('');
    const [view, setView] = useState(VIEWS.SEARCH);
    // Incremented every time the user returns to the search list from an
    // action view (e.g. Make Payment) — StudentSearch listens for this and
    // resets only the form inputs, leaving the prior result list intact.
    const [clearFormSignal, setClearFormSignal] = useState(0);

    const onStudentSelect = (action, studentId, classId, student) => {
        if (student?.class_academic_year) {
            updateAcademicYear(student.class_academic_year)
        } else {
            const { name, value } = prepareNameValue(student);
            switchAcademicYear(name, value, student, updateAcademicYear);
        }
        setAction(action);
        setStudentId(studentId);
        setStudentClassId(classId);
        setView(VIEWS.ACTION);
        setSelectedStudent(student);
    };
    return (
        <div className="w-full">
            <div className={view === VIEWS.SEARCH ? "" : "hidden"}>
                <StudentSearch onReset={() => {
                    setStudentId(null);
                }} onSelect={onStudentSelect} includeBalance={true} includeClassname={true}
                    includeContactInfo={true}
                    searchListViewOption={searchListViewOptions.PAYMENT}
                    clearFormSignal={clearFormSignal} />
            </div>
            <>
                {view === VIEWS.ACTION &&
                    <>
                        <div className="student-action-view w-full">
                            <Button className="app-back-btn flex items-center gap-1.5 w-max"
                                variant="outlined" size="sm"
                                onClick={() => {
                                    setView(VIEWS.SEARCH);
                                    // Reset the search form on return so the
                                    // user starts fresh — but keep the
                                    // already-fetched result list visible.
                                    setClearFormSignal(s => s + 1);
                                }}>
                                <ChevronLeftIcon className="w-4 h-4" aria-hidden="true" />
                                Back to search
                            </Button>
                            {/* The profile brings its own identity card —
                                photo, class, roll, status, the lot — so this
                                strip only earns its place above the payment
                                form, where nothing else names the student.

                                It is PINNED (`app-idpin`): the ledger, the
                                payment form and a long trial balance all scroll
                                beneath it, so the cashier never loses sight of
                                whose money this is. It has to be a direct child
                                of this view to stay pinned for the whole page —
                                inside a wrapper of its own height it would have
                                nowhere to travel. */}
                            {action !== 'profile' &&
                                <div className="app-idpin bg-main">
                                    <div className="app-idstrip flex items-center gap-3 px-4 py-3">
                                        <span className="app-avatar" aria-hidden="true">{initialsOf(selectedStudent?.name)}</span>
                                        <div className="min-w-0">
                                            {/* the name exactly as it was entered — never case-mangled */}
                                            <p className="app-idstrip-name truncate">{selectedStudent?.name}</p>
                                            {selectedStudent?.classname &&
                                                <p className="app-idstrip-sub capitalize">Class {selectedStudent.classname}</p>}
                                        </div>
                                    </div>
                                </div>
                            }
                            {action === 'pay' &&
                                <>
                                    <StudentPaymentProvider studentId={studentId} studentClassId={studentClassId}>
                                        <div className="px-3">
                                            <TitleSelectionSection />
                                            <BillEntrySection />
                                        </div>
                                        <StudentPaymentHistory selectedStudent={selectedStudent} />
                                    </StudentPaymentProvider>
                                </>
                            }
                            {action === 'profile' &&
                                <StudentProfileProvider studentId={studentId}>
                                    <StudentProfile />
                                </StudentProfileProvider>
                            }
                        </div>
                    </>
                }
            </>
        </div>
    )
}

export default StudentPayment;