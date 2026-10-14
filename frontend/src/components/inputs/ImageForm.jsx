import { confirmAction } from "@/components/ConfirmDialog";
import { ACCEPT_STR, ALLOWED_IMAGE_TYPES, MAX_SIZE, aitString } from "@/configs/file_types";
import { useAppContext } from "@/contexts/AppContext";
import { PencilSquareIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const baseURL = process.env.NEXT_PUBLIC_BASE_URL;

/** A stored media path as a URL the browser can load. */
function mediaUrl(path) {
    if (!path) return null;
    if (/^(https?:|blob:)/.test(path)) return path;
    return `${baseURL}${path.startsWith("/media/") ? path : `/media/${path}`}`;
}

/**
 * One picture on a record — a logo, a signature, a profile photo, a document.
 *
 * The picture can be ADDED, EDITED (replaced) and DELETED, and each of the three
 * is a button with its name on it — the same words the tables use. It used to be a bare square that replaced the
 * image when clicked: nothing said it could be clicked, an empty one did not
 * look like an invitation to add, and there was no way at all to take a
 * picture off — a wrong award logo stayed on every printed bill until support
 * cleared it by hand.
 *
 * - `onSubmit(formData)` uploads; `onDelete()` removes. Both answer
 *   `[status, message, data]` like every other service call. Without
 *   `onDelete` there is no Delete button.
 * - `onSaved(path | null)` tells the page what the record holds now, so the
 *   same picture shown elsewhere (the header logo, the profile card) follows.
 * - `onChange` is the other mode: the file is handed back to a larger form
 *   instead of being uploaded here.
 * - `what` names the picture in the dialogs ("logo", "photo", "signature").
 */
export default function ImageForm({ name, label, hint = null, src, alt, onSubmit = null, onDelete = null,
    onSaved = null, extraData = {}, defaultSrc = null, unoptimized = true, onChange = null, what = "picture" }) {
    const { notification: { updateNotification } } = useAppContext();
    const ref = useRef(null);
    const [image, setImage] = useState(null);
    const [busy, setBusy] = useState('');
    // A chosen file is shown through a blob: URL, which the document holds on
    // to until it is released — one per picture tried, if nobody does.
    const blob = useRef(null);
    function preview(file) {
        if (blob.current) URL.revokeObjectURL(blob.current);
        blob.current = URL.createObjectURL(file);
        return blob.current;
    }
    useEffect(() => () => {
        if (blob.current) URL.revokeObjectURL(blob.current);
    }, []);

    function pick() {
        if (!busy) ref.current?.click();
    }
    function isSizeValid(fileSize) {
        return (fileSize / 1024 / 1024) < MAX_SIZE;
    }
    async function onFileChange(e) {
        const file = e.target.files?.[0] || null;
        // Cleared straight away, so choosing the SAME file again after a
        // cancelled or failed attempt still fires a change.
        e.target.value = '';
        if (!file) return;
        if (!isSizeValid(file.size) || !ALLOWED_IMAGE_TYPES.includes(file.type)) {
            updateNotification('', `File ${file.name} must be less than ${MAX_SIZE}MB and ${aitString}!`);
            return;
        }
        // Just return file
        if (onChange) {
            setImage(preview(file));
            return onChange({ name, value: file });
        }
        if (!onSubmit) {
            updateNotification(404, "Invalid Setup!");
            return;
        }
        // Submit directly with other essential data. The picture on screen is
        // left alone until the server has said yes: it used to be blanked the
        // moment a file was chosen, so cancelling this dialog — or a refused
        // upload — left an empty square where a perfectly good logo still was.
        if (!await confirmAction({
            title: image ? `Replace this ${what}?` : `Add this ${what}?`,
            body: image
                ? `It replaces the ${what} currently on this record.`
                : `It is saved on this record straight away.`,
            tone: "info",
            confirmText: "Upload",
        })) return;
        const data = new FormData();
        data.append(name, file);
        Object.entries(extraData)
            .forEach(([key, value]) => {
                data.append(key, value);
            });
        setBusy('Uploading…');
        const [status, message, res] = await onSubmit(data);
        setBusy('');
        updateNotification(status, message);
        if (status !== 200) return;
        // Not every endpoint says where it put the file. The one just chosen
        // is the picture either way, so it is shown from the browser's copy.
        const path = res?.images?.[name] || res?.image || null;
        setImage(path ? mediaUrl(path) : preview(file));
        if (path) onSaved?.(path);
    }
    async function remove() {
        if (busy || !onDelete) return;
        if (!await confirmAction({
            title: `Delete this ${what}?`,
            body: `The ${what} is taken off this record. You can add another one at any time.`,
            tone: "danger",
            confirmText: "Delete",
        })) return;
        setBusy('Deleting…');
        const [status, message] = await onDelete();
        setBusy('');
        updateNotification(status, message);
        if (status !== 200) return;
        setImage(null);
        onSaved?.(null);
    }
    // Follows the record: the same component stays mounted while the page
    // moves to another student, and must not go on showing the last one's photo.
    useEffect(() => {
        setImage(mediaUrl(src));
    }, [src]);

    const action = "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[0.78rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
    return (
        <form onSubmit={(e) => {
            e.preventDefault();
        }} encType="multipart/form-data" className="app-image-form sm:col-span-4 flex flex-1 flex-col items-center">
            <input name={name} ref={ref} type="file" hidden accept={ACCEPT_STR}
                onChange={onFileChange} />
            <button type="button" onClick={pick} disabled={Boolean(busy)}
                aria-label={image ? `Edit ${what}` : `Add ${what}`}
                className="overflow-hidden h-32 w-32 flex flex-col justify-between items-center border-blue-gray-50 border p-2 rounded-md
                    cursor-pointer transition-colors hover:border-blue-gray-200 disabled:cursor-wait">
                {/* A picture just chosen is a blob: URL and a saved one comes
                    from the Cloudflare-fronted media host — the optimizer can
                    serve neither (see the unoptimized note in View.jsx). */}
                <Image unoptimized={Boolean(image) || unoptimized} alt={alt || ''} width={100}
                    height={100} className={`m-auto ${busy ? 'opacity-50' : ''}`}
                    src={image ? image : (defaultSrc || '/empty.png')}
                    onContextMenu={(e) => { e.preventDefault() }} />
            </button>
            {
                label &&
                <span className="mt-1.5 text-center font-semibold">{label}</span>
            }
            {
                hint &&
                <span className="text-center text-[0.7rem] leading-4 text-gray-500">{hint}</span>
            }
            {/* `mt-auto`: in a row of pictures whose captions wrap to different
                heights, the buttons still sit on one line. */}
            <div className="mt-auto flex min-h-[1.75rem] flex-wrap items-center justify-center gap-1 pt-1.5">
                {busy ? (
                    <span className="text-[0.78rem] font-medium text-gray-500" role="status">{busy}</span>
                ) : image ? (
                    <>
                        <button type="button" onClick={pick}
                            className={`${action} text-teal-700 hover:bg-teal-50`}>
                            <PencilSquareIcon className="h-3.5 w-3.5" aria-hidden="true" />
                            Edit
                        </button>
                        {onDelete && !onChange &&
                            <button type="button" onClick={remove}
                                className={`${action} text-red-600 hover:bg-red-50`}>
                                <TrashIcon className="h-3.5 w-3.5" aria-hidden="true" />
                                Delete
                            </button>
                        }
                    </>
                ) : (
                    <button type="button" onClick={pick}
                        className={`${action} text-teal-700 hover:bg-teal-50`}>
                        <PlusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        Add
                    </button>
                )}
            </div>
        </form>
    )
}
