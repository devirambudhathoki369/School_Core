import { ResultTypeOptions } from "@/components/views/exams/reports/ResultTypeInput";
import { useState } from "react";

const useClassResult = () => {
    const [resultType, setResultType] = useState(ResultTypeOptions["Sectionwise results"]);
    const [data, setData] = useState({});
    const [subjects, setSubjects] = useState([]);
    const [totals, setTotals] = useState({});
    const [studentResults, setStudentResults] = useState([]);
    const [remarks, setRemarks] = useState({});
    const [divisions, setDivisions] = useState({});
    const [extraActivities, setExtraActivities] = useState([]);
    const [extraActivitiesEntries, setExtraActivitiesEntries] = useState({});
    const [summary, setSummary] = useState({});
    // TODO: classwise result backup!

    const methods = {
        onChange: ({ name, value }) => {
            setData(state => ({ ...state, [name]: value }));
        },
        onReset: () => {
            setData({});
            setSubjects([]);
            setTotals({});
            setStudentResults([]);
            setExtraActivities([]);
            setExtraActivitiesEntries({});
            setSummary({});
        }
    }

    return {
        resultType, setResultType,
        data, setData,
        subjects, setSubjects,
        totals, setTotals,
        studentResults, setStudentResults,
        remarks, setRemarks,
        divisions, setDivisions,
        summary, setSummary,
        extraActivities, setExtraActivities,
        extraActivitiesEntries, setExtraActivitiesEntries,
        methods
    }
}

export default useClassResult;