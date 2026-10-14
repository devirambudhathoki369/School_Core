import { confirmAction } from "@/components/ConfirmDialog";
import Loader from "@/components/Loader";
import PreviousButton from "@/components/buttons/PreviousButton";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { ButtonsSecion, PaginationSection, Section } from "@/components/sections";
import { TextInput } from "@/components/inputs";
import BasicTable from "@/components/tables/BasicTable";
import { viewAction, editAction, deleteAction } from "@/components/tables/actions";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { getCursor, getURL } from "@/methods/pagination";
import { fetchNotices, saveNotice, deleteNotice } from "@/services/functions/notice";
import { Button, Dialog, DialogBody, Textarea } from "@material-tailwind/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import NoticeView from "./NoticeView";
import NoticeImagePicker from "./NoticeImagePicker";

function NoticeListView() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    const schoolId = user?.profile?.school || user?.profile?.id;
    const [data, setData] = useState({});
    const [notice, setNotice] = useState(null);
    const [editing, setEditing] = useState(null); // notice being edited (modal)
    const { uploading, statusHandler } = useRequestStatus();
    // PAGINATION;
    const ITEMS_PER_PAGE = 10;
    const [page, setPage] = useState(1);
    async function getData() {
        const nextURL = getURL(data, page - 1, 'next');
        if (!nextURL && getURL(data, page - 1, 'previous')) {
            setPage(state => state - 1);
            return null;
        }
        const cursor = getCursor(nextURL);
        const res = await fetchNotices(schoolId, page, cursor);
        setData(state => ({ ...state, [page]: res }));
    }
    // reload after an edit/delete (drops cached pages)
    async function refresh() {
        setData({});
        if (page === 1) await getData();
        else setPage(1);
    }
    //
    function onSelectNotice(action, id, item) {
        if (action === viewAction.action) {
            setNotice(item);
        } else if (action === editAction.action) {
            setEditing({ ...item, school: schoolId });
        } else if (action === deleteAction.action) {
            onDelete(item);
        }
    }
    async function onDelete(item) {
        if (!await confirmAction({
            title: `Delete notice "${item.title}"?`,
            body: "The notice is removed for every student and guardian who can see it. This cannot be undone.",
        })) return;
        const [status, msg] = await deleteNotice(schoolId, item.id);
        updateNotification(status, msg);
        if (status === 200) refresh();
    }
    function onEditChange({ name, value }) {
        setEditing(state => ({ ...state, [name]: value }));
    }
    async function onEditSave(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        const [status, msg] = await saveNotice(editing);
        updateNotification(status, msg);
        statusHandler.toggleUploading();
        if (status === 200) {
            setEditing(null);
            refresh();
        }
    }
    //
    useEffect(() => {
        (async () => {
            if (!data?.[page]) await getData();
        })();
    }, [page]);
    return (
        <>
            <ButtonsSecion className={"!justify-start"}>
                <PreviousButton href={"admin#app.notice"} />
            </ButtonsSecion>
            {data?.[page]?.['results'] ?
                <>
                    <BasicTable name={"Recent notices"}
                        columns={[
                            ['date'], ['title'], ['description']
                        ]}
                        data={data[page]['results']} actions={[viewAction, editAction, deleteAction]}
                        onSelect={onSelectNotice} showSelected={false} page={page} itemsPerPage={ITEMS_PER_PAGE} />
                    <PaginationSection page={page} setPage={setPage}
                        nextPage={getURL(data, page, 'next')} />
                </>
                :
                <Loader />
            }
            {notice &&
                <NoticeView notice={notice} onClose={() => {
                    setNotice(null);
                }} />
            }

            {/* Edit notice modal */}
            <Dialog open={!!editing} handler={() => setEditing(null)} size="md"
                className="z-[9999] relative" dismiss={{ outsidePress: false }}>
                <Button aria-label="Close" onClick={() => setEditing(null)} color="gray"
                    className="absolute top-2 right-2 rounded-full p-1 z-20">
                    <XMarkIcon className="h-5 w-5" />
                </Button>
                <DialogBody className="overflow-y-auto">
                    {editing &&
                        <form onSubmit={onEditSave}>
                            <Section title={"Edit notice"}>
                                <TextInput value={editing?.date || ''} onChange={onEditChange}
                                    input={{ name: 'date', label: "Date" }} />
                                <TextInput value={editing?.title || ''} onChange={onEditChange}
                                    input={{ name: 'title', label: "Title" }} />
                                <span className="sm:col-span-4" />
                                <div className="sm:col-span-8">
                                    <Textarea value={editing?.description || ''} name="description" label="Description"
                                        onChange={(e) => onEditChange({ name: e.target.name, value: e.target.value })} />
                                </div>
                                {/* `existing` is the URL already on the notice;
                                    `image` is only set once a new file is picked.
                                    Removing sets `remove_image`, because a partial
                                    update that omits `image` means "keep it". */}
                                <NoticeImagePicker
                                    value={editing?.image instanceof File ? editing.image : null}
                                    existing={editing?.remove_image ? null : (typeof editing?.image === 'string' ? editing.image : null)}
                                    onChange={(file) => setEditing(s => ({ ...s, image: file, remove_image: false }))}
                                    onRemove={() => setEditing(s => ({ ...s, image: null, remove_image: true }))} />
                            </Section>
                            <ButtonsSecion>
                                <Button variant="text" type="button" onClick={() => setEditing(null)}>Cancel</Button>
                                <FormSaveButton custom={[uploading, "Update", "Updating..."]} />
                            </ButtonsSecion>
                        </form>
                    }
                </DialogBody>
            </Dialog>
        </>
    )
}

export default NoticeListView;
