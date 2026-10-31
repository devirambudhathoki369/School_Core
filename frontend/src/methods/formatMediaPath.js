const baseURL = process.env.NEXT_PUBLIC_BASE_URL;

function formatImagePath(path, default_image = null) {
    if (!path) return default_image || "/empty.png";
    // A signed document link is already a whole address on the API.
    if (!path.startsWith("/media/") && !path.startsWith("/api/")) path = `/media/${path}`;
    return `${baseURL}` + `${path}`;
}

export { formatImagePath };