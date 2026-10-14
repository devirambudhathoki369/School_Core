import { useEffect, useState } from "react";
import { useAppContext } from "@/contexts/AppContext";
import { getDocumentStyle } from "@/services/functions/documentStyles";
import { documentStyleProps, documentShowsWatermark } from "@/methods/documentStyle";

/**
 * The superadmin's styling for the current school, for ONE document.
 *
 * Every printed document asks the same way, so a school's theme can never
 * reach half of them. Returns neutral values until the style has loaded and
 * whenever the school has none switched on for this document, so a sheet is
 * never left half-styled and never blocks on the request.
 *
 * PRESENTATION ONLY. Nothing here touches what is printed — no filtering, no
 * ordering, no values. A theme must never be able to change a mark, a total or
 * a name; it only decides how those are drawn.
 *
 * @param documentKey one of the backend's DOCUMENT_KEYS, e.g. "class_result"
 */
export default function useDocumentStyle(documentKey) {
    const { user: { user } } = useAppContext();
    const schoolId = user?.profile?.school || user?.profile?.id;
    const [style, setStyle] = useState(null);

    useEffect(() => {
        let alive = true;
        if (!schoolId) return;
        (async () => {
            try {
                const loaded = await getDocumentStyle(schoolId);
                if (alive) setStyle(loaded);
            } catch (e) {
                // A styling lookup must never stop a document rendering — the
                // marks matter, the border does not.
                if (alive) setStyle(null);
            }
        })();
        return () => { alive = false; };
    }, [schoolId]);

    const props = documentStyleProps(style, documentKey);
    return {
        className: props.className,
        css: props.style,
        showWatermark: documentShowsWatermark(style, documentKey),
        style,
    };
}
