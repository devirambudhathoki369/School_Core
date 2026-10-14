const baseURL = process.env.NEXT_PUBLIC_BASE_URL;

function formatImagePath(path, default_image = null) {
    if (!path) return default_image || "/empty.png";
    if (!path.startsWith("/media/")) path = `/media/${path}`;
    return `${baseURL}` + `${path}`;
}

export { formatImagePath };