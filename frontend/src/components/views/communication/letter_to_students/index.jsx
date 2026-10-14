import Loader from "@/components/Loader";
import NotFound from "@/components/NotFound";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { TextInput } from "@/components/inputs";
import Checkbox from "@/components/inputs/Checkbox";
import ClassPicker from "@/components/inputs/ClassPicker";
import { Textarea, Card, Button } from "@material-tailwind/react";
import { ButtonsSecion, FilterSection, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import cleanClassInfo from "@/methods/cleanClassInfo";
import classPickerSchema from "@/schemas/class-picker";
import { searchStudents } from "@/services/functions/students";
import { useRef, useState } from "react";
import PlaceValues, { PH_BALANCE_AMOUNT, PH_GUARDIAN_NAME, PH_STUDENT_NAME } from "../sms/templates/PlaceValues";
import { TemplateTypes } from "../sms/templates/configs";
import PreviousButton from "@/components/buttons/PreviousButton";
import BasicLetter from "./BasicLetter";
import { useReactToPrint } from "react-to-print";

const VIEW = { search: 1, print: 2 };
const searchSchema = {
    first_name: '', middle_name: '', last_name: '',
    ...classPickerSchema, include_balance: false, balance_gt: '',
    message: '',
};
function LetterToStudents() {
    const { user: { user }, fiscalYear: { year }, notification: { updateNotification } } = useAppContext();
    searchSchema["school"] = user?.profile?.school || user?.profile?.id;
    // academic_year is read fresh at submit time (below) — locking it to the
    // first-mount value searches whatever year this device happened to have
    // stored, even after the class picker has switched the app to another one.
    const [view, setView] = useState(VIEW.search);
    const [data, setData] = useState({ ...searchSchema });
    const [students, setStudents] = useState([]);
    const [showTable, setShowTable] = useState(false);
    const [focused, setFocused] = useState(false);
    const [generatedLetters, setGeneratedLetters] = useState([]);
    const { searching, statusHandler } = useRequestStatus();

    const printRef = useRef(null);
    const printGeneratedLetters = useReactToPrint({
        content: () => printRef.current,
    });

    function onChange({ name, value }) {
        if (name === "message") setFocused(true);
        if (name === "placevalue") {
            name = "message";
            value = data.message += ` ${value} `;
        }
        setData(state => ({ ...state, [name]: value }));
    }

    async function onSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        const [status, msg, _students] = await searchStudents({
            ...cleanClassInfo(data),
            academic_year: data?.academic_year || year?.academic_year,
            include_balance: data?.include_balance,
            include_guardian_name: true,
        });
        updateNotification(status, msg);
        if (_students && _students?.length > 0) {
            setStudents(_students);
            updateNotification(200, "Students search completed!");
        } else {
            updateNotification(404, "Not found!");
        }
        setGeneratedLetters([]);
        statusHandler.toggleSearching();
    }

    function toggleTable() {
        setShowTable(state => !state);
    }

    function onFocus() {
        setFocused(state => !state);
    }

    function prepareMessage(template, student_detail) {
        let { name, balance, guardian_name } = student_detail;
        name = name ? name.toUpperCase() : "";
        guardian_name = guardian_name ? guardian_name.toUpperCase() : "";
        // 
        return template
            .replaceAll(PH_STUDENT_NAME.value, name || "")
            .replaceAll(PH_BALANCE_AMOUNT.value, balance || '')
            .replaceAll(PH_GUARDIAN_NAME.value, guardian_name || '');
    }

    function generateLetters() {
        const letters = students.reduce((acc, std) => {
            acc.push(prepareMessage(data.message, std));
            return acc;
        }, []);
        setGeneratedLetters(letters);
        setView(VIEW.print);
    }

    // 
    const cashier = user?.profile?.signature ||
        (user?.profile?.school && user?.profile?.name?.split(' ')?.shift()?.toLowerCase()) ||
        'admin';

    return (
        <>{view === VIEW.search ?
            <>
                {/* SEARCH VIEW */}
                <form onSubmit={onSearch}>
                    <>
                        <FilterSection title={"Student's Info"}>
                            <div className="w-full grid grid-cols-1 sm:grid-cols-12 gap-x-1">
                                <TextInput input={{ name: 'first_name', label: 'First Name' }} value={data?.first_name} onChange={onChange} />
                                <TextInput input={{ name: 'middle_name', label: 'Middle Name' }} value={data?.middle_name} onChange={onChange} />
                                <TextInput input={{ name: 'last_name', label: 'Last Name' }} value={data?.last_name} onChange={onChange} />
                            </div>
                        </FilterSection>
                        <ClassPicker data={data} onChange={onChange} classwise={true} />
                        <Section title={"Filters"} grid={false}>
                            <div className="grid grid-cols-16 gap-2 justify-between items-end">
                                <Checkbox name={"include_balance"} text={"Include Balance"} checked={data?.include_balance}
                                    onClick={() => {
                                        onChange({ name: "include_balance", value: !data.include_balance });
                                    }} description={"Include student's balance"} />
                                <TextInput input={{ name: "balance_gt", label: "Balance greater than", type: "number" }}
                                    value={data?.balance_gt} onChange={onChange} />
                            </div>
                        </Section>
                    </>
                    <ButtonsSecion>
                        <FormSaveButton isSearch={true} searching={searching} disabled={searching || (!data?.education_level && !data?.first_name)} />
                    </ButtonsSecion>
                </form >
                {students?.length > 0 ?
                    <>
                        <>
                            <Checkbox name={"Show/Hide table"} text={"Show/Hide students table"} checked={showTable} onClick={toggleTable} />
                            {showTable &&
                                <BasicTable name={"Students"} data={students} columns={[
                                    ['name']
                                ]} onSelect={() => null} showSelected={false} />
                            }
                        </>
                        <>
                            <Card className="px-6 py-2 my-2">
                                <FilterSection title={"Message"}>
                                    <div className="!w-full">
                                        {
                                            focused &&
                                            <PlaceValues onClick={onChange} template_type={TemplateTypes.LETTER} />
                                        }
                                        <Textarea value={data?.message} className="!text-base !text-black"
                                            onFocus={onFocus} onBlur={onFocus}
                                            name="message" placeholder="Write your message here!"
                                            onChange={(e) => {
                                                const { name, value } = e.target;
                                                onChange({ name, value });
                                            }} />
                                    </div>
                                </FilterSection>
                            </Card>

                            <ButtonsSecion>
                                <Button onClick={generateLetters} disabled={!students.length > 0} variant="outlined">Generate Letters</Button>
                            </ButtonsSecion>
                        </>
                    </> :
                    <>
                        {
                            searching ? <Loader /> : <NotFound />
                        }
                    </>
                }
            </> :
            <>
                {/* PRINT VIEW */}
                <ButtonsSecion>
                    <PreviousButton onClick={() => { setView(VIEW.search) }} />
                </ButtonsSecion>

                <div className={`my-2 grid grid-cols-2 gap-2`} id="letters-view" ref={printRef}>
                    {
                        generatedLetters.map((letter, li) => (
                            <BasicLetter key={li} user={user} cashier={cashier} message={letter} />
                        ))
                    }
                </div>
                <ButtonsSecion>
                    <Button onClick={printGeneratedLetters} disabled={!generatedLetters.length > 0} variant="outlined">Print</Button>
                </ButtonsSecion>
            </>
        }
        </>
    )
}

export default LetterToStudents;