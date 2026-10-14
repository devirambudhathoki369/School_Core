import { SelectInput } from "@/components/inputs";

const ResultTypeInputName = "result_type";
const ResultTypeOptions = {
    "Sectionwise results": "1",
    "Classwise results": "2",
},
    select_options = Object.entries(ResultTypeOptions)
        .reduce((acc, [name, value]) => {
            acc.push({ name, value });
            return acc;
        }, []);

function ResultTypeInput({ value, onChange }) {
    return (
        <>
            <SelectInput input={{ name: [ResultTypeInputName], label: "Result type", options: select_options }} value={value} onChange={onChange} />
        </>
    )
}

export default ResultTypeInput;
export { ResultTypeOptions };