import { facultyOptions, gradeOptions, gradeOptions2, options as education_levels, semesterOptions, yearOptions } from "@/components/inputs/options/education";
import { FilterSection } from "@/components/sections";
import FilterItem from "./FilterItem";
import { OPTION_NONE, SearchInput } from ".";
import { useEffect, useState } from "react";
import { fetchSections } from "@/services/functions/sections";
import { useAppContext } from "@/contexts/AppContext";
import { courseFitsSelection, coursesForLevel, fetchCourseOptions, streamsForFaculty } from "@/services/functions/courses";
import { getHiddenEducationLevels } from "@/services/functions/educationLevels";
import switchAcademicYear from "@/methods/switchAcademicYear";
import { getDistributedSections, getDistributedSectionsKey, getSections, sectionsListFilterTrigger } from "@/methods/classwiseSections";

/**
 * A row that arrives opens its own space.
 *
 * Choosing an education level brings in "Choose class", choosing a class
 * brings in the next row, and each one used to appear at full height in a
 * single frame — everything below it jumped down by a row and the eye lost its
 * place. The row now grows from nothing over a fifth of a second and fades in
 * as it does (`.app-reveal` in globals.css; still, and instant, for anyone who
 * has asked their system for reduced motion).
 *
 * While it grows it has to clip its contents; once it has landed the clip
 * comes off, so a focus ring on the last chip is not cut by its own row.
 */
function Reveal({ children }) {
    const [settled, setSettled] = useState(false);
    return (
        <div className={`app-reveal sm:col-span-12 ${settled ? "is-settled" : ""}`} onAnimationEnd={() => setSettled(true)}>
            <div className="app-reveal-inner">{children}</div>
        </div>
    );
}

