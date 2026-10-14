// PUBLIC PROFILE
import { useEffect, useState } from "react";
import PublicProfile from "./PublicProfile";
import { __fetch } from "@/services/functions";
import { useRouter } from "next/router";
import Loader from "@/components/Loader";
import useRequestStatus from "@/hooks/requestStatus";

const API_PATH = "/api/public_profile";

function PublicProfilePage() {
    const [details, setDetails] = useState({});
    const { fetching, statusHandler } = useRequestStatus();

    const router = useRouter();
    const { org, user, role = 1 } = router.query; // role: 1 | 2 [student | staff]

    useEffect(() => {
        if (org && user) {
            const getDetails = async () => {
                const res = await __fetch(API_PATH, { org, user, role });
                if (res) setDetails(res);
            }
            statusHandler.toggleFetching()
            getDetails();
            statusHandler.toggleFetching()
        }
    }, [org, user]);

    return (
        <>
            {
                fetching ?
                    <Loader minutes={1} /> :
                    <PublicProfile role={role} details={details} />
            }
        </>
    )
}

export default PublicProfilePage;