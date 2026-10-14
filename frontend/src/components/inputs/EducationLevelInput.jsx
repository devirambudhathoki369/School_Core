import { useEffect, useState } from "react";
import { OPTION_NONE, SearchInput, SelectInput } from ".";
import { options, gradeOptions, gradeOptions2, semesterOptions, yearOptions, facultyOptions } from "./options/education";
import { fetchSections } from "@/services/functions/sections";
import { useAppContext } from "@/contexts/AppContext";
import { courseFitsSelection, coursesForLevel, fetchCourseOptions, streamsForFaculty } from "@/services/functions/courses";
import { getHiddenEducationLevels } from "@/services/functions/educationLevels";
import { getDistributedSections, getDistributedSectionsKey, getSections, sectionsListFilterTrigger } from "@/methods/classwiseSections";
import switchAcademicYear from "@/methods/switchAcademicYear";
// 
// grade: '', faculty: '', course: '', section: '', year: '', semester: ''
export default function EducationLevelInput({ data, input, value, errors, onChange: onChangeOg, onBlur, detailed = false }) {
    const detailedView = (detailed && value) ? 'sm:col-span-12 mygrid' : 'sm:col-span-4';
    const { user: { user }, fiscalYear: { updateAcademicYear } } = useAppContext();
    const [sectionsBackup, setSectionsBackup] = useState();
    const [sections, setSections] = useState([]);
    const [distributedSections, setDistributedSections] = useState({});//classwise sections;
    const [courses, setCourses] = useState([]);
    // education levels the superadmin hid for this school
    const [hiddenLevels, setHiddenLevels] = useState(new Set());
    const visibleLevels = options.filter((o) => !hiddenLevels.has(o.value));
    const readOnly = input?.readOnly;
    value = parseInt(value);
    // 
    function onChange({ name, value }) {
        if (sectionsListFilterTrigger.includes(name)) value = parseInt(value) || '';
        const next = { ...data, [name]: value };
        // Drop a stream that belongs to the faculty (or level) just left.
        const dropCourse = (name === 'faculty' || name === 'education_level') &&
            !courseFitsSelection(courses, next);
        if (dropCourse) next.course = OPTION_NONE.value;
        if (sectionsListFilterTrigger.includes(name)) {
            assignSections(name, value, null, null, next);
            switchAcademicYear(name, value, next, updateAcademicYear);
        }
        onChangeOg({ name, value });
        if (dropCourse) onChangeOg({ name: 'course', value: OPTION_NONE.value });
    }
    function assignSections(name, value, _sections = null, _distributedSections = null, selection = data) {
        if (!_distributedSections) _distributedSections = distributedSections;
        // 
        const key = getDistributedSectionsKey(name, value, selection);
        let filteredSections = _distributedSections?.[key] || null;
        if (filteredSections) {
            if (!_sections) _sections = sectionsBackup?.sections || {};
            filteredSections = Array.from(filteredSections);
            filteredSections = getSections(_sections || {}, filteredSections);
        }
        setSections(filteredSections || []);
    }

    useEffect(() => {
        (async () => {
            const schoolId = user?.profile?.school || user?.profile?.id;
            if (schoolId) getHiddenEducationLevels(schoolId).then((h) => setHiddenLevels(new Set(h)));
            let sections = await fetchSections(schoolId, false, true);
            const courses = await fetchCourseOptions(schoolId);
            setSectionsBackup(sections);
            const _distributedSections = getDistributedSections(sections?.classes || []);
            setDistributedSections(_distributedSections);
            setCourses(courses);
            // 
            let name, value;
            if (data?.grade) {
                name = "grade";
                value = data.grade;
            } else if (data?.education_level) {
                name = "education_level";
                value = data.education_level;
            }
            if (name && value) {
                assignSections(name, value, sections?.sections, _distributedSections);
            }
        })();
    }, []);
    // 
    return (
        <div className={detailedView}>
            <>
                <SelectInput value={value} error={errors?.[input?.name]} onChange={onChange} onBlur={onBlur}
                    input={{
                        label: input?.label, name: input?.name, options: visibleLevels, readOnly
                    }} />
            </>
            {/* detailed-info */}
            <>
                {(detailed && value) &&
                    <>
                        {/* if education_level is [school, college] */}
                        <>
                            {/* {(value != 1 && value != 4 && value != 5) && */}
                            {(value === 2 || value === 3 || value === 10) &&
                                <>
                                    <SelectInput value={data?.grade} error={errors?.grade} onChange={onChange}
                                        onBlur={onBlur}
                                        input={{
                                            name: 'grade', label: 'Class or Grade', readOnly,
                                            options: value === 3 ? [...gradeOptions2] : [...gradeOptions]
                                        }} />
                                    {/*  */}
                                </>
                            }
                        </>
                        {/* if education_level is [college,bachelor,master] */}
                        <>
                            {value === 3 &&
                                <SelectInput value={data?.faculty} error={errors?.faculty} onChange={onChange}
                                    onBlur={onBlur}
                                    input={{
                                        name: 'faculty', label: 'Faculty', options: facultyOptions || [], readOnly
                                    }} />
                            }
                        </>
                        <>
                            {/* The stream under the faculty (Management ▸ Computer
                                Science). Shown only where the school has set streams
                                up, so every other +2 enrolment form is unchanged. */}
                            {(value === 3 && data?.faculty && streamsForFaculty(courses, data?.faculty).length > 0) &&
                                <SearchInput value={data?.course} error={errors?.course} onChange={onChange}
                                    onBlur={onBlur}
                                    input={{
                                        name: 'course', label: 'Stream',
                                        options: [OPTION_NONE, ...streamsForFaculty(courses, data?.faculty)], readOnly
                                    }} />
                            }
                        </>
                        <>
                            {(value === 4 || value === 5 || value === 8 || value === 9) &&
                                <>
                                    {
                                        <SearchInput value={data?.course} error={errors?.course} onChange={onChange}
                                            onBlur={onBlur}
                                            input={{
                                                name: 'course', label: 'Course',
                                                options: coursesForLevel(courses, value), readOnly
                                            }} />
                                    }
                                </>
                            }
                        </>
                        {/* if education_level is [bachelor,master] */}
                        <>
                            {((value === 4 || value === 5 || value === 8 || value === 9) &&
                                data?.course) &&
                                <>
                                    <>
                                        {/* {data.year?`Year (${data.year}th year)`:'Year'} */}
                                        {/* {data.semester?`Semester (${data.semester}th semester)`:'Semester'} */}
                                    </>
                                    <SelectInput value={data?.year} error={errors?.year} onChange={onChange}
                                        onBlur={onBlur}
                                        input={{
                                            name: 'year', label: `Year`,
                                            options: [...yearOptions], readOnly: readOnly || data?.semester
                                        }} />
                                    <SelectInput value={data?.semester} error={errors?.semester} onChange={onChange}
                                        onBlur={onBlur}
                                        input={{
                                            name: 'semester', label: `Semester`, options: [...semesterOptions], readOnly: readOnly || data?.year
                                        }} />
                                </>
                            }
                        </>
                        {/* section */}
                        <>
                            <SearchInput input={{ name: 'section', label: 'Section', options: [OPTION_NONE, ...sections], readOnly }}
                                value={data?.section} onChange={onChange} onBlur={onBlur} />
                        </>
                    </>
                }
            </>
        </div>
    );
}
