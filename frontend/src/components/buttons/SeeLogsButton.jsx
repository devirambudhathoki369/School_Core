import { Button } from "@material-tailwind/react";
import { Bars3Icon } from "@heroicons/react/24/outline";
import { useRouter } from "next/router";

function SeeLogsButton({ name, href, onClick = () => null }) {
    const router = useRouter();

    function handleRoute() {
        router.push(href);
    }

    return (
        <Button variant="text" onClick={href ? handleRoute : onClick}
            className="flex items-end gap-x-1 w-max py-2 px-4 m-0 bg-blue-gray-100 hover:bg-blue-gray-200">
            <Bars3Icon className="icon" />
            {name || "Logs"}
        </Button>
    )
}

export default SeeLogsButton;