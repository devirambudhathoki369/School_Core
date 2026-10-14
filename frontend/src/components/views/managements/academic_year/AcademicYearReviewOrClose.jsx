import { useTempState } from "@/contexts/TempStateContext";
import { useEffect, useState } from "react";
import { ACADEMIC_YEAR_CLOSING_KEY } from "./configs";
import { useAppContext } from "@/contexts/AppContext";
import { Button, Typography, Stepper, Tooltip } from "@material-tailwind/react";
import PreviousButton from "@/components/buttons/PreviousButton";
import { __save, __search } from "@/services/functions";
import AttentionBox from "@/components/AttentionBox";
import NotFound from "@/components/NotFound";
import Loader from "@/components/Loader";
import { Section } from "@/components/sections";
import { TextInput } from "@/components/inputs";
import { academicYearSchema } from "@/schemas/fiscal-year";
import { academicYearValidationSchema } from "@/schemas/validations/fiscal-year";
import BasicTable from "@/components/tables/BasicTable";
import Warning from "@/components/Warning";
import {
    BookOpenIcon,
    CheckBadgeIcon,
    LockClosedIcon,
    ChevronDoubleLeftIcon,
    ChevronDoubleRightIcon,
} from "@heroicons/react/24/outline";
import CStep from "@/components/cstepper/CStep";
import Users from "@/configs/Users";

const HOMEPAGE = process.env.NEXT_PUBLIC_DEFAULT_ADMIN_VIEW;
const API_PATH = "/api/academic_year/closing";
const schema = { school: '' };

