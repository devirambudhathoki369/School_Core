import { Card } from "@material-tailwind/react";
function TableHeaderFooter({ label, value }) {
    return (
        <Card className="w-full font-semibold flex flex-row justify-between py-3 px-[5.5%]">
            <span>{label}</span>
            <span>{value}</span>
        </Card>
    )
}

export default TableHeaderFooter;