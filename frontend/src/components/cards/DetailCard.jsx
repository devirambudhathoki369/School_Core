import { Card, Typography } from "@material-tailwind/react";

export default function DetailCard({ title, children, className }) {
    return (
        <Card className={`bg-blue-gray-200 w-max h-max px-10 py-2 m-1 ${className}`}>
            <Typography variant="h6">{title} Details</Typography>
            <hr />
            {children}
        </Card>
    )
}