import { useAppContext } from "@/contexts/AppContext";
import { useEffect, useState } from "react";
import ClassnameButton from "../buttons/ClassNameButton";
import Loader from "../Loader";
import { BookmarkIcon, ArrowPathIcon, XMarkIcon } from "@heroicons/react/24/outline";
import classPickerSchema from "@/schemas/class-picker";
import { gradeOptions, gradeOptions2, options } from "./options/education";
import FilterItem from "./FilterItem";
import { Button, Tooltip } from "@material-tailwind/react";
import switchAcademicYear from "@/methods/switchAcademicYear";
import { prepareNameValue } from "@/methods/genAcademicYearMappingKey";

// TODO: fix for high-level/faculties!
function ChooseClass({ children, title, selectedClass, actions, onSelect: onSelectOG, info, reset, onReset = () => null, hideSections = false, disabled = false }) {
    const { user: { user },
        class: { loadClasses, classesBackup, coursesBackup, classes, setClasses },
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

    return (
        <>
            {classesBackup?.length > 0 ?
                <div className="flex flex-col">
                    {title &&
                        <h2 className="text-xl font-semibold leading-7 text-gray-900">{title}</h2>
                    }
                    <div className="flex items-center">
                        <span className="w-full my-3 flex gap-x-3 text-base items-center font-semibold">
                            <BookmarkIcon className="icon" />
                            {info || "Select class"}
                        </span>
                        <div className="flex w-max justify-end items-center">
                            <Tooltip content="Refresh Classes">
                                <Button variant="text" className="m-0 p-2" onClick={async () => {
                                    await loadClasses();
                                    resetSelection();
                                }}>
                                    <ArrowPathIcon className="icon" />
                                </Button>
                            </Tooltip>
                            <Tooltip content="Reset Selection">
                                <Button variant="text" className="m-0 p-2" onClick={resetSelection}>
                                    <XMarkIcon className="icon" />
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
                                        (coursesBackup?.[data.education_level]).map(option => (
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
                    <>
                        {
                            (selectedClass && !disabled) &&
                            <>
                                <span className="text-lg font-semibold text-center capitalize mt-4">class : {selectedClass.classname}</span>
                                {children}
                            </>
                        }
                    </>
                </div >
                : <Loader />
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