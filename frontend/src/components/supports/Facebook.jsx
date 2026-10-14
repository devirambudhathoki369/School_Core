import { useEffect, useState } from "react";
import { MessengerMark } from "./marks";

/**
 * The Messenger deep-link for a page.
 *
 * On a phone the `fb-messenger://` scheme opens the installed app straight on
 * the thread; on a desktop it resolves to nothing, so there the web thread is
 * used instead. The check has to run in an effect — `navigator` does not exist
 * while Next renders the page on the server.
 */
export function useMessengerUrl(page_id) {
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        setIsMobile(/Android|iPhone|iPad/i.test(navigator.userAgent));
    }, []);

    // The page id is superadmin-editable and may be blank; returning "" lets the
    // caller drop the channel rather than render a link to `m.me/undefined`.
    if (!page_id) return "";
    return isMobile
        ? `fb-messenger://user-thread/${page_id}`
        : `https://m.me/${page_id}`;
}

export default function FacebookContact({ page_id }) {
    const messengerUrl = useMessengerUrl(page_id);

    return (
        <a href={messengerUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-x-2">
            <MessengerMark size={32} />
            <span className="font-semibold text-base">Messenger</span>
        </a>
    );
}
