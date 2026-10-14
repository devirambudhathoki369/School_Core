import ClassPicker from "@/components/inputs/ClassPicker";
import { ButtonsSecion } from "@/components/sections";
import ColumnInput from "@/components/tables/ColumnInput";
import HeaderCard from "@/components/tables/HeaderCard";
import RowCard from "@/components/tables/RowCard";
import { useAppContext } from "@/contexts/AppContext";
import { Button, Card, Tooltip, Typography } from "@material-tailwind/react";
import { useRef, useState } from "react";
import classPickerSchema from "@/schemas/class-picker";
import { ArrowUpCircleIcon } from "@heroicons/react/24/outline";
import Papa from 'papaparse';
import { saveStudent } from "@/services/functions/students";
import cleanEmptyFields from "@/methods/cleanEmptyFields";
import studentValidationSchema from "@/schemas/validations/student";
import cleanClassInfo from "@/methods/cleanClassInfo";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import AcademicYearNotice from "@/components/AcademicYearNotice";
// 
const DATA_COLUMNS = [
    'first_name', 'middle_name*', 'last_name',
    'gender', 'birth_date', 'contact*', 'email*', 'location',
    'father_name', 'mother_name', 'guardian_name*',
    'guardian_contact', 'guardian_email*', 'guardian_location*',
    'emis*',
];
const GUIDES = {
    ...{
        first_name: 'Min: 2, Max: 10',
        middle_name: 'Min: 2, Max: 10 (Optional)',
        last_name: 'Min: 2, Max: 10',
    },
    gender: 'Number, [1 - male, 2 - female and 3 - others]',
    birth_date: 'Must be in format yyyy-mm-dd',
    contact: '10 digits, (Optional)',
    email: 'Valid email, (Optional)',
    location: 'Min: 2, Max: 25',
    father_name: "Father's full name, Min: 4, Max: 30",
    mother_name: "Mother's full name, Min: 4, Max: 30",
    guardian_name: "Guardian's full name, Min: 4, Max: 30 (Optional)",
    guardian_contact: "10 digits",
    guardian_email: '(Optional)',
    guardian_location: '(Optional)',
    emis: "(Optional)"
};
const bulkEnrollClassInfoSchema = { ...classPickerSchema };