function ClassPicker({ data, onChange: onChangeOg, onBlur, classwise = '', handleAcademicYear = true, allowedEducationLevels = education_levels }) {
    const { user: { user },
        fiscalYear: { updateAcademicYear } } = useAppContext();
    const [sectionsBackup, setSectionsBackup] = useState();
    const [sections, setSections] = useState([]);
    const [distributedSections, setDistributedSections] = useState({}); // classwise sections;
    const [courses, setCourses] = useState([]);
    // education levels the superadmin has hidden for this school
    const [hiddenLevels, setHiddenLevels] = useState(new Set());

    useEffect(() => {
        const school = data?.school || user?.profile?.school || user?.profile?.id;
        if (school) getHiddenEducationLevels(school).then((h) => setHiddenLevels(new Set(h)));
    }, [data?.school, user?.profile?.school]);

    function onChange({ name, value }) {
        const next = { ...data, [name]: value };
        // A stream belongs to one faculty: switching faculty (or level) drops a
        // stream picked for the old one, or Education would be searched with a
        // Management stream.
        const dropCourse = (name === 'faculty' || name === 'education_level') &&
            !courseFitsSelection(courses, next);
        if (dropCourse) next.course = OPTION_NONE.value;
        if (classwise && sectionsListFilterTrigger.includes(name)) {
            const key = getDistributedSectionsKey(name, value, next);
            let filteredSections = distributedSections?.[key] || null;
            if (filteredSections) filteredSections = Array.from(filteredSections);
            filteredSections = filteredSections ?
                getSections(sectionsBackup?.sections || {}, filteredSections) : [];
            setSections(filteredSections);
            if (handleAcademicYear) {
                switchAcademicYear(name, value, next, updateAcademicYear);
            }
        }
        onChangeOg({ name, value });
        if (dropCourse) onChangeOg({ name: 'course', value: OPTION_NONE.value });
    }

    useEffect(() => {
        const school = data?.school || user?.profile?.school || user?.profile?.id;
        if (school) {
            (async () => {
                let data = await fetchSections(school, false, classwise);
                const data2 = await fetchCourseOptions(school);
                // 
                if (classwise) {
                    setSectionsBackup(data);
                    data = getDistributedSections(data?.classes || []);
                    setDistributedSections(data);
                } else {
                    // if not classwise, then sections are returned as an array.
                    const _sectionsBackup = {};
                    const _sections = [];
                    data.map((_section) => {
                        const { id, section } = _section;
                        _sectionsBackup[id] = section;
                        _sections.push({ name: section, value: id });
                    });
                    setSections(_sections);
                    setSectionsBackup({ sections: _sectionsBackup });
                }
                setCourses(data2);
            })();
        }
    }, [data?.school]);
    return (
        <>
            <FilterSection title={"Choose education level"}>
                {
                    allowedEducationLevels
                        ?.filter(option => !hiddenLevels.has(option?.value))
                        ?.map(option => (
                            <FilterItem onClick={onChange} label={option?.name} value={option?.value}
                                name={'education_level'} selectedOption={data?.education_level} key={option?.value} />
                        ))
                }
            </FilterSection>
            <>
                {(data?.education_level && [2, 3, 10].includes(data?.education_level)) &&
                    <Reveal><FilterSection title={"Choose class"}>
                        {
                            (data?.education_level === 3 ? gradeOptions2 : (gradeOptions || []))
                                ?.map(option => (
                                    <FilterItem onClick={onChange} label={option?.name} value={option?.value}
                                        name={'grade'} selectedOption={data?.grade} key={option?.value} />
                                ))
                        }
                    </FilterSection></Reveal>
                }
            </>
            <>
                {data?.education_level === 3 &&
                    <Reveal><FilterSection title={"Choose faculty"}>
                        {facultyOptions.map(option => (
                            <FilterItem onClick={onChange} label={option?.name} value={option?.value}
                                name={'faculty'} selectedOption={data?.faculty} key={option?.value} />
                        ))

                        }
                    </FilterSection></Reveal>
                }
            </>
            <>
                <>
                    {/* The stream a +2 faculty is split into — Management ▸
                        Computer Science / Finance / Business. Offered only once a
                        faculty is chosen, listing only THAT faculty's streams,
                        and only when it has some; "None" keeps the plain
                        faculty class, which is what every school had before. */}
                    {(data?.education_level === 3 && data?.faculty &&
                        streamsForFaculty(courses, data?.faculty).length > 0) &&
                        <Reveal><FilterSection title={"Choose stream"}>
                            <SearchInput value={data?.course} onChange={onChange}
                                input={{
                                    name: 'course', label: '',
                                    options: [OPTION_NONE, ...streamsForFaculty(courses, data?.faculty)]
                                }} />
                        </FilterSection></Reveal>
                    }
                </>
                <>
                    {/* courses for bachelor and master; */}
                    {(data?.education_level &&
                        [4, 5, 8, 9].includes(data?.education_level)) &&
                        <Reveal><FilterSection title={"Choose course"}>
                            <SearchInput value={data?.course} onChange={onChange}
                                input={{
                                    name: 'course', label: '',
                                    options: coursesForLevel(courses, data?.education_level)
                                }} />
                        </FilterSection></Reveal>
                    }
                </>
                <>
                    {
                        (data?.education_level && [4, 5, 8, 9].includes(data?.education_level) && data?.course) &&
                        <>
                            {!data?.semester &&
                                <Reveal><FilterSection title={"Year"}>
                                    {
                                        yearOptions?.map(option => (
                                            <FilterItem onClick={onChange} label={option?.name} value={option?.value}
                                                name={'year'} selectedOption={data?.year} key={option?.value} />
                                        ))
                                    }
                                </FilterSection></Reveal>
                            }
                            {!data?.year &&
                                <Reveal><FilterSection title={"Semester"}>
                                    {
                                        semesterOptions.map(option => (
                                            <FilterItem onClick={onChange} label={option?.name} value={option?.value}
                                                name={'semester'} selectedOption={data?.semester} key={option?.value} />
                                        ))
                                    }
                                </FilterSection></Reveal>
                            }
                        </>
                    }
                </>
            </>
            {data?.education_level &&
                <Reveal><FilterSection title={"Choose Section"}>
                    <SearchInput input={{ name: 'section', label: 'Section', options: [OPTION_NONE, ...sections] }}
                        value={data?.section} onChange={onChange} onBlur={onBlur} />
                </FilterSection></Reveal>
            }
        </>
    )
}

export default ClassPicker;