function AcademicYearReviewOrClose() {
    const { user: { user },
        fiscalYear: { fyKeys, mappedYears },
        class: { classesBackup },
        notification: { updateNotification },
        prompt: { toggleConfirmationPrompt } } = useAppContext();
    schema["school"] = user?.profile?.school || user?.profile?.id;
    academicYearSchema["school"] = schema.school;

    const [data, setData] = useState({});
    const [year, setNewAcademicYear] = useState({ ...academicYearSchema });
    const [academicYears, setAcademicYears] = useState([]);
    const [errors, setErrors] = useState({});
    const [classes, setClasses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [closing, setClosing] = useState(false);
    const { getTempState } = useTempState();
    // stepper
    const [activeStep, setActiveStep] = useState(0);
    const [isLastStep, setIsLastStep] = useState(false);
    const [isFirstStep, setIsFirstStep] = useState(false);

    const handleNext = () => !isLastStep && setActiveStep((cur) => cur + 1);
    const handlePrev = () => !isFirstStep && setActiveStep((cur) => cur - 1);

    const onStepClick = (step) => setActiveStep(step);
    // 

    function onAcademicYearChange({ name, value }) {
        setNewAcademicYear(state => ({ ...state, [name]: value }));
    }
    async function onAcademicYearBlur({ name, value }) {
        try {
            await academicYearValidationSchema.validateAt(name, { [name]: value });
            setErrors(({ [name]: _, ...errors }) => (errors));
        } catch ({ message }) {
            setErrors(errors => ({ ...errors, [name]: message }));
        }
    }

    async function closeAcademicYearRequest(force = false) {
        return __save(API_PATH, {
            ...data,
            economic_year: user.profile.economic_year,
            search: false, // so that we can close!
            new_academic_year: year,
            // Only sent when the operator has consciously overridden the
            // continuing-junior guard (see the guided prompt below).
            ...(force ? { force_close_juniors: true } : {}),
        });
    }
    async function closeAcademicYear(e) {
        e.preventDefault();
        if (!user?.profile?.economic_year) {
            updateNotification(400, "Economic year missing!");
            return;
        }
        try {
            await academicYearValidationSchema.validate(year);
        } catch ({ message }) {
            updateNotification(400, message);
            return;
        }
        //
        setClosing(state => !state);
        const promptData = { ask_reason: false, header: "Are you sure to close this academic year?" };
        promptData['onConfirm'] = async (reason) => {
            const [status, message] = await closeAcademicYearRequest(false);
            // The backend guard blocks a close that would sweep still-running
            // junior cohorts' live fees into "old dues". Surface an explicit,
            // consequence-aware override instead of a dead-end error.
            if (status === 400 && typeof message === 'string' && message.includes('force_close_juniors')) {
                toggleConfirmationPrompt({
                    ask_reason: false,
                    header: "Junior cohorts are still running",
                    sub_header: "Closing now will show their CURRENT dues as old dues. Promote or graduate them first — or force-close anyway if you are sure.",
                    onConfirm: async () => {
                        const [s2, m2] = await closeAcademicYearRequest(true);
                        if (s2) {
                            updateNotification(s2, m2);
                            if (s2 === 200) reset();
                        }
                    },
                });
                return;
            }
            if (status) {
                updateNotification(status, message);
                if (status === 200) {
                    reset();
                }
            }
        }
        toggleConfirmationPrompt(promptData);
        setClosing(state => !state);
    }
    function reset() {
        setData({});
        setNewAcademicYear({ ...academicYearSchema });
        setErrors({});
        // 
        setTimeout(() => {
            window.location.href = `/admin#${HOMEPAGE}`;
            window.location.reload();
            localStorage.removeItem(fyKeys?.academic_year);
        }, afterCloseExitTime);
    }
    function loadEditingData() {
        let tempStateData = getTempState(ACADEMIC_YEAR_CLOSING_KEY, false);
        if (tempStateData) {
            tempStateData = { ...schema, ...tempStateData };
            console.log(">>", tempStateData);
            setData(tempStateData);
            return tempStateData;
        }
        return false;
    }
    function loadAcademicYears() {
        setAcademicYears(Object.values(mappedYears?.academicYears || {}));
    }
    function prepKey(class_info, academic_year) {
        let key;
        // +2 groups by grade even when the class has a stream in `course`.
        if (class_info?.course && class_info.education_level !== 3) key = `${class_info?.year || "_"}-${class_info?.semester || "_"}-${class_info?.course || "_"}-${class_info.education_level}`;
        else key = `${class_info?.grade || "_"}-${class_info.education_level}`;
        key += `-${academic_year || '_'}`;
        return key;
    }

    useEffect(() => {
        const loadedData = loadEditingData();
        if (loadedData) {
            loadAcademicYears();
            (
                async () => {
                    setLoading(state => !state);
                    const [status, msg, _classes] = await __search(API_PATH, loadedData);
                    if (_classes) {
                        const mappedClasses = [...classesBackup].reduce((acc, cls) => {
                            const [name, class_info, _] = cls;
                            if (_classes?.includes(class_info.id)) {
                                const key = prepKey(class_info, class_info.academic_year);
                                try {
                                    acc[key].push({ name });
                                } catch (e) {
                                    acc[key] = [{ name }];
                                }
                            }
                            return acc;
                        }, {});
                        setClasses(Object.values(mappedClasses));
                    }
                    setLoading(state => !state);
                }
            )();
        } else {
            updateNotification(500, "Invalid request!");
        }

        return () => {
            setData({});
        }
    }, []);

    return (
        <>
            <div className="grid grid-cols-3">
                <PreviousButton />
                <h1 className="text-center font-semibold text-lg">Academic Year Review!</h1>
                <span></span>
            </div>
            <div className="mt-2">
                {/* if academic year object found! */}
                {data?.academic_year ?
                    <>
                        <div className="w-[63%] mx-auto flex flex-col">
                            <Stepper
                                activeStep={activeStep}
                                isLastStep={(value) => setIsLastStep(value)}
                                isFirstStep={(value) => setIsFirstStep(value)}
                            >
                                <CStep step={0} activeStep={activeStep} onClick={onStepClick}
                                    title={"Guide"} description={"Recommened to read carefully!"} icon={
                                        <BookOpenIcon className="h-8 w-8" />
                                    } />
                                <CStep step={1} activeStep={activeStep} onClick={onStepClick}
                                    title={"Review classes"} description={"Check classes if there're some duplicates/wrong ones!"} icon={
                                        <CheckBadgeIcon className="h-8 w-8" />
                                    } />
                                <CStep step={2} activeStep={activeStep} onClick={onStepClick}
                                    title={"Close running Academic Year"} description={"Create new academic year and close runnning academic year"} icon={
                                        <LockClosedIcon className="h-8 w-8" />
                                    } />
                            </Stepper>
                            <div className="mt-32 flex justify-between border-b-2 border-gray-500">
                                <Tooltip content="Previous">
                                    <Button variant="text" onClick={handlePrev} disabled={isFirstStep} >
                                        <ChevronDoubleLeftIcon className="h-4 w-4" />
                                    </Button>
                                </Tooltip>
                                <Tooltip content="Next">
                                    <Button variant="text" onClick={handleNext} disabled={isLastStep}>
                                        <ChevronDoubleRightIcon className="h-4 w-4" />
                                    </Button>
                                </Tooltip>
                            </div>
                        </div>
                        {/*  */}
                        <div className="my-4 overflow-y-auto">
                            {/* 0 */}
                            {activeStep === 0 &&
                                <div className="p-3">
                                    <Warning warning={"READ CAREFULLY!, The action is irreversible, so do as mentioned!"} />
                                    <AttentionBox title={WARNING.title}
                                        description={WARNING.description} dismissable={false} />
                                </div>
                            }
                            {/* 1 */}
                            {activeStep === 1 &&
                                <div className="p-3 rounded-md">
                                    <Typography variant="lead" className="capitalize text-center font-semibold">
                                        Classes
                                    </Typography>
                                    <div className="flex flex-col gap-y-1">
                                        {loading ? <Loader /> :
                                            <>
                                                {classes?.length > 0 ?
                                                    <>
                                                        {classes.map((clsGroup, cgi) => (
                                                            <div key={cgi} className="grid grid-cols-6 gap-y-1 gap-x-2 border-b-2 border-gray-500 py-2">
                                                                {clsGroup.map((cls, index) => (
                                                                    <span className="capitalize px-4 py-1 rounded-md bg-gray-400 text-black text-base font-semibold"
                                                                        key={index}>{cls.name}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        ))}
                                                    </> :
                                                    <NotFound error="Classes not found!" />}
                                            </>}
                                    </div>
                                </div>
                            }
                            {activeStep === 2 &&
                                <div>
                                    {allowClosing(user) && classes?.length > 0 &&
                                        <form onSubmit={closeAcademicYear} className="flex flex-col my-2 p-3 rounded-md shadow-default">
                                            <>
                                                <Section title={"Academic year setup"} grid={2} description={academic_year_description}>
                                                    <TextInput value={year?.name} input={{ label: 'Name', name: 'name', placeholder: 'Faculty/Level/Course Year' }} error={errors?.name}
                                                        onChange={onAcademicYearChange} onBlur={onAcademicYearBlur} />
                                                    <TextInput value={year?.start_date} input={{ label: 'Start date (BS)', name: 'start_date' }} error={errors?.start_date}
                                                        onChange={onAcademicYearChange} onBlur={onAcademicYearBlur} />
                                                    <TextInput value={year?.end_date} input={{ label: 'End date(BS)', name: 'end_date' }} error={errors?.end_date}
                                                        onChange={onAcademicYearChange} onBlur={onAcademicYearBlur} />
                                                </Section>
                                                <BasicTable name={"Running Academic Years"} data={academicYears} columns={[
                                                    ['name'], ['start_date', 'start date'], ['end_date', 'end date']
                                                ]} onSelect={() => null} showSelected={false} />
                                            </>
                                            <Button type="submit" className="mx-auto w-max text-base" color="blue-gray" disabled={closing || classes?.length < 1}>
                                                Close Academic Year &nbsp;
                                                <span className="capitalize text-lg">`{data.academic_year_name}`</span>
                                            </Button>
                                        </form>
                                    }
                                </div>
                            }
                        </div>
                    </>
                    :
                    <div className="w-max mx-auto">
                        <PreviousButton name={"Return Back"} />
                    </div>
                }
            </div>
        </>
    )
}

const WARNING = {
    title: "MUST READ!!!",
    description: `Closing this academic year will have effects on the following classes!
    Review Classes : If you see wrong/duplicate classes, please contact for support!
        Close : The academic year you create here will replace current academic year!`
};

const afterCloseExitTime = 2 * 1000; // after 2 seconds!
const academic_year_description = `Once created here, No need to create and map academic year again,
    Everything is handled internally!
        If academic year is already in the table below, don't create but contact us!`;

function allowClosing(user) {
    return user?.role === Users.ADMIN;
}

export default AcademicYearReviewOrClose;