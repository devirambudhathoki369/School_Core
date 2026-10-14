import Cell from "@/components/tables/Cell";

// Value is " · "-delimited: "present", "present · In 06:57 am",
// "present · In 06:57 am · Out 04:10 pm", "absent", or "-".
export default function StatusCell(props) {
    const value = typeof props?.data === "string" ? props.data : "";
    const parts = value.split(" · ");
    const label = parts[0];

    let color = null;
    if (label.startsWith("present")) color = "green";
    else if (label.startsWith("absent")) color = "red";

    // simple statuses keep the original single-line Cell rendering
    if (parts.length <= 1) {
        return <Cell {...props} color={color} />;
    }

    return (
        <div className="flex flex-col leading-tight px-2">
            <span style={{ color }} className="font-semibold">{label}</span>
            {parts.slice(1).map((line, i) => (
                <span key={i} className="text-xs text-blue-gray-600">{line}</span>
            ))}
        </div>
    );
}
