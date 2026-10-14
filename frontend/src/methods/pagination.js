export function getCursor(url) {
    if (!url) return null;
    url = new URL(url);
    return url.searchParams.get('cursor');
}

export function getURL(data, page, type) {
    return data?.[page]?.[type] || null;
}