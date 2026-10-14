import FormSaveButton from "@/components/buttons/FormSaveButton";
import { SearchInput } from "@/components/inputs";
import Checkbox from "@/components/inputs/Checkbox";
import { gradeOptions2, options, semesterOptions, yearOptions } from "@/components/inputs/options/education";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { useAppContext } from "@/contexts/AppContext";
import genAcademicYearMappingKey, { prepareNameValue } from "@/methods/genAcademicYearMappingKey";
import { __update } from "@/services/functions";
import { fetchClassesInOrder } from "@/services/functions/classes";
import { getAcademicYearMappings, getAcademicYears } from "@/services/functions/fiscalYear";
import { fetchSchools } from "@/services/functions/schools";
import { useEffect, useState } from "react";

const schema = { update_periods: false };
function ClassesAcademicYearManagement() {
    const { fiscalYear: { getAcademicYearName },
        prompt: { toggleConfirmationPrompt },
        notification: { updateNotification } } = useAppContext();
    const [schools, setSchools] = useState([]);
    const [school, setSchool] = useState('');
    // const [coursesBackup, setCoursesBackup] = useState({});
    const [facultyNames, setFacultyNames] = useState({});
    const [mappings, setMappings] = useState({});
    const [mappedAcademicYears, setMappedAcademicYears] = useState([]);
    const [classes, setClasses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [extraInfo, setExtraInfo] = useState({ ...schema });
    const [saving, setSaving] = useState(false);

    function onSchoolSelect({ name, value }) {
        setSchool(value);
    }

    useEffect(() => {
        (async () => {
            const data = await fetchSchools({}, true);
            setSchools(data);
        })();
    }, []);
    // 
    function onChange({ name, value }) {
        setExtraInfo(state => ({ ...state, [name]: value }));
    }
    function extractCourseName(name) {
        const parts = name.split('-');
        return parts.length > 0 ? parts[0] : null;
    }
    async function extractCourses(_classes) {
        // only for education-levels diploma[9] or bachelor[4] or master[5]
        if (_classes?.length > 0) {
            const addedCourses = { 4: [], 5: [], 8: [], 9: [] };
            const courses = _classes.reduce((acc, cls) => {
                const [, class_info,] = cls;
                const EL = class_info.education_level;
                const course_id = class_info?.course
                // A +2 class carries its stream in `course` too; streams are not
                // college courses and have no bucket here — skipping them keeps
                // `acc[EL]` from being undefined, which threw and left every
                // class chooser on its loader.
                if (!(EL in addedCourses)) return acc;
                if (course_id && !addedCourses[EL].includes(course_id)) {
                    const course = {
                        name: extractCourseName(class_info.name),
                        value: course_id,
                    };
                    acc[EL].push(course);
                    acc["all"][course.value] = course.name;
                    addedCourses[EL].push(course_id);
                }
                return acc;
            }, { 4: [], 5: [], 8: [], 9: [], all: {} });
            // setCoursesBackup(courses);
            setFacultyNames(getFacultyNames(courses));
        } else {
            // setCoursesBackup([]);
        }
    }
    function getFacultyNames(courses) {
        return {
            "el": options.reduce((acc, option) => {
                acc[option.value] = option.name;
                return acc;
            }, {}),
            "g": gradeOptions2.reduce((acc, option) => {
                acc[option.value] = option.name;
                return acc;
            }, {}),
            "c": courses?.["all"] || {},
            "y": yearOptions.reduce((acc, option) => {
                acc[option.value] = option.name + ' year';
                return acc;
            }, {}),
            "s": semesterOptions.reduce((acc, option) => {
                acc[option.value] = option.name + ' sem';
                return acc;
            }, {}),
        };
    }
    function getRowColor(mapped_academic_year, class_academic_year) {
        if (!mapped_academic_year) return "red";
        if (mapped_academic_year != class_academic_year) return "crimson";
        return "";
    }
    useEffect(() => {
        if (school) {
            (async () => {
                setLoading(true);
                let _mappings = await getAcademicYearMappings(school);
                if (_mappings) {
                    if (!_mappings?.length > 0) {
                        updateNotification(404, "Mappings not found!");
                        setLoading(false);
                        return;
                    }
                    const _academicYears = await getAcademicYears(school, true);
                    _mappings = (_mappings).reduce((acc, val) => {
                        const { id, key, academic_year } = val;
                        const academic_year_name = getAcademicYearName(academic_year, _academicYears)
                        acc[key] = { id, academic_year, academic_year_name };
                        return acc;
                    }, {});
                    setMappings(_mappings);
                }
                const user = { profile: { school } };
                const _classes = await fetchClassesInOrder(user);
                if (_classes) {
                    extractCourses(_classes);
                    setClasses(
                        Object.values(_classes).reduce((acc, cls) => {
                            const [, class_info,] = cls;
                            const { name, value } = prepareNameValue(class_info);
                            const acay_key = genAcademicYearMappingKey(name, value, class_info); // academic-year-key!
                            class_info["academic_year_key"] = acay_key;
                            const mapped_academic_year = _mappings?.[acay_key];
                            class_info["mapped_academic_year"] = mapped_academic_year?.academic_year || null;
                            class_info["mapped_academic_year_name"] = mapped_academic_year?.academic_year_name;
                            class_info["remarks"] = `${class_info?.academic_year} -> ${mapped_academic_year?.academic_year}`;
                            class_info["color"] = getRowColor(mapped_academic_year?.academic_year, class_info?.academic_year);
                            acc.push(class_info);
                            return acc;
                        }, []).sort((a, b) => a.mapped_academic_year - b.mapped_academic_year)
                    )
                }
                setLoading(false);
            })();
        }
    }, [school]);

    useEffect(() => {
        if (school) {
            (async () => {
                setMappedAcademicYears(
                    Object.entries(mappings).reduce((acc, [level, { id, academic_year, academic_year_name }]) => {
                        const details = extractKey(level);
                        let className = details.reduce((acc, detail) => {
                            const { key, value } = detail;
                            acc += " " + facultyNames?.[key]?.[value] || "";
                            return acc;
                        }, "");
                        acc.push({ id, key: level, class: className, academic_year, academic_year_name, details });
                        return acc;
                    }, []).sort((a, b) => a.academic_year - b.academic_year)
                )
            })();
        }
    }, [facultyNames]);
    // 
    function prepareUploadData() {
        const data = classes.reduce((acc, cls) => {
            const { id, mapped_academic_year, academic_year } = cls;
            if (mapped_academic_year && mapped_academic_year != academic_year) {
                acc.push({ id, academic_year: mapped_academic_year });
            }
            return acc;
        }, [])
        return {
            school,
            data,
            ...extraInfo,
        }
    }
    async function updateClassesAcademicYears(e) {
        e.preventDefault();
        const promptData = { ask_reason: false, header: "Are they correct?" };
        promptData['onConfirm'] = async (reason) => {
            setSaving(true);
            const uploadData = prepareUploadData();
            if (uploadData?.data?.length > 0) {
                let status, message;
                [status, message,] = await __update(UPDATE_API, uploadData);
                if (status) {
                    updateNotification(status, message);
                    if (status === 200) {
                        onReset();
                    }
                }
            } else {
                console.log(uploadData);
                updateNotification(404, "Nothing to update!");
            }
            setSaving(false);
        }
        toggleConfirmationPrompt(promptData);
    }
    function onReset() {
        setSchool('');
        setFacultyNames({});
        setMappings({});
        setMappedAcademicYears([]);
        setClasses([]);
        setLoading(false);
        setSaving(false);
    }

    return (
        <>
            <Section>
                <SearchInput input={{ name: 'school', label: 'School', options: schools }}
                    value={school} onChange={onSchoolSelect} />
            </Section>
            <>
                {
                    school &&
                    <form onSubmit={updateClassesAcademicYears}>
                        <BasicTable name={"Academic Year Mappings"} loading={loading} data={mappedAcademicYears}
                            columns={[['class', 'Level/Class'], ['key'], ['academic_year_name', 'academic year']]}
                            onSelect={() => null} showSelected={false} />
                        <BasicTable name={"Academic Year for classes"} columns={[
                            ['name'], ['academic_year_key'], ['mapped_academic_year_name'], ['remarks'],
                        ]} data={classes} onSelect={() => null} showSelected={false} loading={loading} />
                        {classes?.length > 0 &&
                            <>
                                <Section>
                                    <Checkbox name={"update_periods"} text={"Update periods"} onClick={(e) => {
                                        const value = !extraInfo?.update_periods;
                                        onChange({ name: "update_periods", value });
                                    }} checked={extraInfo?.update_periods} />
                                </Section>
                                <ButtonsSecion>
                                    <FormSaveButton saving={saving} isUpdate={true} />
                                </ButtonsSecion>
                            </>
                        }
                    </form>
                }
            </>
        </>
    )
}

function extractKey(key) {
    const regex = /(el|g|c|y|s)(\d+)/g;
    const details = [];
    let match;
    while ((match = regex.exec(key)) !== null) {
        const [_, segment, value] = match;
        details.push({ key: segment, value: parseInt(value, 10) });
    }
    return details;
}
const UPDATE_API = "/api/classes";

export default ClassesAcademicYearManagement;