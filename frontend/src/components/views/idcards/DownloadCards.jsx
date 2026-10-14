import { SearchInput, SelectInput, TextInput } from "@/components/inputs";
import ClassPicker from "@/components/inputs/ClassPicker";
import { ButtonsSecion, FilterSection, Section } from "@/components/sections";
import { useAppContext } from "@/contexts/AppContext";
import classPickerSchema from "@/schemas/class-picker";
import { fetchSchools } from "@/services/functions/schools";
import { searchStudents } from "@/services/functions/students";
import { Button } from "@material-tailwind/react";
import React, { useEffect, useRef, useState } from "react";
import IDCard from "./IDCard";
// 
import FileSaver from "file-saver";
import cleanClassInfo from "@/methods/cleanClassInfo";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import useRequestStatus from "@/hooks/requestStatus";
import Checkbox from "@/components/inputs/Checkbox";
import { useReactToPrint } from "react-to-print";
import { CardOptions, CardSelectOptions } from "./configs";
import { searchStaffs } from "@/services/functions/staffs";
import StudentsPicker from "../exams/optional_subject_assignment/StudentsPicker";
// 
let html2canvasInstance = null, jsZipInstance = null;
async function getHtml2Canvas() {
    if (!html2canvasInstance) {
        html2canvasInstance = (await import('html2canvas')).default;
    }
    return html2canvasInstance;
}
async function getJSZip() {
    if (!jsZipInstance) {
        jsZipInstance = (await import("jszip")).default;
    }
    return jsZipInstance;
}
// base64 jpeg -> Blob (blob: URLs decode far faster than data: URLs for print)
function b64toBlob(b64, type = "image/jpeg") {
    const bytes = atob(b64);
    const len = bytes.length;
    const arr = new Uint8Array(len);
    for (let i = 0; i < len; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type });
}
//
const SCALE_FACTOR = 2;
//
const cardInputSchema = { validity_date: '' };
const searchSchema = { ...classPickerSchema };
const filtersSchema = { showBirthDate: false, showBloodGroup: false, showBusStation: false, showEMIS: false, showCitizenshipNo: false, };
function DownloadCards() {
    const { notification: { updateNotification } } = useAppContext();
    const [cardOption, setCardOption] = useState(1);
    const [searchInput, setSearchInput] = useState({ ...searchSchema });
    const [cardInput, setCardInput] = useState({ ...cardInputSchema });
    const [schools, setSchools] = useState([]);
    const [processingStudent, setProcessingStudent] = useState(null);
    const [students, setStudents] = useState([]);
    const [studentImages, setStudentImages] = useState({});
    const [idCards, setIDCards] = useState([]);
    const [filters, setFilters] = useState({ ...filtersSchema });
    const [isProcessing, setIsProcessing] = useState(false);
    const [generatedCount, setGeneratedCount] = useState(0);
    const [generationCompleted, setGenerationCompleted] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    // streaming bulk zip / print (handles large batches without the preview grid)
    const [isBulkZipping, setIsBulkZipping] = useState(false);
    const [isBulkPrinting, setIsBulkPrinting] = useState(false);
    const [signs, setSigns] = useState({});
    const templateRef = useRef(null);
    const { searching, statusHandler } = useRequestStatus();
    // filtering
    const [selectedStudents, setSelectedStudents] = useState([]);
    const [selectedStudentIds, setSelectedStudentIds] = useState([]);
    const [pickedAllStudents, setPickedAllStudents] = useState(false);
    // 
    const cardsPrintRef = useRef(null);
    const printCardsSection = useReactToPrint({
        content: () => cardsPrintRef.current,
    });
    // 
    function toggleCardOption({ name, value }) {
        value = parseInt(value);
        setCardOption(value);
    }
    async function downloadSchoolSign(school) {
        const data = await fetchSchools({ school, include_sign: true }, false);
        if (data?.[0]?.sign) {
            setSigns(state => ({
                ...state,
                [school]: '/media/' + (data[0].sign)
            }))
        }
    }
    function onSearchInputChange({ name, value }) {
        if (name === "school" && !signs?.[value]) {
            downloadSchoolSign(value);
        }
        setSearchInput(state => ({ ...state, [name]: value }));
    }
    function reset() {
        setSearchInput({ ...searchSchema });
    }
    function onCardInputChange({ name, value }) {
        setCardInput(state => ({ ...state, [name]: value }));
    }

    async function prefetchImages(paths) {
        const images = {};
        const requests = paths.filter(path => path.image)
            .map(path => fetch(process.env.NEXT_PUBLIC_BASE_URL + '/media/' + path.image, { mode: 'no-cors' })
                .then(response => response.blob())
                .then(blob => {
                    const objectURL = URL.createObjectURL(blob);
                    images[path.id] = objectURL;
                }).catch(e => { })
            );
        Promise.all(requests);
        setStudentImages(images);
    }
    async function onSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        setSelectedStudentIds([]);
        setSelectedStudents([]);
        setProcessingStudent(null);
        setGenerationCompleted(false);
        setGeneratedCount(0);
        setIDCards([]);
        // 
        let status, message, data;
        if (cardOption === CardOptions.student) {
            ([status, message, data] = await searchStudents({
                ...cleanClassInfo(searchInput),
                include_classname: true,
                id_cards: true,
                // get station name
                include_station: true,
                station_name: true,
            }));
        } else if (cardOption === CardOptions.staff) {
            ([status, message, data] = await searchStaffs({
                ...cleanClassInfo(searchInput),
                id_cards: true,
            }));
        }
        // console.log(status, message, data);
        if (status === 200) {
            const paths = data.map(({ id, image }) => ({ id, image }));
            await prefetchImages(paths);
            //
            if (data?.length < 1) updateNotification("", "No data found!");
            setStudents(data);
        } else {
            updateNotification(status, message);
            setStudents([]);
        }
        statusHandler.toggleSearching();
    }
    async function generateCanvas() {
        const html2canvas = await getHtml2Canvas();
        return new Promise((resolve, reject) => {
            const attemptConversion = async () => {
                try {
                    const card = templateRef.current;
                    const filename = card.getAttribute('data-filename');
                    const canvas = await html2canvas(card, {
                        scale: SCALE_FACTOR, allowTaint: false, useCORS: true, logging: false
                    });
                    const data = canvas.toDataURL("image/jpeg", 1.0).replace(/^data:image\/jpeg;base64,/, "");
                    resolve({ data, filename });
                } catch (e) {
                    reject(e);
                }
            }
            setTimeout(attemptConversion, 100);
        });
    }
    function formatUser(userInfo) {
        return {
            id: userInfo.id,
            name: userInfo.name,
            image: userInfo.image,
            birth_date: userInfo.birth_date,
            blood_group: userInfo?.blood_group || "",
            // student!
            emis: userInfo?.emis || "",
            classname: userInfo?.classname || "",
            guardian_name: userInfo?.guardian_name || "",
            bus_station: userInfo?.bus_station || "",
            //staff
            designation: userInfo?.designation || "",
            citizenship_no: userInfo?.citizenship_no || "",
            // student || staff
            contact: userInfo?.guardian_contact || userInfo?.primary_contact || "",
            address: userInfo?.guardian_location || userInfo?.address || "",
        }
    }
    async function generateIDCards() {
        const _ss = selectedStudentIds?.length > 0 ? students.filter(e => selectedStudentIds.includes(e.id)) : students;
        setSelectedStudents(_ss);
        // 
        setGeneratedCount(0);
        setGenerationCompleted(false);
        setIsProcessing(true);
        const results = {};
        for (const student of _ss) {
            setProcessingStudent(formatUser(student));
            results[student.id] = await generateCanvas();
            setGeneratedCount(state => ++state);
        }
        setProcessingStudent(null);
        setIDCards(results);
        setIsProcessing(false);
        setGenerationCompleted(true);
        updateNotification(200, "Generation Completed!");
    }
    async function downloadIDCards() {
        setIsDownloading(true);
        const classname = students[0].classname;
        const today = new Date().toISOString().slice(0, 10);
        const JSZip = await getJSZip();
        const zip = new JSZip();
        // ---
        try {
            selectedStudents.forEach(student => {
                const card = idCards[student.id];
                zip.file(card.filename, card.data, { base64: true });
            });
            // 
            try {
                const content = await zip.generateAsync({ type: "blob" });
                FileSaver.saveAs(content, `${classname}_${today}.zip`);
            } catch (zipError) {
                updateNotification('', `Error generating zip!`);
            }
        } catch (e) {
            updateNotification('', 'Error downloading files!');
        } finally {
            setIsDownloading(false);
        }
    }

    // Streaming ZIP: generate each card and append it straight into the zip,
    // without keeping every card in state or rendering the full preview grid.
    // This lets large batches (100s of cards) download without crashing the tab.
    // It does NOT touch the existing Generate / Print / Download flow.
    async function bulkDownloadZip() {
        const _ss = selectedStudentIds?.length > 0 ? students.filter(e => selectedStudentIds.includes(e.id)) : students;
        if (!_ss?.length) {
            updateNotification("", "No cards to download!");
            return;
        }
        setIsBulkZipping(true);
        setGenerationCompleted(false);
        setGeneratedCount(0);
        const JSZip = await getJSZip();
        const zip = new JSZip();
        try {
            for (const student of _ss) {
                // render the hidden template for this student, then capture it
                setProcessingStudent(formatUser(student));
                const { data, filename } = await generateCanvas();
                zip.file(filename, data, { base64: true });
                setGeneratedCount(state => ++state);
            }
            const classname = students[0]?.classname || "id_cards";
            const today = new Date().toISOString().slice(0, 10);
            const content = await zip.generateAsync({ type: "blob" });
            FileSaver.saveAs(content, `${classname}_${today}.zip`);
            updateNotification(200, "Download ready!");
        } catch (e) {
            updateNotification("", "Error generating zip!");
        } finally {
            setProcessingStudent(null);
            setIsBulkZipping(false);
        }
    }

    // Streaming Print: generate each card and stream it into a clean, dedicated
    // print window (card-sized pages), so schools can review/print large batches
    // without the heavy in-app preview grid. Does NOT touch the existing
    // Generate / Print / Download flow.
    async function bulkPrint() {
        const _ss = selectedStudentIds?.length > 0 ? students.filter(e => selectedStudentIds.includes(e.id)) : students;
        if (!_ss?.length) {
            updateNotification("", "No cards to print!");
            return;
        }
        // open synchronously (within the click) so pop-up blockers allow it
        const win = window.open("", "_blank");
        if (!win) {
            updateNotification("", "Please allow pop-ups to print the cards!");
            return;
        }
        win.document.write(`<!doctype html><html><head><title>ID Cards</title><style>
            @page { margin: 6mm; }
            * { box-sizing: border-box; }
            body { margin: 0; display: flex; flex-wrap: wrap; gap: 6px; }
            img { width: 300px; height: 450px; page-break-inside: avoid; border: 1px solid #cbd5e1; border-radius: 2px; }
        </style></head><body></body></html>`);
        win.document.close();
        const container = win.document.body;
        //
        setIsBulkPrinting(true);
        setGenerationCompleted(false);
        setGeneratedCount(0);
        const urls = [];
        try {
            for (const student of _ss) {
                // render the hidden template, capture it, and stream the image
                // straight into the print window so it decodes while the rest
                // of the batch is still being generated (pipelined = fast).
                setProcessingStudent(formatUser(student));
                const { data } = await generateCanvas();
                const url = URL.createObjectURL(b64toBlob(data));
                urls.push(url);
                const img = win.document.createElement("img");
                img.src = url;
                container.appendChild(img);
                setGeneratedCount(state => ++state);
            }
            setProcessingStudent(null);
            // wait until every image is decoded (deterministic), then print
            const imgEls = Array.from(container.querySelectorAll("img"));
            await Promise.all(imgEls.map(im => im.decode().catch(() => { })));
            win.focus();
            win.print();
            urls.forEach(u => URL.revokeObjectURL(u));
            updateNotification(200, "Print ready!");
        } catch (e) {
            urls.forEach(u => URL.revokeObjectURL(u));
            try { win.close(); } catch (_) { }
            updateNotification("", "Error preparing print!");
        } finally {
            setProcessingStudent(null);
            setIsBulkPrinting(false);
        }
    }

    function onFiltersChange({ name, value }) {
        setFilters(state => {
            const ns = { ...state };
            ns[name] = value;
            return ns;
        });
    }
    function onReset() {
        setSearchInput({ ...searchSchema });
        setFilters({ ...filtersSchema });
        setIDCards([]);
        setStudents([]);
        setSelectedStudents([]);
        setSelectedStudentIds([]);
        setPickedAllStudents(false);
        setStudentImages({});
        setCardInput({ ...cardInputSchema });
    }
    function onStudentSelect({ name, value }) {
        setSelectedStudentIds(value);
    }
    // 
    useEffect(() => {
        (async () => {
            const schools = await fetchSchools({}, true);
            setSchools(schools);
        })();
    }, []);
    useEffect(() => {
        setGeneratedCount(0);
        setProcessingStudent(null);
        setIDCards([]);
        setIsProcessing(false);
        setGenerationCompleted(false);
        onReset();
    }, [cardOption]);
    // 
    return (
        <>
            <>
                <SelectInput input={{ name: 'card_option', label: "Card Options", options: CardSelectOptions, readOnly: searching || (!generationCompleted && processingStudent) }}
                    value={cardOption} onChange={toggleCardOption} />
                <form onSubmit={onSearch}>
                    <FilterSection title={"School"}>
                        <SearchInput value={searchInput?.school} onChange={onSearchInputChange}
                            input={{ name: "school", label: "School", options: schools }} />
                    </FilterSection>
                    <>
                        {
                            cardOption === CardOptions.student ?
                                <>
                                    <ClassPicker data={searchInput} onChange={onSearchInputChange} classwise={true} handleAcademicYear={false} />
                                </> :
                                <></>
                        }
                    </>
                    <ButtonsSecion>
                        <Button variant="outlined" onClick={reset}>Reset</Button>
                        <FormSaveButton isSearch={true} searching={searching} disabled={!cardOption || !searchInput?.school || searching || (!generationCompleted && processingStudent)} />
                    </ButtonsSecion>
                </form>
            </>
            <>
                <div>
                    <>
                        {
                            students?.length > 0 ?
                                <>
                                    <>
                                        <Section title={"Required Inputs"}>
                                            <TextInput input={{ name: 'validity_date', label: 'Validity Date' }} value={cardInput?.validity_date} onChange={onCardInputChange} />
                                            <Checkbox name={"showBloodGroup"} onClick={() => onFiltersChange({ name: "showBloodGroup", value: !filters.showBloodGroup })}
                                                text={"Show Blood Group"} checked={filters.showBloodGroup} />
                                            <Checkbox name={"showBirthDate"} onClick={() => onFiltersChange({ name: "showBirthDate", value: !filters.showBirthDate })}
                                                text={"Show Birth Date"} checked={filters.showBirthDate} />
                                            {cardOption === CardOptions.student &&
                                                <>
                                                    <Checkbox name={"showBusStation"} onClick={() => onFiltersChange({ name: "showBusStation", value: !filters.showBusStation })}
                                                        text={"Show Bus Station"} checked={filters.showBusStation} />
                                                    <Checkbox name={"showEMIS"} onClick={() => onFiltersChange({ name: "showEMIS", value: !filters.showEMIS })}
                                                        text={"Show EMIS"} checked={filters.showEMIS} />
                                                </>
                                            }
                                            {cardOption === CardOptions.staff &&
                                                <Checkbox name={"showCitizenshipNo"} onClick={() => onFiltersChange({ name: "showCitizenshipNo", value: !filters.showCitizenshipNo })}
                                                    text={"Show Citizenship No."} checked={filters.showCitizenshipNo} />
                                            }
                                        </Section>
                                        <StudentsPicker students={students || []} data={{ students: selectedStudentIds }}
                                            previousData={[]} onSelect={onStudentSelect} onSelectAll={onStudentSelect}
                                            allStudents={{ pickedAllStudents, setPickedAllStudents }} />
                                        <ButtonsSecion>
                                            <Button onClick={() => {
                                                setGenerationCompleted(false);
                                                setIDCards({});
                                            }} variant="outlined">Reset</Button>
                                            <Button onClick={generateIDCards} disabled={isProcessing || isDownloading || isBulkZipping || isBulkPrinting} variant="outlined">
                                                {isProcessing ? "Generating..." : "Generate"}
                                            </Button>
                                            <Button onClick={bulkDownloadZip} disabled={isProcessing || isDownloading || isBulkZipping || isBulkPrinting} variant="outlined">
                                                {isBulkZipping ? `Zipping... (${generatedCount})` : "Download ZIP"}
                                            </Button>
                                            <Button onClick={bulkPrint} disabled={isProcessing || isDownloading || isBulkZipping || isBulkPrinting} variant="outlined">
                                                {isBulkPrinting ? `Preparing... (${generatedCount})` : "Print"}
                                            </Button>
                                        </ButtonsSecion>
                                    </>
                                    <>
                                        <span className="font-semibold text-base">
                                            No. of cards : {selectedStudentIds?.length || students?.length || ''}
                                            <span className="mx-3">|</span>
                                            Generated : {generatedCount}
                                        </span>
                                    </>
                                    <>
                                        {(!generationCompleted && processingStudent) &&
                                            <IDCard type={cardOption} ref={templateRef} schoolId={searchInput.school}
                                                student={processingStudent} profileImage={studentImages?.[processingStudent.id]}
                                                sign={signs?.[searchInput.school] || ''} validity={cardInput.validity_date} filters={filters} />
                                        }
                                    </>
                                    <>
                                        {generationCompleted &&
                                            <>
                                                <div ref={cardsPrintRef} className="grid grid-cols-4 my-3">
                                                    {
                                                        selectedStudents.map((student, si) => (
                                                            <div key={si} className="border border-gray-400 rounded-sm">
                                                                <img src={`data:image/jpeg;base64,${idCards[student.id].data}`} alt={student.name} onContextMenu={(e) => { e.preventDefault() }} />
                                                            </div>
                                                        ))
                                                    }
                                                </div>
                                                <ButtonsSecion>
                                                    <Button variant="outlined" disabled={isDownloading || isProcessing}
                                                        onClick={printCardsSection}>
                                                        Print
                                                    </Button>
                                                    <Button variant="outlined" disabled={isDownloading || isProcessing}
                                                        onClick={downloadIDCards}>
                                                        {isDownloading ? "Downloading..." : "Download"}
                                                    </Button>
                                                </ButtonsSecion>
                                            </>
                                        }
                                    </>
                                </> :
                                <></>
                        }
                    </>
                </div>
            </>
        </>
    )
}

export default DownloadCards;
/* 
    const today = new Date().toISOString().slice(0, 10);
    const filename = div.getAttribute('filename');
    const zipname = `${classname}_${today}.zip`;
*/