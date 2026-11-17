import { useAppContext } from "@/contexts/AppContext";
import { useEffect, useState } from "react";
import ClassnameButton from "../buttons/ClassNameButton";
import Loader from "../Loader";
import { ArrowPathIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { sentenceCase } from "@/methods/sentenceCase";
import classPickerSchema from "@/schemas/class-picker";
import { gradeOptions, gradeOptions2, options } from "./options/education";
import FilterItem from "./FilterItem";
import { Button, Tooltip } from "@material-tailwind/react";
import switchAcademicYear from "@/methods/switchAcademicYear";
import { prepareNameValue } from "@/methods/genAcademicYearMappingKey";
import NotFound from "../NotFound";

// TODO: fix for high-level/faculties!
function ChooseClass({ children, title, selectedClass, actions, onSelect: onSelectOG, info, reset, onReset = () => null, hideSections = false, disabled = false }) {
    const { user: { user },
        class: { loadClasses, classesBackup, classesLoaded, coursesBackup, classes, setClasses },
        fiscalYear: { updateAcademicYear } } = useAppContext();
    classPickerSchema['school'] = user?.profile?.school || user?.profile?.id;
    const [data, setData] = useState({ ...classPickerSchema });

    function onSelect(action, id, item) {
        const { class_info } = item;
        if (class_info?.course) {
            const { name, value } = prepareNameValue(class_info);
            switchAcademicYear(name, value, class_info, updateAcademicYear);
        }
        return onSelectOG(action, id, item);
    }

    /*
    switch (education_level) {
    if montessory {1}: [key : education_level]
        - show classnames;
    if school or school-govt or high-school {2,3,10}:
        - show grades : nursery-10 [key : education_level + grade]
            - show classnames matching grade
    if diploma or bachelor or master {4,5,9}:
         - show courses : all [key : education_level + course]
            - show classnames matching course. 
    }
    */
    function onChange({ name, value }) {
        if (name === "education_level" && value === 1) {
            if (value === 1) {
                filterClasses(value);
            }
            resetSelection();
        }
        // other depends on data.education_level and x, so we can use data.education_level.
        else if (name === "grade" && [2, 3, 10].includes(data?.education_level)) {
            filterClasses(data.education_level, value); // value:grade
        }
        else if (name === "course" && [4, 5, 8, 9].includes(data?.education_level)) {
            filterClasses(data.education_level, null, value); //value:course
        }
        setData(state => {
            const ns = { ...state, [name]: value };
            switchAcademicYear(name, value, ns, updateAcademicYear);
            return ns;
        });
    }

    function shouldProceed(incoming_value, class_value) {
        if (incoming_value) return incoming_value === class_value;
        return true;
    }
    function filterClasses(education_level, grade = null, course = null) {
        const key = getKey(education_level, grade, course);
        if (key && !classes?.[key]) {
            const _classes = classesBackup.reduce((acc, val) => {
                const [, class_info,] = val;
                if (class_info.education_level === education_level &&
                    shouldProceed(grade, class_info?.grade) &&
                    shouldProceed(course, class_info?.course)) {
                    acc.push(val);
                }
                return acc;
            }, []);
            if (_classes.length > 0) {
                setClasses(state => ({ ...state, [key]: _classes }));
            }
        }
    }

    function resetSelection() {
        setData({ ...classPickerSchema });
        onReset();
    }

    useEffect(() => {
        resetSelection();
    }, [reset]);

    // Said as a heading, in sentence case and without the exclamation mark
    // ("Select class to take attendance!" -> "Select class to take attendance").
    const pickerHeading = sentenceCase(String(info || "Choose a saved class").replace(/\s*!+\s*$/, ""));

    return (
        <>
            {!classesLoaded ? <Loader /> : classesBackup?.length > 0 ?
                <div className="flex flex-col">
                    {title &&
                        <h2 className="text-xl font-semibold leading-7 text-gray-900">{title}</h2>
                    }
                    {/* The picker is a card of its own: a heading that says what the
                        class is for, the two tools beside it, then the tiles. What the
                        page shows once a class is chosen comes after the card, so it
                        never ends up as a card inside a card. */}
                    <section className="app-classpick" aria-label={pickerHeading}>
                    <div className="app-classpick-head">
                        <h3 className="app-classpick-heading">{pickerHeading}</h3>
                        <div className="app-classpick-tools">
                            <Tooltip content="Reload classes">
                                <Button variant="text" className="m-0 p-2" aria-label="Reload classes" onClick={async () => {
                                    await loadClasses();
                                    resetSelection();
                                }}>
                                    <ArrowPathIcon className="icon" aria-hidden="true" />
                                </Button>
                            </Tooltip>
                            <Tooltip content="Clear selection">
                                <Button variant="text" className="m-0 p-2" aria-label="Clear selection" onClick={resetSelection}>
                                    <XMarkIcon className="icon" aria-hidden="true" />
                                </Button>
                            </Tooltip>
                        </div>
                    </div>
                    <>
                        <div className="flex flex-wrap justify-start items-start gap-1">
                            {
                                options?.map(option => (
                                    <FilterItem onClick={onChange} label={option?.name} value={option?.value}
                                        name={'education_level'} selectedOption={data?.education_level}
                                        key={option?.value} isDisabled={disabled} />
                                ))
                            }
                        </div>
                        {/* extra filteration options */}
                        <>
                            <div className="flex flex-wrap justify-start items-start gap-1">
                                {/* grade */}
                                <>
                                    {(data?.education_level && [2, 3, 10].includes(data?.education_level)) &&
                                        (data?.education_level === 3 ? gradeOptions2 : (gradeOptions || [])).map(option => (
                                            <FilterItem onClick={onChange} label={option?.name} value={option?.value}
                                                name={'grade'} selectedOption={data?.grade} key={option?.value} />
                                        ))
                                    }
                                </>
                                {/* course */}
                                <>
                                    {[4, 5, 8, 9].includes(data?.education_level) &&
                                        (coursesBackup?.[data.education_level] || []).map(option => (
                                            <FilterItem onClick={onChange} label={option?.name} value={option?.value}
                                                name={'course'} selectedOption={data?.course} key={option?.value} />
                                        ))
                                    }
                                </>
                            </div>
                        </>
                        <>
                            {(data?.education_level) &&
                                <div className="flex flex-wrap justify-start items-start gap-1">
                                    <>
                                        {
                                            (classes?.[getKey(data.education_level, data?.grade, data?.course)] || [])
                                                .map((cls, ci) => {
                                                    return <ClassnameButton hideSections={hideSections} cls={cls} key={ci} actions={actions} onSelect={onSelect} selectedClassId={selectedClass?.class_info?.id} />
                                                })
                                        }
                                    </>
                                </div>
                            }
                        </>
                    </>
                    </section>
                    <>
                        {
                            (selectedClass && !disabled) &&
                            <>
                                <p className="app-classpick-chosen">Class <b className="capitalize">{selectedClass.classname}</b></p>
                                {children}
                            </>
                        }
                    </>
                </div >
                : <NotFound error="Create a class first"
                    hint="This school has no classes yet. Add the first one from School setup → Classes & periods, then return here." />
            }
        </>
    )
}

function getKey(education_level, grade, course) {
    // this is to get classes from mapped classes.
    let key;
    if (grade) key = `e_${education_level}__g_${grade}`;
    else if (course) {
        key = `e_${education_level}__c_${course}`;
    } else key = `e_${education_level}`;
    return key;
}

export default ChooseClass;
export { getKey };
