import {
    Dialog, DialogHeader, DialogBody, DialogFooter,
    Button, Typography
} from "@material-tailwind/react";
import sanitizeHtml from "@/methods/sanitizeHtml";

// For Notice & NewsEvent!
function NoticeView({ notice, onClose }) {
    return (
        <div>
            {/* Without a `handler` this dialog swallowed Escape and backdrop
                clicks, so a notice could only be closed by finding its own
                Close button. Escape closing a dialog is not a preference — it
                is the behaviour every user already expects, and the one they
                reach for first. `open` is coerced because Material Tailwind
                wants a boolean and `notice` is the object itself. */}
            <Dialog open={!!notice} handler={onClose}>
                <DialogHeader>
                    <div className="w-full relative">
                        <Typography variant="h5" color="blue-gray" className="text-center">
                            {notice.title}
                        </Typography>
                        <Typography color="gray" variant="paragraph" className="text-right font-semibold underline">
                            {notice.date}
                        </Typography>
                    </div>
                </DialogHeader>
                <DialogBody className="overflow-y-auto">
                    {notice?.image && (
                        // eslint-disable-next-line @next/next/no-img-element --
                        // the media host is Cloudflare-fronted and the on-VPS
                        // optimizer gets bot-challenged fetching it (see View.jsx).
                        <img src={notice.image} alt={notice.title}
                            className="mb-3 max-h-80 w-full rounded-lg object-contain" />
                    )}
                    <p className="font-semibold text-base whitespace-pre-wrap">
                        {notice.description}
                    </p>
                    {/* Written by whoever posted the notice, read by everyone
                        else — so it is sanitised, never injected raw (see
                        methods/sanitizeHtml). */}
                    {notice?.content && (
                        <div className="mt-4 font-semibold text-base" dangerouslySetInnerHTML={{ __html: sanitizeHtml(notice.content) }} />
                    )}
                </DialogBody>
                <DialogFooter>
                    <Button variant="outlined" onClick={onClose} className="px-4 py-2">
                        <span>Close</span>
                    </Button>
                </DialogFooter>
            </Dialog>
        </div>
    );
}

export default NoticeView;