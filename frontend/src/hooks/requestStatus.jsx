import { useState } from "react";

const useRequestStatus = () => {
    const [fetching, setFetching] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [searching, setSearching] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const statusHandler = {
        toggleFetching: (value = null) => {
            setFetching(state => value !== null ? value : !state);
        },
        toggleUploading: (value = null) => {
            setUploading(state => value !== null ? value : !state);
        },
        toggleSearching: (value = null) => {
            setSearching(state => value !== null ? value : !state);
        },
        toggleDeleting: (value = null) => {
            setDeleting(state => value !== null ? value : !state);
        }
    }

    return {
        fetching, uploading, searching, deleting, statusHandler
    };
}
export default useRequestStatus;