import { navigatePortal } from "@/methods/portalRoutes";
import { Button } from "@material-tailwind/react";
import { ChevronDoubleLeftIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/router";

function PreviousButton({ name, href, onClick = null }) {
    const router = useRouter();

    function handleRoute() {
        if (href) navigatePortal(router, href);
        else router.back();
    }

    return (
        <Button variant="text" onClick={onClick ? onClick : handleRoute}
            className="flex items-end gap-x-1 w-max py-2 px-4 m-0 bg-blue-gray-100 hover:bg-blue-gray-200">
            <ChevronDoubleLeftIcon className="icon" />
            {name || "Go Back"}
        </Button>
    )
}

export default PreviousButton;