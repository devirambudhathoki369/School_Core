import { useEffect, useRef, useState } from "react";
import { PhotoIcon, XMarkIcon, ArrowPathIcon } from "@heroicons/react/24/outline";

import { ACCEPT_STR, ALLOWED_IMAGE_TYPES, MAX_SIZE, aitString } from "@/configs/file_types";
import { useAppContext } from "@/contexts/AppContext";

/**
 * The picture on a notice.
 *
 * Not `components/inputs/ImageForm`: that renders its own `<form>`, which
 * cannot be nested inside the notice form, and it is a 128px square meant for a
 * logo. A notice picture is a wide banner and the app shows it that way.
 *
 * It is downscaled in the browser before it ever leaves the page. A photo taken
 * on a phone is 2–5MB against this app's 1MB ceiling, so without this every
 * realistic notice photo would simply be refused — and a 4000px image would be
 * a slow, wasteful download for the parents who have to open it on mobile data.
 * 1600px wide is more than a phone screen can show.
 */

const MAX_EDGE = 1600;
const QUALITY = 0.82;

/** Re-encode to JPEG at most MAX_EDGE on the long side. Returns a File. */
async function downscale(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    // Already small enough — don't re-encode, it would only lose quality.
    if (scale === 1 && file.size / 1024 / 1024 < MAX_SIZE) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", QUALITY));
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
}

function NoticeImagePicker({ value, existing, onChange, onRemove, grid = "sm:col-span-8" }) {
    const { notification: { updateNotification } } = useAppContext();
    const ref = useRef(null);
    const [preview, setPreview] = useState(null);
    const [working, setWorking] = useState(false);

    // A blob URL is a document-lifetime handle, so it has to be released or the
    // page leaks one per picture the user tries.
    useEffect(() => {
        if (!(value instanceof File)) { setPreview(null); return; }
        const url = URL.createObjectURL(value);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [value]);

    const shown = preview || existing || null;

    async function onFileChange(e) {
        const file = e.target.files?.[0] || null;
        e.target.value = "";
        if (!file) return;
        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            return updateNotification("", `The picture must be ${aitString}.`);
        }
        setWorking(true);
        let ready = file;
        try {
            ready = await downscale(file);
        } catch {
            // Old browser without createImageBitmap/toBlob — fall back to the
            // original and let the size check below have the last word.
        }
        setWorking(false);
        if (ready.size / 1024 / 1024 >= MAX_SIZE) {
            return updateNotification("", `That picture is still over ${MAX_SIZE}MB after resizing. Try a smaller one.`);
        }
        onChange(ready);
    }

    return (
        <div className={grid}>
            <label className="app-field-label text-sm font-medium leading-6 text-gray-900">
                Picture <span className="font-normal text-gray-500">— optional, shown in the app</span>
            </label>

            <input ref={ref} type="file" hidden accept={ACCEPT_STR} onChange={onFileChange} />

            {shown ? (
                <div className="relative mt-1 overflow-hidden rounded-lg border border-blue-gray-200 bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element --
                        a blob: URL and a Cloudflare-fronted media host; next/image
                        cannot optimise either (see the unoptimized note in View.jsx). */}
                    <img src={shown} alt="notice" className="max-h-64 w-full object-contain" />
                    <div className="absolute right-2 top-2 flex gap-1.5">
                        <button type="button" onClick={() => ref.current?.click()}
                            className="rounded-md bg-white/90 p-1.5 text-gray-700 shadow hover:bg-white"
                            aria-label="replace picture">
                            <ArrowPathIcon className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={onRemove}
                            className="rounded-md bg-white/90 p-1.5 text-red-600 shadow hover:bg-white"
                            aria-label="remove picture">
                            <XMarkIcon className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            ) : (
                <button type="button" onClick={() => ref.current?.click()} disabled={working}
                    className="mt-1 flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed
                               border-blue-gray-300 bg-white/40 px-4 py-6 text-gray-500 transition-colors
                               hover:border-blue-gray-400 hover:bg-white/70 disabled:opacity-60">
                    <PhotoIcon className="h-7 w-7" />
                    <span className="text-sm font-semibold">
                        {working ? "Preparing…" : "Add a picture"}
                    </span>
                    <span className="text-xs">Large photos are resized for you</span>
                </button>
            )}
        </div>
    );
}

export default NoticeImagePicker;
