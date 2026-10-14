import AcademicYearAlert from "@/components/AcademicYearAlert";
import Loader from "@/components/Loader";
import { SearchInput, TextInput } from "@/components/inputs";
import ExamInput from "@/components/inputs/ExamInput";
import { Section } from "@/components/sections";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { fetchExamResults, publishResults } from "@/services/functions/exams/results";
import { Button } from "@material-tailwind/react";
import { useEffect, useState } from "react";

const schema = { academic_year: '', exam: '', results: [] };
function ResultPublish() {
    const { user: { user }, fiscalYear: { year, years }, notification: { updateNotification } } = useAppContext();
    schema["academic_year"] = year?.academic_year;
    const [data, setData] = useState({ ...schema });
    const { fetching, uploading, statusHandler } = useRequestStatus();

    function onChange({ name, value }) {
        setData(state => ({ ...state, [name]: value }));
    }
    function onPublishDateChange(index, value) {
        setData(state => {
            const ns = { ...state };
            ns['results'][index].published_date = value;
            return ns;
        });
    }

    async function publishClassResults(index) {
        const { class_info, published_date } = data?.results?.[index] || {};
        if (class_info && published_date) {
            statusHandler.toggleUploading();
            const uploadData = { class_info, exam: data.exam, published_date, publish: true, school: user?.profile?.school || user?.profile?.id };
            const [status, message, update] = await publishResults(uploadData);
            updateNotification(status, message);
            statusHandler.toggleUploading();
        }
    }

    // 
    useEffect(() => {
        if (data?.exam) {
            statusHandler.toggleFetching();
            (async () => {
                const res = await fetchExamResults(null, data.exam, null, null, null, true);
                if (res?.length > 0) {
                    setData(state => ({
                        ...state,
                        results: (res || []).map(e => ({ ...e, republish: e?.published_date, published_date: user?.today })),
                    }));
                } else {
                    updateNotification(404, "Results Not Found!");
                    setData({ ...schema, exam: data.exam });
                }
            })();
            statusHandler.toggleFetching();
        }
    }, [data?.exam]);
    // 
    return (
        <>
            <AcademicYearAlert />
            <Section>
                <SearchInput input={{ name: "academic_year", label: "Academic Year", options: years?.academicYears || [] }}
                    value={data?.academic_year} onChange={onChange} />
                <ExamInput schoolId={user?.profile?.school || user?.profile?.id} academic_year={data?.academic_year}
                    input={{ name: 'exam', label: "Exam" }} value={data?.exam} onChange={onChange} />
            </Section>
            <div>
                <ul className="">
                    <li className="grid grid-cols-4 bg-table-header px-5">
                        <span className="text-[1.2rem] uppercase underline font-semibold">Class</span>
                        <span className="text-[1.2rem] uppercase underline font-semibold">Publish Date</span>
                        <span />
                        <span className="text-[1.2rem] uppercase underline font-semibold">Actions</span>
                    </li>
                    {fetching ? <Loader /> :
                        (data?.results || []).map((result, ri) => (
                            <li key={ri} className="grid grid-cols-4 justify-between px-2 py-1 hover:bg-teal-100">
                                <span className="capitalize text-lg font-semibold">{result?.classname}</span>
                                <TextInput grid={1} input={{ name: 'published_date', label: "" }}
                                    value={result?.published_date} onChange={({ value }) => {
                                        onPublishDateChange(ri, value);
                                    }} />
                                <span className="" />
                                <Button variant="outlined" className="w-max" onClick={async () => {
                                    await publishClassResults(ri);
                                }} disabled={uploading}>
                                    {result?.republish ? "Republish" : "Publish"}
                                </Button>
                            </li>
                        ))
                    }
                </ul>
            </div>
        </>
    )
}

export default ResultPublish;