function BulkStudentEnrollment() {
    const { user: { user },
        fiscalYear: { year, hasFiscalYears },
        notification: { updateNotification } } = useAppContext();
    bulkEnrollClassInfoSchema["school"] = user?.profile?.school || user?.profile?.id;
    bulkEnrollClassInfoSchema["academic_year"] = year?.academic_year;
    const [classInfo, setClassInfo] = useState({ ...bulkEnrollClassInfoSchema });
    const [grid, setGrid] = useState({});
    const [data, setData] = useState([]);
    const [file, setFile] = useState({});
    const fileInputRef = useRef();
    const [uploading, setUploading] = useState(false);
    // 
    function handleGender(value) {
        const isNum = !isNaN(value) || false;
        if (!isNum) {
            value = value?.toLowerCase() || '';
            if (value.startsWith('m')) value = 1;
            else if (value.startsWith('f')) value = 2;
            else if (value.startsWith('o')) value = 3;
            else value = null;
        } else {
            value = parseInt(value) || value;
        }
        return value;
    }
    function formatData(data) {
        const GENDER_INDEX = 3;
        return data.reduce((acc, row) => {
            const item = {}
            row.map((col, ci) => {
                if (ci === GENDER_INDEX) {
                    col = handleGender(col);
                }
                const key = DATA_COLUMNS[ci].replaceAll('*', '');
                item[key] = col;
            })
            // console.log(item);
            acc.push(cleanEmptyFields(item, ['gender']));
            return acc;
        }, []);
    }
    async function onSubmit(e) {
        e.preventDefault();
        if (!hasFiscalYears()) {
            return;
        }
        setUploading(true);
        try {
            const students = formatData(data);
            // console.log(students);
            let row = 0;
            for (const std of students) {
                for (let [key, value] of Object.entries(std)) {
                    try {
                        await studentValidationSchema.validateAt(key, { [key]: value });
                    } catch ({ message }) {
                        updateNotification('', `${message} at [row "${row}" -> "${key}"]`);
                        throw new Error('Validation error occurred');
                    }
                }
                row++;
            }
            const [status, message,] = await saveStudent({
                class_info: { ...bulkEnrollClassInfoSchema, ...cleanClassInfo(classInfo) },
                students,
                academic_year: year.academic_year
            });
            updateNotification(status, message);
            if (status === 201) {
                reset();
            }
        } catch (e) {
            // console.log(e.message);
        }
        setUploading(false);
    }
    function onClassChange({ name, value }) {
        setClassInfo(state => ({ ...state, [name]: value }));
    }
    function reset() {
        setClassInfo({ ...bulkEnrollClassInfoSchema });
        setGrid({});
        setData([]);
        setFile({});
    }
    function isFileInputValid(data) {
        if (data?.length > 0) {
            if (data[0]?.length != DATA_COLUMNS.length) {
                return false;
            }
        }
        return true;
    }
    function handleCSV(headers, data) {
        // console.log(headers, data);
        if (isFileInputValid(data)) {
            setGrid({ rows: data.length, cols: headers.length });
            setData(data);
        } else {
            setFile({});
            updateNotification('', "Invalid input! Columns must match as listed below!");
        }
    }
    function readFile(e) {
        const file = e.target.files[0];
        if (file) {
            setFile(file);
            Papa.parse(file, {
                complete: function (results) {
                    // console.log("Finished:", results);
                    const [headers, ...data] = results.data;
                    handleCSV(headers, data.filter(row => row?.[0] != ''));
                },
                beforeFirstChunk: (chunk) => {
                    return chunk.replace(/^\s*[\r\n]/gm, '');
                }
            });
        } else {
            // console.log('no-file!');
        }
        e.target.value = "";
    }
    function onFileUpload() {
        fileInputRef.current.click();
    }
    function copyHeaders() {
        let table = `<table><thead><tr>`;
        DATA_COLUMNS.map(col => {
            const COL = col.split('_').join(" ")
            table += `<th>${COL.toUpperCase()}</th>`;
        })
        table += `</tr></thead><tbody></tbody></table>`;
        // copy to clipboard;
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(table)
                .then(() => {
                    updateNotification('', 'Table headers copied to clipboard successfully!');
                })
                .catch(err => {
                    updateNotification('', 'Failed to copy table headers to clipboard: ', err);
                });
        }
    }
    /**
     * 1. selects class
     * 2. picks csv file
     * 3. confirms all data
     * 4. upload/enroll
     */
    return (
        <form onSubmit={onSubmit}>
            <>
                <AcademicYearNotice />
                <Card className="p-3">
                    <ClassPicker data={classInfo} onChange={onClassChange} classwise={true} />
                    <ButtonsSecion>
                        <Button variant="outlined" onClick={reset}>Reset</Button>
                    </ButtonsSecion>
                </Card>
            </>
            <>
                {
                    <>
                        <input type="file" hidden ref={fileInputRef} accept=".csv" onChange={readFile} />
                        <Card className="cursor-pointer flex flex-row items-center p-3 my-2 gap-x-2" onClick={onFileUpload}>
                            <Typography variant="h6" color="blue-gray">
                                UPLOAD CSV FILE!
                            </Typography>
                            <ArrowUpCircleIcon className="w-6 h-6" />
                            {file.name &&
                                <span className="mx-2 flex gap-x-2">
                                    <span>Filename : {file.name}</span>
                                    <span>[{grid?.rows} x {grid?.cols}]</span>
                                </span>
                            }
                        </Card>
                    </>
                }
            </>
            <>
                {/* Here, all data from csv will be loaded */}
                <>
                    <div className="overflow-x-auto">
                        <HeaderCard grid={grid?.cols || DATA_COLUMNS.length} className={'min-w-max bg-table-header'}>
                            <>
                                {
                                    DATA_COLUMNS.map((col, ci) => (
                                        <Tooltip key={ci} content={GUIDES?.[col]} className={`${GUIDES?.[col] ? '' : 'hidden'}`}>
                                            <span className="font-semibold w-[12rem] min-w-[12rem] max-w-[12rem] mx-1 overflow-x-hidden">{col.split("_").join(" ")}</span>
                                        </Tooltip>
                                    ))
                                }
                            </>
                        </HeaderCard>
                        <>
                            {
                                data.map((row, ri) => (
                                    <RowCard key={ri} grid={grid?.cols || DATA_COLUMNS.length} className={'min-w-max bg-teal-100 rounded-none'}>
                                        {
                                            row.map((col, ci) => (
                                                <ColumnInput key={ci} id={ci} value={col || ''} onChange={(_, val) => {
                                                    const _s = [...data];
                                                    _s[ri][ci] = val;
                                                    setData(_s);
                                                }}
                                                    className={'w-[12rem] min-w-[12rem] max-w-[12rem] mx-1'} />
                                            ))
                                        }
                                    </RowCard>
                                ))
                            }
                        </>
                    </div>
                    <ButtonsSecion>
                        <Button variant="outlined" onClick={copyHeaders}>
                            Copy Headers
                        </Button>
                        <FormSaveButton custom={[uploading, "Save All", "Uploading..."]} disabled={uploading || !classInfo?.education_level} />
                    </ButtonsSecion>
                </>
            </>
        </form>
    )
}

export default BulkStudentEnrollment;